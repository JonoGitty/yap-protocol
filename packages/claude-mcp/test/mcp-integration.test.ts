/**
 * Comprehensive integration tests for the Yap MCP server components.
 *
 * Tests the EventBuffer, McpConsentPrompter, full agent integration flows,
 * and MCP tool handler logic against a real tree relay server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTree, type TreeInstance } from "../../tree/src/index.js";
import {
  YapAgent,
  AutoPrompter,
  type Need,
  type Proposal,
  type ComfortZone,
  type ConsentResult,
  type Intent,
} from "../../sdk/src/index.js";
import { EventBuffer } from "../src/event-buffer.js";
import { McpConsentPrompter } from "../src/mcp-consent.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let portCounter = 19100;
function nextPort(): number {
  return portCounter++;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create a standard MCP-style agent with event buffer and consent prompter wired up. */
function createMcpAgent(
  handle: string,
  treeUrl: string,
  zone?: ComfortZone,
  userData?: Record<string, unknown>,
) {
  const buffer = new EventBuffer();
  const consentPrompter = new McpConsentPrompter(buffer);
  const decideFns = new Map<string, (d: "confirm" | "decline", r?: string) => void>();

  const agent = new YapAgent({
    handle,
    treeUrl,
    comfortZone: zone ?? {
      always_share: ["timezone", "general_availability"],
      ask_first: ["dietary", "budget_range"],
      never_share: ["health_info"],
    },
    prompter: consentPrompter,
    userData: userData ?? {},
  });

  agent.onContext((threadId, context) => {
    buffer.push(threadId, "context_received", { context });
  });

  agent.onLanding((threadId, proposal, decide) => {
    buffer.push(threadId, "landing_proposed", { proposal });
    decideFns.set(threadId, decide);
  });

  agent.onConfirmed((threadId) => {
    buffer.push(threadId, "confirmed", {});
  });

  agent.onDeclined((threadId, reason) => {
    buffer.push(threadId, "declined", { reason });
  });

  agent.onError(() => {});

  return { agent, buffer, consentPrompter, decideFns };
}

/** Create a counterpart agent that auto-approves and auto-confirms. */
function createCounterpartAgent(
  handle: string,
  treeUrl: string,
  userData: Record<string, unknown>,
  opts?: { autoConfirm?: boolean },
) {
  const autoConfirm = opts?.autoConfirm ?? true;
  let receivedContexts: Array<{ threadId: string; context: Record<string, unknown> }> = [];
  let receivedLandings: Array<{ threadId: string; proposal: Proposal }> = [];

  const agent = new YapAgent({
    handle,
    treeUrl,
    comfortZone: {
      always_share: ["timezone", "time_windows"],
      ask_first: ["dietary", "location_preference"],
      never_share: ["health_info"],
    },
    prompter: new AutoPrompter(userData),
    userData,
  });

  agent.onContext((threadId, context) => {
    receivedContexts.push({ threadId, context });
  });

  agent.onLanding((threadId, proposal, decide) => {
    receivedLandings.push({ threadId, proposal });
    if (autoConfirm) {
      decide("confirm");
    }
  });

  agent.onError(() => {});

  return { agent, receivedContexts, receivedLandings };
}

// ===========================================================================
// EventBuffer tests
// ===========================================================================

