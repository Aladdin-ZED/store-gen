"use client";

import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "../common/animated-number";
import { compact, delta, money, percent } from "../lib/format";

type Kind = "int" | "money" | "percent";

const formatters: Record<Kind, (currency: string) => (n: number) => string> = {
  int: () => (n) => compact(Math.round(n)),
  money: (currency) => (n) => money(Math.round(n), currency),
  percent: () => (n) => percent(n),
};
const cache = new Map<string, (n: number) => string>();
function formatterFor(kind: Kind, currency: string) {
  const key = `${kind}:${currency}`;
  let f = cache.get(key);
  if (!f) cache.set(key, (f = formatters[kind](currency)));
  return f;
}

/** KPI tile: label, big tabular number that rolls up, change vs the previous period, optional sparkline. */
export function KpiCard({
  label,
  value,
  previous,
  kind,
  currency = "MAD",
  icon,
  hint,
  spark,
  comparedTo = "vs previous 7 days",
  emphasis = false,
  className,
  style,
}: {
  label: string;
  value: number;
  previous: number | null;
  kind: Kind;
  currency?: string;
  icon?: ReactNode;
  hint?: ReactNode;
  /** values for the sparkline (oldest → newest) */
  spark?: number[];
  comparedTo?: string;
  /** hero tile: the larger value and a 2 px inline-start brand bar (DES-§16.9; no gradient field, D60) */
  emphasis?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const d = delta(value, previous);
  const up = d ? d.ratio >= 0 : null;
  return (
    <div
      className={cn("adm-surface adm-rise group relative flex min-h-[9.5rem] flex-col justify-between gap-4 overflow-hidden p-5", className)}
      style={style}
    >
      {emphasis && <span aria-hidden="true" className="absolute inset-y-5 start-0 w-0.5 rounded-e-full bg-brand" />}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
          {icon && (
            <span className={cn("flex size-7 items-center justify-center rounded-lg [&_svg]:size-3.5", emphasis ? "bg-brand text-brand-foreground" : "bg-foreground/[0.05] text-foreground/70")}>
              {icon}
            </span>
          )}
          {label}
        </span>
        {d && (
          <span
            title={comparedTo}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums ring-1 ring-inset",
              up ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300",
            )}
          >
            {up ? <ArrowUpRightIcon className="size-3" /> : <ArrowDownRightIcon className="size-3" />}
            {d.label}
          </span>
        )}
      </div>
      <div className="relative z-10 flex items-end justify-between gap-3">
        <div className="grid gap-1">
          <AnimatedNumber
            value={value}
            format={formatterFor(kind, currency)}
            className={cn("font-semibold tracking-[-0.03em] tabular-nums", emphasis ? "text-[2.4rem] leading-none" : "text-[2rem] leading-none")}
          />
          <span className="text-xs text-muted-foreground">{hint ?? comparedTo}</span>
        </div>
        {spark && spark.length > 1 && spark.some((v) => v > 0) && <Sparkline values={spark} />}
      </div>
    </div>
  );
}

/** Smooth area sparkline (Catmull-Rom → Bézier), drawn in once. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId().replace(/:/g, "");
  const w = 112;
  const h = 40;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - (v / max) * (h - 8)] as const);
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-10 w-28 shrink-0 overflow-visible", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand)", stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#spark-${id})`} className="adm-fade" />
      <path d={d} fill="none" className="adm-draw stroke-brand" strokeWidth="2" strokeLinecap="round" pathLength={120} style={{ ["--len" as string]: 120 }} />
      <circle cx={last[0]} cy={last[1]} r="3" className="adm-fade fill-brand stroke-card" strokeWidth="2" style={{ ["--i" as string]: 8 }} />
    </svg>
  );
}
