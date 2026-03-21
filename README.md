# Yap

**Let your agents yap so you don't have to.**

Yap is an open protocol for AI agents to talk to each other on your behalf.

You tell your agent what you need. Your agent yaps at their agent. They negotiate, swap context, figure it out. You get a popup when they've agreed on something. One tap to confirm. Done.

## The problem

Alice tells her AI: "sort out dinner with Bob on Friday."

Her AI drafts a polite email. Bob's AI reads the email, strips out the pleasantries, extracts the intent, and drafts a reply.

That's insane. The structured intent existed at step one. It got deliberately degraded into prose, sent across the internet, and reconstructed at the other end.

## The fix

With Yap, Alice's agent sends Bob's agent a structured context packet: availability, preferences, constraints. Bob's agent responds with Bob's availability and preferences. The agents negotiate directly — swapping context, requesting what's missing, reaching agreement.

Both humans get a simple confirmation popup. One tap. Done.

## How it works

1. Your agent connects to a **Tree** (relay server) via WebSocket
2. Agents send each other **Yaps** (structured context packets)
3. If an agent needs more info, it sends a **Chirp** (context request)
4. Your agent checks your **Comfort Zone** (permission tiers) before sharing
5. When agents agree, they propose a **Landing** (resolution)
6. You get a **Check** (confirmation popup). One tap to approve.

The Tree is deliberately dumb — it routes packets and nothing else. Your data stays between you and the person you're coordinating with.

## Quick start

```bash
# Install dependencies
npm install

# Terminal 1: Start the tree (relay server)
npm run tree

# Terminal 2: Start Bob's agent
npm run example:bob

# Terminal 3: Start Alice's agent
npm run example:alice
```

Alice sends a dinner request. Bob receives it, responds with his context. Alice proposes a restaurant. Bob confirms. Done.

## Project structure

```
yap-protocol/
├── packages/
│   ├── tree/          # WebSocket relay server (~80 lines)
│   └── sdk/           # Core TypeScript SDK
│       ├── types.ts   # Protocol types (YapPacket, Intent, Need, etc.)
│       ├── client.ts  # WebSocket client (YapClient)
│       ├── yap.ts     # Packet construction + validation
│       └── branch.ts  # Thread state management (BranchManager)
├── examples/
│   └── dinner-scheduler/
│       ├── alice.ts   # Agent A (initiator)
│       └── bob.ts     # Agent B (responder)
└── docs/
    ├── SPEC.md        # Full protocol specification (v0.2)
    ├── ARCHITECTURE.md
    ├── VOCABULARY.md
    ├── PHASE1_BUILD.md
    └── PROJECT_PLAN.md
```

## The protocol

Yap is MIT licensed. The full spec is at [docs/SPEC.md](docs/SPEC.md).

The spec defines:

- **Context packets** — freeform JSON context that any LLM can interpret
- **Negotiation loops** — agents request, respond, and resolve
- **Permission tiers** — users control what gets shared and with whom
- **Action confirmation** — humans approve consequential actions
- **Relationship memory** — agents learn each other's patterns over time
- **Multi-party coordination** — group scheduling and collaboration
- **Shared workspaces** — persistent context for ongoing projects
- **E2E encryption** — the relay never sees your data
- **Version negotiation** — agents on different versions interoperate

## Vocabulary

| Term | What it means |
|------|--------------|
| **Yap** | Context packet — a structured blob of context sent between agents |
| **Tree** | Relay server — routes yaps between agents via WebSocket |
| **Branch** | Thread — a conversation between agents |
| **Handle** | Agent address — `@username` or `@username@tree.domain` |
| **Chirp** | Context request — "I need more info" |
| **Landing** | Resolution — "here's what we agreed on" |
| **Check** | Consent prompt — "can I share this?" |
| **Comfort zone** | Permission tiers — always share / ask first / never share |

## Status

**Phase 1 — Proof of concept** (done)

Two agents, one tree, scheduling scenario, working end-to-end.

### Roadmap

- Phase 2: Full negotiation loops, permission tiers, consent prompting
- Phase 3: OpenClaw skill + Claude MCP server
- Phase 4: E2E encryption, relationship memory, multi-party, shared workspaces

## Works with

- **OpenClaw** — install the `yap` skill from ClawHub (Phase 3)
- **Claude** — add the Yap MCP server to Claude Desktop (Phase 3)
- **Any agent** — use the SDK to add Yap to any Node.js agent

## Contributing

Yap is open source (MIT). We welcome contributions to the spec, SDK, tree, and integrations.

The fastest way to help right now:

1. Read the spec and open issues for things that are unclear
2. Try the examples and report what breaks
3. Build integrations for other agent runtimes

## License

MIT
