/**
 * The Telegram texts (P5 INTEGRATIONS; operations.md OPE-§21.2, §26, §28.1; OD17, OD23, OD38, OD52; IN-04, SF-05). Pure
 * and isomorphic: the `telegram` outbox handler builds every message here at send time, `fin.alerts` (P4) hands its
 * alert to `queueTelegram`, and `test:conversions` proves the rules on the three catalogs.
 *
 *   orderMessage([order], { locale: "fr", tz, pii: "masked" })
 *   // "Nouvelle commande CMD-7K3Q9X · Pack Duo, 2 × Noir · 349 DH · Samira · 06 •• •• 56 78 · Casablanca"
 *
 * - Store default locale (ar, fr, en; another locale reads English), plain text, no emoji, no em dash, amounts through
 *   src/lib/markets/money.ts from integer cents, Latin digits.
 * - New orders: one line per order (id, offer, total, first name, the phone and the city; the full level adds the
 *   full phone and the address, the masked level shows the masked phone the caller gives, or none). Two or more
 *   orders of one store in the batch window are one message: the header (count, window, total), then ≤ 10 lines.
 * - "[TEST]" leads a message about test orders (sent only when the store asked for them, OPE-§26); "(renvoi)" marks
 *   a deliberate re-send of a delivered message (OPE-§28.1).
 * - The daily summary: each figure is its own catalog key (OD38: no string names two of placed / confirmed /
 *   delivered), a rate only with its n at or above the minimum (OD17), a figure the platform could not read is left
 *   out, never estimated; the cash-held line only for carrier accounts settled by statement (OD52, R2).
 * - Every text is capped at 3,500 characters (OPE-§L): whole order lines are dropped from the end and counted.
 */
import { formatMessage, type AdminLocale } from "@/lib/i18n/admin";
import { messages as ar } from "@/lib/i18n/admin/ar/integrations";
import { messages as en } from "@/lib/i18n/admin/en/integrations";
import { messages as fr } from "@/lib/i18n/admin/fr/integrations";
import { formatMoney } from "@/lib/markets/money";

/** OPE-§L: a message's cap and the orders one merged message lists. */
export const TG_TEXT_MAX = 3_500;
export const TG_BATCH_MAX = 10;
/** an order line's offer text (the units can be long; the line stays one line) */
const OFFER_MAX = 120;

export type TgLocale = "ar" | "fr" | "en";
export const tgLocaleOf = (locale: string | null | undefined): TgLocale => (locale === "ar" || locale === "fr" ? locale : "en");

/** The message keys of this file (`int.tg.*`). */
export type TgKey = Extract<keyof typeof en, `int.tg.${string}`>;

const CATALOGS: Readonly<Record<TgLocale, Partial<Record<string, string>>>> = { ar, fr, en };

/** The `int.tg.*` text in the locale's own catalog (English when the catalog lacks it), with `vars`. */
export function tgText(key: TgKey, vars: Record<string, string | number> | undefined, locale: TgLocale): string {
  const template = CATALOGS[locale][key] ?? en[key];
  return formatMessage(template, vars, locale as AdminLocale);
}

/** Who reads a message and how (the store's settings at send time). */
export interface TgEnv {
  locale: TgLocale;
  /** the store's IANA time zone */
  tz: string;
  /** customer fields: masked (default) or full (OPE-§21.1) */
  pii: "masked" | "full";
  /** a deliberate re-send of a delivered message (OPE-§28.1) */
  resent?: boolean;
}

/** One order as a message line shows it. Every field the caller could not read is null and left out. */
export interface TgOrder {
  id: string;
  /** offer label and units ("Pack Duo, 2 × Noir") */
  offer: string;
  totalCents: number;
  currency: string;
  firstName: string;
  /** the masked phone (P4's maskPhone), shown at both levels; null when masking is not available */
  phoneMasked: string | null;
  /** the full phone (national format), shown at the full level only */
  phone: string | null;
  /** shown at the full level only */
  address: string | null;
  city: string | null;
  createdAt: Date;
  test: boolean;
}

