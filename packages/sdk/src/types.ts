export interface YapPacket {
  protocol: string;
  packet_id: string;
  thread_id: string;
  from: string;
  to: string;
  timestamp: string;
  type:
    | "context"
    | "context_request"
    | "context_response"
    | "resolution"
    | "resolution_response"
    | "intent_update"
    | "thread_fork"
    | "coordinator_transfer"
    | "key_exchange"
    | "nest_update"
    | "schema_proposal"
    | "schema_response"
    | "schema_confirmed"
    | "session_end"
    | "error";
  intent?: Intent;
  context?: Record<string, unknown>;
  needs?: Need[];
  permissions?: Permissions;
  context_provided?: Record<string, unknown>;
  context_unavailable?: ContextUnavailable[];
  proposal?: Proposal;
  status?: "confirmed" | "declined";
  reason_class?: string;

  // Session termination
  session_end_reason?: "completed" | "cancelled" | "timeout" | "user_request";

  // Version handshake (Step 2)
  capabilities?: Capabilities;

  // Multi-party (Step 4)
  participants?: ParticipantInfo[];
  coordinator?: string;

  // Context drift (Step 6)
  previous_intent?: Intent;
  fork_threads?: { thread_id: string; intent: Intent }[];
  shared_context?: Record<string, unknown>;

  // Encryption (Step 7)
  encrypted?: boolean;
  ciphertext?: string;
  nonce?: string;
  signature?: string;
  public_encryption_key?: string;
  public_signing_key?: string;

  // Perfect forward secrecy
  ephemeral_public_key?: string;

  // Nests (Step 8)
  nest_id?: string;
  nest_fields?: Record<string, unknown>;
  nest_version?: number;
}

// --- Core types ---

export interface Intent {
  category: string;
  summary: string;
  urgency: "low" | "medium" | "high";
}

export interface Need {
  field: string;
  reason: string;
  priority: "required" | "helpful" | "nice_to_have";
}

export interface Permissions {
  shared_fields: string[];
  withheld_fields: string[];
  consent_level: string;
}

export interface ContextUnavailable {
  field: string;
  status: "declined";
  hint: null;
}

export interface Proposal {
  summary: string;
  details: Record<string, unknown>;
  alternatives?: Alternative[];
  reasoning?: string;
}

export interface Alternative {
  summary: string;
  reason: string;
}

// --- Branch state ---

export type BranchStateValue =
  | "INITIATED"
  | "NEGOTIATING"
  | "PROPOSED"
  | "CONFIRMED"
  | "EXECUTING"
  | "COMPLETED"
  | "DECLINED"
  | "FAILED"
  | "STALLED";

export interface BranchState {
  thread_id: string;
  state: BranchStateValue;
  packets: YapPacket[];
  created_at: string;
  updated_at: string;
  parent_thread_id?: string;
}

// --- Errors ---

export type YapErrorCode =
  | "LOOP_LIMIT"
  | "TIMEOUT"
  | "MALFORMED"
  | "DISCONNECTED"
  | "SEND_FAILED";

export interface YapError {
  code: YapErrorCode;
  thread_id?: string;
  message: string;
}

// --- Version handshake (Step 2) ---

export interface ConnectedService {
  service: string;
  capabilities: string[];
  description?: string;
  /** When to reveal this service to other agents */
  visibility: "public" | "trusted_only" | "on_request" | "private";
}

/** Controls what service info is shared during handshake */
export interface ServiceVisibilityPolicy {
  /** Default visibility for services not explicitly configured */
  default_visibility: "public" | "trusted_only" | "on_request" | "private";
  /** Minimum trust level to reveal trusted_only services */
  trusted_threshold: "developing" | "established" | "trusted";
  /** Services to never reveal regardless of trust */
  hidden_services: string[];
}

export interface Capabilities {
  supported_versions: string[];
  features: string[];
  platform?: string;
  platform_version?: string;
  connected_services?: ConnectedService[];
  max_context_size_bytes?: number;
  supported_encryption?: string[];
}

// --- Contact list ---

export interface Contact {
  handle: string;
  label?: string;
  notes?: string;
  platform?: string;
  connected_services?: ConnectedService[];
  first_seen: string;
  last_seen: string;
  last_thread_id?: string;
  trust_level?: "new" | "developing" | "established" | "trusted";
}

// --- Multi-party (Step 4) ---

export interface ParticipantInfo {
  handle: string;
  role: "coordinator" | "participant";
  status: "invited" | "joined" | "context_received" | "confirmed" | "declined";
}

// --- Flock memory (Step 5) ---

export interface FlockEntry {
  agent: string;
  user_label?: string;
  interaction_count: number;
  first_interaction: string;
  last_interaction: string;
  typical_intents: string[];
  learned_patterns: {
    usually_shares: string[];
    usually_declines: string[];
    average_response_time_ms: number;
    preferred_resolution_style?: string;
  };
  context_cache: Record<string, {
    value: unknown;
    updated: string;
    confidence: "high" | "medium" | "low";
  }>;
  trust_level: "new" | "developing" | "established" | "trusted";
}

// --- Nests (Step 8) ---

export interface NestState {
  nest_id: string;
  participants: string[];
  fields: Record<string, {
    value: unknown;
    version: number;
    updated_by: string;
    updated_at: string;
  }>;
  created_at: string;
  updated_at: string;
}
