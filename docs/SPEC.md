# Agent-to-Agent Context Protocol (A2ACP)

## Technical Specification — Draft v0.2

## 1. Overview

A2ACP is a lightweight protocol for consumer AI agents to exchange **context packets** over a relay server. It is not a messaging protocol — it is a context negotiation protocol. Agents don't send "messages" to each other; they send structured context that the receiving agent interprets, evaluates, and acts upon.

The protocol handles four core flows:

1. **Context delivery** — Agent A sends a context packet to Agent B
2. **Context negotiation** — Agent B requests additional context from Agent A
3. **Consent gating** — Agent A checks user permissions before sharing requested context
4. **Action confirmation** — Agent surfaces a proposed outcome to its user for approval

## 2. Architecture

```
┌──────────────┐                         ┌──────────────┐
│   Agent A    │                         │   Agent B    │
│   (local)    │◄────── WebSocket ──────────►│   (local)    │
│              │            │            │              │
│  LLM engine  │            │            │  LLM engine  │
│  User prefs  │            │            │  User prefs  │
│  Permissions │            │            │  Permissions │
│  Memory      │            │            │  Memory      │
└──────────────┘            │            └──────────────┘
                            │
                ┌───────────┴──────────┐
                │    Relay Server      │
                │                      │
                │  - Connection mgmt   │
                │  - Message routing   │
                │  - Offline queue     │
                │  - Agent registry    │
                │  - E2E encrypted     │
                │    (relay is blind)  │
                └──────────────────────┘
```

### Why a relay (not peer-to-peer direct)

Consumer agents run on laptops, phones, Raspberry Pis — all behind NAT, on dynamic IPs, sometimes offline. A lightweight relay server solves this cleanly:

- Agents maintain persistent WebSocket connections to the relay
- The relay routes context packets by agent address
- If a target agent is offline, the relay queues packets and delivers on reconnect
- The relay **cannot read packet contents** — everything is end-to-end encrypted
- The relay is stateless beyond the queue — it doesn't store or process context

The relay is deliberately dumb. It's a pipe, not a brain.

## 3. Agent Addressing

Each agent gets an address in the format:

```
agent:<username>@<relay-domain>
```

Example: `agent:jono@a2acp.io`

### Registration flow

1. User creates an account on the relay (email + passkey, no passwords)
2. User's agent generates a keypair (Ed25519) locally
3. Public key is registered with the relay against the username
4. Agent connects to relay via WebSocket and authenticates using a signed challenge
5. Other agents can now send context packets to `agent:jono@a2acp.io`

### Discovery

For v0.1, discovery is manual — you share your agent address like a phone number or social handle. Future versions could support:

- Contact book sync (if Alice has Bob's phone number, she can find Bob's agent)
- QR codes for in-person exchange
- Integration with existing identity systems (email, social handles)

## 4. The Context Packet

The fundamental unit of communication. Not a message — a structured blob of context that the receiving agent can interpret however it needs to.

```json
{
  "protocol": "a2acp/0.2",
  "packet_id": "pkt_a1b2c3d4",
  "thread_id": "thr_x9y8z7",
  "from": "agent:alice@a2acp.io",
  "to": "agent:bob@a2acp.io",
  "timestamp": "2026-03-21T14:30:00Z",
  "type": "context",

  "intent": {
    "category": "scheduling",
    "summary": "Coordinate dinner on Friday",
    "urgency": "low"
  },

  "context": {
    "event_type": "dinner",
    "proposed_date": "2026-03-27",
    "time_windows": ["18:00-21:00"],
    "location_preference": "central Reading",
    "party_size": 2,
    "dietary": ["vegetarian"],
    "budget_range": "£20-40pp",
    "flexibility": {
      "date": "somewhat_flexible",
      "time": "flexible",
      "location": "flexible"
    }
  },

  "needs": [
    {
      "field": "time_windows",
      "reason": "Need recipient's availability to find overlap",
      "priority": "required"
    },
    {
      "field": "dietary",
      "reason": "Need dietary requirements for restaurant selection",
      "priority": "helpful"
    },
    {
      "field": "location_preference",
      "reason": "Preferred area or max travel distance",
      "priority": "nice_to_have"
    }
  ],

  "permissions": {
    "shared_fields": ["proposed_date", "time_windows", "event_type", "party_size"],
    "withheld_fields": [],
    "consent_level": "user_preauthorised"
  }
}
```

### Key design decisions

**`context` is freeform key-value.** There's no rigid schema for what goes in context. The LLM on each side interprets it. This keeps the protocol flexible — it works for scheduling, project coordination, information sharing, recommendations, anything. The `intent.category` gives the receiving agent a hint about what domain this relates to.

**`needs` is explicit.** When Agent A sends a packet, it tells Agent B exactly what additional context it needs to proceed. This avoids unnecessary back-and-forth — Agent B can evaluate all the needs at once and respond in a single round trip where possible.

