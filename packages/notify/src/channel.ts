/**
 * Unified notification channel interface.
 * Every notification platform (Slack, Discord, email, SMS, WhatsApp)
 * implements this interface. The notification service dispatches to
 * whichever channel(s) the user has configured.
 */

export interface NotificationChannel {
  readonly name: string;

  /** Send a notification that a new yap arrived. */
  notifyIncomingYap(from: string, intentSummary: string, threadId: string): Promise<boolean>;

  /** Send a landing proposal with approve/decline options. */
  notifyLandingProposal(
    from: string,
    threadId: string,
    summary: string,
    details: Record<string, unknown>,
  ): Promise<boolean>;

  /** Notify that an agent is requesting context. */
  notifyChirp(
    from: string,
    threadId: string,
    fields: { field: string; reason: string; priority: string }[],
  ): Promise<boolean>;

  /** Notify about a contact request from an unknown agent. */
  notifyContactRequest(from: string, intentSummary: string): Promise<boolean>;

  /** Notify that a branch completed successfully. */
  notifyCompleted(threadId: string, summary: string, withAgent: string): Promise<boolean>;

  /** Notify that a branch was declined. */
  notifyDeclined(threadId: string, reason: string | undefined, withAgent: string): Promise<boolean>;
}

export type NotificationEvent =
  | { type: "incoming_yap"; from: string; intentSummary: string; threadId: string }
  | { type: "landing_proposal"; from: string; threadId: string; summary: string; details: Record<string, unknown> }
  | { type: "chirp"; from: string; threadId: string; fields: { field: string; reason: string; priority: string }[] }
  | { type: "contact_request"; from: string; intentSummary: string }
  | { type: "completed"; threadId: string; summary: string; withAgent: string }
  | { type: "declined"; threadId: string; reason?: string; withAgent: string };

/**
 * Multi-channel notification dispatcher.
 * Routes events to all configured channels.
 */
export class NotificationService {
  private channels: NotificationChannel[] = [];

  addChannel(channel: NotificationChannel): void {
    this.channels.push(channel);
  }

  get channelCount(): number {
    return this.channels.length;
  }

  get channelNames(): string[] {
    return this.channels.map((c) => c.name);
  }

  async dispatch(event: NotificationEvent): Promise<void> {
    if (this.channels.length === 0) return;

    const promises = this.channels.map(async (channel) => {
      try {
        switch (event.type) {
          case "incoming_yap":
            return channel.notifyIncomingYap(event.from, event.intentSummary, event.threadId);
          case "landing_proposal":
            return channel.notifyLandingProposal(event.from, event.threadId, event.summary, event.details);
          case "chirp":
            return channel.notifyChirp(event.from, event.threadId, event.fields);
          case "contact_request":
            return channel.notifyContactRequest(event.from, event.intentSummary);
          case "completed":
            return channel.notifyCompleted(event.threadId, event.summary, event.withAgent);
          case "declined":
            return channel.notifyDeclined(event.threadId, event.reason, event.withAgent);
        }
      } catch {
        // Channel failure shouldn't block others
        return false;
      }
    });

    await Promise.allSettled(promises);
  }
}
