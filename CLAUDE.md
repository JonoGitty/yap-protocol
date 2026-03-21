# CLAUDE.md — Yap Protocol Project Context

## What is Yap?

Yap is an open protocol for consumer AI agents to talk to each other on behalf of their users. Instead of humans drafting messages for other humans (or AI drafting messages for other AI to parse), agents exchange structured context packets ("yaps") directly through a lightweight relay server ("the tree").

**The one-line pitch:** "Let your agents yap so you don't have to."

## Project Structure

```
yap/
├── CLAUDE.md                ← You are here
├── docs/
│   ├── SPEC.md              ← Full protocol specification (v0.2)
│   ├── PROJECT_PLAN.md      ← Launch strategy, timeline, costs
│   ├── GAP_ANALYSIS.md      ← Market research proving the opportunity
│   ├── VOCABULARY.md        ← Yap-specific terminology
│   └── ARCHITECTURE.md      ← System architecture decisions
├── packages/
│   ├── tree/                ← Relay server (Node.js + WebSocket)
│   ├── sdk/                 ← Core TypeScript SDK
│   ├── openclaw-skill/      ← OpenClaw integration
│   └── claude-mcp/          ← Claude MCP server integration
├── examples/
│   ├── dinner-scheduler/    ← Two-agent scheduling demo
│   ├── game-night/          ← Multi-party coordination demo
│   └── project-sync/        ← Shared workspace demo
└── website/                 ← yapprotocol.dev marketing site
```

## Tech Stack

- **Language:** TypeScript throughout (Node.js runtime)
- **Relay server:** Node.js + `ws` (WebSocket library)
- **SDK:** TypeScript, zero external dependencies beyond `ws`
- **Package manager:** npm with workspaces (monorepo)
- **Build:** tsup or tsc
- **Testing:** vitest
- **Linting:** biome
- **Licence:** MIT

## Core Concepts

### The Yap (Context Packet)

The fundamental unit. A JSON blob containing:

- `intent` — what this is about (scheduling, sharing, coordinating)
- `context` — freeform key-value data (dates, preferences, constraints)
- `needs` — what the sender needs from the recipient
- `permissions` — what has been shared vs withheld

Context is deliberately freeform. The LLM on each side interprets it. No rigid schemas per intent type.

### The Tree (Relay Server)

A deliberately dumb WebSocket server that:

- Accepts agent connections
- Routes yaps by agent handle
- Queues yaps for offline agents
- Verifies signatures (Phase 4)
- NEVER reads packet contents (E2E encrypted in Phase 4)

### The Branch (Thread)

A conversation thread between agents. Lifecycle: `INITIATED → NEGOTIATING ⇄ (loops) → PROPOSED → CONFIRMED → EXECUTING → COMPLETED`

### The Chirp (Context Request)

When an agent needs more info, it sends a chirp specifying:

- What fields it needs
- Why (so the sender's agent can frame the consent prompt)
- Priority (`required` / `helpful` / `nice_to_have`)

### The Landing (Resolution)

When agents agree, they propose a landing with:

- A summary of what was agreed
- Details (venue, time, etc.)
- Alternatives
- Actions to execute on confirmation (book table, add calendar event)

### The Check (Consent Prompt)

A popup/message to the user asking permission to share specific context. Should be: one-tap, contextualised (show WHY it's being asked), batched.

### Comfort Zone (Permission Tiers)

Three tiers per user, with per-relationship overrides:

- `always_share` — sent automatically (timezone, general availability)
- `ask_first` — triggers a check (dietary, budget, location)
- `never_share` — excluded, no hint given (health, financial, private)

### Dynamic Schema Negotiation

When freeform context isn't structured enough for a complex task, agents negotiate a custom schema on the fly. One agent proposes typed fields, the other reviews/modifies/accepts, then both sides fill in the schema — yapping until 100% complete with all conflicts resolved. Schemas can include service integrations (Spotify, Google Maps, etc.). Proven schemas get cached in flock memory and reused. See `docs/DYNAMIC_SCHEMAS.md` for the full spec.

**Key principle: agents keep yapping until both sides report 100% schema completion. A branch MUST NOT reach PROPOSED while any field is unresolved.**

### Flock Memory (Relationship Memory)

Stored locally. Tracks patterns per relationship:

- What the other agent typically shares/declines
- Typical response times
- Learned preferences
- Trust level

### Agent Addressing

Format: `@username` (resolved against the tree the agent is connected to)

Full form: `@username@tree-domain` (for cross-tree federation, Phase 4+)

## Build Phases

### Phase 1 — Proof of Concept (NOW)

- Tree: WebSocket server, handle registration, yap routing, offline queue
- SDK: Connect to tree, construct/validate yaps, branch lifecycle
- Example: Two agents schedule dinner end-to-end via terminal

### Phase 2 — Minimum Viable Protocol

- Full negotiation loops (chirp → check → respond)
- Permission tiers (comfort zone) with consent prompting
- Resolution and confirmation flow
- Thread timeouts and loop limits
- Error handling (retry, reconnect, malformed packet handling)

### Phase 3 — Integrations

- OpenClaw skill (publish to ClawHub)
- Claude MCP server (publish to npm)
- Demo video and Show HN launch

### Phase 4 — Hardening

- E2E encryption (X25519 + XChaCha20-Poly1305)
- Flock memory (relationship learning)
- Per-relationship permission overrides
- Multi-party branches with coordinator role
- Context drift handling and branch forking
- Shared nests (persistent workspaces)
- Tree federation
- Version handshake and backwards compatibility

## Coding Guidelines

- Keep it simple. The tree should be <500 lines. The SDK should be <1000 lines for Phase 1.
- No over-engineering. No ORMs, no complex frameworks. `ws` for WebSockets, native Node.js for everything else.
- Type everything. Full TypeScript strict mode. Export types from the SDK.
- Test the protocol, not the plumbing. Integration tests that simulate two agents talking are more valuable than unit tests on packet construction.
- Error messages should be clear enough that an LLM can interpret them and self-correct.
- All JSON field names use `snake_case` in the wire format.
- Timestamps are ISO 8601 with timezone.
- IDs are prefixed: `pkt_` for packets, `thr_` for threads/branches, `hdl_` for handles.

## Key Files to Read First

1. `docs/SPEC.md` — The full protocol spec. This is the source of truth.
2. `docs/VOCABULARY.md` — The naming conventions.
3. `docs/ARCHITECTURE.md` — Why the architecture is the way it is.
4. This file — For quick reference while building.

## What NOT to Build

- No database for Phase 1. In-memory maps for handle registry and offline queue.
- No authentication beyond basic token for Phase 1.
- No encryption for Phase 1 (add in Phase 4).
- No web UI. Terminal prompts for human checkpoints in Phase 1.
- No rate limiting for Phase 1.
- No federation for Phase 1. Single tree instance.
