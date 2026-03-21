# Yap Protocol — Roadmap

## What's Done

### Phase 1 — Proof of Concept
- [x] Tree relay server (WebSocket routing, offline queue)
- [x] Core SDK (types, client, packet construction, branch lifecycle)
- [x] Dinner scheduler example (two agents, end-to-end)

### Phase 2 — Minimum Viable Protocol
- [x] Full negotiation loops (chirp → check → respond)
- [x] Comfort zone (3-tier permissions: always_share / ask_first / never_share)
- [x] Consent prompting (terminal, auto-approve, MCP)
- [x] Resolution and confirmation flow
- [x] Thread timeouts and loop limits (8 round trips, staleness timeout)
- [x] Reconnection with exponential backoff
- [x] Error handling (tree error responses, malformed packet handling)

### Phase 3 — Integrations
- [x] Claude MCP server (10 tools, prompts, resources)
- [x] OpenClaw skill (command parser, messaging prompter)
- [x] Zero-config MCP (auto-starts embedded tree, auto-detects handle)

### Phase 4 — Protocol Expansion
- [x] 5 new examples (briefing, invoice, questionnaire, report, presentation feedback)
- [x] Version handshake (v0.2, capability negotiation, forward compat)
- [x] Per-relationship permission overrides
- [x] Multi-party branches (coordinator, aggregation, quorum, transfer)
- [x] Flock memory (relationship learning, pattern tracking, context caching)
- [x] Dynamic schema negotiation (typed fields, service integrations, conflict resolution)
- [x] Shared nests (persistent workspaces, per-field versioning)
- [x] Context drift and branch forking

### Phase 5 — Security Hardening
- [x] E2E encryption wired in (X25519 + AES-256-GCM, auto key exchange)
- [x] Ed25519 packet signing
- [x] Perfect forward secrecy (ephemeral keys per thread)
- [x] Encrypted keystore at rest (scrypt + AES-256-GCM)
- [x] Prompt injection prevention (13 patterns, auto-sanitise)
- [x] Replay detection (packet ID tracking)
- [x] Rate limiting (client + tree, dual-layer)
- [x] Agent blocklist with persistence
- [x] Packet size + depth limits
- [x] Strict timestamp validation (drops, not warns)
- [x] Handle uniqueness (tree rejects duplicates)
- [x] Coordinator verification for multi-party
- [x] Audit logging (structured JSON events)
- [x] Data deletion API (purgeAgent)
- [x] Token-based tree authentication
- [x] Federation with signed packet hops
- [x] Handle registration HTTP API
- [x] Service visibility (trust-gated, 4 tiers)
- [x] Contact list with explicit trust management

### Deployment
- [x] Dockerfile (Alpine, non-root, health check)
- [x] Fly.io config (fly.toml)
- [x] Caddy config (auto TLS, security headers)
- [x] Production server entry point
- [x] Zero secrets in code (.gitignore blocks all data files)
- [x] Domain: yapprotocol.dev (bought)

---

## What's Next

### Handle System & Identity
- [ ] **Unique handle enforcement** — tree guarantees no two users share the same @handle (registration API already validates, needs persistence across restarts)
- [ ] **Handle reservation** — reserve your handle before anyone else
- [ ] **Handle search** — `GET /search?q=jono` fuzzy search on the tree
- [ ] **Contact list in Claude** — Claude stores known handles locally, suggests them when you say "yap with Bob"
- [ ] **Share links** — `yapprotocol.dev/@jono` pages for sharing your handle
- [ ] **QR codes** — generate scannable codes for in-person contact exchange

### Going Live
- [ ] **Deploy public tree** at `tree.yapprotocol.dev` (Fly.io)
- [ ] **DNS setup** for tree.yapprotocol.dev and api.yapprotocol.dev
- [ ] **Invite system** — soft launch with invite codes
- [ ] **npm publish** — `@yap-protocol/sdk` and `@yap-protocol/tree`
- [ ] **MCP server on npm** — `npx @yap-protocol/mcp` just works globally

### Claude-Native Experience
- [ ] **Contact management via Claude** — "add @bob to my contacts", "who do I know?"
- [ ] **Smart handle resolution** — "yap with Bob" → Claude checks contacts for a Bob
- [ ] **Yap notifications** — Claude proactively tells you when a yap arrives
- [ ] **Conversation history** — Claude remembers past yaps with each contact
- [ ] **Service integration prompts** — "we're scheduling, should I check your calendar?"

### Identity & Trust (Medium Term)
- [ ] **Email-linked handles** — verify email to claim a handle, friends find you by email
- [ ] **Social proof** — link GitHub, Twitter, etc. to your handle
- [ ] **Web of trust** — contacts vouch for each other
- [ ] **Reputation scores** — based on successful completions, not time

### Federation (Long Term)
- [ ] **Cross-tree discovery** — find `@bob@other-tree.com` handles
- [ ] **Global handle directory** (opt-in) — search across all trees
- [ ] **Tree reputation** — which trees are trusted relays
- [ ] **mTLS between trees** — cryptographic peer verification
- [ ] **Metadata privacy** — onion routing between trees

### Governance
- [ ] **Independent security audit**
- [ ] **Tree operator certification**
- [ ] **Privacy policy templates**
- [ ] **Incident response playbook**
- [ ] **CVE coordination process**

### Marketing & Community
- [ ] **Demo video** — 60-second dinner scheduling flow
- [ ] **yapprotocol.dev website** — landing page, docs, examples
- [ ] **Show HN** post
- [ ] **Discord/community** for developers
- [ ] **Blog** — "Why agents shouldn't write emails"