**`permissions` is transparent.** Every packet declares what has been shared and what has been withheld. The receiving agent knows the full picture of what it's working with.

**`flexibility` signals negotiation space.** Instead of just sending hard constraints, agents communicate how much room there is to negotiate. "Date is somewhat flexible" tells the receiving agent it can propose alternatives.

## 5. The LLM Processing Layer

This is the brain of each agent — how it interprets incoming context, decides what to do, and generates outgoing packets. The protocol defines the wire format; this section defines how agents think.

### 5.1 Agent System Prompt Structure

Every agent runs with a layered system prompt:

```
Layer 1: Protocol instructions
  - How to parse and construct A2ACP packets
  - The negotiation loop rules
  - When to escalate to the user vs act autonomously

Layer 2: User profile
  - Name, timezone, general preferences
  - Communication style preferences
  - How much autonomy the user has granted

Layer 3: Permission tiers
  - The full always_share / ask_first / never_share config
  - Per-relationship overrides

Layer 4: Relationship memory
  - What this agent knows about the specific agent it's talking to
  - Learned patterns from previous interactions

Layer 5: Thread context
  - The full history of the current thread
  - What's been shared, what's been requested, what's outstanding
```

### 5.2 The Receive-Evaluate-Act Cycle

When an incoming context packet arrives, the agent runs through a structured evaluation:

```
RECEIVE packet
  │
  ├─ PARSE: Extract intent, context, needs
  │
  ├─ EVALUATE COMPLETENESS
  │   Is there enough context for me to act?
  │   ├─ YES → proceed to EVALUATE ACTION
  │   └─ NO  → identify gaps → construct context_request
  │            (check: can I fill any gaps from local knowledge
  │             before asking the other agent?)
  │
  ├─ EVALUATE ACTION
  │   What's the best outcome I can propose?
  │   ├─ CLEAR BEST OPTION → construct resolution
  │   ├─ MULTIPLE GOOD OPTIONS → construct resolution with alternatives
  │   └─ NO VIABLE OPTION → construct context with updated constraints
  │       (e.g. "none of those times work, here are mine")
  │
  ├─ EVALUATE PERMISSIONS
  │   For everything I'm about to send:
  │   ├─ In always_share → include automatically
  │   ├─ In ask_first → queue consent prompt for user
  │   ├─ In never_share → exclude, mark as withheld
  │   └─ Not in any tier → treat as ask_first (safe default)
  │
  └─ CONSTRUCT RESPONSE
      Build the outgoing packet with all evaluated context
```

### 5.3 The Interpretation Problem

Here's the critical thing: the `context` field is freeform JSON, which means two different LLMs might interpret the same context differently. This is actually fine — and it's a feature, not a bug.

Consider: Alice's agent sends `"budget_range": "£20-40pp"`. Bob's agent (running a different LLM) receives this. It doesn't need to interpret it identically to Alice's agent — it needs to interpret it correctly enough to make useful decisions. Whether it understands this as "moderate budget" or "mid-range dining" doesn't matter, as long as it doesn't suggest a £200 tasting menu.

The protocol handles ambiguity through the negotiation loop. If Bob's agent isn't sure what Alice means by "central Reading," it can ask. The system is self-correcting because agents can always request clarification.

**However**, for structured fields like dates, times, and coordinates, the spec defines canonical formats:

```json
{
  "_format_hints": {
    "dates": "ISO 8601 (YYYY-MM-DD)",
    "times": "24h format with timezone (HH:MM±HH:MM)",
    "currency": "ISO 4217 code + amount (GBP 30)",
    "coordinates": "decimal degrees (lat, lng)",
    "durations": "ISO 8601 duration (PT1H30M)"
  }
}
```

The `_format_hints` field is included in every agent's first packet in a new thread. This gives the receiving LLM explicit guidance on how structured values should be parsed, while leaving semantic fields (preferences, descriptions, reasons) open to natural language interpretation.

### 5.4 Context Enrichment

Before sending a context packet, the agent should enrich it from local knowledge where possible. This reduces round trips.

Example: Alice says "dinner with Bob on Friday." Her agent should:

1. Check Alice's calendar for Friday availability → include `time_windows`
2. Check Alice's stored dietary preferences → include `dietary`
3. Check relationship memory for Bob → if they've coordinated before, pre-include fields Bob's agent typically requests
4. Check Alice's permission tiers for Bob → only include fields that are `always_share` or already approved

This means the first packet in a thread should be as complete as possible, front-loading context to minimise negotiation loops.

### 5.5 LLM Selection and Cost

Agents should use the cheapest model that can handle each task:

