// proves: SF-04, AC-03, AC-05
/**
 * `test:profit` (P4 CALL CENTER; operations.md OPE-§16.2, §O.1, §O.4 SF-04 / AC-03 / AC-05): Profit lite's pure math,
 * offline (no database, no network, no clock: the alerts run on a fake clock).
 *   npm run test:profit
 *
 *   goldens      E_placed, BE_CPA (placed and delivered) and the Wilson 95 % interval on a fixed cohort
 *   minimum n    no rate below n = 30 (confirmations and finals): the answer lists what to add, no number
 *   zero costs   nothing typed → every prompt, no figure anywhere in the answer
 *   cents        toCents parity with src/lib/page/pricing.ts for totals and fees (every 2-decimal amount sampled)
 *   ad rates     spendStoreCents with dated rates (latest ≤ the day), a day without a rate excluded and counted,
 *                never converted 1:1
 *   costs        the lookup order variant → item@page → sku → product, history (newest dated ≤ the instant wins)
 *   cod fee      the COD fee base max(min, round(collected × bp / 10000)) + flat on golden carriers
 *   fees         fee charged (median shipping) vs fee paid (the rate row), the fin:fee_gap selection
 *   alerts       cpa_over_breakeven / refusal_spike / city_refusal thresholds; fires once, kept, clears after 2 days
 *                (hysteresis); the city evidence carries the reason mix only when reasons are coded
 *   by angle     the by-angle table drops cells under 5 orders and counts them
 */
import Module from "node:module";
import { convertSpend, rateFor, spendStoreCents, type AdRate } from "@/lib/finance/lite/ad-rates";
import { alertConditions, alertVars, stepAlerts, type AlertFacts, type OpenAlert } from "@/lib/finance/lite/alerts";
import { breakEven, codFeeCents, cpaPlacedCents, feeGaps, feeLines, medianCents, rateForCity, wilson, type BreakEvenInput, type CarrierRateRow } from "@/lib/finance/lite/breakeven";
import { toCents } from "@/lib/finance/lite/cents";
import { buildCostIndex, costUnitsOf, unitCost, unitsCogsCents, type CostRow } from "@/lib/finance/lite/cost-lookup";
import { toCents as pricingToCents } from "@/lib/page/pricing";

let pass = 0;
const failures: string[] = [];
let section = "";
const ok = (label: string, cond: boolean, info?: unknown) => {
  if (cond) pass++;
  else failures.push(`[${section}] ${label}${info === undefined ? "" : `\n    ${JSON.stringify(info)}`}`);
};
const eq = (label: string, got: unknown, want: unknown) => ok(label, JSON.stringify(got) === JSON.stringify(want), { got, want });
const near = (a: number, b: number, eps = 5e-5) => Math.abs(a - b) <= eps;
const t0 = Date.now();

/* ---------------- a fixed cohort ---------------- */
const rate = (cityKey: string, p: Partial<CarrierRateRow> = {}): CarrierRateRow => ({ cityKey, deliveryFeeCents: 3_500, returnFeeCents: 2_000, codFeeBp: 0, codFeeMinCents: null, codFeeFlatCents: 0, active: true, ...p });
const golden = (): BreakEvenInput => ({
  counts: { placed: 120, confirmed: 80, cancelled: 15, unreachable: 5, delivered: 60, refused: 14, returned: 4, lost: 2 },
  delivered: Array.from({ length: 60 }, () => ({ totalCents: 30_000, cogsCents: 8_000, cityKey: "casablanca" })),
  failed: Array.from({ length: 20 }, () => ({ cityKey: "casablanca" })),
  packagingCents: 500,
  rates: [rate("*")],
});

