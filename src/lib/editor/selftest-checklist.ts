/**
 * The builder checklist in its store context (docs/STORE-SAAS.md §K.1 T4, LAN Q15; landing.md LAN-§3.2, LP-21 and
 * the store facts LP-02 reads). Pure, no database:
 *
 *   npx tsx src/lib/editor/selftest-checklist.ts
 *
 *  - an empty store context adds none of the store-fact items; fix links are the store's (`ctx.appHref`)
 *  - LP-21: a countdown restarted after the live one ended is the error `honesty:countdown_reset`; one moved later
 *    while still running is the note `urgency:extended`; > 30 days ahead `urgency:far`; a live stock figure
 *    untouched for > 14 days `urgency:stock-stale`
 *  - facts: prices, compare-at, savings, units, fee, stock, policy windows and the merchant's facts by class, with
 *    Arabic-Indic digits read as Latin
 *  - origin: generator text vs the owner's edits; no generation, no record
 *  - calling window: never saved, saved, every day closed, closed dates over the horizon, a dated override
 *  - stock history, builder tabs per page kind, the preview's per-type stylesheet
 */
import { getFixture } from "@/lib/page/fixtures";
import type { PageDoc } from "@/lib/page/schema";
import { previewCss } from "@/components/preview/frame";
import { checkContextOf, emptyCheckData, type CheckContextData } from "./check-context";
import { callingWindowFacts, factsOf, numeralsIn, originOf, stockChangedAtOf, type CallingWindowValue } from "./check-facts";
import { buildChecklist } from "./checklist";
import { tabsFor } from "./store";

let pass = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};

