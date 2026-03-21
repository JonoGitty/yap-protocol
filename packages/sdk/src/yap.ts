import type { ContextUnavailable, Need, Proposal, YapPacket } from "./types.js";

const PROTOCOL_VERSION = "yap/0.1";

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

  const validTypes = [
    "context",
    "context_request",
    "context_response",
    "resolution",
    "resolution_response",
    "intent_update",
    "error",
  ];
  if (!validTypes.includes(p.type as string)) {
    errors.push(`Invalid 'type' field: ${p.type}. Must be one of: ${validTypes.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
