#!/usr/bin/env node

/**
 * Production tree server.
 * - Starts the tree with auth enabled
 * - Starts the registration API
 * - All secrets come from environment variables (never in code)
 * - Safe to open-source — zero sensitive data in this file
 */

import { createTree } from "./index.js";
import { RegistrationServer } from "./registration.js";
import { join } from "node:path";

const TREE_PORT = Number(process.env.YAP_PORT ?? 8789);
const API_PORT = Number(process.env.YAP_API_PORT ?? 8790);
const DATA_DIR = process.env.YAP_DATA_DIR ?? "/tmp/yap-data";
const INVITE_CODE = process.env.YAP_INVITE_CODE; // Optional: require invite to register

console.log("=== Yap Tree Server (Production) ===");
console.log(`Tree port: ${TREE_PORT}`);
console.log(`API port: ${API_PORT}`);
console.log(`Data dir: ${DATA_DIR}`);
console.log(`Invite required: ${!!INVITE_CODE}`);
console.log();

// --- Registration server ---

const registration = new RegistrationServer({
  httpPort: API_PORT,
  storePath: join(DATA_DIR, "registrations.json"),
  inviteCode: INVITE_CODE,
});

async function main() {
  // Load existing registrations
  await registration.load();

  // Start the tree with auth from registrations
  const tree = createTree(TREE_PORT, {
    authTokens: registration.getAuthTokens(),
    rateLimitPerMinute: Number(process.env.YAP_RATE_LIMIT ?? 60),
    maxQueuePerAgent: Number(process.env.YAP_MAX_QUEUE ?? 100),
    queueTtlMs: Number(process.env.YAP_QUEUE_TTL_MS ?? 24 * 60 * 60 * 1000),
    maxPacketBytes: Number(process.env.YAP_MAX_PACKET_BYTES ?? 1_048_576),
  });

  console.log(`🌳 Tree listening on ws://localhost:${TREE_PORT}`);

  // Start registration API
  registration.start();

  console.log();
  console.log("=== Security Notes ===");
  console.log("• All agent traffic is E2E encrypted (tree cannot read content)");
  console.log("• Tree only sees: who talks to whom, when, packet type");
  console.log("• Tree NEVER logs packet contents");
  console.log("• Auth tokens are hashed (SHA-256) before storage");
  console.log("• Set YAP_INVITE_CODE to require invites for registration");
  console.log();
  console.log("To register: POST http://localhost:" + API_PORT + "/register");
  console.log('  Body: {"handle": "username"}');
  if (INVITE_CODE) {
    console.log('  Body: {"handle": "username", "invite_code": "..."}');
  }
  console.log();

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    await tree.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await tree.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
