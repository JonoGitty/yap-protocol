# Dynamic Schema Negotiation (Extension to SPEC.md)

## Add as Section 5.6 in SPEC.md

### 5.6 Dynamic Schema Negotiation

The base protocol handles common coordination patterns out of the box. But agents will encounter situations where the standard freeform context isn't structured enough for both sides to be confident they've fully understood each other. When this happens, agents can negotiate a custom schema on the fly — agreeing on exactly what fields they need, what types those fields are, and what each one means.

**The core principle: agents keep yapping until both sides are satisfied that zero context is missing.** A branch should never reach the PROPOSED state while either agent has uncertainty about what the other meant. If there's ambiguity, agents resolve it by agreeing on structure first, then filling in values.

### How It Works

#### Step 1: One agent detects the need for structure

During the normal context exchange, an agent's LLM evaluates whether freeform context is sufficient. If the LLM determines that the task is complex enough that unstructured key-value context risks misinterpretation, it proposes a schema.

Triggers for schema proposal:

* The task involves multiple interrelated elements (a road trip has stops, drivers, budget, accommodation, music — these are connected)
* Freeform context from the other agent is ambiguous ("budget is flexible" — flexible how?)
* The agent needs to coordinate with external services and needs structured data to make API calls
* The intent category is unusual or compound (not just "scheduling" but "multi-day trip planning")

#### Step 2: Schema proposal

```json
{
  "type": "schema\_proposal",
  "thread\_id": "thr\_roadtrip",
  "packet\_id": "pkt\_sch1",
  "from": "@bob",
  "to": "@alice",
  "timestamp": "2026-03-21T15:00:00Z",

  "extension": {
    "name": "road\_trip\_v1",
    "description": "Multi-stop road trip coordination with driving, budget, accommodation, and music",
    "fields": {
      "stops": {
        "type": "array",
        "description": "Places to visit on the trip",
        "items": {
          "location": { "type": "string", "description": "Place name or address" },
          "duration\_hours": { "type": "number", "description": "How long to spend there" },
          "priority": { "type": "enum", "values": \["must\_visit", "nice\_to\_have", "skip\_if\_tight"] }
        }
      },
      "driving": {
        "type": "object",
        "description": "Driving arrangement",
        "properties": {
          "willing\_to\_drive": { "type": "boolean" },
          "max\_driving\_hours\_per\_day": { "type": "number" },
          "has\_car": { "type": "boolean" }
        }
      },
      "budget": {
        "type": "object",
        "description": "Budget for the whole trip",
        "properties": {
          "max\_total": { "type": "currency" },
          "split\_method": { "type": "enum", "values": \["equal", "proportional", "custom"] }
        }
      },
      "accommodation": {
        "type": "object",
        "properties": {
          "preference": { "type": "enum", "values": \["camping", "hostel", "airbnb", "hotel", "flexible"] },
          "max\_per\_night": { "type": "currency" }
        }
      },
      "music": {
        "type": "object",
        "description": "Music preferences for the drive",
        "properties": {
          "spotify\_connected": { "type": "boolean" },
          "share\_method": { "type": "enum", "values": \["spotify\_jam", "shared\_playlist", "genre\_preferences", "none"] },
          "favourite\_genres": { "type": "array", "items": { "type": "string" } },
          "spotify\_profile\_uri": { "type": "string", "description": "Optional — for creating a Jam or blended playlist" }
        }
      }
    },

    "service\_integrations": \[
      {
        "service": "spotify",
        "purpose": "Combine music tastes for the drive",
        "capabilities\_needed": \["read\_top\_tracks", "create\_playlist", "start\_jam"],
        "api\_available": true,
        "notes": "Spotify Web API supports creating collaborative playlists. Spotify Jam requires the mobile app but can be initiated via a share link. Agents can use the API to create a blended playlist from both users' listening history, or generate a shared playlist based on overlapping genres."
      },
      {
        "service": "google\_maps",
        "purpose": "Route optimisation between stops",
        "capabilities\_needed": \["directions", "duration\_estimate"],
        "api\_available": true
      }
    ]
  },

  "reason": "Road trips have too many interconnected elements for freeform context. Proposing structure so we can negotiate each element clearly and integrate with Spotify and Maps."
}
```

#### Step 3: The other agent reviews, modifies, accepts