const NOW = Date.parse("2026-10-24T10:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const clone = (doc: PageDoc): PageDoc => JSON.parse(JSON.stringify(doc)) as PageDoc;
const health = { hasLegalName: true, hasPhone: true, hasEmail: true, hasAddress: true };

const base = getFixture("argan", { now: iso(NOW) }).doc;
const withUrgency = (u: PageDoc["offers"]["urgency"]) => {
  const d = clone(base);
  d.offers.urgency = u;
  return d;
};
const run = (doc: PageDoc, data: Partial<CheckContextData> = {}, healthOver: Partial<typeof health> = {}) =>
  buildChecklist(doc, checkContextOf({ ...emptyCheckData(), ...data }, { store: { ...health, ...healthOver }, now: NOW, appHref: (p) => `/app/shop${p}` }));
const ids = (doc: PageDoc, data?: Partial<CheckContextData>) => {
  const c = run(doc, data);
  return new Set([...c.errors, ...c.warnings].map((i) => i.id));
};
const LP21 = ["honesty:countdown_reset", "urgency:extended", "urgency:far", "urgency:stock-stale"];

/* ---------------- context form ---------------- */
{
  const plain = ids(withUrgency({}));
  ok("empty context: no LP-21 item", LP21.every((id) => !plain.has(id)), [...plain]);
  const c = run(withUrgency({}), {}, { hasPhone: false, hasEmail: false });
  const contact = c.warnings.find((i) => i.id === "store:contact");
  ok("fix links: under the store's dashboard (ctx.appHref)", contact?.fix?.href === "/app/shop/settings/general", contact);
}

/* ---------------- LP-21 ---------------- */
{
  const ended = { countdownEnd: iso(NOW - 2 * DAY) };
  const restarted = withUrgency({ countdownEnd: iso(NOW + 3 * DAY) });
  const reset = run(restarted, { published: ended });
  ok("countdown_reset: an ended live countdown restarted is an error", reset.errors.some((i) => i.id === "honesty:countdown_reset" && i.fix?.tab === "offers"), reset.errors);
  ok("countdown_reset: not when the draft keeps the ended date", !ids(withUrgency(ended), { published: ended }).has("honesty:countdown_reset"));
  ok("countdown_reset: not on a page never published", !ids(restarted, { published: null }).has("honesty:countdown_reset"));

  const running = { countdownEnd: iso(NOW + DAY) };
  const ext = run(restarted, { published: running });
  ok("urgency:extended: a running countdown moved later is a note", ext.warnings.some((i) => i.id === "urgency:extended") && !ext.errors.some((i) => i.id === "honesty:countdown_reset"));
  ok("urgency:extended: not when moved earlier", !ids(withUrgency({ countdownEnd: iso(NOW + DAY / 2) }), { published: running }).has("urgency:extended"));

  ok("urgency:far: 31 days ahead", ids(withUrgency({ countdownEnd: iso(NOW + 31 * DAY) })).has("urgency:far"));
  ok("urgency:far: not at 29 days", !ids(withUrgency({ countdownEnd: iso(NOW + 29 * DAY) })).has("urgency:far"));

  const stale = { stockLeft: 7, stockChangedAt: iso(NOW - 20 * DAY) };
  ok("urgency:stock-stale: live 7 for 20 days, draft 7", ids(withUrgency({ stockLeft: 7 }), { published: stale }).has("urgency:stock-stale"));
  ok("urgency:stock-stale: not when the draft updates it", !ids(withUrgency({ stockLeft: 6 }), { published: stale }).has("urgency:stock-stale"));
  ok("urgency:stock-stale: not after 10 days", !ids(withUrgency({ stockLeft: 7 }), { published: { stockLeft: 7, stockChangedAt: iso(NOW - 10 * DAY) } }).has("urgency:stock-stale"));
}

/* ---------------- facts (LP-02 inputs) ---------------- */
{
  const d = clone(base);
  d.items[0]!.price = 249;
  d.items[0]!.compareAt = 299;
  d.offers.shippingFee = 25;
  d.offers.urgency = { stockLeft: 12 };
  const f = factsOf(d, { merchant: ["٣ ألوان", "100 % coton", "50 ml"], returnDays: 7, warrantyMonths: 12, deliveryDays: [1, 3], withinHours: 24 });
  const has = (cls: keyof typeof f.byClass, n: string) => !!f.byClass[cls]?.includes(n);
  ok("facts: price and compare-at", has("price", "249") && has("compare_at", "299"), f.byClass);
  ok("facts: savings in money and whole percent", has("savings", "50") && has("savings", "17"), f.byClass.savings);
  ok("facts: fee and stock", has("fee", "25") && has("stock", "12"));
  ok("facts: Arabic-Indic digits of a merchant fact", has("fact", "3") && has("fact", "100") && has("fact", "50"), f.byClass.fact);
  ok("facts: policy windows and the call promise", has("return_days", "7") && has("warranty_months", "12") && has("delivery_days", "3") && has("within_hours", "24"));
  ok("facts: units per offer", (f.byClass.units ?? []).length > 0, f.byClass.units);
  ok("facts: `allowed` is the union", ["249", "299", "25", "12", "3", "7"].every((n) => f.allowed.includes(n)));
  ok("numerals: comma decimals and leading zeros", JSON.stringify(numeralsIn("2,5 kg · 050 ml · ٢٤ س")) === JSON.stringify(["2.5", "50", "24"]), numeralsIn("2,5 kg · 050 ml · ٢٤ س"));
}

/* ---------------- origin ---------------- */
{
  const generated = clone(base);
  const edited = clone(base);
  const hero = edited.sections.find((s) => typeof (s.data as Record<string, unknown>).title === "string");
  if (hero) (hero.data as Record<string, unknown>).title = "Mon huile, pressée à froid";
  const origin = originOf(generated, edited);
  ok("origin: an edited field is the owner's", !!hero && origin[`${hero.id}.title`] === "owner", hero ? origin[`${hero.id}.title`] : "no titled section");
  ok("origin: untouched generator text is generated", Object.values(origin).filter((o) => o === "generated").length > 3);
  ok("origin: the product name is tracked", origin["product.name"] === "generated");
  ok("origin: no generation version, no record", Object.keys(originOf(null, edited)).length === 0);
}

/* ---------------- calling window ---------------- */
{
  const work = [{ from: "09:30", to: "13:00" }];
  const week = (r: typeof work) => ({ 1: r, 2: r, 3: r, 4: r, 5: r, 6: r, 7: r });
  const w = (over: Partial<CallingWindowValue>): CallingWindowValue => ({ days: week(work), closedDates: [], savedAt: "2026-10-01T09:00:00.000Z", ...over });
  const tz = "Africa/Casablanca";
  const never = callingWindowFacts(w({ savedAt: null }), [], NOW, tz);
  ok("window: never saved → no promise, not saved", !never.callable && !never.saved, never);
  ok("window: saved with hours → callable", callingWindowFacts(w({}), [], NOW, tz).callable);
  ok("window: every day closed → not callable", !callingWindowFacts(w({ days: week([]) }), [], NOW, tz).callable);
  const closedAll = Array.from({ length: 15 }, (_, i) => iso(NOW + i * DAY).slice(0, 10));
  ok("window: closed dates over the 14 days → not callable", !callingWindowFacts(w({ closedDates: closedAll }), [], NOW, tz).callable);
  const ramadan = [{ from: "2026-10-01", to: "2026-11-30", days: week([]) }];
  ok("window: an override with no hours covers the horizon → not callable", !callingWindowFacts(w({}), ramadan, NOW, tz).callable);
  const late = [{ from: "2026-10-01", to: "2026-11-30", days: week([{ from: "20:00", to: "23:30" }]) }];
  ok("window: an override with evening hours → callable", callingWindowFacts(w({ days: week([]) }), late, NOW, tz).callable);
}

/* ---------------- stock history, tabs, preview css ---------------- */
{
  const at = (d: number) => new Date(NOW - d * DAY);
  const since = stockChangedAtOf([
    { at: at(1), stockLeft: 5 },
    { at: at(9), stockLeft: 5 },
    { at: at(20), stockLeft: 8 },
  ]);
  ok("stock history: the oldest publish of the live run", since === at(9).toISOString(), since);
  ok("stock history: no live stock → none", stockChangedAtOf([{ at: at(1), stockLeft: undefined }]) === undefined);

  ok("tabs: a landing page has every panel", tabsFor("landing").length === 6 && tabsFor("landing").includes("offers"));
  ok("tabs: a store page has no product, offers or form panel", ["product", "offers", "form"].every((t) => !tabsFor("home").includes(t as never)));

  // the fixture uses every section type: a five-section page against the whole set
  const allTypes = [...new Set(base.sections.map((s) => s.type))];
  const types = allTypes.slice(0, 5);
  const all = previewCss(allTypes);
  const css = previewCss(types);
  ok("preview css: only the document's section types", css.length < all.length && css.length > 0, { css: css.length, all: all.length });
  ok("preview css: stable for the same types in any order", previewCss([...types].reverse()) === css);
}

console.log(`editor checklist selftest: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
if (failures.length) process.exit(1);
