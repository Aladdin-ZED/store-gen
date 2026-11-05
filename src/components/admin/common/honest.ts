/**
 * Honest-data guards (P2 SHELL; platform.md PLA-§22.18 rule 3, §22.16, §22.17, PD63; docs/STORE-SAAS.md §I.8 rule 3).
 * Pure and isomorphic, at two levels:
 *
 * - **type level**: `HonestKpiTileProps` makes `n` required on a `rate` tile, `FunnelStepInput` admits `null` for a
 *   step without data, and the views below never hand a component a 0 it did not measure;
 * - **runtime**: `kpiTileView`, `sparkSeries`, `funnelView` and `healthRingView` turn props into what may be drawn and
 *   list what they refused (`refused`), so `KpiTile`, `FunnelChart` and `HealthRing` draw no dishonest number even when
 *   a caller bypasses the types (`test:shell`).
 *
 * The rules: no rate without its `n`, and below the sample floor the tile says "Needs 30 orders" instead of a number; a
 * blank value is no number at all (the tile shows its hint, e.g. "Fills in with delivery tracking");
 * no sparkline under 7 points; a funnel step with no data is `null`, never 0, and renders as the R2 line; a ring with
 * a null (or impossible) score shows the computing state; below 5 funnel points the chart becomes a table (§I.6).
 */
import type { MessageKey } from "@/lib/i18n/admin";
import type { HealthEvidence } from "@/lib/health/types";
import type { FunnelChartProps } from "./funnel-chart";
import type { HealthRingProps } from "./health-ring";
import type { KpiTileProps } from "./kpi-tile";

/** The sample floor of a rate (PLA-§22.17: "needs 30 orders"). */
export const RATE_MIN_N = 30;
/** A sparkline needs a week of daily points (§I.8 rule 3). */
export const SPARK_MIN_POINTS = 7;
/** Below this many data points a chart is a table (§I.6). */
export const CHART_MIN_POINTS = 5;

export type HonestRefusal =
  | "rate_without_n"
  | "rate_out_of_range"
  | "n_invalid"
  | "spark_too_short"
  | "spark_not_finite"
  | "funnel_zero_for_missing"
  | "funnel_rate_without_value"
  | "funnel_not_finite"
  | "score_out_of_range";

/* ---------------------------------------------------------------- KPI tile */

/** `KpiTileProps` with `n` required on a rate: `honestKpi({ kind: "rate", … })` without `n` is a type error. */
export type HonestKpiTileProps = Omit<KpiTileProps, "kind" | "n"> &
  ({ kind: "rate"; n: number } | { kind: Exclude<KpiTileProps["kind"], "rate">; n?: number });

/** The identity at runtime; its job is the type check at the call site. */
export function honestKpi(p: HonestKpiTileProps): KpiTileProps {
  return p;
}

export interface KpiTileView {
  /** the value to draw; null = no number (the `needs` line or the hint stands in its place) */
  value: string | null;
  /** "Needs 30 orders" while a rate's sample is below the floor */
  needs: { key: MessageKey; vars: { count: number } } | null;
  spark: number[] | null;
  refused: HonestRefusal[];
}

const validN = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export function kpiTileView(p: KpiTileProps, minN: number = RATE_MIN_N): KpiTileView {
  const refused: HonestRefusal[] = [];
  // a blank value is "no number" (an R2 tile such as Delivered or Cash to collect): the hint says why, nothing is drawn
  let value: string | null = typeof p.value === "string" && p.value.trim() !== "" ? p.value : null;
  let needs: KpiTileView["needs"] = null;
  if (p.n !== undefined && !validN(p.n)) refused.push("n_invalid");
  if (p.kind === "rate") {
    if (!validN(p.n)) {
      if (p.n === undefined) refused.push("rate_without_n");
      value = null;
      needs = { key: "shell.honest.needs_orders", vars: { count: minN } };
    } else if (p.n < minN) {
      value = null;
      needs = { key: "shell.honest.needs_orders", vars: { count: minN } };
    } else {
      const pct = Number.parseFloat(p.value);
      if (Number.isFinite(pct) && (pct < 0 || pct > 100)) {
        refused.push("rate_out_of_range");
        value = null;
      }
    }
  }
  const s = sparkSeries(p.spark);
  refused.push(...s.refused);
  return { value, needs, spark: s.points, refused };
}

/** The sparkline's points when there are at least 7 finite ones, else null (never a 2-point "trend"). */
export function sparkSeries(spark: readonly number[] | undefined): { points: number[] | null; refused: HonestRefusal[] } {
  if (!spark || spark.length === 0) return { points: null, refused: [] };
  if (!spark.every(Number.isFinite)) return { points: null, refused: ["spark_not_finite"] };
  if (spark.length < SPARK_MIN_POINTS) return { points: null, refused: ["spark_too_short"] };
  return { points: [...spark], refused: [] };
}

/* ---------------------------------------------------------------- funnel */

type FunnelStep = FunnelChartProps["steps"][number];
export type FunnelStepId = FunnelStep["id"];

