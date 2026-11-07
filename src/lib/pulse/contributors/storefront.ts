/**
 * Pulse counters of the storefront file (S1 STOREFRONT, storefront.md STO-§27.2).
 * Extension file (docs/STORE-SAAS.md §K.3, §K.4), created empty at the R2 contract step (C2-D) and imported by
 * src/lib/pulse/registry.ts (PULSE_CONTRIBUTORS); the track fills it and never edits the registry. Until the track fills it, the contributor answers no key.
 */
import type { PulseContributor } from "../types";

export const contributor: PulseContributor = {
  id: "storefront",
  contribute: async () => ({}),
};
