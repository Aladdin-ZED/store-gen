"use client";
/**
 * The stores list's table (platform.md PLA-§6.1 columns; TN-03 Internal chip; PD35, PD44): Monogram, name and
 * `@handle` (JetBrains Mono in an LTR isolate), "Internal" for plan `internal` or store #1, the status pill, mode and
 * plan, market and currency, the owner (first name + e-mail, masked for support and analyst by the server), the 24 px
 * health ring with its components in the tooltip, up to 3 health flags + "+n", orders in 7 days ("—" while pending or
 * before the first snapshot), last activity and created. Row click or Enter opens the profile; X (or the check box)
 * selects; the bulk bar offers Message and Export list only. Below 768 px the rows are cards with 44 px targets.
 *
 *   <StoresTable page={page} hasStores canMessage messageOne={false} csvHref="/api/admin/stores.csv?…" canInvite />
 */
import { CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Monogram } from "@/components/admin/common/monogram";
import { StatusPill } from "@/components/admin/common/status-pill";
import { useQueryState } from "@/components/admin/lib/use-query-state";
import { HEALTH_CAPS, type HealthGroup } from "@/lib/health/types";
import { useT } from "@/lib/i18n/admin/client";
import type { StoreListRow, StoresPage } from "@/lib/platform/stores-list";
import { cn } from "@/lib/utils";
import { isEditable, overlayOpen } from "../_compat/chords";
import { Ago } from "../ago";
import { MessageDialog } from "../messages/message-dialog";
import { QuietEmpty } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { Chip } from "../queue/queue-row";
import { ScoreRing } from "../ring";
import { useScreenKeys } from "../shell/context";
import { healthTint } from "../tints";
import { StoresBulkBar } from "./bulk-bar";
import { hasFilters } from "./filters";
import { consoleUrl } from "@/lib/platform/console-url";

const GROUPS = Object.keys(HEALTH_CAPS) as HealthGroup[];

function Check({ on, label, onToggle, big }: { on: boolean; label: string; onToggle(): void; big?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      data-row-check
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn("inline-grid shrink-0 place-items-center rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]", big ? "size-11" : "size-6")}
    >
      <span className={cn("inline-grid size-4 place-items-center rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--input)] transition-colors duration-[var(--dur-1)]", on && "bg-[var(--brand)] text-[var(--brand-foreground)] shadow-none")}>{on && <CheckIcon aria-hidden="true" className="size-3" strokeWidth={3} />}</span>
    </button>
  );
}

function Health({ h }: { h: StoreListRow["health"] }) {
  const t = useT();
  // not checked yet: a dashed empty ring the size of a scored one, the words in the tooltip and for screen readers
  if (!h)
    return (
      <span title={t("console.stores.health_none")} className="inline-grid size-6 place-items-center rounded-full border border-dashed border-[color-mix(in_oklch,var(--foreground)_22%,transparent)]">
        <span className="sr-only">{t("console.stores.health_none")}</span>
      </span>
    );
  // `components` are the penalty per group (src/lib/platform/health-score.ts): the tooltip shows the points kept
  const parts = GROUPS.map((g) => `${t(`console.hgroup.${g}`)} ${HEALTH_CAPS[g] - Math.min(HEALTH_CAPS[g], h.components[g] ?? 0)} / ${HEALTH_CAPS[g]}`);
  return <ScoreRing score={h.score} tint={healthTint(h.score)} size={24} title={[t("console.stores.health_title", { score: h.score }), ...parts].join("\n")} />;
}

/**
 * Up to three flag chips (most severe first) and "+n"; the table row keeps one line (`inline`: the first two chips,
 * the others counted in "+n" and named in its tooltip), the phone card wraps all three.
 */
function Flags({ row, inline }: { row: StoreListRow; inline?: boolean }) {
  const t = useT();
  if (!row.flags.length) return <span className="text-[12px] text-muted-foreground">—</span>;
  const shown = inline ? row.flags.slice(0, 2) : row.flags;
  const hidden = row.flags.length - shown.length + row.moreFlags;
  const rest = row.flags.slice(shown.length).map((f) => t(`console.hflag.${f.code}`));
  return (
    <span className={cn("flex min-w-0 items-center gap-1", inline ? "flex-nowrap overflow-hidden" : "flex-wrap")}>
      {shown.map((f) => (
        <Chip key={f.code} tint={f.severity >= 3 ? "crimson" : f.severity === 2 ? "yellow" : "neutral"} className={inline ? "min-w-0 shrink truncate" : undefined}>
          {t(`console.hflag.${f.code}`)}
        </Chip>
      ))}
      {hidden > 0 && (
        <span title={rest.length ? rest.join(", ") : undefined} className="num shrink-0 text-[11px] text-muted-foreground">
          {t("console.queue.more_flags", { count: hidden })}
        </span>
      )}
    </span>
  );
}