section = "goldens";
{
  const w = wilson(80, 100);
  ok("Wilson 80 / 100 = [0.7112, 0.8666]", near(w.low, 0.7111708) && near(w.high, 0.8666331), w);
  const wd = wilson(60, 80);
  ok("Wilson 60 / 80 = [0.6452, 0.8319]", near(wd.low, 0.6451533) && near(wd.high, 0.8319377), wd);
  eq("Wilson with n = 0 is the whole range", wilson(0, 0), { low: 0, high: 1 });
  const be = breakEven(golden());
  ok("the golden cohort computes", be.ok, be);
  if (be.ok) {
    eq("c and d with their n", [be.c.value, be.c.n, be.d.value, be.d.n], [0.8, 100, 0.75, 80]);
    eq("margin_delivered = 30000 − 8000 − 500 − 3500 − 0", be.marginDeliveredCents, 18_000);
    eq("loss_failed = 3500 + 2000 + 500", be.lossFailedCents, 6_000);
    eq("E_placed = 0.8 × 0.75 × 18000 − 0.8 × 0.25 × 6000", be.ePlacedCents, 9_600);
    eq("BE_CPA_placed = E_placed", be.beCpaPlacedCents, 9_600);
    eq("BE_CPA_delivered = E_placed / (c × d)", be.beCpaDeliveredCents, 16_000);
    eq("the interval: E at (c_low, d_low) and (c_high, d_high)", be.interval, { lowCents: 6_745, highCents: 12_104 });
    ok("the Wilson bounds travel with c and d", near(be.c.low, 0.7111708) && near(be.d.high, 0.8319377), [be.c, be.d]);
  }
  // per-city fees: a Fès delivery priced by its own row, the rest by '*'
  const g = golden();
  g.delivered = [...g.delivered.slice(0, 59), { totalCents: 30_000, cogsCents: 8_000, cityKey: "fes" }];
  g.rates = [rate("*"), rate("fes", { deliveryFeeCents: 4_100 })];
  const be2 = breakEven(g);
  ok("a city's own row prices its orders (margin averages per order)", be2.ok && be2.marginDeliveredCents === Math.round((59 * 18_000 + 17_400) / 60), be2);
  eq("an inactive city row falls back to '*'", rateForCity([rate("*"), rate("fes", { active: false, deliveryFeeCents: 9_999 })], "fes")?.deliveryFeeCents, 3_500);
  eq("CPA_placed = spend / placed", cpaPlacedCents(420_000, 120), 3_500);
  eq("no spend typed → no CPA", cpaPlacedCents(null, 120), null);
}

section = "minimum n";
{
  const g = golden();
  g.counts = { ...g.counts, confirmed: 20, cancelled: 6, unreachable: 3 };
  const be = breakEven(g);
  ok("29 decisions → no number, confirm_n listed", !be.ok && be.missing.includes("confirm_n") && be.nC === 29 && !("ePlacedCents" in be), be);
  const g2 = golden();
  g2.counts = { ...g2.counts, delivered: 20, refused: 6, returned: 2, lost: 1 };
  const be2 = breakEven(g2);
  ok("29 finals → no number, delivery_n listed", !be2.ok && be2.missing.includes("delivery_n") && be2.nD === 29, be2);
  const g3 = golden();
  g3.counts = { ...g3.counts, confirmed: 21, cancelled: 6, unreachable: 3, delivered: 21, refused: 6, returned: 2, lost: 1 };
  ok("exactly 30 and 30 → a number", breakEven(g3).ok);
}

section = "zero costs";
{
  const be = breakEven({ ...golden(), delivered: golden().delivered.map((o) => ({ ...o, cogsCents: null })), packagingCents: null, rates: [] });
  ok("nothing typed → not ok", !be.ok);
  if (!be.ok) {
    eq("every prompt, in order", be.missing, ["item_costs", "packaging", "delivery_fee", "return_fee"]);
    eq("the uncosted orders are counted", be.uncosted, 60);
    ok("no figure in the answer", !/Cents|value/.test(JSON.stringify(be)), be);
  }
  const typedFeeNoReturn = breakEven({ ...golden(), rates: [rate("*", { returnFeeCents: null })] });
  ok("a delivery fee without a return fee asks for the return fee only", !typedFeeNoReturn.ok && JSON.stringify(typedFeeNoReturn.missing) === '["return_fee"]', typedFeeNoReturn);
  const oneUncosted = golden();
  oneUncosted.delivered = [...oneUncosted.delivered.slice(1), { totalCents: 30_000, cogsCents: null, cityKey: null }];
  ok("one delivered order without a cost withholds the number", !breakEven(oneUncosted).ok);
}

