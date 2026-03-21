# Yap — Full Project Plan

**"Let your agents yap so you don't have to"**

## 1. What Yap Is (The Elevator Pitch)

**Yap is an open protocol that lets AI agents talk to each other on your behalf.**

You tell your agent what you need. Your agent yaps at their agent. They negotiate, swap context, figure it out. You get a popup when they've agreed on something. One tap to confirm. Done.

No emails. No back-and-forth texts. No "does Tuesday work?" "no how about Wednesday?" "what time?" "6?" "can we do 7?" — your agents handle all of that in seconds.

Yap works with OpenClaw, Claude, and any AI agent that speaks the protocol.

## 2. Naming and Vocabulary

Everything in the Yap ecosystem uses consistent, memorable language:

| Protocol term | Yap term | Description |
|---|---|---|
| Context packet | **Yap** | A structured blob of context sent between agents |
| Relay server | **The Tree** | The server that routes yaps between agents |
| Thread | **Branch** | A conversation thread between agents |
| Agent address | **Handle** | Your agent's address (e.g. `@jono` on `yap.dev`) |
| Context request | **Chirp** | When an agent asks for more context |
| Resolution | **Landing** | When agents agree on an outcome |
| Consent prompt | **Check** | A popup asking the user to approve sharing something |
| Permission tiers | **Comfort zone** | What you're happy sharing vs what needs approval |
| Relationship memory | **Flock memory** | What your agent remembers about interactions with another agent |
| Shared context space | **Nest** | A persistent shared workspace between agents |
| OpenClaw skill name | **yap** | Three letters, easy to install |

This vocabulary is used in docs and the SDK, but the protocol wire format stays technical (JSON with standard field names). The vocabulary is for humans, not for the wire.

## 3. GitHub Organisation Structure

**Organisation:** `github.com/yapprotocol`

### Repositories

```
yapprotocol/
├── spec                    # The protocol specification
│   ├── README.md           # Overview + link to full spec
│   ├── SPEC.md             # Full protocol spec (v0.2)
│   ├── CHANGELOG.md        # Version history
│   └── examples/           # Example yap packets as JSON files
│       ├── scheduling.json
│       ├── negotiation-loop.json
│       ├── multi-party.json
│       └── resolution.json
│
├── sdk                     # Node.js SDK (@yap-protocol/sdk)
│   ├── src/
│   │   ├── client.ts       # WebSocket connection to the tree
│   │   ├── yap.ts          # Yap (context packet) construction + validation
│   │   ├── branch.ts       # Branch (thread) lifecycle management
│   │   ├── permissions.ts  # Comfort zone (permission tier) logic
│   │   ├── crypto.ts       # E2E encryption (Phase 4)
│   │   ├── memory.ts       # Flock memory (relationship memory)
│   │   └── types.ts        # TypeScript type definitions
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   └── tests/
│
├── tree                    # Reference relay server
│   ├── src/
│   │   ├── server.ts       # WebSocket server
│   │   ├── router.ts       # Yap routing logic
│   │   ├── queue.ts        # Offline message queue
│   │   ├── registry.ts     # Agent handle registration
│   │   └── auth.ts         # Challenge-response authentication
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── README.md
│   └── tests/
│
├── openclaw-skill          # OpenClaw skill integration
│   ├── SKILL.md            # OpenClaw skill definition
│   ├── src/
│   │   ├── skill.ts        # Skill entry point
│   │   ├── handlers.ts     # Incoming/outgoing yap handlers
│   │   └── ui.ts           # Check (consent prompt) formatting
│   └── README.md
│
├── claude-integration      # Claude MCP server for Yap
│   ├── src/
│   │   ├── mcp-server.ts   # MCP server exposing Yap as tools
│   │   ├── tools.ts        # Tool definitions (send_yap, check_branch, etc.)
│   │   └── bridge.ts       # Bridge between MCP tool calls and SDK
│   ├── README.md
│   └── claude_desktop_config.json  # Example config
│
├── examples                # Working demos
│   ├── dinner-scheduler/   # Two agents schedule dinner
│   ├── game-night/         # Multi-party game night coordination
│   └── project-sync/       # Shared nest for project collaboration
│
├── .github/
│   ├── CONTRIBUTING.md
│   ├── CODE_OF_CONDUCT.md
│   └── ISSUE_TEMPLATE/
│       ├── bug_report.md
│       ├── feature_request.md
│       └── protocol_change.md
│
└── website                 # yap.dev marketing site
    ├── index.html
    └── docs/
```

## 4. The README