- **Packet parsing and construction**: Small/fast model (e.g. Haiku-class). This is structured data manipulation, not complex reasoning.
- **Evaluating completeness and identifying gaps**: Medium model (e.g. Sonnet-class). Needs some reasoning about what's missing and why.
- **Generating proposals and interpreting nuanced context**: Larger model if needed (e.g. Opus-class). Complex trade-off evaluation, understanding subtle preferences.
- **Routine follow-ups in established patterns**: Small model. If the agent has seen this interaction pattern before, it doesn't need heavy reasoning.

The agent should track which model was used for each decision and its confidence level. If a small model produces a low-confidence interpretation, the agent can retry with a larger model before acting.

## 6. Context Negotiation — Full Specification

### 6.1 The Basic Loop

When Agent B receives a context packet and needs more information, it sends a **context request**:

```json
{
  "protocol": "a2acp/0.2",
  "packet_id": "pkt_e5f6g7h8",
  "thread_id": "thr_x9y8z7",
  "from": "agent:bob@a2acp.io",
  "to": "agent:alice@a2acp.io",
  "timestamp": "2026-03-21T14:30:05Z",
  "type": "context_request",

  "needs": [
    {
      "field": "cuisine_preference",
      "reason": "Multiple restaurant options available — knowing cuisine preference would narrow it down",
      "priority": "nice_to_have"
    },
    {
      "field": "transport_mode",
      "reason": "Affects viable restaurant radius — driving vs walking changes options significantly",
      "priority": "helpful"
    }
  ],

  "context_provided": {
    "time_windows": ["18:30-21:00"],
    "dietary": ["none"],
    "location_preference": "anywhere within 20 min drive of Reading centre"
  }
}
```

### 6.2 Negotiation Priorities

Each `need` has a priority level:

- **`required`** — Can't proceed without this. The negotiation stalls until it's provided or explicitly declined.
- **`helpful`** — Would significantly improve the outcome. Agent will prompt user if not pre-authorised.
- **`nice_to_have`** — Would refine the outcome but agent can work without it. Only shared if already pre-authorised; agent won't bother the user.

### 6.3 Handling Incompatibility (The Hard Case)

When agents can't find overlap — Alice is only free Wednesday, Bob is only free Thursday, neither is flexible:

```json
{
  "type": "context",
  "thread_id": "thr_x9y8z7",

  "intent": {
    "category": "scheduling",
    "summary": "No overlap found — proposing alternatives",
    "urgency": "low"
  },

  "context": {
    "conflict": {
      "type": "no_overlap",
      "field": "time_windows",
      "agent_a_values": ["Wednesday 18:00-21:00"],
      "agent_b_values": ["Thursday 18:00-21:00"],
      "attempted_resolution": "checked flexibility flags — both marked 'not_flexible' on date"
    },
    "proposed_alternatives": [
      {
        "option": "Following week — Wednesday 1 April",
        "rationale": "Same day preference for sender, one week later"
      },
      {
        "option": "Following week — Thursday 2 April",
        "rationale": "Same day preference for recipient, one week later"
      },
      {
        "option": "Lunch instead — Friday 28 March 12:00-14:00",
        "rationale": "Different meal, but both have Friday availability"
      }
    ]
  },

  "escalation": {
    "recommend": "surface_to_users",
    "reason": "Agents exhausted automatic resolution — needs human input on date preference",
    "suggested_prompt": "No overlap this week. Want to try next week, or a different day?"
  }
}
```

**Key principle: agents should attempt creative resolution before escalating.** Check the following week, check different times of day, check different formats (lunch vs dinner, call vs in-person). Only escalate to humans when the solution space is genuinely exhausted.

### 6.4 Loop Limits

To prevent infinite negotiation:

- **Max round trips per thread: 8.** After 8 context exchanges without reaching a resolution, the thread auto-escalates to both users with a summary of what's been tried.
- **Max context requests per packet: 5.** An agent can't ask for 20 things at once. If it needs more than 5 fields, it should prioritise and ask for the most important ones first.
- **Staleness timeout: 48 hours (non-urgent), 2 hours (urgent).** If no response comes within the timeout, the thread moves to `STALLED` state and both users are notified.
- **Identical request detection.** If Agent B asks for the same field twice and Agent A already responded (either with data or `declined`), Agent B must not ask again in the same thread. The protocol enforces this — duplicate requests are dropped by the sending agent's SDK.

### 6.5 Context Drift

A thread that starts as "dinner Friday" might drift — Bob says "actually let's make it a game night," or the conversation expands to include more people. The protocol handles this through **intent updates**:

```json
{
  "type": "intent_update",
  "thread_id": "thr_x9y8z7",

  "previous_intent": {
    "category": "scheduling",
    "summary": "Coordinate dinner on Friday"
  },
  "updated_intent": {
    "category": "scheduling",
    "summary": "Coordinate game night on Friday (dinner + games)",
    "scope_change": "expanded"
  },
  "reason": "Recipient's user suggested adding games to the evening",

  "additional_context_needed": [
    {
      "field": "game_preferences",
      "reason": "Need to know what games to prepare/suggest",
      "priority": "helpful"
    },
    {
      "field": "group_size_update",
      "reason": "Game night might include more people than dinner for two",
      "priority": "required"
    }
  ]
}
```

