#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  YapAgent,
  type Need,
  type Proposal,
  type ComfortZone,
  type ConsentResult,
} from "../../sdk/src/index.js";
import { EventBuffer } from "./event-buffer.js";
import { McpConsentPrompter } from "./mcp-consent.js";

// --- Config from environment ---

const handle = process.env.YAP_HANDLE ?? "claude-user";
const treeUrl = process.env.YAP_TREE_URL ?? "ws://localhost:8789";

function parseList(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

const comfortZone: ComfortZone = {
  always_share: parseList(process.env.YAP_ALWAYS_SHARE) || ["timezone", "general_availability"],
  ask_first: parseList(process.env.YAP_ASK_FIRST) || ["dietary", "budget_range", "location_preference"],
  never_share: parseList(process.env.YAP_NEVER_SHARE) || ["health_info", "financial_details"],
};

// --- Shared state ---

const buffer = new EventBuffer();
const consentPrompter = new McpConsentPrompter(buffer);

const agent = new YapAgent({
  handle,
  treeUrl,
  comfortZone,
  prompter: consentPrompter,
});

// Stashed callbacks for async decisions
const decideFns = new Map<string, (decision: "confirm" | "decline", reason?: string) => void>();
const respondFns = new Map<string, (context: Record<string, unknown>) => void>();

// --- Wire agent events into buffer ---

agent.onContext((threadId, context) => {
  buffer.push(threadId, "context_received", { context });
});

agent.onChirp((threadId, needs, respond) => {
  buffer.push(threadId, "chirp_received", {
    needs: needs.map((n) => ({ field: n.field, reason: n.reason, priority: n.priority })),
  });
  respondFns.set(threadId, respond);
});

agent.onLanding((threadId, proposal, decide) => {
  buffer.push(threadId, "landing_proposed", { proposal });
  decideFns.set(threadId, decide);
});

agent.onConfirmed((threadId) => {
  buffer.push(threadId, "confirmed", {});
});

agent.onDeclined((threadId, reason) => {
  buffer.push(threadId, "declined", { reason });
});

agent.onStalled((threadId) => {
  buffer.push(threadId, "stalled", {});
});

agent.onError((err) => {
  buffer.push(err.thread_id ?? "global", "error", {
    code: err.code,
    message: err.message,
  });
});

// --- MCP Server ---

const server = new McpServer({
  name: "yap",
  version: "0.1.0",
});

// Tool: send_yap
server.tool(
  "send_yap",
  "Start a new Yap branch (negotiation thread) with another agent. Returns the thread ID for tracking.",
  {
    to: z.string().describe("Target agent handle (e.g. '@bob')"),
    intent: z.object({
      category: z.string().describe("Intent category (e.g. 'scheduling', 'sharing', 'coordinating')"),
      summary: z.string().describe("Brief description of what this is about"),
      urgency: z.enum(["low", "medium", "high"]),
    }),
    context: z.record(z.string(), z.unknown()).describe("Context data to share (key-value pairs)"),
    needs: z.array(z.object({
      field: z.string().describe("Field name you need from the other agent"),
      reason: z.string().describe("Why you need this field"),
      priority: z.enum(["required", "helpful", "nice_to_have"]),
    })).describe("What context you need from the other agent"),
  },
  async ({ to, intent, context, needs }) => {
    try {
      const threadId = await agent.startBranch(to, intent, context, needs as Need[]);
      return {
        content: [{ type: "text", text: JSON.stringify({ thread_id: threadId, status: "initiated" }, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// Tool: check_branch
server.tool(
  "check_branch",
  "Check the status of a Yap branch. Returns pending events (new context, proposals, confirmations) and thread state. Call this to poll for updates.",
  {
    thread_id: z.string().optional().describe("Thread ID to check. If omitted, returns summary of all branches."),
  },
  async ({ thread_id }) => {
    if (!thread_id) {
      // Summary of all branches
      const branches = agent.listBranches();
      const summary = branches.map((b) => ({
        thread_id: b.thread_id,
        state: b.state,
        created_at: b.created_at,
        pending_events: buffer.pendingCount(b.thread_id),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ branches: summary }, null, 2) }],
      };
    }

    const branch = agent.getBranch(thread_id);
    const events = buffer.consume(thread_id);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          thread_id,
          state: branch?.state ?? "unknown",
          pending_events: events.map((e) => ({
            type: e.type,
            timestamp: e.timestamp,
            data: e.data,
          })),
        }, null, 2),
      }],
    };
  },
);

// Tool: respond_to_chirp
server.tool(
  "respond_to_chirp",
  "Respond to a context request or consent prompt. Provide values for requested fields, or decline them.",
  {
    thread_id: z.string().describe("Thread ID of the chirp/consent to respond to"),
    responses: z.array(z.object({
      field: z.string(),
      approved: z.boolean().describe("Whether to share this field"),
      value: z.unknown().optional().describe("The value to share (required if approved)"),
    })),
  },
  async ({ thread_id, responses }) => {
    const consentResults: ConsentResult[] = responses.map((r) => ({
      field: r.field,
      approved: r.approved,
      value: r.value,
    }));

    // Try consent resolution first (from comfort zone ask_first flow)
    if (consentPrompter.resolveConsent(thread_id, consentResults)) {
      const shared = responses.filter((r) => r.approved).map((r) => r.field);
      const declined = responses.filter((r) => !r.approved).map((r) => r.field);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "consent_resolved", fields_shared: shared, fields_declined: declined }, null, 2),
        }],
      };
    }

    // Try direct chirp response (from onChirp handler)
    const respond = respondFns.get(thread_id);
    if (respond) {
      const context: Record<string, unknown> = {};
      for (const r of responses) {
        if (r.approved && r.value !== undefined) {
          context[r.field] = r.value;
        }
      }
      respond(context);
      respondFns.delete(thread_id);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "sent", fields_shared: Object.keys(context) }, null, 2),
        }],
      };
    }

    return {
      content: [{ type: "text", text: `No pending chirp or consent request for thread ${thread_id}` }],
      isError: true,
    };
  },
);