section = "cents";
{
  let mismatches = 0;
  const bad: string[] = [];
  for (let c = 0; c <= 200_000; c += 7) {
    const amount = c / 100;
    const text = amount.toFixed(2);
    if (toCents(amount) !== pricingToCents(amount) || toCents(text) !== pricingToCents(amount)) {
      mismatches++;
      if (bad.length < 5) bad.push(text);
    }
  }
  eq("toCents(number | 'x.yy') equals pricing.ts toCents for every sampled 2-decimal amount", mismatches, 0);
  eq("decimal(12,2) strings as mysql2 hands them", [toCents("249.90"), toCents("0.29"), toCents("1000000.01"), toCents("-12.50")], [24_990, 29, 100_000_001, -1_250]);
  eq("half-up on the third decimal (away from zero)", [toCents("0.005"), toCents("0.004"), toCents("-0.005"), toCents(1.005)], [1, 0, -1, 101]);
  eq("malformed → 0", [toCents(""), toCents("abc"), toCents(Number.NaN)], [0, 0, 0]);
  void bad;
}

section = "ad rates";
{
  const rates: AdRate[] = [
    { currency: "USD", fromDay: "2026-10-01", rateMilli: 9_850 },
    { currency: "USD", fromDay: "2026-10-15", rateMilli: 10_020 },
    { currency: "EUR", fromDay: "2026-10-10", rateMilli: 10_900 },
  ];
  eq("the latest rate dated ≤ the day", [rateFor("USD", "2026-10-14", rates)?.rateMilli, rateFor("usd", "2026-10-15", rates)?.rateMilli, rateFor("USD", "2026-09-30", rates)], [9_850, 10_020, null]);
  eq("round(spend × rateMilli / 1000)", spendStoreCents(10_000, "USD", "2026-10-03", rates, "MAD"), 98_500);
  eq("half away from zero", spendStoreCents(1, "USD", "2026-10-20", rates, "MAD"), 10);
  eq("the store currency needs no rate", spendStoreCents(12_345, "MAD", "2026-01-01", [], "MAD"), 12_345);
  eq("a day without a rate is never converted 1:1", spendStoreCents(5_000, "EUR", "2026-10-09", rates, "MAD"), null);
  const conv = convertSpend(
    [
      { day: "2026-10-08", platform: "meta", spendCents: 5_000, currency: "EUR" },
      { day: "2026-10-09", platform: "meta", spendCents: 5_000, currency: "EUR" },
      { day: "2026-10-09", platform: "tiktok", spendCents: 2_000, currency: "EUR" },
      { day: "2026-10-12", platform: "meta", spendCents: 10_000, currency: "USD" },
      { day: "2026-10-12", platform: "other", spendCents: 30_000, currency: "MAD" },
      { day: "2026-10-16", platform: "meta", spendCents: 10_000, currency: "USD" },
    ],
    rates,
    "MAD",
  );
  eq("missing_rates: the rows without a rate excluded and counted, their days listed", [conv.missingRates, conv.missingDays, conv.rows], [3, ["2026-10-08", "2026-10-09"], 3]);
  eq("the converted Σ", conv.cents, 98_500 + 30_000 + 100_200);
  eq("the rate printed under the card is the latest applied", conv.ratesUsed, [{ currency: "USD", fromDay: "2026-10-15", rateMilli: 10_020 }]);
}

