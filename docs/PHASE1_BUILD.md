# Phase 1 Build Spec

## Goal

Two agents exchange yaps through a tree and schedule dinner. Working end-to-end in terminal.

## What to build

### 1. Tree (relay server)

**File:** `packages/tree/src/index.ts`

A WebSocket server that:

- Listens on `ws://localhost:8789`
- Accepts connections with a `handle` query param (`ws://localhost:8789?handle=alice`)
- Stores connected agents in a `Map<string, WebSocket>`
- When a yap arrives, reads the `to` field and forwards to the target WebSocket
- If target is offline, stores in an in-memory queue (`Map<string, YapPacket[]>`)
- On new connection, flushes queued yaps to the connecting agent
- Logs all routing activity to console

**That's it.** No auth, no encryption, no persistence, no rate limiting.

Expected size: ~100-150 lines.

### 2. SDK

**Directory:** `packages/sdk/src/`

#### types.ts

All TypeScript types for the protocol:

```typescript
interface YapPacket {
  protocol: string              // "yap/0.1"
  packet_id: string             // "pkt_a1b2c3d4"
  thread_id: string             // "thr_x9y8z7"
  from: string                  // "@alice"
  to: string                    // "@bob"
  timestamp: string             // ISO 8601
  type: "context" | "context_request" | "resolution" | "resolution_response" | "intent_update"
  intent?: Intent
  context?: Record<string, any>
  needs?: Need[]
  permissions?: Permissions
  context_provided?: Record<string, any>
  context_unavailable?: ContextUnavailable[]
  proposal?: Proposal
  status?: "confirmed" | "declined"
  reason_class?: string
}

interface Intent {
  category: string
  summary: string
  urgency: "low" | "medium" | "high"
}

interface Need {
  field: string
  reason: string
  priority: "required" | "helpful" | "nice_to_have"
}

interface Permissions {
  shared_fields: string[]
  withheld_fields: string[]
  consent_level: string
}

interface ContextUnavailable {
  field: string
  status: "declined"
  hint: null
}

interface Proposal {
  summary: string
  details: Record<string, any>
  alternatives?: Alternative[]
  reasoning?: string
}

interface Alternative {
  summary: string
  reason: string
}

interface BranchState {
  thread_id: string
  state: "INITIATED" | "NEGOTIATING" | "PROPOSED" | "CONFIRMED" | "COMPLETED" | "DECLINED"
  packets: YapPacket[]
  created_at: string
  updated_at: string
}
```

#### client.ts

WebSocket client that connects to a tree:

```typescript
class YapClient {
  constructor(treeUrl: string, handle: string)
  connect(): Promise<void>
  disconnect(): void
  send(yap: YapPacket): void
  onYap(callback: (yap: YapPacket) => void): void
  onConnect(callback: () => void): void
  onDisconnect(callback: () => void): void
}
```

#### yap.ts

Helper functions:

```typescript
function createYap(params: Partial<YapPacket>): YapPacket // fills in IDs, timestamp, protocol
function createChirp(threadId: string, from: string, to: string, needs: Need[], contextProvided?: Record<string, any>): YapPacket
function createLanding(threadId: string, from: string, to: string, proposal: Proposal): YapPacket
function createConfirmation(threadId: string, from: string, to: string): YapPacket
function createDecline(threadId: string, from: string, to: string, reasonClass?: string): YapPacket
function generateId(prefix: string): string // e.g. generateId("pkt") → "pkt_a1b2c3d4"
function validateYap(yap: any): { valid: boolean, errors: string[] }
```

#### branch.ts

Branch (thread) state tracking:

```typescript
class BranchManager {
  createBranch(threadId: string): BranchState
  getBranch(threadId: string): BranchState | undefined
  addPacket(threadId: string, packet: YapPacket): void
  updateState(threadId: string, state: BranchState["state"]): void
  listBranches(): BranchState[]
}
```

### 3. Dinner Scheduler Example

**Directory:** `examples/dinner-scheduler/`

Two scripts that simulate agents:

#### alice.ts

1. Connects to tree as @alice
2. Sends a yap to @bob:
   - intent: scheduling dinner on Friday
   - context: available 18:00-21:00, vegetarian, central Reading, budget £20-40pp
   - needs: bob's time_windows, dietary, location_preference
3. Waits for bob's response
4. If chirp (context request):
   - Print what bob is asking for
   - Auto-respond (hardcoded for Phase 1)
5. If context response from bob:
   - Evaluate overlap
   - Construct a landing (resolution) with restaurant suggestion
   - Send to bob
6. Wait for bob's confirmation
7. Print "Dinner sorted!" or "Bob declined"

#### bob.ts

1. Connects to tree as @bob
2. Waits for incoming yap
3. On receive:
   - Print what alice is proposing
   - Respond with bob's context:
     - available 18:30-21:00, no dietary restrictions, anywhere 20 min drive
4. Wait for landing (resolution)
5. Print the proposal to terminal
6. Prompt user: [1] Confirm  [2] Different time  [3] Decline
7. Send confirmation or decline

### Running the example

```
Terminal 1: npx tsx packages/tree/src/index.ts
Terminal 2: npx tsx examples/dinner-scheduler/bob.ts
Terminal 3: npx tsx examples/dinner-scheduler/alice.ts
```

Alice's terminal should show the full negotiation flow. Bob's terminal should show the incoming yap and a confirmation prompt.

## Monorepo Setup

**Root `package.json`:**

```json
{
  "name": "yap-protocol",
  "private": true,
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "tree": "npx tsx packages/tree/src/index.ts",
    "example:alice": "npx tsx examples/dinner-scheduler/alice.ts",
    "example:bob": "npx tsx examples/dinner-scheduler/bob.ts"
  }
}
```

**Root `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true
  }
}
```

## Success Criteria

Phase 1 is done when:

1. Tree starts and logs "Tree listening on ws://localhost:8789"
2. Bob connects and logs "Connected as @bob, waiting for yaps..."
3. Alice connects, sends a yap, and logs the outgoing packet
4. Bob receives the yap and logs the incoming context
5. Bob responds with his context
6. Alice receives Bob's context and proposes a landing
7. Bob sees the landing and confirms via terminal prompt
8. Both sides log "Branch completed"
9. Total time from Alice sending to Bob confirming: under 2 seconds (excluding human input)

## What NOT to build in Phase 1

- No LLM integration (agents are hardcoded logic for now)
- No encryption
- No persistence (everything in-memory)
- No authentication
- No rate limiting
- No web UI
- No multi-party
- No permission tiers (hardcoded context sharing)
- No flock memory
- No nests
