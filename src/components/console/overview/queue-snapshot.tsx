"use client";
/**
 * The overview's queue snapshot (platform.md PLA-§5.5, §3.5): the tab counts, the SLA tile (median decision time with
 * its n, the oldest wait, the rows past the target) and the five oldest Review rows (risk score, store, waiting), with
 * "Open approvals". Every count links to its tab; a target that is not set is never shown as a promise.
 *
 *   <QueueSnapshotPanel data={await queueSnapshotBlock(ctx)} at={…} />
 */
import { useT } from "@/lib/i18n/admin/client";
import type { QueueSnapshotBlock } from "@/lib/platform/overview";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { compactCount, minutesText } from "../format";
import { ConsolePanel, QuietEmpty } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { consoleUrl } from "@/lib/platform/console-url";

const TABS = ["review", "fast", "hold", "needs_info", "requests", "snoozed"] as const;

/** The risk score as a number in a ring tinted by its band (text label next to it: never colour alone). */
function ScoreRing({ score, band }: { score: number; band: string }) {
  const tone = band === "fast" ? "oklch(0.6 0.12 160)" : band === "hold" ? "oklch(0.7 0.12 95)" : band === "reject_candidate" ? "oklch(0.58 0.18 17)" : "color-mix(in oklch, var(--foreground) 18%, transparent)";
  return (
    <span aria-hidden="true" className="num inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ boxShadow: `inset 0 0 0 2px ${tone}` }}>
      {score}
    </span>
  );
}

export function QueueSnapshotPanel({ data, at }: { data: QueueSnapshotBlock; at: string }) {
  const t = useT();
  const { counts, sla } = data.snapshot;
  const median = minutesText(sla.medianDecisionMin);
  const oldest = minutesText(sla.oldestWaitingMin);
  return (
    <ConsolePanel title={t("console.snapshot.title")} at={at} action={{ href: consoleUrl("/queue"), label: t("console.snapshot.open") }}>
      <div className="grid grid-cols-3 gap-px border-b border-[var(--c-hairline)] bg-[var(--c-hairline)] sm:grid-cols-6">
        {TABS.map((tab) => {
          const n = counts[tab] ?? 0;
          const shown = compactCount(n);
          return (
            <PrefetchLink key={tab} href={consoleUrl(`/queue?tab=${tab}`)} className="grid gap-0.5 bg-card px-3 py-2.5 outline-none transition-colors duration-[var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset">
              <span className="truncate text-[11px] text-muted-foreground">{t(`console.snapshot.tab.${tab}`)}</span>
              <span title={shown.exact} className={cn("num text-[18px] leading-tight font-semibold tracking-[-0.01em]", n === 0 && "text-muted-foreground")}>
                {shown.text}
              </span>
            </PrefetchLink>
          );
        })}
      </div>

      <div className="grid gap-x-6 gap-y-1 px-4 py-3 text-[12px] text-muted-foreground sm:grid-cols-2">
        <p className="num truncate">{median && sla.n > 0 ? t("console.snapshot.median", { time: median, n: sla.n }) : t("console.snapshot.median_none")}</p>
        <p className="num truncate">
          {oldest ? t("console.snapshot.oldest", { age: oldest }) : t("console.kpi.waiting_none")}
          {sla.pastSla ? <span className="ms-2 font-medium text-[oklch(0.45_0.09_95)] dark:text-[oklch(0.85_0.1_95)]">{t("console.snapshot.past", { count: sla.pastSla })}</span> : null}
        </p>
      </div>

      {data.oldest.length === 0 ? (
        <QuietEmpty text={t("console.empty.queue")} />
      ) : (
        <div className="border-t border-[var(--c-hairline)]">
          <h3 className="px-4 pt-2.5 pb-1 text-[11px] font-medium text-muted-foreground">{t("console.snapshot.oldest_rows")}</h3>
          <ul className="pb-1.5">
            {data.oldest.map((r) => (
              <li key={r.id}>
                <PrefetchLink href={consoleUrl(`/queue?tab=review&r=${r.id}`)} className="flex min-h-[calc(var(--row)+8px)] min-w-0 items-center gap-3 px-4 py-1 outline-none transition-colors duration-[var(--dur-1)] hover:bg-accent focus-visible:bg-accent max-md:min-h-11">
                  <ScoreRing score={r.score} band={r.band} />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-[13px] font-medium">{r.store.name}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                      {r.store.handle && (
                        <bdi dir="ltr" className="truncate">
                          @{r.store.handle}
                        </bdi>
                      )}
                      <span className="shrink-0">{t(`console.band.${r.band}`)}</span>
                    </span>
                  </span>
                  <Ago iso={r.waitingSince} className="num shrink-0 text-[12px] text-muted-foreground" />
                </PrefetchLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ConsolePanel>
  );
}