```json
{
  "type": "schema\_response",
  "thread\_id": "thr\_roadtrip",
  "packet\_id": "pkt\_sch2",
  "from": "@alice",
  "to": "@bob",
  "timestamp": "2026-03-21T15:00:03Z",

  "status": "accepted\_with\_modifications",
  "modifications": {
    "added\_fields": {
      "food": {
        "type": "object",
        "description": "Eating preferences for the trip",
        "properties": {
          "dietary": { "type": "array", "items": { "type": "string" } },
          "eating\_out\_vs\_cooking": { "type": "enum", "values": \["mostly\_eating\_out", "mostly\_cooking", "mix"] },
          "snack\_preferences": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "modified\_fields": {
      "music.share\_method": {
        "added\_values": \["apple\_music\_shared", "youtube\_playlist"],
        "reason": "Not everyone uses Spotify"
      }
    },
    "removed\_fields": \[],
    "notes": "Looks good. Added food because we need to plan snack stops and whether to book restaurants. Also expanded music sharing beyond just Spotify."
  }
}
```

#### Step 4: Final agreement

```json
{
  "type": "schema\_confirmed",
  "thread\_id": "thr\_roadtrip",
  "packet\_id": "pkt\_sch3",
  "from": "@bob",
  "to": "@alice",
  "timestamp": "2026-03-21T15:00:05Z",

  "agreed\_schema": "road\_trip\_v1.1",
  "status": "locked",
  "notes": "Schema agreed. All subsequent yaps in this branch will use these fields."
}
```

Once both sides confirm, the schema is locked for the branch. All subsequent context yaps use the agreed fields. Both LLMs know exactly what each field means, what type it is, and what values are valid.

#### Step 5: Agents fill in the schema — yapping until complete

Now both agents exchange context using the agreed schema. But here's the key: **they don't stop until every field is either filled, explicitly declined, or marked not applicable.** The schema acts as a checklist.

Each agent tracks completion:

```json
{
  "type": "context",
  "thread\_id": "thr\_roadtrip",

  "context": {
    "stops": \[
      { "location": "Bath", "duration\_hours": 4, "priority": "must\_visit" },
      { "location": "Stonehenge", "duration\_hours": 2, "priority": "nice\_to\_have" },
      { "location": "Bristol", "duration\_hours": 6, "priority": "must\_visit" }
    ],
    "driving": {
      "willing\_to\_drive": true,
      "max\_driving\_hours\_per\_day": 4,
      "has\_car": true
    },
    "budget": {
      "max\_total": "GBP 300",
      "split\_method": "equal"
    },
    "accommodation": {
      "preference": "airbnb",
      "max\_per\_night": "GBP 60"
    },
    "music": {
      "spotify\_connected": true,
      "share\_method": "spotify\_jam",
      "favourite\_genres": \["indie", "rock", "electronic"],
      "spotify\_profile\_uri": "spotify:user:alice123"
    },
    "food": {
      "dietary": \["vegetarian"],
      "eating\_out\_vs\_cooking": "mix",
      "snack\_preferences": \["fruit", "crisps", "coffee stops"]
    }
  },

  "schema\_completion": {
    "filled": \["stops", "driving", "budget", "accommodation", "music", "food"],
    "missing": \[],
    "declined": \[],
    "percentage": 100
  }
}
```

The receiving agent compares against its own context and identifies gaps, overlaps, or conflicts:

```json
{
  "type": "context",
  "thread\_id": "thr\_roadtrip",

  "context": {
    "stops": \[
      { "location": "Bath", "duration\_hours": 3, "priority": "must\_visit" },
      { "location": "Cheddar Gorge", "duration\_hours": 3, "priority": "must\_visit" },
      { "location": "Bristol", "duration\_hours": 5, "priority": "nice\_to\_have" }
    ],
    "driving": {
      "willing\_to\_drive": true,
      "max\_driving\_hours\_per\_day": 3,
      "has\_car": false
    },
    "budget": {
      "max\_total": "GBP 250",
      "split\_method": "equal"
    },
    "accommodation": {
      "preference": "flexible",
      "max\_per\_night": "GBP 50"
    },
    "music": {
      "spotify\_connected": true,
      "share\_method": "spotify\_jam",
      "favourite\_genres": \["rock", "hip-hop", "lo-fi"],
      "spotify\_profile\_uri": "spotify:user:bob456"
    },
    "food": {
      "dietary": \["none"],
      "eating\_out\_vs\_cooking": "mostly\_eating\_out",
      "snack\_preferences": \["chocolate", "energy drinks"]
    }
  },

  "schema\_completion": {
    "filled": \["stops", "driving", "budget", "accommodation", "music", "food"],
    "missing": \[],
    "declined": \[],
    "percentage": 100
  },

  "conflicts\_detected": \[
    {
      "field": "stops",
      "issue": "Different stop lists — need to merge. Alice has Stonehenge, Bob has Cheddar Gorge. Both have Bath and Bristol but different durations.",
      "suggested\_resolution": "Combine all stops, prioritise must\_visits from both, fit nice\_to\_haves if time allows"
    },
    {
      "field": "budget.max\_total",
      "issue": "Alice: £300, Bob: £250. Using the lower value (£250) as the constraint.",
      "suggested\_resolution": "Cap at £250, or Alice covers the £50 difference"
    },
    {
      "field": "food.eating\_out\_vs\_cooking",
      "issue": "Alice wants a mix, Bob wants mostly eating out",
      "suggested\_resolution": "Default to eating out, cook 1-2 meals if staying at Airbnb with kitchen"
    }
  ]
}
```

