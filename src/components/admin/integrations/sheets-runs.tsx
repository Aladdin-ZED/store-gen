"use client";
/**
 * Last runs of the store's sheet (operations.md OPE-§19.8 "Last runs"): the last 20 `SheetsRunReport`s, newest first:
 * when (store time zone), what started it, rows added, rows updated, changes brought back, Google calls used and the
 * result in plain words (a cause code, never the raw error). The same "what happened" surface as the deliveries log,
 * for a target that is not an outbox kind. Wide on desktop; on a phone each run is one compact line pair.
 */
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { causeKey } from "@/lib/integrations/causes";
import type { SheetsRunReport } from "@/lib/sheets/history";
import { cn } from "@/lib/utils";
import { useStore } from "../shell/store-context";
import { clock, num } from "./hub-format";
import { InlineError } from "./hub-states";

export function SheetsRuns({ runs }: { runs: SheetsRunReport[] | null }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const result = (r: SheetsRunReport) => (r.ok ? t("int.backlog.ok") : t(causeKey(r.error) ?? "int.cause.unknown"));
  const trigger = (r: SheetsRunReport) => t(`int.sheets.runs.trigger.${r.trigger ?? "tick"}`);

  return (
    <section aria-labelledby="sheets-runs-title" className="adm-surface grid gap-4 p-4 sm:p-6">
      <div className="grid gap-1">
        <h2 id="sheets-runs-title" className="text-[0.95rem] font-semibold tracking-[-0.01em]">
          {t("int.backlog.runs")}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">{t("int.sheets.runs.lead")}</p>
      </div>
      {runs === null ? (
        <InlineError />
      ) : runs.length === 0 ? (
        <p className="rounded-xl bg-foreground/[0.03] px-3 py-3 text-sm text-muted-foreground">{t("int.backlog.noRuns")}</p>
      ) : (
        <>
          <table className="w-full text-sm max-md:hidden">
            <thead>
              <tr className="text-[0.7rem] text-muted-foreground">
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("int.backlog.col.when")}</th>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t("int.sheets.runs.col.trigger")}</th>
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
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{trigger(r)}</td>
                  <td className="px-3 py-2 text-end">{num(r.appended, locale)}</td>
                  <td className="px-3 py-2 text-end">{num(r.updated, locale)}</td>
                  <td className="px-3 py-2 text-end">{num(r.pulled, locale)}</td>
                  <td className="px-3 py-2 text-end text-muted-foreground">{num(r.calls, locale)}</td>
                  <td className={cn("max-w-[20rem] truncate py-2 ps-3", r.ok ? "text-muted-foreground" : "text-destructive")}>{result(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-foreground/[0.05] md:hidden">
            {runs.map((r) => (
              <li key={r.at} className="grid gap-1 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="whitespace-nowrap text-foreground/80 tabular-nums" suppressHydrationWarning>
                    <bdi dir="ltr" suppressHydrationWarning>{clock(r.at, locale, store.timeZone)}</bdi>
                    <span className="text-muted-foreground"> · {trigger(r)}</span>
                  </span>
                  <span className={cn("min-w-0 text-pretty", r.ok ? "text-muted-foreground" : "text-destructive")}>{result(r)}</span>
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("int.backlog.col.appended")} {num(r.appended, locale)} · {t("int.backlog.col.updated")} {num(r.updated, locale)} · {t("int.backlog.col.pulled")} {num(r.pulled, locale)} ·{" "}
                  {t("int.backlog.col.calls")} {num(r.calls, locale)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
