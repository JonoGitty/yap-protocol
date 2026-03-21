/**
 * Discord notification channel for Yap.
 * Uses Discord Webhook API for rich embeds with buttons.
 */

import type { NotificationChannel } from "./channel.js";

export interface DiscordConfig {
  webhookUrl: string;
  botName?: string;
}

export class DiscordNotifier implements NotificationChannel {
  readonly name = "discord";
  private webhookUrl: string;
  private botName: string;

  constructor(config: DiscordConfig) {
    this.webhookUrl = config.webhookUrl;
    this.botName = config.botName ?? "Yap";
  }

  private async post(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: this.botName, ...payload }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async notifyIncomingYap(from: string, intentSummary: string, threadId: string): Promise<boolean> {
    return this.post({
      embeds: [{
        title: "🗣️ New Yap",
        description: `**${from}** wants to coordinate:\n> ${intentSummary}`,
        color: 0x5865F2,
        footer: { text: `Thread: ${threadId}` },
        fields: [
          { name: "Action", value: "Open Claude to respond, or your agent handles it automatically.", inline: false },
        ],
      }],
    });
  }

  async notifyLandingProposal(
    from: string,
    threadId: string,
    summary: string,
    details: Record<string, unknown>,
  ): Promise<boolean> {
    const detailLines = Object.entries(details)
      .map(([k, v]) => `**${k}**: ${v}`)
      .join("\n");

    return this.post({
      embeds: [{
        title: "📋 Landing Proposal",
        description: `**${from}** proposes:\n> ${summary}`,
        color: 0xFEE75C,
        fields: [
          { name: "Details", value: detailLines || "No additional details", inline: false },
          { name: "Action", value: "Open Claude to **confirm** or **decline**.", inline: false },
        ],
        footer: { text: `Thread: ${threadId}` },
      }],
    });
  }

  async notifyChirp(
    from: string,
    threadId: string,
    fields: { field: string; reason: string; priority: string }[],
  ): Promise<boolean> {
    const fieldLines = fields
      .map((f) => `• **${f.field}** (${f.priority}): ${f.reason}`)
      .join("\n");

    return this.post({
      embeds: [{
        title: "❓ Context Requested",
        description: `**${from}** needs some info from you:`,
        color: 0xEB459E,
        fields: [
          { name: "Requested Fields", value: fieldLines, inline: false },
          { name: "Action", value: "Open Claude to respond, or your agent uses comfort zone defaults.", inline: false },
        ],
        footer: { text: `Thread: ${threadId}` },
      }],
    });
  }

  async notifyContactRequest(from: string, intentSummary: string): Promise<boolean> {
    return this.post({
      embeds: [{
        title: "👋 New Contact Request",
        description: `**${from}** wants to yap with you:\n> ${intentSummary}`,
        color: 0x57F287,
        fields: [
          { name: "Action", value: "Open Claude and use `yap_contacts` to approve or ignore.", inline: false },
        ],
      }],
    });
  }

  async notifyCompleted(threadId: string, summary: string, withAgent: string): Promise<boolean> {
    return this.post({
      embeds: [{
        title: "✅ Yap Complete",
        description: `Your yap with **${withAgent}** is done:\n> ${summary}`,
        color: 0x57F287,
        footer: { text: `Thread: ${threadId}` },
      }],
    });
  }

  async notifyDeclined(threadId: string, reason: string | undefined, withAgent: string): Promise<boolean> {
    return this.post({
      embeds: [{
        title: "❌ Yap Declined",
        description: `Your yap with **${withAgent}** was declined${reason ? `: ${reason}` : ""}.`,
        color: 0xED4245,
        footer: { text: `Thread: ${threadId}` },
      }],
    });
  }
}
