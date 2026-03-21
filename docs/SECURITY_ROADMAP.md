# Yap Security Roadmap

## Threat Model

Yap agents exchange structured context through a relay server (tree). The threat model considers:

1. **Malicious agents** — agents that try to extract data, inject prompts, or impersonate others
2. **Compromised tree** — relay operator who reads/modifies packets in transit
3. **Network attackers** — MITM, replay, eavesdropping
4. **Social engineering** — tricking users into sharing sensitive data through consent prompts

## What's Implemented (v0.2)

### Defence-in-depth layers

| Layer | Protection | Status |
|-------|-----------|--------|
| **Transport** | E2E encryption (X25519 + AES-256-GCM) | Wired in, auto key exchange |
| **Integrity** | Ed25519 packet signatures | Active during encryption |
| **Authentication** | Token-based tree auth | Active when configured |
| **Identity** | Handle uniqueness (no dups while online) | Active |
| **Privacy** | Comfort zone (never_share silently omitted) | Active |
| **Privacy** | Service visibility (trust-gated, 4 tiers) | Active |
| **Privacy** | Encrypted keystore at rest (scrypt + AES-256-GCM) | Active when passphrase set |
| **Injection** | Prompt injection detection (13 patterns) | Active, auto-sanitise |
| **Replay** | Packet ID tracking (1hr window, 10k cap) | Active, drops replays |
| **Timing** | Timestamp validation (5-min drift) | Active, drops invalid |
| **DoS** | Rate limiting (client + tree) | Active |
| **DoS** | Packet size limit (1MB default) | Active |
| **DoS** | Context depth limit (10 levels) | Active |
| **DoS** | Offline queue bounds (100/agent, 24hr TTL) | Active |
| **Abuse** | Agent blocklist | Active when configured |
| **Trust** | No auto trust escalation (explicit only) | Active |
| **Audit** | Structured security event logging | Active when configured |
| **Deletion** | purgeAgent() removes all traces | Active |
| **Multi-party** | Coordinator verification | Active |

### Key exchange flow

1. Agent A wants to send to Agent B for the first time
2. Agent A auto-sends a `key_exchange` packet with its public keys
3. Agent B receives, stores A's keys, responds with its own
4. Both derive shared secret via X25519 ECDH
5. All subsequent packets are encrypted + signed

### What the tree sees

Without encryption: everything (content, intent, needs, proposals).
With encryption: only routing headers (`from`, `to`, `thread_id`, `type`, `timestamp`).

## What's Planned (v0.3+)

### Phase 5A: Federation Security
- mTLS between trees
- Signed federation handshake
- Peer token authentication

### Phase 5B: Handle Registration
- HTTP `/register` endpoint
- Token generation with hash storage
- Email/phone verification (optional)

### Phase 5C: Perfect Forward Secrecy
- Ephemeral keys per thread
- Session key derivation
- Message-level ratcheting

### Phase 5D: Metadata Privacy
- Onion routing between trees
- Handle rotation
- Private relay mode

### Phase 5E: Governance
- Tree operator certification programme
- Privacy policy templates
- Incident response playbook
- CVE coordination process
- Regular dependency audits

## Known Limitations

1. **No independent audit** — use at your own risk
2. **Tree sees metadata** — who talks to whom, when, packet types
3. **No PFS** — static key pairs mean key compromise leaks history
4. **Federation trust** — DNS-based only, no cryptographic peer verification yet
5. **Key derivation** — uses SHA-256, not HKDF (acceptable but not optimal)
6. **No nonce uniqueness tracking** — relies on randomBytes entropy (2^-96 collision probability per AES-GCM, acceptable)

## Responsible Disclosure

Do NOT open public GitHub issues for vulnerabilities. Email the maintainers directly. We aim to respond within 72 hours and patch within 7 days for critical issues.
