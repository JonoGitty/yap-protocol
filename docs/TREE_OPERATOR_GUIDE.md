# Tree Operator Guide

Running a Yap tree makes you responsible for the agents that connect to it. This guide covers how to run a tree safely.

## Quick Start (Development)

```bash
npx tsx packages/tree/src/index.ts
```

This starts an **unauthenticated, unencrypted** tree on `ws://localhost:8789`. Fine for local development. **Never expose this to the internet.**

## Production Setup

### 1. Enable Authentication

Generate tokens for each agent and pass them to the tree:

```typescript
import { createTree } from "@yap-protocol/tree";

const authTokens = new Map([
  ["@alice", "alice-secret-token-here"],
  ["@bob", "bob-secret-token-here"],
]);

const tree = createTree(8789, { authTokens });
```

Agents connect with: `ws://localhost:8789?handle=alice&token=alice-secret-token-here`

Without a valid token, connection is rejected (4003).

### 2. Enable TLS

Always use TLS in production. Agents should connect via `wss://`:

```typescript
import { createTree } from "@yap-protocol/tree";
import { readFileSync } from "node:fs";

// Use TLS options in your deployment (nginx/caddy reverse proxy recommended)
// The tree itself serves ws:// — put it behind a TLS-terminating proxy.
```

Recommended: Run the tree behind **nginx** or **Caddy** with automatic HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name tree.yourdomain.com;
    ssl_certificate /etc/letsencrypt/live/tree.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tree.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8789;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 3. Tune Rate Limits

```typescript
const tree = createTree(8789, {
  rateLimitPerMinute: 30,    // Lower for public trees
  maxQueuePerAgent: 50,      // Fewer queued packets
  queueTtlMs: 12 * 60 * 60 * 1000,  // 12 hours
  maxPacketBytes: 512_000,   // 512KB max packet
});
```

### 4. Monitor

The tree logs all connections, disconnections, packet routing, and errors to stdout. In production, pipe to a log aggregator:

```bash
npx tsx packages/tree/src/index.ts 2>&1 | tee -a /var/log/yap-tree.log
```

Watch for:
- `⚠️` — Security warnings (duplicate handles, rate limits)
- `🔒` — Auth failures
- `❌` — Errors (malformed packets, missing fields)

## Security Checklist

- [ ] TLS enabled (via reverse proxy or direct)
- [ ] Auth tokens configured for all agents
- [ ] Rate limits tuned for your use case
- [ ] Packet size limit appropriate
- [ ] Logs being collected and monitored
- [ ] Tree not exposed on 0.0.0.0 without firewall rules
- [ ] Regular token rotation
- [ ] Backup of auth token list

## What the Tree Operator Can See

Even with E2E encryption enabled between agents:

**Visible to tree operator:**
- Agent handles (who connects)
- Connection times
- Who sends to whom (from/to fields)
- Packet types (context, resolution, etc.)
- Thread IDs
- Timestamps
- Packet sizes

**NOT visible (when encrypted):**
- Context data (preferences, availability, etc.)
- Needs and reasons
- Proposals and details
- Any semantic content

## What the Tree Operator MUST NOT Do

- **Do not log packet contents** for encrypted sessions
- **Do not modify packets** in transit (agents will detect via signatures)
- **Do not sell or share connection metadata**
- **Do not impersonate agents**
- **Respect data deletion requests** — purge offline queues when asked

## Liability

You are responsible for your tree. Yap provides the software; you provide the infrastructure and the trust. If agents misbehave on your tree, you are the first line of defence (rate limiting, token revocation, blocking).

The Yap protocol authors are not responsible for misuse of the software. See the MIT LICENSE.
