"use client";
/**
 * UsageMeter (P2 SHELL; platform.md PLA-§22.12, §22.9, §22.10.4, §9, PD1; docs/STORE-SAAS.md §G.4): one quota of the
 * store as used / limit with a hairline bar, warning from `warnAt` (0.8 by default) of the limit and full at it;
 * `limit: null` = unlimited (no bar, "Unlimited"). The share is of the store's own limit only: never a platform-wide
 * percentage (MED-13).
 *
 * Props frozen at PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts). A client component: amounts are formatted in
 * the viewer's admin locale (bytes in binary steps, credits and counts as integers).
 */
import type { ReactElement } from "react";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { formatUsage, usageView } from "./primitive-logic";

export interface UsageMeterProps {
  label: string;
  used: number;
  limit: number | null;
  unit?: "bytes" | "count" | "credits";
  warnAt?: number /* 0.8 */;
}

const BAR = { ok: "bg-foreground/70", warn: "bg-warn", full: "bg-destructive" } as const;
const INK = { ok: "text-muted-foreground", warn: "text-warn-ink", full: "text-destructive-ink" } as const;

export function UsageMeter(p: UsageMeterProps): ReactElement | null {
  const t = useT();
  const locale = useAdminLocale();
  const unit = p.unit ?? "count";
  const view = usageView(p.used, p.limit, p.warnAt);
  const used = formatUsage(p.used, unit, locale);
  const amount = view.unlimited ? `${used} · ${t("shell.plan.unlimited")}` : t("shell.limit.used", { used, limit: formatUsage(p.limit ?? 0, unit, locale) });
  const state = view.tone === "full" ? t("shell.usage.full") : view.tone === "warn" ? t("shell.usage.near") : null;
  return (
    <div data-unit={unit} data-tone={view.tone} className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[13px] font-medium text-foreground">{p.label}</span>
        <span className={cn("text-xs tabular-nums", INK[view.tone])}>
          <bdi>{amount}</bdi>
          {state && <span className="ms-1.5 font-medium">{state}</span>}
        </span>
      </div>
      {!view.unlimited && (
        <div
          role="meter"
          aria-label={p.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view.pct ?? 0}
          aria-valuetext={view.pct === null ? amount : `${t("shell.usage.percent", { pct: view.pct })}. ${amount}`}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-[var(--dur-3)] ease-[var(--ease-out)] motion-reduce:transition-none", BAR[view.tone])}
            style={{ width: `${Math.round((view.share ?? 0) * 1000) / 10}%` }}
          />
        </div>
      )}
    </div>
  );
}
