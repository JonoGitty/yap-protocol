import WebSocket from "ws";
import type { YapPacket } from "./types.js";
import { validateYap } from "./yap.js";
import { encryptPacket, decryptPacket, deriveSharedSecret } from "./crypto.js";
import { ReplayDetector, validateTimestamp, sanitiseContext, sanitiseNeeds, RateLimiter } from "./security.js";
import type { Keystore } from "./keystore.js";

export interface ClientSecurityConfig {
  /** Enable E2E encryption (requires keystore). */
  encryption?: boolean;
  /** Keystore for key management. */
  keystore?: Keystore;
  /** Enable replay detection. Default: true. */
  replayDetection?: boolean;
  /** Enable timestamp validation. Default: true. */
  timestampValidation?: boolean;
  /** Enable input sanitisation. Default: true. */
  sanitisation?: boolean;
  /** Enable rate limiting. Default: true. */
  rateLimiting?: boolean;
}

export class YapClient {
  private ws: WebSocket | null = null;
  private yapCallbacks: Array<(yap: YapPacket) => void> = [];
  private connectCallbacks: Array<() => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private errorCallbacks: Array<(err: Error) => void> = [];
  private securityWarningCallbacks: Array<(warning: string, packet: YapPacket) => void> = [];
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private replayDetector = new ReplayDetector();
  private rateLimiter = new RateLimiter();
  private security: ClientSecurityConfig;

  constructor(
    private treeUrl: string,
    private handle: string,
    security?: ClientSecurityConfig,
  ) {
    this.security = {
      encryption: false,
      replayDetection: true,
      timestampValidation: true,
      sanitisation: true,
      rateLimiting: true,
      ...security,
    };
  }

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
          let yap = JSON.parse(data.toString()) as YapPacket;

          // Tree error responses are minimal — skip security for them
          if (yap.type === "error") {
            for (const cb of this.yapCallbacks) cb(yap);
            return;
          }

          // --- Security checks ---

          // 1. Replay detection
          if (this.security.replayDetection && yap.packet_id) {
            if (this.replayDetector.isReplay(yap.packet_id)) {
              this.emitSecurityWarning(`Replay detected: packet ${yap.packet_id} already seen`, yap);
              return; // Drop replay
            }
          }

          // 2. Timestamp validation
          if (this.security.timestampValidation && yap.timestamp) {
            const ts = validateTimestamp(yap.timestamp);
            if (!ts.valid) {
              this.emitSecurityWarning(`Timestamp validation failed: ${ts.reason}`, yap);
              // Don't drop — just warn. Clock skew is common.
            }
          }

          // 3. Rate limiting
          if (this.security.rateLimiting && yap.from) {
            if (this.rateLimiter.isLimited(yap.from)) {
              this.emitSecurityWarning(`Rate limit exceeded for ${yap.from}`, yap);
              return; // Drop rate-limited packets
            }
          }

          // 4. Decryption
          if (yap.encrypted && this.security.encryption && this.security.keystore) {
            const peerEncKey = this.security.keystore.getPeerEncryptionKey(yap.from);
            const peerSignKey = this.security.keystore.getPeerSigningKey(yap.from);
            const ownEncKeys = this.security.keystore.getOwnEncryptionKeys();

            if (peerEncKey && ownEncKeys) {
              try {
                const shared = deriveSharedSecret(ownEncKeys.secretKey, peerEncKey);
                yap = decryptPacket(yap, shared, peerSignKey);
              } catch (err) {
                this.emitSecurityWarning(`Decryption failed: ${(err as Error).message}`, yap);
                return; // Drop packets that fail decryption
              }
            }
          }

          // 5. Input sanitisation
          if (this.security.sanitisation) {
            if (yap.context) {
              const { context, warnings } = sanitiseContext(yap.context);
              yap.context = context;
              for (const w of warnings) {
                this.emitSecurityWarning(w, yap);
              }
            }
            if (yap.needs) {
              const { needs, warnings } = sanitiseNeeds(yap.needs);
              yap.needs = needs;
              for (const w of warnings) {
                this.emitSecurityWarning(w, yap);
              }
            }
          }

          // 6. Validate packet structure
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

    let packet = yap;

    // Encrypt if enabled and we have the recipient's keys
    if (this.security.encryption && this.security.keystore) {
      const peerEncKey = this.security.keystore.getPeerEncryptionKey(yap.to);
      const ownEncKeys = this.security.keystore.getOwnEncryptionKeys();
      const ownSignKeys = this.security.keystore.getOwnSigningKeys();

      if (peerEncKey && ownEncKeys && ownSignKeys) {
        const shared = deriveSharedSecret(ownEncKeys.secretKey, peerEncKey);
        packet = encryptPacket(yap, shared, ownSignKeys.secretKey);
      }
    }

    this.ws.send(JSON.stringify(packet));
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

  /** Subscribe to security warnings (prompt injection, replay, etc). */
  onSecurityWarning(callback: (warning: string, packet: YapPacket) => void): void {
    this.securityWarningCallbacks.push(callback);
  }

  private emitSecurityWarning(warning: string, packet: YapPacket): void {
    console.warn(`[${this.handle}] ⚠️ SECURITY: ${warning}`);
    for (const cb of this.securityWarningCallbacks) {
      cb(warning, packet);
    }
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