function StoreCell({ row }: { row: StoreListRow }) {
  const t = useT();
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Monogram name={row.name} seed={row.id} size={32} />
      <span className="grid min-w-0 gap-px">
        <span className="flex min-w-0 items-center gap-1.5">
          <PrefetchLink href={consoleUrl(`/stores/${row.id}`)} className="min-w-0 truncate rounded-[3px] text-[13px] font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]" onClick={(e) => e.stopPropagation()}>
            {row.name}
          </PrefetchLink>
          {row.internal && <Chip tint="neutral">{t("console.stores.internal")}</Chip>}
        </span>
        {row.handle && (
          <bdi dir="ltr" className="truncate font-mono text-[11.5px] text-muted-foreground">
            @{row.handle}
          </bdi>
        )}
      </span>
    </span>
  );
}

function Owner({ row }: { row: StoreListRow }) {
  const t = useT();
  if (!row.owner) return <span className="text-[12px] text-muted-foreground">—</span>;
  return (
    <span className="grid min-w-0 gap-px">
      <span className="truncate text-[12.5px]">
        {row.owner.firstName}
        {row.moreOwners > 0 && <span className="num ms-1 text-[11px] text-muted-foreground">{t("console.queue.more_flags", { count: row.moreOwners })}</span>}
      </span>
      <bdi dir="ltr" className="truncate text-[11.5px] text-muted-foreground">
        {row.owner.email}
      </bdi>
    </span>
  );
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("h-9 px-[var(--cell-x)] text-start text-[11.5px] font-medium whitespace-nowrap text-muted-foreground", className)}>{children}</th>;
}

