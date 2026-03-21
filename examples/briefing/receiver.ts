import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "team-member",
    treeUrl: "ws://localhost:8789",
    comfortZone: { always_share: [], ask_first: [], never_share: [] },
    prompter: new AutoPrompter(),
  });

  await agent.connect();
  console.log("[Receiver] Connected as @team-member, waiting for briefings...");

  agent.onContext((threadId, context) => {
    if (context.title) {
      console.log(`[Receiver] Briefing received: ${context.title}`);
      console.log(`[Receiver]   Period: ${context.period}`);
      console.log(`[Receiver]   Summary: ${context.summary}`);

      const points = context.key_points as string[] ?? [];
      for (const point of points) {
        console.log(`[Receiver]   • ${point}`);
      }

      const actions = context.action_items as { owner: string; task: string; due: string }[] ?? [];
      console.log("[Receiver]   My action items:");
      for (const item of actions) {
        console.log(`[Receiver]     → ${item.task} (due ${item.due})`);
      }

      // Acknowledge with optional questions
      console.log("[Receiver] Acknowledging...");
      agent.sendOneShot("@project-lead", {
        category: "briefing",
        summary: "Acknowledgment of Sprint 14 update",
        urgency: "low",
      }, {
        acknowledged: true,
        questions: ["Is the legacy endpoint owner in the #platform channel?"],
      });

      setTimeout(() => {
        agent.disconnect();
        process.exit(0);
      }, 1000);
    }
  });
}

main().catch(console.error);
