import WebSocket from "ws";
import type { YapPacket } from "./types.js";
import { validateYap } from "./yap.js";

export class YapClient {
  private ws: WebSocket | null = null;
  private yapCallbacks: Array<(yap: YapPacket) => void> = [];
  private connectCallbacks: Array<() => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private treeUrl: string,
    private handle: string,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      const url = `${this.treeUrl}?handle=${encodeURIComponent(this.handle)}`;
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        for (const cb of this.connectCallbacks) cb();
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const yap = JSON.parse(data.toString()) as YapPacket;
          // Tree error responses are minimal — skip full validation for them
          if (yap.type === "error") {
            for (const cb of this.yapCallbacks) cb(yap);
            return;
          }
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
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err) => {
        for (const cb of this.errorCallbacks) cb(err);
        if (this.reconnectAttempts === 0) {
          reject(err);
        }
      });
    });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
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

  onError(callback: (err: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `[${this.handle}] Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`,
      );
      for (const cb of this.errorCallbacks) {
        cb(new Error("Max reconnect attempts reached"));
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay, 30000);
    console.log(
      `[${this.handle}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay *= 2;
      this.connect().catch(() => {
        // connect rejection triggers another scheduleReconnect via close handler
      });
    }, delay);
  }
}
