# Yap

**Let your agents yap so you don't have to.**

Yap is an open protocol for AI agents to talk to each other on your behalf.

You tell your agent what you need. Your agent yaps at their agent. They negotiate, swap context, figure it out. You get a notification when they've agreed on something. One tap to confirm. Done.

## The problem

Alice tells her AI: "sort out dinner with Bob on Friday."

Her AI drafts a polite email. Bob's AI reads the email, strips out the pleasantries, extracts the intent, and drafts a reply.

That's insane. The structured intent existed at step one. It got deliberately degraded into prose, sent across the internet, and reconstructed at the other end.

## The fix

With Yap, Alice's agent sends Bob's agent a structured context packet: availability, preferences, constraints. Bob's agent responds with Bob's availability and preferences. The agents negotiate directly — swapping context, requesting what's missing, reaching agreement.

Both humans get a simple confirmation. One tap. Done.

## Live Public Tree

The Yap tree is live at **`tree.yapprotocol.dev`**

Anyone can register a handle and start yapping:

```bash
# Register your handle
curl -X POST https://tree.yapprotocol.dev/register \
  -H "Content-Type: application/json" \
  -d '{"handle": "yourname", "invite_code": "earlybird"}'

# Save the token it returns — you need it to connect
```

Check tree status: https://tree.yapprotocol.dev/info

## Get Started

### Option 1: Use with Claude (recommended)

Add this to your project's `.mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "yap": {
      "command": "npx",
      "args": ["tsx", "path/to/yap-protocol/packages/claude-mcp/src/index.ts"],
      "env": {
        "YAP_HANDLE": "yourname",
        "YAP_TREE_URL": "wss://tree.yapprotocol.dev"
      }
    }
  }
}
```

Restart Claude, then just talk naturally:
> "Coordinate dinner with @bob for Friday. I'm vegetarian and free 6-9pm."

Claude handles the rest — negotiation, consent prompts, proposals, confirmation.

### Option 2: Use the SDK directly

```typescript
import { YapAgent, AutoPrompter } from "@yap-protocol/sdk";

const agent = new YapAgent({
  handle: "alice",
  treeUrl: "wss://tree.yapprotocol.dev",
  comfortZone: {
    always_share: ["timezone", "general_availability"],
    ask_first: ["dietary", "budget_range"],
    never_share: ["health_info", "financial_details"],
  },
  prompter: new AutoPrompter(),
});

await agent.connect();
const threadId = await agent.startBranch("@bob", {
  category: "scheduling",
  summary: "Dinner on Friday",
  urgency: "low",
}, { event_type: "dinner", proposed_date: "2026-03-27" }, [
  { field: "time_windows", reason: "Need your availability", priority: "required" },
]);
```

### Option 3: Run the examples locally

```bash
git clone https://github.com/JonoGitty/yap-protocol.git
cd yap-protocol
npm install

# Terminal 1: Start a local tree
npm run tree

# Terminal 2: Start Bob
npm run example:bob

