import {
  YapAgent,
  type AgentConfig,
  type ComfortZone,
  type Proposal,
  type Need,
} from "../../sdk/src/index.js";
import { MessagingPrompter } from "./messaging-prompter.js";
import { parseCommand, type ParsedCommand } from "./command-parser.js";

export { parseCommand, type ParsedCommand } from "./command-parser.js";
export { MessagingPrompter } from "./messaging-prompter.js";

type SendMessage = (text: string) => void;

export interface YapSkillConfig {
  handle: string;
  treeUrl: string;
  comfortZone: ComfortZone;
  userData?: Record<string, unknown>;
  authToken?: string;
  contactsPath?: string;
  keystorePath?: string;
  keystorePassphrase?: string;
  blocklistPath?: string;
}

/**
 * OpenClaw skill for Yap. Wraps YapAgent for messaging-based interaction.
 *
 * Usage:
 *   const skill = new YapSkill(config);
 *   await skill.init(sendMessage);
 *   skill.handleMessage("yap @bob about dinner friday");
 */
export class YapSkill {
  private agent: YapAgent;
  private prompter: MessagingPrompter;
  private send: SendMessage = () => {};
  private lastThreadId: string | null = null;

  constructor(config: YapSkillConfig) {
    this.prompter = new MessagingPrompter();

    this.agent = new YapAgent({
      handle: config.handle,
      treeUrl: config.treeUrl,
      comfortZone: config.comfortZone,
      prompter: this.prompter,
      userData: config.userData,
      authToken: config.authToken,
      contactsPath: config.contactsPath,
      keystorePath: config.keystorePath,
      keystorePassphrase: config.keystorePassphrase,
      blocklistPath: config.blocklistPath,
      platform: "openclaw-skill",
    });
  }

  async init(sendMessage: SendMessage): Promise<void> {
    this.send = sendMessage;
    await this.agent.connect();

    // Wire events to messaging output
    this.agent.onContext((threadId, context) => {
      this.lastThreadId = threadId;
      if (Object.keys(context).length > 0) {
        const fields = Object.entries(context)
          .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
          .join("\n");
        this.send(`Received context:\n${fields}`);
      }
    });

    this.agent.onLanding((threadId, proposal, decide) => {
      this.lastThreadId = threadId;
      const lines = [
        `Proposal: ${proposal.summary}`,
        ...Object.entries(proposal.details).map(([k, v]) => `  ${k}: ${v}`),
      ];
      if (proposal.alternatives?.length) {
        lines.push("Alternatives:");
        for (const alt of proposal.alternatives) {
          lines.push(`  - ${alt.summary} (${alt.reason})`);
        }
      }
      lines.push("", 'Reply "confirm" or "decline"');
      this.send(lines.join("\n"));

      // Stash decide for confirm/decline commands
      this._pendingDecide = decide;
    });

    this.agent.onConfirmed((threadId) => {
      this.send("Confirmed! Branch completed.");
    });

    this.agent.onDeclined((threadId, reason) => {
      this.send(`Declined${reason ? ` (${reason})` : ""}. Branch closed.`);
    });

    this.agent.onStalled((threadId) => {
      this.send(`Thread ${threadId} stalled — no response.`);
    });

    this.agent.onError((err) => {
      this.send(`Error: ${err.message}`);
    });

    this.send("Yap skill ready. Say 'yap @someone about <topic>' to start.");
  }

  private _pendingDecide: ((d: "confirm" | "decline", r?: string) => void) | null = null;

  async handleMessage(text: string): Promise<void> {
    const cmd = parseCommand(text);

    switch (cmd.type) {
      case "yap": {
        if (!cmd.to || !cmd.intent) {
          this.send("Usage: yap @handle about <topic>");
          return;
        }
        const threadId = await this.agent.startBranch(
          cmd.to,
          cmd.intent,
          cmd.context ?? {},
          cmd.needs ?? [],
        );
        this.lastThreadId = threadId;
        this.send(`Sent yap to ${cmd.to} (thread: ${threadId}). Waiting for response...`);
        break;
      }

      case "check": {
        const branches = this.agent.listBranches();
        if (branches.length === 0) {
          this.send("No active yap threads.");
        } else {
          const lines = branches.map(
            (b) => `  ${b.thread_id} — ${b.state} (updated ${b.updated_at})`,
          );
          this.send(`Active threads:\n${lines.join("\n")}`);
        }
        break;
      }

      case "confirm": {
        if (this._pendingDecide) {
          this._pendingDecide("confirm");
          this._pendingDecide = null;
          this.send("Confirmed!");
        } else {
          this.send("Nothing to confirm.");
        }
        break;
      }

      case "decline": {
        if (this._pendingDecide) {
          this._pendingDecide("decline", cmd.reason);
          this._pendingDecide = null;
          this.send("Declined.");
        } else {
          this.send("Nothing to decline.");
        }
        break;
      }

      default:
        this.send("I didn't understand that. Try: yap @handle about <topic>, check, confirm, or decline.");
    }
  }

  disconnect(): void {
    this.agent.disconnect();
  }
}

// Skill metadata for ClawHub
export const skill = {
  name: "yap",
  version: "0.1.0",
  description: "Send and receive yaps to coordinate with other AI agents",
  commands: ["yap @<handle> about <topic>", "check", "confirm", "decline"],
};
