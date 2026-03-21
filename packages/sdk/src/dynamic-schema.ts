import type { YapPacket } from "./types.js";
import { generateId } from "./yap.js";
import { CURRENT_VERSION } from "./version.js";

// --- Schema types ---

export interface SchemaFieldDef {
  type: "string" | "number" | "boolean" | "array" | "object" | "enum" | "currency";
  description?: string;
  values?: string[]; // for enum type
  items?: SchemaFieldDef | Record<string, SchemaFieldDef>;
  properties?: Record<string, SchemaFieldDef>;
}

export interface ServiceIntegration {
  service: string;
  purpose: string;
  capabilities_needed: string[];
  api_available: boolean;
  notes?: string;
  discovery?: {
    both_users_connected?: boolean;
    available_actions?: {
      action: string;
      method: string;
      requires: string[];
      user_approval_needed: boolean;
      note?: string;
    }[];
    recommendation?: string;
  };
}

export interface SchemaExtension {
  name: string;
  description: string;
  fields: Record<string, SchemaFieldDef>;
  service_integrations?: ServiceIntegration[];
}

export interface SchemaModifications {
  added_fields?: Record<string, SchemaFieldDef>;
  modified_fields?: Record<string, { added_values?: string[]; removed_values?: string[]; reason: string }>;
  removed_fields?: string[];
  notes?: string;
}

export interface SchemaCompletion {
  filled: string[];
  missing: string[];
  declined: string[];
  percentage: number;
}

export interface ConflictEntry {
  field: string;
  issue: string;
  suggested_resolution: string;
  resolved?: boolean;
}

// --- Schema state tracking ---

export type SchemaStatus = "proposed" | "negotiating" | "locked" | "completed";

export interface SchemaState {
  thread_id: string;
  name: string;
  status: SchemaStatus;
  fields: Record<string, SchemaFieldDef>;
  service_integrations: ServiceIntegration[];
  my_values: Record<string, unknown>;
  their_values: Record<string, unknown>;
  conflicts: ConflictEntry[];
  my_completion: SchemaCompletion;
  their_completion: SchemaCompletion | null;
}

export class DynamicSchemaManager {
  private schemas = new Map<string, SchemaState>();

  /** Propose a schema for a thread. */
  propose(
    threadId: string,
    extension: SchemaExtension,
  ): SchemaState {
    const fieldNames = Object.keys(extension.fields);
    const state: SchemaState = {
      thread_id: threadId,
      name: extension.name,
      status: "proposed",
      fields: { ...extension.fields },
      service_integrations: extension.service_integrations ?? [],
      my_values: {},
      their_values: {},
      conflicts: [],
      my_completion: { filled: [], missing: fieldNames, declined: [], percentage: 0 },
      their_completion: null,
    };
    this.schemas.set(threadId, state);
    return state;
  }

  /** Apply modifications from the other agent and lock the schema. */
  applyModifications(threadId: string, mods: SchemaModifications): SchemaState | undefined {
    const state = this.schemas.get(threadId);
    if (!state) return undefined;

    if (mods.added_fields) {
      for (const [name, def] of Object.entries(mods.added_fields)) {
        state.fields[name] = def;
      }
    }

    if (mods.removed_fields) {
      for (const name of mods.removed_fields) {
        delete state.fields[name];
      }
    }

    // Update completion tracking with new field list
    const allFields = Object.keys(state.fields);
    state.my_completion.missing = allFields.filter(
      (f) => !state.my_completion.filled.includes(f) && !state.my_completion.declined.includes(f),
    );
    state.my_completion.percentage = this.calcPercentage(state.my_completion, allFields.length);

    state.status = "negotiating";
    return state;
  }

  /** Lock the schema — both sides have agreed. */
  lock(threadId: string): SchemaState | undefined {
    const state = this.schemas.get(threadId);
    if (!state) return undefined;
    state.status = "locked";
    return state;
  }