// Tool: confirm_landing
server.tool(
  "confirm_landing",
  "Accept a proposed landing (agreement). Call this after reviewing a landing_proposed event.",
  {
    thread_id: z.string().describe("Thread ID of the landing to confirm"),
  },
  async ({ thread_id }) => {
    const decide = decideFns.get(thread_id);
    if (!decide) {
      return {
        content: [{ type: "text", text: `No pending landing proposal for thread ${thread_id}` }],
        isError: true,
      };
    }

    decide("confirm");
    decideFns.delete(thread_id);
    return {
      content: [{ type: "text", text: JSON.stringify({ status: "confirmed", thread_id }, null, 2) }],
    };
  },
);

// Tool: decline_landing
server.tool(
  "decline_landing",
  "Reject a proposed landing. Optionally provide a reason.",
  {
    thread_id: z.string().describe("Thread ID of the landing to decline"),
    reason: z.string().optional().describe("Reason for declining (e.g. 'scheduling_conflict', 'budget')"),
  },
  async ({ thread_id, reason }) => {
    const decide = decideFns.get(thread_id);
    if (!decide) {
      return {
        content: [{ type: "text", text: `No pending landing proposal for thread ${thread_id}` }],
        isError: true,
      };
    }

    decide("decline", reason);
    decideFns.delete(thread_id);
    return {
      content: [{ type: "text", text: JSON.stringify({ status: "declined", thread_id, reason }, null, 2) }],
    };
  },
);

// Tool: list_branches
server.tool(
  "list_branches",
  "List all active Yap branches (negotiation threads) with their current state and pending event counts.",
  {},
  async () => {
    const branches = agent.listBranches();
    const threadIds = new Set([...branches.map((b) => b.thread_id), ...buffer.allThreadIds()]);

    const result = Array.from(threadIds).map((tid) => {
      const branch = agent.getBranch(tid);
      return {
        thread_id: tid,
        state: branch?.state ?? "unknown",
        created_at: branch?.created_at,
        updated_at: branch?.updated_at,
        pending_events: buffer.pendingCount(tid),
      };
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ branches: result }, null, 2) }],
    };
  },
);

// Tool: set_comfort_zone
server.tool(
  "set_comfort_zone",
  "Configure which fields are automatically shared, require consent, or are never shared with other agents.",
  {
    always_share: z.array(z.string()).optional().describe("Fields to share automatically (e.g. timezone, general_availability)"),
    ask_first: z.array(z.string()).optional().describe("Fields that require your approval before sharing"),
    never_share: z.array(z.string()).optional().describe("Fields that are never shared"),
  },
  async ({ always_share, ask_first, never_share }) => {
    const current = agent.getComfortZone();
    const updated: ComfortZone = {
      always_share: always_share ?? current.always_share,
      ask_first: ask_first ?? current.ask_first,
      never_share: never_share ?? current.never_share,
    };
    agent.setComfortZone(updated);
    return {
      content: [{ type: "text", text: JSON.stringify({ status: "updated", comfort_zone: updated }, null, 2) }],
    };
  },
);

// --- Start ---

async function main() {
  await agent.connect();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Yap MCP server failed to start:", err);
  process.exit(1);
});
