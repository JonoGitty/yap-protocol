import type { Need } from "./types.js";

export interface ComfortZone {
  always_share: string[];
  ask_first: string[];
  never_share: string[];
}

export type FieldTier = "always_share" | "ask_first" | "never_share";

export function resolveFieldTier(zone: ComfortZone, field: string): FieldTier {
  if (zone.never_share.includes(field)) return "never_share";
  if (zone.always_share.includes(field)) return "always_share";
  if (zone.ask_first.includes(field)) return "ask_first";
  // Safe default per spec section 7.2
  return "ask_first";
}

export interface ClassifiedNeeds {
  auto_share: Need[];
  needs_consent: Need[];
  declined: Need[];
}

export function classifyNeeds(zone: ComfortZone, needs: Need[]): ClassifiedNeeds {
  const result: ClassifiedNeeds = {
    auto_share: [],
    needs_consent: [],
    declined: [],
  };

  for (const need of needs) {
    const tier = resolveFieldTier(zone, need.field);
    if (tier === "always_share") {
      result.auto_share.push(need);
    } else if (tier === "never_share") {
      result.declined.push(need);
    } else {
      result.needs_consent.push(need);
    }
  }

  return result;
}
