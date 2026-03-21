import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "analytics-bot",
    treeUrl: "ws://localhost:8789",
    comfortZone: { always_share: [], ask_first: [], never_share: [] },
    prompter: new AutoPrompter(),
  });

  await agent.connect();
  console.log("[Analytics] Connected. Sending weekly metrics report to @ceo...");

  agent.onContext((threadId, context) => {
    if (context.drill_down_request) {
      console.log(`[Analytics] CEO requested drill-down: ${context.drill_down_request}`);
      // Send follow-up detail
      agent.sendOneShot("@ceo", {
        category: "report",
        summary: "Drill-down: Churn by cohort",
        urgency: "low",
      }, {
        drill_down_for: context.drill_down_request,
        data: {
          "Jan 2026 cohort": { churn_rate: "2.1%", top_reason: "pricing" },
          "Feb 2026 cohort": { churn_rate: "3.8%", top_reason: "missing_feature" },
          "Mar 2026 cohort": { churn_rate: "1.2%", top_reason: "competitor" },
        },
        insight: "Feb cohort spiked due to the pricing tier change. Mar cohort stabilised after rollback.",
      });
      console.log("[Analytics] Drill-down sent.");
      setTimeout(() => { agent.disconnect(); process.exit(0); }, 1000);
    }
  });

  await agent.sendOneShot("@ceo", {
    category: "report",
    summary: "Weekly metrics report — w/c 2026-03-16",
    urgency: "low",
  }, {
    report_type: "weekly_metrics",
    period: { start: "2026-03-16", end: "2026-03-22" },
    metrics: {
      revenue: { value: 142300, currency: "USD", change: "+8.2%", trend: "up" },
      active_users: { value: 23450, change: "+3.1%", trend: "up" },
      churn_rate: { value: "2.3%", change: "-0.4%", trend: "down" },
      nps: { value: 72, change: "+5", trend: "up" },
      support_tickets: { value: 89, change: "-12%", trend: "down" },
    },
    highlights: [
      "Revenue crossed $140k for the first time",
      "NPS highest since product launch",
      "Support tickets down — new FAQ bot working",
    ],
    anomalies: [
      { metric: "churn_rate", note: "Feb cohort still elevated, investigating" },
    ],
    dashboard_url: "https://internal.example.com/weekly-dash",
  });

  console.log("[Analytics] Report sent. Waiting for follow-up requests...");
}

main().catch(console.error);
