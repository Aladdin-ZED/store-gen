"use client";
/**
 * Needs attention (platform.md PLA-§5.3, PL-05; PD68, PD70): at most 20 rows, most severe first. Row anatomy: the
 * severity icon with its text label (Danger / Warning / Info, never a bare coloured dot), the sentence
 * `console.attention.<code>` with its vars (handles isolated left to right), the store chip when there is one, "Since
 * 2 h ago", and one action. Empty: "Nothing needs you right now" with the time of the last check.
 *
 *   <NeedsAttentionPanel data={await needsAttention(ctx)} />
 */
import { AlertTriangleIcon, ArrowUpRightIcon, InfoIcon, OctagonAlertIcon } from "lucide-react";
import { Monogram } from "@/components/admin/common/monogram";
import { useT } from "@/lib/i18n/admin/client";
import type { AttentionLevel, NeedsAttention } from "@/lib/platform/overview";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { absoluteTime } from "../format";
import { ConsolePanel, QuietEmpty } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { useRichT } from "../rich";
import { useConsoleShell } from "../shell/context";

const LEVEL: Record<AttentionLevel, { icon: typeof InfoIcon; tone: string }> = {
  danger: { icon: OctagonAlertIcon, tone: "text-[var(--c-danger-ink)] bg-[var(--c-danger-soft)]" },
  warn: { icon: AlertTriangleIcon, tone: "text-[oklch(0.45_0.09_95)] bg-[var(--c-warn-soft)] dark:text-[oklch(0.85_0.1_95)]" },
  info: { icon: InfoIcon, tone: "text-[var(--c-info-ink)] bg-[var(--c-info-soft)]" },
};

export function SeverityLabel({ level }: { level: AttentionLevel }) {
  const t = useT();
  const { icon: Icon, tone } = LEVEL[level];
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full ps-1.5 pe-2 text-[11px] font-medium", tone)}>
      <Icon aria-hidden="true" className="size-3" />
      {t(`console.attention.level.${level}`)}
    </span>
  );
}

export function NeedsAttentionPanel({ data, at }: { data: NeedsAttention; at: string }) {
  const t = useT();
  const rich = useRichT();
  const { timeZone } = useConsoleShell();
  return (
    <ConsolePanel title={t("console.attention.title")} at={at} action={data.more ? { href: "/admin/stores?attention=1", label: t("console.attention.see_all") } : null}>
      {data.rows.length === 0 ? (
        <QuietEmpty text={t("console.attention.empty")} note={t("console.attention.checked", { time: absoluteTime(data.checkedAt, timeZone) })} />
      ) : (
        <ul className="divide-y divide-[var(--c-hairline)]">
          {data.rows.map((r, i) => (
            <li key={`${r.code}:${r.store?.id ?? ""}:${i}`} className="group flex min-w-0 items-start gap-3 px-4 py-2.5 max-md:flex-col max-md:items-stretch max-md:gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="pt-px">
                  <SeverityLabel level={r.level} />
                </span>
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className="min-w-0 text-[13px] leading-snug text-pretty">{rich(`console.attention.${r.code}`, r.vars)}</p>
                  <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    {r.store && (
                      <PrefetchLink href={`/admin/stores/${r.store.id}`} className="inline-flex min-w-0 items-center gap-1.5 rounded-[var(--r-chip)] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                        <Monogram name={r.store.name || r.store.handle || r.store.id} seed={r.store.id} size={24} />
                        {r.store.handle ? (
                          <bdi dir="ltr" className="truncate">
                            @{r.store.handle}
                          </bdi>
                        ) : (
                          <span className="truncate">{r.store.name}</span>
                        )}
                      </PrefetchLink>
                    )}
                    {r.since && <Ago iso={r.since} template="console.attention.since" className="num" />}
                  </p>
                </div>
              </div>
              <PrefetchLink
                href={r.href}
                className="inline-flex h-[var(--ctl)] shrink-0 items-center gap-1 self-center rounded-[var(--r-control)] px-2.5 text-[12px] font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-colors duration-[var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11 max-md:justify-center max-md:self-stretch"
              >
                {t(`console.attention.action.${r.action}`)}
                <ArrowUpRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground rtl:-scale-x-100" />
              </PrefetchLink>
            </li>
          ))}
        </ul>
      )}
    </ConsolePanel>
  );
}
