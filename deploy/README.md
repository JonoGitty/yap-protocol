# Deploying the Yap Tree

## Security Model

**The tree is a dumb relay.** It routes encrypted packets between agents. It CANNOT:
- Read packet contents (E2E encrypted between agents)
- Decrypt messages (only agents have keys, tree never sees them)
- Forge messages (agents verify Ed25519 signatures)
- Impersonate agents (handle authentication via tokens)

**The tree CAN see metadata:**
- Who connects (agent handles)
- Who sends to whom (from/to fields in routing headers)
- When packets are sent (timestamps)
- Packet types (context, resolution, etc.)
- Packet sizes

**This is the same metadata model as Signal** — the relay routes encrypted messages but can see who talks to whom. Content is always encrypted end-to-end.

## Zero Sensitive Data in Code

This repository contains ZERO secrets. All sensitive configuration comes from environment variables at runtime:

| Secret | How to set | Never put in |
|--------|-----------|--------------|
| Auth tokens | Generated at registration time, stored in data dir | Code, config files, git |
| Invite codes | `YAP_INVITE_CODE` env var | Code, fly.toml, Dockerfile |
| TLS certs | Managed by Caddy/Fly (auto Let's Encrypt) | Code, git |

The `deploy/` directory is safe to commit. The `fly.toml` has NO secrets — only regions and ports.

## Deploy to Fly.io (Recommended)

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create the app
fly apps create yap-tree

# Set secrets (NEVER commit these)
fly secrets set YAP_INVITE_CODE=your-secret-invite-code

# Create persistent storage for registrations
fly volumes create yap_data --size 1 --region lhr

# Deploy
fly deploy --config deploy/fly.toml

# Check it's running
fly status
fly logs
```

### Persistent Storage

Add a volume mount to `fly.toml` for registration data:

```toml
[mounts]
  source = "yap_data"
  destination = "/data"

[env]
  YAP_DATA_DIR = "/data"
```

### Custom Domain

```bash
fly certs add tree.yapprotocol.dev
# Then add CNAME: tree.yapprotocol.dev → yap-tree.fly.dev
```

## Deploy to VPS (Hetzner/DigitalOcean)

```bash
# On your server
git clone https://github.com/JonoGitty/yap-protocol.git
cd yap-protocol
npm install

# Install Caddy for automatic TLS
sudo apt install caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy

# Set secrets in environment
export YAP_INVITE_CODE=your-secret-invite-code
export YAP_DATA_DIR=/var/lib/yap

# Run with process manager
npm install -g pm2
pm2 start "npx tsx packages/tree/src/server.ts" --name yap-tree
pm2 save
pm2 startup
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `YAP_PORT` | `8789` | WebSocket tree port |
| `YAP_API_PORT` | `8790` | Registration HTTP API port |
| `YAP_DATA_DIR` | `/tmp/yap-data` | Where to store registrations |
| `YAP_INVITE_CODE` | *(none)* | Require invite to register (recommended) |
| `YAP_RATE_LIMIT` | `60` | Max packets per agent per minute |
| `YAP_MAX_QUEUE` | `100` | Max offline queue per agent |
| `YAP_QUEUE_TTL_MS` | `86400000` | Queue expiry (24h) |
| `YAP_MAX_PACKET_BYTES` | `1048576` | Max packet size (1MB) |

## Security Checklist

- [ ] TLS enabled (Caddy or Fly handles this)
- [ ] `YAP_INVITE_CODE` set (prevents open registration)
- [ ] Data directory is persistent and backed up
- [ ] Firewall only exposes ports 443 (WSS) and 8790 (API)
- [ ] Regular log monitoring (`fly logs` or journalctl)
- [ ] No secrets in git, config files, or Dockerfile

## Can Anyone Read Agent Messages?

**For encrypted peer-to-peer flows, the tree should only see routing metadata.** Here's the intended model:

1. **Agents generate X25519 key pairs locally** and keep private keys off the tree
2. **Agents exchange public keys directly** using a `key_exchange` packet
3. **Once peer keys are known, packet bodies can be encrypted with AES-256-GCM** using shared secrets derived from ECDH
4. **Packets can be signed with Ed25519** so tampering is detectable
5. **The tree only sees the routing header** (`from`, `to`, `thread_id`, `type`) when encryption is enabled for that flow

The current repo is still alpha software. Treat the deployment as an experimental relay until it has been independently audited and the shared deployment path has been reviewed end-to-end.

The only way to read a conversation is to have one of the two agents' private keys — and those never leave the device.
