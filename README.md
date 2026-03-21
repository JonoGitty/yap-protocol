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

## Current Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Proof of concept — tree, SDK, dinner scheduler | **Done** |
| 2 | Negotiation loops, permission tiers, consent prompting | **Done** |
| 3 | Claude MCP server, OpenClaw skill | **Done** |
| 4 | Encryption, flock memory, multi-party, nests, dynamic schemas | **Done** |
| 5 | Security hardening — all vulnerabilities patched | **Done** |
| 5+ | Federation security, handle registration, PFS | **Done** |
| — | Independent security audit | Planned |
| — | Public tree deployment (tree.yapprotocol.dev) | Planned |

### What's built

**Core protocol:** Context packets, chirps (context requests), landings (resolutions), branch lifecycle, version negotiation (v0.2)

**SDK (17 modules, ~3,500 lines):**
- `YapAgent` — Full agent lifecycle with 15+ event handlers
- `ComfortZone` — 3-tier permissions with per-relationship overrides
- `ConsentPrompter` — Terminal, auto-approve, and MCP consent flows
- `DynamicSchemaManager` — On-the-fly schema negotiation with service integrations
- `FlockMemory` — Relationship learning, pattern tracking, promotion suggestions
- `MultiPartyManager` — Coordinator role, aggregation, quorum, transfer
- `NestManager` — Persistent shared workspaces with per-field versioning
- `ContactList` — Address book with trust levels and service tracking
- `ServiceDiscovery` — Proactive integration suggestions based on intent
- `YapCrypto` — X25519 + AES-256-GCM + Ed25519, per-thread ephemeral keys (PFS)
- `Keystore` — Encrypted key storage (scrypt + AES-256-GCM at rest)
- `Security` — Prompt injection prevention, replay detection, rate limiting, blocklist
- `AuditLog` — Structured security event logging

**Tree relay (~250 lines):**
- WebSocket routing, offline queue (bounded, TTL), rate limiting, packet size limits
- Token authentication, handle uniqueness, federation with peer auth
- Handle registration HTTP API (POST /register, GET /lookup)

**Integrations:**
- [Claude MCP server](packages/claude-mcp/) — 9 tools + prompts for Claude Desktop / Claude Code
- [OpenClaw skill](packages/openclaw-skill/) — Messaging-based wrapper with command parser

**Examples (6 scenarios):**
- [Dinner scheduler](examples/dinner-scheduler/) — Two-agent scheduling with consent
- [Briefing](examples/briefing/) — One-shot delivery with acknowledgment
- [Invoice](examples/invoice/) — Approval/revision + payment landing
- [Questionnaire](examples/questionnaire/) — Rich chirps with comfort zone tiers
- [Report](examples/report/) — Metrics delivery + drill-down follow-up
- [Presentation feedback](examples/presentation-feedback/) — Collaborative review

## How it works

1. Your agent connects to a **Tree** (relay server) via WebSocket
2. Agents exchange keys automatically (E2E encrypted from first contact)
3. Agents send each other **Yaps** (structured context packets)
4. If an agent needs more info, it sends a **Chirp** (context request)
5. Your agent checks your **Comfort Zone** (permission tiers) before sharing
6. Agents can negotiate **Dynamic Schemas** for complex coordination
7. When agents agree, they propose a **Landing** (resolution)
8. You get a **Check** (confirmation popup). One tap to approve.

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

## Use with Claude

Add the MCP server to Claude Desktop or Claude Code. Then just say:
> "Coordinate dinner with @bob for Friday. I'm vegetarian and free 6-9pm."

Claude handles the negotiation. See [packages/claude-mcp/README.md](packages/claude-mcp/README.md) for setup.

## Project structure

```
yap-protocol/
├── packages/
│   ├── tree/                # WebSocket relay server
│   │   ├── index.ts         # Tree with auth, rate limiting, queue management
│   │   ├── federation.ts    # Cross-tree routing with peer auth
│   │   └── registration.ts  # Handle registration HTTP API
│   ├── sdk/                 # Core TypeScript SDK (17 modules)
│   ├── claude-mcp/          # Claude MCP server (9 tools)
│   └── openclaw-skill/      # OpenClaw messaging skill
├── examples/                # 6 working scenarios
├── docs/
│   ├── SPEC.md              # Protocol specification (v0.2)
│   ├── DYNAMIC_SCHEMAS.md   # Dynamic schema negotiation spec
│   ├── ARCHITECTURE.md      # System architecture
│   ├── SECURITY_ROADMAP.md  # Security roadmap + threat model
│   ├── TREE_OPERATOR_GUIDE.md  # How to run a tree safely
│   └── ...
├── SECURITY.md              # Security policy + disclaimer
├── CLAUDE.md                # Project context for Claude Code
└── README.md
```

## Security

See [SECURITY.md](SECURITY.md) for full details. See [docs/SECURITY_ROADMAP.md](docs/SECURITY_ROADMAP.md) for the threat model and roadmap.

**Built-in protections:**
- E2E encryption (X25519 + AES-256-GCM) with auto key exchange
- Ed25519 packet signing
- Perfect forward secrecy (ephemeral keys per thread)
- Encrypted keystore at rest (scrypt + AES-256-GCM)
- Token-based tree authentication
- Prompt injection detection (13 patterns) + auto-sanitisation
- Replay detection (packet ID tracking)
- Rate limiting (client + tree, dual-layer)
- Agent blocklist with persistence
- Comfort zone enforcement (never_share silently omitted)
- Service visibility (trust-gated, 4 tiers)
- Packet size + depth limits
- Coordinator verification for multi-party
- Structured audit logging
- Handle registration with token generation
- Federation with signed packet hops

**Not yet done:**
- Independent security audit
- Metadata privacy (onion routing)
- Full mTLS between federated trees

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
| **Flock memory** | Relationship learning — what each agent typically shares/declines |
| **Nest** | Shared workspace — persistent context between agents |
| **Dynamic schema** | On-the-fly type negotiation for complex coordination |

## Roadmap

### Next up
- Public tree deployment at `tree.yapprotocol.dev`
- npm package publishing (`@yap-protocol/sdk`, `@yap-protocol/tree`)
- Demo video + Show HN launch
- Independent security audit

### Future
- Metadata privacy (onion routing between trees)
- Handle rotation for anonymity
- Tree operator certification
- Community schema registry

## Contributing

Yap is open source (MIT). We welcome contributions to the spec, SDK, tree, and integrations.

1. Read the spec and open issues for things that are unclear
2. Try the examples and report what breaks
3. Build integrations for other agent runtimes
4. Help with the security audit

## Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.** The authors and contributors are not responsible for any data loss, privacy breach, financial loss, or other damage resulting from use of this software. You use Yap entirely at your own risk. See the MIT [LICENSE](LICENSE) for full terms.

By using Yap, you acknowledge that this is experimental, pre-production software and that you are solely responsible for your agent's actions and the security of your deployment.

## License

MIT
