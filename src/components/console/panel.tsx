"use client";
/**
 * The console's panel states (platform.md PLA-§4.5 "States", §4.7; design.md DES-§16.8): one frame for every block of
 * the overview (and the later console screens), and its four states besides the data:
 *   - loading: <PanelSkeleton rows={5} /> mirrors the final rows; shown after 150 ms (CSS), never a spinner;
 *   - empty:   <QuietEmpty text=… action=… />, one sentence and one action on a quiet surface (no aurora, no grain);
 *   - error:   <PanelError reference="1a2b3c4d" />, "This panel couldn't load", Retry (a `refresh()`), the reference;
 *   - stale:   the frame's footer says "Updated 2 min ago" in neutral once the data is older than two pulses.
 *
 *   <ConsolePanel title={t("console.feed.title")} at={feed.at} action={{ href: "/admin/queue", label: … }}>…</ConsolePanel>
 */
import { RotateCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { durationText } from "./format";
import { PrefetchLink } from "./prefetch-link";
import { useHydrated, useNow } from "./shell/context";
import { PULSE_MS } from "./shell/pulse-provider";
import styles from "./shell/console.module.css";

/** two missed pulses */
const STALE_AFTER_MS = 2 * PULSE_MS + 5_000;

export function ConsolePanel({
  title,
  at,
  action,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  /** when the panel's data was read (ISO); drives the stale note */
  at?: string | null;
  action?: { href: string; label: string } | null;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]", className)}>
      <div className="flex min-h-11 items-center gap-3 border-b border-[var(--c-hairline)] px-4">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.006em]">{title}</h2>
        {aside}
        {action && (
          <PrefetchLink
            href={action.href}
            className="shrink-0 rounded-[var(--r-chip)] px-1.5 py-0.5 text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:inline-flex max-md:min-h-11 max-md:items-center"
          >
            {action.label}
          </PrefetchLink>
        )}
      </div>
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
      {at && <StaleNote at={at} />}
    </div>
  );
}

/**
 * "Updated 2 min ago", only once the data is older than two pulses (neutral, never red); drawn after hydration only,
 * so a slow first load never hydrates a note the server did not draw.
 */
function StaleNote({ at }: { at: string }) {
  const t = useT();
  const now = useNow(15_000);
  const hydrated = useHydrated();
  const age = now - Date.parse(at);
  if (!hydrated || !(age > STALE_AFTER_MS)) return null;
  const d = durationText(age);
  return <p className="border-t border-[var(--c-hairline)] px-4 py-2 text-[11px] text-muted-foreground">{t("console.panel.updated", { ago: d ? t("console.time.ago", { d }) : t("console.time.now") })}</p>;
}

/** The error state of one panel: the others keep rendering. */
export function PanelError({ reference, compact }: { reference: string; compact?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="alert" className={cn("grid justify-items-start gap-2 px-4", compact ? "py-3" : "py-8")}>
      <p className="text-[13px] font-medium">{t("console.panel.error")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => router.refresh())}
          className="inline-flex h-[var(--ctl)] items-center gap-1.5 rounded-[var(--r-control)] px-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--border)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 max-md:h-11"
        >
          <RotateCwIcon aria-hidden="true" className={cn("size-3.5", pending && "opacity-50")} />
          {t("console.panel.retry")}
        </button>
        <span className="font-mono text-[11px] text-muted-foreground">
          <bdi dir="ltr">{t("console.panel.ref", { ref: reference })}</bdi>
        </span>
      </div>
    </div>
  );
}

/** A source that ships with a later track or release: said plainly, never a made-up zero. */
export function PanelUnavailable({ text }: { text?: string }) {
  const t = useT();
  return <p className="px-4 py-6 text-[13px] text-muted-foreground">{text ?? t("console.panel.unavailable")}</p>;
}

/** The quiet empty state: one sentence, at most one action, the panel's own surface. */
export function QuietEmpty({ text, note, action }: { text: string; note?: ReactNode; action?: { href: string; label: string } | null }) {
  return (
    <div className="grid justify-items-start gap-1 px-4 py-8">
      <p className="text-[13px] font-medium">{text}</p>
      {note && <p className="text-[12px] text-muted-foreground">{note}</p>}
      {action && (
        <PrefetchLink href={action.href} className="mt-1 text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          {action.label}
        </PrefetchLink>
      )}
    </div>
  );
}

/** Loading rows that mirror the panel's final rows (icon, a line, a short trailing value). */
export function PanelSkeleton({ title, rows, className }: { title: string; rows: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label={title} className={cn("flex min-w-0 flex-1 flex-col rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]", className)}>
      <div className="flex min-h-11 items-center border-b border-[var(--c-hairline)] px-4">
        <span className="text-[13px] font-semibold text-muted-foreground">{title}</span>
      </div>
      <div className={cn(styles.skeleton, "grid gap-0 px-4 py-1.5")}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-[calc(var(--row)+8px)] items-center gap-3">
            <div className={cn(styles.bone, "size-4 shrink-0")} />
            <div className={cn(styles.bone, "h-3")} style={{ width: `${62 - ((i * 13) % 30)}%` }} />
            <div className={cn(styles.bone, "ms-auto h-3 w-12 shrink-0")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Six tile-shaped bones for the KPI row. */
export function KpiSkeleton() {
  return (
    <div aria-busy="true" className={cn(styles.skeleton, "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6")}>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="grid min-h-[104px] content-start gap-2.5 rounded-[var(--r-card)] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          <div className={cn(styles.bone, "h-3 w-2/3")} />
          <div className={cn(styles.bone, "h-6 w-1/2")} />
          <div className={cn(styles.bone, "h-3 w-4/5")} />
        </div>
      ))}
    </div>
  );
}
