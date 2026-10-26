"use client";

import { AlertTriangleIcon, ArrowUpRightIcon, CheckIcon, Loader2Icon, RefreshCwIcon, SheetIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SheetHealth } from "@/lib/admin-data/dashboard";
import { cn } from "@/lib/utils";
import { StatusChip } from "../common/status-chip";
import { int } from "../lib/format";
import { runSheetSync } from "../lib/sheets-client";
import { useStore } from "../shell/store-context";

/**
 * Google Sheets sync health as a KPI-sized tile: state chip, three counters separated by hairlines,
 * and one footer line (the problem, or the connected sheet) with "open" and "sync now".
 */
export function SheetHealthCard({ health, canSync, className }: { health: SheetHealth; canSync: boolean; className?: string }) {
  const router = useRouter();
  const store = useStore();
  const [syncing, setSyncing] = useState(false);
  const stuck = health.enabled && health.oldestPendingMinutes !== null && health.oldestPendingMinutes > 15;

  const state = !health.configured
    ? { label: "Needs setup", tone: "warn" as const }
    : !health.connected
      ? { label: "Not connected", tone: "neutral" as const }
      : !health.enabled
        ? { label: "Paused", tone: "warn" as const }
        : health.failed > 0 || stuck
          ? { label: "Attention", tone: "red" as const }
          : { label: "Healthy", tone: "emerald" as const };

  const problem = stuck
    ? `Orders have waited ${health.oldestPendingMinutes} min to reach the sheet`
    : health.failed > 0
      ? (health.lastError ?? `${int(health.failed)} order${health.failed === 1 ? "" : "s"} didn't reach the sheet — open them to retry`)
      : null;

  return (
    <section className={cn("adm-surface adm-rise flex min-h-[9.5rem] flex-col justify-between gap-4 p-5", className)} aria-label="Google Sheets sync" style={{ ["--i" as string]: 4 }}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[0.8rem] font-medium text-muted-foreground">
          <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
            <SheetIcon className="size-3.5" />
          </span>
          Sheets sync
        </span>
        <StatusChip tone={state.tone} pulse={state.tone === "emerald"}>
          {state.label}
        </StatusChip>
      </div>

      {health.connected ? (
        <>
          <dl className="grid grid-cols-3 divide-x divide-foreground/[0.07]">
            <Metric label="In sheet" value={health.synced} />
            <Metric label="Queued" value={health.pending} warn={stuck} />
            <Metric label="Failed" value={health.failed} danger={health.failed > 0} />
          </dl>
          <div className="flex min-w-0 items-center gap-2">
            {problem ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={store.href(health.failed > 0 ? "/orders?sheet=failed" : "/integrations/sheets")}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-warn-ink hover:underline"
                  >
                    <AlertTriangleIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{problem}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{problem}</TooltipContent>
              </Tooltip>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
                <CheckIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">{health.enabled ? `Writing to “${health.title ?? "Commandes"}”` : "Paused — new orders wait in the queue"}</span>
              </span>
            )}
            {health.url && (
              <Button asChild variant="ghost" size="icon-sm" className="rounded-full" aria-label={`Open “${health.title ?? "sheet"}” in Google Sheets`} title="Open the sheet">
                <a href={health.url} target="_blank" rel="noopener noreferrer">
                  <ArrowUpRightIcon />
                </a>
              </Button>
            )}
            {canSync && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full"
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
                {syncing ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                Sync now
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted-foreground">
            {health.configured
              ? "Paste your sheet link once — orders flow in with statuses your agents can edit."
              : "Google Sheets isn't available on this platform yet."}
          </p>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href={store.href("/integrations/sheets")}>Set up Google Sheets</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, warn, danger }: { label: string; value: number; warn?: boolean; danger?: boolean }) {
  return (
    <div className="grid gap-1 px-4 first:ps-0 last:pe-0">
      {/* label first in the DOM (dt before dd), shown under the number */}
      <dt className="order-last text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-[1.6rem] leading-none font-semibold tracking-[-0.02em] tabular-nums", danger && "text-destructive", warn && "text-warn-ink")}>
        {int(value)}
      </dd>
    </div>
  );
}
