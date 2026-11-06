import "server-only";
/**
 * `callingWindowFor(scope)` (P4 CALL CENTER; operations.md OPE-§5.5, OD57, OD63; docs/STORE-SAAS.md D73, §K.2 P0): the
 * one reader every promise of a call time uses (the queue, the thank-you `{when}`, `confirm_hours`, the tracking help,
 * the honesty gate's "we call …" fact, the AI guard). Never null.
 *
 * The store's `ops` setting (`callingWindow`, `windowOverrides`, `openOverrideUntil`) in `stores.timezone`, as the one
 * `EffectiveWindow` (`effectiveWindow`, ./window.ts). `configured` is true once the owner saved the window
 * (`callingWindow.savedAt`, OD63): until then the queue still runs on `DEFAULT_WINDOW` and no shopper is promised an
 * hour. Cached through the `ops` value itself, 30 s per store in `scopedCache("settings")` (getStoreSetting), and the
 * store row's 15 s cache (§E.5): a save of `ops` drops that entry, so "Open calls now" reaches the queue at once in
 * this process, never through a second, staler copy of the window.
 *
 * A setting that cannot be read answers `DEFAULT_WINDOW` in the store's time zone with `configured: false` (logged
 * without its value): the agents keep their hours and no shopper is promised one.
 */
import { logError } from "@/lib/orders/log";
import { getStoreSetting } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import type { StoreScope } from "@/lib/tenancy/types";
import { DEFAULT_WINDOW } from "./defaults";
import { effectiveWindow, type EffectiveWindow } from "./window";

/** stores.timezone's default (§D.4) */
const DEFAULT_TZ = "Africa/Casablanca";

export async function callingWindowFor(scope: StoreScope): Promise<EffectiveWindow> {
  const store = await getStoreById(scope.storeId).catch(() => null);
  const tz = store?.timezone || DEFAULT_TZ;
  try {
    return effectiveWindow(await getStoreSetting(scope, "ops"), tz);
  } catch (err) {
    logError("callcenter:window", err);
    return effectiveWindow({ callingWindow: DEFAULT_WINDOW, windowOverrides: [], openOverrideUntil: null }, tz);
  }
}
