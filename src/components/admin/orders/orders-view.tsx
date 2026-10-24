"use client";

import { AlertTriangleIcon, BanIcon, CalendarRangeIcon, DownloadIcon, Loader2Icon, PhoneOffIcon, RefreshCwIcon, ShieldAlertIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BlockRow, LeadRow, OrderQuery, OrderRow, RangeKey } from "@/lib/admin-data/orders";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common/empty-state";
import { Pager } from "../common/pager";
import { SearchField } from "../common/search-field";
import { Segmented } from "../common/segmented";
import { StatusChip, TONE_CLASSES } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { runAction, type ActionResult } from "../lib/action-result";
import { int, money, phone as fmtPhone } from "../lib/format";
import { runSheetSync } from "../lib/sheets-client";
import { ORDER_STATUS_META, ORDER_STATUS_ORDER, riskLevel, SHEET_STATUS_META } from "../lib/status";
import { useQueryState } from "../lib/use-query-state";
import { BlocklistPanel, type BlocklistActions } from "./blocklist-panel";
import { LeadsPanel } from "./leads-panel";
import { OrderDrawer, type OrderDrawerActions } from "./order-drawer";
import { StatusMenu } from "./status-menu";

export type OrdersTab = "orders" | "leads" | "blocked";

export interface OrdersViewProps {
  tab: OrdersTab;
  query: OrderQuery;
  tabCounts: { orders: number; leads: number; blocked: number };
  statusCounts: Record<string, number>;
  orders: { items: OrderRow[]; total: number; page: number; pageSize: number } | null;
  leads: { items: LeadRow[]; total: number; page: number; pageSize: number } | null;
  blocked: { items: BlockRow[]; total: number; page: number; pageSize: number } | null;
  pages: { id: string; name: string }[];
  canWrite: boolean;
  /** blocklist.write (owner, admin, manager); defaults to canWrite */
  canBlock?: boolean;
  /** orders.export: the CSV button; defaults to shown */
  canExport?: boolean;
  sheetConnected: boolean;
  actions: OrderDrawerActions & BlocklistActions & { retryFailed: () => Promise<ActionResult<{ sent: number; failed: number }>> };
}

const ORDER_ID = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;

const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
  custom: "Custom range",
};

