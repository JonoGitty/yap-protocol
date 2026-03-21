import WebSocket from "ws";
import {
  createYap,
  createLanding,
  generateId,
  type YapPacket,
  type Proposal,
} from "../../packages/sdk/src/index.js";

const TREE_URL = "ws://localhost:8789";
const HANDLE = "alice";

const threadId = generateId("thr");

function log(msg: string) {
  console.log(`\n🐦 [Alice] ${msg}`);
}

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${TREE_URL}?handle=${HANDLE}`);
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

async function main() {
  log("Connecting to tree...");
  const ws = await connect();
  log("Connected! Sending dinner request to @bob...");

  // Step 1: Send initial context yap to Bob
  const yap = createYap({
    thread_id: threadId,
    from: "@alice",
    to: "@bob",
    type: "context",
    intent: {
      category: "scheduling",
      summary: "Coordinate dinner on Friday",
      urgency: "low",
    },
    context: {
      event_type: "dinner",
      proposed_date: "2026-03-27",
      time_windows: ["18:00-21:00"],
      location_preference: "central Reading",
      party_size: 2,
      dietary: ["vegetarian"],
      budget_range: "£20-40pp",
      flexibility: {
        date: "somewhat_flexible",
        time: "flexible",
        location: "flexible",
      },
    },
    needs: [
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
    permissions: {
      shared_fields: [
        "proposed_date",
        "time_windows",
        "event_type",
        "party_size",
        "dietary",
        "location_preference",
        "budget_range",
      ],
      withheld_fields: [],
      consent_level: "user_preauthorised",
    },
  });

  ws.send(JSON.stringify(yap));
  log(`Sent yap → @bob (thread: ${threadId})`);
  log(`  Intent: ${yap.intent?.summary}`);
  log(`  Context: available 18:00-21:00, vegetarian, central Reading`);
  log(`  Needs: time_windows, dietary, location_preference`);
  log("Waiting for Bob's response...");

  // Step 2: Listen for responses
  ws.on("message", (data) => {
    const packet = JSON.parse(data.toString()) as YapPacket;

    if (packet.type === "context_response") {
      // Bob sent his context — evaluate and propose a landing
      log("Received Bob's context!");
      const ctx = packet.context_provided ?? {};
      log(`  Time windows: ${JSON.stringify(ctx.time_windows)}`);
      log(`  Dietary: ${JSON.stringify(ctx.dietary)}`);
      log(`  Location: ${ctx.location_preference}`);

      // Find overlap (hardcoded logic for Phase 1)
      const aliceWindows = ["18:00-21:00"];
      const bobWindows = ctx.time_windows as string[] ?? [];
      log(`  Evaluating overlap: Alice ${aliceWindows} vs Bob ${bobWindows}`);

      // Propose a landing
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

      const landing = createLanding(threadId, "@alice", "@bob", proposal);
      ws.send(JSON.stringify(landing));

      log("Proposed landing → @bob");
      log(`  ${proposal.summary}`);
      log("Waiting for Bob's confirmation...");
    }

    if (packet.type === "resolution_response") {
      if (packet.status === "confirmed") {
        log("Bob confirmed! Dinner sorted! 🍽️");
        log("Branch completed ✅");
      } else {
        log(`Bob declined (reason: ${packet.reason_class ?? "none given"}) 😢`);
        log("Branch declined ❌");
      }
      ws.close();
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error("Alice failed to start:", err.message);
  process.exit(1);
});
