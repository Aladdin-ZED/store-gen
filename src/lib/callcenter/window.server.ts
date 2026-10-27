import "server-only";
/**
 * `callingWindowFor(scope)` (P4 CALL CENTER; operations.md OPE-§5.5, OD57, OD63; docs/STORE-SAAS.md D73, §K.2 P0): the
 * one reader every promise of a call time uses (the queue, the thank-you `{when}`, `confirm_hours`, the tracking help,
 * the honesty gate's "we call …" fact, the AI guard). Never null.
 *
 * P0 stub: the documented safe default, `DEFAULT_WINDOW` in the store's time zone with `configured: false`, so the
 * queue has hours and no shopper is promised one. P4 reads `ops.callingWindow`, `windowOverrides` and
 * `openOverrideUntil` (scopedCache("settings"), 30 s).
 */
import { getStoreById } from "@/lib/tenancy/public";
import type { StoreScope } from "@/lib/tenancy/types";
import { DEFAULT_WINDOW } from "./defaults";
import type { EffectiveWindow } from "./window";

/** stores.timezone's default (§D.4) */
const DEFAULT_TZ = "Africa/Casablanca";

export async function callingWindowFor(scope: StoreScope): Promise<EffectiveWindow> {
  const store = await getStoreById(scope.storeId);
  return {
    tz: store?.timezone || DEFAULT_TZ,
    days: DEFAULT_WINDOW.days,
    closedDates: [],
    overrides: [],
    openOverrideUntil: null,
    configured: false,
  };
}
