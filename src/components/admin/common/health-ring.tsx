"use client";
/**
 * HealthRing (P2 SHELL; platform.md PLA-§22.12, §22.16, §6.3, PD61, PD67; docs/STORE-SAAS.md §I.7): the Store Health
 * score in tabular numerals inside a ring whose stroke is tinted by band (`healthRingView`, ./honest.ts): ≥ 80 jade,
 * 50-79 neutral, 30-49 yellow, < 30 crimson. Sizes 40 and 56 are the ring alone (lists, the topbar); 96 adds the
 * title, when it was checked and "Recompute now". While `score` is null (or impossible) it is the neutral computing
 * state, never a number. The stroke draws once on load (240 ms, ease-out; reduced motion: a fade), never again.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). `onRecompute` (owner side, 6 per hour per store)
 * shows the button; `dirty` (a change since the last check) shows "Recomputing" instead of the time.
 */
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useState, type CSSProperties, type ReactElement } from "react";
import "@/components/admin/styles/primitives.css";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { FreshnessDot } from "./freshness-dot";
import { healthRingView, type HealthBand } from "./honest";
import { ringGeometry } from "./primitive-logic";
import { FOCUS_RING, TOUCH } from "./ui-classes";

export interface HealthRingProps {
  score: number | null;
  attention: 0 | 1 | 2 | 3;
  size: 40 | 56 | 96;
  computedAt: string | null;
  dirty?: boolean;
  surface: "tenant" | "console";
  onRecompute?(): Promise<void>;
}

const BAND: Record<HealthBand, string> = { good: "text-success", fair: "text-muted-foreground", low: "text-warn", poor: "text-destructive" };
const NUMBER: Record<40 | 56 | 96, string> = { 40: "text-[13px]", 56: "text-base", 96: "text-[28px] tracking-[-0.015em]" };
/** a health check older than a day is out of date (the scheduler recomputes far more often) */
const STALE_MS = 24 * 3_600_000;

export function HealthRing(p: HealthRingProps): ReactElement | null {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const view = healthRingView(p);
  const g = ringGeometry(p.size);
  const share = view.score === null ? 0 : view.score / 100;
  const label = view.score === null ? `${t("health.title")}: ${t("health.computing")}` : `${t("health.title")}: ${t("health.score", { score: view.score })}`;
  const details = p.size === 96 || !!p.onRecompute;
  const ring = (
    <div role="img" aria-label={label} className="relative shrink-0" style={{ width: p.size, height: p.size }}>
      <svg width={p.size} height={p.size} viewBox={`0 0 ${p.size} ${p.size}`} className="-rotate-90 rtl:-scale-x-100" aria-hidden="true">
        <circle
          cx={p.size / 2}
          cy={p.size / 2}
          r={g.r}
          fill="none"
          stroke="currentColor"
          strokeWidth={g.stroke}
          className="text-muted"
          strokeDasharray={view.score === null ? `${g.stroke * 0.9} ${g.stroke * 1.4}` : undefined}
        />
        {view.band && share > 0 && (
          <circle
            cx={p.size / 2}
            cy={p.size / 2}
            r={g.r}
            fill="none"
            stroke="currentColor"
            strokeWidth={g.stroke}
            strokeLinecap="round"
            strokeDasharray={g.circumference}
            strokeDashoffset={g.circumference * (1 - share)}
            style={{ "--ring-len": `${g.circumference}` } as CSSProperties}
            className={cn("adm-ring-draw", BAND[view.band])}
          />
        )}
      </svg>
      <span aria-hidden="true" className={cn("absolute inset-0 grid place-items-center leading-none font-semibold tabular-nums", NUMBER[p.size])}>
        {view.score ?? <span className="text-muted-foreground">·</span>}
      </span>
    </div>
  );
  if (!details) {
    return (
      <span data-attention={p.attention} data-size={p.size} data-surface={p.surface} data-band={view.band ?? "computing"} className="inline-flex">
        {ring}
      </span>
    );
  }
  return (
    <div data-attention={p.attention} data-size={p.size} data-surface={p.surface} data-band={view.band ?? "computing"} className="flex items-center gap-4">
      {ring}
      <div className="grid min-w-0 gap-1">
        <p className="text-[13px] font-medium text-foreground">{t("health.title")}</p>
        {view.score === null ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{t("health.computing")}</p>
        ) : p.dirty || busy ? (
          <p className="text-xs text-muted-foreground">{t("health.recomputing")}</p>
        ) : (
          <FreshnessDot at={p.computedAt} staleAfterMs={STALE_MS} label={t("health.title")} />
        )}
        {p.onRecompute && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || p.dirty}
            aria-busy={busy || undefined}
            className={cn("-ms-2 w-fit gap-1.5 text-muted-foreground", FOCUS_RING, TOUCH)}
            onClick={async () => {
              setBusy(true);
              try {
                await p.onRecompute?.();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <RefreshCwIcon aria-hidden="true" />}
            {t("health.recompute")}
          </Button>
        )}
      </div>
    </div>
  );
}
