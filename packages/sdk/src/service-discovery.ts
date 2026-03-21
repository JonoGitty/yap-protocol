import type { ConnectedService, Intent } from "./types.js";

export interface ServiceSuggestion {
  service: string;
  reason: string;
  both_connected: boolean;
  suggested_action: string;
  my_capabilities: string[];
  their_capabilities: string[];
}

/** Map of intent categories to relevant service types. */
const INTENT_SERVICE_MAP: Record<string, string[]> = {
  scheduling: ["google_calendar", "outlook_calendar", "apple_calendar", "calendly", "teams", "zoom"],
  group_scheduling: ["google_calendar", "outlook_calendar", "apple_calendar", "doodle", "when2meet"],
  travel: ["google_maps", "spotify", "airbnb", "booking_com", "splitwise"],
  invoicing: ["stripe", "paypal", "xero", "quickbooks", "wise"],
  project_coordination: ["github", "linear", "jira", "notion", "slack", "teams"],
  review: ["google_docs", "notion", "figma", "github"],
  briefing: ["slack", "teams", "email", "notion"],
  report: ["google_sheets", "notion", "airtable", "grafana"],
  shopping: ["amazon", "splitwise", "google_maps"],
  fitness: ["strava", "apple_health", "google_fit", "garmin"],
  music: ["spotify", "apple_music", "youtube_music"],
  food: ["google_maps", "deliveroo", "uber_eats", "opentable"],
};

/** Human-readable descriptions of what services can do in context. */
const SERVICE_ACTIONS: Record<string, string> = {
  google_calendar: "Check availability, create events, find free slots",
  outlook_calendar: "Check availability, create events, find free slots",
  apple_calendar: "Check availability, create events",
  calendly: "Share scheduling links, find mutual availability",
  teams: "Schedule meetings, check availability",
  zoom: "Create meeting links",
  google_maps: "Route planning, travel times, venue search",
  spotify: "Create shared playlists, start listening sessions",
  airbnb: "Search accommodation, check prices",
  splitwise: "Track shared expenses, split costs",
  stripe: "Process payments, send invoices",
  paypal: "Send/receive payments",
  github: "Create issues, PRs, check repo status",
  linear: "Create issues, track projects",
  slack: "Send notifications, share updates",
  notion: "Share documents, collaborative notes",
  google_docs: "Collaborative editing, share documents",
  google_sheets: "Share data, collaborative spreadsheets",
  figma: "Share designs, get feedback",
  opentable: "Search restaurants, make reservations",
  deliveroo: "Order food delivery",
  doodle: "Group availability polling",
};

/**
 * Discover relevant service integrations based on what both agents have
 * and what they're trying to coordinate.
 */
export function discoverServices(
  intent: Intent,
  myServices: ConnectedService[],
  theirServices: ConnectedService[],
): ServiceSuggestion[] {
  const suggestions: ServiceSuggestion[] = [];
  const relevantServiceTypes = getRelevantServices(intent.category);

  const myServiceMap = new Map(myServices.map((s) => [s.service, s]));
  const theirServiceMap = new Map(theirServices.map((s) => [s.service, s]));

  for (const serviceType of relevantServiceTypes) {
    const mine = myServiceMap.get(serviceType);
    const theirs = theirServiceMap.get(serviceType);

    if (mine || theirs) {
      suggestions.push({
        service: serviceType,
        reason: SERVICE_ACTIONS[serviceType] ?? `Useful for ${intent.category}`,
        both_connected: !!(mine && theirs),
        suggested_action: mine && theirs
          ? `Both connected — can coordinate directly via ${serviceType}`
          : mine
            ? `You have ${serviceType} — ask if they'd like to connect`
            : `They have ${serviceType} — consider connecting for better coordination`,
        my_capabilities: mine?.capabilities ?? [],
        their_capabilities: theirs?.capabilities ?? [],
      });
    }
  }

  // Also suggest services neither has but would be useful
  const allConnected = new Set([...myServiceMap.keys(), ...theirServiceMap.keys()]);
  for (const serviceType of relevantServiceTypes) {
    if (!allConnected.has(serviceType) && isHighValue(serviceType, intent.category)) {
      suggestions.push({
        service: serviceType,
        reason: `Neither connected, but ${SERVICE_ACTIONS[serviceType] ?? "could help"} for ${intent.category}`,
        both_connected: false,
        suggested_action: `Consider connecting ${serviceType} for better ${intent.category}`,
        my_capabilities: [],
        their_capabilities: [],
      });
    }
  }

  return suggestions;
}

/** Get services relevant to an intent category. */
function getRelevantServices(category: string): string[] {
  // Check exact match first
  if (INTENT_SERVICE_MAP[category]) return INTENT_SERVICE_MAP[category];

  // Fuzzy match on keywords
  const lower = category.toLowerCase();
  for (const [key, services] of Object.entries(INTENT_SERVICE_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return services;
  }

  return [];
}

/** Is this a high-value suggestion even if neither agent has it? */
function isHighValue(service: string, category: string): boolean {
  const highValuePairs: Record<string, string[]> = {
    scheduling: ["google_calendar"],
    group_scheduling: ["google_calendar", "doodle"],
    travel: ["google_maps"],
    invoicing: ["stripe"],
  };
  return highValuePairs[category]?.includes(service) ?? false;
}

/**
 * Generate a natural-language suggestion message for the other agent.
 * Used during negotiation to proactively suggest service integrations.
 */
export function formatServiceSuggestions(suggestions: ServiceSuggestion[]): string {
  if (suggestions.length === 0) return "";

  const bothConnected = suggestions.filter((s) => s.both_connected);
  const oneSided = suggestions.filter((s) => !s.both_connected && (s.my_capabilities.length > 0 || s.their_capabilities.length > 0));
  const neither = suggestions.filter((s) => !s.both_connected && s.my_capabilities.length === 0 && s.their_capabilities.length === 0);

  const lines: string[] = [];

  if (bothConnected.length > 0) {
    lines.push("We both have:");
    for (const s of bothConnected) {
      lines.push(`  • ${s.service} — ${s.reason}`);
    }
  }

  if (oneSided.length > 0) {
    lines.push("Available integrations:");
    for (const s of oneSided) {
      lines.push(`  • ${s.service} — ${s.suggested_action}`);
    }
  }

  if (neither.length > 0) {
    lines.push("Worth connecting:");
    for (const s of neither) {
      lines.push(`  • ${s.service} — ${s.reason}`);
    }
  }

  return lines.join("\n");
}
