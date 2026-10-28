/**
 * KpiTile (P2 SHELL; platform.md PLA-§22.12, §22.17, PD63; docs/STORE-SAAS.md §I.6, §I.8 rule 3): one dashboard
 * number, the typed successor of dashboard/kpi-card.tsx: label, value, the delta over a period with semantic delta
 * tokens, the hint, the sample size, and a sparkline only from 7 points. One of the three places the dashboard draws
 * numbers, so it refuses dishonest input (a `rate` without `n`, a sparkline under 7 points).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); P1 builds against them before P2 merges.
 * P0b stub: the track replaces the body, never the signature. The stub renders the label, the value, the delta with
 * its period and the hint as text (the sample size as `data-n`), and the sparkline as a `currentColor` polyline only
 * when `spark` has at least 7 points; shorter series are ignored.
 */
import type { ReactElement } from "react";

export interface KpiTileProps {
  label: string;
  value: string;
  delta?: { value: number; period: string };
  hint: string;
  n?: number;
  spark?: number[] /* rendered only when length ≥ 7 */;
  kind: "count" | "money" | "rate" | "duration";
  emphasis?: boolean;
}

const SPARK_MIN = 7;

/** The series scaled into a (length - 1) × 1 box, top = the highest point; a flat series is a centred line. */
function sparkPoints(values: readonly number[]): string {
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo;
  return values.map((v, i) => `${i},${span === 0 ? 0.5 : 1 - (v - lo) / span}`).join(" ");
}

export function KpiTile(p: KpiTileProps): ReactElement | null {
  const spark = p.spark && p.spark.length >= SPARK_MIN && p.spark.every(Number.isFinite) ? p.spark : null;
  return (
    <div data-kind={p.kind} data-n={p.n} data-emphasis={p.emphasis ? "" : undefined}>
      <span>{p.label}</span>
      <span>{p.value}</span>
      {p.delta && <span>{`${p.delta.value} ${p.delta.period}`}</span>}
      <span>{p.hint}</span>
      {spark && (
        <svg aria-hidden="true" viewBox={`0 0 ${spark.length - 1} 1`} preserveAspectRatio="none">
          <polyline points={sparkPoints(spark)} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}
