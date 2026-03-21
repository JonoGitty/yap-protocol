import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const agent = new YapAgent({
    handle: "hr-agent",
    treeUrl: "ws://localhost:8789",
    comfortZone: { always_share: [], ask_first: [], never_share: [] },
    prompter: new AutoPrompter(),
  });

  await agent.connect();
  console.log("[HR] Connected. Sending onboarding questionnaire to @new-hire...");

  agent.onContext((threadId, context) => {
    console.log("[HR] Responses received:");
    for (const [field, value] of Object.entries(context)) {
      console.log(`[HR]   ${field}: ${JSON.stringify(value)}`);
    }
    console.log("[HR] Questionnaire complete!");
    agent.disconnect();
    process.exit(0);
  });

  // Use needs as structured questions — each need is a question
  const threadId = await agent.startBranch("@new-hire", {
    category: "questionnaire",
    summary: "New hire onboarding questionnaire",
    urgency: "low",
  }, {
    questionnaire_title: "Welcome to Acme Corp — Onboarding Info",
    instructions: "Please provide the following information for your onboarding setup.",
  }, [
    { field: "preferred_name", reason: "What should we call you day-to-day?", priority: "required" },
    { field: "pronouns", reason: "For your profile and email signature", priority: "helpful" },
    { field: "equipment_preference", reason: "Mac or Windows laptop?", priority: "required" },
    { field: "dietary_requirements", reason: "For team lunches and events", priority: "helpful" },
    { field: "emergency_contact", reason: "Required for HR records", priority: "required" },
    { field: "t_shirt_size", reason: "For your welcome swag pack", priority: "nice_to_have" },
    { field: "fun_fact", reason: "For your intro in the team Slack channel", priority: "nice_to_have" },
  ]);

  console.log(`[HR] Questionnaire sent (thread: ${threadId}). Waiting for responses...`);
}

main().catch(console.error);
