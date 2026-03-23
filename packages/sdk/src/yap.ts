import type { Capabilities, ContextUnavailable, Intent, Need, Proposal, YapPacket } from "./types.js";
import { CURRENT_VERSION, LOCAL_CAPABILITIES } from "./version.js";

const PROTOCOL_VERSION = CURRENT_VERSION;

export function generateId(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = `${prefix}_`;
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export function createYap(params: Partial<YapPacket> & { from: string; to: string }): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: params.thread_id ?? generateId("thr"),
    timestamp: new Date().toISOString(),
    type: "context",
    ...params,
  };
}

export function createChirp(
  threadId: string,
  from: string,
  to: string,
  needs: Need[],
  contextProvided?: Record<string, unknown>,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "context_request",
    needs,
    context_provided: contextProvided,
  };
}

export function createContextResponse(
  threadId: string,
  from: string,
  to: string,
  contextProvided: Record<string, unknown>,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "context_response",
    context_provided: contextProvided,
  };
}

export function createLanding(
  threadId: string,
  from: string,
  to: string,
  proposal: Proposal,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "resolution",
    proposal,
  };
}

export function createConfirmation(
  threadId: string,
  from: string,
  to: string,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "resolution_response",
    status: "confirmed",
  };
}

export function createDecline(
  threadId: string,
  from: string,
  to: string,
  reasonClass?: string,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "resolution_response",
    status: "declined",
    reason_class: reasonClass,
  };
}

export function createContextResponseWithDeclines(
  threadId: string,
  from: string,
  to: string,
  contextProvided: Record<string, unknown>,
  contextUnavailable: ContextUnavailable[],
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "context_response",
    context_provided: contextProvided,
    context_unavailable: contextUnavailable,
  };
}

export function createIntentUpdate(
  threadId: string,
  from: string,
  to: string,
  previousIntent: Intent,
  updatedIntent: Intent,
  additionalNeeds?: Need[],
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "intent_update",
    previous_intent: previousIntent,
    intent: updatedIntent,
    needs: additionalNeeds,
  };
}

export function createFork(
  parentThreadId: string,
  from: string,
  to: string,
  forkThreads: { thread_id: string; intent: Intent }[],
  sharedContext?: Record<string, unknown>,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: parentThreadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "thread_fork",
    fork_threads: forkThreads,
    shared_context: sharedContext,
  };
}

export function createKeyExchange(
  from: string,
  to: string,
  publicEncryptionKey: string,
  publicSigningKey: string,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: generateId("thr"),
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "key_exchange",
    public_encryption_key: publicEncryptionKey,
    public_signing_key: publicSigningKey,
    capabilities: LOCAL_CAPABILITIES,
  };
}

export function createNestUpdate(
  threadId: string,
  from: string,
  to: string,
  nestId: string,
  fields: Record<string, unknown>,
  version: number,
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "nest_update",
    nest_id: nestId,
    nest_fields: fields,
    nest_version: version,
  };
}

export function createSessionEnd(
  threadId: string,
  from: string,
  to: string,
  reason: "completed" | "cancelled" | "timeout" | "user_request" = "completed",
): YapPacket {
  return {
    protocol: PROTOCOL_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "session_end",
    session_end_reason: reason,
  };
}

export function validateYap(yap: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof yap !== "object" || yap === null) {
    return { valid: false, errors: ["Packet must be a non-null object"] };
  }

  const p = yap as Record<string, unknown>;

  if (typeof p.protocol !== "string") errors.push("Missing or invalid 'protocol' field");
  if (typeof p.packet_id !== "string") errors.push("Missing or invalid 'packet_id' field");
  if (typeof p.thread_id !== "string") errors.push("Missing or invalid 'thread_id' field");
  if (typeof p.from !== "string") errors.push("Missing or invalid 'from' field");
  if (typeof p.to !== "string") errors.push("Missing or invalid 'to' field");
  if (typeof p.timestamp !== "string") errors.push("Missing or invalid 'timestamp' field");

  // Forward compatibility: accept unknown types (treat as context) rather than rejecting
  if (typeof p.type !== "string") {
    errors.push("Missing or invalid 'type' field");
  }

  return { valid: errors.length === 0, errors };
}
