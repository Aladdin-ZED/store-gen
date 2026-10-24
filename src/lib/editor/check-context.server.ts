import "server-only";
/**
 * The builder checklist's store facts, computed once when a page opens (docs/STORE-SAAS.md §K.1 T4, LAN Q15;
 * landing.md LAN-§3.2): delivery zones, policies, the confirmation call and its window, the landing and checkout
 * settings, the live version's countdown and stock (LP-21), and the numerals the page may show with who wrote each
 * text field and what the seller attested (LP-02). Everything comes from the scope's store: the page, its versions,
 * its audit rows and the store's settings.
 *
 * Delivery zones are P3's table (0005): until it exists a store has no zones, `count: 0`, and the zone fees are empty.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pageVersions } from "@/lib/db/schema";
import { MARKET_SPECS } from "@/lib/markets";
import { Market, PageDoc as PageDocSchema, type PageDoc } from "@/lib/page/schema";
import { DEFAULT_WINDOW } from "@/lib/settings/keys/ops";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import type { getStoreSettings } from "@/lib/settings";
import type { CheckContextData } from "./check-context";
import { callingWindowFacts, factsOf, numeralsIn, originOf, stockChangedAtOf } from "./check-facts";
import { factsFor } from "./facts.server";

/** The settings keys the checklist reads (one `getStoreSettings` call with the builder's own keys). */
export const CHECK_SETTING_KEYS = ["store", "policies", "checkout", "landing", "ops"] as const;
export type CheckSettings = Awaited<ReturnType<typeof getStoreSettings<(typeof CHECK_SETTING_KEYS)[number]>>>;

/** Publish versions read for the stock history (newest first; > 14 days of daily publishes). */
const STOCK_HISTORY = 40;

const asNumber = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const asString = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** The live version's countdown end and stock, and since when that stock figure has been live. */
async function publishedFacts(scope: StoreScope, pageId: string, publishedVersionId: string | null): Promise<CheckContextData["published"]> {
  if (!publishedVersionId) return null;
  // only the two values, never the documents (a version is 30-60 KB)
  const rows = await db
    .select({
      id: pageVersions.id,
      at: pageVersions.createdAt,
      end: sql<unknown>`JSON_UNQUOTE(JSON_EXTRACT(${pageVersions.doc}, '$.offers.urgency.countdownEnd'))`,
      stock: sql<unknown>`JSON_EXTRACT(${pageVersions.doc}, '$.offers.urgency.stockLeft')`,
    })
    .from(pageVersions)
    .where(whereStore(pageVersions, scope, eq(pageVersions.pageId, pageId), eq(pageVersions.kind, "publish")))
    .orderBy(desc(pageVersions.createdAt), desc(pageVersions.id))
    .limit(STOCK_HISTORY);
  // the live version first (normally the newest publish; a restored older one leads its own run)
  const live = rows.findIndex((r) => r.id === publishedVersionId);
  if (live < 0) return {};
  const history = rows.slice(live).map((r) => ({ at: r.at, stockLeft: asNumber(r.stock) }));
  const head = rows[live]!;
  const countdownEnd = asString(head.end);
  const stockLeft = asNumber(head.stock);
  return {
    ...(countdownEnd ? { countdownEnd } : {}),
    ...(stockLeft !== undefined ? { stockLeft, stockChangedAt: stockChangedAtOf(history) } : {}),
  };
}

/** The generator's text of the page (its newest `generation` version), for `origin`. */
async function generatedDoc(scope: StoreScope, pageId: string): Promise<PageDoc | null> {
  const [row] = await db
    .select({ doc: pageVersions.doc })
    .from(pageVersions)
    .where(whereStore(pageVersions, scope, eq(pageVersions.pageId, pageId), eq(pageVersions.kind, "generation")))
    .orderBy(desc(pageVersions.createdAt), desc(pageVersions.id))
    .limit(1);
  const parsed = row ? PageDocSchema.safeParse(row.doc) : null;
  return parsed?.success ? parsed.data : null;
}

/**
 * The context data of `doc` (the page's draft) in the scope's store. `settings` are the builder's settings read
 * (they include CHECK_SETTING_KEYS); `now` is the preload's clock (the calling window's next 14 days).
 */
export async function loadCheckContext(
  scope: StoreScope,
  store: Pick<StoreRow, "market" | "timezone">,
  page: { id: string; publishedVersionId: string | null },
  doc: PageDoc,
  settings: CheckSettings,
  now = Date.now(),
): Promise<CheckContextData> {
  const { store: identity, policies, checkout, landing, ops } = settings;
  const [published, generated, attested] = await Promise.all([
    publishedFacts(scope, page.id, page.publishedVersionId),
    generatedDoc(scope, page.id),
    factsFor(scope, page.id),
  ]);
  const market = Market.safeParse(store.market);
  const window = callingWindowFacts(ops.callingWindow ?? DEFAULT_WINDOW, ops.windowOverrides ?? [], now, store.timezone);
  const confirmation = identity.confirmation ?? {};

  return {
    saas: true,
    zones: { enabled: checkout.zonesEnabled, count: 0, hasMarketList: market.success && !!MARKET_SPECS[market.data].cities, feesByTopCity: {} },
    policiesReviewed: !!policies.reviewedAt,
    confirmation: {
      callerPhone: !!confirmation.callerPhone,
      whatsapp: !!(confirmation.whatsapp || identity.whatsapp),
      callingWindow: window.callable,
      callingWindowSaved: window.saved,
    },
    waOrder: landing.waOrder.enabled,
    // the market default is `required` for every market today (UX-31: MA required; the EU markets ask for an address too)
    addressMode: checkout.addressMode ?? "required",
    leadDays: checkout.calendar.confirmationLeadDays ?? 0,
    published,
    facts: factsOf(doc, {
      merchant: attested.map((f) => f.text),
      returnDays: policies.returns.accepted ? policies.returns.windowDays : null,
      exchangeDays: policies.exchange.accepted ? policies.exchange.windowDays : null,
      refundDays: policies.refund.withinDays,
      warrantyMonths: policies.warranty.months,
      deliveryDays: policies.delivery.typicalDays,
      freeFrom: policies.delivery.freeFromCents === null ? null : policies.delivery.freeFromCents / 100,
      withinHours: confirmation.withinHours ?? null,
    }),
    origin: originOf(generated, doc),
    attestedFacts: [...new Set(attested.flatMap((f) => (f.value ? [f.value] : numeralsIn(f.text))))].sort(),
  };
}
