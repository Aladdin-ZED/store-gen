/**
 * KPI definitions (P4 CALL CENTER; operations.md OPE-§14.3, OD17, OD38, OD43, OD44, OD48, OD50, OD53, OD54). Pure and
 * isomorphic: every function takes counts (or samples) the readers of `kpis.server.ts`, `profile.ts` and
 * `aggregates.ts` computed, and answers a `Kpi`, never a bare number, so no screen can render a rate without its n
 * (`test:ops` checks the return type of every export of this file through the TypeScript compiler API).
 *
 *   value      a rate or a share is a fraction 0..1 with four decimals (screens show one decimal of a percent); a time
 *              is in window minutes (first touch) or seconds (handling); attempts per confirmation is a ratio
 *   n          the denominator the definition names (decisions, finals, claims, attempts, samples…)
 *   min        20 per agent, 30 per store (OD17), 30 attempts per hour cell (OD44); below it `insufficient: true` and
 *              the UI shows the count and "needs 20 / 30"
 *
 * Attribution (who the counts belong to) is the readers' job: the actor of the decisive move, `confirmed_by` for
 * deliveries and return reasons, a mapped sheet label as its member, an unmapped label only on the board (OD54).
 * Test and honeypot orders never reach these counts. The reason mixes (lists of `Kpi`s) are built in
 * ./aggregates.ts (`reasonShares`), so every function exported here answers one `Kpi`.
 */
import type { Kpi } from "@/lib/orders/profile";

export type { Kpi };

/** who a figure is about: OD17's minimum n */
export type KpiWho = "agent" | "store";

export const KPI_MIN = { agent: 20, store: 30, hourCell: 30 } as const;

const minOf = (who: KpiWho): number => (who === "agent" ? KPI_MIN.agent : KPI_MIN.store);
const whole = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** num ÷ den as a fraction with four decimals; withheld below `min` (the count and the minimum still travel). */
export function rateKpi(num: number, den: number, min: number): Kpi {
  const n = whole(den);
  if (n === 0 || n < min) return { n, min, insufficient: true };
  return { value: Math.round((whole(num) * 10_000) / n) / 10_000, n, min };
}

/** A value measured on `n` samples (a time, a ratio): withheld below `min`. */
export function measuredKpi(value: number | null, n: number, min: number): Kpi {
  const count = whole(n);
  if (value === null || !Number.isFinite(value) || count === 0 || count < min) return { n: count, min, insufficient: true };
  return { value, n: count, min };
}

/** The q-quantile (nearest rank) of samples; null when empty. */
function quantile(samples: readonly number[], q: number): number | null {
  const s = samples.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
}

/* ------------------------------------------------------------------ */
/* the OPE-§14.3 table                                                 */
/* ------------------------------------------------------------------ */

export interface DecisionCounts {
  confirmed: number;
  cancelled: number;
  unreachable: number;
}

/** confirmed ÷ (confirmed + cancelled + unreachable); 20 per agent, 30 per store */
export function confirmationRate(c: DecisionCounts, who: KpiWho): Kpi {
  return rateKpi(c.confirmed, c.confirmed + c.cancelled + c.unreachable, minOf(who));
}

/** unreachable ÷ (confirmed + cancelled + unreachable): the same denominator as the confirmation rate */
export function unreachableRate(c: DecisionCounts, who: KpiWho): Kpi {
  return rateKpi(c.unreachable, c.confirmed + c.cancelled + c.unreachable, minOf(who));
}

export interface FinalCounts {
  delivered: number;
  refused: number;
  returned: number;
  lost: number;
}

/** delivered ÷ (delivered + refused + returned + lost), the orders that reached a final ship state in the window */
export function deliveryRate(c: FinalCounts, who: KpiWho): Kpi {
  return rateKpi(c.delivered, c.delivered + c.refused + c.returned + c.lost, minOf(who));
}

/** delivered ÷ placed over the placed-day cohorts at least 14 days old (the caller keeps only those); 30 */
export function netDeliveredRate(cohorts: readonly { placed: number; delivered: number }[]): Kpi {
  const placed = cohorts.reduce((s, c) => s + whole(c.placed), 0);
  const delivered = cohorts.reduce((s, c) => s + whole(c.delivered), 0);
  return rateKpi(delivered, placed, KPI_MIN.store);
}

/** median window minutes from creation to the first attempt (OD17: a night order is not a slow agent) */
export function firstTouchP50(windowMinutes: readonly number[], who: KpiWho): Kpi {
  return measuredKpi(quantile(windowMinutes, 0.5), windowMinutes.length, minOf(who));
}

/** p90 of the same samples */
export function firstTouchP90(windowMinutes: readonly number[], who: KpiWho): Kpi {
  return measuredKpi(quantile(windowMinutes, 0.9), windowMinutes.length, minOf(who));
}

/** attempts ÷ confirmed, two decimals; n = confirmed */
export function attemptsPerConfirmation(c: { attempts: number; confirmed: number }, who: KpiWho): Kpi {
  const n = whole(c.confirmed);
  return measuredKpi(n ? Math.round((whole(c.attempts) * 100) / n) / 100 : null, n, minOf(who));
}

/** median seconds from a claim to its outcome, per claim */
export function handlingTimeP50(ms: readonly number[], who: KpiWho): Kpi {
  const p = quantile(ms, 0.5);
  return measuredKpi(p === null ? null : Math.round(p / 1000), ms.length, minOf(who));
}

/** claims released by lease expiry (OD46) ÷ claims */
export function abandonedRate(c: { abandoned: number; claimed: number }, who: KpiWho): Kpi {
  return rateKpi(c.abandoned, c.claimed, minOf(who));
}

/** claims released by Skip ÷ claims */
export function skipRate(c: { skipped: number; claimed: number }, who: KpiWho): Kpi {
  return rateKpi(c.skipped, c.claimed, minOf(who));
}

/** attempts that reached someone ÷ attempts, one hour cell of the store day (OD44): 30 attempts */
export function contactRate(c: { contacted: number; attempts: number }): Kpi {
  return rateKpi(c.contacted, c.attempts, KPI_MIN.hourCell);
}

/** delivery-lane orders with a customer_informed / reschedule call that ended delivered ÷ such orders now final (OD48) */
export function rescueRate(c: { delivered: number; final: number }, who: KpiWho): Kpi {
  return rateKpi(c.delivered, c.final, minOf(who));
}

/** decisions taken on an inbound call ÷ decisions (OD53) */
export function inboundShare(c: { inbound: number; decisions: number }, who: KpiWho): Kpi {
  return rateKpi(c.inbound, c.decisions, minOf(who));
}

/** orders with a risk score ≥ 50 ÷ placed (store) */
export function riskyShare(c: { risky: number; placed: number }): Kpi {
  return rateKpi(c.risky, c.placed, KPI_MIN.store);
}
