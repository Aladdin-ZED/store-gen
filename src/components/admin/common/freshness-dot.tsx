"use client";
/**
 * FreshnessDot (P2 SHELL; platform.md PLA-§22.12, §4.7 rule 8, §22.16, PD78; design.md DES-§16.13): "Updated 2 min
 * ago" as text plus a 6 px dot that carries real state only: success while `at` is within `staleAfterMs`, neutral once
 * older ("Out of date" for assistive tech), and no time at all while `at` is null ("Not updated yet"). The relative
 * time re-renders every 30 s; nothing pulses or loops.
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). `label` names what is fresh ("Store health").
 * The first render uses the server's clock; the relative text is exempt from the hydration check and the client's
 * clock takes over at once.
 */
import { useEffect, useState, type ReactElement } from "react";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { freshness } from "./primitive-logic";

export interface FreshnessDotProps {
  at: string | null;
  staleAfterMs: number;
  label: string;
}

const TICK_MS = 30_000;

export function FreshnessDot(p: FreshnessDotProps): ReactElement | null {
  const t = useT();
  const locale = useAdminLocale();
  // the server's clock for the first paint (the text is suppressed from hydration checks), then the viewer's
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const f = freshness(p.at, p.staleAfterMs, now, locale);
  const fresh = f.fresh;
  return (
    <span data-stale-after-ms={p.staleAfterMs} data-fresh={fresh ? "" : undefined} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", fresh ? "bg-success" : "bg-muted-foreground/40")} />
      <span className="sr-only">{p.label}: </span>
      {p.at === null ? (
        <span>{t("shell.fresh.never")}</span>
      ) : (
        <time dateTime={p.at} className="tabular-nums" suppressHydrationWarning>
          {t(f.key, f.vars)}
        </time>
      )}
      {!fresh && p.at !== null && <span className="sr-only">. {t("shell.fresh.stale")}</span>}
    </span>
  );
}
