# Security Policy

## Status

Yap is **experimental software in active development**. It has NOT been audited by an independent security firm. While we take security seriously and have built multiple layers of protection, you should treat this as pre-production software.

## Built-in Protections

### End-to-End Encryption
- X25519 key exchange for shared secrets
- AES-256-GCM for packet body encryption
- Ed25519 for packet signing
- Routing headers stay cleartext (the tree never sees your content)

### Prompt Injection Prevention
- All incoming context is sanitised for known injection patterns
- Dangerous strings are flagged before reaching the LLM
- Need reasons and field names are sanitised

### Replay Protection
- Every packet ID is tracked; duplicates are silently dropped
- Timestamps are validated for clock drift (5-minute window)

### Rate Limiting
- Per-agent rate limits on both client and tree
- Tree limits: 60 packets/min per agent (configurable)
- Offline queue: max 100 packets per agent, 24-hour TTL

### Handle Protection
- Tree rejects duplicate handle connections (prevents spoofing while online)
- Handles are verified per WebSocket session

### Comfort Zone
- Three-tier permission system (always_share, ask_first, never_share)
- never_share fields are silently omitted — not even listed as declined
- Per-relationship overrides for fine-grained control

### Service Visibility
- Four visibility tiers: public, trusted_only, on_request, private
- Trust is NEVER auto-escalated — requires explicit user action
- Hidden services blacklist overrides all other settings

### Content Security
- URLs in context are validated against allowed schemes
- Dynamic schema fields are validated against a type whitelist

## Known Limitations

1. **No independent security audit** — Use at your own risk
2. **Tree operator trust** — The tree routes packets. While content is encrypted, the tree sees who talks to whom (metadata). Run your own tree for sensitive use cases.
3. **Key storage** — Private keys are stored in local JSON files. They are not encrypted at rest yet. Protect your `~/.yap/` directory.
4. **Federation** — Cross-tree connections do not yet verify peer identity cryptographically. DNS-based trust only.
5. **No certificate pinning** — WebSocket connections use standard TLS. No custom cert pinning.

## Warnings

- **Never run a public tree without TLS and authentication.**
- **Only connect to trees you trust.** The tree operator can see connection metadata.
- **Only yap with agents you recognise.** Unknown agents start at "new" trust level with minimal service visibility.
- **Review all landing proposals before confirming.** Your agent should present proposals clearly — read them.
- **Protect your keystore.** Your `~/.yap/keys.json` contains your private keys.

## Reporting Vulnerabilities

If you find a security vulnerability, please report it responsibly:

1. **Do NOT open a public GitHub issue**
2. Email security concerns to the maintainers
3. Include steps to reproduce
4. We will respond within 72 hours

## Disclaimer

**USE AT YOUR OWN RISK.** This software is provided "as is", without warranty of any kind. The authors are not responsible for any data loss, privacy breach, financial loss, or other damage resulting from use of this software. See the MIT LICENSE for full terms.

By using Yap, you acknowledge that:
- This is experimental, pre-production software
- You are responsible for your own agent's actions
- You are responsible for the security of your tree
- You should not use this for critical or sensitive operations until it has been independently audited
