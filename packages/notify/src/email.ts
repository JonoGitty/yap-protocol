/**
 * Email notification channel for Yap.
 * Uses a simple webhook-based email API (SendGrid, Resend, Mailgun, etc).
 * Or any service that accepts POST with JSON body.
 */

import type { NotificationChannel } from "./channel.js";

export interface EmailConfig {
  /** Email API endpoint (e.g., https://api.resend.com/emails) */
  apiUrl: string;
  /** API key for the email service */
  apiKey: string;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
}

export class EmailNotifier implements NotificationChannel {
  readonly name = "email";

  constructor(private config: EmailConfig) {}

  private async send(subject: string, body: string): Promise<boolean> {
    try {
      const res = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          from: this.config.from,
          to: this.config.to,
          subject,
          html: body,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private html(title: string, content: string, footer?: string): string {
    return `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
<h2 style="color:#333">${title}</h2>
${content}
${footer ? `<p style="color:#999;font-size:12px;margin-top:20px">${footer}</p>` : ""}
<p style="color:#999;font-size:11px">— Yap Protocol</p>
</div>`;
  }

  async notifyIncomingYap(from: string, intentSummary: string, threadId: string): Promise<boolean> {
    return this.send(
      `${from} wants to yap with you`,
      this.html("New Yap", `<p><strong>${from}</strong> wants to coordinate:</p><blockquote>${intentSummary}</blockquote><p>Open Claude to respond.</p>`, `Thread: ${threadId}`),
    );
  }

  async notifyLandingProposal(from: string, threadId: string, summary: string, details: Record<string, unknown>): Promise<boolean> {
    const detailHtml = Object.entries(details)
      .map(([k, v]) => `<li><strong>${k}</strong>: ${v}</li>`)
      .join("");

    return this.send(
      `${from} proposes: ${summary}`,
      this.html("Landing Proposal", `<p><strong>${from}</strong> proposes:</p><blockquote>${summary}</blockquote><ul>${detailHtml}</ul><p><strong>Open Claude to confirm or decline.</strong></p>`, `Thread: ${threadId}`),
    );
  }

  async notifyChirp(from: string, threadId: string, fields: { field: string; reason: string; priority: string }[]): Promise<boolean> {
    const fieldHtml = fields
      .map((f) => `<li><strong>${f.field}</strong> (${f.priority}): ${f.reason}</li>`)
      .join("");

    return this.send(
      `${from} is asking for information`,
      this.html("Context Requested", `<p><strong>${from}</strong> needs info from you:</p><ul>${fieldHtml}</ul><p>Open Claude to respond.</p>`, `Thread: ${threadId}`),
    );
  }

  async notifyContactRequest(from: string, intentSummary: string): Promise<boolean> {
    return this.send(
      `${from} wants to connect on Yap`,
      this.html("Contact Request", `<p><strong>${from}</strong> wants to yap with you:</p><blockquote>${intentSummary}</blockquote><p>Open Claude to approve or ignore.</p>`),
    );
  }

  async notifyCompleted(threadId: string, summary: string, withAgent: string): Promise<boolean> {
    return this.send(
      `Yap complete: ${summary}`,
      this.html("Yap Complete ✅", `<p>Your yap with <strong>${withAgent}</strong> is done:</p><blockquote>${summary}</blockquote>`, `Thread: ${threadId}`),
    );
  }

  async notifyDeclined(threadId: string, reason: string | undefined, withAgent: string): Promise<boolean> {
    return this.send(
      `Yap declined${reason ? `: ${reason}` : ""}`,
      this.html("Yap Declined", `<p>Your yap with <strong>${withAgent}</strong> was declined${reason ? `: ${reason}` : ""}.</p>`, `Thread: ${threadId}`),
    );
  }
}
