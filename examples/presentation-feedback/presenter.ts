import { YapAgent, AutoPrompter, type Proposal } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "presenter",
    treeUrl: "ws://localhost:8789",
    comfortZone: { always_share: [], ask_first: [], never_share: [] },
    prompter: new AutoPrompter(),
  });

  await agent.connect();
  console.log("[Presenter] Connected. Sharing presentation outline with @reviewer...");

  agent.onContext((threadId, context) => {
    if (context.feedback) {
      console.log("[Presenter] Feedback received:");
      const feedback = context.feedback as { slide: string; comment: string; severity: string }[];
      for (const fb of feedback) {
        console.log(`[Presenter]   [${fb.severity}] Slide "${fb.slide}": ${fb.comment}`);
      }

      if (context.overall_verdict === "approve") {
        console.log("[Presenter] Reviewer approves! Proposing final version...");
        agent.proposeLanding(threadId, "@reviewer", {
          summary: "Final presentation deck — Q1 board review",
          details: {
            title: "Q1 2026 Board Review",
            total_slides: 12,
            duration_minutes: 30,
            format: "Google Slides",
            link: "https://docs.example.com/q1-board-deck",
          },
          reasoning: "Incorporated all reviewer feedback. Ready for board.",
        });
      }
    }
  });

  agent.onConfirmed(() => {
    console.log("[Presenter] Presentation approved! Ready for the board meeting.");
    agent.disconnect();
    process.exit(0);
  });

  const threadId = await agent.startBranch("@reviewer", {
    category: "review",
    summary: "Q1 board presentation — requesting feedback on outline",
    urgency: "medium",
  }, {
    title: "Q1 2026 Board Review",
    format: "presentation",
    target_audience: "Board of directors",
    duration_minutes: 30,
    outline: [
      { slide: "Title & Agenda", notes: "Standard opener" },
      { slide: "Q1 Revenue", notes: "Show MRR growth chart, highlight $140k milestone" },
      { slide: "User Growth", notes: "DAU/MAU trends, cohort retention" },
      { slide: "Product Updates", notes: "Auth module, API migration, new FAQ bot" },
      { slide: "Team & Hiring", notes: "New hire Sam, open roles" },
      { slide: "Risks & Mitigations", notes: "Legacy endpoint, Feb cohort churn" },
      { slide: "Q2 Roadmap", notes: "3 key initiatives" },
      { slide: "Ask / Discussion", notes: "Open floor" },
    ],
    questions_for_reviewer: [
      "Is the revenue slide order right, or should product updates come first?",
      "Should we include competitor analysis?",
    ],
  }, [
    { field: "feedback", reason: "Need your comments on the outline", priority: "required" },
    { field: "overall_verdict", reason: "Approve or request changes", priority: "required" },
  ]);

  console.log(`[Presenter] Outline sent (thread: ${threadId}). Waiting for feedback...`);
}

main().catch(console.error);
