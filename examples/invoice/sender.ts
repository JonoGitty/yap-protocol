import { YapAgent, AutoPrompter, type Proposal } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "freelancer",
    treeUrl: "ws://localhost:8789",
    comfortZone: { always_share: [], ask_first: [], never_share: [] },
    prompter: new AutoPrompter(),
  });

  await agent.connect();
  console.log("[Freelancer] Connected. Sending invoice to @client-co...");

  // Send invoice as context, then propose payment as a landing
  agent.onContext((threadId, context) => {
    if (context.status === "reviewed") {
      console.log("[Freelancer] Client reviewed invoice.");
      if (context.requested_changes) {
        console.log(`[Freelancer] Changes requested: ${JSON.stringify(context.requested_changes)}`);
      } else {
        // Propose payment terms as a landing
        const proposal: Proposal = {
          summary: "Payment of £2,400 via bank transfer by 2026-04-15",
          details: {
            amount: 2400,
            currency: "GBP",
            method: "bank_transfer",
            due_date: "2026-04-15",
            reference: "INV-2026-042",
          },
          alternatives: [
            { summary: "PayPal payment", reason: "Faster processing, 2.9% fee applies" },
          ],
        };
        console.log("[Freelancer] Proposing payment terms...");
        agent.proposeLanding(threadId, "@client-co", proposal);
      }
    }
  });

  agent.onConfirmed(() => {
    console.log("[Freelancer] Payment terms confirmed! Invoice complete.");
    agent.disconnect();
    process.exit(0);
  });

  agent.onDeclined((_, reason) => {
    console.log(`[Freelancer] Payment declined: ${reason ?? "no reason"}`);
    agent.disconnect();
    process.exit(0);
  });

  const threadId = await agent.startBranch("@client-co", {
    category: "invoicing",
    summary: "Invoice INV-2026-042 for March consulting work",
    urgency: "medium",
  }, {
    invoice_id: "INV-2026-042",
    date: "2026-03-21",
    from: { name: "Jane Smith Consulting", vat: "GB123456789" },
    to: { name: "ClientCo Ltd", attention: "Accounts Payable" },
    line_items: [
      { description: "Strategy consulting — 3 days @ £600/day", quantity: 3, unit_price: 600, total: 1800 },
      { description: "Workshop facilitation — 1 day", quantity: 1, unit_price: 600, total: 600 },
    ],
    subtotal: 2400,
    vat_rate: 0,
    total: 2400,
    currency: "GBP",
    payment_terms: "Net 30",
    notes: "Thank you for your business!",
  }, [
    { field: "approval_status", reason: "Need confirmation invoice is correct", priority: "required" },
  ]);

  console.log(`[Freelancer] Invoice sent (thread: ${threadId}). Waiting for review...`);
}

main().catch(console.error);
