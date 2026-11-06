/**
 * Console → AI building blocks (P7 AI; ai.md AI-§K.2; docs/STORE-SAAS.md §I.6, §I.8): server-safe, English only (the
 * console's `ai.console.*` keys, AI-§L). Each panel streams on its own (`Section`: a skeleton of its own shape, then
 * the content, or its own error state with Retry while the others render); state is text in a semantic token, never
 * a decorative dot; danger and warn read `--destructive` and `--warn-ink` (never an orange hue); every rate carries
 * its n; a sparkline draws only from 7 points up; tables become two-line rows below 768 px.
 */
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { t, type MessageVars } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";
import { RetryButton } from "./client";

/** The console's strings (English, AI-§L `ai.console.*`). */
export const c = (key: string, vars?: MessageVars): string => t(key, vars, "en");

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

const NF = new Intl.NumberFormat("en-GB");
export const int = (n: number): string => NF.format(Math.round(n));
export function usd(micros: number | null | undefined): string {
  if (micros === null || micros === undefined) return "-";
  const v = micros / 1_000_000;
  const digits = v !== 0 && Math.abs(v) < 0.1 ? 4 : 2;
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(v)}`;
}
export const usdOf = (dollars: number | null): string => (dollars === null ? "-" : `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(dollars)}`);
export function pct(fraction: number | null, digits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "-";
  return new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: digits }).format(fraction);
}
export function ms(v: number | null): string {
  if (v === null) return "-";
  if (!Number.isFinite(v)) return "> 90 s";
  return v < 1000 ? `${Math.round(v)} ms` : `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(v / 1000)} s`;
}
export function ago(iso: string | Date | null, now: Date = new Date()): string {
  if (!iso) return c("ai.console.never");
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto", style: "short" });
  if (s < 60) return rtf.format(-s, "second");
  if (s < 3600) return rtf.format(-Math.round(s / 60), "minute");
  if (s < 86_400) return rtf.format(-Math.round(s / 3600), "hour");
  return rtf.format(-Math.round(s / 86_400), "day");
}
export const dateOf = (iso: string | Date | null): string =>
  iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(typeof iso === "string" ? new Date(iso) : iso) : "-";

/* ------------------------------------------------------------------ */
/* tone                                                                */
/* ------------------------------------------------------------------ */

export type Tone = "ok" | "warn" | "danger" | "muted" | "plain";
export const TONE: Record<Tone, string> = {
  ok: "text-success-ink",
  warn: "text-[color:var(--warn-ink,var(--foreground))]",
  danger: "text-destructive",
  muted: "text-muted-foreground",
  plain: "text-foreground",
};

/** A state as a word in its token (never a coloured dot). */
export function State({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("font-medium", TONE[tone], className)}>{children}</span>;
}

/** A value with its sample: "12.5% · n 240". */
export function RateWithN({ value, n, tone = "plain" }: { value: number | null; n: number; tone?: Tone }) {
  return (
    <span className="tabular-nums">
      <span className={cn(TONE[tone])}>{pct(value)}</span>
      <span className="text-muted-foreground"> · n {int(n)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* frame                                                               */
/* ------------------------------------------------------------------ */

export function Panel({ title, meta, action, children, className, bodyClassName }: { title: string; meta?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section aria-label={title} className={cn("min-w-0 rounded-xl border bg-card text-card-foreground", className)}>
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold tracking-[-0.005em]">{title}</h2>
        {meta || action ? (
          <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            {meta}
            {action}
          </div>
        ) : null}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelSkeleton({ title, rows = 4, className }: { title: string; rows?: number; className?: string }) {
  return (
    <section aria-label={title} aria-busy="true" className={cn("min-w-0 rounded-xl border bg-card", className)}>
      <header className="flex min-h-11 items-center border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-muted-foreground">{title}</h2>
      </header>
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted/70" style={{ maxWidth: `${60 + ((i * 17) % 35)}%` }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function PanelError({ title, className }: { title: string; className?: string }) {
  return (
    <section aria-label={title} className={cn("min-w-0 rounded-xl border bg-card", className)}>
      <header className="flex min-h-11 items-center border-b px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">{title}</h2>
      </header>
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <span className="text-destructive">{c("ai.console.panel_error")}</span>
        <RetryButton />
      </div>
    </section>
  );
}

async function Loaded<T>({ title, load, render }: { title: string; load: () => Promise<T>; render: (data: T) => ReactNode }) {
  let data: T;
  try {
    data = await load();
  } catch (err) {
    console.error(`[ai-console] ${title}: ${err instanceof Error ? `${err.name}: ${err.message.slice(0, 160)}` : "error"}`);
    return <PanelError title={title} />;
  }
  return <>{render(data)}</>;
}

/** One panel: its skeleton while it loads, its error alone if it fails; `className` places it in the page grid. */
export function Section<T>({ title, rows, load, render, className }: { title: string; rows?: number; load: () => Promise<T>; render: (data: T) => ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <Suspense fallback={<PanelSkeleton title={title} rows={rows} />}>
        <Loaded title={title} load={load} render={render} />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* figures                                                             */
/* ------------------------------------------------------------------ */

export function Stat({ label, value, sub, tone = "plain" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 truncate text-xl font-semibold tabular-nums tracking-[-0.01em]", TONE[tone])}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/** Label / value lines (a definition list), dense, values right-aligned and tabular. */
export function Lines({ items }: { items: { label: ReactNode; value: ReactNode; key?: string }[] }) {
  return (
    <dl className="divide-y text-sm">
      {items.map((it, i) => (
        <div key={it.key ?? i} className="flex min-h-9 items-center justify-between gap-4 py-1.5">
          <dt className="min-w-0 text-muted-foreground">{it.label}</dt>
          <dd className="min-w-0 truncate text-end tabular-nums">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A thin usage bar: the brand fill, the destructive one from 85 %. */
export function Meter({ fraction, label }: { fraction: number | null; label: string }) {
  const f = fraction === null ? 0 : Math.max(0, Math.min(1, fraction));
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(f * 100)} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-[width] duration-300 ease-out", f >= 0.85 ? "bg-destructive" : "bg-brand")} style={{ width: `${f * 100}%` }} />
    </div>
  );
}

/** A sparkline of ≥ 7 points (fewer draw nothing: §I.6). */
export function Sparkline({ points, label, className }: { points: readonly number[]; label: string; className?: string }) {
  if (points.length < 7) return null;
  const w = 120;
  const h = 28;
  const max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - 2 - (p / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label} className={cn("shrink-0 overflow-visible text-brand", className)}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* tables: columns on desktop, two-line rows at 390 px                  */
/* ------------------------------------------------------------------ */

export interface Col {
  key: string;
  label: string;
  /** the first line on a phone (the others join the second line) */
  primary?: boolean;
  align?: "start" | "end";
  /** grid track on desktop, e.g. "minmax(0,2fr)" */
  width?: string;
}

export function DataRows({ cols, rows, empty, caption }: { cols: Col[]; rows: { key: string; cells: Record<string, ReactNode>; href?: string }[]; empty?: ReactNode; caption?: string }) {
  const template = cols.map((col) => col.width ?? "minmax(0,1fr)").join(" ");
  if (!rows.length) return <>{empty ?? null}</>;
  const primary = cols.find((col) => col.primary) ?? cols[0]!;
  const rest = cols.filter((col) => col !== primary);
  return (
    <div role="table" aria-label={caption} className="text-sm">
      <div role="row" className="hidden gap-3 border-b pb-2 text-xs text-muted-foreground md:grid" style={{ gridTemplateColumns: template }}>
        {cols.map((col) => (
          <div key={col.key} role="columnheader" className={cn("truncate", col.align === "end" && "text-end")}>
            {col.label}
          </div>
        ))}
      </div>
      <div className="divide-y">
        {rows.map((r) => {
          const body = (
            <>
              <div className="hidden min-h-10 items-center gap-3 py-2 md:grid" style={{ gridTemplateColumns: template }}>
                {cols.map((col) => (
                  <div key={col.key} role="cell" className={cn("min-w-0 truncate tabular-nums", col.align === "end" && "text-end")}>
                    {r.cells[col.key]}
                  </div>
                ))}
              </div>
              <div className="py-2.5 md:hidden">
                <div className="truncate font-medium">{r.cells[primary.key]}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                  {rest.map((col) => (
                    <span key={col.key} className="min-w-0">
                      {col.label} <span className="text-foreground">{r.cells[col.key]}</span>
                    </span>
                  ))}
                </div>
              </div>
            </>
          );
          return r.href ? (
            <Link key={r.key} role="row" href={r.href} className="-mx-2 block rounded-md px-2 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
              {body}
            </Link>
          ) : (
            <div key={r.key} role="row">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "No runs yet": a skeleton preview of the table and one sentence. */
export function EmptyPreview({ text, cols = 4 }: { text: string; cols?: number }) {
  return (
    <div className="relative">
      <div aria-hidden className="space-y-2.5 opacity-60">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {Array.from({ length: cols }, (_, j) => (
              <div key={j} className="h-2.5 rounded bg-muted" style={{ width: `${55 + ((i + j) * 13) % 40}%` }} />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={cn("font-mono text-[12px]", className)}>
      {children}
    </bdi>
  );
}
