import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "ceo",
    treeUrl: "ws://localhost:8789",
    comfortZone: { always_share: [], ask_first: [], never_share: [] },
    prompter: new AutoPrompter(),
  });

  await agent.connect();
  console.log("[CEO] Connected, waiting for reports...");

  let reportCount = 0;

  agent.onContext((threadId, context) => {
    reportCount++;

    if (context.report_type === "weekly_metrics") {
      console.log(`[CEO] Report received: ${context.report_type}`);
      const metrics = context.metrics as Record<string, { value: unknown; change: string; trend: string }>;
      for (const [name, m] of Object.entries(metrics)) {
        console.log(`[CEO]   ${name}: ${m.value} (${m.change} ${m.trend})`);
      }

      const highlights = context.highlights as string[];
      console.log("[CEO] Highlights:");
      for (const h of highlights) console.log(`[CEO]   ★ ${h}`);

      const anomalies = context.anomalies as { metric: string; note: string }[];
      if (anomalies?.length) {
        console.log("[CEO] Anomalies:");
        for (const a of anomalies) console.log(`[CEO]   ⚠ ${a.metric}: ${a.note}`);

        // Request drill-down on the anomaly
        console.log("[CEO] Requesting churn drill-down...");
        agent.sendOneShot("@analytics-bot", {
          category: "report",
          summary: "Drill-down request",
          urgency: "low",
        }, {
          drill_down_request: "churn_rate_by_cohort",
        });
      }
    }

    if (context.drill_down_for) {
      console.log(`[CEO] Drill-down received: ${context.drill_down_for}`);
      const data = context.data as Record<string, { churn_rate: string; top_reason: string }>;
      for (const [cohort, d] of Object.entries(data)) {
        console.log(`[CEO]   ${cohort}: ${d.churn_rate} (reason: ${d.top_reason})`);
      }
      console.log(`[CEO] Insight: ${context.insight}`);
      agent.disconnect();
      process.exit(0);
    }
  });
}

main().catch(console.error);
