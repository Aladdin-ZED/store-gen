/**
 * The order's template variables from stored facts (P5 INTEGRATIONS; operations.md OPE-§7.1 source table, OD24, OD57,
 * OD63; owner rule: never invent). Pure: ./templates.ts `orderTemplateValues` loads the facts (store, settings, zone
 * line, calling window, version doc, tracking link) on the server and calls `templateValuesFrom`; the offline self test
 * calls it with injected facts. A variable without a stored fact is absent (renders empty, drops its optional block).
 *
 * Choices the table leaves open:
 * - `units_text` is the "customer" rendering of src/lib/orders/text.ts (labels; docs/OFFERS.md §G.4 names it for
 *   WhatsApp and the admin drawer), not the "warehouse" one (codes, for Sheets, CSV and Telegram): a customer reads
 *   it in WhatsApp and an agent reads it aloud from the script.
 * - `total`, `shipping_text`, `upsell_price` use the order's own currency (the store currency when it was placed).
 * - `confirm_number` is rendered national when it belongs to the store's market ("0612345678"), else "+<digits>";
 *   the WhatsApp digits get the same treatment, so a customer always reads one dialable number.
 * - `ship_after_date` is empty once the hold has passed (OD49: a past hold is no hold).
 */
import { formatMoney } from "@/lib/markets/money";
import { callingPrefix, phoneToNational } from "@/lib/markets/phone";
import type { OrderItems } from "@/lib/db/schema";
import { orderText } from "@/lib/orders/text";
import { rangesForDay, shopperPromiseAllowed, type EffectiveWindow } from "@/lib/callcenter/window";
import { messages as ar } from "@/lib/i18n/admin/ar/integrations";
import { messages as en } from "@/lib/i18n/admin/en/integrations";
import { messages as fr } from "@/lib/i18n/admin/fr/integrations";
import type { Locale } from "@/lib/page/schema";
import type { TemplateValues } from "./template-lang";
import { templateLocaleOf, type TemplateLocale } from "./whatsapp/builtins";

/** The order columns a template reads (a subset of `OrderRow`, so fixtures need no database row). */
export interface TemplateOrder {
  id: string;
  name: string;
  productName: string;
  items: OrderItems | null;
  qty: number;
  total: number;
  shipping: number;
  currency: string;
  city: string | null;
  address: string | null;
  landmark: string | null;
  carrierLabel: string | null;
  trackingRef: string | null;
  shipAfter: Date | null;
}

/** Everything a template may say about one order, each a stored fact (or its plain rendering). */
export interface TemplateFacts {
  order: TemplateOrder;
  /** the template's locale (a page locale outside ar / fr / en reads the English words) */
  locale: Locale;
  store: { name: string; market: string; timezone: string };
  /** the viewer's member display name (`agent_first_name` is its first word) */
  viewerName: string | null;
  /** store setting `store.confirmation` (LP-04); null = unset */
  confirmation: { callerPhone?: string; whatsapp?: string } | null;
  /** the zone line's ETA text in the template locale; null = no zone, no ETA, not served */
  etaText: string | null;
  /** `confirmHoursFor(...)`: "" unless the owner saved the window and today has hours */
  confirmHours: string;
  /** the version doc's `offers.upsell` when enabled and not already on the order */
  upsell: { title: string; price: number } | null;
  /** the signed /track link; null when tracking is off or not available */
  trackingLink: string | null;
  now: Date;
}

const WORDS: Readonly<Record<TemplateLocale, Partial<Record<string, string>>>> = { ar, fr, en };
const DATE_LOCALE: Readonly<Record<TemplateLocale, string>> = { ar: "ar-MA", fr: "fr-MA", en: "en-GB" };

/** The template words of `key` in the locale's own catalog (English when that catalog lacks it). */
function word(key: "int.tpl.shipping.paid" | "int.tpl.shipping.free", locale: TemplateLocale): string {
  return WORDS[locale][key] ?? en[key];
}

