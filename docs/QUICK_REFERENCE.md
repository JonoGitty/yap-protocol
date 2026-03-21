# Yap — Quick Reference

## What

Open protocol for AI agents to talk to each other on behalf of their users.

## Why

Currently, AI drafts emails for other AI to parse. That's insane. Agents should exchange structured context directly.

## How

Agents send JSON context packets ("yaps") through a WebSocket relay ("tree"). They negotiate, swap context, agree on outcomes. Humans confirm with one tap.

## Stack

TypeScript, Node.js, WebSocket (ws library), npm workspaces monorepo.

## Vocabulary Cheat Sheet

- **Yap** = context packet
- **Tree** = relay server
- **Branch** = thread
- **Handle** = agent address (@username)
- **Chirp** = context request
- **Landing** = resolution/agreement
- **Check** = consent prompt
- **Comfort zone** = permission tiers
- **Flock memory** = relationship memory
- **Nest** = shared workspace
- **Roost** = running agent instance

## Packet Types

1. `context` — send structured context to another agent
2. `context_request` — ask for more context (chirp)
3. `context_response` — respond to a chirp with requested context
4. `resolution` — propose an agreed outcome (landing)
5. `resolution_response` — confirm or decline a landing
6. `intent_update` — change what a branch is about

## ID Formats

- **Packet:** `pkt_` + 8 alphanumeric (`pkt_a1b2c3d4`)
- **Thread:** `thr_` + 8 alphanumeric (`thr_x9y8z7w6`)
- **Handle:** `@username` or `@username@tree.domain`

## Branch Lifecycle

`INITIATED → NEGOTIATING ⇄ → PROPOSED → CONFIRMED → EXECUTING → COMPLETED`

## File Layout

```
yap/
├── CLAUDE.md                ← Main context (READ FIRST)
├── docs/
│   ├── SPEC.md              ← Full protocol spec
│   ├── ARCHITECTURE.md      ← Design decisions
│   ├── VOCABULARY.md        ← Naming conventions
│   ├── PHASE1_BUILD.md      ← What to build now
│   ├── PROJECT_PLAN.md      ← Launch strategy
│   └── QUICK_REFERENCE.md   ← This file
├── packages/
│   ├── tree/src/index.ts    ← Relay server (~150 lines)
│   ├── sdk/src/
│   │   ├── types.ts         ← All TypeScript types
│   │   ├── client.ts        ← WebSocket client
│   │   ├── yap.ts           ← Packet helpers
│   │   └── branch.ts        ← Thread state management
│   ├── openclaw-skill/      ← Phase 3
│   └── claude-mcp/          ← Phase 3
└── examples/
    └── dinner-scheduler/
        ├── alice.ts         ← Agent A (initiator)
        └── bob.ts           ← Agent B (responder)
```

## Commands

```
npm run tree            # Start the relay server
npm run example:bob     # Start Bob's agent (run second)
npm run example:alice   # Start Alice's agent (run third)
```
