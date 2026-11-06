/**
 * The release and ops flags (platform.md PLA-§12.2; server component): key, kind, description, type, default, the
 * rules summary ("pro plan → on · 20 % of stores → on"), overrides count, owner track, last change, archived. A row
 * opens the editor (`?tab=<tab>&edit=<key>`); archived rows open read-only. Kill switches never appear here.
 * `design_publish_gates` shows the design / budget overrides of 7 days as the cost of `warn`.
 *
 *   <FlagsTable rows={flags.release} tab="release" />
 */
import { ChevronRightIcon } from "lucide-react";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { translator } from "@/lib/i18n/admin";
import { valueLabel } from "@/lib/platform/flag-rules";
import type { FlagRowView, FlagTab } from "@/lib/platform/flags";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";

const tr = translator(CONSOLE_LOCALE);

const editHref = (tab: FlagTab, key: string) => `/admin/flags?tab=${tab}&edit=${encodeURIComponent(key)}`;

function Value({ row }: { row: FlagRowView }) {
  return <span className="inline-flex h-5 max-w-full items-center truncate rounded-[4px] bg-secondary px-1.5 font-mono text-[11.5px]">{valueLabel(row.type, row.value)}</span>;
}

export function FlagsTable({ rows, tab }: { rows: FlagRowView[]; tab: FlagTab }) {
  if (rows.length === 0) return <p className="rounded-[var(--r-card)] bg-card px-5 py-8 text-[13px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--c-hairline)]">{tr("console.flags.empty")}</p>;
  return (
    <ul className="divide-y divide-[var(--c-hairline)] overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      {rows.map((r) => (
        <li key={r.key}>
          <PrefetchLink
            href={editHref(tab, r.key)}
            className={cn(
              "group grid gap-1.5 px-4 py-3 outline-none hover:bg-[color-mix(in_oklch,var(--muted)_40%,transparent)] focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center md:gap-5",
              r.archived && "opacity-60",
            )}
          >
            <span className="grid min-w-0 gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <bdi dir="ltr" className="truncate font-mono text-[13px] font-medium">
                  {r.key}
                </bdi>
                <span className="text-[11px] text-muted-foreground">{tr(`console.flags.type.${r.type}`)}</span>
                {r.archived && <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-[11px] font-medium text-muted-foreground">{tr("console.flag.archived_chip")}</span>}
              </span>
              <span className="line-clamp-2 text-[12px] text-muted-foreground">{r.description}</span>
            </span>
            <span className="grid min-w-0 gap-1 text-[12px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-muted-foreground">{tr("console.flags.default")}</span>
                <Value row={r} />
              </span>
              {r.rulesSummary && (
                <span className="truncate text-muted-foreground" title={r.rulesSummary}>
                  {r.rulesSummary}
                </span>
              )}
              {r.overrides7d !== undefined && <span className="text-muted-foreground">{tr("console.flags.gate_cost", { count: r.overrides7d })}</span>}
            </span>
            <span className="flex items-center gap-3 text-[11.5px] text-muted-foreground md:justify-end">
              <span className="num">{tr("console.flags.overrides_n", { count: r.overrides })}</span>
              {r.ownerTrack && <span className="font-mono">{r.ownerTrack}</span>}
              {r.updatedAt && (
                <span className="hidden lg:inline">
                  {r.updatedBy ? `${r.updatedBy.name} · ` : ""}
                  <Ago iso={r.updatedAt} className="num" />
                </span>
              )}
              <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 opacity-50 group-hover:opacity-100 rtl:-scale-x-100" />
            </span>
          </PrefetchLink>
        </li>
      ))}
    </ul>
  );
}