section = "costs";
{
  const at = new Date("2026-10-20T12:00:00Z");
  const d = (iso: string) => new Date(iso);
  const row = (p: Partial<CostRow>): CostRow => ({ pageId: null, itemId: null, sku: null, productId: null, variantKey: "", costCents: 0, effectiveFrom: d("2026-10-01T00:00:00Z"), ...p });
  const P = "01PAGE000000000000000000AA";
  const rows: CostRow[] = [
    row({ productId: "01PROD000000000000000000AA", costCents: 1_000 }),
    row({ sku: "ARG-250", costCents: 3_800 }),
    row({ pageId: P, itemId: "main", costCents: 4_000 }),
    row({ pageId: P, itemId: "main", costCents: 4_200, effectiveFrom: d("2026-10-10T00:00:00Z") }),
    row({ pageId: P, itemId: "main", costCents: 9_999, effectiveFrom: d("2026-11-01T00:00:00Z") }),
    row({ pageId: P, itemId: "main", variantKey: "XL|NR", costCents: 5_100 }),
  ];
  const ix = buildCostIndex(rows, at);
  eq("variant first (option codes joined by '|')", unitCost(ix, P, { item: "main", codes: ["XL", "NR"] }), { cents: 5_100, source: "variant" });
  eq("then the item@page, newest row dated ≤ the instant", unitCost(ix, P, { item: "main", codes: ["S", "NR"] }), { cents: 4_200, source: "item" });
  eq("then the SKU (an item covered by its SKU)", unitCost(ix, P, { item: "duo", sku: "arg-250", codes: [] }), { cents: 3_800, source: "sku" });
  eq("then the product default", unitCost(ix, P, { item: "duo", codes: [] }, "01PROD000000000000000000AA"), { cents: 1_000, source: "product" });
  eq("nothing covers it → null (never guessed)", unitCost(ix, P, { item: "duo", codes: [] }), null);
  eq("a choice without a code skips the variant tier", unitCost(ix, P, { item: "main", codes: ["XL", undefined] }), { cents: 4_200, source: "item" });
  const units = costUnitsOf({ units: [{ item: "main", options: [{ code: "XL" }, { code: "NR" }] }, { item: "duo", sku: "ARG-250", options: [] }], bump: { unit: { item: "main", options: [] } } });
  eq("an order's COGS sums its units, the bump's included", unitsCogsCents(ix, P, units), 5_100 + 3_800 + 4_200);
  eq("one uncovered unit → null", unitsCogsCents(ix, P, [...units, { item: "gift", codes: [] }]), null);
  eq("a v1 row is the page's main item per unit", costUnitsOf({ qty: 2, variants: [{}, {}] }).map((u) => u.item), ["main", "main"]);
  eq("a later row never changes an earlier instant", unitCost(buildCostIndex(rows, d("2026-10-05T00:00:00Z")), P, { item: "main", codes: [] })?.cents, 4_000);
}

section = "cod fee";
{
  eq("1.5 % with a 5.00 minimum on 249.90 → the minimum", codFeeCents(24_990, { codFeeBp: 150, codFeeMinCents: 500, codFeeFlatCents: 0 }), 500);
  eq("1.5 % with a 5.00 minimum on 499.90 → round(749.85)", codFeeCents(49_990, { codFeeBp: 150, codFeeMinCents: 500, codFeeFlatCents: 0 }), 750);
  eq("2 % + 10.00 flat on 500.00", codFeeCents(50_000, { codFeeBp: 200, codFeeMinCents: null, codFeeFlatCents: 1_000 }), 2_000);
  eq("a flat-fee carrier", codFeeCents(80_000, { codFeeBp: 0, codFeeMinCents: null, codFeeFlatCents: 1_500 }), 1_500);
  eq("nothing set → 0", codFeeCents(80_000, { codFeeBp: 0, codFeeMinCents: null, codFeeFlatCents: 0 }), 0);
  const g = golden();
  g.rates = [rate("*", { codFeeBp: 100, codFeeMinCents: 200 })];
  const be = breakEven(g);
  eq("the COD fee enters margin_delivered (1 % of 300.00 = 3.00)", be.ok && be.marginDeliveredCents, 18_000 - 300);
}

