# Yap Architecture

## System Overview

```
┌──────────────┐                         ┌──────────────┐
│   Roost A    │                         │   Roost B    │
│  (Agent A)   │◄─────── WebSocket ─────────►│  (Agent B)   │
│              │            │            │              │
│  LLM engine  │            │            │  LLM engine  │
│  Comfort zone│            │            │  Comfort zone│
│  Flock memory│            │            │  Flock memory│
└──────────────┘            │            └──────────────┘
                            │
                ┌───────────┴──────────┐
                │        Tree          │
                │   (Relay Server)     │
                │                      │
                │  WebSocket server    │
                │  Handle registry     │
                │  Yap router          │
                │  Offline queue       │
                └──────────────────────┘
```

## Decision Log

### Why a relay (not P2P direct)?

Consumer agents run on laptops, phones, Pis — behind NAT, dynamic IPs, sometimes offline. WebRTC could solve this but adds massive complexity (STUN/TURN servers, ICE negotiation). A simple WebSocket relay is:

- 200 lines of code
- Works everywhere
- Handles offline queuing naturally
- Can be federated later (like email servers)

The relay is deliberately dumb. It routes encrypted blobs. It cannot read content.

### Why WebSocket (not HTTP long-poll, SSE, or gRPC)?

- **Bidirectional.** Both sides can send at any time. HTTP requires the client to poll.
- **Persistent.** One connection, no reconnection overhead per message.
- **Simple.** Every language has a WebSocket library. No protobuf compilation.
- **Firewall-friendly.** Upgrades from HTTP, passes through most proxies.
- **Good enough.** We don't need gRPC's streaming sophistication or HTTP/2's multiplexing.

### Why freeform context (not typed schemas per intent)?

The whole point is that LLMs interpret context. If we define rigid schemas for "scheduling" vs "information sharing" vs "project coordination", we limit what agents can talk about to what we've pre-defined.

Instead, `context` is freeform JSON. The `intent.category` gives a hint, but the receiving LLM reads the entire context blob and figures out what to do. This means:

- New use cases work without protocol changes
- Different LLMs can interpret the same context differently (that's fine)
- The protocol never becomes the bottleneck for what agents can coordinate

Format hints (`_format_hints`) standardise dates, times, and currencies so structured fields parse reliably. Semantic fields stay natural language.

### Why three permission tiers (not more granular)?

Simplicity. Users need to understand and configure this without a manual. Three tiers map to natural human intuition:

- "Yeah always share that" (`always_share`)
- "Hmm, ask me first" (`ask_first`)
- "Absolutely not" (`never_share`)

Per-relationship overrides (Phase 2+) add granularity without complicating the mental model.

### Why local-first flock memory (not server-side)?

Trust. If relationship memory is stored on the tree, the tree becomes a target. Local storage means:

- User has full control (can view, edit, delete)
- Tree compromise doesn't leak social graph
- No GDPR/data-protection concerns with the relay operator
- Each agent's memory is an asset of the user, not the platform

### Why monorepo?

The tree, SDK, OpenClaw skill, and Claude MCP server share types and test utilities. A monorepo with npm workspaces keeps them in sync without publish-and-install cycles during development. Published packages are independent — users install only what they need.

### Why TypeScript?

- OpenClaw is Node.js. Same runtime = native integration.
- Claude MCP servers are typically TypeScript. Same pattern.
- Type safety for the protocol packets prevents entire classes of bugs.
- Most agent developers in the OpenClaw community use TypeScript.

### Why not Rust/Go for the tree?

Premature optimisation. A Node.js WebSocket relay handling packet routing can serve thousands of concurrent connections on a $4/month VPS. If the tree becomes a bottleneck at scale, rewriting it in Rust is straightforward because the protocol is simple and the server is stateless. But for Phase 1-3, Node.js is fast enough and keeps the entire project in one language.

## Package Architecture

```
@yap-protocol/sdk           ← Core library. Everyone imports this.
  ├── types.ts               ← Shared TypeScript types (YapPacket, Branch, etc.)
  ├── client.ts              ← WebSocket connection to tree
  ├── yap.ts                 ← Packet construction + validation
  ├── branch.ts              ← Branch lifecycle management
  ├── permissions.ts         ← Comfort zone logic
  ├── memory.ts              ← Flock memory (local storage)
  └── schema.ts              ← JSON validation for incoming packets

@yap-protocol/tree           ← Relay server. Imports nothing from SDK except types.
  ├── server.ts              ← WebSocket server setup
  ├── router.ts              ← Route yaps by handle
  ├── queue.ts               ← Offline message queue (in-memory for Phase 1)
  ├── registry.ts            ← Handle registration + lookup
  └── auth.ts                ← Basic token auth (Phase 1), signatures (Phase 4)

@yap-protocol/openclaw       ← OpenClaw skill. Imports SDK.
  ├── SKILL.md               ← OpenClaw skill definition
  ├── skill.ts               ← Entry point
  ├── handlers.ts            ← Map OpenClaw messages to SDK calls
  └── ui.ts                  ← Format checks as messaging-app-friendly text

@yap-protocol/claude-mcp     ← Claude MCP server. Imports SDK.
  ├── server.ts              ← MCP server entry point
  ├── tools.ts               ← Tool definitions (send_yap, confirm_landing, etc.)
  └── bridge.ts              ← Bridge MCP tool calls to SDK methods
```

## Data Flow: Scheduling Example

```
Alice (human)
  │ "sort out dinner with Bob on Friday"
  ▼
Alice's Agent (LLM)
  │ Enriches from calendar, preferences, comfort zone
  │ Constructs YapPacket
  ▼
SDK (client.ts)
  │ Validates packet, serialises to JSON
  │ Sends over WebSocket
  ▼
Tree (router.ts)
  │ Looks up @bob in handle registry
  │ Forwards packet to Bob's WebSocket connection
  │ (or queues if Bob is offline)
  ▼
SDK (client.ts) on Bob's side
  │ Receives, deserialises, validates
  ▼
Bob's Agent (LLM)
  │ Evaluates: do I have enough context?
  │ YES → construct Landing (resolution)
  │ NO  → construct Chirp (context request)
  ▼
  ... negotiation loops until resolved ...
  ▼
Both agents have a Landing
  │ Surface to humans as confirmation popup
  ▼
Alice: [Confirm] ← one tap
Bob:   [Confirm] ← one tap
  ▼
Agents execute actions (book table, add calendar events)
  ▼
Branch state → COMPLETED
```

## Wire Format Conventions

- All packets are JSON objects
- Top-level fields: `protocol`, `packet_id`, `thread_id`, `from`, `to`, `timestamp`, `type`
- `protocol` field: `"yap/0.2"` (version negotiation in Phase 4)
- `packet_id` format: `"pkt_"` + 8 random alphanumeric chars
- `thread_id` format: `"thr_"` + 8 random alphanumeric chars
- `from` / `to`: `"@username"` (single tree) or `"@username@tree.domain"` (federated)
- `timestamp`: ISO 8601 with timezone (`"2026-03-21T14:30:00Z"`)
- All field names: `snake_case`
- Packet max size: 64KB (configurable on tree)

## Security Model (Phase 4)

- **E2E encryption:** X25519 key exchange + XChaCha20-Poly1305
- **Agent identity:** Ed25519 signing keypair per agent
- **Key exchange:** on first interaction between two agents
- **Relay trust:** designed to be untrusted (blind packet routing)
- **Anti-abuse:** rate limiting, blocklists, reputation scores
