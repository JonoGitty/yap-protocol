import type { ConsentPrompter, ConsentResult, Need } from "../../sdk/src/index.js";
import type { EventBuffer } from "./event-buffer.js";

const CONSENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface PendingConsent {
  resolve: (results: ConsentResult[]) => void;
  needs: Need[];
  timer: ReturnType<typeof setTimeout>;
}

/**
 * ConsentPrompter that buffers consent requests for Claude to handle via MCP tools.
 * When the SDK's internal consent flow asks for permission, this prompter:
 * 1. Pushes a consent_pending event to the EventBuffer
 * 2. Returns a deferred promise
 * 3. The promise resolves when Claude calls respond_to_chirp with approvals
 * 4. Auto-declines after 5 minutes if Claude doesn't respond
 */
export class McpConsentPrompter implements ConsentPrompter {
  private pending = new Map<string, PendingConsent>();

  constructor(private buffer: EventBuffer) {}

  async promptBatch(
    fromAgent: string,
    needs: Need[],
    threadSummary: string,
    threadId?: string,
  ): Promise<ConsentResult[]> {
    const tid = threadId ?? "unknown";

    this.buffer.push(tid, "consent_pending", {
      from_agent: fromAgent,
      thread_summary: threadSummary,
      needs: needs.map((n) => ({
        field: n.field,
        reason: n.reason,
        priority: n.priority,
      })),
    });

    return new Promise<ConsentResult[]>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(tid);
        resolve(
          needs.map((n) => ({ field: n.field, approved: false })),
        );
      }, CONSENT_TIMEOUT_MS);

      this.pending.set(tid, { resolve, needs, timer });
    });
  }

  /**
   * Resolve a pending consent request (called when Claude uses respond_to_chirp).
   * Returns true if there was a pending consent to resolve.
   */
  resolveConsent(threadId: string, results: ConsentResult[]): boolean {
    const entry = this.pending.get(threadId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    this.pending.delete(threadId);
    entry.resolve(results);
    return true;
  }

  hasPendingConsent(threadId: string): boolean {
    return this.pending.has(threadId);
  }
}
