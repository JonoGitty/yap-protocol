export { YapClient } from "./client.js";
export { BranchManager } from "./branch.js";
export { YapAgent, type AgentConfig } from "./agent.js";
export {
  type ComfortZone,
  type RelationshipOverride,
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
  createIntentUpdate,
  createFork,
  createKeyExchange,
  createNestUpdate,
  generateId,
  validateYap,
} from "./yap.js";
export {
  CURRENT_VERSION,
  LOCAL_CAPABILITIES,
  negotiateVersion,
  hasFeature,
  supportsEncryption,
} from "./version.js";
export { MultiPartyManager, type MultiPartyState } from "./multi-party.js";
export { FlockMemory } from "./flock-memory.js";
export { NestManager } from "./nest.js";
export {
  type KeyPair,
  generateEncryptionKeyPair,
  generateSigningKeyPair,
  deriveSharedSecret,
  encrypt,
  decrypt,
  sign,
  verify,
  encryptPacket,
  decryptPacket,
} from "./crypto.js";
export { Keystore } from "./keystore.js";
export { ContactList } from "./contacts.js";
export {
  discoverServices,
  formatServiceSuggestions,
  type ServiceSuggestion,
} from "./service-discovery.js";
export {
  DynamicSchemaManager,
  type SchemaFieldDef,
  type ServiceIntegration,
  type SchemaExtension,
  type SchemaModifications,
  type SchemaCompletion,
  type ConflictEntry,
  type SchemaState,
  type SchemaStatus,
  createSchemaProposal,
  createSchemaResponse,
  createSchemaConfirmed,
} from "./dynamic-schema.js";
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
  Capabilities,
  ParticipantInfo,
  FlockEntry,
  NestState,
  ConnectedService,
  ServiceVisibilityPolicy,
  Contact,
} from "./types.js";
