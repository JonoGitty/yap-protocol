/**
 * Slack notification channel for Yap.
 *
 * Sends rich Slack messages when:
 * - A new yap arrives (from unknown or known contact)
 * - A landing proposal needs approval (confirm/decline buttons)
 * - A chirp needs context from the user (field-by-field prompts)
 * - A branch is confirmed or declined
 *
 * Uses Slack Incoming Webhooks for notifications and
 * Slack Interactivity (slash commands or HTTP callbacks) for responses.
 *
 * All secrets (webhook URL, signing secret) come from environment variables.
 */

export interface SlackConfig {
  /** Slack Incoming Webhook URL — for sending messages. From env, never hardcoded. */
  webhookUrl: string;
  /** Optional: bot name shown in Slack */
  botName?: string;
  /** Optional: callback URL for interactive buttons (your server that receives Slack actions) */
  interactiveCallbackUrl?: string;
}

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

type SlackBlock =
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "actions"; elements: SlackAction[] }
  | { type: "divider" }
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "context"; elements: { type: "mrkdwn"; text: string }[] };

type SlackAction = {
  type: "button";
  text: { type: "plain_text"; text: string; emoji?: boolean };
  style?: "primary" | "danger";
  value: string;
  action_id: string;
};

export class SlackNotifier {
  private webhookUrl: string;
  private botName: string;

  constructor(config: SlackConfig) {
    this.webhookUrl = config.webhookUrl;
    this.botName = config.botName ?? "Yap";
  }

  private async post(message: SlackMessage): Promise<boolean> {
    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.botName,
          icon_emoji: ":speech_balloon:",
          ...message,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Notification types ---

  /** New yap arrived from someone. */
  async notifyIncomingYap(from: string, intentSummary: string, threadId: string): Promise<boolean> {
    return this.post({
      text: `${from} wants to yap with you: "${intentSummary}"`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "New Yap Incoming" } },
        { type: "section", text: { type: "mrkdwn", text: `*${from}* wants to coordinate:\n> ${intentSummary}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Thread: \`${threadId}\`` }] },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: "_Open Claude to respond, or wait for your agent to handle it automatically._" } },
      ],
    });
  }

  /** Landing proposal needs approval — with confirm/decline buttons. */
  async notifyLandingProposal(
    from: string,
    threadId: string,
    summary: string,
    details: Record<string, unknown>,
  ): Promise<boolean> {
    const detailLines = Object.entries(details)
      .map(([k, v]) => `• *${k}*: ${v}`)
      .join("\n");

    return this.post({
      text: `${from} proposes: "${summary}" — approve or decline?`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Landing Proposal" } },
        { type: "section", text: { type: "mrkdwn", text: `*${from}* proposes:\n> ${summary}` } },
        { type: "section", text: { type: "mrkdwn", text: detailLines || "_No additional details_" } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Thread: \`${threadId}\`` }] },
        { type: "divider" },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Confirm", emoji: true },
              style: "primary",
              value: `confirm:${threadId}`,
              action_id: "yap_confirm",
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Decline", emoji: true },
              style: "danger",
              value: `decline:${threadId}`,
              action_id: "yap_decline",
            },
          ],
        },
      ],
    });
  }

  /** Chirp — agent needs info from the user. */
  async notifyChirp(
    from: string,
    threadId: string,
    fields: { field: string; reason: string; priority: string }[],
  ): Promise<boolean> {
    const fieldLines = fields
      .map((f) => `• *${f.field}* (${f.priority}): ${f.reason}`)
      .join("\n");

    return this.post({
      text: `${from} is asking for information`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Context Requested" } },
        { type: "section", text: { type: "mrkdwn", text: `*${from}* needs some info from you:` } },
        { type: "section", text: { type: "mrkdwn", text: fieldLines } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Thread: \`${threadId}\`` }] },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: "_Open Claude to respond, or your agent will use your comfort zone defaults._" } },
      ],
    });
  }

  /** Contact request — unknown agent wants to yap. */
  async notifyContactRequest(from: string, intentSummary: string): Promise<boolean> {
    return this.post({
      text: `${from} wants to connect with you on Yap`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "New Contact Request" } },
        { type: "section", text: { type: "mrkdwn", text: `*${from}* wants to yap with you:\n> ${intentSummary}` } },
        { type: "divider" },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve", emoji: true },
              style: "primary",
              value: `approve:${from}`,
              action_id: "yap_approve_contact",
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Ignore", emoji: true },
              value: `ignore:${from}`,
              action_id: "yap_ignore_contact",
            },
          ],
        },
      ],
    });
  }

  /** Branch completed — final notification. */
  async notifyCompleted(threadId: string, summary: string, withAgent: string): Promise<boolean> {
    return this.post({
      text: `Yap complete: ${summary}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Yap Complete" } },
        { type: "section", text: { type: "mrkdwn", text: `Your yap with *${withAgent}* is done:\n> ${summary}` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Thread: \`${threadId}\`` }] },
      ],
    });
  }

  /** Branch declined. */
  async notifyDeclined(threadId: string, reason: string | undefined, withAgent: string): Promise<boolean> {
    return this.post({
      text: `Yap declined${reason ? `: ${reason}` : ""}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `Your yap with *${withAgent}* was declined${reason ? `: ${reason}` : ""}.` } },
        { type: "context", elements: [{ type: "mrkdwn", text: `Thread: \`${threadId}\`` }] },
      ],
    });
  }
}
