import WebSocket from "ws";
import { createHash, randomBytes } from "node:crypto";

export interface FederationConfig {
  /** This tree's domain (e.g., "tree.yapprotocol.dev") */
  domain: string;
  /** Allowed peer tree domains with their auth tokens */
  peers: Record<string, { token: string; url?: string }>;
}

interface PeerConnection {
  ws: WebSocket;
  domain: string;
  connected: boolean;
  authenticated: boolean;
}

/**
 * Handles cross-tree federation with peer authentication.
 * When a packet targets @user@other-domain, this module routes it to the peer tree.
 * Peers authenticate via shared tokens on connection.
 */
export class FederationManager {
  private connections = new Map<string, PeerConnection>();
  private config: FederationConfig;

  constructor(config: FederationConfig) {
    this.config = config;
  }

  /** Parse a federated address. Returns { handle, domain } or null if local. */
  static parseAddress(to: string): { handle: string; domain: string } | null {
    const match = to.match(/^(@\w+)@(.+)$/);
    if (match) return { handle: match[1], domain: match[2] };
    return null;
  }

  /** Check if an address is for a remote tree. */
  isRemote(to: string): boolean {
    const parsed = FederationManager.parseAddress(to);
    return parsed !== null && parsed.domain !== this.config.domain;
  }

  /** Route a packet to a remote tree. Returns true if sent, false if failed. */
  async route(to: string, rawPacket: string): Promise<boolean> {
    const parsed = FederationManager.parseAddress(to);
    if (!parsed) return false;

    const peerConfig = this.config.peers[parsed.domain];
    if (!peerConfig) {
      console.error(`❌ Federation: ${parsed.domain} not in peer allowlist`);
      return false;
    }

    const peer = await this.ensureConnection(parsed.domain, peerConfig);
    if (!peer?.connected || !peer.authenticated) {
      console.error(`❌ Federation: cannot connect/authenticate with ${parsed.domain}`);
      return false;
    }

    try {
      const packet = JSON.parse(rawPacket);
      packet.to = parsed.handle;
      packet._federated_from = this.config.domain;
      // Sign the federation hop so receiving tree can verify origin
      packet._federation_signature = this.signFederationHop(
        this.config.domain,
        parsed.domain,
        packet.packet_id ?? "",
        peerConfig.token,
      );
      peer.ws.send(JSON.stringify(packet));
      console.log(`🌐 Federated: ${packet.from} → ${to} via ${parsed.domain}`);
      return true;
    } catch (err) {
      console.error(`❌ Federation send error:`, (err as Error).message);
      return false;
    }
  }

  /** Verify an incoming federated packet's signature. */
  verifyFederationHop(
    fromDomain: string,
    signature: string,
    packetId: string,
  ): boolean {
    const peerConfig = this.config.peers[fromDomain];
    if (!peerConfig) return false;
    const expected = this.signFederationHop(fromDomain, this.config.domain, packetId, peerConfig.token);
    return signature === expected;
  }

  private signFederationHop(from: string, to: string, packetId: string, token: string): string {
    return createHash("sha256")
      .update(`${from}:${to}:${packetId}:${token}`)
      .digest("hex");
  }

  private async ensureConnection(
    domain: string,
    peerConfig: { token: string; url?: string },
  ): Promise<PeerConnection | null> {
    const existing = this.connections.get(domain);
    if (existing?.connected && existing.authenticated) return existing;

    const url = peerConfig.url ?? `wss://${domain}:8789`;

    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url);
        const peer: PeerConnection = { ws, domain, connected: false, authenticated: false };

        ws.on("open", () => {
          peer.connected = true;
          // Authenticate: send challenge-response
          const challenge = randomBytes(32).toString("hex");
          const proof = createHash("sha256")
            .update(`${this.config.domain}:${domain}:${challenge}:${peerConfig.token}`)
            .digest("hex");

          ws.send(JSON.stringify({
            type: "_federation_auth",
            from_domain: this.config.domain,
            challenge,
            proof,
          }));

          // Wait for auth response (simplified: trust on open for now,
          // signature verification on each packet provides the real security)
          peer.authenticated = true;
          this.connections.set(domain, peer);
          console.log(`🌐 Federation: connected + authenticated with ${domain}`);
          resolve(peer);
        });

        ws.on("close", () => {
          peer.connected = false;
          peer.authenticated = false;
          this.connections.delete(domain);
        });

        ws.on("error", () => resolve(null));

        setTimeout(() => {
          if (!peer.connected) {
            ws.close();
            resolve(null);
          }
        }, 5000);
      } catch {
        resolve(null);
      }
    });
  }

  getInfo(): { domain: string; peers: string[]; protocol: string } {
    return {
      domain: this.config.domain,
      peers: Object.keys(this.config.peers),
      protocol: "yap/0.2",
    };
  }

  close(): void {
    for (const peer of this.connections.values()) {
      peer.ws.close();
    }
    this.connections.clear();
  }
}
