/**
 * Pulse counters of the landing track (P3 LANDING, landing.md).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3), created at P0 and imported by src/lib/pulse/registry.ts: until the
 * track merges it contributes no key (an empty record, the safe default), and the track never edits the registry.
 */
import type { PulseContributor } from "../types";

export const contributor: PulseContributor = {
  id: "landing",
  contribute: async () => ({}),
};
