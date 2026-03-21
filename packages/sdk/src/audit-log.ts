import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type SecurityEventType =
  | "replay_detected"
  | "injection_detected"
  | "rate_limited"
  | "decryption_failed"
  | "auth_failed"
  | "blocked_agent"
  | "timestamp_rejected"
  | "key_exchange"
  | "connection"
  | "disconnection"
  | "packet_too_large"
  | "depth_exceeded"
  | "coordinator_spoofed"
  | "agent_purged";

export interface SecurityEvent {
  timestamp: string;
  event_type: SecurityEventType;
  agent?: string;
  thread_id?: string;
  detail: string;
  severity: "low" | "medium" | "high" | "critical";
}

export class AuditLog {
  private ready = false;

  constructor(private logPath: string) {}

  async init(): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    this.ready = true;
  }

  async log(event: SecurityEvent): Promise<void> {
    if (!this.ready) return;
    const line = JSON.stringify(event) + "\n";
    await appendFile(this.logPath, line, "utf-8").catch(() => {});
  }

  /** Convenience: log from a security warning string. */
  async logWarning(warning: string, agent?: string, threadId?: string): Promise<void> {
    const severity = warning.includes("Replay") || warning.includes("decryption")
      ? "high" as const
      : warning.includes("injection") || warning.includes("Suspicious")
        ? "high" as const
        : "medium" as const;

    const eventType: SecurityEventType =
      warning.includes("Replay") ? "replay_detected" :
      warning.includes("injection") || warning.includes("Suspicious") ? "injection_detected" :
      warning.includes("Rate limit") ? "rate_limited" :
      warning.includes("ecryption") ? "decryption_failed" :
      warning.includes("Timestamp") ? "timestamp_rejected" :
      "injection_detected";

    await this.log({
      timestamp: new Date().toISOString(),
      event_type: eventType,
      agent,
      thread_id: threadId,
      detail: warning,
      severity,
    });
  }
}
