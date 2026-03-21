import type { Intent, Need, ParticipantInfo, YapPacket } from "./types.js";

export interface MultiPartyState {
  thread_id: string;
  coordinator: string;
  participants: Map<string, ParticipantInfo>;
  responses: Map<string, Record<string, unknown>>;
  confirmations: Set<string>;
  declinations: Set<string>;
}

export class MultiPartyManager {
  private groups = new Map<string, MultiPartyState>();

  createGroup(
    threadId: string,
    coordinator: string,
    participantHandles: string[],
  ): MultiPartyState {
    const participants = new Map<string, ParticipantInfo>();
    participants.set(coordinator, {
      handle: coordinator,
      role: "coordinator",
      status: "joined",
    });
    for (const h of participantHandles) {
      participants.set(h, {
        handle: h,
        role: "participant",
        status: "invited",
      });
    }

    const state: MultiPartyState = {
      thread_id: threadId,
      coordinator,
      participants,
      responses: new Map(),
      confirmations: new Set(),
      declinations: new Set(),
    };
    this.groups.set(threadId, state);
    return state;
  }

  getGroup(threadId: string): MultiPartyState | undefined {
    return this.groups.get(threadId);
  }

  recordResponse(threadId: string, from: string, context: Record<string, unknown>): void {
    const group = this.groups.get(threadId);
    if (!group) return;
    group.responses.set(from, context);
    const p = group.participants.get(from);
    if (p) p.status = "context_received";
  }

  recordConfirmation(threadId: string, from: string): void {
    const group = this.groups.get(threadId);
    if (!group) return;
    group.confirmations.add(from);
    const p = group.participants.get(from);
    if (p) p.status = "confirmed";
  }

  recordDeclination(threadId: string, from: string): void {
    const group = this.groups.get(threadId);
    if (!group) return;
    group.declinations.add(from);
    const p = group.participants.get(from);
    if (p) p.status = "declined";
  }

  /** Aggregate all received context responses into a single merged object. */
  aggregateContext(threadId: string): Record<string, unknown> {
    const group = this.groups.get(threadId);
    if (!group) return {};
    const merged: Record<string, unknown> = {};
    for (const [agent, ctx] of group.responses) {
      for (const [key, value] of Object.entries(ctx)) {
        // Collect per-agent values for fields that multiple agents provide
        const existing = merged[key];
        if (existing !== undefined) {
          if (!Array.isArray(existing) || !(existing as unknown[]).every((e: unknown) => typeof e === "object")) {
            merged[key] = [{ agent: "unknown", value: existing }, { agent, value }];
          } else {
            (merged[key] as unknown[]).push({ agent, value });
          }
        } else {
          merged[key] = value;
        }
      }
    }
    return merged;
  }

  /** Check if enough participants have confirmed. */
  checkQuorum(threadId: string, requiredCount?: number): boolean {
    const group = this.groups.get(threadId);
    if (!group) return false;
    const needed = requiredCount ?? group.participants.size - 1; // all non-coordinator
    return group.confirmations.size >= needed;
  }

  /** Check if all participants have responded. */
  allResponded(threadId: string): boolean {
    const group = this.groups.get(threadId);
    if (!group) return false;
    for (const [handle, p] of group.participants) {
      if (p.role === "coordinator") continue;
      if (p.status === "invited" || p.status === "joined") return false;
    }
    return true;
  }

  /** Transfer coordinator role. */
  transferCoordinator(threadId: string, newCoordinator: string): boolean {
    const group = this.groups.get(threadId);
    if (!group) return false;
    const newP = group.participants.get(newCoordinator);
    if (!newP) return false;

    const oldP = group.participants.get(group.coordinator);
    if (oldP) oldP.role = "participant";
    newP.role = "coordinator";
    group.coordinator = newCoordinator;
    return true;
  }

  getParticipantList(threadId: string): ParticipantInfo[] {
    const group = this.groups.get(threadId);
    if (!group) return [];
    return Array.from(group.participants.values());
  }
}
