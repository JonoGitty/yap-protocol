# Yap Vocabulary

Consistent terminology used across all docs, code, and user-facing content.

## Core Terms

| Yap term | Protocol equivalent | Description | Used in code as |
|---|---|---|---|
| **Yap** | Context packet | A structured blob of context sent between agents | `Yap`, `YapPacket` |
| **Tree** | Relay server | The WebSocket server that routes yaps | `Tree`, `TreeServer` |
| **Branch** | Thread | A conversation thread between agents | `Branch` |
| **Handle** | Agent address | An agent's identity on the network (`@jono`) | `Handle` |
| **Chirp** | Context request | A request for more context from another agent | `Chirp` |
| **Landing** | Resolution | A proposed outcome that agents agreed on | `Landing` |
| **Check** | Consent prompt | A popup asking the user to approve sharing | `Check` |
| **Comfort zone** | Permission tiers | What a user is happy to share vs what needs approval | `ComfortZone` |
| **Flock memory** | Relationship memory | What an agent remembers about another agent | `FlockMemory` |
| **Nest** | Shared context space | A persistent shared workspace between agents | `Nest` |
| **Roost** | Agent instance | A running agent connected to a tree | `Roost` |

## Wire Format Terms

In the actual JSON packets sent over the wire, we use technical names:

| Wire field | Yap term | Example value |
|---|---|---|
| `type: "context"` | Yap | — |
| `type: "context_request"` | Chirp | — |
| `type: "resolution"` | Landing | — |
| `type: "resolution_response"` | — | `status: "confirmed"` or `"declined"` |
| `type: "intent_update"` | — | When a branch's purpose changes |
| `type: "thread_fork"` | Branch fork | When a branch splits |
| `thread_id` | Branch ID | `"thr_x9y8z7"` |
| `packet_id` | Yap ID | `"pkt_a1b2c3"` |
| `from` / `to` | Handle | `"@alice"` |

## Priority Levels (for Chirps)

| Level | Meaning | Agent behaviour |
|---|---|---|
| `required` | Can't proceed without it | Branch stalls until provided or declined |
| `helpful` | Would significantly improve outcome | Agent prompts user if not pre-authorised |
| `nice_to_have` | Would refine outcome | Only shared if already in `always_share` |

## Branch States

| State | Description |
|---|---|
| `INITIATED` | First yap sent |
| `NEGOTIATING` | Agents exchanging context (may loop) |
| `PROPOSED` | Landing generated, awaiting confirmation |
| `CONFIRMED` | All parties confirmed |
| `EXECUTING` | Actions being carried out |
| `COMPLETED` | All actions succeeded |
| `DECLINED` | A party declined or branch timed out |
| `FAILED` | An action failed during execution |
| `STALLED` | No response within timeout period |

## Comfort Zone Tiers

| Tier | Behaviour | Default contents |
|---|---|---|
| `always_share` | Sent automatically, no check needed | timezone, general availability |
| `ask_first` | Triggers a check (consent prompt) | dietary, budget, location, transport |
| `never_share` | Excluded silently, no hint given | health, financial, private conversations |

## Naming in Code

- TypeScript types/interfaces: PascalCase (`YapPacket`, `Branch`, `ComfortZone`)
- JSON wire format: snake_case (`thread_id`, `packet_id`, `time_windows`)
- SDK methods: camelCase (`sendYap()`, `checkBranch()`, `confirmLanding()`)
- Event names: dot-separated (`branch.created`, `yap.received`, `landing.proposed`)
- File names: kebab-case (`yap-packet.ts`, `comfort-zone.ts`, `flock-memory.ts`)

## Tone of Voice

- Casual and clear, not corporate
- Technical where it needs to be, friendly everywhere else
- The README should make someone smile, the spec should make them nod
- Never: "leverage", "synergise", "ecosystem" (except when literally describing an ecosystem)
- Always: plain English, short sentences, concrete examples
