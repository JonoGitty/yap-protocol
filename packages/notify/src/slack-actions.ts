/**
 * Slack interactive action handler.
 * Receives button clicks (confirm/decline/approve) from Slack and
 * routes them back to the Yap agent.
 *
 * Run alongside the MCP server or as a standalone process.
 * Slack sends POST to your callback URL when a button is clicked.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

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

      // Verify Slack request signature (v0 signing)
      if (this.config.signingSecret) {
        const timestamp = req.headers["x-slack-request-timestamp"] as string;
        const slackSig = req.headers["x-slack-signature"] as string;

        if (!timestamp || !slackSig) {
          res.writeHead(401);
          res.end("Missing Slack signature headers");
          return;
        }

        // Reject requests older than 5 minutes to prevent replay attacks
        const age = Math.abs(Date.now() / 1000 - Number(timestamp));
        if (age > 300) {
          res.writeHead(401);
          res.end("Request too old");
          return;
        }

        const sigBasestring = `v0:${timestamp}:${body}`;
        const mySignature = "v0=" + createHmac("sha256", this.config.signingSecret)
          .update(sigBasestring)
          .digest("hex");

        if (
          mySignature.length !== slackSig.length ||
          !timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSig))
        ) {
          res.writeHead(401);
          res.end("Invalid signature");
          return;
        }
      }

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