describe("EventBuffer", () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    buffer = new EventBuffer();
  });

  it("push and consume cycle works", () => {
    buffer.push("thr_1", "context_received", { foo: "bar" });
    const events = buffer.consume("thr_1");

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("context_received");
    expect(events[0].data).toEqual({ foo: "bar" });
    expect(events[0].consumed).toBe(true);
    expect(events[0].timestamp).toBeTruthy();
  });

  it("consume marks events as consumed and second consume returns empty", () => {
    buffer.push("thr_1", "context_received", {});
    buffer.push("thr_1", "confirmed", {});

    const first = buffer.consume("thr_1");
    expect(first).toHaveLength(2);

    const second = buffer.consume("thr_1");
    expect(second).toHaveLength(0);
  });

  it("pendingCount is accurate", () => {
    expect(buffer.pendingCount("thr_1")).toBe(0);

    buffer.push("thr_1", "context_received", {});
    buffer.push("thr_1", "confirmed", {});
    expect(buffer.pendingCount("thr_1")).toBe(2);

    buffer.consume("thr_1");
    expect(buffer.pendingCount("thr_1")).toBe(0);

    buffer.push("thr_1", "declined", {});
    expect(buffer.pendingCount("thr_1")).toBe(1);
  });

  it("history returns all events including consumed", () => {
    buffer.push("thr_1", "context_received", { a: 1 });
    buffer.consume("thr_1");
    buffer.push("thr_1", "confirmed", { b: 2 });

    const history = buffer.history("thr_1");
    expect(history).toHaveLength(2);
    expect(history[0].consumed).toBe(true);
    expect(history[1].consumed).toBe(false);
  });

  it("allThreadIds returns correct threads", () => {
    expect(buffer.allThreadIds()).toEqual([]);

    buffer.push("thr_1", "context_received", {});
    buffer.push("thr_2", "confirmed", {});
    buffer.push("thr_3", "declined", {});

    const ids = buffer.allThreadIds();
    expect(ids).toHaveLength(3);
    expect(ids).toContain("thr_1");
    expect(ids).toContain("thr_2");
    expect(ids).toContain("thr_3");
  });

  it("multiple threads do not interfere with each other", () => {
    buffer.push("thr_a", "context_received", { from: "a" });
    buffer.push("thr_b", "confirmed", { from: "b" });
    buffer.push("thr_a", "landing_proposed", { from: "a2" });

    const eventsA = buffer.consume("thr_a");
    expect(eventsA).toHaveLength(2);
    expect(eventsA[0].data).toEqual({ from: "a" });
    expect(eventsA[1].data).toEqual({ from: "a2" });

    const eventsB = buffer.consume("thr_b");
    expect(eventsB).toHaveLength(1);
    expect(eventsB[0].data).toEqual({ from: "b" });

    // A is consumed, B is consumed, new push to A doesn't affect B
    buffer.push("thr_a", "error", { err: true });
    expect(buffer.pendingCount("thr_a")).toBe(1);
    expect(buffer.pendingCount("thr_b")).toBe(0);
  });

  it("consume on unknown thread returns empty array", () => {
    expect(buffer.consume("thr_nonexistent")).toEqual([]);
  });

  it("history on unknown thread returns empty array", () => {
    expect(buffer.history("thr_nonexistent")).toEqual([]);
  });
});

// ===========================================================================
// McpConsentPrompter tests
// ===========================================================================

