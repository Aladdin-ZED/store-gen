"use client";
/**
 * The approval queue's sticky header (platform.md PLA-§3.5 "Queue header"): the seven tabs with their counts (Review,
 * Fast lane, Hold, Needs info, Requests, Snoozed, Decided), the SLA tile (median time to a decision over 7 days with
 * its n, the oldest wait, the rows past `signup.slaHours` in yellow, nothing promised while the target is unset) and
 * the search field (store name, handle, or an exact e-mail; `/` focuses it). Tabs and search live in the URL.
 *
 *   <QueueHeader tab="review" counts={list.counts} sla={list.sla} q={q} slaHours={24} truncated={false} />
 */
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/admin/client";
import type { QueueTab, SlaTile } from "@/lib/platform/queue-rules";
import { cn } from "@/lib/utils";
import { compactCount, minutesText } from "../format";
import { PrefetchLink } from "../prefetch-link";
import { queueHref, TAB_ORDER } from "./queue-nav";

function SlaFacts({ sla, slaHours }: { sla: SlaTile; slaHours: number | null }) {
  const t = useT();
  const median = minutesText(sla.medianDecisionMin);
  const oldest = minutesText(sla.oldestWaitingMin);
  return (
    <dl className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted-foreground">{t("console.queue.sla.median")}</dt>
        <dd className="num font-medium">{median && sla.n > 0 ? t("console.queue.sla.median_value", { time: median, n: sla.n }) : t("console.queue.sla.none")}</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-muted-foreground">{t("console.queue.sla.oldest")}</dt>
        <dd className="num font-medium">{oldest ?? t("console.queue.sla.nothing_waits")}</dd>
      </div>
      {slaHours !== null && sla.pastSla !== null && (
        <div className={cn("flex items-baseline gap-1.5 rounded-[var(--r-chip)] px-1.5 py-0.5", sla.pastSla > 0 && "bg-[var(--c-warn-soft)]")}>
          <dt className={cn(sla.pastSla > 0 ? "text-[oklch(0.45_0.09_95)] dark:text-[oklch(0.86_0.11_95)]" : "text-muted-foreground")}>{t("console.queue.sla.past", { hours: slaHours })}</dt>
          <dd className={cn("num font-semibold", sla.pastSla > 0 && "text-[oklch(0.42_0.09_95)] dark:text-[oklch(0.88_0.11_95)]")}>{sla.pastSla}</dd>
        </div>
      )}
    </dl>
  );
}

/** The search field: typed text goes to the URL after a short pause (the list streams in under the old one). */
function QueueSearch({ q, onSearch }: { q: string; onSearch(q: string): void }) {
  const t = useT();
  const [value, setValue] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // a URL change (back, Clear filters) puts its query in the field
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    setValue(q);
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const push = (v: string, now = false) => {
    if (timer.current) clearTimeout(timer.current);
    const go = () => onSearch(v.trim());
    if (now) go();
    else timer.current = setTimeout(go, 280);
  };
  return (
    <div className="relative w-full md:w-[280px]">
      <label htmlFor="queue-search" className="sr-only">
        {t("console.queue.search.label")}
      </label>
      <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        id="queue-search"
        data-page-search
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={t("console.queue.search.placeholder")}
        onChange={(e) => {
          setValue(e.target.value);
          push(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") push(value, true);
          if (e.key === "Escape") {
            if (value) {
              setValue("");
              push("", true);
            } else (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background ps-8 pe-8 text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none transition-shadow duration-[var(--dur-1)] placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] max-md:h-11 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label={t("console.queue.search.clear")}
          onClick={() => {
            setValue("");
            push("", true);
          }}
          className="absolute end-1 top-1/2 inline-grid size-6 -translate-y-1/2 place-items-center rounded-[var(--r-chip)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-9"
        >
          <XIcon aria-hidden="true" className="size-3.5" />
        </button>
      ) : (
        <kbd aria-hidden="true" className="pointer-events-none absolute end-2 top-1/2 hidden -translate-y-1/2 rounded-[4px] border border-border px-1 font-mono text-[10px] text-muted-foreground md:block">
          /
        </kbd>
      )}
    </div>
  );
}

export function QueueHeader({
  tab,
  counts,
  sla,
  slaHours,
  q,
  truncated,
  onSearch,
}: {
  tab: QueueTab;
  counts: Record<QueueTab, number>;
  sla: SlaTile;
  slaHours: number | null;
  q: string;
  truncated: boolean;
  onSearch(q: string): void;
}) {
  const t = useT();
  return (
    <div className="grid gap-3 border-b border-[var(--c-hairline)] bg-background px-4 pt-4 md:px-6 xl:px-6 xl:pt-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{t("console.queue.page_title")}</h1>
          <SlaFacts sla={sla} slaHours={slaHours} />
        </div>
        <QueueSearch q={q} onSearch={onSearch} />
      </div>
      <nav aria-label={t("console.queue.tabs")} className="-mx-1 -mb-px flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {TAB_ORDER.map((id) => {
          const n = counts[id] ?? 0;
          const c = compactCount(n);
          const on = id === tab;
          return (
            <PrefetchLink
              key={id}
              href={queueHref(id, q)}
              replace
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-t-[var(--r-chip)] px-2.5 text-[13px] whitespace-nowrap outline-none transition-colors duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-inset max-md:h-11",
                on ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`console.queue.tab.${id}`)}
              <span title={c.exact} className={cn("num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-medium", on ? "bg-[var(--brand-soft)] text-[var(--c-brand-ink)]" : "bg-secondary text-muted-foreground", n === 0 && !on && "opacity-70")}>
                {c.text}
                {truncated && id !== "decided" ? "+" : ""}
              </span>
              {on && <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-[var(--brand)]" />}
            </PrefetchLink>
          );
        })}
      </nav>
    </div>
  );
}
