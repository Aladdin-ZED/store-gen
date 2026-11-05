/**
 * Break-even math of Profit lite (P4 CALL CENTER; operations.md OPE-§16.2, §16.3 COD fee base, OD17, OD25, OD35,
 * AC-05 R1). Pure and isomorphic: the reads (src/lib/finance/lite/breakeven.server.ts) hand over counts and per-order
 * lines in integer cents, this file never touches the database.
 *
 *   c                 = confirmed / (confirmed + cancelled + unreachable)      n_c ≥ 30
 *   d                 = delivered / (delivered + refused + returned + lost)    n_d ≥ 30 (OD17)
 *   margin_delivered  = avg over delivered orders of (total − COGS − packaging − delivery_fee(city) − cod_fee(city))
 *   loss_failed       = avg over failed orders of (delivery_fee(city) + return_fee(city) + packaging)
 *                       (no failed order yet: the default `*` row)
 *   E_placed          = c·d·margin_delivered − c·(1−d)·loss_failed            per placed order, before ads
 *   BE_CPA_placed     = E_placed            BE_CPA_delivered = E_placed / (c·d)
 *   CPA_placed        = converted ad spend (28 d) / placed (28 d), store-level in R1
 *   interval          = E_placed at (c_low, d_low) and (c_high, d_high), Wilson 95 % bounds
 *
 * With any input missing the answer lists what to add and carries no number ("Add your cost to see profit"); a
 * figure is never guessed (OPE-§16.1).
 */

/** OD17: a rate needs this many decisions or finals */
export const BE_MIN_N = 30;
const Z95 = 1.959963984540054;

/** Wilson score interval of k successes in n trials (95 % by default); n = 0 → [0, 1]. */
export function wilson(k: number, n: number, z = Z95): { low: number; high: number } {
  if (!(n > 0)) return { low: 0, high: 1 };
  const p = Math.min(1, Math.max(0, k / n));
  const z2 = z * z;
  const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** The COD fee rule of a carrier rate row (OPS-25). */
export interface CodFeeRule {
  codFeeBp: number;
  codFeeMinCents: number | null;
  codFeeFlatCents: number;
}

/** `max(min ?? 0, round(collected × bp / 10000)) + flat`, integer cents. */
export function codFeeCents(collectedCents: number, rule: CodFeeRule): number {
  const pct = Math.round((Math.max(0, collectedCents) * Math.max(0, rule.codFeeBp)) / 10_000);
  return Math.max(rule.codFeeMinCents ?? 0, pct) + Math.max(0, rule.codFeeFlatCents);
}

/** One "my carrier" rate row as Profit lite reads it ('*' = every other city). */
export interface CarrierRateRow extends CodFeeRule {
  cityKey: string;
  deliveryFeeCents: number | null;
  returnFeeCents: number | null;
  active: boolean;
}

/** The row that prices a city: its own active row, else the active `*` row; null when neither exists. */
export function rateForCity(rates: readonly CarrierRateRow[], cityKey: string | null): CarrierRateRow | null {
  const own = cityKey ? rates.find((r) => r.cityKey === cityKey && r.active) : undefined;
  return own ?? rates.find((r) => r.cityKey === "*" && r.active) ?? null;
}

/** The median of integer cents (the lower middle on an even count, so the answer stays an integer); null when empty. */
export function medianCents(values: readonly number[]): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.floor((s.length - 1) / 2)]!;
}

/** What a missing input asks the owner to add (OPE-§16.2: "with a missing input it lists what to add"). */
export type BreakEvenMissing = "item_costs" | "packaging" | "delivery_fee" | "return_fee" | "confirm_n" | "delivery_n";

export interface BreakEvenCounts {
  placed: number;
  confirmed: number;
  cancelled: number;
  unreachable: number;
  delivered: number;
  refused: number;
  returned: number;
  lost: number;
}

export interface BreakEvenInput {
  counts: BreakEvenCounts;
  /** the delivered orders of the cohort: total and COGS in cents (null = a line without a cost) */
  delivered: readonly { totalCents: number; cogsCents: number | null; cityKey: string | null }[];
  /** the refused / returned / lost orders of the cohort */
  failed: readonly { cityKey: string | null }[];
  /** accounting.packagingCents (null = not set) */
  packagingCents: number | null;
  rates: readonly CarrierRateRow[];
}

/** A rate with its n and its Wilson bounds. */
export interface RateWithN {
  value: number;
  n: number;
  low: number;
  high: number;
}

export type BreakEven =
  | { ok: false; missing: BreakEvenMissing[]; nC: number; nD: number; uncosted: number }
  | {
      ok: true;
      c: RateWithN;
      d: RateWithN;
      marginDeliveredCents: number;
      lossFailedCents: number;
      ePlacedCents: number;
      beCpaPlacedCents: number;
      /** null when c·d = 0 (no delivery can pay for an order) */
      beCpaDeliveredCents: number | null;
      interval: { lowCents: number; highCents: number };
    };

