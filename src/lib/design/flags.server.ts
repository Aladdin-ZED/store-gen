import "server-only";
/**
 * The design track's read of its ops flags (P6 DESIGN; design.md DES-§2.9, docs/STORE-SAAS.md §D.4) through P1's
 * resolver `flagValue(key, ctx)` (CCR r1-p6-10, applied at the P6 merge): rules, overrides, the console default and the
 * declared default, with the store the scope names in `ctx`. A key the registry does not know yet (P7's
 * `ai_director_brief` before the P7 merge) reads its declared default, or nothing.
 */
import { flagValue } from "@/lib/platform/flags";
import { flags as DESIGN_FLAGS } from "@/lib/flags/defs/design";
import type { StoreScope } from "@/lib/tenancy/types";

/** the design flags, and P7's `ai_director_brief` (GH-1: read by key, off while P7 has not declared it) */
export type DesignFlagKey = "design_novelty_check" | "design_publish_gates" | "design_new_heroes" | "ai_director_brief";

/** The flag's value for the scope's store: store override > console default > declared default. Never throws. */
export async function designFlag(key: DesignFlagKey, scope: StoreScope): Promise<unknown> {
  try {
    return await flagValue(key, { storeId: scope.storeId });
  } catch {
    // an undeclared key (P7's before its merge): the declared default, if any
    return DESIGN_FLAGS.find((f) => f.key === key)?.default;
  }
}
