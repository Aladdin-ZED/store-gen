"use client";
/**
 * The Google Sheets backlog (OPE-§28.1, §19.8 "Last runs"): orders waiting for an append, synced orders with a change
 * still to write, failed rows, the oldest waiting order, and the last 20 runs as a compact table (when, added,
 * updated, brought back, calls, result in plain words).
 */
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import type { HubSheets } from "@/lib/integrations/hub.server";
import { causeKey } from "@/lib/integrations/causes";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { useStore } from "../shell/store-context";
import { age, clock, num } from "./hub-format";
import { useNow } from "./hub-states";
import { StateBadge } from "./state-badge";

export function BacklogCard({ sheets, now: serverNow, canOpen }: { sheets: HubSheets; now: number; canOpen: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const now = useNow(serverNow);
  const { backlog, runs } = sheets;

  return (
    <section aria-labelledby="int-backlog-title" className="adm-surface grid gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="int-backlog-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
              {t("int.backlog.title")}
            </h2>
            {!sheets.connected ? (
              <StateBadge tone="neutral">{t("int.backlog.notConnected")}</StateBadge>
            ) : !sheets.enabled ? (
              <StateBadge tone="warn">{t("int.backlog.paused")}</StateBadge>
            ) : null}
          </div>
          <p className="text-sm text-pretty text-muted-foreground">{t("int.backlog.lead")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {backlog.failed > 0 && store.can("orders.read") && (
            <Link href={store.href("/orders?sheet=failed")} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-sm font-medium text-destructive hover:bg-destructive/[0.06] sm:min-h-8">
              {t("int.backlog.seeFailed")}
            </Link>
          )}
          {canOpen && (
            <Link href={store.href("/integrations/sheets")} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground sm:min-h-8">
              {t("int.link.sheets")}
              <ArrowUpRightIcon className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
            </Link>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-foreground/[0.06] ring-1 ring-foreground/[0.06] sm:grid-cols-4">
        <Count label={t("int.backlog.pending")} value={num(backlog.pending, locale)} />
        <Count label={t("int.backlog.dirty")} value={num(backlog.dirty, locale)} />
        <Count label={t("int.backlog.failed")} value={num(backlog.failed, locale)} danger={backlog.failed > 0} />
        <Count label={t("int.backlog.oldest")} value={backlog.oldestPendingAt ? age(backlog.oldestPendingAt, locale, now) : t("int.health.none")} muted={!backlog.oldestPendingAt} />
      </dl>

      <div className="grid gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t("int.backlog.runs")}</h3>
        {runs.length === 0 ? (
          <p className="rounded-xl bg-foreground/[0.03] px-3 py-3 text-sm text-muted-foreground">{t("int.backlog.noRuns")}</p>
        ) : (
          <div className="adm-scroll -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-start text-[0.7rem] font-medium text-muted-foreground">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t("int.backlog.col.when")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("int.backlog.col.appended")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("int.backlog.col.updated")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("int.backlog.col.pulled")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("int.backlog.col.calls")}</th>
                  <th scope="col" className="py-2 ps-3 text-start font-medium">{t("int.backlog.col.result")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/[0.05]">
                {runs.map((r) => (
                  <tr key={r.at} className="tabular-nums">
                    <td className="py-2 pe-3 whitespace-nowrap text-foreground/80" suppressHydrationWarning>
                      <bdi dir="ltr" suppressHydrationWarning>{clock(r.at, locale, store.timeZone)}</bdi>
                    </td>
                    <td className="px-3 py-2 text-end">{num(r.appended, locale)}</td>
                    <td className="px-3 py-2 text-end">{num(r.updated, locale)}</td>
                    <td className="px-3 py-2 text-end">{num(r.pulled, locale)}</td>
                    <td className="px-3 py-2 text-end text-muted-foreground">{num(r.calls, locale)}</td>
                    <td className={cn("max-w-[18rem] truncate py-2 ps-3", r.ok ? "text-muted-foreground" : "text-destructive")}>
                      {r.ok ? t("int.backlog.ok") : t(causeKey(r.error) ?? "int.cause.unknown")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Count({ label, value, danger = false, muted = false }: { label: string; value: string; danger?: boolean; muted?: boolean }) {
  return (
    <div className="grid gap-1 bg-card px-4 py-3">
      <dt className="truncate text-[0.7rem] font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tracking-[-0.02em] tabular-nums", danger && "text-destructive", muted && "text-base font-medium text-muted-foreground")} suppressHydrationWarning>
        {value}
      </dd>
    </div>
  );
}
