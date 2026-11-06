/**
 * Server-side pieces the ten Overview strips share (platform.md PLA-§7.3): the console translator, the frame of a
 * strip whose source is a later track's stub ("unavailable", never a made-up zero) or failed (its own error state with
 * the reference, the other nine unaffected), and the strip ids with their end links.
 *
 *   if (p.state !== "ok") return <StripNotOk strip="orders" title={tr("console.strip.orders")} p={p} end={…} />;
 */
import type { ReactNode } from "react";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { translator } from "@/lib/i18n/admin";
import type { Kpi } from "@/lib/orders/profile";
import type { Panel } from "@/lib/platform/panel";
import { rateLine } from "../rate";
import type { ProfileStrip } from "../tabs";
import { StripFrame } from "./frame";

export const tr = translator(CONSOLE_LOCALE);

export function StripNotOk({ strip, title, p, end }: { strip: ProfileStrip; title: string; p: Panel<unknown>; end: { href: string; label: string } | "r2" | null }) {
  return (
    <StripFrame strip={strip} title={title} at={p.at} end={end} summary={p.state === "error" ? tr("console.panel.error") : tr("console.strip.unavailable_short")}>
      <div className="-mx-4 -my-3">{p.state === "error" ? <PanelError compact reference={p.ref} /> : <PanelUnavailable />}</div>
    </StripFrame>
  );
}

/** A quiet empty line inside a strip (one sentence). */
export function StripEmpty({ text }: { text: string }) {
  return <p className="py-1 text-[13px] text-muted-foreground">{text}</p>;
}

/** A soft chip used inside strips. */
export function StripChip({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "warn" | "danger" | "success" | "brand"; title?: string }) {
  const tones = {
    neutral: "bg-secondary text-muted-foreground",
    warn: "bg-[var(--c-warn-soft)] text-foreground",
    danger: "bg-[var(--c-danger-soft)] text-[var(--c-danger-ink)]",
    success: "bg-[var(--c-success-soft)] text-[oklch(0.42_0.1_160)] dark:text-[oklch(0.82_0.1_160)]",
    brand: "bg-[color-mix(in_oklch,var(--brand)_10%,transparent)] text-[var(--c-brand-ink)]",
  } as const;
  return (
    <span title={title} className={`inline-flex h-6 max-w-full shrink-0 items-center gap-1 truncate rounded-[var(--r-chip)] px-2 text-[11.5px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** "38 % · n = 214", or "needs n ≥ 20" below the minimum sample (P4's Kpi). */
export const rateText = (k: Kpi | null | undefined): string => rateLine(tr, k);