export function StoresTable({
  page,
  hasStores,
  canMessage,
  messageOne,
  csvHref,
  canInvite,
}: {
  page: StoresPage;
  /** any store exists at all (the empty state's two sentences) */
  hasStores: boolean;
  canMessage: boolean;
  messageOne: boolean;
  csvHref: string | null;
  canInvite: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const query = useQueryState();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [messaging, setMessaging] = useState(false);
  const rows = page.rows;
  const picked = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const toggle = (id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));

  // a new page or filter: the selection belongs to the old rows
  const sig = rows.map((r) => r.id).join(",");
  const [seenSig, setSeenSig] = useState(sig);
  if (sig !== seenSig) {
    setSeenSig(sig);
    setSelected(new Set());
  }

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && selected.size && !isEditable(e.target) && !overlayOpen()) setSelected(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size]);

  useScreenKeys({
    title: t("console.keys.group.stores"),
    lines: [
      { label: t("console.keys.stores.open"), keys: ["Enter"] },
      { label: t("console.keys.stores.select"), keys: ["X"] },
      { label: t("console.keys.stores.clear"), keys: ["Esc"] },
    ],
  });

  const onRowKey = (e: KeyboardEvent<HTMLElement>, row: StoreListRow) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      router.push(consoleUrl(`/stores/${row.id}`));
    } else if (e.key.toLowerCase() === "x" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggle(row.id);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sib = (e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null;
      sib?.focus();
    }
  };

  if (rows.length === 0) {
    const filtered = hasFilters(page.filter);
    return (
      <div className="rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        {filtered || hasStores ? (
          <div className="grid justify-items-start gap-1 px-5 py-10">
            <p className="text-[13px] font-medium">{t("console.stores.empty.filtered")}</p>
            <button type="button" onClick={() => query.set({ status: null, mode: null, plan: null, market: null, band: null, flag: null, attention: null, dormant: null, q: null, cursor: null })} className="mt-1 rounded-[4px] text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
              {t("console.stores.clear")}
            </button>
          </div>
        ) : (
          <QuietEmpty text={t("console.stores.empty.none")} action={canInvite ? { href: consoleUrl("/settings/signup?tab=codes&new=1"), label: t("console.stores.empty.invite") } : null} />
        )}
      </div>
    );
  }

  const label = (row: StoreListRow) => t("console.stores.select_row", { name: row.name });
  const prev = query.get("cursor");

  return (
    <div className="grid gap-3">
      {/* phone: cards */}
      <ul className="grid gap-2 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            tabIndex={0}
            onClick={() => router.push(consoleUrl(`/stores/${row.id}`))}
            onKeyDown={(e) => onRowKey(e, row)}
            className={cn("grid gap-2 rounded-[var(--r-card)] bg-card p-3 shadow-[inset_0_0_0_1px_var(--c-hairline)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]", selected.has(row.id) && "bg-[color-mix(in_oklch,var(--brand)_6%,var(--card))]")}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Check on={selected.has(row.id)} label={label(row)} onToggle={() => toggle(row.id)} big />
              <div className="min-w-0 flex-1">
                <StoreCell row={row} />
              </div>
              <Health h={row.health} />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 ps-11 text-[12px] text-muted-foreground">
              <StatusPill status={row.status} size="sm" />
              <Chip tint="neutral">{t(`console.mode.${row.mode}`)}</Chip>
              <span>{row.plan.name ?? row.plan.id}</span>
              <span className="font-mono text-[11px]">
                {row.market} · {row.currency}
              </span>
              <span className="num ms-auto">{row.orders7d === null ? "—" : t("console.stores.orders_n", { count: row.orders7d })}</span>
            </div>
            {(row.owner || row.flags.length > 0) && (
              <div className="grid gap-1.5 ps-11">
                <Owner row={row} />
                {row.flags.length > 0 && <Flags row={row} />}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* from 768 px: the table */}
      <div className="hidden overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)] md:block">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <thead className="border-b border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--muted)_50%,transparent)]">
            <tr>
              <Th className="w-10 ps-2">
                <Check
                  on={picked.length === rows.length}
                  label={t("console.stores.select_all")}
                  onToggle={() => setSelected(picked.length === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </Th>
              <Th className="w-[26%] xl:w-[18%]">{t("console.stores.col.store")}</Th>
              <Th className="w-[104px]">{t("console.stores.col.status")}</Th>
              <Th className="hidden w-[112px] lg:table-cell">{t("console.stores.col.mode_plan")}</Th>
              <Th className="w-[76px]">{t("console.stores.col.market")}</Th>
              <Th className="hidden w-[13%] xl:table-cell">{t("console.stores.col.owner")}</Th>
              <Th className="w-[64px]">{t("console.stores.col.health")}</Th>
              <Th className="hidden xl:table-cell">{t("console.stores.col.flags")}</Th>
              <Th className="hidden w-[76px] text-end lg:table-cell">{t("console.stores.col.orders")}</Th>
              <Th className="w-[136px]">{t("console.stores.col.activity")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const on = selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  tabIndex={0}
                  aria-selected={on}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-row-check],a")) return;
                    router.push(consoleUrl(`/stores/${row.id}`));
                  }}
                  onKeyDown={(e) => onRowKey(e, row)}
                  onMouseEnter={() => {
                    try {
                      router.prefetch(consoleUrl(`/stores/${row.id}`));
                    } catch {
                      // prefetching is an optimisation only
                    }
                  }}
                  className={cn(
                    "cursor-default border-b border-[var(--c-hairline)] outline-none transition-colors duration-[var(--dur-1)] last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]",
                    on && "bg-[color-mix(in_oklch,var(--brand)_6%,var(--card))]",
                  )}
                >
                  <td className="ps-2 align-middle">
                    <Check on={on} label={label(row)} onToggle={() => toggle(row.id)} />
                  </td>
                  <td className="px-[var(--cell-x)] py-1.5 align-middle">
                    <StoreCell row={row} />
                  </td>
                  <td className="px-[var(--cell-x)] align-middle">
                    <StatusPill status={row.status} size="sm" />
                  </td>
                  <td className="hidden px-[var(--cell-x)] align-middle lg:table-cell">
                    <span className="grid min-w-0 gap-px">
                      <span className="text-[12.5px]">{t(`console.mode.${row.mode}`)}</span>
                      <span className="truncate text-[11.5px] text-muted-foreground">{row.plan.name ?? row.plan.id}</span>
                    </span>
                  </td>
                  <td className="px-[var(--cell-x)] align-middle">
                    <span className="font-mono text-[12px]">
                      {row.market}
                      <span className="ms-1 text-muted-foreground">{row.currency}</span>
                    </span>
                  </td>
                  <td className="hidden px-[var(--cell-x)] align-middle xl:table-cell">
                    <Owner row={row} />
                  </td>
                  <td className="px-[var(--cell-x)] align-middle">
                    <Health h={row.health} />
                  </td>
                  <td className="hidden px-[var(--cell-x)] align-middle xl:table-cell">
                    <Flags row={row} inline />
                  </td>
                  <td className="num hidden px-[var(--cell-x)] text-end align-middle lg:table-cell">{row.orders7d === null ? <span className="text-muted-foreground">—</span> : row.orders7d}</td>
                  <td className="px-[var(--cell-x)] align-middle">
                    <span className="grid gap-px text-[12px]">
                      {row.lastActiveAt ? <Ago iso={row.lastActiveAt} className="num truncate" /> : <span className="text-muted-foreground">—</span>}
                      <Ago iso={row.createdAt} template="console.stores.created_ago" className="num truncate text-[11px] text-muted-foreground" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(page.next || prev) && (
        <div className="flex items-center justify-between gap-3 text-[12.5px]">
          {prev ? (
            <button type="button" onClick={() => query.set({ cursor: null })} className="rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
              {t("console.queue.first_page")}
            </button>
          ) : (
            <span />
          )}
          {page.next && (
            <button type="button" onClick={() => query.set({ cursor: page.next })} className="rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
              {t("console.queue.next_page")}
            </button>
          )}
        </div>
      )}

      {picked.length > 0 && (
        <div className="sticky bottom-3 z-20">
          <StoresBulkBar count={picked.length} canMessage={canMessage} messageOne={messageOne} csvHref={csvHref} onMessage={() => setMessaging(true)} onClear={() => setSelected(new Set())} />
        </div>
      )}
      <MessageDialog open={messaging} onOpenChange={setMessaging} stores={picked.map((r) => ({ id: r.id, name: r.name, handle: r.handle }))} onSent={() => setSelected(new Set())} />
    </div>
  );
}
