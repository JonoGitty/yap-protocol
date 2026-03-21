import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { NestState } from "./types.js";
import { generateId } from "./yap.js";

export class NestManager {
  private nests = new Map<string, NestState>();
  private dirty = new Set<string>();

  constructor(private storeDir: string) {}

  async load(): Promise<void> {
    try {
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(this.storeDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const raw = await readFile(join(this.storeDir, file), "utf-8");
        const nest = JSON.parse(raw) as NestState;
        this.nests.set(nest.nest_id, nest);
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  async save(): Promise<void> {
    if (this.dirty.size === 0) return;
    await mkdir(this.storeDir, { recursive: true });
    for (const nestId of this.dirty) {
      const nest = this.nests.get(nestId);
      if (nest) {
        await writeFile(
          join(this.storeDir, `${nestId}.json`),
          JSON.stringify(nest, null, 2),
          "utf-8",
        );
      }
    }
    this.dirty.clear();
  }

  create(
    participants: string[],
    initialFields?: Record<string, unknown>,
    createdBy?: string,
  ): NestState {
    const nestId = generateId("nst");
    const now = new Date().toISOString();
    const fields: NestState["fields"] = {};

    if (initialFields) {
      for (const [key, value] of Object.entries(initialFields)) {
        fields[key] = {
          value,
          version: 1,
          updated_by: createdBy ?? "unknown",
          updated_at: now,
        };
      }
    }

    const nest: NestState = {
      nest_id: nestId,
      participants,
      fields,
      created_at: now,
      updated_at: now,
    };

    this.nests.set(nestId, nest);
    this.dirty.add(nestId);
    return nest;
  }

  get(nestId: string): NestState | undefined {
    return this.nests.get(nestId);
  }

  list(): NestState[] {
    return Array.from(this.nests.values());
  }

  /** Update fields in a nest (last-write-wins per field). */
  update(
    nestId: string,
    fields: Record<string, unknown>,
    by: string,
  ): NestState | undefined {
    const nest = this.nests.get(nestId);
    if (!nest) return undefined;

    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(fields)) {
      const existing = nest.fields[key];
      nest.fields[key] = {
        value,
        version: (existing?.version ?? 0) + 1,
        updated_by: by,
        updated_at: now,
      };
    }
    nest.updated_at = now;
    this.dirty.add(nestId);
    return nest;
  }

  /** Apply a remote nest update (from another agent). */
  applyRemoteUpdate(
    nestId: string,
    fields: Record<string, unknown>,
    version: number,
    from: string,
  ): NestState | undefined {
    const nest = this.nests.get(nestId);
    if (!nest) {
      // Create the nest if we don't have it (first sync)
      const newNest: NestState = {
        nest_id: nestId,
        participants: [from],
        fields: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.nests.set(nestId, newNest);
      return this.update(nestId, fields, from);
    }

    // Last-write-wins per field
    return this.update(nestId, fields, from);
  }

  /** Get a flat object of current field values. */
  getValues(nestId: string): Record<string, unknown> {
    const nest = this.nests.get(nestId);
    if (!nest) return {};
    const result: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(nest.fields)) {
      result[key] = field.value;
    }
    return result;
  }
}
