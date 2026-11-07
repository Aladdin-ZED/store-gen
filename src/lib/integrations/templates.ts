import "server-only";
/**
 * The template language of call scripts, WhatsApp and Telegram texts on the server (P5 INTEGRATIONS; operations.md
 * OPE-§7.1, §22.3, OD24; docs/STORE-SAAS.md §K.2 P0, OPE Q.8). Frozen at P0: `renderTemplate`, `orderTemplateValues`,
 * `TEMPLATE_VARS` / `TemplateVar`.
 *
 *   const values = await orderTemplateValues(scope, order, { firstName: member.displayName, locale });
 *   const text = renderTemplate(template.body, values);
 *
 * IMPORT RULE: client components import the pure language from ./template-lang.ts (this file is server-only); server
 * code (P4's script compiler and drawer, P3's thank-you and kit texts, P5's Telegram) imports this file, which
 * re-exports it. Every value comes from a stored fact (owner rule: never invented); ./template-values.ts holds the
 * OPE-§7.1 table as a pure function, and this file only loads the facts.
 *
 *   "{var}" inserts a variable; "[[ … ]]" is an optional block dropped when any variable inside it is empty;
 *   "{{" and "}}" are literal braces. No other syntax, no expressions. Unknown variables fail validation at save.
 */
import { sql } from "drizzle-orm";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { hoursText } from "@/lib/callcenter/window";
import { db } from "@/lib/db/client";
import { pageVersions } from "@/lib/db/schema";
import { zoneLineFor } from "@/lib/delivery/zones.server";
import type { CityKey } from "@/lib/orders/address";
import type { OrderRow } from "@/lib/orders/hooks";
import { logError } from "@/lib/orders/log";
import { Upsell, type Locale } from "@/lib/page/schema";
import { getStoreSettings } from "@/lib/settings";
import { signedTrackPath } from "@/lib/tracking/links";
import { getStoreById } from "@/lib/tenancy/public";
import { byId } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import { storeOrigin } from "@/lib/urls";
import { confirmHoursFor, templateValuesFrom } from "./template-values";
import type { TemplateVar } from "./template-lang";
import { templateLocaleOf } from "./whatsapp/builtins";
import { orderItemsView } from "@/lib/orders/items-v3";

export { TEMPLATE_VARS, TEMPLATE_SRC_MAX, compileTemplate, isTemplateVar, parseTemplate, renderCompiled, renderTemplate, templateVars } from "./template-lang";
export type { CompiledTemplate, TemplateError, TemplateParse, TemplatePart, TemplateValues, TemplateVar } from "./template-lang";

/** A source that is not built yet (a P0 stub: "not implemented: …") is unavailable, silently; anything else is logged. */
async function optional<T>(area: string, read: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("not implemented"))) logError(`integrations:templates:${area}`, err);
    return fallback;
  }
}

/**
 * The version doc's upsell when it is on and the order has not taken it (OPE-§7.1). Only `$.offers.upsell` is read,
 * not the whole document (tens of kilobytes).
 */
async function upsellOf(scope: StoreScope, order: OrderRow): Promise<{ title: string; price: number } | null> {
  if (!order.versionId || orderItemsView(order.items)?.upsell) return null;
  const [row] = await db
    .select({ upsell: sql<unknown>`JSON_EXTRACT(${pageVersions.doc}, '$.offers.upsell')` })
    .from(pageVersions)
    .where(byId(pageVersions, scope, order.versionId))
    .limit(1);
  let raw: unknown = row?.upsell ?? null;
  if (typeof raw === "string") raw = JSON.parse(raw);
  const up = raw === null ? null : Upsell.safeParse(raw);
  return up?.success && up.data.enabled && up.data.title.trim() ? { title: up.data.title, price: up.data.price } : null;
}

/** The order's variables in the viewer's template locale (OPE-§7.1 table); a variable without a stored fact is absent. */
export async function orderTemplateValues(scope: StoreScope, order: OrderRow, viewer: { firstName: string | null; locale: Locale }): Promise<Partial<Record<TemplateVar, string>>> {
  // an order of another store never borrows this store's facts (and this store's never reach it)
  if (order.storeId !== scope.storeId) return {};
  const store = await getStoreById(scope.storeId);
  if (!store) return {};
  const locale = templateLocaleOf(viewer.locale);
  const now = new Date();
  const confirmed = order.confirmState === "confirmed" && order.confirmedAt;
  const [settings, calling, line, upsell] = await Promise.all([
    getStoreSettings(scope, ["store", "landing"]),
    callingWindowFor(scope),
    // after the call the promise counts from the confirmation with no lead (OPS-12); before it, from now with the lead
    optional("eta", () => (confirmed ? zoneLineFor(scope, order.cityKey as CityKey | null, order.confirmedAt!, { stage: "after_call" }) : zoneLineFor(scope, order.cityKey as CityKey | null)), null),
    optional("upsell", () => upsellOf(scope, order), null),
  ]);
  const trackingLink = settings.landing.thankYou.trackLink ? await optional("track", () => `${storeOrigin(store)}${signedTrackPath(store, order.id)}`, null) : null;
  return templateValuesFrom({
    order: { ...order, items: orderItemsView(order.items) },
    locale: viewer.locale,
    store: { name: store.name, market: store.market, timezone: store.timezone },
    viewerName: viewer.firstName,
    confirmation: settings.store.confirmation,
    etaText: line && !line.notServed ? (line.etaText?.[locale] ?? null) : null,
    confirmHours: confirmHoursFor(calling, locale, now, hoursText),
    upsell,
    trackingLink,
    now,
  });
}
