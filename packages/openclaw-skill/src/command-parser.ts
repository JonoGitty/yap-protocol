import type { Intent, Need } from "../../sdk/src/index.js";

export interface ParsedCommand {
  type: "yap" | "check" | "confirm" | "decline" | "unknown";
  to?: string;
  intent?: Intent;
  context?: Record<string, unknown>;
  needs?: Need[];
  threadId?: string;
  reason?: string;
}

/**
 * Parse natural language commands from messaging platforms.
 * Examples:
 *   "yap @bob about dinner friday" → yap command
 *   "check yaps" → check command
 *   "confirm" → confirm command
 *   "decline scheduling_conflict" → decline command
 */
export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim().toLowerCase();

  // "confirm" or "confirm <thread_id>"
  if (trimmed.startsWith("confirm")) {
    const parts = trimmed.split(/\s+/);
    return {
      type: "confirm",
      threadId: parts[1],
    };
  }

  // "decline" or "decline <reason>"
  if (trimmed.startsWith("decline")) {
    const parts = trimmed.split(/\s+/);
    return {
      type: "decline",
      reason: parts.slice(1).join(" ") || undefined,
    };
  }

  // "check yaps" or "check" or "status"
  if (trimmed === "check" || trimmed === "check yaps" || trimmed === "status") {
    return { type: "check" };
  }

  // "yap @bob about <topic>" or "yap @bob <topic>"
  const yapMatch = text.match(/^yap\s+(@\w+)\s+(?:about\s+)?(.+)$/i);
  if (yapMatch) {
    const to = yapMatch[1];
    const topic = yapMatch[2].trim();

    // Try to extract date/time hints
    const context: Record<string, unknown> = {};
    const needs: Need[] = [];

    // Detect day mentions
    const dayMatch = topic.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dayMatch) {
      context.proposed_day = dayMatch[1].toLowerCase();
    }

    // Detect common intents
    let category = "coordinating";
    if (/dinner|lunch|breakfast|meal|eat/i.test(topic)) {
      category = "scheduling";
      context.event_type = topic.match(/(dinner|lunch|breakfast|meal)/i)?.[1]?.toLowerCase() ?? "meal";
      needs.push(
        { field: "time_windows", reason: "Need your availability", priority: "required" },
        { field: "dietary", reason: "Need dietary requirements", priority: "helpful" },
        { field: "location_preference", reason: "Need preferred area", priority: "nice_to_have" },
      );
    } else if (/meet|meeting|call|sync/i.test(topic)) {
      category = "scheduling";
      context.event_type = "meeting";
      needs.push(
        { field: "time_windows", reason: "Need your availability", priority: "required" },
      );
    } else if (/share|send|give/i.test(topic)) {
      category = "sharing";
    }

    return {
      type: "yap",
      to,
      intent: {
        category,
        summary: topic,
        urgency: "low",
      },
      context,
      needs,
    };
  }

  return { type: "unknown" };
}
