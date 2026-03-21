import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

interface Registration {
  handle: string;
  token_hash: string;
  created_at: string;
  last_seen?: string;
}

export class RegistrationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "RegistrationError";
  }
}

export interface RegistrationConfig {
  /** Port for the HTTP registration API. */
  httpPort: number;
  /** Path to persist registrations. */
  storePath: string;
  /** Require an invite code to register (optional). */
  inviteCode?: string;
}

/**
 * Handle registration system for the tree.
 * Provides HTTP endpoints for agents to register handles and get auth tokens.
 *
 * POST /register  — Register a new handle, get a token
 * GET  /lookup    — Check if a handle exists
 * GET  /info      — Tree info (domain, version)
 */
export class RegistrationServer {
  private registrations = new Map<string, Registration>();
  private storePath: string;
  private inviteCode?: string;

  constructor(private config: RegistrationConfig) {
    this.storePath = config.storePath;
    this.inviteCode = config.inviteCode;
  }

  async load(): Promise<void> {
    try {
      const data = await readFile(this.storePath, "utf-8");
      const list = JSON.parse(data) as Registration[];
      for (const reg of list) {
        this.registrations.set(reg.handle, reg);
      }
      console.log(`📋 Loaded ${this.registrations.size} registered handles`);
    } catch {
      // Fresh start
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    const data = JSON.stringify(Array.from(this.registrations.values()), null, 2);
    await writeFile(this.storePath, data, "utf-8");
  }

  /** Get the auth tokens map for passing to createTree. */
  getAuthTokens(): Map<string, string> {
    // We can't reverse the hash, so we store raw tokens in memory during runtime.
    // This is populated during register() calls in this session.
    // For persisted registrations, agents must use their original token.
    return this.runtimeTokens;
  }

  private runtimeTokens = new Map<string, string>();

  private normaliseHandle(handle: string): string {
    return handle.startsWith("@") ? handle : `@${handle}`;
  }

  /** Validate a handle format. */
  private validateHandle(handle: string): string | null {
    if (!handle) return "Handle is required";
    if (handle.length < 2 || handle.length > 32) return "Handle must be 2-32 characters";
    if (!/^[a-zA-Z0-9_-]+$/.test(handle)) return "Handle must be alphanumeric (with - and _)";
    if (/^(admin|system|tree|root|yap)$/i.test(handle)) return "Reserved handle";
    return null;
  }

  getRegistrationCount(): number {
    return this.registrations.size;
  }

  isRegistered(handle: string): boolean {
    return this.registrations.has(this.normaliseHandle(handle));
  }

  verifyToken(handle: string, token: string | null | undefined): boolean {
    if (!token) return false;
    const registration = this.registrations.get(this.normaliseHandle(handle));
    if (!registration) return false;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    return registration.token_hash === tokenHash;
  }

  async registerHandle(handle: string): Promise<{ handle: string; token: string }> {
    const rawHandle = handle.startsWith("@") ? handle.slice(1) : handle;
    const handleError = this.validateHandle(rawHandle);
    if (handleError) {
      throw new RegistrationError(handleError, 400);
    }

    const agentHandle = this.normaliseHandle(rawHandle);
    if (this.registrations.has(agentHandle)) {
      throw new RegistrationError("Handle already registered", 409);
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const registration: Registration = {
      handle: agentHandle,
      token_hash: tokenHash,
      created_at: new Date().toISOString(),
    };

    this.registrations.set(agentHandle, registration);
    this.runtimeTokens.set(agentHandle, token);
    await this.save();

    console.log(`📋 Registered: ${agentHandle}`);
    return { handle: agentHandle, token };
  }

  start(): void {
    const server = createServer((req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", `http://localhost:${this.config.httpPort}`);

      if (url.pathname === "/register" && req.method === "POST") {
        this.handleRegister(req, res);
      } else if (url.pathname === "/lookup" && req.method === "GET") {
        this.handleLookup(url, res);
      } else if (url.pathname === "/info" && req.method === "GET") {
        this.handleInfo(res);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    server.listen(this.config.httpPort, () => {
      console.log(`📋 Registration API on http://localhost:${this.config.httpPort}`);
    });
  }

  private async handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readBody(req);
      const { handle, invite_code } = JSON.parse(body);

      // Validate invite code if configured
      if (this.inviteCode && invite_code !== this.inviteCode) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: "Invalid invite code" }));
        return;
      }

      const registration = await this.registerHandle(handle);

      res.writeHead(201);
      res.end(JSON.stringify({
        handle: registration.handle,
        token: registration.token,
        message: "Save this token — it cannot be recovered. Use it to connect: ws://tree?handle=X&token=Y",
      }));
    } catch (err) {
      if (err instanceof RegistrationError) {
        res.writeHead(err.statusCode);
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid request body" }));
    }
  }

  private handleLookup(url: URL, res: ServerResponse): void {
    const handle = url.searchParams.get("handle");
    if (!handle) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "handle parameter required" }));
      return;
    }

    const agentHandle = this.normaliseHandle(handle);
    const exists = this.isRegistered(agentHandle);

    res.writeHead(200);
    res.end(JSON.stringify({ handle: agentHandle, registered: exists }));
  }

  private handleInfo(res: ServerResponse): void {
    res.writeHead(200);
    res.end(JSON.stringify({
      protocol: "yap/0.2",
      registered_agents: this.getRegistrationCount(),
      registration_open: true,
      invite_required: !!this.inviteCode,
    }));
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
