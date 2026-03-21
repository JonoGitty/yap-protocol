import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "project-lead",
    treeUrl: "ws://localhost:8789",
    comfortZone: { always_share: [], ask_first: [], never_share: [] },
    prompter: new AutoPrompter(),
  });

  await agent.connect();
  console.log("[Sender] Connected. Sending weekly briefing to @team-member...");

  agent.onContext((threadId, context) => {
    if (context.acknowledged) {
      console.log("[Sender] Briefing acknowledged!");
      if (context.questions) {
        console.log(`[Sender] Follow-up questions: ${JSON.stringify(context.questions)}`);
      }
      agent.disconnect();
      process.exit(0);
    }
  });

  await agent.sendOneShot("@team-member", {
    category: "briefing",
    summary: "Weekly project status update — Sprint 14",
    urgency: "low",
  }, {
    title: "Sprint 14 Status Update",
    period: "2026-03-16 to 2026-03-20",
    summary: "On track. Auth module completed, API migration 80% done.",
    key_points: [
      "Auth module shipped to staging — QA next week",
      "API migration blocked on legacy endpoint deprecation (ETA Wednesday)",
      "New hire (Sam) onboarding, pairing with Maria on frontend",
    ],
    action_items: [
      { owner: "@team-member", task: "Review auth module PR #142", due: "2026-03-24" },
      { owner: "@team-member", task: "Update client SDK docs for new endpoints", due: "2026-03-26" },
    ],
    risks: [
      { description: "Legacy endpoint owner unresponsive", severity: "medium", mitigation: "Escalate to VP Eng if no reply by Tuesday" },
    ],
    attachments_ref: ["https://internal.example.com/sprint-14-dashboard"],
  });

  console.log("[Sender] Briefing sent. Waiting for acknowledgment...");
}

main().catch(console.error);