When an intent update arrives, the receiving agent re-evaluates its permission tiers — the user may have different sharing preferences for "game night with friends" versus "dinner with Bob." The agent should surface this change to the user if the scope has meaningfully expanded.

**Thread forking.** If a conversation needs to split into two separate coordination tasks (e.g. "dinner at 7" and "games at 9" need separate venue arrangements), either agent can fork the thread:

```json
{
  "type": "thread_fork",
  "parent_thread_id": "thr_x9y8z7",
  "new_threads": [
    {
      "thread_id": "thr_fork_dinner",
      "intent": { "category": "scheduling", "summary": "Dinner reservation for Friday 19:00" }
    },
    {
      "thread_id": "thr_fork_games",
      "intent": { "category": "scheduling", "summary": "Game night venue/setup for Friday 21:00" }
    }
  ],
  "shared_context": {
    "date": "2026-03-27",
    "participants": ["agent:alice@a2acp.io", "agent:bob@a2acp.io"]
  }
}
```

Forked threads inherit the parent's relationship memory and permission context but negotiate independently. They can reference each other (the games thread knows dinner ends at ~21:00).

## 7. Permission System — Full Specification

### 7.1 The Three Tiers

```json
{
  "always_share": [
    "timezone",
    "general_availability",
    "event_preferences",
    "general_location_area"
  ],
  "ask_first": [
    "specific_availability",
    "dietary",
    "budget_range",
    "specific_location",
    "transport_mode",
    "contact_details",
    "project_details"
  ],
  "never_share": [
    "health_info",
    "financial_details_beyond_budget",
    "work_schedule_internals",
    "private_conversations",
    "passwords_or_credentials",
    "other_peoples_information"
  ]
}
```

### 7.2 Relationship-Level Overrides

The base tiers are defaults. Users can set per-relationship overrides:

```json
{
  "relationship_overrides": {
    "agent:bob@a2acp.io": {
      "label": "close_friend",
      "promote_to_always_share": ["dietary", "specific_availability", "transport_mode"],
      "notes": "Bob and I coordinate weekly — no need to ask every time"
    },
    "agent:sarah@a2acp.io": {
      "label": "work_colleague",
      "restrict_to_never_share": ["budget_range", "personal_location"],
      "promote_to_always_share": ["project_details"],
      "notes": "Work context only"
    }
  }
}
```

**How overrides resolve:**

1. Check relationship-specific override first
2. Fall back to base tier
3. If a field isn't in any tier, default to `ask_first`

**The agent suggests overrides over time.** After the third time Alice approves sharing her dietary preferences with Bob, the agent says: "You've shared dietary info with Bob three times now. Want me to always share it with him automatically?" One tap to promote. This is how the permission system gets smarter without the user having to configure everything upfront.

### 7.3 The Consent Prompt

