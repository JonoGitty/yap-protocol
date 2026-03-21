/**
 * Yap Notification Service
 *
 * Connects to a tree as an agent and forwards notifications to Slack
 * (and other channels in future). Acts as a sidecar to the user's
 * main agent — it watches for events that need human attention.
 *
 * Usage:
 *   YAP_HANDLE=jono \
 *   YAP_TREE_URL=ws://localhost:8789 \
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx \
 *   npx tsx packages/notify/src/index.ts
 *
 * All secrets from env vars. Zero sensitive data in code.
 */

export { SlackNotifier, type SlackConfig } from "./slack.js";
export { SlackActionServer, type SlackActionConfig, type ActionHandler } from "./slack-actions.js";
