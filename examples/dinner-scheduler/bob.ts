import readline from "node:readline";
import {
  YapAgent,
  TerminalPrompter,
  AutoPrompter,
  type Proposal,
} from "../../packages/sdk/src/index.js";

function log(msg: string) {
  console.log(`\n🐤 [Bob] ${msg}`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const isInteractive = process.stdin.isTTY;
  const userData: Record<string, unknown> = {
    timezone: "Europe/London",
    time_windows: ["18:30-21:00"],
    general_availability: { friday: ["18:30-21:00"] },
    dietary: "none",
    location_preference: "within 20 min drive of Reading centre",
  };

  const agent = new YapAgent({
    handle: "bob",
    treeUrl: "ws://localhost:8789",
    comfortZone: {
      always_share: ["timezone", "general_availability", "time_windows"],
      ask_first: ["dietary", "location_preference", "budget_range", "transport_mode"],
      never_share: ["health_info", "financial_details", "work_schedule_internals"],
    },
    prompter: isInteractive ? new TerminalPrompter() : new AutoPrompter(userData),
    userData,
  });

  log("Connecting to tree...");
  await agent.connect();
  log("Connected as @bob, waiting for yaps...");

  // When Alice's initial context arrives, log it
  agent.onContext((threadId, context) => {
    if (Object.keys(context).length > 0) {
      log("Incoming context:");
      for (const [key, value] of Object.entries(context)) {
        log(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
  });

  // When a landing proposal arrives, show it and ask for confirmation
  agent.onLanding(async (threadId, proposal, decide) => {
    log("═══════════════════════════════════════");
    log("  LANDING PROPOSAL");
    log("═══════════════════════════════════════");
    log(`  ${proposal.summary}`);

    const d = proposal.details;
    log(`  Venue: ${d.venue} (${d.venue_type})`);
    log(`  Address: ${d.address}`);
    log(`  Date: ${d.date}`);
    log(`  Time: ${d.time}`);
    log(`  Party size: ${d.party_size}`);
    log(`  Est. cost: ${d.estimated_cost}`);

    if (proposal.alternatives && proposal.alternatives.length > 0) {
      log("  Alternatives:");
      for (const alt of proposal.alternatives) {
        log(`    - ${alt.summary} (${alt.reason})`);
      }
    }

    if (proposal.reasoning) {
      log(`  Reasoning: ${proposal.reasoning}`);
    }

    log("═══════════════════════════════════════");

    const answer = isInteractive
      ? await prompt("\n  [1] Confirm  [2] Decline  > ")
      : "1"; // auto-confirm in non-interactive mode

    if (answer === "1") {
      decide("confirm");
      log("Confirmed! Dinner sorted! 🍽️");
      log("Branch completed ✅");
    } else {
      decide("decline", "scheduling_conflict");
      log("Declined.");
      log("Branch declined ❌");
    }

    agent.disconnect();
    process.exit(0);
  });

  agent.onStalled((threadId) => {
    log(`Thread ${threadId} stalled — no response in time`);
    agent.disconnect();
    process.exit(1);
  });

  agent.onError((err) => {
    log(`Error: ${err.message}`);
  });
}

main().catch((err) => {
  console.error("Bob failed to start:", err.message);
  process.exit(1);
});
