#!/usr/bin/env node

/**
 * Production tree server.
 * - Runs WebSocket tree + Registration API on the SAME port
 * - All secrets come from environment variables (never in code)
 * - Safe to open-source — zero sensitive data in this file
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { RegistrationServer } from "./registration.js";
import { join } from "node:path";

const PORT = Number(process.env.YAP_PORT ?? 8789);
const DATA_DIR = process.env.YAP_DATA_DIR ?? "/tmp/yap-data";
const INVITE_CODE = process.env.YAP_INVITE_CODE;
const MAX_QUEUE = Number(process.env.YAP_MAX_QUEUE ?? 100);
const QUEUE_TTL = Number(process.env.YAP_QUEUE_TTL_MS ?? 24 * 60 * 60 * 1000);
const RATE_LIMIT = Number(process.env.YAP_RATE_LIMIT ?? 60);
const MAX_PACKET = Number(process.env.YAP_MAX_PACKET_BYTES ?? 1_048_576);

console.log("=== Yap Tree Server (Production) ===");
console.log(`Port: ${PORT} (WebSocket + HTTP API on same port)`);
console.log(`Data dir: ${DATA_DIR}`);
console.log(`Invite required: ${!!INVITE_CODE}`);
console.log();

// --- State ---

interface QueuedPacket { data: string; timestamp: string; }

const agents = new Map<string, WebSocket>();
const offlineQueue = new Map<string, QueuedPacket[]>();
const rateCounts = new Map<string, { count: number; windowStart: number }>();

// --- Registration ---

const registration = new RegistrationServer({
  httpPort: PORT, // same port, handled via HTTP routes
  storePath: join(DATA_DIR, "registrations.json"),
  inviteCode: INVITE_CODE,
});

// --- HTTP server (handles both API requests and WebSocket upgrades) ---

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (url.pathname === "/info" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      protocol: "yap/0.2",
      registered_agents: 0, // TODO: wire to registration count
      online_agents: agents.size,
      registration_open: true,
      invite_required: !!INVITE_CODE,
    }));
    return;
  }

  if (url.pathname === "/register" && req.method === "POST") {
    // Delegate to registration server's handler
    handleRegister(req, res);
    return;
  }

  if (url.pathname === "/lookup" && req.method === "GET") {
    const handle = url.searchParams.get("handle");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      handle: handle?.startsWith("@") ? handle : `@${handle}`,
      online: agents.has(handle?.startsWith("@") ? handle : `@${handle ?? ""}`),
    }));
    return;
  }

  // Health check
  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

// --- Registration handler ---

async function handleRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBody(req);
    const { handle, invite_code } = JSON.parse(body);

    if (INVITE_CODE && invite_code !== INVITE_CODE) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid invite code" }));
      return;
    }

    if (!handle || handle.length < 2 || handle.length > 32) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Handle must be 2-32 characters" }));
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(handle)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Handle must be alphanumeric (with - and _)" }));
      return;
    }

    const agentHandle = `@${handle}`;

    // Check uniqueness
    if (agents.has(agentHandle)) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Handle already taken" }));
      return;
    }

    // For now, registration = just confirming the handle is valid
    // Token auth will come when we persist registrations
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("hex");

    console.log(`📋 Registered: ${agentHandle}`);

    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      handle: agentHandle,
      token,
      tree_url: `wss://tree.yapprotocol.dev`,
      message: "Save this token — it cannot be recovered.",
    }));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid request body" }));
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

// --- WebSocket server (attached to same HTTP server) ---

const wss = new WebSocketServer({ server: httpServer });

// Queue cleanup
setInterval(() => {
  const cutoff = Date.now() - QUEUE_TTL;
  for (const [handle, queue] of offlineQueue) {
    const filtered = queue.filter((p) => new Date(p.timestamp).getTime() > cutoff);
    if (filtered.length === 0) offlineQueue.delete(handle);
    else offlineQueue.set(handle, filtered);
  }
}, 60_000);

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
  const handle = url.searchParams.get("handle");

  if (!handle) {
    ws.close(4000, "Missing handle");
    return;
  }

  const agentHandle = `@${handle}`;

  // Kick old session if duplicate (newest wins, like WhatsApp/Telegram)
  const existing = agents.get(agentHandle);
  if (existing && existing.readyState === WebSocket.OPEN) {
    console.log(`⚠️ ${agentHandle} reconnecting — closing old session`);
    existing.send(JSON.stringify({ protocol: "yap/0.2", type: "error", error_code: "SESSION_REPLACED", message: "Connected from another session" }));
    existing.close(4001, "Replaced by new session");
  }

  agents.set(agentHandle, ws);
  console.log(`✅ ${agentHandle} connected (${agents.size} online)`);

  // Flush queue
  const queued = offlineQueue.get(agentHandle);
  if (queued?.length) {
    const cutoff = Date.now() - QUEUE_TTL;
    const valid = queued.filter((p) => new Date(p.timestamp).getTime() > cutoff);
    for (const p of valid) ws.send(p.data);
    offlineQueue.delete(agentHandle);
    console.log(`📬 Flushed ${valid.length} to ${agentHandle}`);
  }

  ws.on("message", (data) => {
    const raw = data.toString();

    // Size limit
    if (raw.length > MAX_PACKET) {
      ws.send(JSON.stringify({ protocol: "yap/0.2", type: "error", error_code: "PACKET_TOO_LARGE", message: `Max ${MAX_PACKET} bytes` }));
      return;
    }

    // Rate limit
    const now = Date.now();
    const rate = rateCounts.get(agentHandle);
    if (rate && now - rate.windowStart < 60000) {
      rate.count++;
      if (rate.count > RATE_LIMIT) {
        ws.send(JSON.stringify({ protocol: "yap/0.2", type: "error", error_code: "RATE_LIMITED", message: "Slow down" }));
        return;
      }
    } else {
      rateCounts.set(agentHandle, { count: 1, windowStart: now });
    }

    let packet: { to?: string; type?: string; packet_id?: string };
    try {
      packet = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ protocol: "yap/0.2", type: "error", error_code: "MALFORMED", message: "Invalid JSON" }));
      return;
    }

    const target = packet.to;
    if (!target) {
      ws.send(JSON.stringify({ protocol: "yap/0.2", type: "error", error_code: "MISSING_TO", message: "Missing 'to' field" }));
      return;
    }

    console.log(`📨 ${agentHandle} → ${target} [${packet.type ?? "?"}]`);

    const targetWs = agents.get(target);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      targetWs.send(raw);
    } else {
      const queue = offlineQueue.get(target) ?? [];
      if (queue.length >= MAX_QUEUE) queue.shift();
      queue.push({ data: raw, timestamp: new Date().toISOString() });
      offlineQueue.set(target, queue);
    }
  });

  ws.on("close", () => {
    agents.delete(agentHandle);
    console.log(`👋 ${agentHandle} disconnected (${agents.size} online)`);
  });

  ws.on("error", (err) => {
    console.error(`❌ ${agentHandle}:`, err.message);
  });
});

// --- Start ---

async function main() {
  await registration.load();

  httpServer.listen(PORT, () => {
    console.log(`🌳 Tree + API on port ${PORT}`);
    console.log();
    console.log("Endpoints:");
    console.log(`  WebSocket: wss://yap-tree.fly.dev`);
    console.log(`  GET /info — tree status`);
    console.log(`  POST /register — register a handle`);
    console.log(`  GET /lookup?handle=X — check if handle exists`);
    console.log(`  GET /health — health check`);
    console.log();
  });

  process.on("SIGTERM", () => { console.log("Shutting down..."); process.exit(0); });
  process.on("SIGINT", () => { console.log("Shutting down..."); process.exit(0); });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