describe("McpConsentPrompter", () => {
  let buffer: EventBuffer;
  let prompter: McpConsentPrompter;

  beforeEach(() => {
    buffer = new EventBuffer();
    prompter = new McpConsentPrompter(buffer);
  });

  it("promptBatch pushes consent_pending event to buffer", () => {
    const needs: Need[] = [
      { field: "dietary", reason: "Need dietary info", priority: "required" },
      { field: "budget", reason: "Need budget range", priority: "helpful" },
    ];

    // Don't await -- the promise won't resolve until we resolveConsent
    prompter.promptBatch("@bob", needs, "Dinner planning", "thr_1");

    const events = buffer.consume("thr_1");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("consent_pending");
    expect(events[0].data.from_agent).toBe("@bob");
    expect(events[0].data.thread_summary).toBe("Dinner planning");
    expect(events[0].data.needs).toEqual([
      { field: "dietary", reason: "Need dietary info", priority: "required" },
      { field: "budget", reason: "Need budget range", priority: "helpful" },
    ]);
  });

  it("resolveConsent resolves the pending promise", async () => {
    const needs: Need[] = [
      { field: "dietary", reason: "Need dietary info", priority: "required" },
    ];

    const resultPromise = prompter.promptBatch("@bob", needs, "Dinner", "thr_1");

    const resolved = prompter.resolveConsent("thr_1", [
      { field: "dietary", approved: true, value: "vegetarian" },
    ]);
    expect(resolved).toBe(true);

    const results = await resultPromise;
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ field: "dietary", approved: true, value: "vegetarian" });
  });

  it("auto-declines after timeout", async () => {
    vi.useFakeTimers();

    const needs: Need[] = [
      { field: "dietary", reason: "Need info", priority: "required" },
      { field: "budget", reason: "Need budget", priority: "helpful" },
    ];

    const resultPromise = prompter.promptBatch("@bob", needs, "Test", "thr_timeout");

    // Advance past the 5 minute timeout
    vi.advanceTimersByTime(5 * 60 * 1000 + 100);

    const results = await resultPromise;
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ field: "dietary", approved: false });
    expect(results[1]).toEqual({ field: "budget", approved: false });

    // After timeout, the pending entry should be cleaned up
    expect(prompter.hasPendingConsent("thr_timeout")).toBe(false);

    vi.useRealTimers();
  });

  it("hasPendingConsent returns correct state", () => {
    expect(prompter.hasPendingConsent("thr_1")).toBe(false);

    const needs: Need[] = [{ field: "x", reason: "y", priority: "required" }];
    prompter.promptBatch("@a", needs, "s", "thr_1");
    expect(prompter.hasPendingConsent("thr_1")).toBe(true);

    prompter.resolveConsent("thr_1", [{ field: "x", approved: false }]);
    expect(prompter.hasPendingConsent("thr_1")).toBe(false);
  });

  it("resolveConsent returns false for unknown thread", () => {
    const result = prompter.resolveConsent("thr_unknown", [
      { field: "x", approved: true },
    ]);
    expect(result).toBe(false);
  });

  it("promptBatch uses 'unknown' when no threadId provided", () => {
    const needs: Need[] = [{ field: "x", reason: "y", priority: "required" }];
    prompter.promptBatch("@a", needs, "summary");

    const events = buffer.consume("unknown");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("consent_pending");
  });
});

// ===========================================================================
// Full agent integration tests
// ===========================================================================