/** A funnel step as a data source answers it: undefined, null or not a count = no data (null), never 0. */
export function funnelStep(id: FunnelStepId, label: string, count: number | null | undefined): FunnelStep {
  return { id, label, value: validN(count) ? count : null };
}

/**
 * The R1 funnel (step p2-06, PLA-§22.12 "a funnel step with 0 where the data does not exist"): R1 measures orders and
 * confirmed only, so shipped, delivered and collected are the literal `null`; a 0 for one of them is a type error at
 * the call site (`r1Funnel([...])`), not just a runtime refusal.
 */
export type R1FunnelSteps = [
  { id: "orders"; label: string; value: number | null; rate?: number },
  { id: "confirmed"; label: string; value: number | null; rate?: number },
  { id: "shipped"; label: string; value: null },
  { id: "delivered"; label: string; value: null },
  { id: "collected"; label: string; value: null },
];

/** The identity at runtime; its job is the type check at the call site. */
export function r1Funnel(steps: R1FunnelSteps): FunnelChartProps["steps"] {
  return steps;
}

export interface FunnelRowView {
  id: FunnelStepId;
  label: string;
  /** null = the neutral "with delivery tracking (R2)" line, never a zero bar */
  value: number | null;
  /** percent of the previous step with data, rounded; null without both numbers */
  rate: number | null;
  /** 0-1 of the first step's value, for the bar width */
  share: number | null;
}

export interface FunnelView {
  rows: FunnelRowView[];
  /** fewer than 5 steps with data: render a table, not bars (§I.6) */
  asTable: boolean;
  missingKey: MessageKey;
  refused: HonestRefusal[];
}

/**
 * The funnel's rows. `missing` names the steps the release cannot measure (R1: shipped, delivered, collected): a 0
 * given for one of them is refused and drawn as the R2 line. Rates are recomputed from the counts, never trusted.
 */
export function funnelView(steps: FunnelChartProps["steps"], missing: readonly FunnelStepId[] = []): FunnelView {
  const refused: HonestRefusal[] = [];
  const rows: FunnelRowView[] = [];
  let prev: number | null = null;
  let first: number | null = null;
  for (const step of steps) {
    let value = step.value;
    if (value !== null && !validN(value)) {
      refused.push("funnel_not_finite");
      value = null;
    }
    if (value === 0 && missing.includes(step.id)) {
      refused.push("funnel_zero_for_missing");
      value = null;
    }
    if (value === null && step.rate !== undefined) refused.push("funnel_rate_without_value");
    if (first === null && value !== null) first = value;
    const rate = value !== null && prev !== null && prev > 0 ? Math.round((value / prev) * 100) : null;
    const share = value !== null && first !== null && first > 0 ? Math.min(1, value / first) : null;
    rows.push({ id: step.id, label: step.label, value, rate, share });
    if (value !== null) prev = value;
  }
  const points = rows.filter((r) => r.value !== null).length;
  return { rows, asTable: points < CHART_MIN_POINTS, missingKey: "shell.honest.r2_delivery", refused };
}

/* ---------------------------------------------------------------- health ring */

export type HealthBand = "good" | "fair" | "low" | "poor";

export interface HealthRingView {
  state: "computing" | "score";
  score: number | null;
  band: HealthBand | null;
  refused: HonestRefusal[];
}

/** Bands of PLA-§22.12: ≥ 80 jade, 50-79 neutral, 30-49 yellow, < 30 crimson. */
export function healthBand(score: number): HealthBand {
  return score >= 80 ? "good" : score >= 50 ? "fair" : score >= 30 ? "low" : "poor";
}

/** A null score is the computing state; a score that is not an integer in 0-100 is refused into it too. */
export function healthRingView(p: Pick<HealthRingProps, "score">): HealthRingView {
  if (p.score === null) return { state: "computing", score: null, band: null, refused: [] };
  if (!Number.isInteger(p.score) || p.score < 0 || p.score > 100) return { state: "computing", score: null, band: null, refused: ["score_out_of_range"] };
  return { state: "score", score: p.score, band: healthBand(p.score), refused: [] };
}

/** Is a health computation fresh? Neutral dot when older than `staleAfterMin` (PD78), never a fixed hour. */
export function healthFresh(computedAt: string | null, staleAfterMin: number, now: Date): boolean {
  if (!computedAt) return false;
  const at = Date.parse(computedAt);
  return Number.isFinite(at) && now.getTime() - at <= staleAfterMin * 60_000;
}

/* ---------------------------------------------------------------- issue sentences */

/**
 * The variables an issue sentence (`health.<track>.<rule>.text`) is rendered with: the evidence's numbers, with
 * `count` = `value` for the plural templates. Numbers only: the evidence never carries customer data.
 */
export function evidenceVars(e: HealthEvidence): Record<string, number | string> {
  const vars: Record<string, number | string> = { value: e.value, count: e.value, n: e.n, window: e.window };
  if (e.baseline !== undefined) vars.baseline = e.baseline;
  return vars;
}
