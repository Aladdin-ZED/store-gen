"use client";
/**
 * KpiTile (P2 SHELL; platform.md PLA-§22.12, §22.17, PD63; design.md DES-§16.9 "KPI tile"; docs/STORE-SAAS.md §I.6,
 * §I.8 rule 3): one dashboard number, the typed successor of dashboard/kpi-card.tsx without aurora or grain. Label
 * (13, muted), the value (28 px, 600, tabular; 32 px with `emphasis`, which also draws a 2 px inline-start brand bar),
 * the delta chip over the period on the semantic tokens with its arrow, the hint (the definition), `n` when given,
 * and a 1.5 px sparkline with its last point marked, only from 7 points.
 *
 * One of the three places the dashboard draws numbers, so it refuses dishonest input through `kpiTileView`
 * (./honest.ts): a `rate` without `n`, or with `n` under 30, shows "Needs 30 orders" instead of a number; a series
 * under 7 points draws no line. Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); `honestKpi()` makes
 * the `n` of a rate a type error at the call site.
 */
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { kpiTileView } from "./honest";
import { deltaTone } from "./primitive-logic";

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

const W = 120;
const H = 32;

/** The series in a W × H box (1.5 px inset so the stroke and the last dot stay inside); a flat series is centred. */
function sparkPath(values: readonly number[]): { d: string; last: [number, number] } {
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo;
  const pad = 2;
  const pts = values.map((v, i): [number, number] => [pad + (i / (values.length - 1)) * (W - pad * 2), span === 0 ? H / 2 : pad + (1 - (v - lo) / span) * (H - pad * 2)]);
  return { d: pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(""), last: pts[pts.length - 1]! };
}

const TONE = {
  up: { cls: "bg-success-soft text-success-ink", Icon: ArrowUpRightIcon },
  down: { cls: "bg-destructive-soft text-destructive-ink", Icon: ArrowDownRightIcon },
  flat: { cls: "bg-muted text-muted-foreground", Icon: MinusIcon },
} as const;

export function KpiTile(p: KpiTileProps): ReactElement | null {
  const t = useT();
  const locale = useAdminLocale();
  const view = kpiTileView(p);
  // the delta is a percent change ("+9.5 %", "+9,5 %" in French)
  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1 });
  const pct = (v: number) => fmt.format(v / 100);
  const delta = p.delta && view.value !== null && Number.isFinite(p.delta.value) ? p.delta : null;
  const tone = TONE[deltaTone(delta?.value ?? 0)];
  const spark = view.spark ? sparkPath(view.spark) : null;
  return (
    <div
      data-kind={p.kind}
      data-n={p.n}
      data-emphasis={p.emphasis ? "" : undefined}
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[var(--r-card)] bg-card p-4 text-card-foreground ring-1 ring-border ring-inset",
        p.emphasis && "ps-5",
      )}
    >
      {p.emphasis && <span aria-hidden="true" className="absolute inset-y-4 start-0 w-0.5 rounded-e-full bg-brand" />}
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] leading-snug text-muted-foreground" title={p.hint}>
          {p.label}
        </p>
        {delta && (
          <span className={cn("inline-flex h-5 shrink-0 items-center gap-0.5 rounded-[var(--r-chip)] px-1.5 text-[11px] font-medium tabular-nums", tone.cls)}>
            <tone.Icon aria-hidden="true" className="size-3" />
            <bdi>{pct(delta.value)}</bdi>
            <span className="sr-only"> {t("shell.kpi.delta", { value: pct(delta.value), period: delta.period })}</span>
          </span>
        )}
      </div>
      <div className="flex min-h-10 items-end justify-between gap-3">
        {view.value !== null ? (
          <p className={cn("leading-none font-semibold tracking-[-0.015em] tabular-nums", p.emphasis ? "text-[32px]" : "text-[28px]")}>
            <bdi>{view.value}</bdi>
          </p>
        ) : view.needs ? (
          <p className="text-sm font-medium text-muted-foreground">{t(view.needs.key, view.needs.vars)}</p>
        ) : (
          <p aria-hidden="true" className="text-[28px] leading-none font-semibold text-muted-foreground/50">
            ·
          </p>
        )}
        {spark && (
          <svg role="img" aria-label={t("shell.kpi.trend", { count: view.spark!.length })} viewBox={`0 0 ${W} ${H}`} className="h-8 w-28 max-w-[40%] min-w-12 shrink overflow-visible text-brand">
            <path d={spark.d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <circle cx={spark.last[0]} cy={spark.last[1]} r={2.25} fill="currentColor" />
          </svg>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {/* the definition always shows (PLA-§22.17: "placed, not delivered"); the delta's period after it */}
        {p.hint && <span className="min-w-0">{p.hint}</span>}
        {delta && (
          <span aria-hidden="true" className="min-w-0 text-muted-foreground/80">
            {t("shell.kpi.vs_period", { period: delta.period })}
          </span>
        )}
        {p.n !== undefined && Number.isSafeInteger(p.n) && (
          <span className="tabular-nums">
            <bdi>{t("shell.kpi.n", { n: p.n })}</bdi>
          </span>
        )}
      </div>
    </div>
  );
}
