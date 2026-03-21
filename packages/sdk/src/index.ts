export { YapClient } from "./client.js";
export { BranchManager } from "./branch.js";
export { YapAgent, type AgentConfig } from "./agent.js";
export {
  type ComfortZone,
  type FieldTier,
  type ClassifiedNeeds,
  resolveFieldTier,
  classifyNeeds,
} from "./comfort-zone.js";
export {
  type ConsentPrompter,
  type ConsentResult,
  TerminalPrompter,
  AutoPrompter,
} from "./consent.js";
export {
  createYap,
  createChirp,
  createContextResponse,
  createContextResponseWithDeclines,
  createLanding,
  createConfirmation,
  createDecline,
  generateId,
  validateYap,
} from "./yap.js";
export type {
  YapPacket,
  Intent,
  Need,
  Permissions,
  ContextUnavailable,
  Proposal,
  Alternative,
  BranchState,
  BranchStateValue,
  YapError,
  YapErrorCode,
} from "./types.js";
