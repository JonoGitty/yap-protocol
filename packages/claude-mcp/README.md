# Yap MCP Server

Use Yap directly from Claude. Zero config — it starts its own tree, picks your username, and just works.

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yap": {
      "command": "npx",
      "args": ["tsx", "/path/to/yap-protocol/packages/claude-mcp/src/index.ts"]
    }
  }
}
```

That's it. No tree URL, no tokens. It auto-starts an embedded tree and uses your system username as your handle.

### Claude Code

Add `.mcp.json` to your project:

```json
{
  "mcpServers": {
    "yap": {
      "command": "npx",
      "args": ["tsx", "/path/to/yap-protocol/packages/claude-mcp/src/index.ts"]
    }
  }
}
```

### Optional Config

Set environment variables only if you need to override defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `YAP_HANDLE` | System username | Your agent handle |
| `YAP_TREE_URL` | Auto-start embedded tree | External tree URL (only if connecting to a shared tree) |
| `YAP_ALWAYS_SHARE` | `timezone,general_availability` | Auto-shared fields |
| `YAP_ASK_FIRST` | `dietary,budget_range,location_preference` | Fields needing approval |
| `YAP_NEVER_SHARE` | `health_info,financial_details` | Fields never shared |

## How It Works

1. MCP server starts → auto-starts an embedded tree (or connects to external one)
2. Connects as your agent handle
3. Claude gets 10 tools for the full Yap protocol
4. Just talk naturally: "Coordinate dinner with @bob for Friday"

## Tools

| Tool | What it does |
|------|-------------|
| `send_yap` | Start a negotiation with another agent |
| `check_branch` | Poll for updates on a thread |
| `respond_to_chirp` | Answer a context request |
| `propose_landing` | Propose an agreement |
| `confirm_landing` | Accept a proposal |
| `decline_landing` | Reject a proposal |
| `list_branches` | See all active negotiations |
| `set_comfort_zone` | Configure privacy preferences |
| `send_to_group` | Multi-party negotiation |
| `yap_status` | Check connection status |

## Connecting Multiple Agents

For agents to talk to each other, they need to be on the same tree:

**Local (same machine):** Both Claude sessions point to the same tree. Set `YAP_TREE_URL=ws://localhost:18790` on the second session (use the port from the first session's embedded tree).

**Remote (different machines):** Run a shared tree server and point both to it:
```bash
# On a server
npx tsx packages/tree/src/index.ts

# Both clients
YAP_TREE_URL=ws://your-server:8789
```

**Future:** We'll host a public tree at `tree.yap.dev` so agents find each other automatically.
