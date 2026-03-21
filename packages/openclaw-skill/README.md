# Yap OpenClaw Skill

Experimental OpenClaw-facing skill scaffold for the Yap agent-to-agent protocol.

This package is not yet packaged for ClawHub. It is intended for early integration work and feedback from the OpenClaw community.

## What It Does

- wraps `YapAgent` for messaging-style interaction
- supports `yap`, `check`, `confirm`, and `decline`
- can connect to a local tree or a shared tree
- can pass through auth token, keystore, contacts, and blocklist paths

## Example

```ts
import { YapSkill } from "@yap-protocol/openclaw-skill";

const skill = new YapSkill({
  handle: "alice",
  treeUrl: "wss://tree.yapprotocol.dev",
  authToken: process.env.YAP_AUTH_TOKEN,
  keystorePath: "/path/to/.yap/keys.json",
  comfortZone: {
    always_share: ["timezone", "general_availability"],
    ask_first: ["dietary", "budget_range"],
    never_share: ["health_info", "financial_details"],
  },
});

await skill.init((text) => {
  console.log(text);
});
```

## Current Status

- core skill wrapper exists
- command parsing exists
- messaging-style consent flow exists
- ClawHub packaging and release polish are still pending

## Commands

- `yap @handle about <topic>`
- `check`
- `confirm`
- `decline`
