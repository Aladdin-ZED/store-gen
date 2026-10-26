/**
 * The pure halves of the checklist's store facts (docs/STORE-SAAS.md §K.1 T4, LAN Q15; landing.md LAN-§3.2,
 * LAN-§6.4): which numerals a page may show and of which class, who wrote each text field, and whether the calling
 * window still has hours a shopper can be promised. The server preload (./check-context.server.ts) feeds them the
 * store's rows; fixtures call them directly. Pure and isomorphic.
 *
 * R1.0 homes: P3's `allowedNumbersFor(doc, store)` (LAN-§6.4), the maintainer's `originFrom(prev, doc)` (§M.1 rule 2)
 * and P4's `noShopperHours(w, now)` (LAN-§2.3) replace these at R1; until then the builder and the publish dialog
 * read these, with the same item ids, so nothing moves for the owner when they land.
 */
import { offerUnits } from "@/lib/page/catalog";
import type { PageDoc } from "@/lib/page/schema";
import type { CheckContextData, NumberClass } from "./check-context";

/* ------------------------------------------------------------------ */
/* numerals                                                            */
/* ------------------------------------------------------------------ */

/** Arabic-Indic and Persian digits as ASCII, so "٣ ألوان" and "3 couleurs" are one fact. */
export const asciiDigits = (s: string): string =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** The numerals of a text, normalised ("1 000" stays two numerals; "2,5" → "2.5"; "050" → "50"). */
export function numeralsIn(text: string): string[] {
  const found = asciiDigits(text).match(/\d+(?:[.,]\d+)?/g) ?? [];
  return found.map((n) => String(Number(n.replace(",", "."))));
}

/** What the store says about itself that a page may repeat (the `policies` and `store.confirmation` settings). */
export interface StoreNumberFacts {
  /** the wizard's merchant facts and every attested value (`factsFor`), as typed */
  merchant: readonly string[];
  returnDays?: number | null;
  exchangeDays?: number | null;
  refundDays?: number | null;
  warrantyMonths?: number | null;
  deliveryDays?: readonly [number, number] | null;
  freeFrom?: number | null;
  withinHours?: number | null;
}

const money = (n: number) => String(Math.round(n * 100) / 100);

/**
 * The numerals the page may show, by class (the R1.0 `allowedNumbersFor`): the merchant's facts and the product
 * name (`fact`), the prices and compare-at prices of items, offers, the order bump and the upsell, the savings they
 * imply (absolute and whole percent), units per offer, the delivery fee, stock, and the store's policy windows.
 */
export function factsOf(doc: PageDoc, store: StoreNumberFacts): CheckContextData["facts"] {
  const byClass: Partial<Record<NumberClass, Set<string>>> = {};
  const add = (cls: NumberClass, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return;
    const set = (byClass[cls] ??= new Set());
    for (const n of typeof value === "number" ? [money(value)] : numeralsIn(value)) set.add(n);
  };
  const pair = (price: number, compareAt: number | undefined) => {
    add("price", price);
    if (compareAt === undefined || !(compareAt > price)) return;
    add("compare_at", compareAt);
    add("savings", compareAt - price);
    add("savings", Math.round(((compareAt - price) / compareAt) * 100));
  };

  for (const f of store.merchant) add("fact", f);
  add("fact", doc.product.name);
  for (const it of doc.items) pair(it.price, it.compareAt);
  for (const b of doc.offers.bundles) {
    pair(b.price, b.compareAt);
    add("units", offerUnits(b));
  }
  const bump = doc.offers.orderBump;
  if (bump?.enabled) add("price", bump.price);
  const upsell = doc.offers.upsell;
  if (upsell?.enabled) pair(upsell.price, upsell.compareAt);
  if (doc.offers.shippingFee > 0) add("fee", doc.offers.shippingFee);
  add("stock", doc.offers.urgency.stockLeft);

  add("return_days", store.returnDays);
  add("return_days", store.exchangeDays);
  add("return_days", store.refundDays);
  add("warranty_months", store.warrantyMonths);
  if (store.deliveryDays) for (const d of store.deliveryDays) add("delivery_days", d);
  add("price", store.freeFrom);
  add("within_hours", store.withinHours);

  const out: Partial<Record<NumberClass, string[]>> = {};
  const all = new Set<string>();
  for (const [cls, set] of Object.entries(byClass) as [NumberClass, Set<string>][]) {
    out[cls] = [...set].sort();
    for (const n of set) all.add(n);
  }
  return { allowed: [...all].sort(), byClass: out };
}

