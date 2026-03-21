import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "client-co",
    treeUrl: "ws://localhost:8789",
    comfortZone: {
      always_share: ["approval_status"],
      ask_first: [],
      never_share: [],
    },
    prompter: new AutoPrompter(),
    userData: { approval_status: "approved" },
  });

  await agent.connect();
  console.log("[ClientCo] Connected, waiting for invoices...");

  agent.onContext((threadId, context) => {
    if (context.invoice_id) {
      console.log(`[ClientCo] Invoice received: ${context.invoice_id}`);
      console.log(`[ClientCo]   From: ${(context.from as { name: string }).name}`);
      const items = context.line_items as { description: string; total: number }[];
      for (const item of items) {
        console.log(`[ClientCo]   • ${item.description} — £${item.total}`);
      }
      console.log(`[ClientCo]   Total: £${context.total} ${context.currency}`);
      console.log(`[ClientCo]   Terms: ${context.payment_terms}`);

      // Send review status back
      console.log("[ClientCo] Invoice looks correct. Sending approval...");
      agent.sendOneShot("@freelancer", {
        category: "invoicing",
        summary: "Invoice review response",
        urgency: "medium",
      }, {
        status: "reviewed",
        invoice_id: context.invoice_id,
        approved: true,
      });
    }
  });

  agent.onLanding((threadId, proposal, decide) => {
    console.log(`[ClientCo] Payment proposal: ${proposal.summary}`);
    const d = proposal.details;
    console.log(`[ClientCo]   Amount: £${d.amount} via ${d.method}`);
    console.log(`[ClientCo]   Due: ${d.due_date}`);
    console.log("[ClientCo] Confirming payment terms...");
    decide("confirm");

    setTimeout(() => {
      agent.disconnect();
      process.exit(0);
    }, 1000);
  });
}

main().catch(console.error);
