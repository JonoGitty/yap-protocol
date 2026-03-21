import { WebSocketServer, WebSocket } from "ws";
import { URL } from "node:url";

const PORT = Number(process.env.YAP_PORT ?? 8789);

interface QueuedPacket {
  data: string;
  timestamp: string;
}

// Handle → WebSocket connection
const agents = new Map<string, WebSocket>();

// Handle → queued packets for offline agents
const offlineQueue = new Map<string, QueuedPacket[]>();

const wss = new WebSocketServer({ port: PORT });

console.log(`🌳 Tree listening on ws://localhost:${PORT}`);

wss.on("connection", (ws, req) => {
  // Extract handle from query param: ws://localhost:8789?handle=alice
  const url = new URL(req.url ?? "", `http://localhost:${PORT}`);
  const handle = url.searchParams.get("handle");

  if (!handle) {
    console.log("❌ Connection rejected: no handle provided");
    ws.close(4000, "Missing handle query parameter");
    return;
  }

  const agentHandle = `@${handle}`;

  // Register the agent
  agents.set(agentHandle, ws);
  console.log(`✅ ${agentHandle} connected`);

  // Flush any queued packets
  const queued = offlineQueue.get(agentHandle);
  if (queued && queued.length > 0) {
    console.log(`📬 Flushing ${queued.length} queued yap(s) to ${agentHandle}`);
    for (const packet of queued) {
      ws.send(packet.data);
    }
    offlineQueue.delete(agentHandle);
  }

  // Handle incoming yaps
  ws.on("message", (data) => {
    const raw = data.toString();

    let packet: { to?: string; type?: string; packet_id?: string };
    try {
      packet = JSON.parse(raw);
    } catch {
      console.error(`❌ Malformed JSON from ${agentHandle}`);
      ws.send(JSON.stringify({
        protocol: "yap/0.1",
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
        protocol: "yap/0.1",
        type: "error",
        error_code: "MISSING_RECIPIENT",
        message: "Packet missing 'to' field",
      }));
      return;
    }

    console.log(`📨 ${agentHandle} → ${target} [${packet.type ?? "unknown"}] (${packet.packet_id ?? "no-id"})`);

    const targetWs = agents.get(target);
    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
      // Target is online — forward immediately
      targetWs.send(raw);
    } else {
      // Target is offline — queue
      console.log(`💤 ${target} is offline, queuing packet`);
      const queue = offlineQueue.get(target) ?? [];
      queue.push({ data: raw, timestamp: new Date().toISOString() });
      offlineQueue.set(target, queue);
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