/** One line: no control characters, no line breaks, no em dash, trimmed. */
export function oneLine(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/[\u2014\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (s: string, max: number) => (Array.from(s).length > max ? `${Array.from(s).slice(0, max - 1).join("")}…` : s);

export const money = (cents: number, currency: string, locale: TgLocale) => formatMoney(Math.round(cents) / 100, currency || "MAD", locale);

/** "14:02" in the store's time zone, Latin digits. */
export function clock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(d);
}

/** The details of one order, joined with " · ": offer, total, first name, phone, city (+ address at the full level). */
function orderDetails(o: TgOrder, env: TgEnv): string[] {
  const phone = env.pii === "full" ? (o.phone ?? o.phoneMasked) : o.phoneMasked;
  const parts = [clip(oneLine(o.offer), OFFER_MAX), money(o.totalCents, o.currency, env.locale), oneLine(o.firstName), oneLine(phone), oneLine(o.city)];
  if (env.pii === "full") parts.push(clip(oneLine(o.address), 160));
  return parts.filter((p) => p !== "");
}

/** "[TEST] " and " (renvoi)" around a message's first line. */
function frame(first: string, env: TgEnv, test: boolean): string {
  return `${test ? `${tgText("int.tg.test", undefined, env.locale)} ` : ""}${first}${env.resent ? ` ${tgText("int.tg.resent", undefined, env.locale)}` : ""}`;
}

/**
 * Cap a message: lines are dropped from the end (never the first) until it fits, then a hard cut as a last resort.
 * With `droppedOrders` (a batch: every line after the first is an order) the dropped orders are counted on a last line.
 */
export function capText(lines: readonly string[], env: TgEnv, max = TG_TEXT_MAX, droppedOrders: number | null = null): string {
  const kept = [...lines];
  let dropped = droppedOrders ?? 0;
  const render = () => (droppedOrders !== null && dropped > 0 ? [...kept, tgText("int.tg.more", { count: dropped }, env.locale)] : kept).join("\n");
  while (kept.length > 1 && Array.from(render()).length > max) {
    kept.pop();
    dropped++;
  }
  const text = render();
  return Array.from(text).length > max ? `${Array.from(text).slice(0, max - 1).join("")}…` : text;
}

/** One new order: "Nouvelle commande CMD-… · offer · total · first name · phone · city". */
export function newOrderText(o: TgOrder, env: TgEnv): string {
  const head = frame(tgText("int.tg.newOrder", { orderId: o.id }, env.locale), env, o.test);
  return capText([[head, ...orderDetails(o, env)].join(" · ")], env);
}

/**
 * Two or more orders: the header (count, the window from the first to the last order, the total in the store
 * currency), then one line per order, ≤ 10; orders beyond 10 are counted ("et 3 autres commandes"). Orders in another
 * currency than the first are listed but not summed (a total never mixes currencies; it is left out).
 */
export function batchText(orders: readonly TgOrder[], env: TgEnv): string {
  const sorted = [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const currency = first.currency;
  const sameCurrency = sorted.every((o) => o.currency === currency);
  const head = [frame(tgText("int.tg.batch", { count: sorted.length, from: clock(first.createdAt, env.tz), to: clock(last.createdAt, env.tz) }, env.locale), env, sorted.every((o) => o.test))];
  if (sameCurrency) head.push(money(sorted.reduce((s, o) => s + o.totalCents, 0), currency, env.locale));
  const lines = sorted.slice(0, TG_BATCH_MAX).map((o) => [`${o.test && !sorted.every((x) => x.test) ? `${tgText("int.tg.test", undefined, env.locale)} ` : ""}${o.id}`, ...orderDetails(o, env)].join(" · "));
  return capText([head.join(" · "), ...lines], env, TG_TEXT_MAX, Math.max(0, sorted.length - TG_BATCH_MAX));
}

/** The message for the orders of one send: one order → its line, two or more → the batch. Null for none. */
export function orderMessage(orders: readonly TgOrder[], env: TgEnv): string | null {
  if (!orders.length) return null;
  return orders.length === 1 ? newOrderText(orders[0]!, env) : batchText(orders, env);
}

/* ------------------------------------------------------------------ */
/* Daily summary                                                       */
/* ------------------------------------------------------------------ */

/** A rate as P4 hands it (`Kpi`, src/lib/orders/profile.ts): never without its n; below the minimum, no value. */
export type TgKpi = { value: number; n: number; min: number } | { n: number; min: number; insufficient: true };

/** Cash a carrier holds (R2, OPE-§16.7; OD52). */
export interface CashHeld {
  carrier: string;
  amountCents: number;
  currency: string;
  days: number;
  parcels: number;
  /** "at_delivery": the cash was collected at the door; such accounts never get the line (OD52) */
  settlement: "statement" | "at_delivery";
}

/** The figures of one store-local day. A figure the platform could not read is absent, never 0 by default. */
export interface DailyFigures {
  /** YYYY-MM-DD in the store's time zone */
  day: string;
  placed?: number;
  confirmed?: number;
  /** the confirmation rate (OD17); shown only with a value and n ≥ min */
  confirmationRate?: TgKpi;
  delivered?: number;
  callbacksDue?: number;
  /** parcels whose last carrier attempt failed (OD48) */
  deliveryProblems?: number;
  sheets?: "ok" | "warn" | "failing";
  /** R2: carrier accounts over `cashHeldAlertDays` */
  cashHeld?: CashHeld[];
}

/** A rate's whole percent, only when it may be shown (a value, n ≥ min). `value` is a fraction (0..1). */
export function ratePercent(k: TgKpi | null | undefined): { rate: number; n: number } | null {
  if (!k || !("value" in k) || !Number.isFinite(k.value) || k.n < k.min || k.n <= 0) return null;
  return { rate: Math.round(Math.min(1, Math.max(0, k.value)) * 100), n: k.n };
}

const count = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** The cash-held line (R2): null for an account settled at delivery or without anything held (OD52). */
export function cashHeldLine(c: CashHeld, env: TgEnv): string | null {
  if (c.settlement !== "statement" || !(c.amountCents > 0) || !(c.parcels > 0)) return null;
  return tgText("int.tg.summary.cashHeld", { carrier: oneLine(c.carrier), amount: money(c.amountCents, c.currency, env.locale), days: c.days, parcels: c.parcels }, env.locale);
}

/** "4 colis en tentative de livraison échouée": only with at least one (OD48). */
export function deliveryProblemsLine(n: number | undefined, env: TgEnv): string | null {
  return count(n) && n >= 1 ? tgText("int.tg.summary.deliveryProblems", { count: n }, env.locale) : null;
}

/** "24 oct." of a store-local day (the day is a calendar date, formatted without a time zone shift). */
export function dayLabel(day: string, locale: TgLocale): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const tag = locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : "en-GB";
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC", numberingSystem: "latn" }).format(d);
}

/** The figures of a summary, each its own key, the missing ones left out. Empty: nothing honest to say. */
export function summaryFigures(f: DailyFigures, env: TgEnv): string[] {
  const out: string[] = [];
  const L = env.locale;
  if (count(f.placed)) out.push(tgText("int.tg.summary.placed", { count: f.placed }, L));
  if (count(f.confirmed)) {
    const r = ratePercent(f.confirmationRate);
    out.push(r ? tgText("int.tg.summary.confirmedRate", { count: f.confirmed, rate: r.rate, n: r.n }, L) : tgText("int.tg.summary.confirmed", { count: f.confirmed }, L));
  }
  if (count(f.delivered)) out.push(tgText("int.tg.summary.delivered", { count: f.delivered }, L));
  if (count(f.callbacksDue)) out.push(tgText("int.tg.summary.callbacks", { count: f.callbacksDue }, L));
  const problems = deliveryProblemsLine(f.deliveryProblems, env);
  if (problems) out.push(problems);
  if (f.sheets) out.push(tgText(`int.tg.summary.sheets.${f.sheets}`, undefined, L));
  return out;
}

/** The daily summary (OPE-§21.2); null when no figure could be read. Cash-held lines (R2) follow on their own lines. */
export function dailySummaryText(f: DailyFigures, env: TgEnv): string | null {
  const figures = summaryFigures(f, env);
  const cash = (f.cashHeld ?? []).map((c) => cashHeldLine(c, env)).filter((l): l is string => l !== null);
  if (!figures.length && !cash.length) return null;
  const head = frame(tgText("int.tg.summary.head", { date: dayLabel(f.day, env.locale) }, env.locale), env, false);
  return capText([[head, figures.join(" · ")].filter(Boolean).join(" "), ...cash], env);
}

/* ------------------------------------------------------------------ */
/* Integration problems and alerts                                     */
/* ------------------------------------------------------------------ */

/** An integration incident as a message carries it (codes and counts only). */
export type TgIncident =
  | { integration: "sheets"; minutes: number }
  | { integration: "capi"; platform: "meta" | "tiktok"; pixelLast4: string }
  | { integration: "dead" };

const PLATFORM_NAME = { meta: "Meta", tiktok: "TikTok" } as const;

export function incidentText(i: TgIncident, env: TgEnv): string {
  const text =
    i.integration === "sheets"
      ? tgText("int.tg.incident.sheets", { minutes: Math.max(0, Math.round(i.minutes)) }, env.locale)
      : i.integration === "capi"
        ? tgText("int.tg.incident.capi", { platform: PLATFORM_NAME[i.platform], pixel: oneLine(i.pixelLast4).slice(-4) }, env.locale)
        : tgText("int.tg.incident.dead", undefined, env.locale);
  return capText([frame(text, env, false)], env);
}

/** The profit alerts of `fin.alerts` (P4, OPE-§16.2) as Telegram sends them. Amounts in integer cents. */
export type ProfitAlert =
  | { code: "cpa_over_breakeven"; days: number; costCents: number; thresholdCents: number; currency: string }
  | { code: "refusal_spike"; rate7: number; rate28: number; n: number }
  | { code: "city_refusal"; city: string; rate: number; storeRate: number; n: number };

const pct = (v: number) => Math.round(Math.max(0, Math.min(100, v)));

export function profitAlertText(a: ProfitAlert, env: TgEnv): string {
  const L = env.locale;
  const text =
    a.code === "cpa_over_breakeven"
      ? tgText("int.tg.alert.cpa", { days: a.days, cost: money(a.costCents, a.currency, L), threshold: money(a.thresholdCents, a.currency, L) }, L)
      : a.code === "refusal_spike"
        ? tgText("int.tg.alert.refusals", { rate7: pct(a.rate7), rate28: pct(a.rate28), n: a.n }, L)
        : tgText("int.tg.alert.city", { city: oneLine(a.city), rate: pct(a.rate), storeRate: pct(a.storeRate), n: a.n }, L);
  return capText([frame(text, env, false)], env);
}

/** The setup's "Send test message" (OPE-§21.1). */
export function testMessageText(storeName: string, env: TgEnv): string {
  return capText([tgText("int.tg.testMessage", { store: oneLine(storeName) }, env.locale)], env);
}
