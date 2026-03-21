import WebSocket from "ws";
import readline from "node:readline";
import {
  createContextResponse,
  createConfirmation,
  createDecline,
  type YapPacket,
} from "../../packages/sdk/src/index.js";

const TREE_URL = "ws://localhost:8789";
const HANDLE = "bob";

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
  log("Connected as @bob, waiting for yaps...");

  ws.on("message", async (data) => {
    const packet = JSON.parse(data.toString()) as YapPacket;

    if (packet.type === "context") {
      // Received a context yap — show what Alice is proposing
      log(`Incoming yap from ${packet.from}!`);
      log(`  Intent: ${packet.intent?.summary}`);
      log(`  Category: ${packet.intent?.category}`);

      const ctx = packet.context ?? {};
      log(`  Proposed date: ${ctx.proposed_date}`);
      log(`  Time windows: ${JSON.stringify(ctx.time_windows)}`);
      log(`  Location: ${ctx.location_preference}`);
      log(`  Dietary: ${JSON.stringify(ctx.dietary)}`);
      log(`  Budget: ${ctx.budget_range}`);
      log(`  Party size: ${ctx.party_size}`);

      if (packet.needs && packet.needs.length > 0) {
        log("  Needs from me:");
        for (const need of packet.needs) {
          log(`    - ${need.field} (${need.priority}): ${need.reason}`);
        }
      }

      // Respond with Bob's context (hardcoded for Phase 1)
      log("Responding with my context...");
      const response = createContextResponse(
        packet.thread_id,
        "@bob",
        "@alice",
        {
          time_windows: ["18:30-21:00"],
          dietary: ["none"],
          location_preference: "anywhere within 20 min drive of Reading centre",
        },
      );

      ws.send(JSON.stringify(response));
      log("Sent context response → @alice");
      log("  Time windows: 18:30-21:00");
      log("  Dietary: none");
      log("  Location: within 20 min drive of Reading");
      log("Waiting for landing proposal...");
    }

    if (packet.type === "resolution") {
      // Alice proposed a landing — show it and ask for confirmation
      const proposal = packet.proposal;
      if (!proposal) return;

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

      const answer = await prompt(
        "\n  [1] Confirm  [2] Decline  > ",
      );

      if (answer === "1") {
        const confirmation = createConfirmation(
          packet.thread_id,
          "@bob",
          "@alice",
        );
        ws.send(JSON.stringify(confirmation));
        log("Confirmed! Dinner sorted! 🍽️");
        log("Branch completed ✅");
      } else {
        const decline = createDecline(
          packet.thread_id,
          "@bob",
          "@alice",
          "scheduling_conflict",
        );
        ws.send(JSON.stringify(decline));
        log("Declined.");
        log("Branch declined ❌");
      }

      ws.close();
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error("Bob failed to start:", err.message);
  process.exit(1);
});
