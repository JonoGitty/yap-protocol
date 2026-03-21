/**
 * MCP Tool Validation Script
 *
 * Tests the Yap MCP server by spawning it as a subprocess and communicating
 * over stdio using the MCP SDK client. This validates that all 12 MCP tools
 * are properly registered, have correct schemas, and respond without errors.
 *
 * Usage: npx tsx packages/claude-mcp/test/validate-mcp-tools.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

const MCP_SERVER_PATH = resolve(import.meta.dirname, "../src/index.ts");

const EXPECTED_TOOLS = [
  "send_yap",
  "check_branch",
  "respond_to_chirp",
  "propose_landing",
  "confirm_landing",
  "decline_landing",
  "list_branches",
  "set_comfort_zone",
  "send_to_group",
  "yap_contacts",
  "yap_privacy",
  "yap_status",
  "yap_notifications",
];

const EXPECTED_PROMPTS = ["yap-agent", "coordinate"];
const EXPECTED_RESOURCES = ["yap://branches"];

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const results: TestResult[] = [];
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  try {
    console.log("=== MCP Tool Validation ===\n");
    console.log(`Starting MCP server: ${MCP_SERVER_PATH}\n`);

    // Start MCP server as subprocess
    transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", MCP_SERVER_PATH],
      env: {
        ...process.env,
        YAP_HANDLE: "test-validator",
        YAP_INCOMING_POLICY: "anyone",
      },
    });

    client = new Client({ name: "yap-validator", version: "1.0.0" });
    await client.connect(transport);
    console.log("Connected to MCP server\n");

    // --- Test 1: List tools ---
    console.log("--- Test: List Tools ---");
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);
    console.log(`  Found ${toolNames.length} tools: ${toolNames.join(", ")}`);

    for (const expected of EXPECTED_TOOLS) {
      const found = toolNames.includes(expected);
      results.push({
        name: `Tool registered: ${expected}`,
        passed: found,
        error: found ? undefined : `Tool "${expected}" not found`,
      });
      console.log(`  ${found ? "✅" : "❌"} ${expected}`);
    }

    // Check tool schemas have descriptions and input schemas
    for (const tool of toolsResult.tools) {
      const hasDesc = !!tool.description && tool.description.length > 10;
      const hasSchema = !!tool.inputSchema;
      results.push({
        name: `Tool schema valid: ${tool.name}`,
        passed: hasDesc && hasSchema,
        error: !hasDesc ? "Missing or short description" : !hasSchema ? "Missing input schema" : undefined,
        details: `desc=${tool.description?.slice(0, 50)}...`,
      });
    }

    // --- Test 2: List prompts ---
    console.log("\n--- Test: List Prompts ---");
    const promptsResult = await client.listPrompts();
    const promptNames = promptsResult.prompts.map((p) => p.name);
    console.log(`  Found ${promptNames.length} prompts: ${promptNames.join(", ")}`);

    for (const expected of EXPECTED_PROMPTS) {
      const found = promptNames.includes(expected);
      results.push({
        name: `Prompt registered: ${expected}`,
        passed: found,
        error: found ? undefined : `Prompt "${expected}" not found`,
      });
      console.log(`  ${found ? "✅" : "❌"} ${expected}`);
    }

    // --- Test 3: List resources ---
    console.log("\n--- Test: List Resources ---");
    const resourcesResult = await client.listResources();
    const resourceUris = resourcesResult.resources.map((r) => r.uri);
    console.log(`  Found ${resourceUris.length} resources: ${resourceUris.join(", ")}`);

    for (const expected of EXPECTED_RESOURCES) {
      const found = resourceUris.includes(expected);
      results.push({
        name: `Resource registered: ${expected}`,
        passed: found,
        error: found ? undefined : `Resource "${expected}" not found`,
      });
      console.log(`  ${found ? "✅" : "❌"} ${expected}`);
    }

    // --- Test 4: Call yap_status tool ---
    console.log("\n--- Test: Call yap_status ---");
    const statusResult = await client.callTool({ name: "yap_status", arguments: {} });
    const statusText = (statusResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const status = JSON.parse(statusText);
    const statusOk = status.handle === "@test-validator" && status.connected === true;
    results.push({
      name: "yap_status returns correct handle and connected state",
      passed: statusOk,
      error: statusOk ? undefined : `Unexpected status: ${statusText}`,
      details: `handle=${status.handle}, connected=${status.connected}`,
    });
    console.log(`  ${statusOk ? "✅" : "❌"} Status: ${JSON.stringify(status, null, 2)}`);

    // --- Test 5: Call list_branches (should be empty) ---
    console.log("\n--- Test: Call list_branches ---");
    const branchesResult = await client.callTool({ name: "list_branches", arguments: {} });
    const branchesText = (branchesResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const branches = JSON.parse(branchesText);
    const branchesOk = branches.total === 0;
    results.push({
      name: "list_branches returns empty initially",
      passed: branchesOk,
      error: branchesOk ? undefined : `Expected 0 branches, got ${branches.total}`,
    });
    console.log(`  ${branchesOk ? "✅" : "❌"} Branches: ${branches.total}`);

    // --- Test 6: Call set_comfort_zone ---
    console.log("\n--- Test: Call set_comfort_zone ---");
    const czResult = await client.callTool({
      name: "set_comfort_zone",
      arguments: {
        always_share: ["timezone"],
        ask_first: ["dietary", "budget_range"],
        never_share: ["health_info", "financial_details", "ssn"],
      },
    });
    const czText = (czResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const cz = JSON.parse(czText);
    const czOk = cz.status === "updated" && cz.comfort_zone.never_share.includes("ssn");
    results.push({
      name: "set_comfort_zone updates preferences",
      passed: czOk,
      error: czOk ? undefined : `Unexpected result: ${czText}`,
    });
    console.log(`  ${czOk ? "✅" : "❌"} Comfort zone: ${JSON.stringify(cz.comfort_zone)}`);

    // --- Test 7: Call yap_contacts (list) ---
    console.log("\n--- Test: Call yap_contacts ---");
    const contactsResult = await client.callTool({
      name: "yap_contacts",
      arguments: { action: "list" },
    });
    const contactsText = (contactsResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const contacts = JSON.parse(contactsText);
    const contactsOk = Array.isArray(contacts.contacts);
    results.push({
      name: "yap_contacts list returns valid response",
      passed: contactsOk,
      details: `contacts=${contacts.contacts.length}, policy=${contacts.incoming_policy}`,
    });
    console.log(`  ${contactsOk ? "✅" : "❌"} Contacts: ${JSON.stringify(contacts)}`);

    // --- Test 8: Call yap_contacts (add) ---
    const addResult = await client.callTool({
      name: "yap_contacts",
      arguments: { action: "add", handle: "@bob" },
    });
    const addText = (addResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const addOk = addText.includes("Added @bob");
    results.push({
      name: "yap_contacts add works",
      passed: addOk,
      error: addOk ? undefined : `Unexpected: ${addText}`,
    });
    console.log(`  ${addOk ? "✅" : "❌"} Add contact: ${addText}`);

    // --- Test 9: Call yap_privacy ---
    console.log("\n--- Test: Call yap_privacy ---");
    const privacyResult = await client.callTool({
      name: "yap_privacy",
      arguments: { policy: "contacts_only" },
    });
    const privacyText = (privacyResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const privacyOk = privacyText.includes("contacts_only");
    results.push({
      name: "yap_privacy updates policy",
      passed: privacyOk,
    });
    console.log(`  ${privacyOk ? "✅" : "❌"} Privacy: ${privacyText}`);

    // --- Test 10: Call yap_notifications (status) ---
    console.log("\n--- Test: Call yap_notifications ---");
    const notifResult = await client.callTool({
      name: "yap_notifications",
      arguments: { action: "status" },
    });
    const notifText = (notifResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const notif = JSON.parse(notifText);
    const notifOk = typeof notif.count === "number";
    results.push({
      name: "yap_notifications returns status",
      passed: notifOk,
      details: `channels=${notif.count}`,
    });
    console.log(`  ${notifOk ? "✅" : "❌"} Notifications: ${JSON.stringify(notif)}`);

    // --- Test 11: Get prompt ---
    console.log("\n--- Test: Get yap-agent prompt ---");
    const promptResult = await client.getPrompt({ name: "yap-agent", arguments: {} });
    const promptMsg = promptResult.messages[0];
    const promptContent = promptMsg?.content;
    let textContent: string;
    if (typeof promptContent === "string") {
      textContent = promptContent;
    } else if (Array.isArray(promptContent)) {
      textContent = (promptContent as Array<{ type: string; text: string }>).map((c) => c.text).join("\n");
    } else {
      textContent = (promptContent as { type: string; text: string }).text;
    }
    const promptOk = textContent.includes("Yap") && textContent.includes("test-validator");
    results.push({
      name: "yap-agent prompt contains handle and protocol info",
      passed: promptOk,
      error: promptOk ? undefined : `Content type: ${typeof promptContent}, isArray: ${Array.isArray(promptContent)}, sample: ${textContent.slice(0, 100)}`,
    });
    console.log(`  ${promptOk ? "✅" : "❌"} Prompt length: ${textContent.length} chars`);

    // --- Test 12: Read resource ---
    console.log("\n--- Test: Read branches resource ---");
    const resourceResult = await client.readResource({ uri: "yap://branches" });
    const resourceText = (resourceResult.contents[0] as { text: string }).text;
    const resourceData = JSON.parse(resourceText);
    const resourceOk = Array.isArray(resourceData);
    results.push({
      name: "yap://branches resource returns array",
      passed: resourceOk,
    });
    console.log(`  ${resourceOk ? "✅" : "❌"} Branches resource: ${resourceData.length} items`);

    // --- Test 13: Call check_branch (no thread) ---
    console.log("\n--- Test: Call check_branch (all) ---");
    const checkResult = await client.callTool({
      name: "check_branch",
      arguments: {},
    });
    const checkText = (checkResult.content as Array<{ type: string; text: string }>)[0]?.text;
    const checkData = JSON.parse(checkText);
    const checkOk = Array.isArray(checkData.branches);
    results.push({
      name: "check_branch returns branches array",
      passed: checkOk,
    });
    console.log(`  ${checkOk ? "✅" : "❌"} Branches: ${checkData.branches.length}`);

    // --- Test 14: send_yap to non-existent agent (should not crash) ---
    console.log("\n--- Test: send_yap to offline agent ---");
    const sendResult = await client.callTool({
      name: "send_yap",
      arguments: {
        to: "@nonexistent-agent",
        intent: { category: "scheduling", summary: "Test dinner", urgency: "low" },
        context: { proposed_date: "2026-03-28" },
        needs: [{ field: "availability", reason: "Need your schedule", priority: "required" }],
      },
    });
    const sendText = (sendResult.content as Array<{ type: string; text: string }>)[0]?.text;
    // Should either succeed (queued) or return an error - but not crash
    const sendOk = sendText.includes("thread_id") || sendText.includes("Error");
    results.push({
      name: "send_yap handles offline agent gracefully",
      passed: sendOk,
      details: sendText.slice(0, 100),
    });
    console.log(`  ${sendOk ? "✅" : "❌"} Result: ${sendText.slice(0, 80)}`);

  } catch (err) {
    console.error("\nFatal error:", (err as Error).message);
    results.push({
      name: "MCP server connectivity",
      passed: false,
      error: (err as Error).message,
    });
  } finally {
    // Cleanup
    try {
      if (transport) await transport.close();
    } catch { /* ignore cleanup errors */ }
  }

  // --- Summary ---
  console.log("\n=== Validation Summary ===");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${results.length}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    }
  }

  console.log(`\n${failed === 0 ? "✅ All validations passed!" : "❌ Some validations failed!"}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