const E = (c: number, d: number, margin: number, loss: number) => c * d * margin - c * (1 - d) * loss;
const roundCents = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x));

/** The break-even of one cohort (see the header); a missing input answers the list of what to add. */
export function breakEven(input: BreakEvenInput): BreakEven {
  const k = input.counts;
  const nC = k.confirmed + k.cancelled + k.unreachable;
  const nD = k.delivered + k.refused + k.returned + k.lost;
  const missing: BreakEvenMissing[] = [];
  const uncosted = input.delivered.filter((o) => o.cogsCents === null).length;
  if (uncosted > 0) missing.push("item_costs");
  if (input.packagingCents === null) missing.push("packaging");
  const priced = [...input.delivered.map((o) => o.cityKey), ...input.failed.map((o) => o.cityKey)];
  const rowsOf = priced.length ? priced.map((city) => rateForCity(input.rates, city)) : [rateForCity(input.rates, null)];
  if (rowsOf.some((r) => !r || r.deliveryFeeCents === null)) missing.push("delivery_fee");
  const failedRows = input.failed.length ? input.failed.map((o) => rateForCity(input.rates, o.cityKey)) : [rateForCity(input.rates, null)];
  if (failedRows.some((r) => !r || r.returnFeeCents === null)) missing.push("return_fee");
  if (nC < BE_MIN_N) missing.push("confirm_n");
  if (nD < BE_MIN_N) missing.push("delivery_n");
  if (missing.length) return { ok: false, missing, nC, nD, uncosted };

  const packaging = input.packagingCents!;
  let marginSum = 0;
  for (const o of input.delivered) {
    const r = rateForCity(input.rates, o.cityKey)!;
    marginSum += o.totalCents - o.cogsCents! - packaging - r.deliveryFeeCents! - codFeeCents(o.totalCents, r);
  }
  const margin = input.delivered.length ? marginSum / input.delivered.length : 0;
  let lossSum = 0;
  for (const r of failedRows) lossSum += r!.deliveryFeeCents! + r!.returnFeeCents! + packaging;
  const loss = lossSum / failedRows.length;

  const c = k.confirmed / nC;
  const d = k.delivered / nD;
  const wc = wilson(k.confirmed, nC);
  const wd = wilson(k.delivered, nD);
  const e = E(c, d, margin, loss);
  const eLow = E(wc.low, wd.low, margin, loss);
  const eHigh = E(wc.high, wd.high, margin, loss);
  return {
    ok: true,
    c: { value: c, n: nC, low: wc.low, high: wc.high },
    d: { value: d, n: nD, low: wd.low, high: wd.high },
    marginDeliveredCents: roundCents(margin),
    lossFailedCents: roundCents(loss),
    ePlacedCents: roundCents(e),
    beCpaPlacedCents: roundCents(e),
    beCpaDeliveredCents: c * d > 0 ? roundCents(e / (c * d)) : null,
    interval: { lowCents: roundCents(Math.min(eLow, eHigh)), highCents: roundCents(Math.max(eLow, eHigh)) },
  };
}

/** CPA per placed order (store-level in R1); null without spend rows or placed orders. */
export function cpaPlacedCents(spendCents: number | null, placed: number): number | null {
  if (spendCents === null || placed <= 0) return null;
  return Math.round(spendCents / placed);
}

/* ------------------------------------------------------------------ */
/* fee charged vs fee paid (OPS-13)                                    */
/* ------------------------------------------------------------------ */

export interface FeeLine {
  cityKey: string;
  /** delivered orders of the city in the window (n) */
  n: number;
  /** median `orders.shipping` of those orders, cents; null when n = 0 */
  chargedCents: number | null;
  /** the rate row's delivery fee (the city's row, else `*`); null = not typed */
  paidCents: number | null;
  /** paid − charged when both exist */
  gapCents: number | null;
}

/** One line per city from its delivered orders' shipping (cents) and the rates; largest n first. */
export function feeLines(shippingByCity: ReadonlyMap<string, readonly number[]>, rates: readonly CarrierRateRow[]): FeeLine[] {
  const out: FeeLine[] = [];
  for (const [cityKey, list] of shippingByCity) {
    const charged = medianCents(list);
    const row = rateForCity(rates, cityKey === "*" ? null : cityKey);
    const paid = row?.deliveryFeeCents ?? null;
    out.push({ cityKey, n: list.length, chargedCents: charged, paidCents: paid, gapCents: charged !== null && paid !== null ? paid - charged : null });
  }
  return out.sort((a, b) => b.n - a.n || a.cityKey.localeCompare(b.cityKey));
}

/** `fin:fee_gap`: among the top-5 cities by delivered orders (n ≥ 10 each), those charging ≥ `minGapCents` below the rate. */
export function feeGaps(lines: readonly FeeLine[], minGapCents = 1_000): FeeLine[] {
  return lines
    .filter((l) => l.cityKey !== "*")
    .slice(0, 5)
    .filter((l) => l.n >= 10 && l.gapCents !== null && l.gapCents >= minGapCents);
}
