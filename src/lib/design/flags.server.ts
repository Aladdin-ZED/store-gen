import "server-only";
/**
 * The design track's read of its ops flags (P6 DESIGN; design.md DES-§2.9, docs/STORE-SAAS.md §D.4). The resolver of
 * the platform, `flagValue(key, ctx)`, is P1's src/lib/platform/flags.ts; until it is in this tree (CCR r1-p6-10) the
 * design check reads the two layers it needs itself: the store's own override (`flag_overrides`, scope `store`, not
 * expired), then the flag's console default (`flags.default_value`), then the declared default (`flags/defs/design.ts`).
 * The rules (plans, markets, rollout) arrive with `flagValue`. No store data is read: both tables are platform tables.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flagOverrides, flags } from "@/lib/db/schema";
import { flags as DESIGN_FLAGS } from "@/lib/flags/defs/design";
import type { StoreScope } from "@/lib/tenancy/types";

/** the design flags, and P7's `ai_director_brief` (GH-1: read by key, off while P7 has not declared it) */
export type DesignFlagKey = "design_novelty_check" | "design_publish_gates" | "design_new_heroes" | "ai_director_brief";

/** The flag's value for the scope's store: store override > console default > declared default. Never throws. */
export async function designFlag(key: DesignFlagKey, scope: StoreScope): Promise<unknown> {
  const declared = DESIGN_FLAGS.find((f) => f.key === key)?.default;
  try {
    const [override] = await db
      .select({ value: flagOverrides.value, expiresAt: flagOverrides.expiresAt })
      .from(flagOverrides)
      .where(and(eq(flagOverrides.flagKey, key), eq(flagOverrides.scope, "store"), eq(flagOverrides.scopeId, scope.storeId)))
      .limit(1);
    if (override && (!override.expiresAt || override.expiresAt.getTime() > Date.now())) return override.value;
    const [row] = await db.select({ value: flags.defaultValue, archived: flags.archived }).from(flags).where(eq(flags.key, key)).limit(1);
    if (row && !row.archived && row.value !== null && row.value !== undefined) return row.value;
  } catch {
    // the flag tables unreadable: the declared default
  }
  return declared;
}
