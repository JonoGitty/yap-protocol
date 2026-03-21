#!/usr/bin/env node

import { McpServer, type ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  YapAgent,
  type Need,
  type Proposal,
  type ComfortZone,
  type ConsentResult,
  type Intent,
} from "../../sdk/src/index.js";
import { createTree, type TreeInstance } from "../../tree/src/index.js";
import { EventBuffer } from "./event-buffer.js";
import { McpConsentPrompter } from "./mcp-consent.js";
import { randomBytes } from "node:crypto";
import { hostname, userInfo } from "node:os";

// --- Zero-config setup ---

// Auto-detect handle from system username or env
const handle = process.env.YAP_HANDLE
  ?? userInfo().username
  ?? `user-${randomBytes(3).toString("hex")}`;

// Tree connection strategy:
// 1. YAP_TREE_URL env var → use that (explicit external tree)
// 2. Public tree at wss://tree.yapprotocol.dev → try that (when deployed)
// 3. Fallback → start embedded local tree (development / offline)
const PUBLIC_TREE_URL = "wss://tree.yapprotocol.dev";
const externalTreeUrl = process.env.YAP_TREE_URL;
const EMBEDDED_TREE_PORT = 18790 + Math.floor(Math.random() * 100);
let embeddedTree: TreeInstance | null = null;

function parseList(env: string | undefined): string[] {
  if (!env) return [];
  return env.split(",").map((s) => s.trim()).filter(Boolean);
}

const comfortZone: ComfortZone = {
  always_share: parseList(process.env.YAP_ALWAYS_SHARE) || ["timezone", "general_availability"],
  ask_first: parseList(process.env.YAP_ASK_FIRST) || ["dietary", "budget_range", "location_preference"],
  never_share: parseList(process.env.YAP_NEVER_SHARE) || ["health_info", "financial_details"],
};

// --- Shared state (initialized in main) ---

const buffer = new EventBuffer();
const consentPrompter = new McpConsentPrompter(buffer);
let agent: YapAgent;
let treeUrl: string;

// Stashed callbacks for async decisions
const decideFns = new Map<string, (decision: "confirm" | "decline", reason?: string) => void>();
const respondFns = new Map<string, (context: Record<string, unknown>) => void>();

// --- MCP Server ---

const server = new McpServer({
  name: "yap",
  version: "0.2.0",
});

// --- MCP Prompts (teach Claude how to use Yap) ---

server.prompt(
  "yap-agent",
  "System prompt that teaches Claude how to act as a Yap agent on behalf of the user",
  {},
  () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `You have access to the Yap protocol — an agent-to-agent coordination system. You can talk to other users' AI agents on behalf of your user.

## How it works
- You send "yaps" (structured context packets) to other agents via a relay server
- Other agents receive your yaps, process them, and respond
- You negotiate back and forth until you reach agreement
- The user only needs to approve the final result (one tap)

## Your workflow
1. When the user wants to coordinate something with someone, use send_yap to start a branch
2. Poll check_branch periodically to see responses from the other agent
3. If the other agent sends a chirp (context request), decide what to share using respond_to_chirp
4. When you have enough context from both sides, propose a landing (agreement)
5. If you receive a landing proposal, present it clearly to the user and confirm/decline

## Key principles
- Always ask the user before sharing sensitive info (ask_first fields trigger consent)
- Present proposals clearly — the user should understand what's being agreed
- Keep negotiating until both sides have what they need
- If something stalls, tell the user

## Your handle: ${handle}
## Connected to: ${treeUrl}
## Comfort zone: always_share=${comfortZone.always_share.join(",")}, ask_first=${comfortZone.ask_first.join(",")}, never_share=${comfortZone.never_share.join(",")}`,
      },
    }],
  }),
);

server.prompt(
  "coordinate",
  "Start coordinating something with another person's agent",
  {
    who: z.string().describe("The handle of the person to coordinate with (e.g. @bob)"),
    what: z.string().describe("What you want to coordinate (e.g. 'dinner on Friday')"),
  },
  ({ who, what }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `I want to coordinate with ${who}: ${what}

Use the Yap tools to make this happen. Start by sending a yap with the right context and needs, then handle the negotiation. Only ask me when you need my input or approval.`,
      },
    }],
  }),
);

// --- MCP Resources (expose branch state) ---

server.resource(
  "branches",
  "yap://branches",
  { description: "All active Yap negotiation threads" },
  async () => {
    const branches = agent.listBranches();
    const data = branches.map((b) => ({
      thread_id: b.thread_id,
      state: b.state,
      created_at: b.created_at,
      updated_at: b.updated_at,
      pending_events: buffer.pendingCount(b.thread_id),
    }));
    return {
      contents: [{
        uri: "yap://branches",
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      }],
    };
  },
);

// --- Tools ---

