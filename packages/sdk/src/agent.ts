import type {
  ContextUnavailable,
  Intent,
  Need,
  Proposal,
  YapError,
  YapPacket,
} from "./types.js";
import { YapClient } from "./client.js";
import { BranchManager } from "./branch.js";
import type { ComfortZone } from "./comfort-zone.js";
import { classifyNeeds } from "./comfort-zone.js";
import type { ConsentPrompter } from "./consent.js";
import {
  createYap,
  createContextResponseWithDeclines,
  createLanding,
  createConfirmation,
  createDecline,
  generateId,
} from "./yap.js";

const MAX_ROUND_TRIPS = 8;
const DEFAULT_URGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const DEFAULT_NON_URGENT_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface AgentConfig {
  handle: string;
  treeUrl: string;
  comfortZone: ComfortZone;
  prompter: ConsentPrompter;
  userData?: Record<string, unknown>;
  timeouts?: {
    urgent_ms?: number;
    non_urgent_ms?: number;
  };
}

type RespondFn = (context: Record<string, unknown>) => void;
type DecideFn = (decision: "confirm" | "decline", reason?: string) => void;

export class YapAgent {
  private client: YapClient;
  private branches: BranchManager;
  private zone: ComfortZone;
  private prompter: ConsentPrompter;
  private userData: Record<string, unknown>;
  private urgentTimeoutMs: number;
  private nonUrgentTimeoutMs: number;
  private threadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private threadUrgency = new Map<string, string>();
  private handle: string;

  // Event handlers
  private chirpHandler?: (threadId: string, needs: Need[], respond: RespondFn) => void;
  private contextHandler?: (threadId: string, context: Record<string, unknown>) => void;
  private landingHandler?: (threadId: string, proposal: Proposal, decide: DecideFn) => void;
  private confirmedHandler?: (threadId: string) => void;
  private declinedHandler?: (threadId: string, reason?: string) => void;
  private stalledHandler?: (threadId: string) => void;
  private errorHandler?: (error: YapError) => void;