section = "fees";
{
  eq("median of cents (lower middle on an even count)", [medianCents([3_000, 2_500, 4_000]), medianCents([3_000, 2_500, 4_000, 3_500]), medianCents([])], [3_000, 3_000, null]);
  const byCity = new Map<string, number[]>([
    ["casablanca", Array(40).fill(3_000)],
    ["fes", Array(12).fill(3_000)],
    ["tanger", Array(9).fill(1_000)],
    ["*", Array(30).fill(0)],
  ]);
  const lines = feeLines(byCity, [rate("*", { deliveryFeeCents: 3_500 }), rate("fes", { deliveryFeeCents: 4_500 })]);
  eq("fee charged vs fee paid per city, largest n first", lines.map((l) => [l.cityKey, l.n, l.chargedCents, l.paidCents, l.gapCents]), [
    ["casablanca", 40, 3_000, 3_500, 500],
    ["*", 30, 0, 3_500, 3_500],
    ["fes", 12, 3_000, 4_500, 1_500],
    ["tanger", 9, 1_000, 3_500, 2_500],
  ]);
  eq("fin:fee_gap: top-5 cities, n ≥ 10, gap ≥ 10 units", feeGaps(lines).map((l) => l.cityKey), ["fes"]);
  eq("no rate typed → no gap", feeLines(new Map([["fes", [3_000]]]), [])[0]?.gapCents, null);
}

section = "alerts";
{
  const quiet: AlertFacts = {
    beCpaPlacedCents: 4_200,
    lastDays: [
      { day: "2026-10-18", placed: 12, spendCents: 40_000 },
      { day: "2026-10-19", placed: 10, spendCents: 35_000 },
    ],
    store7: { delivered: 40, refused: 8, returned: 2, lost: 0 },
    store28: { delivered: 160, refused: 30, returned: 8, lost: 2 },
    cities28: [{ cityKey: "fes", tally: { delivered: 30, refused: 5, returned: 1, lost: 0 }, reasons: [] }],
  };
  eq("a quiet store raises nothing", alertConditions(quiet), []);
  const cpa: AlertFacts = { ...quiet, lastDays: [{ day: "2026-10-18", placed: 12, spendCents: 60_000 }, { day: "2026-10-19", placed: 10, spendCents: 50_000 }] };
  eq("CPA > 1.1 × BE on 2 days with ≥ 20 placed", alertConditions(cpa).map((c) => [c.kind, c.evidence]), [["cpa_over_breakeven", { cpaCents: 5_000, beCpaCents: 4_200, n: 22 }]]);
  eq("one day under 1.1 × BE → nothing", alertConditions({ ...cpa, lastDays: [{ day: "2026-10-18", placed: 12, spendCents: 55_000 }, cpa.lastDays[1]!] }).length, 0);
  eq("19 placed in the two days → nothing", alertConditions({ ...cpa, lastDays: [{ day: "2026-10-18", placed: 9, spendCents: 60_000 }, cpa.lastDays[1]!] }).length, 0);
  eq("no break-even → no CPA alert", alertConditions({ ...cpa, beCpaPlacedCents: null }).length, 0);
  const spike: AlertFacts = { ...quiet, store7: { delivered: 12, refused: 8, returned: 0, lost: 0 } };
  eq("refusal 7 d (40 %) > 28 d (15 %) + 10 points with 20 finals", alertConditions(spike).map((c) => [c.kind, c.evidence.rate7Bp, c.evidence.rate28Bp, c.evidence.n]), [["refusal_spike", 4_000, 1_500, 20]]);
  eq("19 finals in 7 days → nothing", alertConditions({ ...quiet, store7: { delivered: 11, refused: 8, returned: 0, lost: 0 } }).length, 0);
  const city: AlertFacts = {
    ...quiet,
    cities28: [{ cityKey: "tanger", tally: { delivered: 9, refused: 11, returned: 0, lost: 0 }, reasons: [{ reason: "absent", count: 8 }, { reason: "price", count: 2 }, { reason: null, count: 1 }] }],
  };
  const [cityAlert] = alertConditions(city);
  eq("a city's refusal rate > the store's + 15 points (n ≥ 20)", [cityAlert?.kind, cityAlert?.key, cityAlert?.evidence.rateBp, cityAlert?.evidence.n], ["city_refusal", "tanger", 5_500, 20]);
  eq("the evidence carries the coded reasons (8 of 11: absent)", [cityAlert?.evidence.reason_absent, cityAlert?.evidence.reason_price, cityAlert?.evidence.failed], [8, 2, 11]);
  const [uncoded] = alertConditions({ ...city, cities28: [{ ...city.cities28[0]!, reasons: [{ reason: null, count: 11 }] }] });
  eq("no coded reason → no reason in the evidence", Object.keys(uncoded?.evidence ?? {}).filter((k) => k.startsWith("reason_") || k === "failed"), []);
  eq("the notification's numbers (ids, counts, codes only)", alertVars(cityAlert!), { alertKind: "city_refusal", key: "tanger", n: 20, value: 55, threshold: 15 });

  // hysteresis on a fake clock: fires once, kept while it holds, clears after 2 days without it, fires again later
  const day = (n: number) => new Date(Date.UTC(2026, 9, 20 + n, 3, 0, 0));
  let open: OpenAlert[] = [];
  let notifications = 0;
  const run = (facts: AlertFacts, n: number) => {
    const s = stepAlerts(open, alertConditions(facts), day(n));
    notifications += s.fire.length;
    open = [...open.filter((o) => !s.clear.includes(o)).map((o) => s.keep.find((k) => k.kind === o.kind && k.key === o.key) ?? o), ...s.fire.map((f) => ({ kind: f.kind, key: f.key, firedAt: f.firedAt, evidence: f.evidence }))];
    return s;
  };
  const s0 = run(spike, 0);
  eq("day 0: fires once", [s0.fire.length, notifications, open.length], [1, 1, 1]);
  const s1 = run(spike, 1);
  eq("day 1: still holds → kept, no second notification", [s1.fire.length, s1.keep.length, notifications], [0, 1, 1]);
  const s2 = run(quiet, 2);
  eq("day 2: 1 day without it → still open", [s2.clear.length, open.length], [0, 1]);
  const s3 = run(quiet, 3);
  eq("day 3: 2 days without it → cleared", [s3.clear.length, open.length], [1, 0]);
  const s4 = run(spike, 4);
  eq("day 4: holds again → a new firing", [s4.fire.length, notifications], [1, 2]);
  const s5 = run(quiet, 5);
  const s6 = run(spike, 6);
  eq("a gap of 1 day does not clear (hysteresis)", [s5.clear.length, s6.fire.length, s6.keep.length, notifications], [0, 0, 1, 2]);
}

