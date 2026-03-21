import WebSocket from "ws";
import type { YapPacket } from "./types.js";
import { validateYap } from "./yap.js";

export class YapClient {
  private ws: WebSocket | null = null;
  private yapCallbacks: Array<(yap: YapPacket) => void> = [];
  private connectCallbacks: Array<() => void> = [];
  private disconnectCallbacks: Array<() => void> = [];

  constructor(
    private treeUrl: string,
    private handle: string,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.treeUrl}?handle=${encodeURIComponent(this.handle)}`;
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        for (const cb of this.connectCallbacks) cb();
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const yap = JSON.parse(data.toString()) as YapPacket;
          const { valid, errors } = validateYap(yap);
          if (!valid) {
            console.error(`[${this.handle}] Invalid packet received:`, errors);
            return;
          }
          for (const cb of this.yapCallbacks) cb(yap);
        } catch (err) {
          console.error(`[${this.handle}] Failed to parse incoming message:`, err);
        }
      });

      this.ws.on("close", () => {
        for (const cb of this.disconnectCallbacks) cb();
      });

      this.ws.on("error", (err) => {
        reject(err);
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(yap: YapPacket): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Not connected to tree. Call connect() first.`);
    }
    this.ws.send(JSON.stringify(yap));
  }

  onYap(callback: (yap: YapPacket) => void): void {
    this.yapCallbacks.push(callback);
  }

  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }
}