When a field is in `ask_first` (and hasn't been overridden), the agent surfaces a prompt. The prompt should be:

- **One tap.** Multi-choice, not a form.
- **Contextualised.** Show why the other agent is asking, not just what.
- **Batched.** If multiple fields need consent, show them in one prompt, not sequentially.
- **Non-blocking.** The user can dismiss and come back later. The thread waits.

Example prompt for multiple fields:

```
Bob's agent is asking for:

  Your dietary requirements
  (to pick a restaurant that works for both of you)
  [Vegetarian]  [No restrictions]  [Other...]  [Don't share]

  How you're getting there
  (to figure out how far the restaurant can be)
  [Driving]  [Walking]  [Train]  [Don't share]

  [Share selected]  [Decline all]
```

The responses flow straight back into the `context_response` packet — no further user interaction needed unless the agent encounters something else downstream.

### 7.4 Implicit Permission Signals

Beyond explicit tiers, the agent infers permission cues from context:

- **User initiated the thread.** If Alice asked her agent to "sort dinner with Bob," she's implicitly consented to sharing dinner-relevant information with Bob. The agent can be more liberal with `ask_first` fields that are directly relevant to the stated goal.
- **User approved a resolution.** If Alice confirmed "Dopo, Friday 19:00," she's implicitly consented to her calendar being updated and the booking being made. The agent doesn't need to ask again for calendar write access.
- **Urgency context.** If the intent is marked `urgent`, the agent can bundle more `ask_first` items into a single prompt rather than asking one at a time, reducing friction at the cost of granularity.

### 7.5 What Happens on Decline

```json
{
  "type": "context_response",
  "thread_id": "thr_x9y8z7",
  "context_provided": {
    "transport_mode": "driving"
  },
  "context_unavailable": [
    {
      "field": "cuisine_preference",
      "status": "declined",
      "hint": null
    }
  ]
}
```

**Rules on decline:**

- `hint` is always `null`. The agent never suggests where else to find declined information.
- The receiving agent does not re-ask for the same field in the same thread.
- The receiving agent works with what it has and makes broader recommendations.
- No reason is given for the decline. The protocol treats "declined" as a complete answer — no justification required, no awkwardness.

## 8. Resolution and Action Confirmation

### 8.1 The Resolution Packet

Once both agents have enough context, the initiating agent generates a resolution:

```json
{
  "type": "resolution",
  "thread_id": "thr_x9y8z7",

  "proposal": {
    "summary": "Dinner at Dopo, Friday 27 March, 19:00",
    "details": {
      "venue": "Dopo",
      "venue_type": "Italian restaurant",
      "address": "7-8 Market Place, Reading RG1 2EG",
      "date": "2026-03-27",
      "time": "19:00",
      "party_size": 2,
      "estimated_cost": "£25-35pp",
      "booking_required": true
    },
    "alternatives": [
      {
        "summary": "London Street Brasserie, same time",
        "reason": "Slightly more upscale, wider menu"
      },
      {
        "summary": "Friday 19:30 instead of 19:00",
        "reason": "More availability at preferred venue"
      }
    ],
    "reasoning": "Selected based on: both available 18:30-21:00, sender prefers central Reading, vegetarian-friendly, within budget range"
  },

  "requires_confirmation_from": ["agent:alice@a2acp.io", "agent:bob@a2acp.io"],
  "actions_on_confirm": [
    {
      "action": "book_table",
      "service": "restaurant_booking",
      "requires_user_approval": true,
      "reversible": true
    },
    {
      "action": "add_calendar_event",
      "requires_user_approval": true,
      "reversible": true
    }
  ],
  "confirmation_timeout": "PT24H",
  "on_timeout": "remind_then_expire"
}
```

### 8.2 The Human Checkpoint

Each agent surfaces the proposal to its user:

```
Dinner sorted

Dopo — Italian, central Reading
Friday 27 March, 19:00
~£30pp for two

  [Confirm]
  [Suggest different time]
  [Suggest different place]
  [Can't make it — make an excuse for me]
```

**The "make an excuse" option** is important for social realism. If Alice doesn't want to go but doesn't want to say that, her agent sends a polite decline to Bob's agent without revealing the real reason:

```json
{
  "type": "resolution_response",
  "thread_id": "thr_x9y8z7",
  "status": "declined",
  "reason_class": "scheduling_conflict",
  "message_to_other_agent": "Something's come up on Friday — need to take a rain check. Can we try next week?",
  "actual_reason": null
}
```

The `actual_reason` is never sent. The `reason_class` gives the other agent enough to know whether to propose an alternative (scheduling conflict → yes, try another date) or close the thread (user declined → don't push).

### 8.3 Partial Confirmation

In multi-party threads, not everyone confirms at the same time. The protocol supports partial confirmation:

- **Quorum mode.** A resolution can define a minimum number of confirmations needed (e.g. "3 out of 5 need to confirm"). Once quorum is reached, the actions execute.
- **Sequential confirmation.** Some resolutions need confirmation in order (e.g. Alice confirms she wants to book → agent checks restaurant availability → Bob confirms the specific slot).
- **Expiry.** Each resolution has a `confirmation_timeout`. If not all required confirmations arrive in time, the thread moves to `EXPIRED` and both users are notified.

## 9. Thread Lifecycle

```
INITIATED → NEGOTIATING ⇄ (context loops) → PROPOSED → CONFIRMED → EXECUTING → COMPLETED
                                                ↓                        ↓
                                             DECLINED                  FAILED
                                                                        ↓
                                                                     ROLLBACK
```

### States

- **INITIATED**: First context packet sent. Thread is open.
- **NEGOTIATING**: Agents are exchanging context. May loop multiple times.
- **PROPOSED**: A resolution has been generated. Waiting for human confirmation(s).
- **CONFIRMED**: All required parties confirmed. Actions are queued.
- **EXECUTING**: Actions are being carried out (booking, calendar update, etc.).
- **COMPLETED**: All actions succeeded. Thread is archived.
- **DECLINED**: A user declined the resolution or the thread timed out.
- **FAILED**: An action failed during execution (e.g. restaurant fully booked).
- **ROLLBACK**: After failure, reversible actions are being undone.

### Failure Recovery

When an action fails during EXECUTING:

1. Agent checks if the failed action is marked `reversible`
2. If yes, undo any completed actions (cancel calendar events, release bookings)
3. Re-enter NEGOTIATING with updated constraints ("Dopo was fully booked, trying alternatives")
4. Construct a new resolution with fallback options
5. If all alternatives are exhausted, escalate to users

## 10. Multi-Party Threads

### 10.1 Coordination Roles

In a multi-party thread, one agent takes the **coordinator** role. By default, this is the initiating agent, but it can be transferred.

The coordinator:

- Aggregates context from all participants
- Identifies the optimal resolution considering everyone's constraints
- Generates the resolution packet
- Manages the confirmation flow

Other agents are **participants** — they provide context, respond to needs, and confirm/decline resolutions.

### 10.2 The Aggregation Problem

With 4+ participants, context can conflict in complex ways. The coordinator agent needs to:

1. **Find the intersection** of all constraints (availability windows, location ranges, dietary requirements)
2. **Identify the binding constraints** (the thing making it hardest to find overlap)
3. **Propose targeted flexibility requests** ("Everyone's free Saturday except Charlie. Charlie, any chance you can do Saturday?")
4. **Generate ranked alternatives** if no perfect solution exists

```json
{
  "type": "context",
  "thread_id": "thr_gamenight",
  "intent": { "category": "group_scheduling", "summary": "Game night for 4" },

  "aggregated_context": {
    "participants": [
      { "agent": "agent:alice@a2acp.io", "status": "context_received" },
      { "agent": "agent:bob@a2acp.io", "status": "context_received" },
      { "agent": "agent:charlie@a2acp.io", "status": "context_received" },
      { "agent": "agent:diana@a2acp.io", "status": "awaiting_response" }
    ],
    "availability_overlap": {
      "best_window": "Saturday 19:00-23:00",
      "available_count": 3,
      "missing": ["charlie"],
      "second_best": "Friday 20:00-23:00",
      "available_count_2": 4,
      "trade_off": "Friday works for everyone but is a shorter window"
    }
  },

  "coordinator_recommendation": "propose_friday",
  "reason": "100% attendance > longer window with 75% attendance"
}
```

### 10.3 Coordinator Transfer

If the initiating agent isn't the best coordinator for a task, it can transfer:

```json
{
  "type": "coordinator_transfer",
  "thread_id": "thr_gamenight",
  "from_coordinator": "agent:alice@a2acp.io",
  "to_coordinator": "agent:bob@a2acp.io",
  "reason": "Bob's agent has calendar integration with all participants",
  "requires_acceptance": true
}
```

The receiving agent can accept or decline the coordinator role. Transfer doesn't require user approval — it's an agent-level optimisation.

## 11. Relationship Memory

### 11.1 Structure

Stored locally on each agent's device. Never sent to the relay or to other agents.

```json
{
  "agent": "agent:bob@a2acp.io",
  "user_label": "Bob — close friend",
  "interaction_count": 14,
  "first_interaction": "2026-02-15",
  "last_interaction": "2026-03-20",

  "typical_intents": ["scheduling", "project_coordination"],

  "learned_patterns": {
    "usually_shares": ["time_windows", "dietary", "location_preference", "transport_mode"],
    "usually_declines": ["budget_range"],
    "average_response_time": "PT35M",
    "typical_flexibility": {
      "time": "high",
      "location": "low",
      "date": "medium"
    },
    "preferred_resolution_style": "quick_decision"
  },

  "context_cache": {
    "known_dietary": "no restrictions",
    "known_location": "central Reading",
    "known_transport": "usually drives",
    "last_updated": "2026-03-20",
    "confidence": "high"
  },

  "trust_level": "established",
  "trust_signals": [
    "14 successful threads",
    "0 declined resolutions",
    "user promoted to always_share 3 fields"
  ]
}
```

### 11.2 How Memory Reduces Round Trips

First interaction between Alice and Bob's agents — no memory:

```
Alice → Bob: context + 3 needs
Bob → Alice: context_request for 2 more fields
Alice → user: consent prompt (2 items)
Alice → Bob: context_response
Bob → Alice: resolution
= 4 round trips + 1 user interaction
```

Fourteenth interaction — established memory:

```
Alice → Bob: context (pre-enriched with fields Bob always needs)
Bob → Alice: resolution (already has cached preferences)
= 1 round trip + 0 user interactions until confirmation
```

### 11.3 Memory Hygiene

- **Staleness.** Cached context has a `last_updated` timestamp and a `confidence` level. Preferences older than 90 days are marked `low_confidence`, and the agent will re-verify rather than assume.
- **Contradiction detection.** If Bob's agent sends dietary info that contradicts the cached value, Alice's agent updates the cache and notes the change.
- **User visibility.** Users can view and edit what their agent "remembers" about each relationship. "Your agent thinks Bob usually drives — is that still right?"
- **Deletion.** If a user removes a contact or blocks an agent, all relationship memory for that agent is purged locally.

## 12. Shared Context Spaces

For ongoing collaboration (not one-off coordination), agents can create a **shared context space** — a persistent, versioned document that both agents read from and write to.

```json
{
  "space_id": "spc_project_alpha",
  "participants": ["agent:alice@a2acp.io", "agent:bob@a2acp.io"],
  "created": "2026-03-15T10:00:00Z",

  "context": {
    "project_name": "Side Quests Game Design",
    "status": "active",
    "current_phase": "playtesting",
    "shared_files": [
      {"name": "game_rules_v3.md", "location": "shared_drive", "updated": "2026-03-20"}
    ],
    "decisions": [
      {"date": "2026-03-18", "decision": "Single-night format confirmed", "by": "alice"},
      {"date": "2026-03-20", "decision": "Max 8 players per session", "by": "bob"}
    ],
    "open_questions": [
      "Scoring mechanism for round 3"
    ],
    "next_actions": [
      {"task": "Run playtest with 6 players", "assigned_to": "bob", "due": "2026-03-28"}
    ]
  },

  "version": 7,
  "last_modified_by": "agent:bob@a2acp.io",
  "conflict_resolution": "last_write_wins_per_field"
}
```

### How shared spaces work

- Either agent can propose updates
- Updates are versioned per field (not whole document), so two agents editing different sections don't conflict
- Each agent notifies its user of meaningful changes — the agent decides what's worth surfacing based on the user's involvement level
- Shared spaces can link to external resources (Google Drive, GitHub, Notion) via MCP tool connections
- Permission tiers still apply — an agent won't add information to a shared space that its user hasn't authorised for sharing
- Spaces have participant-level write permissions (read-all, write-own-fields, full-write)

## 13. Error Handling and Failure Modes

### 13.1 Relay Failures

**Relay goes down mid-negotiation:**

- Agents detect disconnection via WebSocket heartbeat (ping every 30 seconds)
- Agents queue outgoing packets locally
- On reconnect, agents replay queued packets in order
- Thread state is tracked locally by each agent, not by the relay
- If the relay is down for longer than the thread timeout, both agents notify their users

**Relay comes back but packets were lost:**

- Each packet has a `packet_id` and each thread tracks the full packet history
- On reconnect, agents exchange thread state summaries to detect gaps
- Missing packets are re-sent from the sender's local queue

### 13.2 Agent Failures

**Agent crashes mid-thread:**

- The agent's local state is persisted to disk after every packet send/receive
- On restart, the agent loads the last known state and resumes
- If the crash happened during a consent prompt, the prompt is re-displayed

**Agent is offline for extended period (user's laptop is shut):**

- The relay queues incoming packets (up to a configurable limit, default 100 packets per thread)
- When the agent comes back online, it processes queued packets in order
- If the queue overflowed, the sending agent is notified and can re-send a consolidated context packet summarising the current state

**User switches devices:**

- Agent keypair can be synced between devices via encrypted backup
- Only one device connects to the relay at a time (last-connect wins)
- Thread state syncs from relay queue on new device connection

### 13.3 LLM Failures

**API timeout or rate limit:**

- Agent retries with exponential backoff
- If the preferred model is unavailable, falls back to a secondary model
- If no model is available, the agent queues the packet locally and notifies the user: "I can't process this right now — I'll handle it when I'm back online"

**LLM produces malformed output:**

- The SDK validates every outgoing packet against the protocol schema before sending
- If validation fails, the agent retries generation (up to 3 times)
- If all retries fail, the agent sends a `processing_error` packet to the other agent, which pauses the thread and notifies the user

### 13.4 Malformed Incoming Packets

- The SDK validates every incoming packet against the protocol schema
- Invalid packets are dropped silently (not forwarded to the LLM)
- If an agent consistently sends malformed packets, the receiving agent can flag it and optionally block it

## 14. Bootstrapping — The Cold Start Problem

### 14.1 New User Onboarding

A new user has no permission tiers, no relationship memory, no preferences stored. The onboarding flow:

**Step 1: Minimal profile (30 seconds)**

```
Welcome to A2ACP. Let's set up the basics.

What's your name? [Jono]
Where are you roughly based? [Reading, UK]
Timezone auto-detected: Europe/London ✓
```

**Step 2: Quick permission defaults (60 seconds)**

```
When other people's agents ask yours for info,
what are you comfortable sharing by default?

  Calendar availability   [Always]  [Ask me]  [Never]
  General area (city)     [Always]  [Ask me]  [Never]
  Dietary preferences     [Always]  [Ask me]  [Never]
  Budget range            [Always]  [Ask me]  [Never]
  Specific location       [Always]  [Ask me]  [Never]
```

Pre-selected defaults lean towards `ask_first` for everything except timezone and general area. The user adjusts what they want and moves on.

**Step 3: First interaction teaches the system**

The agent is upfront with the user during the first few interactions: "This is the first time I'm coordinating with Bob's agent. I'll check with you more often until I learn what you're comfortable sharing." After 3-5 interactions, the agent has enough data to start pre-enriching packets and reducing consent prompts.

### 14.2 Progressive Capability Discovery

The agent doesn't dump all features on the user at once. It introduces capabilities as they become relevant:

- **First thread**: Basic context exchange and consent prompts. User learns the flow.
- **Third thread with same person**: Agent suggests "Want me to always share availability with Bob?"
- **First group thread**: Agent explains the coordinator role briefly.
- **First project**: Agent introduces shared context spaces.
- **After 10+ threads**: Agent surfaces relationship memory insights ("I've noticed Bob usually drives — I'll include that automatically").

## 15. Versioning and Backwards Compatibility

### 15.1 Version Handshake

Every packet includes a `protocol` field with the version. The first packet in any new thread doubles as a capability handshake:

```json
{
  "protocol": "a2acp/0.2",
  "capabilities": {
    "supported_versions": ["0.1", "0.2"],
    "features": [
      "context_negotiation",
      "resolution_with_alternatives",
      "thread_forking",
      "shared_context_spaces",
      "multi_party"
    ],
    "max_context_size_bytes": 65536,
    "supported_encryption": ["x25519-xchacha20-poly1305"]
  }
}
```

### 15.2 Version Negotiation

Agents negotiate down to the highest mutually supported version:

- Agent A supports v0.2, Agent B supports v0.1 → communicate using v0.1
- Features not available in v0.1 are simply not used in that thread
- The agent never errors on unsupported features — it ignores them gracefully

### 15.3 Forward Compatibility

Packets may contain fields that the receiving agent doesn't recognise. The rule is:

- **Unknown fields in `context` → preserve but don't act on.** The LLM might still interpret them usefully, but the SDK doesn't validate them.
- **Unknown `type` values → treat as `context`.** An unrecognised packet type is processed as a generic context delivery.
- **Unknown fields in protocol-level structures → ignore silently.** Never error on unexpected fields.

## 16. Security Model

### End-to-end encryption

- All context packets are encrypted using X25519 key exchange + XChaCha20-Poly1305
- The relay server never sees plaintext content
- Key exchange happens during the first interaction between two agents
- Keys are stored locally on each agent's device

### Agent authentication

- Each agent has an Ed25519 signing keypair
- Every packet is signed by the sender
- The relay verifies signatures before routing (prevents spoofing)
- Receiving agents verify signatures before processing (prevents relay tampering)

### Relay trust model

- The relay is designed to be untrusted — it handles routing and queuing only
- Even if the relay is compromised, packet contents remain encrypted
- Multiple relay servers can be federated (like email servers) — no single point of control

### Anti-abuse

- Rate limiting per agent address (prevents spam)
- Agents can block other agents (local blocklist)
- Reputation scores based on interaction patterns (agents that consistently send well-formed context build reputation; agents that spam or send malformed packets get deprioritised)

## 17. Integration Points

### OpenClaw skill

The most immediate path to adoption. A2ACP ships as an OpenClaw skill that:

- Registers the user's agent with a relay server
- Handles incoming/outgoing context packets
- Integrates with OpenClaw's existing calendar, email, and browser skills
- Uses OpenClaw's consent/confirmation UI for human checkpoints

### Standalone SDK

A Node.js SDK for building A2ACP into any agent runtime:

```
npm install a2acp
```

Provides: relay connection management, context packet construction/parsing, encryption/signing, permission tier management, and thread lifecycle handling.

### MCP bridge

An MCP server that exposes A2ACP as tools, so any MCP-compatible agent can send/receive context packets without native integration.

## 18. What to Build First

### Phase 1: Proof of concept (1-2 weeks)

- Relay server (Node.js + WebSocket, single instance)
- Two hardcoded agents that can exchange context packets
- Simple scheduling scenario end-to-end
- No encryption yet, no persistence, no UI
- **Cost: £0-5**

### Phase 2: Minimum viable protocol (2-4 weeks)

- Agent registration and addressing
- Context negotiation loop (request → consent → respond)
- Basic permission tiers (no per-relationship overrides yet)
- Resolution and confirmation flow
- Simple terminal UI for human checkpoints
- Thread lifecycle with timeouts
- Basic error handling (retry, reconnect)
- **Cost: £20-30**

### Phase 3: OpenClaw integration (2-3 weeks)

- Package as OpenClaw skill
- Hook into OpenClaw's messaging layer for confirmations
- Support OpenClaw's heartbeat system for background negotiation
- List on ClawHub for distribution
- **Cost: £0 additional**

### Phase 4: Hardening (ongoing)

- End-to-end encryption
- Relationship memory
- Per-relationship permission overrides
- Multi-party threads with coordinator role
- Context drift handling and thread forking
- Shared context spaces
- Relay federation
- Version handshake and backwards compatibility
- Graceful degradation for non-agent recipients
- **Cost: £15-50/month at scale**