```markdown
# Yap

**Let your agents yap so you don't have to.**

Yap is an open protocol for AI agents to talk to each other on your behalf.

You tell your agent what you need. Your agent yaps at their agent.
They figure it out. You get a popup when they've agreed on something.

## The problem

Alice tells her AI: "sort out dinner with Bob on Friday."
Her AI drafts a polite email. Bob's AI reads the email,
strips out the pleasantries, extracts the intent, and drafts a reply.

That's insane. The structured intent existed at step one.
It got deliberately degraded into prose, sent across the internet,
and reconstructed at the other end.

## The fix

With Yap, Alice's agent sends Bob's agent a structured context packet:
availability, preferences, constraints. Bob's agent responds with
Bob's availability and preferences. The agents negotiate directly —
swapping context, requesting what's missing, reaching agreement.

Both humans get a simple confirmation popup. One tap. Done.

## How it works

1. Your agent connects to a **Tree** (relay server) via WebSocket
2. Agents send each other **Yaps** (structured context packets)
3. If an agent needs more info, it sends a **Chirp** (context request)
4. Your agent checks your **Comfort Zone** (permission tiers) before sharing
5. When agents agree, they propose a **Landing** (resolution)
6. You get a **Check** (confirmation popup). One tap to approve.

The Tree is deliberately dumb — it routes encrypted packets and nothing else.
Your data stays between you and the person you're coordinating with.

## Works with

- **OpenClaw** — install the `yap` skill from ClawHub
- **Claude** — add the Yap MCP server to Claude Desktop
- **Any agent** — use the SDK to add Yap to any Node.js agent

## Quick start

### OpenClaw
Send your agent: "install yap from ClawHub"

### Claude (MCP)
Add to your claude_desktop_config.json:
{
  "mcpServers": {
    "yap": {
      "command": "npx",
      "args": ["@yap-protocol/mcp-server"]
    }
  }
}

### SDK
npm install @yap-protocol/sdk

## The protocol

Yap is MIT licensed. The full spec is at SPEC.md.

## Status

Phase 1 — Proof of concept
Two agents, one tree, scheduling scenario, working end-to-end.

Roadmap:
- Phase 2: Agent registration, negotiation loops, permission tiers
- Phase 3: OpenClaw skill + Claude MCP server
- Phase 4: Encryption, relationship memory, multi-party, shared nests
```

## 5. Claude Integration — The MCP Approach

Since you want this to work with Claude, the cleanest path is an MCP server. This means Claude can send and receive yaps natively through tool use.

### How it works for a Claude user

User in Claude Desktop says: "Schedule dinner with Bob on Friday"

Claude calls the `send_yap` MCP tool:

```json
{
  "tool": "send_yap",
  "input": {
    "to": "@bob",
    "intent": "scheduling",
    "context": {
      "event_type": "dinner",
      "proposed_date": "2026-03-27",
      "time_windows": ["18:00-21:00"],
      "dietary": ["vegetarian"]
    },
    "needs": ["time_windows", "dietary", "location_preference"]
  }
}
```

The MCP server:

1. Connects to the user's configured tree via the SDK
2. Constructs a full yap packet with proper metadata
3. Sends it to Bob's agent
4. Waits for response (async — returns a branch_id)
5. When Bob's agent responds, the MCP server surfaces it to Claude
6. Claude presents the result to the user naturally

### MCP tools exposed

| Tool | What it does |
|---|---|
| `send_yap` | Send a context packet to another agent |
| `check_branch` | Check status of an ongoing branch (thread) |
| `respond_to_chirp` | Provide requested context (after user approval) |
| `confirm_landing` | Approve a proposed resolution |
| `decline_landing` | Decline with optional reason class |
| `list_branches` | See all active branches |
| `set_comfort_zone` | Update permission tiers |
| `get_flock_memory` | View relationship memory for a contact |

### Why MCP not an OpenClaw skill for Claude?

Claude Desktop doesn't run OpenClaw. MCP is Claude's native extension mechanism. But the MCP server uses the exact same SDK and protocol as the OpenClaw skill. Both are first-class citizens — different entry points, same protocol.

## 6. OpenClaw Integration

### Skill installation

User sends their OpenClaw agent (via WhatsApp, Telegram, etc.): "install yap"

OpenClaw fetches the skill from ClawHub, installs it, and connects to the default public tree at `wss://tree.yap.dev`.

### How it works for an OpenClaw user

User sends via WhatsApp: "yap @bob about dinner friday"

OpenClaw's Yap skill:

1. Enriches context from the user's calendar, preferences, location
2. Constructs a yap packet
3. Sends via WebSocket to the tree
4. Handles incoming chirps (context requests) automatically where pre-authorised
5. Surfaces checks (consent prompts) via the messaging platform
6. Presents landings (resolutions) for confirmation

### Consent prompts in messaging apps

Since OpenClaw runs through messaging apps, checks look like:

```
Bob's agent is asking for:

  Dietary preferences (to pick a restaurant)
  How you're getting there (to set the radius)

Reply:
1 — Share both (vegetarian, driving)
2 — Share dietary only
3 — Share transport only
4 — Don't share either
```

User replies "1" and the skill continues.

## 7. The Tree (Relay Server)

### Public tree

Yap ships with a default public tree at `tree.yap.dev` for getting started. Free tier, rate limited, no SLA. Good enough for personal use and testing.

### Self-hosted tree

Anyone can run their own tree:

```
docker run -p 8789:8789 yapprotocol/tree
```

Or deploy to any VPS, Cloudflare Workers, fly.io, Railway, etc.

### Tree federation (Phase 4+)

Like email servers, trees can federate. `@alice@tree.yap.dev` can yap at `@bob@company-tree.example.com`. The trees route between each other.

