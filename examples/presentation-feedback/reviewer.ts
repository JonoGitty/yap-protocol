import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const userData = {
    feedback: [
      { slide: "Q1 Revenue", comment: "Add YoY comparison, not just MoM", severity: "important" },
      { slide: "Risks & Mitigations", comment: "Include timeline for legacy endpoint resolution", severity: "minor" },
      { slide: "Q2 Roadmap", comment: "Board will want budget implications for each initiative", severity: "important" },
    ],
    overall_verdict: "approve",
  };

  const agent = new YapAgent({
    handle: "reviewer",
    treeUrl: "ws://localhost:8789",
    comfortZone: {
      always_share: ["feedback", "overall_verdict"],
      ask_first: [],
      never_share: [],
    },
    prompter: new AutoPrompter(userData),
    userData,
  });

  await agent.connect();
  console.log("[Reviewer] Connected, waiting for presentations to review...");

  agent.onContext((threadId, context) => {
    if (context.outline) {
      console.log(`[Reviewer] Presentation received: ${context.title}`);
      console.log(`[Reviewer]   Duration: ${context.duration_minutes} min`);
      console.log(`[Reviewer]   Audience: ${context.target_audience}`);
      const outline = context.outline as { slide: string; notes: string }[];
      console.log(`[Reviewer]   Slides: ${outline.length}`);
      for (const s of outline) {
        console.log(`[Reviewer]     📊 ${s.slide} — ${s.notes}`);
      }

      const questions = context.questions_for_reviewer as string[];
      if (questions) {
        console.log("[Reviewer] Presenter asks:");
        for (const q of questions) console.log(`[Reviewer]   ? ${q}`);
      }

      // Feedback will be auto-shared via comfort zone + AutoPrompter
      console.log("[Reviewer] Sending feedback...");
    }
  });

  agent.onLanding((threadId, proposal, decide) => {
    console.log(`[Reviewer] Final version proposed: ${proposal.summary}`);
    console.log(`[Reviewer]   ${proposal.details.total_slides} slides, ${proposal.details.duration_minutes} min`);
    console.log("[Reviewer] Approving final deck.");
    decide("confirm");

    setTimeout(() => {
      agent.disconnect();
      process.exit(0);
    }, 1000);
  });
}

main().catch(console.error);