/** The first word of a name ("Salma Benali" → "Salma"); "" for a blank name. */
export function firstWord(s: string | null | undefined): string {
  return (s ?? "").trim().split(/\s+/)[0] ?? "";
}

const text = (s: string | null | undefined): string | undefined => {
  const v = (s ?? "").trim();
  return v ? v : undefined;
};

/** A phone of the store's market in national digits, any other in "+<digits>". */
export function dialable(e164: string, market: string): string {
  const prefix = callingPrefix(market);
  return prefix && e164.startsWith(prefix) ? phoneToNational(e164) : e164;
}

/** OPE-§7.1 `confirm_number`: the caller phone, else the WhatsApp digits; "" when `store.confirmation` sets neither. */
export function confirmNumberOf(confirmation: TemplateFacts["confirmation"], market: string): string {
  if (confirmation?.callerPhone) return dialable(confirmation.callerPhone, market);
  if (confirmation?.whatsapp) return dialable(`+${confirmation.whatsapp}`, market);
  return "";
}

/** The store-local calendar day of `now` (YYYY-MM-DD). */
function ymdIn(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * OPE-§7.1 `confirm_hours` (OD57, OD63): `hoursText(w, …)` only when a shopper may be promised an hour (the owner saved
 * the window) and today has a range; otherwise "". A source that is not available yet (P4's `hoursText` is a P0 stub
 * that throws) answers "", never a made-up line.
 */
export function confirmHoursFor(
  w: EffectiveWindow,
  locale: TemplateLocale,
  now: Date,
  hoursText: (w: EffectiveWindow, locale: Locale, dateLocale: string, now: Date) => string,
): string {
  if (!shopperPromiseAllowed(w)) return "";
  if (rangesForDay(ymdIn(now, w.tz), w).length === 0) return "";
  try {
    return hoursText(w, locale, DATE_LOCALE[locale], now).trim();
  } catch {
    return "";
  }
}

/** "5 nov." · "5 نونبر" · "5 Nov" in the store's time zone, Latin digits (core §I.5). */
export function shortDate(d: Date, locale: TemplateLocale, tz: string): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[locale], { day: "numeric", month: "short", timeZone: tz, numberingSystem: "latn" }).format(d);
}

/** The variables of one order (OPE-§7.1). `order_count_today` is Telegram's own and never set here. */
export function templateValuesFrom(f: TemplateFacts): TemplateValues {
  const { order, store } = f;
  const locale = templateLocaleOf(f.locale);
  const money = (amount: number) => formatMoney(amount, order.currency || "MAD", f.locale);
  const v: TemplateValues = {};
  const set = (name: keyof TemplateValues, value: string | null | undefined) => {
    const t = text(value);
    if (t !== undefined) v[name] = t;
  };

  set("customer_first_name", firstWord(order.name));
  set("order_id", order.id);
  set("product", order.productName);
  set("offer_label", order.items?.bundleLabel);
  set("units_text", orderText(order.items, { mode: "customer", orderId: order.id, productName: order.productName }));
  if (Number.isFinite(order.qty) && order.qty > 0) set("qty", String(order.qty));
  set("total", money(order.total));
  set("shipping_text", order.shipping > 0 ? word("int.tpl.shipping.paid", locale).replace("{amount}", money(order.shipping)) : word("int.tpl.shipping.free", locale));
  set("city", order.city);
  set("address", order.address);
  set("landmark", order.landmark);
  set("eta_text", f.etaText);
  set("store_name", store.name);
  set("agent_first_name", firstWord(f.viewerName));
  set("confirm_number", confirmNumberOf(f.confirmation, store.market));
  set("confirm_hours", f.confirmHours);
  if (f.upsell) {
    set("upsell_title", f.upsell.title);
    if (v.upsell_title) set("upsell_price", money(f.upsell.price));
  }
  set("tracking_link", f.trackingLink);
  set("carrier_label", order.carrierLabel);
  set("carrier_tracking", order.trackingRef);
  if (order.shipAfter && order.shipAfter.getTime() > f.now.getTime()) set("ship_after_date", shortDate(order.shipAfter, locale, store.timezone));
  return v;
}