This means no single entity controls the network. Companies can run private trees for internal use while still interoperating with the public network.

## 8. Launch Strategy

### Week 1: Spec + GitHub

1. Create `yapprotocol` GitHub org
2. Publish spec repo with full v0.2 specification
3. Publish a clean README with the "problem → fix → how it works" structure
4. Post to OpenClaw Discord for early feedback on the spec
5. Create a simple landing page at yap.dev (or yapprotocol.dev)

### Week 2-3: Phase 1 Build

1. Build the tree (relay server) — Node.js + WebSocket
2. Build the SDK — TypeScript, packet construction + validation
3. Build the dinner-scheduler example — two agents, one tree
4. Record a 60-second demo video showing the flow end-to-end
5. Everything pushed to GitHub as it's built — build in public

### Week 4: Show HN + OpenClaw

1. Post "Show HN: Yap — open protocol for AI agents to talk to each other"
   - Link to GitHub, demo video, working example
   - Explain the gap: enterprise has A2A, consumers have nothing
2. Publish OpenClaw skill to ClawHub
3. Post demo to OpenClaw Discord with installation instructions
4. Share on X/Twitter with demo video

### Week 5-6: Claude Integration

1. Build and publish the MCP server
2. Write setup guide for Claude Desktop
3. Post to Claude community / r/ClaudeAI
4. Reach out to Anthropic DevRel (MCP team) — they actively promote interesting MCP servers

### Week 7+: Community Building

1. Respond to GitHub issues and PRs
2. Build more examples (game night, project sync)
3. Start Phase 2 (registration, full negotiation loops, permission tiers)
4. Encourage community contributions for other agent integrations (GPT agents, Gemini, LangChain, CrewAI)

### Ongoing: Content

- Blog posts explaining the protocol design decisions
- "Why your AI shouldn't be writing emails" — the thesis post
- Tutorials for building custom integrations
- Monthly protocol update posts

## 9. Domain + Accounts

### Domain options (check availability and buy)

Priority order:

1. `yap.dev` — cleanest possible. Premium but worth it if available.
2. `yapprotocol.dev` — clear, available as a backup
3. `getyap.dev` — action-oriented alternative
4. `useyap.dev` — same energy

### Accounts to create

- GitHub org: `yapprotocol`
- npm org: `@yap-protocol` (for scoped packages)
- X/Twitter: `@yapprotocol`
- Discord: Yap Protocol server (or channel in OpenClaw Discord initially)
- Domain: whichever from above

## 10. Costs Summary

### Phase 1 (Weeks 1-3)

| Item | Cost |
|---|---|
| Domain name | £10-50/year |
| GitHub org | Free |
| npm org | Free |
| VPS for public tree (Hetzner CX22) | £4/month |
| LLM API costs for testing | £10-20 |
| **Total** | **~£30-70 to launch** |

### Phase 2-3 (Weeks 4-6)

| Item | Cost |
|---|---|
| VPS (same) | £4/month |
| LLM API costs | £10-20/month |
| **Total** | **~£15-25/month** |

### Phase 4+ (Scale)

| Item | Cost |
|---|---|
| Larger VPS or managed hosting | £20-50/month |
| Database for registration | £10-15/month |
| Monitoring/logging | £0-10/month |
| **Total** | **~£30-75/month** |

If it gets real traction: Move the public tree to Cloudflare Workers (pay-per-request, scales automatically). Introduce premium tier to offset costs. But this is a problem for later — right now the goal is ship the spec, build Phase 1, and get agents talking.

## 11. What Happens If a Big Company Ships This

**Scenario 1: They build proprietary (most likely)**

Meta builds agent-to-agent for Meta AI users only. OpenAI builds it for ChatGPT agents only. Google builds it for Gemini only. Apple builds it for Siri only.

**Yap's position:** The open bridge between all of them. Just like email works across Gmail, Outlook, and ProtonMail. Users with OpenClaw agents can yap at users with Claude agents. The proprietary versions can't do that.

**Scenario 2: They adopt/extend Yap**

A big company decides Yap is the standard and builds on top of it. This is the best outcome — you're the SMTP of agent communication.

**Scenario 3: They build open (unlikely)**

A big company open-sources their own competing protocol. This is where first-mover advantage matters — if Yap already has 10,000 agents on the network and an active community, switching costs are real.

**Scenario 4: Acqui-hire (Moltbook precedent)**

Moltbook went from launch to Meta acquisition in 7 weeks. If Yap gets traction, the same could happen. Open-source MIT licence means the protocol survives regardless — but the team and hosted infrastructure have acquisition value.

## 12. Immediate Next Steps

1. **Create GitHub org** — `yapprotocol`
2. **Register npm org** — `@yap-protocol`
3. **Buy domain** — check yap.dev availability
4. **Publish spec** — clean up v0.2 spec with Yap vocabulary
5. **Start building Phase 1** — tree + SDK + dinner example
6. **Record demo** — 60 seconds showing two agents scheduling dinner
7. **Ship it** — Show HN, OpenClaw Discord, X/Twitter

The spec is written. The plan is written. The name is chosen. Time to build.
