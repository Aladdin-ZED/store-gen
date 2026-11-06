"use client";

/**
 * The orders list (P4 CALL CENTER; operations.md OPE-§12.1-§12.8, core §I.1, §I.3, §I.8): built-in view tabs then
 * saved views; filters in the URL (useQueryState), so a view is a shareable link; the first page server-rendered and
 * keyset "Show more"; columns by role (§12.3: compact one-line rows for agents and managers, two-line rows for owners,
 * two-line rows on phones); the TEST chip as text; the hold, tracking and return-reason columns in the views that filter
 * on them; the Sheet chip; the Agent column with a sheet label chip. Selection → the bulk bar. The drawer opens on
 * `?order=<id>` (or `?o=<id>`); J / K move, Enter opens, Esc closes. The R1.0 blocklist tab became a link to
 * /customers?tab=blocked; the Abandoned tab stays until P3's /leads inbox merges.
 */
import "./orders.css";
import { BanIcon, CalendarRangeIcon, DownloadIcon, Loader2Icon, PhoneOffIcon, PinIcon, PlusIcon, RefreshCwIcon, ShieldAlertIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deleteTestOrdersAction, listOrdersAction, retryFailedSyncAction } from "@/app/app/[store]/orders/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadRow, OrderDrawerJson, OrderQuery, OrdersBoot, RangeKey } from "@/lib/admin-data/orders";
import type { OrderQueryInput, ViewColumn } from "@/lib/callcenter/views";
import { dirOf, type MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { OrderList, OrderListRow } from "@/lib/orders/admin";
import type { OrderStatus } from "@/lib/orders/contract";
import { legacyToWanted, projectStatus } from "@/lib/orders/state";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { EmptyState } from "../common/empty-state";
import { SearchField } from "../common/search-field";
import { StatusChip } from "../common/status-chip";
import { downloadFile } from "../lib/download";
import { runSheetSync } from "../lib/sheets-client";
import { SHEET_STATUS_META } from "../lib/status";
import { useQueryState } from "../lib/use-query-state";
import { useStoreStepUp } from "../shell/step-up";
import { useStore } from "../shell/store-context";
import { ago, money, ymdLabel } from "../queue/time";
import { BulkBar, BULK_MAX } from "./bulk-bar";
import type { CarrierSpec } from "./carrier-file";
import { LeadsPanel } from "./leads-panel";
import { ManualOrderSheet, type ManualEditSeed } from "./manual/manual-order-sheet";
import { AxisChips, isOrderId, OrderDrawer, TestTag, type DrawerPerms } from "./order-drawer";
import { CONFIRM_TONE, MONEY_TONE, settle, SHIP_TONE } from "./ops-ui";
import { ViewTabs, type ViewTab } from "./view-tabs";

export type OrdersTab = "orders" | "leads";
export type ColumnRole = "owner" | "manager" | "agent";

export interface OrdersViewProps {
  tab: OrdersTab;
  query: OrderQuery;
  tabs: ViewTab[];
  /** the current filters as a saved view stores them */
  savedQuery: OrderQueryInput;
  orders: OrderList | null;
  leads: { items: LeadRow[]; total: number; page: number; pageSize: number } | null;
  counts: { leads: number };
  pages: { id: string; name: string }[];
  members: OrdersBoot["members"];
  carrierCsv: OrdersBoot["carrierCsv"];
  role: ColumnRole;
  /** extra columns of the active view (OPE-§12.3 rev 3) */
  viewColumns: readonly ViewColumn[];
  perms: DrawerPerms & { export: boolean; create: boolean; leads: boolean; settings: boolean; seeAll: boolean };
  sheetConnected: boolean;
  base: string;
}

const RANGE_KEYS: RangeKey[] = ["today", "7d", "30d", "90d", "all"];

export function OrdersView(props: OrdersViewProps) {
  const { tab, perms } = props;
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const storeView = useStore();
  const sp = useSearchParams();
  const requested = (sp.get("order") ?? sp.get("o") ?? "").toUpperCase();
  const openId = isOrderId(requested) ? requested : null;
  // `?new=1` opens the manual-order sheet (⌘K "Create → Manual order" links here)
  const [sheet, setSheet] = useState<{ mode: "create" } | { mode: "edit"; seed: ManualEditSeed } | null>(() =>
    sp.get("new") === "1" && perms.create && perms.readOnly === null ? { mode: "create" } : null,
  );

  /** drawer ⇄ ?order=… without a server round trip (native history calls sync with the router) */
  const openOrder = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("o");
    if (id) url.searchParams.set("order", id);
    else url.searchParams.delete("order");
    window.history.replaceState(null, "", url);
  }, []);

  const editSeed = (o: OrderDrawerJson): ManualEditSeed => ({
    id: o.id,
    rev: o.rev,
    pageId: o.page?.id ?? null,
    offerId: null,
    name: o.name,
    phoneMasked: o.phone,
    city: o.city,
    address: o.address,
    landmark: o.landmark,
    note: o.note,
    adjustCents: o.adjustCents,
    currency: o.currency,
    locked: !["none", "to_pack", "packed"].includes(o.states.ship),
  });

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="adm-rise flex flex-wrap items-center justify-between gap-3" style={{ ["--i" as string]: 1 }}>
        <nav aria-label={t("ops.orders.sections")} className="flex items-center gap-1 rounded-full bg-foreground/[0.04] p-1">
          <SectionLink href={props.base} active={tab === "orders"}>
            {t("ops.orders.orders")}
          </SectionLink>
          {perms.leads && (
            <SectionLink href={`${props.base}?tab=leads`} active={tab === "leads"} icon={<PhoneOffIcon />} count={props.counts.leads}>
              {t("ops.orders.abandoned")}
            </SectionLink>
          )}
          {perms.block && (
            <SectionLink href={storeView.href("/customers?tab=blocked")} active={false} icon={<BanIcon />}>
              {t("ops.orders.blocked")}
            </SectionLink>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {perms.export && tab === "orders" && <ExportButton view={props.query.view} />}
          {perms.export && tab === "leads" && props.counts.leads > 0 && <ExportButton leads />}
          {perms.create && perms.readOnly === null && (
            <Button className="h-9 rounded-full px-4" onClick={() => setSheet({ mode: "create" })}>
              <PlusIcon /> {t("ops.orders.newOrder")}
            </Button>
          )}
        </div>
      </div>

      {tab === "orders" && props.orders && <OrdersPanel {...props} orders={props.orders} openId={openId} onOpen={openOrder} />}
      {tab === "leads" && props.leads && <LeadsPanel leads={props.leads} pages={props.pages} />}

      <OrderDrawer
        orderId={openId}
        onOpenChange={(o) => !o && openOrder(null)}
        perms={perms}
        members={props.members}
        tz={storeView.timeZone}
        locale={locale}
        rtl={dirOf(locale) === "rtl"}
        onChanged={() => router.refresh()}
        onEdit={(o) => setSheet({ mode: "edit", seed: editSeed(o) })}
      />
      <ManualOrderSheet
        open={!!sheet}
        onOpenChange={(o) => {
          if (o) return;
          setSheet(null);
          if (sp.get("new")) {
            const url = new URL(window.location.href);
            url.searchParams.delete("new");
            window.history.replaceState(null, "", url);
          }
        }}
        mode={sheet?.mode ?? "create"}
        {...(sheet?.mode === "edit" ? { edit: sheet.seed } : {})}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function SectionLink({ href, active, icon, count, children }: { href: string; active: boolean; icon?: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors duration-150 [&_svg]:size-3.5",
        active ? "bg-background text-foreground shadow-xs ring-1 ring-foreground/[0.06]" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
      {count ? <span className="text-xs text-muted-foreground tabular-nums">{count}</span> : null}
    </Link>
  );
}

/** The CSV of what the screen shows (filters kept); a fresh step-up first (OD64). */
function ExportButton({ leads, view }: { leads?: boolean; view?: string | null }) {
  const t = useT();
  const query = useQueryState();
  const storeView = useStore();
  const stepUp = useStoreStepUp();
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(query.params.toString());
  for (const k of ["tab", "order", "o", "page", "after"]) params.delete(k);
  if (leads) params.set("tab", "leads");
  // the view the server applied (a bare URL opens on the role's default view)
  else params.set("view", view ?? "all");
  const qs = params.toString();
  return (
    <Button
      variant="outline"
      className="h-9 rounded-full px-4"
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(`${storeView.api("/orders/export")}${qs ? `?${qs}` : ""}`, stepUp, leads ? "abandoned-leads.csv" : "orders.csv");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
      {t("ops.orders.exportCsv")}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* the list                                                            */
/* ------------------------------------------------------------------ */

function OrdersPanel({
  query: q,
  tabs,
  savedQuery,
  orders,
  pages,
  members,
  carrierCsv,
  role,
  viewColumns,
  perms,
  sheetConnected,
  base,
  openId,
  onOpen,
}: OrdersViewProps & { orders: OrderList; openId: string | null; onOpen: (id: string | null) => void }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const query = useQueryState();
  const storeView = useStore();
  const tz = storeView.timeZone;

  const [extra, setExtra] = useState<{ items: OrderListRow[]; next: string | null } | null>(null);
  const [more, setMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState<Map<string, Pick<OrderListRow, "states" | "status">>>(new Map());
  const [carrier, setCarrier] = useState<CarrierSpec | null>(carrierCsv);
  const [cursor, setCursor] = useState(-1);
  const [busy, setBusy] = useState<string | null>(null);
  const [purge, setPurge] = useState(false);

  // a new server page (filters changed, or a refresh after a write) resets the client-side pages and overrides
  useEffect(() => {
    setExtra(null);
    setOverride(new Map());
    setSelected((cur) => new Set([...cur].filter((id) => orders.items.some((r) => r.id === id))));
  }, [orders]);

  const rows = useMemo(() => {
    const all = [...orders.items, ...(extra?.items ?? [])];
    return all.map((r) => {
      const o = override.get(r.id);
      return o ? { ...r, ...o } : r;
    });
  }, [orders.items, extra, override]);
  const next = extra ? extra.next : orders.next;
  const filtered = !!(q.q || q.pageId || q.range !== "all" || q.risky || q.assignee || q.minRisk !== null || q.view);
  const selectable = perms.readOnly === null && (perms.write || perms.assign || perms.ship || perms.export);
  const compact = role !== "owner";
  const cols = {
    money: role === "owner",
    agent: role !== "agent",
    sheet: role !== "agent" && sheetConnected,
    shipFrom: viewColumns.includes("ship_from"),
    tracking: viewColumns.includes("tracking"),
    returnReason: viewColumns.includes("return_reason") && role !== "agent",
    attempts: viewColumns.includes("attempts_due") || viewColumns.includes("delivery_attempts"),
  };
  const selRows = rows.filter((r) => selected.has(r.id));
  const memberName = (id: string | null) => (id ? (members.find((m) => m.id === id)?.name ?? null) : null);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else if (n.size < BULK_MAX) n.add(id);
      else toast.message(t("ops.bulk.selectUpTo"));
      return n;
    });
  const allOn = rows.length > 0 && rows.slice(0, BULK_MAX).every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.slice(0, BULK_MAX).map((r) => r.id)));

  const loadMore = async () => {
    if (!next) return;
    setMore(true);
    const params: Record<string, string> = {};
    query.params.forEach((v, k) => {
      if (!["order", "o", "after", "page"].includes(k)) params[k] = v;
    });
    // the view the server applied (a bare URL opens on the role's default view)
    params.view = q.view ?? "all";
    const res = await settle<OrderList>(listOrdersAction(params, next));
    setMore(false);
    if (!res.ok) return void toast.error(t("ops.error.network"));
    setExtra((cur) => ({ items: [...(cur?.items ?? []), ...res.data.items], next: res.data.next }));
  };

  // J / K move the focus, Enter opens (core §I.3); never while typing or with a dialog open
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      if (e.code === "KeyJ" || e.code === "KeyK") {
        e.preventDefault();
        setCursor((c) => {
          const n = Math.max(0, Math.min(rows.length - 1, c + (e.code === "KeyJ" ? 1 : -1)));
          rowRefs.current[n]?.focus();
          return n;
        });
      } else if (e.key === "Enter" && cursor >= 0 && rows[cursor] && el === document.body) {
        onOpen(rows[cursor]!.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor, onOpen]);

  const optimistic = (ids: readonly string[], label: OrderStatus) => {
    setOverride((cur) => {
      const n = new Map(cur);
      for (const r of rows) {
        if (!ids.includes(r.id)) continue;
        const want = legacyToWanted(label, r.states);
        if (want === "noop" || want === "reject") continue;
        const states = { ...r.states, ...want, ...(want.ship && r.states.confirm !== "confirmed" ? { confirm: "confirmed" as const } : {}) };
        n.set(r.id, { states, status: projectStatus(states) });
      }
      return n;
    });
    return (failed: readonly string[]) =>
      setOverride((cur) => {
        const n = new Map(cur);
        for (const id of failed) n.delete(id);
        return n;
      });
  };

  const viewTab = tabs.find((x) => x.active);

  return (
    <div className={cn("grid grid-cols-1 gap-4", selRows.length > 0 && "pb-20")}>
      <div className="adm-rise" style={{ ["--i" as string]: 2 }}>
        <ViewTabs tabs={tabs} base={base} current={savedQuery} canSave={perms.write && perms.readOnly === null} canShare={perms.assign} />
      </div>

      <div className="adm-rise flex flex-col gap-2 lg:flex-row lg:items-center" style={{ ["--i" as string]: 3 }}>
        <SearchField value={q.q} onCommit={(v) => query.set({ q: v, after: null })} placeholder={t("ops.orders.search")} pending={query.pending} className="lg:w-80" />
        <div className="flex flex-wrap items-center gap-2">
          <RangeFilter query={q} />
          {pages.length > 1 && (
            <Select value={q.pageId ?? "all"} onValueChange={(v) => query.set({ page_id: v === "all" ? null : v })}>
              <SelectTrigger className="h-9 max-w-56 rounded-full" aria-label={t("ops.orders.filterPage")}>
                <SelectValue>{pages.find((p) => p.id === q.pageId)?.name ?? t("ops.orders.allPages")}</SelectValue>
              </SelectTrigger>
              <SelectContent dir={dirOf(locale)} position="popper" className="max-h-80 rounded-xl">
                <SelectItem value="all">{t("ops.orders.allPages")}</SelectItem>
                {pages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {perms.seeAll && members.length > 0 && (
            <Select value={q.assignee ?? "all"} onValueChange={(v) => query.set({ assignee: v === "all" ? null : v })}>
              <SelectTrigger className="h-9 max-w-52 rounded-full" aria-label={t("ops.orders.filterAgent")}>
                <SelectValue>{q.assignee === "none" ? t("ops.orders.unassigned") : (members.find((m) => m.id === q.assignee)?.name ?? t("ops.orders.allAgents"))}</SelectValue>
              </SelectTrigger>
              <SelectContent dir={dirOf(locale)} position="popper" className="max-h-80 rounded-xl">
                <SelectItem value="all">{t("ops.orders.allAgents")}</SelectItem>
                <SelectItem value="none">{t("ops.orders.unassigned")}</SelectItem>
                <SelectSeparator />
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            type="button"
            aria-pressed={q.minRisk !== null || q.risky}
            onClick={() => query.set({ min_risk: q.minRisk !== null || q.risky ? null : 50, risky: null })}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-medium ring-1 transition-colors duration-150 ring-inset [&_svg]:size-3.5",
              q.minRisk !== null || q.risky ? "bg-foreground/[0.06] text-foreground ring-foreground/20" : "text-muted-foreground ring-foreground/10 hover:bg-foreground/[0.04] hover:text-foreground",
            )}
          >
            <ShieldAlertIcon /> {t("ops.orders.risky")}
          </button>
        </div>
        <div className="flex items-center gap-2 lg:ms-auto">
          {perms.write && perms.readOnly === null && (q.sheet === "failed" || q.view === "sheet_failed") && orders.items.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-full"
              disabled={busy === "retry"}
              onClick={async () => {
                setBusy("retry");
                const res = await settle<{ sent: number; failed: number }>(retryFailedSyncAction());
                setBusy(null);
                if (res.ok) {
                  toast.success(t("ops.orders.retried", { n: res.data.sent }));
                  router.refresh();
                } else toast.error(t("ops.error.generic"));
              }}
            >
              {busy === "retry" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              {t("ops.orders.retryFailed")}
            </Button>
          )}
          {perms.write && perms.readOnly === null && sheetConnected && role !== "agent" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 rounded-full"
              disabled={busy === "sync"}
              onClick={async () => {
                setBusy("sync");
                try {
                  if (await runSheetSync()) router.refresh();
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "sync" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              {t("ops.orders.syncSheet")}
            </Button>
          )}
          {perms.settings && perms.readOnly === null && q.view === "test" && orders.items.length > 0 && (
            <Button size="sm" variant="ghost" className="h-9 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setPurge(true)}>
              <Trash2Icon /> {t("ops.orders.deleteTest")}
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            illustration="search"
            title={viewTab && q.view ? t("ops.orders.emptyView", { view: viewTab.label }) : t("ops.orders.emptyFiltered")}
            description={t("ops.orders.emptyFilteredHint")}
            actions={
              <Link href={base} className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                {t("ops.orders.showAll")}
              </Link>
            }
          />
        ) : (
          <EmptyState illustration="orders" title={t("ops.orders.emptyTitle")} description={t("ops.orders.emptyHint")} />
        )
      ) : (
        <div className={cn("grid grid-cols-1 gap-3 transition-opacity duration-200", query.pending && "opacity-60")}>
          {/* desktop table */}
          <div className="adm-surface adm-rise hidden overflow-hidden md:block" style={{ ["--i" as string]: 4 }}>
            <div className="adm-scroll overflow-x-auto">
              <table className="w-full min-w-[60rem] text-[0.8125rem]">
                <thead className="text-xs text-muted-foreground [&_th]:h-9 [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:font-medium [&_th]:whitespace-nowrap">
                  <tr>
                    {selectable && (
                      <th className="w-9 ps-4!">
                        <Checkbox checked={allOn} onCheckedChange={toggleAll} aria-label={t("ops.bulk.selectAll")} />
                      </th>
                    )}
                    <th className="text-start">{t("ops.col.order")}</th>
                    <th className="text-start">{t("ops.col.customer")}</th>
                    <th className="text-start">{t("ops.col.product")}</th>
                    <th className="text-end">{t("ops.col.total")}</th>
                    <th className="text-start">{t("ops.col.status")}</th>
                    {cols.money && <th className="text-start">{t("ops.col.money")}</th>}
                    {cols.agent && <th className="text-start">{t("ops.col.agent")}</th>}
                    {cols.attempts && <th className="text-start">{t("ops.col.attempts")}</th>}
                    {cols.shipFrom && <th className="text-start">{t("ops.col.shipFrom")}</th>}
                    {cols.tracking && <th className="text-start">{t("ops.col.tracking")}</th>}
                    {cols.returnReason && <th className="text-start">{t("ops.col.returnReason")}</th>}
                    <th className="text-start">{t("ops.col.risk")}</th>
                    {cols.sheet && <th className="pe-4! text-start">{t("ops.col.sheet")}</th>}
                  </tr>
                </thead>
                <tbody className="[&_td]:px-3">
                  {rows.map((o, i) => {
                    const on = selected.has(o.id);
                    const open = o.id === openId;
                    const two = !compact;
                    return (
                      <tr
                        key={o.id}
                        ref={(el) => {
                          rowRefs.current[i] = el;
                        }}
                        tabIndex={0}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("[data-no-open]")) return;
                          onOpen(o.id);
                        }}
                        onFocus={() => setCursor(i)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onOpen(o.id);
                          } else if (e.key === " " && selectable) {
                            e.preventDefault();
                            toggle(o.id);
                          }
                        }}
                        aria-selected={open}
                        className={cn(
                          "group cursor-pointer border-t border-border/60 transition-colors duration-150 outline-none first:border-t-0 hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.04]",
                          two ? "h-10" : "h-8",
                          on && "bg-brand/[0.04] hover:bg-brand/[0.06]",
                          open && "bg-foreground/[0.04]",
                        )}
                      >
                        {selectable && (
                          <td className="w-9 ps-4!" data-no-open="">
                            <Checkbox checked={on} onCheckedChange={() => toggle(o.id)} aria-label={t("ops.bulk.selectOne", { id: o.id })} />
                          </td>
                        )}
                        <td className={cn("relative whitespace-nowrap", two ? "py-1" : "py-0", open && "before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-foreground")}>
                          <span className="flex items-center gap-1.5">
                            {o.pinned && <PinIcon className="size-3 text-muted-foreground" aria-label={t("ops.drawer.pinned")} />}
                            <bdi dir="ltr" className="font-mono text-[0.78rem] font-medium tracking-tight">{o.id}</bdi>
                            {o.isTest && <TestTag />}
                            {!two && <span suppressHydrationWarning className="text-xs text-muted-foreground" title={fullDate(o.createdAt, tz, locale)}>{ago(Date.parse(o.createdAt), Date.now(), locale)}</span>}
                          </span>
                          {two && (
                            <span suppressHydrationWarning className="block text-xs text-muted-foreground" title={fullDate(o.createdAt, tz, locale)}>
                              {ago(Date.parse(o.createdAt), Date.now(), locale)}
                              {role === "owner" ? ` · ${t(`ops.source.${o.source}` as MessageKey)}` : ""}
                              {role === "owner" && o.utmCampaign ? ` · ${o.utmCampaign}` : ""}
                            </span>
                          )}
                        </td>
                        <td className={cn("max-w-52", two ? "py-1" : "py-0")}>
                          <span className="block truncate font-medium">{o.name}</span>
                          {two ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              <bdi dir="ltr" className="tabular-nums">{o.phoneMasked}</bdi>
                              {o.city ? ` · ${o.city}` : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className={cn("max-w-60", two ? "py-1" : "py-0")}>
                          <span className="block truncate" title={o.options || o.productName}>
                            {o.productName}
                            {!two && o.city ? <span className="text-muted-foreground">{` · ${o.city}`}</span> : null}
                          </span>
                          {two && (
                            <span className="block truncate text-xs text-muted-foreground">
                              <bdi>{o.bundleLabel || t("ops.orders.units", { n: o.qty })}</bdi>
                              {o.options ? <bdi className="text-foreground/75">{` · ${o.options}`}</bdi> : null}
                            </span>
                          )}
                        </td>
                        <td className="text-end font-semibold whitespace-nowrap tabular-nums">{money(o.totalCents, o.currency, locale)}</td>
                        <td className="whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <StatusChip tone={CONFIRM_TONE[o.states.confirm]} className="h-5 px-2 text-[0.6875rem]">
                              {t(`ops.confirm.${o.states.confirm}` as MessageKey)}
                            </StatusChip>
                            {o.states.ship !== "none" && (
                              <StatusChip tone={SHIP_TONE[o.states.ship]} className="h-5 px-2 text-[0.6875rem]">
                                {t(`ops.ship.${o.states.ship}` as MessageKey)}
                              </StatusChip>
                            )}
                          </span>
                        </td>
                        {cols.money && (
                          <td className="whitespace-nowrap">
                            {o.states.money === "unpaid" ? (
                              <span className="text-muted-foreground/60">—</span>
                            ) : (
                              <StatusChip tone={MONEY_TONE[o.states.money]} dot={false} className="h-5 px-2 text-[0.6875rem]">
                                {t(`ops.money.${o.states.money}` as MessageKey)}
                              </StatusChip>
                            )}
                          </td>
                        )}
                        {cols.agent && (
                          <td className="max-w-40 whitespace-nowrap">
                            <AgentCell name={memberName(o.confirmedBy) ?? memberName(o.assigneeId)} label={o.confirmedBy ? null : o.confirmedByLabel} />
                          </td>
                        )}
                        {cols.attempts && (
                          <td className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                            {viewColumns.includes("delivery_attempts") ? t("ops.orders.deliveryAttempts", { n: o.deliveryAttempts }) : t("ops.orders.attempts", { n: o.attempts })}
                            {o.dueAt ? ` · ${dueText(o.dueAt, tz, locale)}` : ""}
                          </td>
                        )}
                        {cols.shipFrom && <td className="whitespace-nowrap text-xs">{o.shipAfter ? ymdLabel(ymdIn(o.shipAfter, tz), locale) : "—"}</td>}
                        {cols.tracking && (
                          <td className="max-w-40 truncate text-xs">
                            {o.trackingRef ? <bdi dir="ltr" className="font-mono">{o.trackingRef}</bdi> : <span className="text-muted-foreground">—</span>}
                            {o.carrierLabel ? <span className="text-muted-foreground">{` · ${o.carrierLabel}`}</span> : null}
                          </td>
                        )}
                        {cols.returnReason && <td className="max-w-40 truncate text-xs">{o.returnReason ? t(`ops.reason.return.${o.returnReason}` as MessageKey) : "—"}</td>}
                        <td className="whitespace-nowrap">
                          <RiskChip score={o.riskScore} />
                        </td>
                        {cols.sheet && (
                          <td className="pe-4! whitespace-nowrap">
                            <StatusChip tone={SHEET_STATUS_META[o.sheetStatus].tone} className="h-5 px-2 text-[0.6875rem]">
                              {t(`ops.sheet.${o.sheetStatus}` as MessageKey)}
                            </StatusChip>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* phones: two-line rows */}
          <ul className="adm-surface grid divide-y divide-border/60 overflow-hidden md:hidden">
            {rows.map((o) => {
              const on = selected.has(o.id);
              return (
                <li key={o.id} className={cn("flex items-stretch", on && "bg-brand/[0.04]")}>
                  {selectable && (
                    <label className="flex shrink-0 items-center ps-3.5 pe-1">
                      <Checkbox checked={on} onCheckedChange={() => toggle(o.id)} aria-label={t("ops.bulk.selectOne", { id: o.id })} />
                    </label>
                  )}
                  <button type="button" onClick={() => onOpen(o.id)} className="grid min-w-0 flex-1 gap-1 px-3.5 py-2.5 text-start">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[0.875rem] font-medium">{o.name}</span>
                      <span className="shrink-0 text-[0.875rem] font-semibold tabular-nums">{money(o.totalCents, o.currency, locale)}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <bdi dir="ltr" className="shrink-0 font-mono">{o.id}</bdi>
                      {o.isTest && <TestTag />}
                      <span suppressHydrationWarning className="shrink-0">· {ago(Date.parse(o.createdAt), Date.now(), locale)}</span>
                      <span className="ms-auto flex shrink-0 gap-1">
                        <AxisChips states={o.states} size="sm" money={false} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{t("ops.orders.showing", { shown: rows.length, total: orders.totalCapped ? "10,000+" : orders.total })}</span>
            {next && (
              <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => void loadMore()} disabled={more}>
                {more && <Loader2Icon className="animate-spin" />}
                {t("ops.drawer.showMore")}
              </Button>
            )}
          </div>
        </div>
      )}

      {selRows.length > 0 && (
        <BulkBar
          rows={selRows}
          perms={{ write: perms.write, assign: perms.assign, ship: perms.ship, export: perms.export }}
          members={members}
          carrier={carrier}
          onCarrier={setCarrier}
          onClear={() => setSelected(new Set())}
          onOptimistic={optimistic}
          onChanged={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={purge}
        onOpenChange={setPurge}
        destructive
        icon={<Trash2Icon />}
        title={t("ops.orders.deleteTestTitle")}
        description={t("ops.orders.deleteTestHint")}
        confirmLabel={t("ops.orders.deleteTest")}
        onConfirm={async () => {
          const res = await settle<{ deleted: number }>(deleteTestOrdersAction());
          if (!res.ok) {
            toast.error(t("ops.error.generic"));
            return false;
          }
          toast.success(t("ops.orders.testDeleted", { n: res.data.deleted }));
          router.refresh();
          return true;
        }}
      />
    </div>
  );
}

function AgentCell({ name, label }: { name: string | null; label: string | null }) {
  const t = useT();
  if (name) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-[0.625rem] font-semibold">{Array.from(name.trim())[0] ?? "?"}</span>
        <span className="truncate">{name}</span>
      </span>
    );
  }
  if (label) return <span className="inline-flex h-5 items-center rounded-md px-1.5 text-xs text-muted-foreground ring-1 ring-border ring-inset">{t("ops.orders.sheetAgent", { name: label })}</span>;
  return <span className="text-muted-foreground">—</span>;
}

function RiskChip({ score }: { score: number }) {
  const t = useT();
  // < 50 is low: no chip (risk-explain.ts riskLevel), the column stays quiet
  if (score < 50) return null;
  return (
    <StatusChip tone={score >= 70 ? "red" : "warn"} className="h-5 px-2 text-[0.6875rem]">
      {score >= 70 ? t("ops.risk.high") : t("ops.risk.check")}
    </StatusChip>
  );
}

const fmtLocale = (locale: string) => (locale === "ar" ? "ar-MA-u-nu-latn" : locale);
const fullDate = (iso: string, tz: string, locale: string) =>
  new Intl.DateTimeFormat(fmtLocale(locale), { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const ymdIn = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
const dueText = (iso: string, tz: string, locale: string) =>
  new Intl.DateTimeFormat(fmtLocale(locale), { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

function RangeFilter({ query: q }: { query: OrderQuery }) {
  const t = useT();
  const locale = useAdminLocale();
  const query = useQueryState();
  const [custom, setCustom] = useState(q.range === "custom");
  const label = (k: RangeKey) => t(`ops.range.${k}` as MessageKey);
  return (
    <div className="flex items-center gap-2">
      <Select
        value={custom ? "custom" : q.range}
        onValueChange={(v) => {
          if (v === "custom") return setCustom(true);
          setCustom(false);
          query.set({ range: v === "all" ? null : v, from: null, to: null });
        }}
      >
        <SelectTrigger className="h-9 rounded-full" aria-label={t("ops.orders.dateRange")}>
          <CalendarRangeIcon className="text-muted-foreground" />
          <SelectValue>{label(custom ? "custom" : q.range)}</SelectValue>
        </SelectTrigger>
        <SelectContent dir={dirOf(locale)} position="popper" className="rounded-xl">
          {RANGE_KEYS.map((k) => (
            <SelectItem key={k} value={k}>
              {label(k)}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="custom">{label("custom")}</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <div className="flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2 ring-1 ring-foreground/[0.07] ring-inset">
          <input type="date" defaultValue={q.from ?? ""} aria-label={t("ops.orders.from")} className="h-9 bg-transparent px-1 text-sm outline-none" onChange={(e) => e.target.value && query.set({ range: "custom", from: e.target.value })} />
          <span className="text-muted-foreground" aria-hidden="true">–</span>
          <input type="date" defaultValue={q.to ?? ""} aria-label={t("ops.orders.to")} className="h-9 bg-transparent px-1 text-sm outline-none" onChange={(e) => e.target.value && query.set({ range: "custom", to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
