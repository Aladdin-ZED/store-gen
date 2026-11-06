import "server-only";
/**
 * The `finance_lite` release flag (P4 CALL CENTER; operations.md OD25, core D63, §D.4), read through P1's resolver
 * `flagValue()` (src/lib/platform/flags.ts: override user > store > plan > market → rules → the declared default of
 * src/lib/flags/defs/ops.ts), applied at the P4 merge (CCR r1-p4-8). A read error answers the declared default: the
 * flag gates a screen, never data integrity.
 */
import { flagDef } from "@/lib/flags/registry";
import { flagValue } from "@/lib/platform/flags";
import type { StoreScope } from "@/lib/tenancy/types";

export const FINANCE_LITE_FLAG = "finance_lite";

/** True when Profit lite is on for the store (see the header). */
export async function financeLiteOn(scope: StoreScope): Promise<boolean> {
  try {
    return (await flagValue<boolean>(FINANCE_LITE_FLAG, { storeId: scope.storeId })) === true;
  } catch {
    return flagDef(FINANCE_LITE_FLAG)?.default === true;
  }
}
