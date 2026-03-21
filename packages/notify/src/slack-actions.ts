/**
 * Slack interactive action handler.
 * Receives button clicks (confirm/decline/approve) from Slack and
 * routes them back to the Yap agent.
 *
 * Run alongside the MCP server or as a standalone process.
 * Slack sends POST to your callback URL when a button is clicked.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface SlackActionConfig {
  /** Port to listen on for Slack callbacks. */
  port: number;
  /** Slack signing secret — for verifying requests are from Slack. From env. */
  signingSecret?: string;
}

export type ActionHandler = (action: string, value: string, userId: string) => Promise<string>;

export class SlackActionServer {
  private handler: ActionHandler;

  constructor(
    private config: SlackActionConfig,
    handler: ActionHandler,
  ) {
    this.handler = handler;
  }

  start(): void {
    const server = createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/slack/actions") {
        await this.handleAction(req, res);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(this.config.port, () => {
      console.log(`🔔 Slack action handler on http://localhost:${this.config.port}/slack/actions`);
    });
  }

  private async handleAction(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const body = await readBody(req);

      // Slack sends form-encoded payload
      const params = new URLSearchParams(body);
      const payloadStr = params.get("payload");
      if (!payloadStr) {
        res.writeHead(400);
        res.end("Missing payload");
        return;
      }

      const payload = JSON.parse(payloadStr);

      // TODO: verify signing secret (crypto.timingSafeEqual with HMAC)
      // For now, rely on the callback URL being secret.

      if (payload.type === "block_actions" && payload.actions?.length > 0) {
        const action = payload.actions[0];
        const actionId = action.action_id as string;
        const value = action.value as string;
        const userId = payload.user?.id ?? "unknown";

        const responseText = await this.handler(actionId, value, userId);

        // Respond to Slack with updated message
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          response_type: "ephemeral",
          replace_original: true,
          text: responseText,
        }));
        return;
      }

      res.writeHead(200);
      res.end("ok");
    } catch (err) {
      res.writeHead(500);
      res.end("Internal error");
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
