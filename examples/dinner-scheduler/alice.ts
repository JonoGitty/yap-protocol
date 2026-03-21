import {
  YapAgent,
  TerminalPrompter,
  type Proposal,
} from "../../packages/sdk/src/index.js";

function log(msg: string) {
  console.log(`\n🐦 [Alice] ${msg}`);
}

async function main() {
  const agent = new YapAgent({
    handle: "alice",
    treeUrl: "ws://localhost:8789",
    comfortZone: {
      always_share: ["timezone", "general_availability", "event_preferences"],
      ask_first: ["dietary", "budget_range", "specific_location", "transport_mode"],
      never_share: ["health_info", "financial_details"],
    },
    prompter: new TerminalPrompter(),
    userData: {
      timezone: "Europe/London",
      dietary: "vegetarian",
      budget_range: "GBP 20-40pp",
      general_availability: { friday: ["18:00-21:00"] },
    },
  });

  log("Connecting to tree...");
  await agent.connect();
  log("Connected!");

  // When Bob sends his context back, propose a landing
  agent.onContext((threadId, context) => {
    log("Received context from Bob!");
    log(`  Time windows: ${JSON.stringify(context.time_windows)}`);
    log(`  Dietary: ${JSON.stringify(context.dietary)}`);
    log(`  Location: ${context.location_preference}`);

    // Evaluate and propose (hardcoded logic for Phase 2 demo)
    const proposal: Proposal = {
      summary: "Dinner at The Botanist, Friday 27 March, 19:00",
      details: {
        venue: "The Botanist",
        venue_type: "Bar & restaurant",
        address: "1-5 King Street, Reading RG1 2HB",
        date: "2026-03-27",
        time: "19:00",
        party_size: 2,
        estimated_cost: "£25-35pp",
        booking_required: true,
      },
      alternatives: [
        {
          summary: "Tutto Bene, same time",
          reason: "Italian, slightly cosier, strong veggie menu",
        },
        {
          summary: "Friday 19:30 instead of 19:00",
          reason: "More availability at preferred venue",
        },
      ],
      reasoning:
        "Selected based on: both available 18:30-21:00, vegetarian-friendly, central Reading, within budget",
    };

    log("Proposing landing → @bob");
    log(`  ${proposal.summary}`);
    agent.proposeLanding(threadId, "@bob", proposal);
    log("Waiting for Bob's confirmation...");
  });

  agent.onConfirmed((threadId) => {
    log("Bob confirmed! Dinner sorted! 🍽️");
    log("Branch completed ✅");
    agent.disconnect();
    process.exit(0);
  });

  agent.onDeclined((threadId, reason) => {
    log(`Bob declined (reason: ${reason ?? "none given"}) 😢`);
    log("Branch declined ❌");
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

  // Start the branch
  log("Sending dinner request to @bob...");
  const threadId = await agent.startBranch(
    "@bob",
    {
      category: "scheduling",
      summary: "Coordinate dinner on Friday",
      urgency: "low",
    },
    {
      event_type: "dinner",
      proposed_date: "2026-03-27",
      time_windows: ["18:00-21:00"],
      location_preference: "central Reading",
      party_size: 2,
    },
    [
      {
        field: "time_windows",
        reason: "Need your availability to find overlap",
        priority: "required",
      },
      {
        field: "dietary",
        reason: "Need dietary requirements for restaurant selection",
        priority: "helpful",
      },
      {
        field: "location_preference",
        reason: "Preferred area or max travel distance",
        priority: "nice_to_have",
      },
    ],
  );

  log(`Branch started (thread: ${threadId})`);
  log("Waiting for Bob's response...");
}

main().catch((err) => {
  console.error("Alice failed to start:", err.message);
  process.exit(1);
});
