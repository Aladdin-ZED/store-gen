import "server-only";
/**
 * The `finance_lite` release flag (P4 CALL CENTER; operations.md OD25, core D63, §D.4), read through the flags
 * registry: the declared default (src/lib/flags/defs/ops.ts), overridden by the seeded `flags` row's default when the
 * console changed it. P1's `flagValue()` (src/lib/platform/flags.ts, override user > store > plan > market → rules)
 * is not in this track's base; this adapter is replaced by `flagValue("finance_lite", { storeId })` at the merge
 * (CCR r1-p4-8). A read error answers the declared default: the flag gates a screen, never data integrity.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flags } from "@/lib/db/schema";
import { flagDef } from "@/lib/flags/registry";
import type { StoreScope } from "@/lib/tenancy/types";

export const FINANCE_LITE_FLAG = "finance_lite";

/** True when Profit lite is on for the store (see the header). */
export async function financeLiteOn(scope: StoreScope): Promise<boolean> {
  void scope;
  const declared = flagDef(FINANCE_LITE_FLAG)?.default === true;
  try {
    const [row] = await db.select({ value: flags.defaultValue, archived: flags.archived }).from(flags).where(eq(flags.key, FINANCE_LITE_FLAG)).limit(1);
    if (!row || row.archived) return declared;
    return typeof row.value === "boolean" ? row.value : declared;
  } catch {
    return declared;
  }
}
