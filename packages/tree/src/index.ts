import { WebSocketServer, WebSocket } from "ws";
import { URL } from "node:url";

interface QueuedPacket {
  data: string;
  timestamp: string;
}

export interface TreeConfig {
  /** Maximum packets queued per offline agent. Default: 100. */
  maxQueuePerAgent?: number;
  /** Maximum age of queued packets in ms. Default: 24 hours. */
  queueTtlMs?: number;
  /** Maximum packets per agent per minute. Default: 60. */
  rateLimitPerMinute?: number;
  /** Maximum packet size in bytes. Default: 1MB. */
  maxPacketBytes?: number;
  /** Auth tokens: handle → token. If set, connections require valid token. */
  authTokens?: Map<string, string>;
}

export interface TreeInstance {
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
}

const DEFAULT_CONFIG = {
  maxQueuePerAgent: 100,
  queueTtlMs: 24 * 60 * 60 * 1000,
  rateLimitPerMinute: 60,
  maxPacketBytes: 1_048_576, // 1MB
};

export function createTree(port: number, userConfig?: TreeConfig): TreeInstance {
  const config = { ...DEFAULT_CONFIG, ...userConfig };
  const agents = new Map<string, WebSocket>();
  const offlineQueue = new Map<string, QueuedPacket[]>();
  const rateCounts = new Map<string, { count: number; windowStart: number }>();

  const wss = new WebSocketServer({ port });

  // Periodic queue cleanup — expire old packets
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - config.queueTtlMs;
    for (const [handle, queue] of offlineQueue) {
      const filtered = queue.filter((p) => new Date(p.timestamp).getTime() > cutoff);
      if (filtered.length === 0) {
        offlineQueue.delete(handle);
      } else {
        offlineQueue.set(handle, filtered);
      }
    }
  }, 60 * 1000); // Every minute

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", `http://localhost:${port}`);
    const handle = url.searchParams.get("handle");

    if (!handle) {
      console.log("❌ Connection rejected: no handle provided");
      ws.close(4000, "Missing handle query parameter");
      return;
    }

    const agentHandle = `@${handle}`;

    // Token authentication (if configured)
    if (config.authTokens) {
      const token = url.searchParams.get("token");
      const expected = config.authTokens.get(agentHandle) ?? config.authTokens.get(handle);
      if (!expected || expected !== token) {
        console.log(`🔒 ${agentHandle} rejected: invalid or missing auth token`);
        ws.close(4003, "Authentication failed");
        return;
      }
    }

    // Check if handle is already connected (prevent spoofing)
    const existing = agents.get(agentHandle);
    if (existing && existing.readyState === WebSocket.OPEN) {
      console.log(`⚠️ ${agentHandle} already connected — rejecting duplicate`);
      ws.send(JSON.stringify({
        protocol: "yap/0.2",
        type: "error",
        error_code: "HANDLE_IN_USE",
        message: `Handle ${agentHandle} is already connected from another session`,
      }));
      ws.close(4001, "Handle already in use");
      return;
    }

    agents.set(agentHandle, ws);
    console.log(`✅ ${agentHandle} connected`);

    // Flush queued packets (with TTL filter)
    const queued = offlineQueue.get(agentHandle);
    if (queued && queued.length > 0) {
      const cutoff = Date.now() - config.queueTtlMs;
      const valid = queued.filter((p) => new Date(p.timestamp).getTime() > cutoff);
      console.log(`📬 Flushing ${valid.length} queued yap(s) to ${agentHandle} (${queued.length - valid.length} expired)`);
      for (const packet of valid) {
        ws.send(packet.data);
      }
      offlineQueue.delete(agentHandle);
    }

    ws.on("message", (data) => {
      const raw = data.toString();

      // Packet size limit
      if (raw.length > config.maxPacketBytes) {
        ws.send(JSON.stringify({
          protocol: "yap/0.2",
          type: "error",
          error_code: "PACKET_TOO_LARGE",
          message: `Packet exceeds ${config.maxPacketBytes} bytes (got ${raw.length})`,
        }));
        return;
      }

      // Rate limiting
      const now = Date.now();
      const rateEntry = rateCounts.get(agentHandle);
      if (rateEntry && now - rateEntry.windowStart < 60000) {
        rateEntry.count++;
        if (rateEntry.count > config.rateLimitPerMinute) {
          ws.send(JSON.stringify({
            protocol: "yap/0.2",
            type: "error",
            error_code: "RATE_LIMITED",
            message: `Rate limit exceeded (${config.rateLimitPerMinute}/min). Slow down.`,
          }));
          return;
        }
      } else {
        rateCounts.set(agentHandle, { count: 1, windowStart: now });
      }

      let packet: { to?: string; type?: string; packet_id?: string };
      try {
        packet = JSON.parse(raw);
      } catch {
        console.error(`❌ Malformed JSON from ${agentHandle}`);
        ws.send(JSON.stringify({
          protocol: "yap/0.2",
          type: "error",
          error_code: "MALFORMED_PACKET",
          message: "Could not parse packet as JSON",
        }));
        return;
      }

      const target = packet.to;
      if (!target) {
        console.error(`❌ Packet from ${agentHandle} missing 'to' field`);
        ws.send(JSON.stringify({
          protocol: "yap/0.2",
          type: "error",
          error_code: "MISSING_RECIPIENT",
          message: "Packet missing 'to' field",
        }));
        return;
      }

      console.log(`📨 ${agentHandle} → ${target} [${packet.type ?? "unknown"}] (${packet.packet_id ?? "no-id"})`);

      const targetWs = agents.get(target);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(raw);
      } else {
        // Queue with size limit
        const queue = offlineQueue.get(target) ?? [];
        if (queue.length >= config.maxQueuePerAgent) {
          // Drop oldest
          queue.shift();
          console.log(`⚠️ Queue full for ${target}, dropped oldest packet`);
        }
        queue.push({ data: raw, timestamp: new Date().toISOString() });
        offlineQueue.set(target, queue);
        console.log(`💤 ${target} is offline, queued (${queue.length}/${config.maxQueuePerAgent})`);
      }
    });

    ws.on("close", () => {
      agents.delete(agentHandle);
      console.log(`👋 ${agentHandle} disconnected`);
    });

    ws.on("error", (err) => {
      console.error(`❌ Error from ${agentHandle}:`, err.message);
    });
  });

  wss.on("error", (err) => {
    console.error("❌ Tree server error:", err.message);
  });

  return {
    wss,
    port,
    close: () => new Promise<void>((resolve) => {
      clearInterval(cleanupInterval);
      for (const client of wss.clients) {
        client.close();
      }
      wss.close(() => resolve());
    }),
  };
}

// Run as standalone server
const isMainModule = process.argv[1]?.includes("tree");
if (isMainModule) {
  const port = Number(process.env.YAP_PORT ?? 8789);
  const tree = createTree(port);
  console.log(`🌳 Tree listening on ws://localhost:${tree.port}`);
  console.log(`⚠️  WARNING: This tree is for development/testing only.`);
  console.log(`⚠️  Do NOT expose to the internet without authentication and TLS.`);
  console.log(`⚠️  Only connect agents you trust. You are responsible for your tree.`);
}
