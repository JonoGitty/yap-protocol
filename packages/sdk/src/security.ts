/**
 * Security module — centralises all security enforcement for the Yap protocol.
 *
 * Handles:
 * - Input sanitisation (prompt injection prevention)
 * - Replay detection (nonce tracking)
 * - Timestamp validation
 * - Content security policy for untrusted context
 * - Rate limiting per agent
 */

import type { YapPacket, Need } from "./types.js";

// --- Prompt injection prevention ---

/** Characters and patterns that could be used for prompt injection. */
const DANGEROUS_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s*:\s*/i,
  /\boverride\b.*\b(share|send|reveal|disclose)\b/i,
  /\buser\s+override\b/i,
  /\balways\s+share\s+all\b/i,
  /\bignore\s+(comfort\s*zone|permissions|consent)\b/i,
  /\bact\s+as\s+(if|though)\b/i,
  /\byou\s+are\s+now\b/i,
  /\bforget\s+(everything|all|your)\b/i,
  /<script\b/i,
  /javascript:/i,
  /data:text\/html/i,
];

export interface SanitisationResult {
  safe: boolean;
  warnings: string[];
  sanitised: string;
}

/** Check a string for potential prompt injection patterns. */
export function sanitiseString(input: string): SanitisationResult {
  const warnings: string[] = [];

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      warnings.push(`Suspicious pattern detected: ${pattern.source}`);
    }
  }

  // Strip control characters except newlines and tabs
  const sanitised = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return {
    safe: warnings.length === 0,
    warnings,
    sanitised,
  };
}

/** Deep-sanitise all string values in a context object. */
export function sanitiseContext(context: Record<string, unknown>): {
  context: Record<string, unknown>;
  warnings: string[];
} {
  const warnings: string[] = [];

  function sanitiseValue(value: unknown, path: string): unknown {
    if (typeof value === "string") {
      const result = sanitiseString(value);
      if (!result.safe) {
        for (const w of result.warnings) {
          warnings.push(`${path}: ${w}`);
        }
      }
      return result.sanitised;
    }
    if (Array.isArray(value)) {
      return value.map((v, i) => sanitiseValue(v, `${path}[${i}]`));
    }
    if (typeof value === "object" && value !== null) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        obj[k] = sanitiseValue(v, `${path}.${k}`);
      }
      return obj;
    }
    return value;
  }

  const sanitised = sanitiseValue(context, "context") as Record<string, unknown>;
  return { context: sanitised, warnings };
}

/** Sanitise needs array — check reason fields for injection. */
export function sanitiseNeeds(needs: Need[]): { needs: Need[]; warnings: string[] } {
  const warnings: string[] = [];
  const sanitised = needs.map((need) => {
    const result = sanitiseString(need.reason);
    if (!result.safe) {
      for (const w of result.warnings) {
        warnings.push(`need.${need.field}.reason: ${w}`);
      }
    }
    return { ...need, reason: result.sanitised };
  });
  return { needs: sanitised, warnings };
}

// --- Replay detection ---

export class ReplayDetector {
  private seenPackets = new Map<string, number>(); // packet_id → timestamp
  private maxAge: number;
  private maxSize: number;

  constructor(maxAgeMs: number = 60 * 60 * 1000, maxSize: number = 10000) {
    this.maxAge = maxAgeMs;
    this.maxSize = maxSize;
  }

  /** Returns true if this packet has been seen before (replay). */
  isReplay(packetId: string): boolean {
    if (this.seenPackets.has(packetId)) return true;

    this.seenPackets.set(packetId, Date.now());

    // Prune old entries
    if (this.seenPackets.size > this.maxSize) {
      const cutoff = Date.now() - this.maxAge;
      for (const [id, ts] of this.seenPackets) {
        if (ts < cutoff) this.seenPackets.delete(id);
      }
    }

    return false;
  }
}

// --- Timestamp validation ---

const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000; // 5 minutes

/** Validate that a packet timestamp is reasonable. */
export function validateTimestamp(timestamp: string): { valid: boolean; reason?: string } {
  const ts = new Date(timestamp).getTime();
  if (isNaN(ts)) return { valid: false, reason: "Invalid timestamp format" };

  const now = Date.now();
  const drift = Math.abs(now - ts);

  if (drift > MAX_TIMESTAMP_DRIFT_MS) {
    return { valid: false, reason: `Timestamp drift too large: ${Math.round(drift / 1000)}s` };
  }

  return { valid: true };
}

// --- Rate limiting ---

export class RateLimiter {
  private counts = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private maxPerWindow: number = 50,
    private windowMs: number = 60 * 1000,
  ) {}

  /** Returns true if the agent has exceeded the rate limit. */
  isLimited(agentHandle: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(agentHandle);

    if (!entry || now - entry.windowStart > this.windowMs) {
      this.counts.set(agentHandle, { count: 1, windowStart: now });
      return false;
    }

    entry.count++;
    return entry.count > this.maxPerWindow;
  }
}

// --- URL/Link validation ---

const ALLOWED_URL_SCHEMES = ["https:", "http:", "spotify:", "tel:", "mailto:"];

/** Validate URLs in context to prevent malicious links. */
export function validateUrl(url: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_URL_SCHEMES.includes(parsed.protocol)) {
      return { safe: false, reason: `Disallowed URL scheme: ${parsed.protocol}` };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: "Invalid URL" };
  }
}

/** Scan context for URLs and validate them. */
export function scanContextUrls(context: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const urlPattern = /https?:\/\/[^\s"']+|[a-z]+:\/\/[^\s"']+/gi;

  function scan(value: unknown, path: string): void {
    if (typeof value === "string") {
      const urls = value.match(urlPattern);
      if (urls) {
        for (const url of urls) {
          const result = validateUrl(url);
          if (!result.safe) {
            warnings.push(`${path}: ${result.reason} — ${url}`);
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => scan(v, `${path}[${i}]`));
    } else if (typeof value === "object" && value !== null) {
      for (const [k, v] of Object.entries(value)) {
        scan(v, `${path}.${k}`);
      }
    }
  }

  scan(context, "context");
  return warnings;
}

// --- Schema validation whitelist ---

const ALLOWED_SCHEMA_TYPES = ["string", "number", "boolean", "array", "object", "enum", "currency"];

/** Validate a dynamic schema for injection. */
export function validateSchemaFields(fields: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  function validate(obj: Record<string, unknown>, path: string): void {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        const field = value as Record<string, unknown>;
        if (field.type && !ALLOWED_SCHEMA_TYPES.includes(field.type as string)) {
          warnings.push(`${path}.${key}: Invalid type "${field.type}"`);
        }
        if (field.properties) {
          validate(field.properties as Record<string, unknown>, `${path}.${key}`);
        }
        if (field.items && typeof field.items === "object") {
          validate(field.items as Record<string, unknown>, `${path}.${key}.items`);
        }
      }
    }
  }

  validate(fields, "schema");
  return warnings;
}
