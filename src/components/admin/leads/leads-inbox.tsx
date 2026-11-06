"use client";
/**
 * The lead inbox (P3 LANDING; landing.md LAN-§10.3, §10.5, §10.6; docs/STORE-SAAS.md §I.3, §I.8; screen 6 of the R1
 * build order). An agent surface, phone-first: two-line rows with WhatsApp and Call on the card (44 px), the lead sheet
 * full-height on a phone, a tap for everything. The header counts are the read repository's (30 days, test leads
 * out, a % hidden below n = 20, "Recovered" with its confirmed and delivered on hover). Views and filters live in the
 * URL. Writes are optimistic with an op id and Undo (lost, follow-up, assign); WhatsApp and Call log an attempt and
 * open the link on the agent's device. Keyboard: J / K move, Enter opens, X selects, W WhatsApp, C call, V convert,
 * L lost. Under "View as store" every write is off with the reason.
 */
import { DownloadIcon, HandIcon, InboxIcon, ShieldAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { LEAD_VIEWS, type ConvertLeadInput, type ConvertOutcome, type LeadCounts, type LeadRow, type LeadView, type LostReason } from "@/lib/leads/types";
import { cn } from "@/lib/utils";
import { Segmented } from "../common/segmented";
import { newOpId, UNDO_MS, useNow } from "../landing/optimistic";
import { downloadFile } from "../lib/download";
import type { ActionResult } from "../lib/action-result";
import { useQueryState } from "../lib/use-query-state";
import { useStoreStepUp } from "../shell/step-up";
import { useStore } from "../shell/store-context";
import { ageText, failText, intFmt, moneyText } from "./format";
import { Assignee, ContactButtons, InboxContext, isOpen, KindMark, LeadMenu, MaskedPhone, OpsContext, StatusPill, TestChip, useOps, type LeadInboxCtx, type LeadMember, type LeadOps } from "./lead-parts";
import { ConvertSheet, LeadSheet, LostSheet } from "./lead-sheet";
import { LEAD_ROW_GRID, LeadRowsSkeleton } from "./leads-skeleton";

export interface LeadActions {
  get: (id: string) => Promise<ActionResult<LeadRow | null>>;
  attempt: (id: string, channel: "whatsapp" | "call", opId?: string) => Promise<ActionResult<{ href: string | null; attempts: number }>>;
  assign: (ids: string[], userId: string | null, opId?: string) => Promise<ActionResult<{ n: number }>>;
  takeNext: () => Promise<ActionResult<LeadRow | null>>;
  lost: (id: string, reason: LostReason, opId?: string) => Promise<ActionResult<null>>;
  reopen: (id: string, nextAt: string | null, opId?: string) => Promise<ActionResult<null>>;
  followUp: (id: string, at: string | null, opId?: string) => Promise<ActionResult<null>>;
  convert: (id: string, input: ConvertLeadInput, opId?: string) => Promise<ActionResult<ConvertOutcome>>;
}

export interface LeadsInboxProps {
  rows: LeadRow[];
  next: string | null;
  counts: LeadCounts;
  pages: { id: string; name: string }[];
  cities: string[];
  members: LeadMember[];
  me: string;
  role: string;
  can: LeadInboxCtx["can"];
  /** "View as store": every write is off with this reason */
  readOnly: boolean;
  /** `market`: EU market (consent tools first); `setting`: the store turned capture off */
  captureOff: "market" | "setting" | null;
  /** the lead of `?lead=` (a ⌘K result or a notification) */
  focus: LeadRow | null;
  timeZone: string;
  /** when the server rendered the rows (ISO): the ages until the browser's clock takes over */
  renderedAt: string;
  actions: LeadActions;
}

type Failure = { ok: false; error: string; message?: string };
const NETWORK: Failure = { ok: false, error: "network", message: "landing.common.network" };

async function call<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return NETWORK;
  }
}