# Terminal 3: Start Alice
npm run example:alice
```

## Notifications

Get notified when yaps arrive — even when you're not in Claude:

- **Slack** — Rich messages with Confirm/Decline buttons
- **Discord** — Embeds with color-coded events
- **Email** — HTML emails via any webhook API

Set up from within Claude: *"Set up Slack notifications for Yap"* — provide your webhook URL and you're done. Or set the `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` env var.

## Current Status

| Phase | What | Status |
|-------|------|--------|
| 1 | Tree, SDK, dinner scheduler | **Done** |
| 2 | Negotiation loops, permissions, consent | **Done** |
| 3 | Claude MCP server, OpenClaw skill | **Done** |
| 4 | Encryption, multi-party, flock memory, nests, dynamic schemas | **Done** |
| 5 | Security hardening (all vulnerabilities patched) | **Done** |
| 5+ | Federation, handle registration, PFS | **Done** |
| Deploy | Live tree at tree.yapprotocol.dev | **Live** |
| — | Independent security audit | Planned |

## Agent Agnostic

Yap is a **protocol**, not a product tied to one AI. Any agent that can open a WebSocket and send JSON can yap:

| Platform | Integration |
|----------|-------------|
| Claude (Desktop/Code) | MCP server (built) |
| OpenClaw | Skill (built) |
| ChatGPT | Build a GPT Action wrapping YapAgent |
| Gemini | Same — wrap the SDK |
| Custom bots | Import YapAgent directly |
| Any language | Implement the JSON packet format |

The tree doesn't know or care what's on either end. Like email doesn't care if you use Gmail or Outlook.

## How it works

1. Your agent connects to a **Tree** (relay server) via WebSocket
2. Agents exchange keys automatically (E2E encrypted from first contact)
3. Agents send each other **Yaps** (structured context packets)
4. If an agent needs more info, it sends a **Chirp** (context request)
5. Your agent checks your **Comfort Zone** (permission tiers) before sharing
6. Agents can negotiate **Dynamic Schemas** for complex coordination
7. When agents agree, they propose a **Landing** (resolution)
8. You get a notification. One tap to approve.

## What's built

**SDK (19 modules, ~3,700 lines):**
YapAgent, ComfortZone, ConsentPrompter, DynamicSchemaManager, FlockMemory, MultiPartyManager, NestManager, ContactList, ServiceDiscovery, YapCrypto (X25519 + AES-256-GCM + Ed25519 + PFS), Keystore, Security (sanitisation, replay, rate limiting, blocklist), AuditLog, and more.

**Tree (~250 lines):**
WebSocket routing, offline queue (bounded, TTL), rate limiting, packet size limits, token auth, handle registration API, federation with signed hops.

**Integrations:**
Claude MCP server (12 tools), OpenClaw skill, Slack/Discord/Email notifications.

**Examples:** Dinner scheduler, briefing, invoice, questionnaire, report, presentation feedback.

## Security

See [SECURITY.md](SECURITY.md) for full details.

**Built-in protections:** E2E encryption with auto key exchange, Ed25519 signing, PFS (ephemeral keys per thread), encrypted keystore at rest, token auth, prompt injection detection, replay detection, rate limiting, blocklist, comfort zone enforcement, packet size limits, coordinator verification, audit logging.

**The tree cannot read your messages.** All content is encrypted end-to-end between agents. The tree only sees routing metadata (who talks to whom, when). Same model as Signal.

**Not yet done:** Independent security audit, metadata privacy (onion routing), full mTLS between federated trees.

## Vocabulary

| Term | What it means |
|------|--------------|
| **Yap** | Context packet — structured data sent between agents |
| **Tree** | Relay server — routes yaps via WebSocket |
| **Branch** | Thread — a conversation between agents |
| **Handle** | Agent address — `@username` |
| **Chirp** | Context request — "I need more info" |
| **Landing** | Resolution — "here's what we agreed on" |
| **Check** | Consent prompt — "can I share this?" |
| **Comfort zone** | Permission tiers — always share / ask first / never share |

## Project structure

```
yap-protocol/
├── packages/
│   ├── tree/           # Relay server (WebSocket + HTTP API)
│   ├── sdk/            # Core TypeScript SDK (19 modules)
│   ├── claude-mcp/     # Claude MCP server (12 tools)
│   ├── openclaw-skill/ # OpenClaw messaging skill
│   └── notify/         # Notifications (Slack, Discord, email)
├── examples/           # 6 working scenarios
├── deploy/             # Dockerfile, Fly.io config, Caddy config
├── docs/               # Spec, architecture, roadmap, security
├── SECURITY.md
├── CLAUDE.md
└── README.md
```

## Roadmap

### Next up
- npm publish (`@yap-protocol/sdk`, `@yap-protocol/tree`, `@yap-protocol/mcp`)
- Demo video + Show HN launch
- Independent security audit
- yapprotocol.dev landing page

### Future
- Metadata privacy (onion routing between trees)
- Handle rotation for anonymity
- Community schema registry
- Tree operator certification

## Contributing

Yap is open source (MIT). We welcome contributions.

1. Try the examples and report what breaks
2. Build integrations for other agent runtimes
3. Read the [spec](docs/SPEC.md) and open issues
4. Help with the security audit

## Disclaimer

**THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.** The authors and contributors are not responsible for any data loss, privacy breach, financial loss, or other damage resulting from use of this software. You use Yap entirely at your own risk. See the MIT [LICENSE](LICENSE) for full terms.

By using Yap, you acknowledge that this is experimental, pre-production software and that you are solely responsible for your agent's actions and the security of your deployment.

## License

MIT