/* ------------------------------------------------------------------ */
/* origin                                                              */
/* ------------------------------------------------------------------ */

/** Every non-empty string leaf of a value with its dot path ("items.0.text"). */
function stringLeaves(value: unknown, prefix: string, out: Map<string, string>, depth = 0): void {
  if (depth > 8) return;
  if (typeof value === "string") {
    if (value.trim()) out.set(prefix, value);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => stringLeaves(v, prefix ? `${prefix}.${i}` : String(i), out, depth + 1));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) stringLeaves(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  }
}

/** The text fields of a document: `<sectionId>.<path>` for section data, `product.<path>` for the product story. */
function textFields(doc: PageDoc): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of doc.sections) stringLeaves(s.data, s.id, out);
  stringLeaves({ name: doc.product.name, tagline: doc.product.tagline, description: doc.product.description }, "product", out);
  return out;
}

/**
 * Who wrote each text field (LAN-§3.2 `origin`): a field whose text still equals the generator's (the page's newest
 * `generation` version) is `generated`, any other text is the owner's. A page that never came from the generator
 * has no record: the map is empty and the gate's own default applies.
 */
export function originOf(generated: PageDoc | null, doc: PageDoc): Record<string, "generated" | "owner"> {
  if (!generated) return {};
  const before = textFields(generated);
  const out: Record<string, "generated" | "owner"> = {};
  for (const [path, text] of textFields(doc)) out[path] = before.get(path) === text ? "generated" : "owner";
  return out;
}

/* ------------------------------------------------------------------ */
/* calling window                                                      */
/* ------------------------------------------------------------------ */

type DayRanges = readonly { from: string; to: string }[];
/** The `ops.callingWindow` setting (weekdays "1" … "7", 1 = Monday) and its dated overrides. */
export interface CallingWindowValue {
  days: Readonly<Record<string, DayRanges>>;
  closedDates: readonly string[];
  savedAt: string | null;
}
export interface WindowOverride {
  from: string;
  to: string;
  days: Readonly<Record<string, DayRanges>>;
}

/** How far ahead a shopper may be promised a call (LAN-§2.3: the next 14 days). */
export const WINDOW_HORIZON_DAYS = 14;

const hasRange = (ranges: DayRanges | undefined) => !!ranges?.some((r) => r.from < r.to);

/** The store-local date ("2026-10-24") and ISO weekday (1 = Monday) of an instant. */
function localDay(at: Date, timeZone: string): { date: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday };
}

/**
 * The checklist's two calling-window facts (rev 5, CRIT2-1): `saved` = the owner confirmed the hours once
 * (`shopperPromiseAllowed`); `callable` = a shopper may be promised a call (`!noShopperHours`): the hours are saved
 * and some day of the next 14 store days has a range and is not a closed date (`!windowIsEmpty`), a dated override
 * taking the place of the week on its days.
 */
export function callingWindowFacts(
  window: CallingWindowValue,
  overrides: readonly WindowOverride[],
  now: number,
  timeZone: string,
): { callable: boolean; saved: boolean } {
  const closed = new Set(window.closedDates);
  let callable = false;
  for (let i = 0; i < WINDOW_HORIZON_DAYS && !callable; i++) {
    const { date, weekday } = localDay(new Date(now + i * 86_400_000), timeZone);
    if (closed.has(date) || weekday < 1) continue;
    const override = overrides.find((o) => o.from <= date && date <= o.to);
    callable = hasRange((override ?? window).days[String(weekday)]);
  }
  const saved = window.savedAt !== null;
  return { callable: callable && saved, saved };
}

/* ------------------------------------------------------------------ */
/* stock history                                                       */
/* ------------------------------------------------------------------ */

/**
 * When the live stock figure was last changed, from the page's publish versions newest first (`stockLeft` of each,
 * undefined when unset): the publish time of the oldest version of the newest unbroken run with the live value.
 */
export function stockChangedAtOf(history: readonly { at: Date; stockLeft: number | undefined }[]): string | undefined {
  const live = history[0];
  if (!live || live.stockLeft === undefined) return undefined;
  let since = live.at;
  for (const v of history.slice(1)) {
    if (v.stockLeft !== live.stockLeft) break;
    since = v.at;
  }
  return since.toISOString();
}