export function OrdersView(props: OrdersViewProps) {
  const { tab, tabCounts, canWrite } = props;
  const router = useRouter();
  const query = useQueryState();
  // the open order lives in the URL (?order=…): links from ⌘K, the dashboard or a shared URL open
  // the drawer even when this screen is already showing
  const requested = (useSearchParams().get("order") ?? "").toUpperCase();
  const openId = ORDER_ID.test(requested) ? requested : null;

  /** drawer ⇄ ?order=… without a server round trip (native history calls sync with the router) */
  const openOrder = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("order", id);
    else url.searchParams.delete("order");
    window.history.replaceState(null, "", url);
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="adm-rise flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ ["--i" as string]: 2 }}>
        <Segmented
          label="Orders sections"
          value={tab}
          onChange={(v) => query.set({ tab: v === "orders" ? null : v, status: null, q: null, page_id: null, sheet: null, risky: null })}
          options={[
            { value: "orders", label: "Orders", count: tabCounts.orders },
            { value: "leads", label: "Abandoned", count: tabCounts.leads, icon: <PhoneOffIcon /> },
            { value: "blocked", label: "Blocklist", count: tabCounts.blocked, icon: <BanIcon /> },
          ]}
        />
        {props.canExport !== false && ((tab === "orders" && tabCounts.orders > 0) || (tab === "leads" && tabCounts.leads > 0)) && (
          <ExportButton leads={tab === "leads"} />
        )}
      </div>

      {tab === "orders" && props.orders && (
        <OrdersPanel {...props} orders={props.orders} openId={openId} onOpen={openOrder} />
      )}
      {tab === "leads" && props.leads && <LeadsPanel leads={props.leads} pages={props.pages} />}
      {tab === "blocked" && props.blocked && <BlocklistPanel blocked={props.blocked} canWrite={props.canBlock ?? canWrite} actions={props.actions} />}

      <OrderDrawer
        orderId={openId}
        onOpenChange={(o) => !o && openOrder(null)}
        canWrite={canWrite}
        canBlock={props.canBlock ?? canWrite}
        actions={props.actions}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

/** CSV of what the screen shows (filters kept); on the Abandoned tab, the leads with their selection. */
function ExportButton({ leads }: { leads?: boolean }) {
  const query = useQueryState();
  const params = new URLSearchParams(query.params.toString());
  for (const k of ["tab", "order", "page"]) params.delete(k);
  if (leads) params.set("tab", "leads");
  const qs = params.toString();
  return (
    <Button asChild variant="outline" className="h-9 rounded-full px-4">
      <a href={`/admin/orders/export${qs ? `?${qs}` : ""}`} download>
        <DownloadIcon />
        Export CSV
      </a>
    </Button>
  );
}

function OrdersPanel({
  query: q,
  statusCounts,
  orders,
  pages,
  canWrite,
  sheetConnected,
  actions,
  openId,
  onOpen,
}: OrdersViewProps & { orders: NonNullable<OrdersViewProps["orders"]>; openId: string | null; onOpen: (id: string | null) => void }) {
  const router = useRouter();
  const query = useQueryState();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const filtered = !!(q.q || q.status || q.pageId || q.range !== "all" || q.sheet || q.risky);
  // before the very first order, filters are noise: show only the welcome state
  const none = !filtered && orders.total === 0;

  const changeStatus = async (id: string, status: string) => {
    setPendingId(id);
    try {
      const res = await runAction(actions.setStatus(id, status), {
        success: (d) => (d.sheet === "updated" ? `${ORDER_STATUS_META[status as keyof typeof ORDER_STATUS_META]?.label ?? status} — sheet updated` : "Status saved"),
      });
      if (res) router.refresh();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {!none && (
        <>
          <div className="adm-rise -mx-1 overflow-x-auto px-1 pb-1 adm-scroll" style={{ ["--i" as string]: 3 }}>
            <Segmented
              label="Filter by status"
              size="sm"
              value={q.status ?? "all"}
              onChange={(v) => query.set({ status: v === "all" ? null : v })}
              options={[
                { value: "all", label: "All", count: statusCounts.all ?? 0 },
                ...ORDER_STATUS_ORDER.map((id) => ({
                  value: id,
                  label: ORDER_STATUS_META[id].label,
                  count: statusCounts[id] ?? 0,
                  icon: <span className={cn("size-1.5 rounded-full", TONE_CLASSES[ORDER_STATUS_META[id].tone].dot)} />,
                })),
              ]}
            />
          </div>

          <div className="adm-rise flex flex-col gap-2 lg:flex-row lg:items-center" style={{ ["--i" as string]: 4 }}>
            <SearchField value={q.q} onCommit={(v) => query.set({ q: v })} placeholder="Order no., phone or name" pending={query.pending} className="lg:w-80" />
            <div className="flex flex-wrap items-center gap-2">
              <RangeFilter query={q} />
              <Select value={q.pageId ?? "all"} onValueChange={(v) => query.set({ page_id: v === "all" ? null : v })}>
                <SelectTrigger className="h-9 max-w-56 rounded-full" aria-label="Filter by page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80 rounded-xl">
                  <SelectItem value="all">All pages</SelectItem>
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleChip active={q.sheet === "failed"} onClick={() => query.set({ sheet: q.sheet === "failed" ? null : "failed" })} icon={<AlertTriangleIcon />}>
                Sync failed
              </ToggleChip>
              <ToggleChip active={q.risky} onClick={() => query.set({ risky: q.risky ? null : 1 })} icon={<ShieldAlertIcon />}>
                Risky
              </ToggleChip>
            </div>
            <div className="flex items-center gap-2 lg:ms-auto">
              {canWrite && q.sheet === "failed" && orders.total > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-full"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      const res = await runAction(actions.retryFailed(), { success: (d) => `${int(d.sent)} sent${d.failed ? ` · ${int(d.failed)} still failing` : ""}` });
                      if (res) router.refresh();
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  {retrying ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                  Retry all failed
                </Button>
              )}
              {canWrite && sheetConnected && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 rounded-full"
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
                  Sync sheet
                </Button>
              )}
            </div>
          </div>

        </>
      )}

      {orders.items.length === 0 ? (
        filtered ? (
          <EmptyState
            illustration="search"
            title="No orders match these filters"
            description="Widen the date range or clear the filters."
            actions={
              <button
                type="button"
                className="text-sm font-medium text-brand hover:underline"
                onClick={() => query.set({ q: null, status: null, page_id: null, range: null, from: null, to: null, sheet: null, risky: null })}
              >
                Clear all filters
              </button>
            }
          />
        ) : (
          <EmptyState
            illustration="orders"
            title="No orders yet"
            description="When a visitor orders from one of your pages, the order appears here instantly, and in Google Sheets once it's connected."
          />
        )
      ) : (
        <div className={cn("grid grid-cols-1 gap-4 transition-opacity duration-300", query.pending && "opacity-60")}>
          {/* desktop table */}
          <div className="adm-surface adm-rise hidden overflow-hidden md:block" style={{ ["--i" as string]: 5 }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="text-[0.75rem] text-muted-foreground [&_th]:border-b [&_th]:border-border">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-medium">Order</th>
                    <th className="px-4 py-2.5 text-start font-medium">Customer</th>
                    <th className="px-4 py-2.5 text-start font-medium">Product</th>
                    <th className="px-4 py-2.5 text-end font-medium">Total</th>
                    <th className="px-4 py-2.5 text-start font-medium">Status</th>
                    <th className="px-4 py-2.5 text-start font-medium">Sheet</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.items.map((o, i) => {
                    const risk = riskLevel(o.riskScore);
                    const selected = o.id === openId;
                    return (
                      <tr
                        key={o.id}
                        onClick={() => onOpen(o.id)}
                        onKeyDown={(e) => {
                          // keys pressed on controls inside the row (status menu) are theirs
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onOpen(o.id);
                          }
                        }}
                        tabIndex={0}
                        aria-selected={selected}
                        className={cn(
                          "adm-fade group cursor-pointer border-t border-border/60 transition-colors duration-150 outline-none first:border-t-0 hover:bg-foreground/[0.025] focus-visible:bg-foreground/[0.04]",
                          selected && "bg-brand/[0.05] hover:bg-brand/[0.07]",
                        )}
                        style={{ ["--i" as string]: Math.min(i, 12) }}
                      >
                        <td className={cn("relative px-4 py-3", selected && "before:absolute before:inset-y-2 before:start-0 before:w-0.5 before:rounded-full before:bg-brand")}>
                          <div className="grid gap-0.5">
                            <span className="font-mono text-[0.8rem] font-medium tracking-tight">{o.id}</span>
                            <RelativeTime iso={o.createdAt} className="text-xs text-muted-foreground" />
                          </div>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <div className="grid gap-0.5">
                            <span className="flex items-center gap-1.5 truncate font-medium">
                              {o.name}
                              {risk && <span className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASSES[risk.tone].dot)} title={risk.label} />}
                            </span>
                            <span className="truncate text-xs text-muted-foreground tabular-nums">
                              {fmtPhone(o.phone)}
                              {o.city ? ` · ${o.city}` : ""}
                            </span>
                          </div>
                        </td>
                        <td className="max-w-64 px-4 py-3">
                          <div className="grid gap-0.5">
                            <span className="truncate">{o.productName}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {o.bundleLabel || `${o.qty} unit${o.qty === 1 ? "" : "s"}`}
                              {o.options ? (
                                <>
                                  {" · "}
                                  <bdi className="font-medium text-foreground/80" title="Options">
                                    {o.options}
                                  </bdi>
                                </>
                              ) : null}
                              {o.pageName ? ` · ${o.pageName}` : ""}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-end font-semibold whitespace-nowrap tabular-nums">{money(o.total, o.currency)}</td>
                        <td className="px-4 py-3">
                          <StatusMenu status={o.status} size="sm" onChange={canWrite ? (s) => changeStatus(o.id, s) : undefined} pending={pendingId === o.id} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusChip tone={SHEET_STATUS_META[o.sheetStatus].tone} className="h-6 text-[0.72rem]" dot>
                            {SHEET_STATUS_META[o.sheetStatus].label}
                          </StatusChip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* mobile cards */}
          <ul className="grid gap-3 md:hidden">
            {orders.items.map((o, i) => {
              const risk = riskLevel(o.riskScore);
              return (
                <li key={o.id} className="adm-rise" style={{ ["--i" as string]: Math.min(i, 10) }}>
                  <button type="button" onClick={() => onOpen(o.id)} className="adm-surface grid w-full gap-3 p-4 text-start">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid gap-0.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          {o.name}
                          {risk && <span className={cn("size-1.5 rounded-full", TONE_CLASSES[risk.tone].dot)} />}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {fmtPhone(o.phone)}
                          {o.city ? ` · ${o.city}` : ""}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{money(o.total, o.currency)}</span>
                    </div>
                    <span className="-mt-1 truncate text-xs text-muted-foreground">
                      {o.productName}
                      {o.options ? (
                        <>
                          {" · "}
                          <bdi className="font-medium text-foreground/80">{o.options}</bdi>
                        </>
                      ) : null}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{o.id}</span> · <RelativeTime iso={o.createdAt} />
                      </span>
                      <StatusChip tone={ORDER_STATUS_META[o.status as keyof typeof ORDER_STATUS_META]?.tone ?? "neutral"} className="h-6 text-[0.72rem]">
                        {ORDER_STATUS_META[o.status as keyof typeof ORDER_STATUS_META]?.label ?? o.status}
                      </StatusChip>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <Pager page={orders.page} pageSize={orders.pageSize} total={orders.total} onPage={(p) => query.set({ page: p > 1 ? p : null }, { resetPage: false, scroll: true })} noun="orders" />
        </div>
      )}
    </div>
  );
}

function ToggleChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[0.8rem] font-medium ring-1 transition-all duration-200 ring-inset [&_svg]:size-3.5",
        active ? "bg-brand/10 text-brand ring-brand/30" : "text-muted-foreground ring-foreground/10 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function RangeFilter({ query: q }: { query: OrderQuery }) {
  const query = useQueryState();
  const [custom, setCustom] = useState(q.range === "custom");
  return (
    <div className="flex items-center gap-2">
      <Select
        value={custom ? "custom" : q.range}
        onValueChange={(v) => {
          if (v === "custom") {
            setCustom(true);
            return;
          }
          setCustom(false);
          query.set({ range: v === "all" ? null : v, from: null, to: null });
        }}
      >
        <SelectTrigger className="h-9 rounded-full" aria-label="Date range">
          <CalendarRangeIcon className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="rounded-xl">
          {(["today", "7d", "30d", "90d", "all"] as const).map((k) => (
            <SelectItem key={k} value={k}>
              {RANGE_LABEL[k]}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="custom">{RANGE_LABEL.custom}…</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <div className="flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2 ring-1 ring-foreground/[0.07] ring-inset">
          <input
            type="date"
            defaultValue={q.from ?? ""}
            aria-label="From"
            className="h-9 bg-transparent px-1 text-sm outline-none"
            onChange={(e) => e.target.value && query.set({ range: "custom", from: e.target.value })}
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            defaultValue={q.to ?? ""}
            aria-label="To"
            className="h-9 bg-transparent px-1 text-sm outline-none"
            onChange={(e) => e.target.value && query.set({ range: "custom", to: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