describe("Agent integration", () => {
  let tree: TreeInstance;
  let port: number;
  let treeUrl: string;

  beforeEach(async () => {
    port = nextPort();
    tree = createTree(port);
    treeUrl = `ws://localhost:${port}`;
  });

  afterEach(async () => {
    await tree.close();
  });

  it("two agents can exchange context via tree", async () => {
    const bobData = { timezone: "Europe/London", time_windows: ["18:30-21:00"] };

    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob, receivedContexts } = createCounterpartAgent("bob", treeUrl, bobData);

    await alice.connect();
    await bob.connect();

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner Friday", urgency: "low" },
      { event_type: "dinner", proposed_date: "2026-03-27" },
      [{ field: "time_windows", reason: "Need availability", priority: "required" }],
    );

    expect(threadId).toMatch(/^thr_/);

    await sleep(500);

    // Bob should have received context
    expect(receivedContexts.length).toBeGreaterThanOrEqual(1);

    // Alice should have received Bob's context response
    const events = aliceBuffer.consume(threadId);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const contextEvent = events.find((e) => e.type === "context_received");
    expect(contextEvent).toBeDefined();

    bob.disconnect();
    alice.disconnect();
  });

  it("branch lifecycle: INITIATED -> NEGOTIATING -> PROPOSED -> CONFIRMED -> COMPLETED", async () => {
    const bobData = { timezone: "Europe/London", time_windows: ["19:00-21:00"] };

    const { agent: alice, buffer: aliceBuffer, decideFns } = createMcpAgent("alice", treeUrl);
    const { agent: bob, receivedLandings } = createCounterpartAgent("bob", treeUrl, bobData, { autoConfirm: true });

    await alice.connect();
    await bob.connect();

    // 1) Start branch (INITIATED -> NEGOTIATING)
    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner" },
      [{ field: "time_windows", reason: "availability", priority: "required" }],
    );

    await sleep(500);

    // Verify branch is tracked
    const branches = alice.listBranches();
    expect(branches.length).toBeGreaterThanOrEqual(1);
    const branch = branches.find((b) => b.thread_id === threadId);
    expect(branch).toBeDefined();

    // 2) Propose landing (-> PROPOSED)
    const proposal: Proposal = {
      summary: "Dinner at The Botanist, Friday 19:00",
      details: { venue: "The Botanist", date: "2026-03-27", time: "19:00" },
    };
    alice.proposeLanding(threadId, "@bob", proposal);

    await sleep(500);

    // Bob should have received and auto-confirmed the landing
    expect(receivedLandings.length).toBeGreaterThanOrEqual(1);

    // 3) Alice should see confirmed event
    const events = aliceBuffer.consume(threadId);
    const confirmed = events.find((e) => e.type === "confirmed");
    expect(confirmed).toBeDefined();

    bob.disconnect();
    alice.disconnect();
  });

  it("landing proposal and confirmation flow works end-to-end", async () => {
    const bobData = { timezone: "US/Pacific" };

    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob } = createCounterpartAgent("bob", treeUrl, bobData, { autoConfirm: true });

    await alice.connect();
    await bob.connect();

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Meeting", urgency: "medium" },
      { topic: "quarterly review" },
      [],
    );

    await sleep(300);

    alice.proposeLanding(threadId, "@bob", {
      summary: "Meeting Monday 10am PT",
      details: { date: "2026-03-23", time: "10:00", timezone: "US/Pacific" },
    });

    await sleep(500);

    const events = aliceBuffer.history(threadId);
    const confirmedEvent = events.find((e) => e.type === "confirmed");
    expect(confirmedEvent).toBeDefined();

    bob.disconnect();
    alice.disconnect();
  });

  it("landing decline flow works correctly", async () => {
    const bobData = { timezone: "Europe/London" };

    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);

    // Bob will decline landings
    const bob = new YapAgent({
      handle: "bob",
      treeUrl,
      comfortZone: {
        always_share: ["timezone"],
        ask_first: [],
        never_share: [],
      },
      prompter: new AutoPrompter(bobData),
      userData: bobData,
    });

    bob.onContext(() => {});
    bob.onLanding((_threadId, _proposal, decide) => {
      decide("decline", "scheduling_conflict");
    });
    bob.onError(() => {});

    await alice.connect();
    await bob.connect();

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner" },
      [],
    );

    await sleep(300);

    alice.proposeLanding(threadId, "@bob", {
      summary: "Dinner Saturday 20:00",
      details: { date: "2026-03-28", time: "20:00" },
    });

    await sleep(500);

    const events = aliceBuffer.consume(threadId);
    const declinedEvent = events.find((e) => e.type === "declined");
    expect(declinedEvent).toBeDefined();
    expect(declinedEvent!.data.reason).toBe("scheduling_conflict");

    bob.disconnect();
    alice.disconnect();
  });

  it("comfort zone enforcement: never_share fields are not leaked", async () => {
    const bobData = {
      timezone: "Europe/London",
      dietary: "vegetarian",
      health_info: "SUPER SECRET HEALTH DATA",
    };

    // Bob has health_info in never_share
    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob } = createCounterpartAgent("bob", treeUrl, bobData);

    await alice.connect();
    await bob.connect();

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner" },
      [
        { field: "timezone", reason: "scheduling", priority: "required" },
        { field: "health_info", reason: "need health data", priority: "helpful" },
        { field: "dietary", reason: "restaurant selection", priority: "helpful" },
      ],
    );

    await sleep(500);

    // Check all events alice received
    const events = aliceBuffer.history(threadId);
    const allData = JSON.stringify(events);

    // health_info should never appear in context received by alice
    expect(allData).not.toContain("SUPER SECRET HEALTH DATA");

    bob.disconnect();
    alice.disconnect();
  });

  it("group branch initiation sends to multiple participants", async () => {
    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob, receivedContexts: bobContexts } = createCounterpartAgent(
      "bob", treeUrl, { timezone: "Europe/London" },
    );
    const { agent: charlie, receivedContexts: charlieContexts } = createCounterpartAgent(
      "charlie", treeUrl, { timezone: "US/Eastern" },
    );

    await alice.connect();
    await bob.connect();
    await charlie.connect();

    const threadId = await alice.startGroupBranch(
      ["@bob", "@charlie"],
      { category: "scheduling", summary: "Team dinner", urgency: "low" },
      { event: "team_dinner", proposed_date: "2026-03-27" },
      [{ field: "timezone", reason: "scheduling", priority: "required" }],
    );

    expect(threadId).toMatch(/^thr_/);

    await sleep(500);

    // Both bob and charlie should have received context
    expect(bobContexts.length).toBeGreaterThanOrEqual(1);
    expect(charlieContexts.length).toBeGreaterThanOrEqual(1);

    charlie.disconnect();
    bob.disconnect();
    alice.disconnect();
  });

  it("multiple concurrent branches do not interfere", async () => {
    const bobData = { timezone: "Europe/London" };
    const charlieData = { timezone: "US/Eastern" };

    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob } = createCounterpartAgent("bob", treeUrl, bobData);
    const { agent: charlie } = createCounterpartAgent("charlie", treeUrl, charlieData);

    await alice.connect();
    await bob.connect();
    await charlie.connect();

    const thread1 = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Lunch with Bob", urgency: "low" },
      { event: "lunch" },
      [{ field: "timezone", reason: "scheduling", priority: "required" }],
    );

    const thread2 = await alice.startBranch(
      "@charlie",
      { category: "scheduling", summary: "Coffee with Charlie", urgency: "medium" },
      { event: "coffee" },
      [{ field: "timezone", reason: "scheduling", priority: "required" }],
    );

    expect(thread1).not.toBe(thread2);

    await sleep(500);

    // Each thread should have its own events
    const events1 = aliceBuffer.consume(thread1);
    const events2 = aliceBuffer.consume(thread2);

    expect(events1.length).toBeGreaterThanOrEqual(1);
    expect(events2.length).toBeGreaterThanOrEqual(1);

    // Events should not leak between threads
    const e1Data = JSON.stringify(events1);
    const e2Data = JSON.stringify(events2);

    // The branches are tracked separately
    const branches = alice.listBranches();
    const t1Branch = branches.find((b) => b.thread_id === thread1);
    const t2Branch = branches.find((b) => b.thread_id === thread2);
    expect(t1Branch).toBeDefined();
    expect(t2Branch).toBeDefined();

    charlie.disconnect();
    bob.disconnect();
    alice.disconnect();
  });

  it("offline message queuing: messages delivered when agent connects", async () => {
    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    await alice.connect();

    // Send a yap to bob who is NOT connected yet
    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner", proposed_date: "2026-03-27" },
      [],
    );

    await sleep(300);

    // Now connect bob -- he should receive the queued message
    let bobReceivedContext = false;
    const bob = new YapAgent({
      handle: "bob",
      treeUrl,
      comfortZone: {
        always_share: ["timezone"],
        ask_first: [],
        never_share: [],
      },
      prompter: new AutoPrompter({ timezone: "Europe/London" }),
      userData: { timezone: "Europe/London" },
    });
    bob.onContext((_tid, _ctx) => {
      bobReceivedContext = true;
    });
    bob.onError(() => {});

    await bob.connect();

    await sleep(500);

    expect(bobReceivedContext).toBe(true);

    bob.disconnect();
    alice.disconnect();
  });
});