export function LeadsInbox(p: LeadsInboxProps) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const store = useStore();
  const stepUp = useStoreStepUp();
  const query = useQueryState();
  const [rows, setRows] = useState(p.rows);
  const [serverRows, setServerRows] = useState(p.rows);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState(-1);
  const [sheet, setSheet] = useState<LeadRow | null>(p.focus);
  const [converting, setConverting] = useState<{ lead: LeadRow; idem: string } | null>(null);
  const [losing, setLosing] = useState<LeadRow[] | null>(null);
  const clock = useNow();
  const now = clock ? clock.getTime() : Date.parse(p.renderedAt);

  // the server's rows win after every refresh (the optimistic patches were written there)
  if (serverRows !== p.rows) {
    setServerRows(p.rows);
    setRows(p.rows);
    setSelected((s) => new Set([...s].filter((id) => p.rows.some((r) => r.id === id))));
  }

  const readOnlyText = p.readOnly ? t("error.impersonation_read_only") : null;
  const ctx: LeadInboxCtx = useMemo(() => ({ me: p.me, role: p.role, can: p.can, readOnly: readOnlyText, members: p.members, timeZone: p.timeZone }), [p.me, p.role, p.can, readOnlyText, p.members, p.timeZone]);

  /** Patches rows in place (and the open sheet), returning the previous values of the touched rows. */
  const patch = useCallback(
    (ids: readonly string[], fn: (r: LeadRow) => LeadRow): LeadRow[] => {
      const prev = rows.filter((r) => ids.includes(r.id));
      setRows((cur) => cur.map((r) => (ids.includes(r.id) ? fn(r) : r)));
      setSheet((cur) => (cur && ids.includes(cur.id) ? fn(cur) : cur));
      return prev;
    },
    [rows],
  );
  const restore = useCallback((prev: readonly LeadRow[]) => {
    const byId = new Map(prev.map((r) => [r.id, r]));
    patch([...byId.keys()], (r) => byId.get(r.id) ?? r);
  }, [patch]);

  /**
   * One optimistic write: patch, run with a fresh op id, roll back with the reason on a refusal, else a toast with
   * Undo (which restores the rows and runs `undo` the same way). The server's answer then refreshes the counts.
   */
  const mutate = useCallback(
    async (ids: string[], fn: (r: LeadRow) => LeadRow, run: (opId: string) => Promise<ActionResult<unknown>>, message: string, undo?: (prev: LeadRow[]) => Promise<ActionResult<unknown>[]>) => {
      const prev = patch(ids, fn);
      const res = await call(() => run(newOpId()));
      if (!res.ok) {
        restore(prev);
        toast.error(failText(res, t));
        return false;
      }
      toast.success(message, {
        duration: UNDO_MS,
        ...(undo
          ? {
              action: {
                label: t("landing.common.undo"),
                onClick: async () => {
                  restore(prev);
                  const back = await undo(prev).catch(() => [NETWORK]);
                  const bad = back.find((r) => !r.ok) as Failure | undefined;
                  if (bad) toast.error(failText(bad, t));
                  else toast.success(t("landing.common.undone"));
                  router.refresh();
                },
              },
            }
          : {}),
      });
      router.refresh();
      return true;
    },
    [patch, restore, router, t],
  );

  const ops: LeadOps = useMemo(
    () => ({
      open: (lead) => setSheet(lead),
      contact: async (lead, channel) => {
        if (p.readOnly || !p.can.contact) return;
        // the WhatsApp tab opens inside the tap (a popup blocker lets it through), then gets its address
        const tab = channel === "whatsapp" ? window.open("about:blank", "_blank") : null;
        if (tab) tab.opener = null;
        const res = await stepUp.action(() => call(() => p.actions.attempt(lead.id, channel, newOpId())));
        if (!res.ok) {
          tab?.close();
          toast.error(failText(res, t));
          return;
        }
        if (!res.data.href) {
          tab?.close();
          toast(t("landing.leads.toast.noPhone"));
          return;
        }
        if (tab) tab.location.href = res.data.href;
        else window.location.href = res.data.href;
        const at = new Date().toISOString();
        patch([lead.id], (r) => ({ ...r, attempts: res.data.attempts, status: r.status === "new" ? "contacted" : r.status, contactedAt: r.contactedAt ?? at, assigneeId: r.assigneeId ?? p.me }));
        router.refresh();
      },
      convert: (lead) => setConverting({ lead, idem: newUuid() }),
      lost: (leads) => setLosing(leads.filter(isOpen)),
      followUp: (lead, at) => {
        const iso = at ? at.toISOString() : null;
        void mutate(
          [lead.id],
          (r) => ({ ...r, nextAt: iso }),
          (opId) => p.actions.followUp(lead.id, iso, opId),
          t(at ? "landing.leads.toast.followUp" : "landing.leads.toast.followUpNone"),
          async (prev) => [await p.actions.followUp(lead.id, prev[0]?.nextAt ?? null, newOpId())],
        );
      },
      assign: (leads, userId) => {
        const ids = leads.map((l) => l.id);
        void mutate(
          ids,
          (r) => ({ ...r, assigneeId: userId }),
          (opId) => p.actions.assign(ids, userId, opId),
          t("landing.leads.toast.assigned", { n: ids.length }),
          async (prev) => {
            // each previous assignee gets its leads back
            const groups = new Map<string | null, string[]>();
            for (const r of prev) groups.set(r.assigneeId, [...(groups.get(r.assigneeId) ?? []), r.id]);
            return Promise.all([...groups].map(([who, list]) => p.actions.assign(list, who, newOpId())));
          },
        );
      },
    }),
    [mutate, p.actions, p.can.contact, p.me, p.readOnly, patch, router, stepUp, t],
  );

  const confirmLost = async (leads: LeadRow[], reason: LostReason) => {
    const ids = leads.map((l) => l.id);
    const ok = await mutate(
      ids,
      (r) => ({ ...r, status: "lost", lostReason: reason, nextAt: null }),
      async (opId) => {
        const results = await Promise.all(ids.map((id, i) => p.actions.lost(id, reason, `${opId.slice(0, 24)}${String(i).padStart(4, "0")}`)));
        return results.find((r) => !r.ok) ?? results[0]!;
      },
      ids.length === 1 ? t("landing.leads.toast.lost") : t("landing.leads.toast.lostMany", { n: ids.length }),
      (prev) => Promise.all(prev.map((r) => p.actions.reopen(r.id, r.nextAt, newOpId()))),
    );
    if (ok) setSelected(new Set());
    return ok;
  };

  const submitConvert = async (lead: LeadRow, input: ConvertLeadInput): Promise<string | null> => {
    const res = await call(() => p.actions.convert(lead.id, input, newOpId()));
    if (!res.ok) return failText(res, t);
    const out = res.data;
    if (!out.ok) return failText(out, t);
    patch([lead.id], (r) => ({ ...r, status: "recovered", convertedOrderId: out.orderId, convertedVia: "agent", nextAt: null }));
    toast.success(t(out.already ? "landing.leads.toast.alreadyConverted" : "landing.leads.toast.converted", { id: out.orderId.slice(-6) }));
    router.refresh();
    return null;
  };

  const takeNext = async () => {
    const res = await call(() => p.actions.takeNext());
    if (!res.ok) return toast.error(failText(res, t));
    if (!res.data) return toast(t("landing.leads.toast.noneLeft"));
    toast.success(t("landing.leads.toast.taken"));
    setSheet(res.data);
    router.refresh();
  };

  const exportCsv = async (ids?: string[]) => {
    const qs = new URLSearchParams();
    for (const key of ["view", "page", "city", "assignee", "kind", "from", "to"]) {
      const v = query.get(key);
      if (v) qs.set(key, v);
    }
    if (ids?.length) qs.set("ids", ids.join(","));
    const search = qs.toString();
    await downloadFile(store.api(`/leads/export${search ? `?${search}` : ""}`), stepUp, "leads.csv");
  };

  // keyboard (core §I.3): never inside a field or while a sheet, a dialog or a menu is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"]')) return;
      const list = rows;
      if (!list.length) return;
      const key = e.key.toLowerCase();
      const cur = list[active] ?? null;
      const focusRow = (i: number) => {
        setActive(i);
        document.getElementById(`lead-${list[i]!.id}`)?.focus({ preventScroll: false });
      };
      if (key === "j") focusRow(Math.min(list.length - 1, active + 1));
      else if (key === "k") focusRow(Math.max(0, active - 1));
      else if (!cur) return;
      else if (key === "enter") ops.open(cur);
      else if (key === "x") setSelected((s) => toggle(s, cur.id));
      else if (key === "w") ops.contact(cur, "whatsapp");
      else if (key === "c") ops.contact(cur, "call");
      else if (key === "v" && p.can.convert && !p.readOnly && isOpen(cur) && cur.phone) ops.convert(cur);
      else if (key === "l" && p.can.write && !p.readOnly && isOpen(cur)) ops.lost([cur]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, ops, p.can.convert, p.can.write, p.readOnly, rows]);

  const view = (LEAD_VIEWS as readonly string[]).includes(query.get("view")) ? (query.get("view") as LeadView) : "all";
  const filtersActive = view !== "all" || ["page", "city", "assignee", "kind", "period"].some((k) => !!query.get(k));
  const selectable = p.can.write || p.can.assign || p.can.export;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = rows.filter((r) => selected.has(r.id));

  return (
    <InboxContext.Provider value={ctx}>
      <OpsContext.Provider value={ops}>
        <div className="grid gap-5 pb-24">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-1.5">
              <h1 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.02em]">{t("landing.leads.title")}</h1>
              <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{t("landing.leads.description")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {p.can.export && (
                <Button variant="outline" className="h-10 rounded-full px-4" disabled={p.readOnly} title={readOnlyText ?? undefined} onClick={() => exportCsv()}>
                  <DownloadIcon /> {t("landing.leads.export")}
                </Button>
              )}
              {p.can.write && (
                <Button variant="brand" className="h-11 rounded-full px-5 sm:h-10" disabled={p.readOnly} title={readOnlyText ?? undefined} onClick={takeNext}>
                  <HandIcon /> {t("landing.leads.takeNext")}
                </Button>
              )}
            </div>
          </header>

          {(p.readOnly || p.captureOff) && (
            <p className="flex items-start gap-2.5 rounded-2xl bg-foreground/[0.035] px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/[0.06] ring-inset">
              <ShieldAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {p.readOnly ? readOnlyText : t(p.captureOff === "market" ? "landing.leads.captureOff" : "landing.leads.captureOffSetting")}
            </p>
          )}

          <Stats counts={p.counts} />

          <div className="flex flex-col gap-3">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <Segmented
                label={t("landing.leads.views")}
                value={view}
                onChange={(v) => query.set({ view: v === "all" ? null : v, cursor: null })}
                options={LEAD_VIEWS.map((v) => ({ value: v, label: t(`landing.leads.view.${v}`) }))}
              />
            </div>
            <Filters pages={p.pages} cities={p.cities} members={p.members} me={p.me} agent={p.role === "agent"} active={filtersActive} />
          </div>

          {rows.length === 0 ? (
            <div className="relative">
              <LeadRowsSkeleton rows={4} still className="opacity-60 [mask-image:linear-gradient(to_bottom,black_25%,transparent)]" />
              <div className="absolute inset-x-0 top-12 flex flex-col items-center gap-2 px-6 text-center">
                <span className="flex size-10 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border">
                  <InboxIcon aria-hidden="true" className="size-5 text-muted-foreground" />
                </span>
                <h2 className="text-base font-semibold tracking-[-0.01em]">{filtersActive ? t("landing.leads.empty.filtered") : p.captureOff === "market" ? t("landing.leads.captureOff") : t("landing.leads.empty")}</h2>
                {filtersActive ? (
                  <button type="button" onClick={() => query.set({ view: null, page: null, city: null, assignee: null, kind: null, period: null, cursor: null })} className="text-sm font-medium text-brand hover:underline">
                    {t("landing.leads.filter.clear")}
                  </button>
                ) : (
                  <p className="max-w-sm text-sm text-pretty text-muted-foreground">{t("landing.leads.empty.teach")}</p>
                )}
              </div>
            </div>
          ) : (
            <div className={cn("adm-surface overflow-hidden transition-opacity duration-200", query.pending && "opacity-60")}>
              <div role="row" className={cn("hidden items-center gap-3 border-b border-border/60 px-4 py-2.5 text-xs font-medium text-muted-foreground lg:grid", LEAD_ROW_GRID)}>
                <span role="columnheader" className="flex">
                  {selectable && <Checkbox aria-label={t("landing.leads.selectAll")} checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />}
                </span>
                <span role="columnheader" />
                <span role="columnheader">{t("landing.leads.col.customer")}</span>
                <span role="columnheader">{t("landing.leads.col.city")}</span>
                <span role="columnheader">{t("landing.leads.col.selection")}</span>
                <span role="columnheader" className="text-end">{t("landing.leads.col.total")}</span>
                <span role="columnheader" className="text-end">{t("landing.leads.col.age")}</span>
                <span role="columnheader" className="text-end">{t("landing.leads.col.attempts")}</span>
                <span role="columnheader">{t("landing.leads.col.assignee")}</span>
                <span role="columnheader" />
              </div>
              <ul role="rowgroup">
                {rows.map((lead, i) => (
                  <LeadLine
                    key={lead.id}
                    lead={lead}
                    now={now}
                    active={i === active}
                    selectable={selectable}
                    selected={selected.has(lead.id)}
                    onSelect={() => setSelected((s) => toggle(s, lead.id))}
                    onFocus={() => setActive(i)}
                    locale={locale}
                  />
                ))}
              </ul>
              {p.next && (
                <div className="border-t border-border/60 px-4 py-3 text-center">
                  <Button variant="ghost" className="h-11 rounded-full px-5 text-sm lg:h-9" onClick={() => query.set({ cursor: p.next }, { scroll: true })}>
                    {t("landing.leads.more")}
                  </Button>
                </div>
              )}
            </div>
          )}
          <p className="hidden text-xs text-muted-foreground lg:block">{t("landing.leads.keys")}</p>
        </div>

        {selectedRows.length > 0 && (
          <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="region" aria-label={t("landing.leads.bulk.selected", { n: selectedRows.length })}>
            <div className="adm-surface flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full p-1.5 shadow-lg ring-1 ring-foreground/10">
              <span className="px-3 text-sm font-medium whitespace-nowrap tabular-nums">{t("landing.leads.bulk.selected", { n: selectedRows.length })}</span>
              {p.can.assign && (
                <Select disabled={p.readOnly} onValueChange={(v) => ops.assign(selectedRows, v === "none" ? null : v)}>
                  <SelectTrigger className="h-10 w-auto gap-1.5 rounded-full border-0 px-3.5 ring-1 ring-foreground/10 ring-inset" aria-label={t("landing.leads.action.assign")}>
                    <span className="text-sm">{t("landing.leads.action.assign")}</span>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl" side="top">
                    <SelectItem value={p.me}>{t("landing.leads.assign.toMe")}</SelectItem>
                    <SelectItem value="none">{t("landing.leads.assign.pool")}</SelectItem>
                    {p.members
                      .filter((m) => m.id !== p.me)
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {p.can.write && (
                <Button variant="ghost" className="h-10 rounded-full px-3.5 text-destructive hover:bg-destructive/[0.06] hover:text-destructive" disabled={p.readOnly || !selectedRows.some(isOpen)} onClick={() => ops.lost(selectedRows)}>
                  {t("landing.leads.action.lost")}
                </Button>
              )}
              {p.can.export && (
                <Button variant="ghost" className="h-10 rounded-full px-3.5" disabled={p.readOnly} onClick={() => exportCsv(selectedRows.map((r) => r.id))}>
                  {t("landing.leads.bulk.export")}
                </Button>
              )}
              <Button variant="ghost" className="h-10 rounded-full px-3.5 text-muted-foreground" onClick={() => setSelected(new Set())}>
                {t("landing.leads.bulk.clear")}
              </Button>
            </div>
          </div>
        )}

        <LeadSheet lead={sheet} now={now} onClose={() => setSheet(null)} />
        {converting && <ConvertSheet key={converting.idem} lead={converting.lead} idem={converting.idem} onClose={() => setConverting(null)} onSubmit={submitConvert} />}
        {losing && losing.length > 0 && <LostSheet key={losing.map((l) => l.id).join()} leads={losing} onClose={() => setLosing(null)} onConfirm={confirmLost} />}
      </OpsContext.Provider>
    </InboxContext.Provider>
  );
}

/** a v4 UUID for the convert sheet's draft id (drawn when the sheet opens, never during render) */
function newUuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = newOpId();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const toggle = (s: Set<string>, id: string) => {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
};

/** One lead: a grid row from lg, a two-line card with WhatsApp and Call below. A tap opens the lead sheet. */
function LeadLine({ lead, now, active, selectable, selected, onSelect, onFocus, locale }: { lead: LeadRow; now: number; active: boolean; selectable: boolean; selected: boolean; onSelect: () => void; onFocus: () => void; locale: ReturnType<typeof useAdminLocale> }) {
  const t = useT();
  const ops = useOps();
  const total = moneyText(lead.totalCents, lead.currency, locale);
  const age = ageText(lead.createdAt, now, locale);
  const tries = t("landing.leads.attempts", { n: lead.attempts });
  const closed = !isOpen(lead);
  return (
    <li
      id={`lead-${lead.id}`}
      role="row"
      tabIndex={-1}
      onFocus={onFocus}
      onClick={() => ops.open(lead)}
      className={cn(
        "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border/50 px-4 py-3 outline-none transition-colors last:border-b-0 hover:bg-foreground/[0.02] focus-visible:bg-brand/[0.05] lg:gap-3 lg:py-2.5",
        LEAD_ROW_GRID,
        active && "bg-brand/[0.04]",
        selected && "bg-brand/[0.06]",
        closed && "text-foreground/70",
      )}
    >
      <span role="cell" className="hidden lg:flex" onClick={(e) => e.stopPropagation()}>
        {selectable && <Checkbox aria-label={t("landing.leads.select")} checked={selected} onCheckedChange={onSelect} />}
      </span>
      <span role="cell" className="hidden items-center gap-1.5 lg:flex">
        <StatusPill status={lead.status} />
      </span>
      <span role="cell" className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{lead.name || t("landing.leads.noName")}</span>
          {lead.isTest && <TestChip />}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <KindMark lead={lead} />
          <MaskedPhone phone={lead.phone} />
          <span className="truncate lg:hidden">{lead.city ? `· ${lead.city}` : ""}</span>
        </span>
      </span>
      <span role="cell" className="hidden truncate text-sm lg:block">
        {lead.city ?? "…"}
      </span>
      <span role="cell" className="col-span-2 grid min-w-0 gap-1 lg:col-span-1">
        <span dir="auto" className="truncate text-sm text-foreground/85" title={lead.selection ?? undefined}>
          {lead.selection || "…"}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="lg:hidden">
            <StatusPill status={lead.status} className="h-5 px-2 text-[0.6875rem]" />
          </span>
          <span className="truncate">{lead.pageName}</span>
          <span className="tabular-nums lg:hidden">{total ? `· ${total}` : ""}</span>
          <span className="tabular-nums lg:hidden">· {age}</span>
          <span className="tabular-nums lg:hidden">· {tries}</span>
        </span>
      </span>
      <span role="cell" className="hidden text-end text-sm font-semibold tabular-nums lg:block">
        {total ?? "…"}
      </span>
      <span role="cell" className="hidden text-end text-sm text-muted-foreground tabular-nums lg:block">
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{age}</span>
          </TooltipTrigger>
          <TooltipContent>{new Date(lead.createdAt).toLocaleString(locale === "ar" ? "ar-MA-u-nu-latn" : locale)}</TooltipContent>
        </Tooltip>
      </span>
      <span role="cell" className="hidden text-end text-sm tabular-nums lg:block">
        {intFmt(locale).format(lead.attempts)}
      </span>
      <span role="cell" className="hidden min-w-0 lg:flex">
        <Assignee id={lead.assigneeId} />
      </span>
      <span role="cell" className="col-start-2 row-start-1 flex items-center justify-end gap-0.5 lg:col-start-auto lg:row-start-auto" onClick={(e) => e.stopPropagation()}>
        {!closed && <ContactButtons lead={lead} />}
        <LeadMenu lead={lead} />
      </span>
    </li>
  );
}

/** The 30-day header: real counts with n, a % hidden below 20, "Recovered" with confirmed and delivered on hover. */
function Stats({ counts }: { counts: LeadCounts }) {
  const t = useT();
  const locale = useAdminLocale();
  const num = intFmt(locale);
  const pct = new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { style: "percent", maximumFractionDigits: 1 });
  const tile = (label: string, value: string, foot: React.ReactNode, hint?: string) => {
    const body = (
      <div className="grid min-w-0 gap-1 px-4 py-3.5 sm:px-5">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xl leading-tight font-semibold tracking-[-0.02em] tabular-nums">{value}</span>
        <span className="truncate text-xs text-muted-foreground tabular-nums">{foot}</span>
      </div>
    );
    return hint ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <div tabIndex={0} className="cursor-default rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {body}
          </div>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    ) : (
      body
    );
  };
  const r = counts.recovered;
  return (
    <section aria-label={t("landing.leads.window", { days: counts.days })} className="adm-surface grid grid-cols-2 divide-border/60 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x rtl:lg:divide-x-reverse [&>*]:border-border/60 max-lg:[&>*]:border-b">
      {tile(t("landing.leads.stat.leads"), num.format(counts.leads), t("landing.leads.window", { days: counts.days }))}
      {tile(t("landing.leads.stat.contacted"), num.format(counts.contacted), t("landing.leads.stat.n", { n: num.format(counts.leads) }))}
      {tile(
        t("landing.leads.stat.recovered"),
        num.format(r.n),
        r.pct === null ? t("landing.leads.stat.needsMore") : t("landing.leads.stat.recoveredPct", { pct: pct.format(r.pct / 100) }),
        t("landing.leads.stat.recoveredHint", { n: num.format(r.n), confirmed: num.format(r.confirmed), delivered: num.format(r.delivered) }),
      )}
      {tile(t("landing.leads.stat.withoutContact"), num.format(counts.convertedWithoutContact), t("landing.leads.window", { days: counts.days }))}
      {tile(
        t("landing.leads.stat.firstContact"),
        counts.firstContactP50Min === null ? "…" : t("landing.leads.stat.minutes", { n: num.format(counts.firstContactP50Min) }),
        counts.firstContactP50Min === null ? t("landing.leads.stat.needsMore") : t("landing.leads.stat.n", { n: num.format(counts.firstContactN) }),
      )}
    </section>
  );
}

