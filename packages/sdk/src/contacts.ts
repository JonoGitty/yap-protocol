import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Capabilities, ConnectedService, Contact } from "./types.js";

export class ContactList {
  private contacts = new Map<string, Contact>();
  private dirty = false;

  constructor(private storePath: string) {}

  async load(): Promise<void> {
    try {
      const data = await readFile(this.storePath, "utf-8");
      const parsed = JSON.parse(data) as Contact[];
      for (const contact of parsed) {
        this.contacts.set(contact.handle, contact);
      }
    } catch {
      // No existing file
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await mkdir(dirname(this.storePath), { recursive: true });
    const data = JSON.stringify(Array.from(this.contacts.values()), null, 2);
    await writeFile(this.storePath, data, "utf-8");
    this.dirty = false;
  }

  /** Update a contact from capabilities received during handshake. */
  updateFromCapabilities(handle: string, caps: Capabilities): Contact {
    const existing = this.contacts.get(handle);
    const now = new Date().toISOString();

    const contact: Contact = {
      handle,
      label: existing?.label,
      notes: existing?.notes,
      platform: caps.platform ?? existing?.platform,
      connected_services: caps.connected_services ?? existing?.connected_services,
      first_seen: existing?.first_seen ?? now,
      last_seen: now,
      last_thread_id: existing?.last_thread_id,
      trust_level: existing?.trust_level ?? "new",
    };

    this.contacts.set(handle, contact);
    this.dirty = true;
    return contact;
  }

  /** Record that we interacted with this agent in a thread. */
  recordInteraction(handle: string, threadId: string): void {
    const contact = this.contacts.get(handle);
    if (contact) {
      contact.last_seen = new Date().toISOString();
      contact.last_thread_id = threadId;
      // Trust is NOT auto-escalated — must be explicitly set by the user
      // via setTrust() to prevent passive trust escalation attacks.
      this.dirty = true;
    }
  }

  /** Explicitly set trust level for a contact. Requires user action. */
  setTrust(handle: string, level: "new" | "developing" | "established" | "trusted"): boolean {
    const contact = this.contacts.get(handle);
    if (!contact) return false;
    contact.trust_level = level;
    this.dirty = true;
    return true;
  }

  get(handle: string): Contact | undefined {
    return this.contacts.get(handle);
  }

  list(): Contact[] {
    return Array.from(this.contacts.values())
      .sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime());
  }

  /** Add or update a contact manually. */
  upsert(handle: string, label?: string, notes?: string): Contact {
    const existing = this.contacts.get(handle);
    const now = new Date().toISOString();
    const contact: Contact = {
      handle,
      label: label ?? existing?.label,
      notes: notes ?? existing?.notes,
      platform: existing?.platform,
      connected_services: existing?.connected_services,
      first_seen: existing?.first_seen ?? now,
      last_seen: existing?.last_seen ?? now,
      trust_level: existing?.trust_level ?? "new",
    };
    this.contacts.set(handle, contact);
    this.dirty = true;
    return contact;
  }

  remove(handle: string): boolean {
    const removed = this.contacts.delete(handle);
    if (removed) this.dirty = true;
    return removed;
  }

  /** Find contacts that have a specific service connected. */
  withService(service: string): Contact[] {
    return this.list().filter((c) =>
      c.connected_services?.some((s) => s.service === service),
    );
  }

  /** Search contacts by handle or label. */
  search(query: string): Contact[] {
    const q = query.toLowerCase();
    return this.list().filter((c) =>
      c.handle.toLowerCase().includes(q) ||
      c.label?.toLowerCase().includes(q),
    );
  }
}
