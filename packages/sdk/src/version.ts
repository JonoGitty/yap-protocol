import type { Capabilities } from "./types.js";

export const CURRENT_VERSION = "yap/0.2";

export const LOCAL_CAPABILITIES: Capabilities = {
  supported_versions: ["yap/0.1", "yap/0.2"],
  features: [
    "comfort_zone",
    "consent_prompting",
    "multi_party",
    "flock_memory",
    "context_drift",
    "encryption",
    "nests",
  ],
};

/** Pick the highest mutually supported version. */
export function negotiateVersion(
  local: Capabilities,
  remote: Capabilities,
): string {
  // Sort versions descending, pick first match
  const localSet = new Set(local.supported_versions);
  const sorted = [...remote.supported_versions].sort().reverse();
  for (const v of sorted) {
    if (localSet.has(v)) return v;
  }
  // Fallback to oldest
  return "yap/0.1";
}

/** Check if a remote agent supports a specific feature. */
export function hasFeature(
  remote: Capabilities,
  feature: string,
): boolean {
  return remote.features.includes(feature);
}

/** Check if a remote agent supports encryption. */
export function supportsEncryption(remote: Capabilities): boolean {
  return hasFeature(remote, "encryption") &&
    (remote.supported_encryption?.length ?? 0) > 0;
}
