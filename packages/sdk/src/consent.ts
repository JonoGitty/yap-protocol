import readline from "node:readline";
import type { Need } from "./types.js";

export interface ConsentResult {
  field: string;
  approved: boolean;
  value?: unknown;
}

export interface ConsentPrompter {
  promptBatch(
    fromAgent: string,
    needs: Need[],
    threadSummary: string,
  ): Promise<ConsentResult[]>;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * Auto-approves all consent requests using provided userData.
 * Useful for non-interactive testing or pre-authorised agents.
 */
export class AutoPrompter implements ConsentPrompter {
  constructor(private userData: Record<string, unknown> = {}) {}

  async promptBatch(
    fromAgent: string,
    needs: Need[],
    threadSummary: string,
  ): Promise<ConsentResult[]> {
    return needs.map((need) => {
      if (need.field in this.userData) {
        console.log(`  ✓ Auto-sharing ${need.field}`);
        return { field: need.field, approved: true, value: this.userData[need.field] };
      }
      console.log(`  ✗ No data for ${need.field}, declining`);
      return { field: need.field, approved: false };
    });
  }
}

export class TerminalPrompter implements ConsentPrompter {
  async promptBatch(
    fromAgent: string,
    needs: Need[],
    threadSummary: string,
  ): Promise<ConsentResult[]> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const results: ConsentResult[] = [];

    console.log(`\n  ┌─────────────────────────────────────┐`);
    console.log(`  │  CONSENT CHECK                      │`);
    console.log(`  └─────────────────────────────────────┘`);
    console.log(`  ${fromAgent} is asking for context`);
    console.log(`  Thread: ${threadSummary}\n`);

    for (const need of needs) {
      const priorityTag =
        need.priority === "required" ? " (required)" :
        need.priority === "helpful" ? " (helpful)" : " (nice to have)";

      console.log(`  → ${need.field}${priorityTag}`);
      console.log(`    "${need.reason}"`);

      const answer = await ask(rl, `    Share? Enter value (or "n" to decline): `);

      if (answer.toLowerCase() === "n" || answer === "") {
        results.push({ field: need.field, approved: false });
        console.log(`    ✗ Declined\n`);
      } else {
        // Try to parse as JSON for structured values, fall back to string
        let value: unknown = answer;
        try {
          value = JSON.parse(answer);
        } catch {
          // keep as string
        }
        results.push({ field: need.field, approved: true, value });
        console.log(`    ✓ Shared\n`);
      }
    }

    rl.close();
    return results;
  }
}
