export type EventType =
  | "context_received"
  | "chirp_received"
  | "landing_proposed"
  | "confirmed"
  | "declined"
  | "stalled"
  | "error"
  | "consent_pending";

export interface BufferedEvent {
  type: EventType;
  timestamp: string;
  data: Record<string, unknown>;
  consumed: boolean;
}

export class EventBuffer {
  private events = new Map<string, BufferedEvent[]>();

  push(threadId: string, type: EventType, data: Record<string, unknown> = {}): void {
    const list = this.events.get(threadId) ?? [];
    list.push({
      type,
      timestamp: new Date().toISOString(),
      data,
      consumed: false,
    });
    this.events.set(threadId, list);
  }

  /** Get unconsumed events for a thread and mark them consumed. */
  consume(threadId: string): BufferedEvent[] {
    const list = this.events.get(threadId) ?? [];
    const pending = list.filter((e) => !e.consumed);
    for (const e of pending) {
      e.consumed = true;
    }
    return pending;
  }

  /** Get all events for a thread (consumed and unconsumed). */
  history(threadId: string): BufferedEvent[] {
    return this.events.get(threadId) ?? [];
  }

  /** Count unconsumed events for a thread. */
  pendingCount(threadId: string): number {
    const list = this.events.get(threadId) ?? [];
    return list.filter((e) => !e.consumed).length;
  }

  /** Get all thread IDs that have any events. */
  allThreadIds(): string[] {
    return Array.from(this.events.keys());
  }
}