  constructor(config: AgentConfig) {
    this.handle = config.handle.startsWith("@") ? config.handle : `@${config.handle}`;
    const rawHandle = this.handle.slice(1);
    this.client = new YapClient(config.treeUrl, rawHandle);
    this.branches = new BranchManager();
    this.zone = config.comfortZone;
    this.prompter = config.prompter;
    this.userData = config.userData ?? {};
    this.urgentTimeoutMs = config.timeouts?.urgent_ms ?? DEFAULT_URGENT_TIMEOUT_MS;
    this.nonUrgentTimeoutMs = config.timeouts?.non_urgent_ms ?? DEFAULT_NON_URGENT_TIMEOUT_MS;

    this.client.onYap((yap) => this.handlePacket(yap));
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  disconnect(): void {
    for (const timer of this.threadTimers.values()) {
      clearTimeout(timer);
    }
    this.threadTimers.clear();
    this.client.disconnect();
  }

  // --- Public accessors ---

  getHandle(): string {
    return this.handle;
  }

  getBranch(threadId: string) {
    return this.branches.getBranch(threadId);
  }

  listBranches() {
    return this.branches.listBranches();
  }

  getComfortZone(): ComfortZone {
    return this.zone;
  }

  setComfortZone(zone: ComfortZone): void {
    this.zone = zone;
  }

  // --- Initiator: start a new branch ---

  async startBranch(
    to: string,
    intent: Intent,
    context: Record<string, unknown>,
    needs: Need[],
  ): Promise<string> {
    const threadId = generateId("thr");

    const yap = createYap({
      thread_id: threadId,
      from: this.handle,
      to,
      type: "context",
      intent,
      context,
      needs,
      permissions: {
        shared_fields: Object.keys(context),
        withheld_fields: [],
        consent_level: "user_preauthorised",
      },
    });

    this.branches.addPacket(threadId, yap);
    this.threadUrgency.set(threadId, intent.urgency);
    this.startTimeout(threadId);
    this.client.send(yap);
    return threadId;
  }

  // --- Proposer: send a landing ---

  proposeLanding(threadId: string, to: string, proposal: Proposal): void {
    const landing = createLanding(threadId, this.handle, to, proposal);
    this.branches.addPacket(threadId, landing);
    this.resetTimeout(threadId);
    this.client.send(landing);
  }

  // --- Event handler registration ---

  onChirp(handler: (threadId: string, needs: Need[], respond: RespondFn) => void): void {
    this.chirpHandler = handler;
  }

  onContext(handler: (threadId: string, context: Record<string, unknown>) => void): void {
    this.contextHandler = handler;
  }

  onLanding(handler: (threadId: string, proposal: Proposal, decide: DecideFn) => void): void {
    this.landingHandler = handler;
  }

  onConfirmed(handler: (threadId: string) => void): void {
    this.confirmedHandler = handler;
  }

  onDeclined(handler: (threadId: string, reason?: string) => void): void {
    this.declinedHandler = handler;
  }

  onStalled(handler: (threadId: string) => void): void {
    this.stalledHandler = handler;
  }

  onError(handler: (error: YapError) => void): void {
    this.errorHandler = handler;
  }

  // --- Internal packet router ---

  private async handlePacket(yap: YapPacket): Promise<void> {
    const threadId = yap.thread_id;
    this.branches.addPacket(threadId, yap);
    this.resetTimeout(threadId);

    // Track urgency from initial intent
    if (yap.intent?.urgency && !this.threadUrgency.has(threadId)) {
      this.threadUrgency.set(threadId, yap.intent.urgency);
    }

    switch (yap.type) {
      case "context":
        await this.handleIncomingContext(yap);
        break;
      case "context_request":
        await this.handleChirp(yap);
        break;
      case "context_response":
        this.handleContextResponse(yap);
        break;
      case "resolution":
        this.handleResolution(yap);
        break;
      case "resolution_response":
        this.handleResolutionResponse(yap);
        break;
      case "error":
        this.errorHandler?.({
          code: "MALFORMED",
          thread_id: threadId,
          message: (yap as unknown as Record<string, unknown>).message as string ?? "Tree error",
        });
        break;
    }
  }

  private async handleIncomingContext(yap: YapPacket): Promise<void> {
    // Check loop limit
    if (!this.checkLoopLimit(yap.thread_id)) return;

    // If the sender included needs, resolve them via comfort zone
    if (yap.needs && yap.needs.length > 0) {
      const filteredNeeds = this.filterDuplicateNeeds(yap.thread_id, yap.needs);
      if (filteredNeeds.length > 0) {
        await this.resolveAndRespond(yap.thread_id, yap.from, filteredNeeds, yap.intent?.summary ?? "");
      }
    }

    // Notify the consumer about the incoming context
    this.contextHandler?.(yap.thread_id, yap.context ?? {});
  }

  private async handleChirp(yap: YapPacket): Promise<void> {
    if (!this.checkLoopLimit(yap.thread_id)) return;

    const needs = yap.needs ?? [];
    const filteredNeeds = this.filterDuplicateNeeds(yap.thread_id, needs);

    if (filteredNeeds.length > 0) {
      // Let consumer handle via onChirp if registered, otherwise auto-resolve
      if (this.chirpHandler) {
        const respond: RespondFn = (context) => {
          const response = createContextResponseWithDeclines(
            yap.thread_id,
            this.handle,
            yap.from,
            context,
            [],
          );
          this.branches.addPacket(yap.thread_id, response);
          this.client.send(response);
        };
        this.chirpHandler(yap.thread_id, filteredNeeds, respond);
      } else {
        await this.resolveAndRespond(yap.thread_id, yap.from, filteredNeeds, yap.intent?.summary ?? "");
      }
    }
  }

  private handleContextResponse(yap: YapPacket): void {
    // Notify consumer with the provided context
    this.contextHandler?.(yap.thread_id, yap.context_provided ?? {});
  }

  private handleResolution(yap: YapPacket): void {
    if (!yap.proposal || !this.landingHandler) return;

    const decide: DecideFn = (decision, reason) => {
      if (decision === "confirm") {
        const confirmation = createConfirmation(yap.thread_id, this.handle, yap.from);
        this.branches.addPacket(yap.thread_id, confirmation);
        this.clearTimeout(yap.thread_id);
        this.client.send(confirmation);
      } else {
        const decline = createDecline(yap.thread_id, this.handle, yap.from, reason);
        this.branches.addPacket(yap.thread_id, decline);
        this.clearTimeout(yap.thread_id);
        this.client.send(decline);
      }
    };

    this.landingHandler(yap.thread_id, yap.proposal, decide);
  }

  private handleResolutionResponse(yap: YapPacket): void {
    this.clearTimeout(yap.thread_id);
    if (yap.status === "confirmed") {
      this.branches.updateState(yap.thread_id, "COMPLETED");
      this.confirmedHandler?.(yap.thread_id);
    } else {
      this.declinedHandler?.(yap.thread_id, yap.reason_class);
    }
  }

  // --- Protocol enforcement ---

  private checkLoopLimit(threadId: string): boolean {
    const roundTrips = this.branches.getRoundTripCount(threadId);
    if (roundTrips >= MAX_ROUND_TRIPS) {
      this.branches.updateState(threadId, "STALLED");
      this.errorHandler?.({
        code: "LOOP_LIMIT",
        thread_id: threadId,
        message: `Thread ${threadId} exceeded ${MAX_ROUND_TRIPS} round trips. Escalate to user.`,
      });
      this.stalledHandler?.(threadId);
      return false;
    }
    return true;
  }

  private filterDuplicateNeeds(threadId: string, needs: Need[]): Need[] {
    const answered = this.branches.getAnsweredFields(threadId);
    return needs.filter((need) => !answered.has(need.field));
  }

  // --- Consent flow ---

  private async resolveAndRespond(
    threadId: string,
    toAgent: string,
    needs: Need[],
    threadSummary: string,
  ): Promise<void> {
    const { auto_share, needs_consent, declined } = classifyNeeds(this.zone, needs);

    const provided: Record<string, unknown> = {};
    const unavailable: ContextUnavailable[] = [];

    // Auto-fill always_share fields from userData
    for (const need of auto_share) {
      if (need.field in this.userData) {
        provided[need.field] = this.userData[need.field];
      }
    }

    // Silently decline never_share fields
    for (const need of declined) {
      unavailable.push({ field: need.field, status: "declined", hint: null });
    }

    // Prompt user for ask_first fields
    if (needs_consent.length > 0) {
      const results = await this.prompter.promptBatch(toAgent, needs_consent, threadSummary, threadId);
      for (const result of results) {
        if (result.approved && result.value !== undefined) {
          provided[result.field] = result.value;
        } else {
          unavailable.push({ field: result.field, status: "declined", hint: null });
        }
      }
    }

    // Send response
    const response = createContextResponseWithDeclines(
      threadId,
      this.handle,
      toAgent,
      provided,
      unavailable,
    );
    this.branches.addPacket(threadId, response);
    this.client.send(response);
  }

  // --- Timeout management ---

  private startTimeout(threadId: string): void {
    const urgency = this.threadUrgency.get(threadId) ?? "low";
    const ms = urgency === "high" ? this.urgentTimeoutMs : this.nonUrgentTimeoutMs;

    this.threadTimers.set(
      threadId,
      setTimeout(() => {
        this.branches.updateState(threadId, "STALLED");
        this.stalledHandler?.(threadId);
      }, ms),
    );
  }

  private resetTimeout(threadId: string): void {
    this.clearTimeout(threadId);
    this.startTimeout(threadId);
  }

  private clearTimeout(threadId: string): void {
    const timer = this.threadTimers.get(threadId);
    if (timer) {
      clearTimeout(timer);
      this.threadTimers.delete(threadId);
    }
  }
}