/** Page, city, assignee (managers), kind and period, in the URL. */
function Filters({ pages, cities, members, me, agent, active }: { pages: { id: string; name: string }[]; cities: string[]; members: LeadMember[]; me: string; agent: boolean; active: boolean }) {
  const t = useT();
  const query = useQueryState();
  const ALL = "__all";
  const pick = (key: string) => (v: string) => query.set({ [key]: v === ALL ? null : v, cursor: null });
  const trigger = "h-10 w-auto min-w-[8.5rem] max-w-[14rem] shrink-0 gap-1.5 rounded-full px-3.5 text-sm lg:h-9";
  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
      <Select value={query.get("page") || ALL} onValueChange={pick("page")}>
        <SelectTrigger className={trigger} aria-label={t("landing.leads.filter.page")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value={ALL}>{t("landing.leads.filter.allPages")}</SelectItem>
          {pages.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={query.get("city") || ALL} onValueChange={pick("city")}>
        <SelectTrigger className={trigger} aria-label={t("landing.leads.filter.city")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value={ALL}>{t("landing.leads.filter.allCities")}</SelectItem>
          {cities.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!agent && (
        <Select value={query.get("assignee") || ALL} onValueChange={pick("assignee")}>
          <SelectTrigger className={trigger} aria-label={t("landing.leads.filter.assignee")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value={ALL}>{t("landing.leads.filter.anyone")}</SelectItem>
            <SelectItem value="none">{t("landing.leads.unassigned")}</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.id === me ? `${m.name} (${t("landing.leads.you")})` : m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select value={query.get("kind") || ALL} onValueChange={pick("kind")}>
        <SelectTrigger className={trigger} aria-label={t("landing.leads.filter.kind")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value={ALL}>{t("landing.leads.filter.allKinds")}</SelectItem>
          <SelectItem value="form">{t("landing.leads.kind.form")}</SelectItem>
          <SelectItem value="whatsapp">{t("landing.leads.kind.whatsapp")}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={query.get("period") || ALL} onValueChange={pick("period")}>
        <SelectTrigger className={trigger} aria-label={t("landing.leads.filter.period")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          <SelectItem value={ALL}>{t("landing.leads.period.30d")}</SelectItem>
          <SelectItem value="7d">{t("landing.leads.period.7d")}</SelectItem>
          <SelectItem value="today">{t("landing.leads.period.today")}</SelectItem>
        </SelectContent>
      </Select>
      {active && (
        <button type="button" onClick={() => query.set({ view: null, page: null, city: null, assignee: null, kind: null, period: null, cursor: null })} className="shrink-0 px-2 text-sm font-medium whitespace-nowrap text-brand hover:underline">
          {t("landing.leads.filter.clear")}
        </button>
      )}
    </div>
  );
}
