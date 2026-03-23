import { describe, it, expect, afterEach } from "vitest";
import WebSocket from "ws";
import { createTree, type TreeInstance } from "../src/index.js";

let tree: TreeInstance;
let portCounter = 19200;

function nextPort(): number {
  return portCounter++;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectAgent(port: number, handle: string, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let url = `ws://localhost:${port}?handle=${encodeURIComponent(handle)}`;
    if (token) url += `&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    let settled = false;
    ws.on("open", () => {
      // Wait a tick for potential immediate close (auth reject happens after open)
      setTimeout(() => {
        if (!settled && ws.readyState === WebSocket.OPEN) {
          settled = true;
          resolve(ws);
        }
      }, 50);
    });
    ws.on("error", (err) => { if (!settled) { settled = true; reject(err); } });
    ws.on("close", (code) => { if (!settled) { settled = true; reject(new Error(`Closed with code ${code}`)); } });
  });
}

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("waitForMessage timed out")), timeoutMs);
    ws.once("message", (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

// Tree prepends @ to handles, so connect with "alice" → tree registers as "@alice"
// Packets should use "@alice" in from/to fields to match.
function makePacket(from: string, to: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    protocol: "yap/0.2",
    packet_id: `pkt_${Math.random().toString(36).slice(2, 10)}`,
    thread_id: "thr_test",
    from,
    to,
    timestamp: new Date().toISOString(),
    type: "context",
    ...extra,
  });
}

describe("Tree relay — connection", () => {
  afterEach(async () => {
    if (tree) await tree.close();
  });

  it("accepts a valid connection", async () => {
    const port = nextPort();
    tree = createTree(port);
    const ws = await connectAgent(port, "alice");
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it("rejects connection with invalid token", async () => {
    const port = nextPort();
    // Token map keys must match what tree looks up: "@alice" (tree prepends @)
    const tokens = new Map([["@alice", "secret123"]]);
    tree = createTree(port, { authTokens: tokens });

    await expect(connectAgent(port, "alice", "wrong_token")).rejects.toThrow();
  });

  it("accepts connection with valid token", async () => {
    const port = nextPort();
    const tokens = new Map([["@alice", "secret123"]]);
    tree = createTree(port, { authTokens: tokens });

    const ws = await connectAgent(port, "alice", "secret123");
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});

describe("Tree relay — routing", () => {
  afterEach(async () => {
    if (tree) await tree.close();
  });

  it("routes a packet from alice to bob", async () => {
    const port = nextPort();
    tree = createTree(port);

    const alice = await connectAgent(port, "alice");
    const bob = await connectAgent(port, "bob");

    const msgPromise = waitForMessage(bob);
    alice.send(makePacket("@alice", "@bob"));

    const received = await msgPromise;
    expect(received.from).toBe("@alice");
    expect(received.to).toBe("@bob");

    alice.close();
    bob.close();
  });

  it("queues packets for offline agents and delivers on connect", async () => {
    const port = nextPort();
    tree = createTree(port);

    const alice = await connectAgent(port, "alice");
    // Bob is offline — send a packet
    alice.send(makePacket("@alice", "@bob"));
    await sleep(200);

    // Bob comes online — set up message listener on raw WS before connection completes
    // because the tree flushes queued packets immediately on connect.
    const received: Record<string, unknown>[] = [];
    const bobUrl = `ws://localhost:${port}?handle=bob`;
    const bobWs = new WebSocket(bobUrl);
    bobWs.on("message", (data) => {
      received.push(JSON.parse(data.toString()));
    });
    await new Promise<void>((resolve) => bobWs.on("open", () => resolve()));
    await sleep(200);

    expect(received.length).toBeGreaterThan(0);
    expect(received[0].from).toBe("@alice");

    alice.close();
    bobWs.close();
  });
});

describe("Tree relay — rate limiting", () => {
  afterEach(async () => {
    if (tree) await tree.close();
  });

  it("rate limits excessive senders", async () => {
    const port = nextPort();
    tree = createTree(port, { rateLimitPerMinute: 3 });

    const alice = await connectAgent(port, "alice");

    const errors: Record<string, unknown>[] = [];
    alice.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "error") errors.push(msg);
    });

    // Send 5 packets (limit is 3/min)
    for (let i = 0; i < 5; i++) {
      alice.send(makePacket("@alice", "@bob"));
    }

    await sleep(300);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) =>
      e.error_code === "RATE_LIMITED" || (e.message as string)?.includes("Rate"),
    )).toBe(true);

    alice.close();
  });
});

describe("Tree relay — packet validation", () => {
  afterEach(async () => {
    if (tree) await tree.close();
  });

  it("rejects oversized packets", async () => {
    const port = nextPort();
    tree = createTree(port, { maxPacketBytes: 100 });

    const alice = await connectAgent(port, "alice");
    const errorPromise = waitForMessage(alice);

    const bigPayload = "x".repeat(200);
    alice.send(JSON.stringify({
      protocol: "yap/0.2",
      packet_id: "pkt_big",
      thread_id: "thr_big",
      from: "@alice",
      to: "@bob",
      timestamp: new Date().toISOString(),
      type: "context",
      context: { data: bigPayload },
    }));

    const error = await errorPromise;
    expect(error.type).toBe("error");

    alice.close();
  });

  it("rejects malformed JSON", async () => {
    const port = nextPort();
    tree = createTree(port);

    const alice = await connectAgent(port, "alice");
    const errorPromise = waitForMessage(alice);

    alice.send("not json at all{{{");

    const error = await errorPromise;
    expect(error.type).toBe("error");

    alice.close();
  });

  it("rejects packets without 'to' field", async () => {
    const port = nextPort();
    tree = createTree(port);

    const alice = await connectAgent(port, "alice");
    const errorPromise = waitForMessage(alice);

    alice.send(JSON.stringify({
      protocol: "yap/0.2",
      packet_id: "pkt_noto",
      thread_id: "thr_noto",
      from: "@alice",
      timestamp: new Date().toISOString(),
      type: "context",
    }));

    const error = await errorPromise;
    expect(error.type).toBe("error");

    alice.close();
  });
});

describe("Tree relay — duplicate sessions", () => {
  afterEach(async () => {
    if (tree) await tree.close();
  });

  it("rejects duplicate handle with error", async () => {
    const port = nextPort();
    tree = createTree(port);

    const alice1 = await connectAgent(port, "alice");
    expect(alice1.readyState).toBe(WebSocket.OPEN);

    // Second connection with same handle should be rejected
    await expect(connectAgent(port, "alice")).rejects.toThrow();

    // Original connection should still be open
    expect(alice1.readyState).toBe(WebSocket.OPEN);

    alice1.close();
  });
});
