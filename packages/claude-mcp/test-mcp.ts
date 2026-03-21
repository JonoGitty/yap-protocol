/**
 * In-process test of the MCP server components.
 * Starts a tree, creates a counterpart agent (Bob), and exercises the MCP tools
 * by directly calling the event buffer and agent methods.
 */
import { createTree } from "../tree/src/index.js";
import {
  YapAgent,
  AutoPrompter,
  type Proposal,
  type Need,
  type ComfortZone,
  type ConsentResult,
} from "../sdk/src/index.js";
import { EventBuffer } from "./src/event-buffer.js";
import { McpConsentPrompter } from "./src/mcp-consent.js";

const PORT = 18789; // Use non-default port to avoid conflicts

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== MCP Server Component Test ===\n");

  // 1. Start tree
  const tree = createTree(PORT);
  console.log(`✅ Tree started on port ${PORT}`);

  // 2. Create the MCP agent (simulates what the MCP server does)
  const buffer = new EventBuffer();
  const consentPrompter = new McpConsentPrompter(buffer);

  const mcpAgent = new YapAgent({
    handle: "claude-user",
    treeUrl: `ws://localhost:${PORT}`,
    comfortZone: {
      always_share: ["timezone", "general_availability"],
      ask_first: ["dietary", "budget_range"],
      never_share: ["health_info"],
    },
    prompter: consentPrompter,
  });

  // Stash callbacks like the real MCP server does
  const decideFns = new Map<string, (d: "confirm" | "decline", r?: string) => void>();

  mcpAgent.onContext((threadId, context) => {
    buffer.push(threadId, "context_received", { context });
  });

  mcpAgent.onLanding((threadId, proposal, decide) => {
    buffer.push(threadId, "landing_proposed", { proposal });
    decideFns.set(threadId, decide);
  });

  mcpAgent.onConfirmed((threadId) => {
    buffer.push(threadId, "confirmed", {});
  });

  mcpAgent.onDeclined((threadId, reason) => {
    buffer.push(threadId, "declined", { reason });
  });

  mcpAgent.onError((err) => {
    console.error(`  Error: ${err.message}`);
  });

  await mcpAgent.connect();
  console.log("✅ MCP agent connected");

  // 3. Create counterpart (Bob)
  const bobData = {
    timezone: "Europe/London",
    time_windows: ["18:30-21:00"],
    dietary: "none",
    location_preference: "central Reading",
  };

  const bob = new YapAgent({
    handle: "bob",
    treeUrl: `ws://localhost:${PORT}`,
    comfortZone: {
      always_share: ["timezone", "time_windows"],
      ask_first: ["dietary", "location_preference"],
      never_share: ["health_info"],
    },
    prompter: new AutoPrompter(bobData),
    userData: bobData,
  });

  let bobReceivedContext = false;
  bob.onContext((threadId, context) => {
    bobReceivedContext = true;
    console.log("  Bob received context from MCP agent");
  });

  bob.onLanding((threadId, proposal, decide) => {
    console.log(`  Bob received landing: ${proposal.summary}`);
    decide("confirm");
    console.log("  Bob confirmed");
  });

  await bob.connect();
  console.log("✅ Bob connected\n");

  // 4. Test: send_yap (simulate tool call)
  console.log("--- Test: send_yap ---");
  const threadId = await mcpAgent.startBranch(
    "@bob",
    { category: "scheduling", summary: "Dinner on Friday", urgency: "low" },
    { event_type: "dinner", proposed_date: "2026-03-27" },
    [
      { field: "time_windows", reason: "Need your availability", priority: "required" },
      { field: "dietary", reason: "Need dietary info", priority: "helpful" },
    ],
  );
  console.log(`  Thread started: ${threadId}`);

  // Wait for Bob to process and respond
  await sleep(1000);

  // 5. Test: check_branch (simulate tool call)
  console.log("\n--- Test: check_branch ---");
  const events = buffer.consume(threadId);
  console.log(`  Pending events: ${events.length}`);
  for (const e of events) {
    console.log(`    ${e.type}: ${JSON.stringify(e.data).slice(0, 100)}`);
  }

  // 6. Test: propose landing and get confirmation
  console.log("\n--- Test: propose landing → confirm ---");
  const proposal: Proposal = {
    summary: "Dinner at The Botanist, Friday 19:00",
    details: { venue: "The Botanist", date: "2026-03-27", time: "19:00" },
  };
  mcpAgent.proposeLanding(threadId, "@bob", proposal);

  await sleep(1000);

  const events2 = buffer.consume(threadId);
  console.log(`  Events after landing: ${events2.length}`);
  for (const e of events2) {
    console.log(`    ${e.type}: ${JSON.stringify(e.data).slice(0, 100)}`);
  }

  // 7. Test: list_branches
  console.log("\n--- Test: list_branches ---");
  const branches = mcpAgent.listBranches();
  console.log(`  Active branches: ${branches.length}`);
  for (const b of branches) {
    console.log(`    ${b.thread_id} — ${b.state}`);
  }

  // 8. Test: set_comfort_zone
  console.log("\n--- Test: set_comfort_zone ---");
  mcpAgent.setComfortZone({
    always_share: ["timezone"],
    ask_first: ["dietary"],
    never_share: ["health_info", "financial_details"],
  });
  const zone = mcpAgent.getComfortZone();
  console.log(`  Updated comfort zone: ${JSON.stringify(zone)}`);

  // Verify
  console.log("\n=== Results ===");
  const confirmed = events2.some((e) => e.type === "confirmed");
  console.log(`  Bob received context: ${bobReceivedContext ? "✅" : "❌"}`);
  console.log(`  Landing confirmed: ${confirmed ? "✅" : "❌"}`);
  console.log(`  Branches tracked: ${branches.length > 0 ? "✅" : "❌"}`);
  console.log(`  Comfort zone updated: ${zone.never_share.includes("financial_details") ? "✅" : "❌"}`);

  const allPassed = bobReceivedContext && confirmed && branches.length > 0 && zone.never_share.includes("financial_details");
  console.log(`\n${allPassed ? "✅ All tests passed!" : "❌ Some tests failed!"}`);

  // Cleanup
  bob.disconnect();
  mcpAgent.disconnect();
  await tree.close();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
