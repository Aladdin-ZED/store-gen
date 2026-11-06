/**
 * Ad spend in the ad account's currency, converted with the owner's dated rate (P4 CALL CENTER; operations.md OD56,
 * OPE-§16.2 "Ad spend", AC-03 R1). Pure and isomorphic.
 *
 * `ad_spend_daily.spend_cents` keeps the account currency. Every Profit lite figure converts it with the latest rate
 * of that currency dated on or before the day (`accounting.adRates`, "1 USD = 9.85 MAD from 1 Oct", typed by the
 * owner and labelled "your rate, estimate"): `round(spend × rateMilli / 1000)`. A day without a rate is excluded and
 * counted ("needs a rate"), never converted 1:1. No rate is ever fetched or invented.
 */

export interface AdRate {
  /** ISO 4217, upper case */
  currency: string;
  /** store-local day the rate applies from (YYYY-MM-DD) */
  fromDay: string;
  /** 1 unit of `currency` = rateMilli / 1000 store units */
  rateMilli: number;
}

/** The latest rate of `currency` dated ≤ `day`; null when none. */
export function rateFor(currency: string, day: string, rates: readonly AdRate[]): AdRate | null {
  const cur = currency.toUpperCase();
  let best: AdRate | null = null;
  for (const r of rates) {
    if (r.currency.toUpperCase() !== cur || r.fromDay > day) continue;
    if (!best || r.fromDay > best.fromDay) best = r;
  }
  return best;
}

/**
 * Spend of one day in store cents: the amount itself when it is already in the store currency, else
 * `round(spend × rateMilli / 1000)` (half away from zero) with the latest rate dated ≤ the day; null = needs a rate.
 */
export function spendStoreCents(spendCents: number, currency: string, day: string, rates: readonly AdRate[], storeCurrency?: string): number | null {
  if (storeCurrency !== undefined && currency.toUpperCase() === storeCurrency.toUpperCase()) return Math.trunc(spendCents);
  const rate = rateFor(currency, day, rates);
  if (!rate) return null;
  const x = (Math.trunc(spendCents) * rate.rateMilli) / 1000;
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

export interface SpendRow {
  day: string;
  platform: string;
  spendCents: number;
  currency: string;
}

export interface ConvertedSpend {
  /** Σ store cents of the rows that could be converted */
  cents: number;
  /** rows typed in the account currency that had no rate for their day */
  missingRates: number;
  /** the distinct days of those rows, oldest first ("3 days not counted") */
  missingDays: string[];
  /** rows counted */
  rows: number;
  /** the rates used, one per foreign currency: the latest one applied (printed under the break-even card) */
  ratesUsed: AdRate[];
}

/** Σ of rows in store cents; rows without a rate are left out and listed. */
export function convertSpend(rows: readonly SpendRow[], rates: readonly AdRate[], storeCurrency: string): ConvertedSpend {
  let cents = 0;
  let counted = 0;
  let missing = 0;
  const missingDays = new Set<string>();
  const used = new Map<string, AdRate>();
  for (const r of rows) {
    if (r.spendCents === 0) continue;
    const c = spendStoreCents(r.spendCents, r.currency, r.day, rates, storeCurrency);
    if (c === null) {
      missing++;
      missingDays.add(r.day);
      continue;
    }
    cents += c;
    counted++;
    if (r.currency.toUpperCase() !== storeCurrency.toUpperCase()) {
      const rate = rateFor(r.currency, r.day, rates)!;
      const prev = used.get(rate.currency);
      if (!prev || rate.fromDay > prev.fromDay) used.set(rate.currency, rate);
    }
  }
  return { cents, missingRates: missing, missingDays: [...missingDays].sort(), rows: counted, ratesUsed: [...used.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
}
