import { YapAgent, AutoPrompter } from "../../packages/sdk/src/index.js";

async function main() {
  const userData = {
    preferred_name: "Sam",
    pronouns: "they/them",
    equipment_preference: "Mac",
    dietary_requirements: "vegetarian",
    emergency_contact: "Jordan Chen, +44 7700 900000",
    t_shirt_size: "M",
    fun_fact: "I once cycled from London to Paris in 24 hours",
  };

  const agent = new YapAgent({
    handle: "new-hire",
    treeUrl: "ws://localhost:8789",
    comfortZone: {
      always_share: ["preferred_name", "pronouns", "equipment_preference", "t_shirt_size", "fun_fact"],
      ask_first: ["dietary_requirements", "emergency_contact"],
      never_share: [],
    },
    prompter: new AutoPrompter(userData),
    userData,
  });

  await agent.connect();
  console.log("[New Hire] Connected as @new-hire, waiting for questionnaires...");

  agent.onContext((threadId, context) => {
    if (context.questionnaire_title) {
      console.log(`[New Hire] Received: ${context.questionnaire_title}`);
      console.log(`[New Hire] ${context.instructions}`);
    }
  });

  agent.onError((err) => {
    console.error(`[New Hire] Error: ${err.message}`);
  });

  // Agent will auto-respond to needs via comfort zone + AutoPrompter
  // always_share fields are sent automatically
  // ask_first fields are auto-approved by AutoPrompter (has the data)
  // After responding, we wait briefly then exit
  setTimeout(() => {
    console.log("[New Hire] All responses sent.");
    agent.disconnect();
    process.exit(0);
  }, 5000);
}

main().catch(console.error);
