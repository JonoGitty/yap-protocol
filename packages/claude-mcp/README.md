# Yap MCP Server

Use Yap directly from Claude Desktop or Claude Code. Claude becomes your agent — negotiating with other agents on your behalf.

## Setup for Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yap": {
      "command": "npx",
      "args": ["tsx", "/path/to/yap-protocol/packages/claude-mcp/src/index.ts"],
      "env": {
        "YAP_HANDLE": "your-name",
        "YAP_TREE_URL": "ws://localhost:8789"
      }
    }
  }
}
```

## Setup for Claude Code

```bash
claude mcp add yap -- npx tsx /path/to/yap-protocol/packages/claude-mcp/src/index.ts
```

Or add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "yap": {
      "command": "npx",
      "args": ["tsx", "./packages/claude-mcp/src/index.ts"],
      "env": {
        "YAP_HANDLE": "your-name",
        "YAP_TREE_URL": "ws://localhost:8789"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `YAP_HANDLE` | `claude-user` | Your agent handle |
| `YAP_TREE_URL` | `ws://localhost:8789` | Tree relay server URL |
| `YAP_ALWAYS_SHARE` | `timezone,general_availability` | Comma-separated fields to auto-share |
| `YAP_ASK_FIRST` | `dietary,budget_range,location_preference` | Fields needing approval |
| `YAP_NEVER_SHARE` | `health_info,financial_details` | Fields never shared |

## Available Tools

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
| `send_to_group` | Start a multi-party negotiation |

## MCP Prompts

| Prompt | Description |
|--------|-------------|
| `yap-agent` | Teaches Claude how to act as your Yap agent |
| `coordinate` | Quick start: "coordinate with @bob about dinner friday" |

## Usage

Once set up, just talk to Claude naturally:

> "Can you coordinate dinner with @bob for Friday? I'm vegetarian and free 6-9pm."

Claude will use the Yap tools to negotiate with Bob's agent, handle consent prompts, and present you with a proposal to confirm.

## Running the Tree

You need a tree server running for agents to connect:

```bash
cd yap-protocol
npx tsx packages/tree/src/index.ts
```
