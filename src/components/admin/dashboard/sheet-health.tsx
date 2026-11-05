"use client";

import { AlertTriangleIcon, ArrowUpRightIcon, CheckIcon, Loader2Icon, RefreshCwIcon, SheetIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SheetHealth } from "@/lib/admin-data/dashboard";
import { formatNumber } from "@/lib/markets/money";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { StatusChip } from "../common/status-chip";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { runSheetSync } from "../lib/sheets-client";
import { useStore } from "../shell/store-context";

/**
 * Google Sheets sync health as a KPI-sized tile (R1.0's Sheets queue, the integration tiles' pattern of PLA-§22.17
 * item 8): state chip, three counters separated by hairlines, and one footer line (the problem, or the connected
 * sheet) with "open" and "sync now". In the viewer's language.
 */
export function SheetHealthCard({ health, canSync, className }: { health: SheetHealth; canSync: boolean; className?: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const store = useStore();
  const [syncing, setSyncing] = useState(false);
  const stuck = health.enabled && health.oldestPendingMinutes !== null && health.oldestPendingMinutes > 15;

  const state = !health.configured
    ? { label: t("shell.dash.sheet.state.setup"), tone: "warn" as const }
    : !health.connected
      ? { label: t("shell.dash.sheet.state.not_connected"), tone: "neutral" as const }
      : !health.enabled
        ? { label: t("shell.dash.sheet.state.paused"), tone: "warn" as const }
        : health.failed > 0 || stuck
          ? { label: t("shell.dash.sheet.state.attention"), tone: "red" as const }
          : { label: t("shell.dash.sheet.state.healthy"), tone: "emerald" as const };

  // the queue's own error text is the sheet API's (English); the sentence the seller reads is ours
  const problem = stuck
    ? t("shell.dash.sheet.stuck", { count: health.oldestPendingMinutes ?? 0 })
    : health.failed > 0
      ? t("shell.dash.sheet.failed_line", { count: health.failed })
      : null;

  return (
    <section className={cn("adm-rise flex min-h-[9.5rem] flex-col justify-between gap-4 rounded-[var(--r-card)] bg-card p-5 text-card-foreground ring-1 ring-border ring-inset", className)} aria-label={t("shell.dash.sheet.title")}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-[var(--r-chip)] bg-success-soft text-success-ink">
            <SheetIcon className="size-3.5" />
          </span>
          {t("shell.dash.sheet.title")}
        </span>
        <StatusChip tone={state.tone}>{state.label}</StatusChip>
      </div>

      {health.connected ? (
        <>
          <dl className="grid grid-cols-3 divide-x divide-border rtl:divide-x-reverse">
            <Metric label={t("shell.dash.sheet.synced")} value={formatNumber(health.synced, locale, 0)} />
            <Metric label={t("shell.dash.sheet.pending")} value={formatNumber(health.pending, locale, 0)} warn={stuck} />
            <Metric label={t("shell.dash.sheet.failed")} value={formatNumber(health.failed, locale, 0)} danger={health.failed > 0} />
          </dl>
          <div className="flex min-w-0 items-center gap-2">
            {problem ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    // the Sheets screen is integrations.manage's (§I.1); everyone with this card can open the failed orders
                    href={store.href(health.failed > 0 || !store.can("integrations.manage") ? "/orders?sheet=failed" : "/integrations/sheets")}
                    className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-warn-ink hover:underline", FOCUS_RING)}
                  >
                    <AlertTriangleIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{problem}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{problem}</TooltipContent>
              </Tooltip>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                <CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
                <span className="truncate">{health.enabled ? t("shell.dash.sheet.writing", { title: health.title ?? "Commandes" }) : t("shell.dash.sheet.paused_line")}</span>
              </span>
            )}
            {health.url && (
              <Button asChild variant="ghost" size="icon" className={cn("rounded-full", FOCUS_RING, TOUCH)} aria-label={t("shell.dash.sheet.open")} title={t("shell.dash.sheet.open")}>
                <a href={health.url} target="_blank" rel="noopener noreferrer">
                  <ArrowUpRightIcon aria-hidden="true" className="rtl:-scale-x-100" />
                </a>
              </Button>
            )}
            {canSync && (
              <Button
                variant="outline"
                size="sm"
                className={cn("shrink-0 rounded-full", FOCUS_RING, TOUCH)}
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    if (await runSheetSync()) router.refresh();
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                {syncing ? <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <RefreshCwIcon aria-hidden="true" />}
                {t("shell.dash.sheet.sync")}
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground">{health.configured ? t("shell.dash.sheet.connect_lead") : t("shell.dash.sheet.unavailable")}</p>
          {store.can("integrations.manage") && health.configured && (
            <Button asChild size="sm" variant="outline" className={cn("rounded-full", FOCUS_RING, TOUCH)}>
              <Link href={store.href("/integrations/sheets")}>{t("shell.dash.sheet.setup")}</Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, warn, danger }: { label: string; value: string; warn?: boolean; danger?: boolean }) {
  return (
    <div className="grid gap-1 px-4 first:ps-0 last:pe-0">
      {/* label first in the DOM (dt before dd), shown under the number */}
      <dt className="order-last text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-[1.6rem] leading-none font-semibold tracking-[-0.02em] tabular-nums", danger && "text-destructive", warn && "text-warn-ink")}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