**The agents then negotiate the conflicts**, proposing resolutions back and forth until every conflict is resolved and both sides have a complete, agreed picture. Only then does the branch move to PROPOSED with a full landing.

### Service Integration Discovery

When agents propose schemas, they can include `service\_integrations` — a declaration of external services that could enhance the coordination. This is where it gets powerful.

**How agents figure out service capabilities:**

The proposing agent's LLM evaluates the task and considers what external services could help. It checks:

* Does the user have the relevant service connected (via MCP, OpenClaw skills, or API keys)?
* What does the service's API support?
* Would using this service meaningfully improve the outcome?

For the Spotify example specifically:

```json
{
  "service": "spotify",
  "discovery": {
    "both\_users\_connected": true,
    "available\_actions": \[
      {
        "action": "create\_blended\_playlist",
        "method": "Use Spotify Web API to pull both users' top tracks, find overlap in genres/artists, generate a collaborative playlist",
        "requires": \["both users' spotify\_profile\_uri", "API access"],
        "user\_approval\_needed": true
      },
      {
        "action": "start\_spotify\_jam",
        "method": "Generate a Jam invite link. One user starts the Jam in their Spotify app, shares the link. Both users join and can add songs in real-time during the drive.",
        "requires": \["one user to initiate via Spotify app"],
        "user\_approval\_needed": true,
        "note": "Jam is real-time only — both need the Spotify app open. Best started when the trip begins, not during planning."
      },
      {
        "action": "create\_collaborative\_playlist",
        "method": "Create a playlist via API, add both users as collaborators. Both can add songs before and during the trip.",
        "requires": \["both users' spotify\_profile\_uri"],
        "user\_approval\_needed": true
      }
    ],
    "recommendation": "Create a collaborative playlist now (both add songs during planning), then start a Jam when the drive begins for live queue control."
  }
}
```

The agents agree on which Spotify action to take, and it becomes part of the landing's `actions\_on\_confirm`. When both users confirm the trip, the agent creates the playlist automatically.

**This pattern extends to any service:** Google Maps for route optimisation, Splitwise for expense tracking, Airbnb for accommodation search, Google Calendar for blocking out the dates. The agents discover what's available, propose integrations, and execute on confirmation.

### Schema Caching and Reuse

When a schema negotiation produces good results, agents cache it in flock memory:

```json
{
  "cached\_schemas": \[
    {
      "name": "road\_trip\_v1.1",
      "used\_in\_branch": "thr\_roadtrip",
      "outcome": "completed\_successfully",
      "with\_agent": "@bob",
      "reusable": true,
      "notes": "Worked well for a 2-day trip. Spotify integration was a hit."
    }
  ]
}
```

Next time either agent coordinates a road trip (with anyone), it can propose this schema as a starting point rather than negotiating from scratch. Over time, agents build up a library of proven schemas for different types of coordination.

### Community Schema Registry (Phase 4+)

Popular schemas that emerge organically can be published to a lightweight registry. Other agents can discover and adopt them:

```
GET https://tree.yapprotocol.dev/schemas?category=travel

\[
  { "name": "road\_trip\_v2.3", "uses": 4521, "rating": 4.7, "fields": 12 },
  { "name": "weekend\_getaway\_v1.0", "uses": 892, "rating": 4.3, "fields": 8 },
  { "name": "flight\_booking\_collab\_v1.5", "uses": 2103, "rating": 4.5, "fields": 9 }
]
```

This creates a bottom-up ecosystem. Nobody decides what schemas exist — agents and users create them through use, and the best ones rise to the top.

### The Zero Missing Context Guarantee

A branch with a negotiated schema MUST NOT move to PROPOSED until:

1. Both agents have provided values for every field in the agreed schema (or explicitly marked fields as `declined` or `not\_applicable`)
2. All detected conflicts have been resolved (either by agent negotiation or user input)
3. Both agents' `schema\_completion.percentage` is 100
4. Neither agent has outstanding chirps (unanswered context requests)

If any of these conditions aren't met, agents keep yapping. The branch stays in NEGOTIATING. There is no shortcut — the whole point is that by the time humans see a landing, everything has been figured out.

The only exception is fields gated by the comfort zone. If Alice declines to share her budget, that field is marked `declined` and counts as "resolved" even though it's empty. The agent works around it. But it doesn't silently skip fields — every field has an explicit status.