server.tool(
  "send_yap",
  `Send a yap to another agent to start or continue a negotiation. Use this when the user wants to coordinate, share, request, or negotiate anything with someone.

Examples:
- Schedule dinner: category "scheduling", context with dates/preferences, needs for their availability
- Send a briefing: category "briefing", context with the summary/report data, no needs
- Send an invoice: category "invoicing", context with line items/totals, needs for approval
- Request feedback: category "review", context with the document, needs for their comments`,
  {
    to: z.string().describe("Target agent handle (e.g. '@bob')"),
    intent: z.object({
      category: z.string().describe("What this is about: scheduling, briefing, invoicing, review, questionnaire, report, coordinating, sharing"),
      summary: z.string().describe("One-line description"),
      urgency: z.enum(["low", "medium", "high"]),
    }),
    context: z.record(z.string(), z.unknown()).describe("The context data to share — structure depends on the category"),
    needs: z.array(z.object({
      field: z.string().describe("What field you need from them"),
      reason: z.string().describe("Why — this is shown to the other agent's user"),
      priority: z.enum(["required", "helpful", "nice_to_have"]),
    })).describe("What you need from the other agent. Empty array for one-shot deliveries like briefings."),
  },
  async ({ to, intent, context, needs }) => {
    try {
      const threadId = await agent.startBranch(to, intent, context, needs as Need[]);
      return {
        content: [{ type: "text", text: JSON.stringify({ thread_id: threadId, status: "initiated", message: `Yap sent to ${to}. Use check_branch with this thread_id to poll for their response.` }, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "check_branch",
  `Poll for updates on a negotiation thread. Call this after sending a yap to see if the other agent has responded. Returns new events like: context_received (they shared data), chirp_received (they're asking for info), landing_proposed (they proposed an agreement), confirmed, declined, stalled.

Call without a thread_id to see all active branches at once.`,
  {
    thread_id: z.string().optional().describe("Thread ID to check. Omit to see all branches."),
  },
  async ({ thread_id }) => {
    if (!thread_id) {
      const branches = agent.listBranches();
      const summary = branches.map((b) => ({
        thread_id: b.thread_id,
        state: b.state,
        created_at: b.created_at,
        pending_events: buffer.pendingCount(b.thread_id),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ branches: summary, hint: summary.length === 0 ? "No active branches. Use send_yap to start one." : `${summary.length} branch(es). Check ones with pending_events > 0.` }, null, 2) }],
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
          hint: events.length === 0
            ? "No new events yet — the other agent hasn't responded. Try again in a moment."
            : `${events.length} new event(s). Process them and decide next steps.`,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  "respond_to_chirp",
  `Respond to a context request from another agent. When check_branch shows a chirp_received or consent_pending event, use this to share or decline the requested fields.

Always ask the user before sharing sensitive information. Present what's being asked and why.`,
  {
    thread_id: z.string().describe("Thread ID of the request"),
    responses: z.array(z.object({
      field: z.string(),
      approved: z.boolean().describe("true to share, false to decline"),
      value: z.unknown().optional().describe("The value to share (required if approved)"),
    })),
  },
  async ({ thread_id, responses }) => {
    const consentResults: ConsentResult[] = responses.map((r) => ({
      field: r.field,
      approved: r.approved,
      value: r.value,
    }));

    if (consentPrompter.resolveConsent(thread_id, consentResults)) {
      const shared = responses.filter((r) => r.approved).map((r) => r.field);
      const declined = responses.filter((r) => !r.approved).map((r) => r.field);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "sent", fields_shared: shared, fields_declined: declined }, null, 2),
        }],
      };
    }

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
      content: [{ type: "text", text: `No pending request for thread ${thread_id}. Use check_branch to see current state.` }],
      isError: true,
    };
  },
);

server.tool(
  "propose_landing",
  `Propose an agreement to the other agent. Use this when you have enough context from both sides to make a concrete proposal. The other agent's user will see this and confirm/decline.

Make proposals specific and actionable — include venue, time, cost, or whatever details are relevant.`,
  {
    thread_id: z.string().describe("Thread ID of the negotiation"),
    to: z.string().describe("Target agent handle"),
    proposal: z.object({
      summary: z.string().describe("One-line summary of the agreement (e.g. 'Dinner at The Botanist, Friday 19:00')"),
      details: z.record(z.string(), z.unknown()).describe("Structured details (venue, date, time, cost, etc.)"),
      alternatives: z.array(z.object({
        summary: z.string(),
        reason: z.string(),
      })).optional().describe("Alternative options if this doesn't work"),
      reasoning: z.string().optional().describe("Why you chose this option"),
    }),
  },
  async ({ thread_id, to, proposal }) => {
    agent.proposeLanding(thread_id, to, proposal as Proposal);
    return {
      content: [{ type: "text", text: JSON.stringify({ status: "proposed", thread_id, summary: proposal.summary, message: "Landing proposed. Use check_branch to see if they confirm or decline." }, null, 2) }],
    };
  },
);

server.tool(
  "confirm_landing",
  "Accept a proposed agreement. Call this after presenting the proposal to the user and getting their approval.",
  {
    thread_id: z.string().describe("Thread ID of the landing to confirm"),
  },
  async ({ thread_id }) => {
    const decide = decideFns.get(thread_id);
    if (!decide) {
      return {
        content: [{ type: "text", text: `No pending proposal for thread ${thread_id}` }],
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

server.tool(
  "decline_landing",
  "Reject a proposed agreement. Always include a reason so the other agent can adjust.",
  {
    thread_id: z.string().describe("Thread ID of the landing to decline"),
    reason: z.string().optional().describe("Why — e.g. 'scheduling_conflict', 'over_budget', 'wrong_venue'"),
  },
  async ({ thread_id, reason }) => {
    const decide = decideFns.get(thread_id);
    if (!decide) {
      return {
        content: [{ type: "text", text: `No pending proposal for thread ${thread_id}` }],
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

server.tool(
  "list_branches",
  "Show all active Yap negotiation threads. Quick way to see what's going on.",
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
      content: [{ type: "text", text: JSON.stringify({ branches: result, total: result.length }, null, 2) }],
    };
  },
);

server.tool(
  "set_comfort_zone",
  `Configure privacy preferences — which types of information are automatically shared, need approval, or are never shared.

Common fields: timezone, general_availability, dietary, budget_range, location_preference, health_info, financial_details`,
  {
    always_share: z.array(z.string()).optional().describe("Fields to share automatically"),
    ask_first: z.array(z.string()).optional().describe("Fields that need user approval"),
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

server.tool(
  "send_to_group",
  "Start a multi-party negotiation — send a yap to multiple agents at once. You act as coordinator.",
  {
    participants: z.array(z.string()).describe("Agent handles to include (e.g. ['@bob', '@charlie'])"),
    intent: z.object({
      category: z.string(),
      summary: z.string(),
      urgency: z.enum(["low", "medium", "high"]),
    }),
    context: z.record(z.string(), z.unknown()),
    needs: z.array(z.object({
      field: z.string(),
      reason: z.string(),
      priority: z.enum(["required", "helpful", "nice_to_have"]),
    })),
  },
  async ({ participants, intent, context, needs }) => {
    try {
      const threadId = await agent.startGroupBranch(participants, intent, context, needs as Need[]);
      return {
        content: [{ type: "text", text: JSON.stringify({ thread_id: threadId, status: "initiated", participants, message: `Group yap sent to ${participants.length} agents. Poll check_branch to see responses.` }, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

// Tool: manage_tree
server.tool(
  "yap_status",
  "Check the status of your Yap connection — your handle, tree URL, whether the tree is embedded or external, and connection state.",
  {},
  async () => {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          handle: `@${handle}`,
          tree_url: treeUrl,
          tree_mode: embeddedTree ? "embedded (auto-started)" : "external",
          connected: agent?.getHandle() ? true : false,
          comfort_zone: agent?.getComfortZone(),
        }, null, 2),
      }],
    };
  },
);

// --- Start ---

async function main() {
  // Tree connection strategy
  if (externalTreeUrl) {
    // 1. Explicit URL from env
    treeUrl = externalTreeUrl;
  } else {
    // 2. Try public tree, fall back to embedded
    try {
      const WebSocket = (await import("ws")).default;
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(PUBLIC_TREE_URL, { timeout: 3000 });
        ws.on("open", () => { ws.close(); resolve(); });
        ws.on("error", () => reject());
        setTimeout(() => reject(), 3000);
      });
      treeUrl = PUBLIC_TREE_URL;
    } catch {
      // 3. Public tree unavailable — start embedded
      embeddedTree = createTree(EMBEDDED_TREE_PORT);
      treeUrl = `ws://localhost:${EMBEDDED_TREE_PORT}`;
    }
  }

  agent = new YapAgent({
    handle,
    treeUrl,
    comfortZone,
    prompter: consentPrompter,
    platform: "claude-mcp",
    userData: {},
  });

  // Wire agent events
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
    buffer.push(err.thread_id ?? "global", "error", { code: err.code, message: err.message });
  });
  agent.onSchemaProposal((threadId, extension, reason, from) => {
    buffer.push(threadId, "context_received", { type: "schema_proposal", from, extension, reason });
  });
  agent.onSchemaConfirmed((threadId, schemaName, from) => {
    buffer.push(threadId, "context_received", { type: "schema_confirmed", from, schema_name: schemaName });
  });

  await agent.connect();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Yap MCP server failed to start:", err);
  process.exit(1);
});
