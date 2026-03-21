import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { FlockEntry, YapPacket } from "./types.js";

const STALENESS_DAYS = 90;
const PROMOTION_THRESHOLD = 3;

export class FlockMemory {
  private entries = new Map<string, FlockEntry>();
  private dirty = false;

  constructor(private storePath: string) {}

  async load(): Promise<void> {
    try {
      const data = await readFile(this.storePath, "utf-8");
      const parsed = JSON.parse(data) as FlockEntry[];
      for (const entry of parsed) {
        this.entries.set(entry.agent, entry);
      }
    } catch {
      // No existing file — start fresh
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(dirname(this.storePath), { recursive: true });
    const data = JSON.stringify(Array.from(this.entries.values()), null, 2);
    await writeFile(this.storePath, data, "utf-8");
    this.dirty = false;
  }

  getEntry(agent: string): FlockEntry | undefined {
    return this.entries.get(agent);
  }

  allEntries(): FlockEntry[] {
    return Array.from(this.entries.values());
  }

  private ensureEntry(agent: string): FlockEntry {
    let entry = this.entries.get(agent);
    if (!entry) {
      entry = {
        agent,
        interaction_count: 0,
        first_interaction: new Date().toISOString(),
        last_interaction: new Date().toISOString(),
        typical_intents: [],
        learned_patterns: {
          usually_shares: [],
          usually_declines: [],
          average_response_time_ms: 0,
        },
        context_cache: {},
        trust_level: "new",
      };
      this.entries.set(agent, entry);
    }
    return entry;
  }

  recordInteraction(agent: string, packet: YapPacket): void {
    const entry = this.ensureEntry(agent);
    entry.interaction_count++;
    entry.last_interaction = new Date().toISOString();

    // Track intent categories
    if (packet.intent?.category && !entry.typical_intents.includes(packet.intent.category)) {
      entry.typical_intents.push(packet.intent.category);
    }

    // Update trust level based on interaction count
    if (entry.interaction_count >= 20) entry.trust_level = "trusted";
    else if (entry.interaction_count >= 10) entry.trust_level = "established";
    else if (entry.interaction_count >= 3) entry.trust_level = "developing";

    // Cache provided context
    if (packet.context_provided) {
      for (const [field, value] of Object.entries(packet.context_provided)) {
        entry.context_cache[field] = {
          value,
          updated: new Date().toISOString(),
          confidence: entry.interaction_count > 5 ? "high" : entry.interaction_count > 2 ? "medium" : "low",
        };
      }
    }

    this.dirty = true;
  }

  private shareCount = new Map<string, Map<string, number>>();
  private declineCount = new Map<string, Map<string, number>>();

  recordShareDecision(agent: string, field: string, shared: boolean): void {
    const entry = this.ensureEntry(agent);
    const countMap = shared ? this.shareCount : this.declineCount;

    if (!countMap.has(agent)) countMap.set(agent, new Map());
    const fields = countMap.get(agent)!;
    fields.set(field, (fields.get(field) ?? 0) + 1);

    // Update learned patterns
    const shareFields = this.shareCount.get(agent);
    const declineFields = this.declineCount.get(agent);

    if (shareFields) {
      entry.learned_patterns.usually_shares = Array.from(shareFields.entries())
        .filter(([_, count]) => count >= 2)
        .map(([f]) => f);
    }
    if (declineFields) {
      entry.learned_patterns.usually_declines = Array.from(declineFields.entries())
        .filter(([_, count]) => count >= 2)
        .map(([f]) => f);
    }

    this.dirty = true;
  }

  /** Get fields that have been shared enough times to suggest promotion to always_share. */
  suggestPromotions(agent: string): { field: string; count: number }[] {
    const shareFields = this.shareCount.get(agent);
    if (!shareFields) return [];
    return Array.from(shareFields.entries())
      .filter(([_, count]) => count >= PROMOTION_THRESHOLD)
      .map(([field, count]) => ({ field, count }));
  }

  /** Get cached context values for pre-enrichment. */
  getCachedContext(agent: string): Record<string, unknown> {
    const entry = this.entries.get(agent);
    if (!entry) return {};
    const result: Record<string, unknown> = {};
    for (const [field, cached] of Object.entries(entry.context_cache)) {
      // Only use non-stale entries
      const age = Date.now() - new Date(cached.updated).getTime();
      if (age < STALENESS_DAYS * 24 * 60 * 60 * 1000) {
        result[field] = cached.value;
      }
    }
    return result;
  }

  /** Remove entries older than maxAgeDays. */
  pruneStale(maxAgeDays: number = STALENESS_DAYS): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const [agent, entry] of this.entries) {
      const lastMs = new Date(entry.last_interaction).getTime();
      if (lastMs < cutoff) {
        this.entries.delete(agent);
        this.dirty = true;
      }
    }
  }
}
