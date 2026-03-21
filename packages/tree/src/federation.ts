import WebSocket from "ws";

export interface FederationConfig {
  /** This tree's domain (e.g., "tree.yap.dev") */
  domain: string;
  /** Allowed peer tree domains */
  peers: string[];
}

interface PeerConnection {
  ws: WebSocket;
  domain: string;
  connected: boolean;
}

/**
 * Handles cross-tree federation.
 * When a packet targets @user@other-domain, this module routes it to the peer tree.
 */
export class FederationManager {
  private peers = new Map<string, PeerConnection>();
  private config: FederationConfig;

  constructor(config: FederationConfig) {
    this.config = config;
  }

  /** Parse a federated address. Returns { handle, domain } or null if local. */
  static parseAddress(to: string): { handle: string; domain: string } | null {
    // @user@domain format — the handle has two @ signs
    const match = to.match(/^(@\w+)@(.+)$/);
    if (match) {
      return { handle: match[1], domain: match[2] };
    }
    return null; // local address
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

    if (!this.config.peers.includes(parsed.domain)) {
      console.error(`❌ Federation: ${parsed.domain} not in peer allowlist`);
      return false;
    }

    const peer = await this.ensureConnection(parsed.domain);
    if (!peer || !peer.connected) {
      console.error(`❌ Federation: cannot connect to ${parsed.domain}`);
      return false;
    }

    // Rewrite the `to` field to be local on the remote tree
    try {
      const packet = JSON.parse(rawPacket);
      packet.to = parsed.handle; // Strip the @domain part
      packet._federated_from = this.config.domain;
      peer.ws.send(JSON.stringify(packet));
      console.log(`🌐 Federated: ${packet.from} → ${to} via ${parsed.domain}`);
      return true;
    } catch (err) {
      console.error(`❌ Federation send error:`, (err as Error).message);
      return false;
    }
  }

  private async ensureConnection(domain: string): Promise<PeerConnection | null> {
    const existing = this.peers.get(domain);
    if (existing?.connected) return existing;

    // Try to connect (assume wss:// on port 8789)
    const url = `wss://${domain}:8789`;
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(url);
        const peer: PeerConnection = { ws, domain, connected: false };

        ws.on("open", () => {
          peer.connected = true;
          this.peers.set(domain, peer);
          console.log(`🌐 Federation: connected to ${domain}`);
          resolve(peer);
        });

        ws.on("close", () => {
          peer.connected = false;
          this.peers.delete(domain);
        });

        ws.on("error", () => {
          resolve(null);
        });

        // Timeout after 5s
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

  /** Get federation info for the /federation/info endpoint. */
  getInfo(): { domain: string; peers: string[]; protocol: string } {
    return {
      domain: this.config.domain,
      peers: this.config.peers,
      protocol: "yap/0.2",
    };
  }

  close(): void {
    for (const peer of this.peers.values()) {
      peer.ws.close();
    }
    this.peers.clear();
  }
}