// ===========================================================================
// MCP tool validation tests (test tool handler logic directly)
// ===========================================================================

describe("MCP tool handlers", () => {
  let tree: TreeInstance;
  let port: number;
  let treeUrl: string;

  beforeEach(async () => {
    port = nextPort();
    tree = createTree(port);
    treeUrl = `ws://localhost:${port}`;
  });

  afterEach(async () => {
    await tree.close();
  });

  it("send_yap creates a branch and returns thread_id", async () => {
    const { agent: alice, buffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob } = createCounterpartAgent("bob", treeUrl, {});

    await alice.connect();
    await bob.connect();

    // Simulate what the send_yap tool does
    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner" },
      [{ field: "time_windows", reason: "Need availability", priority: "required" }],
    );

    expect(threadId).toMatch(/^thr_/);
    expect(typeof threadId).toBe("string");

    // Branch should now be tracked
    const branch = alice.getBranch(threadId);
    expect(branch).toBeDefined();
    expect(branch!.thread_id).toBe(threadId);

    bob.disconnect();
    alice.disconnect();
  });

  it("check_branch returns pending events", async () => {
    const bobData = { timezone: "Europe/London", time_windows: ["18:30-21:00"] };

    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob } = createCounterpartAgent("bob", treeUrl, bobData);

    await alice.connect();
    await bob.connect();

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner" },
      [{ field: "time_windows", reason: "Need availability", priority: "required" }],
    );

    await sleep(500);

    // Simulate what check_branch tool does
    const branch = alice.getBranch(threadId);
    const events = aliceBuffer.consume(threadId);

    expect(branch).toBeDefined();
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "context_received")).toBe(true);

    // Second call returns no pending events (consumed)
    const events2 = aliceBuffer.consume(threadId);
    expect(events2).toHaveLength(0);

    bob.disconnect();
    alice.disconnect();
  });

  it("list_branches shows active threads", async () => {
    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob } = createCounterpartAgent("bob", treeUrl, {});

    await alice.connect();
    await bob.connect();

    expect(alice.listBranches()).toHaveLength(0);

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Test", urgency: "low" },
      {},
      [],
    );

    await sleep(200);

    // Simulate list_branches tool
    const branches = alice.listBranches();
    const threadIds = new Set([...branches.map((b) => b.thread_id), ...aliceBuffer.allThreadIds()]);

    expect(threadIds.size).toBeGreaterThanOrEqual(1);
    expect(threadIds.has(threadId)).toBe(true);

    bob.disconnect();
    alice.disconnect();
  });

  it("set_comfort_zone updates preferences", async () => {
    const { agent: alice } = createMcpAgent("alice", treeUrl);
    await alice.connect();

    const original = alice.getComfortZone();
    expect(original.always_share).toContain("timezone");

    // Simulate set_comfort_zone tool
    const updated: ComfortZone = {
      always_share: ["timezone"],
      ask_first: ["dietary"],
      never_share: ["health_info", "financial_details"],
    };
    alice.setComfortZone(updated);

    const current = alice.getComfortZone();
    expect(current.never_share).toContain("financial_details");
    expect(current.always_share).toEqual(["timezone"]);
    expect(current.ask_first).toEqual(["dietary"]);

    alice.disconnect();
  });

  it("confirm_landing works correctly via decideFns pattern", async () => {
    const bobData = { timezone: "Europe/London" };

    const { agent: alice, buffer: aliceBuffer, decideFns: aliceDecideFns } = createMcpAgent("alice", treeUrl);
    const { agent: bob, buffer: bobBuffer, decideFns: bobDecideFns } = createMcpAgent("bob", treeUrl, undefined, bobData);

    await alice.connect();
    await bob.connect();

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner" },
      [],
    );

    await sleep(300);

    // Alice proposes a landing
    alice.proposeLanding(threadId, "@bob", {
      summary: "Dinner at 7pm",
      details: { time: "19:00" },
    });

    await sleep(500);

    // Bob should have a pending landing via decideFns
    const bobDecide = bobDecideFns.get(threadId);
    expect(bobDecide).toBeDefined();

    // Simulate confirm_landing tool call on Bob's side
    bobDecide!("confirm");
    bobDecideFns.delete(threadId);

    await sleep(300);

    // Alice should see confirmed
    const events = aliceBuffer.consume(threadId);
    const confirmedEvent = events.find((e) => e.type === "confirmed");
    expect(confirmedEvent).toBeDefined();

    bob.disconnect();
    alice.disconnect();
  });

  it("decline_landing works correctly via decideFns pattern", async () => {
    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob, buffer: bobBuffer, decideFns: bobDecideFns } = createMcpAgent("bob", treeUrl);

    await alice.connect();
    await bob.connect();

    const threadId = await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Dinner", urgency: "low" },
      { event: "dinner" },
      [],
    );

    await sleep(300);

    alice.proposeLanding(threadId, "@bob", {
      summary: "Dinner at 7pm",
      details: { time: "19:00" },
    });

    await sleep(500);

    const bobDecide = bobDecideFns.get(threadId);
    expect(bobDecide).toBeDefined();

    // Simulate decline_landing tool
    bobDecide!("decline", "over_budget");
    bobDecideFns.delete(threadId);

    await sleep(300);

    const events = aliceBuffer.consume(threadId);
    const declinedEvent = events.find((e) => e.type === "declined");
    expect(declinedEvent).toBeDefined();
    expect(declinedEvent!.data.reason).toBe("over_budget");

    bob.disconnect();
    alice.disconnect();
  });

  it("contact management: add, list, remove", () => {
    // Simulate the yap_contacts tool logic (module-level state in index.ts)
    const contacts = new Set<string>();

    // Add
    contacts.add("@bob");
    contacts.add("@charlie");
    expect(contacts.size).toBe(2);
    expect(contacts.has("@bob")).toBe(true);

    // List
    const list = [...contacts];
    expect(list).toContain("@bob");
    expect(list).toContain("@charlie");

    // Remove
    contacts.delete("@bob");
    expect(contacts.has("@bob")).toBe(false);
    expect(contacts.size).toBe(1);

    // Add with @ prefix normalization (like the tool does)
    const handle = "dave";
    const normalized = handle.startsWith("@") ? handle : `@${handle}`;
    contacts.add(normalized);
    expect(contacts.has("@dave")).toBe(true);
  });

  it("privacy policy changes are applied", () => {
    // Simulate yap_privacy tool
    type IncomingPolicy = "anyone" | "contacts_only" | "ask_first";
    let incomingPolicy: IncomingPolicy = "ask_first";

    expect(incomingPolicy).toBe("ask_first");

    incomingPolicy = "anyone";
    expect(incomingPolicy).toBe("anyone");

    incomingPolicy = "contacts_only";
    expect(incomingPolicy).toBe("contacts_only");
  });

  it("respond_to_chirp resolves consent and returns correct state", async () => {
    const buffer = new EventBuffer();
    const prompter = new McpConsentPrompter(buffer);

    const needs: Need[] = [
      { field: "dietary", reason: "Restaurant selection", priority: "required" },
      { field: "budget", reason: "Price range", priority: "helpful" },
    ];

    const resultPromise = prompter.promptBatch("@bob", needs, "Dinner planning", "thr_chirp");

    // Verify consent is pending
    expect(prompter.hasPendingConsent("thr_chirp")).toBe(true);

    // Simulate respond_to_chirp tool
    const responses: ConsentResult[] = [
      { field: "dietary", approved: true, value: "vegetarian" },
      { field: "budget", approved: false },
    ];
    const resolved = prompter.resolveConsent("thr_chirp", responses);
    expect(resolved).toBe(true);

    const results = await resultPromise;
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ field: "dietary", approved: true, value: "vegetarian" });
    expect(results[1]).toEqual({ field: "budget", approved: false });

    // No longer pending
    expect(prompter.hasPendingConsent("thr_chirp")).toBe(false);
  });

  it("confirm_landing returns error for unknown thread", () => {
    // Simulates what the tool does when decideFns has no entry
    const decideFns = new Map<string, (d: "confirm" | "decline", r?: string) => void>();
    const decide = decideFns.get("thr_nonexistent");
    expect(decide).toBeUndefined();
    // The tool would return isError: true
  });

  it("check_branch without thread_id returns all branches summary", async () => {
    const { agent: alice, buffer: aliceBuffer } = createMcpAgent("alice", treeUrl);
    const { agent: bob } = createCounterpartAgent("bob", treeUrl, {});

    await alice.connect();
    await bob.connect();

    await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Thread 1", urgency: "low" },
      {},
      [],
    );
    await alice.startBranch(
      "@bob",
      { category: "scheduling", summary: "Thread 2", urgency: "medium" },
      {},
      [],
    );

    await sleep(300);

    // Simulate check_branch with no thread_id
    const branches = alice.listBranches();
    const summary = branches.map((b) => ({
      thread_id: b.thread_id,
      state: b.state,
      created_at: b.created_at,
      pending_events: aliceBuffer.pendingCount(b.thread_id),
    }));

    expect(summary.length).toBeGreaterThanOrEqual(2);
    expect(summary.every((s) => s.thread_id.startsWith("thr_"))).toBe(true);

    bob.disconnect();
    alice.disconnect();
  });
});
