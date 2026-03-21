import type { ConsentPrompter, ConsentResult, Need } from "../../sdk/src/index.js";

type ReplyCallback = (message: string) => Promise<string>;

/**
 * ConsentPrompter that formats consent requests for messaging platforms.
 * Presents numbered options and waits for user reply via callback.
 */
export class MessagingPrompter implements ConsentPrompter {
  private replyCallback: ReplyCallback | null = null;

  /**
   * Set the callback that sends a message to the user and waits for their reply.
   * Must be set before any consent prompts are triggered.
   */
  setReplyCallback(cb: ReplyCallback): void {
    this.replyCallback = cb;
  }

  async promptBatch(
    fromAgent: string,
    needs: Need[],
    threadSummary: string,
    threadId?: string,
  ): Promise<ConsentResult[]> {
    if (!this.replyCallback) {
      // No reply mechanism — auto-decline all
      return needs.map((n) => ({ field: n.field, approved: false }));
    }

    const results: ConsentResult[] = [];

    for (const need of needs) {
      const priorityLabel =
        need.priority === "required" ? "Required" :
        need.priority === "helpful" ? "Helpful" : "Nice to have";

      const message = [
        `${fromAgent} is asking for your ${need.field}`,
        `Reason: "${need.reason}"`,
        `Priority: ${priorityLabel}`,
        ``,
        `Reply with your value to share, or "no" to decline.`,
      ].join("\n");

      const reply = await this.replyCallback(message);

      if (reply.toLowerCase() === "no" || reply.toLowerCase() === "n" || reply.trim() === "") {
        results.push({ field: need.field, approved: false });
      } else {
        let value: unknown = reply;
        try {
          value = JSON.parse(reply);
        } catch {
          // keep as string
        }
        results.push({ field: need.field, approved: true, value });
      }
    }

    return results;
  }
}
