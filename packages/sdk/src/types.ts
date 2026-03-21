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
    | "intent_update";
  intent?: Intent;
  context?: Record<string, unknown>;
  needs?: Need[];
  permissions?: Permissions;
  context_provided?: Record<string, unknown>;
  context_unavailable?: ContextUnavailable[];
  proposal?: Proposal;
  status?: "confirmed" | "declined";
  reason_class?: string;
}

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
}