  /** Fill in my values for schema fields. */
  fillMyValues(threadId: string, values: Record<string, unknown>): SchemaState | undefined {
    const state = this.schemas.get(threadId);
    if (!state) return undefined;

    for (const [field, value] of Object.entries(values)) {
      state.my_values[field] = value;
      if (!state.my_completion.filled.includes(field)) {
        state.my_completion.filled.push(field);
        state.my_completion.missing = state.my_completion.missing.filter((f) => f !== field);
      }
    }

    const total = Object.keys(state.fields).length;
    state.my_completion.percentage = this.calcPercentage(state.my_completion, total);
    return state;
  }

  /** Record values received from the other agent. */
  fillTheirValues(threadId: string, values: Record<string, unknown>, completion?: SchemaCompletion): SchemaState | undefined {
    const state = this.schemas.get(threadId);
    if (!state) return undefined;

    for (const [field, value] of Object.entries(values)) {
      state.their_values[field] = value;
    }

    if (completion) {
      state.their_completion = completion;
    }

    return state;
  }

  /** Add detected conflicts. */
  addConflicts(threadId: string, conflicts: ConflictEntry[]): void {
    const state = this.schemas.get(threadId);
    if (!state) return;
    state.conflicts.push(...conflicts);
  }

  /** Mark a conflict as resolved. */
  resolveConflict(threadId: string, field: string): void {
    const state = this.schemas.get(threadId);
    if (!state) return;
    const conflict = state.conflicts.find((c) => c.field === field);
    if (conflict) conflict.resolved = true;
  }

  /** Decline a field (user doesn't want to share). */
  declineField(threadId: string, field: string): void {
    const state = this.schemas.get(threadId);
    if (!state) return;
    if (!state.my_completion.declined.includes(field)) {
      state.my_completion.declined.push(field);
      state.my_completion.missing = state.my_completion.missing.filter((f) => f !== field);
    }
    const total = Object.keys(state.fields).length;
    state.my_completion.percentage = this.calcPercentage(state.my_completion, total);
  }

  /** Check if both sides are 100% complete and all conflicts resolved. */
  isReadyForProposal(threadId: string): boolean {
    const state = this.schemas.get(threadId);
    if (!state || state.status !== "locked") return false;

    // My side must be 100%
    if (state.my_completion.percentage < 100) return false;

    // Their side must be 100%
    if (!state.their_completion || state.their_completion.percentage < 100) return false;

    // All conflicts must be resolved
    if (state.conflicts.some((c) => !c.resolved)) return false;

    return true;
  }

  /** Mark schema as completed. */
  complete(threadId: string): void {
    const state = this.schemas.get(threadId);
    if (state) state.status = "completed";
  }

  get(threadId: string): SchemaState | undefined {
    return this.schemas.get(threadId);
  }

  private calcPercentage(completion: SchemaCompletion, total: number): number {
    if (total === 0) return 100;
    return Math.round(((completion.filled.length + completion.declined.length) / total) * 100);
  }
}

// --- Packet constructors ---

export function createSchemaProposal(
  threadId: string,
  from: string,
  to: string,
  extension: SchemaExtension,
  reason: string,
): YapPacket {
  return {
    protocol: CURRENT_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "schema_proposal" as YapPacket["type"],
    context: {
      extension,
      reason,
    },
  };
}

export function createSchemaResponse(
  threadId: string,
  from: string,
  to: string,
  status: "accepted" | "accepted_with_modifications" | "rejected",
  modifications?: SchemaModifications,
): YapPacket {
  return {
    protocol: CURRENT_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "schema_response" as YapPacket["type"],
    context: {
      status,
      modifications,
    },
  };
}

export function createSchemaConfirmed(
  threadId: string,
  from: string,
  to: string,
  agreedSchemaName: string,
): YapPacket {
  return {
    protocol: CURRENT_VERSION,
    packet_id: generateId("pkt"),
    thread_id: threadId,
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "schema_confirmed" as YapPacket["type"],
    context: {
      agreed_schema: agreedSchemaName,
      status: "locked",
    },
  };
}
