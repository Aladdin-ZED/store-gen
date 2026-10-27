import "server-only";
/**
 * Server-side Purchase events for new orders: Meta Conversions API and TikTok Events API.
 *
 *   createOrder() → purchaseConversion(...)  (only fresh, non-honeypot, plausible orders)
 *   route handler → sendConversionsAfterResponse(target.scope, conversion)   (after the response, never blocks)
 *
 * Every pixel of the VERSION the order was validated against (up to 3 Meta, 3 TikTok: the ids the
 * shopper's browser fired) that has its own server token in the STORE's Settings → Pixels
 * (`tracking_secrets`, keyed by pixel id inside the store, PIX-01) gets one event, carrying the order id as
 * event id — the id the thank-you page's browser pixel sends with the same event name — so each platform
 * counts the order once. The test code rides along only inside an active test window of that page (the
 * store's pixel library). Pixels without a token stay browser-only. Each outcome updates pixel_health
 * (throttled). Failures are logged (no PII, no token) and never touch the order. The pure parts live in
 * ./conversions-core.
 *
 * Multi-tenant (docs/STORE-SAAS.md §D.10, §E.3; PIX-01, PIX-02): the scoped forms load the order's store's secrets and
 * library, and the fallback event URL is the store's page URL (`storeUrl`). Store B firing store A's pixel id never
 * uses A's token, and the health it records is B's. The public order route passes its target's scope (CCR r1.0-t4-1).
 */
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { recordPixelHealth } from "@/lib/pixels/health.server";
import { getStoreSettings, type SettingValue } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import { byId } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";
import { dispatchPurchase, type PurchaseConversion } from "./conversions-core";

export {
  CONVERSION_MAX_RISK,
  META_GRAPH_API_VERSION,
  META_PURCHASE_EVENT,
  TIKTOK_EVENTS_URL,
  TIKTOK_PURCHASE_EVENT,
  purchaseConversion,
  serverCredentials,
  type PurchaseConversion,
} from "./conversions-core";

const LOG = "[conversions]";

type Secrets = SettingValue<"tracking_secrets">;
type Library = SettingValue<"pixel_library">;

/** The store's URL of the event's page when the order did not report one (live pages only; exports live elsewhere). */
async function storeFallbackUrl(scope: StoreScope, c: PurchaseConversion): Promise<string | null> {
  if (c.source !== "live") return null;
  const [[row], store] = await Promise.all([
    db.select({ slug: pages.slug }).from(pages).where(byId(pages, scope, c.pageId)).limit(1),
    getStoreById(scope.storeId),
  ]);
  return row && store ? storeUrl(store, `/${row.slug}`) : null;
}

/** Dispatch, log the failures, record the pixels' health (the callers catch). */
async function dispatchAndRecord(scope: WriteScope, event: PurchaseConversion, secrets: Secrets, library: Library): Promise<void> {
  const results = await dispatchPurchase(event, secrets, library);
  for (const r of results) {
    if (!r.ok) console.error(`${LOG} ${r.platform} purchase for order ${event.orderId} (pixel …${r.pixelId.slice(-4)}) failed: ${r.detail ?? "unknown error"}`);
  }
  if (results.length) {
    await recordPixelHealth(
      scope,
      results.map((r) => ({ platform: r.platform, id: r.pixelId, state: r.ok ? ("ok" as const) : ("refused" as const), code: r.code, testMode: r.testMode })),
      { throttle: true },
    );
  }
}

const logFailure = (c: PurchaseConversion, err: unknown) =>
  console.error(`${LOG} order ${c.orderId}:`, err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");

/**
 * Send the order's Purchase to every pixel of the store that has its own server token. Never throws. `secrets` /
 * `library` default to the store's settings (pass them when already loaded).
 */
export async function sendPurchaseConversions(scope: WriteScope, c: PurchaseConversion, opts: { secrets?: Secrets; library?: Library } = {}): Promise<void> {
  try {
    const stored = opts.secrets && opts.library ? null : await getStoreSettings(scope, ["tracking_secrets", "pixel_library"]);
    const secrets = opts.secrets ?? stored!.tracking_secrets;
    const library = opts.library ?? stored!.pixel_library;
    const event: PurchaseConversion = c.sourceUrl ? c : { ...c, sourceUrl: await storeFallbackUrl(scope, c).catch(() => null) };
    await dispatchAndRecord(scope, event, secrets, library);
  } catch (err) {
    logFailure(c, err);
  }
}

/**
 * Queue the Purchase events to run once the response is sent (Next after()). Never throws and
 * never delays the shopper's confirmation.
 */
export function sendConversionsAfterResponse(scope: StoreScope, c: PurchaseConversion | null | undefined): void {
  if (!c) return;
  try {
    // after the response the send is background work of the order's store (the outbox handler's scope later, OPE-§20.4)
    after(() => sendPurchaseConversions(systemScope(systemCtx("orders.capi"), scope.storeId), c));
  } catch (err) {
    console.error(`${LOG} could not schedule order ${c.orderId}:`, err instanceof Error ? err.message : "unknown error");
  }
}