section = "by angle";
{
  // the by-angle table is opsAggregates(dims: ["angle"]): its suppression rule, loaded outside Next
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("drizzle-orm");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
  const { suppressCells } = Module.createRequire(__filename)("@/lib/callcenter/aggregates") as typeof import("@/lib/callcenter/aggregates");
  const cell = (key: string, placed: number) => ({ key, placed, confirmed: Math.floor(placed * 0.7), cancelled: Math.floor(placed * 0.2), unreachable: 0, fake: 0, delivered: Math.floor(placed * 0.5), refused: Math.floor(placed * 0.1), returned: 0, lost: 0 });
  const out = suppressCells([cell("a1", 60), cell("a2", 4), cell("a3", 5), cell("a4", 1)]);
  eq("cells under 5 orders dropped and counted", [out.cells.map((c) => c.key), out.suppressed], [["a1", "a3"], 2]);
  ok("each kept cell carries its rates with n (withheld below 30)", out.cells.find((c) => c.key === "a3")?.confirmationRate !== undefined && "insufficient" in out.cells.find((c) => c.key === "a3")!.confirmationRate, out.cells);
  ok("no CPA per angle in a cell", !JSON.stringify(out).toLowerCase().includes("cpa"));
}

const ms = Date.now() - t0;
for (const f of failures) console.log(`✗ ${f}`);
console.log(failures.length ? `✗ test:profit: ${failures.length} failure(s), ${pass} passed` : `✓ test:profit: ${pass} assertions passed in ${ms} ms`);
process.exit(failures.length ? 1 : 0);
