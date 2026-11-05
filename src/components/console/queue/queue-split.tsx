"use client";
/**
 * The approval queue's split view (platform.md PLA-§3.5 "Layout", "Keyboard", "Decisions"; PLA-§4.7 rules 1, 2, 6;
 * PD52, PD65):
 *   - ≥ 1280 px: list 44 % | detail 56 % (react-resizable-panels), each pane scrolling under the sticky queue header;
 *   - 768-1279 px: the list, and the detail in a full-height sheet when a row is opened;
 *   - < 768 px: the list as cards, the detail full screen with a bottom bar (Approve, Ask, Reject, ⋯), 44 px targets.
 * Decisions are optimistic (`useOptimistic`: the row leaves at once and comes back on a refusal), carry an `opId`, and
 * end with the server's `refresh()`; a lost race says "Already decided by <name>". After a decision the next row gets
 * the focus and its detail is prefetched. A bulk bar replaces the decision bar while rows are selected (Shift+A
 * approves them, fast lane only). Tenant HTML renders only inside the detail's sandboxed preview iframe.
 *
 *   <QueueSplit list={list} pane={pane} tab="review" q="" slaHours={24} grants={{ decide: true, block: true, viewAs: true }} />
 */
import { CheckCheckIcon, ChevronLeftIcon, InboxIcon, MoreHorizontalIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import {
  approveBulkAction,
  approveReviewAction,
  askInfoAction,
  loadReviewPaneAction,
  rejectReviewAction,
  reopenReviewAction,
  resolveRequestAction,
  snoozeReviewAction,
} from "@/app/admin/(console)/queue/actions";
import { StepUpSheet } from "@/components/admin/common/step-up-sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/admin/client";
import type { QueueList, QueueListRow } from "@/lib/platform/queue";
import type { ReviewPane } from "@/lib/platform/queue-pane";
import type { GrantSpec, QueueTab, RejectReason, SnoozeChoice } from "@/lib/platform/queue-rules";
import type { ActionResult } from "@/lib/tenancy/types";
import { cn } from "@/lib/utils";
import { durationText } from "../format";
import { newOpId } from "../op";
import { PanelError } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { useConsolePulse } from "../shell/pulse-provider";
import { useNow, useScreenKeys } from "../shell/context";
import styles from "../shell/console.module.css";
import { ApproveNoteDialog, AskDialog, button, Kbd, RejectDialog, ResolveDialog, SnoozeDialog } from "./decision-dialogs";
import { QueueDetail, QueueDetailSkeleton } from "./queue-detail";
import { QueueHeader } from "./queue-header";
import { queueHref } from "./queue-nav";
import { nextAfterDecision, nextAfterMany, type QueueCommand, type QueueKeyRow } from "./queue-keymap";
import { QueueRow } from "./queue-row";
import { useQueueKeys } from "./use-queue-keys";

type Layout = "split" | "sheet" | "phone";
type PaneState = { state: "ok"; pane: ReviewPane } | { state: "loading" } | { state: "error"; ref: string };
type Dialog =
  | { kind: "approve_note"; row: QueueListRow }
  | { kind: "ask"; row: QueueListRow }
  | { kind: "reject"; row: QueueListRow }
  | { kind: "snooze"; row: QueueListRow }
  | { kind: "resolve"; row: QueueListRow; outcome: "grant" | "decline" }
  | null;
type Decide = (ids: string[], call: (opId: string) => Promise<ActionResult<unknown>>, done: (data: unknown) => string | null, opId?: string) => void;
type DecisionData = { ok: true } | { ok: false; error: "already_decided"; by: { name: string } | null };

const handleOf = (r: QueueListRow) => (r.store.handle ? `@${r.store.handle}` : r.store.name);
const isRequestRow = (r: QueueListRow) => !!r.request || (r.kind !== "signup" && r.kind !== "reopen");
const isOpen = (r: QueueListRow) => r.status === "pending" || r.status === "needs_info" || r.status === "snoozed";
const fastLane = (r: QueueListRow) => (r.kind === "signup" || r.kind === "reopen") && r.band === "fast" && r.holds.length === 0 && r.status !== "needs_info" && isOpen(r);

const WIDE = "(min-width: 1280px)";
const MID = "(min-width: 768px)";
function subscribeLayout(onChange: () => void): () => void {
  const wide = window.matchMedia(WIDE);
  const mid = window.matchMedia(MID);
  wide.addEventListener("change", onChange);
  mid.addEventListener("change", onChange);
  return () => {
    wide.removeEventListener("change", onChange);
    mid.removeEventListener("change", onChange);
  };
}
const readLayout = (): Layout => (window.matchMedia(WIDE).matches ? "split" : window.matchMedia(MID).matches ? "sheet" : "phone");

/** The viewport's layout; `null` on the server and during hydration (the list alone, at every width). */
function useLayout(): Layout | null {
  return useSyncExternalStore(subscribeLayout, readLayout, () => null);
}

export interface QueueGrants {
  decide: boolean;
  block: boolean;
  viewAs: boolean;
}

export function QueueSplit({
  list,
  pane: initialPane,
  tab,
  q,
  cursor,
  initialActive,
  slaHours,
  grants,
}: {
  list: QueueList;
  pane: { state: "ok"; data: ReviewPane } | { state: "error"; ref: string } | null;
  tab: QueueTab;
  q: string;
  cursor: string | null;
  /** the `?r=` row (opens the sheet below 1280 px) */
  initialActive: string | null;
  slaHours: number | null;
  grants: QueueGrants;
}) {
  const t = useT();
  const router = useRouter();
  const layout = useLayout();
  const { pulse, okAt } = useConsolePulse();
  const now = useNow(30_000);
  const [, startDecision] = useTransition();
  const [searching, startSearch] = useTransition();

  const [rows, hide] = useOptimistic(list.rows, (current: QueueListRow[], ids: readonly string[]) => current.filter((r) => !ids.includes(r.id)));
  const [active, setActive] = useState<string | null>(initialActive ?? list.rows[0]?.id ?? null);
  const [sheetOpen, setSheetOpen] = useState<boolean>(!!initialActive);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [stepUp, setStepUp] = useState<null | (() => void)>(null);
  const [panes, setPanes] = useState<ReadonlyMap<string, PaneState>>(() => {
    const m = new Map<string, PaneState>();
    if (initialPane?.state === "ok") m.set(initialPane.data.detail.id, { state: "ok", pane: initialPane.data });
    return m;
  });
  const inflight = useRef(new Set<string>());
  const listRef = useRef<HTMLDivElement>(null);

  // another tab or page: the selection belonged to the old rows, the first row takes the focus
  const view = `${tab}|${q}|${cursor ?? ""}`;
  const [seenView, setSeenView] = useState(view);
  if (view !== seenView) {
    setSeenView(view);
    setSelected(new Set());
    setActive((a) => (a && list.rows.some((r) => r.id === a) ? a : (list.rows[0]?.id ?? null)));
  }

  // a server refresh (after a decision, a pulse change) brings a fresh first pane: keep it
  const [seenPane, setSeenPane] = useState(initialPane);
  if (initialPane !== seenPane) {
    setSeenPane(initialPane);
    if (initialPane?.state === "ok") {
      const p = initialPane.data;
      setPanes((m) => new Map(m).set(p.detail.id, { state: "ok", pane: p }));
    }
  }

  // the active row stays a listed row; when it left the list, the first row takes over
  const activeRow = rows.find((r) => r.id === active) ?? null;
  if (active && !activeRow && !list.rows.some((r) => r.id === active)) setActive(rows[0]?.id ?? null);

  const panesRef = useRef(panes);
  useEffect(() => {
    panesRef.current = panes;
  }, [panes]);

  const loadPane = useCallback(async (id: string, force = false) => {
    if (inflight.current.has(id)) return;
    const have = panesRef.current.get(id);
    if (!force && have && have.state !== "error") return;
    // a pane not loaded yet shows the bones (no entry), a reload keeps the pane on screen
    inflight.current.add(id);
    try {
      const r = await loadReviewPaneAction({ reviewId: id });
      setPanes((m) => new Map(m).set(id, r.ok ? { state: "ok", pane: r.data } : { state: "error", ref: r.error.slice(0, 8) }));
    } catch {
      setPanes((m) => new Map(m).set(id, { state: "error", ref: "network" }));
    } finally {
      inflight.current.delete(id);
    }
  }, []);

  // the active row's detail on the next tick (holding J skips the rows it passes), and the row after it warmed in the
  // background
  useEffect(() => {
    if (!active) return;
    const now = setTimeout(() => void loadPane(active), 0);
    const at = rows.findIndex((r) => r.id === active);
    const next = at >= 0 ? rows[at + 1] : undefined;
    const later = next ? setTimeout(() => void loadPane(next.id), 400) : undefined;
    return () => {
      clearTimeout(now);
      if (later) clearTimeout(later);
    };
  }, [active, rows, loadPane]);

  // the URL names the open row, so a link from ⌘K or a note opens it (no server round trip)
  useEffect(() => {
    const href = queueHref(tab, q, { ...(cursor ? { cursor } : {}), ...(active && (layout === "split" || sheetOpen) ? { r: active } : {}) });
    if (typeof window !== "undefined" && window.location.pathname + window.location.search !== href) window.history.replaceState(window.history.state, "", href);
  }, [active, tab, q, cursor, layout, sheetOpen]);

  // a new submission or answer shows up within one pulse (PLA-§3.5 acceptance): refresh while nothing is open
  const queueSig = pulse ? `${pulse.queue.review}|${pulse.queue.hold}|${pulse.queue.requests}|${pulse.queue.needsInfoAnswered}` : "";
  const lastSig = useRef(queueSig);
  useEffect(() => {
    if (!queueSig || queueSig === lastSig.current) return;
    lastSig.current = queueSig;
    if (!dialog && !stepUp) router.refresh();
  }, [queueSig, dialog, stepUp, router]);

  const focusRow = useCallback((id: string | null) => {
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`qrow-${id}`);
      if (el && document.activeElement !== el && !(document.activeElement && (document.activeElement as HTMLElement).closest?.('[role="dialog"]'))) el.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const select = useCallback(
    (id: string, open = true) => {
      setActive(id);
      if (open && layout !== "split") setSheetOpen(true);
      focusRow(id);
    },
    [layout, focusRow],
  );

  const toggle = useCallback((id: string) => setSelected((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id))), []);

  /* ---------------- decisions ---------------- */

  // the step-up retry re-sends the same decision (same opId) through the latest `decide`
  const decideRef = useRef<Decide | null>(null);

  /**
   * One optimistic decision: the row(s) leave, the next row gets the focus and its pane loads, the action runs with
   * its operation id; a refusal brings the row back (the optimistic state ends with the transition) and says why.
   */
  const decide = useCallback<Decide>(
    (ids, call, done, opId = newOpId()) => {
      const order = rows.map((r) => r.id);
      const next = ids.length === 1 ? nextAfterDecision(order, ids[0]!) : nextAfterMany(order, ids);
      setActive(next);
      if (next) void loadPane(next);
      focusRow(next);
      setSelected((s) => new Set([...s].filter((x) => !ids.includes(x))));
      if (!next) setSheetOpen(false);
      startDecision(async () => {
        hide(ids);
        let r: ActionResult<unknown>;
        try {
          r = await call(opId);
        } catch {
          r = { ok: false, error: "server" };
        }
        setPanes((m) => {
          const n = new Map(m);
          for (const id of ids) n.delete(id);
          return n;
        });
        if (!r.ok) {
          if (r.error === "step_up") {
            setStepUp(() => () => decideRef.current?.(ids, call, done, opId));
            return;
          }
          setActive(ids[0]!);
          focusRow(ids[0]!);
          toast.error(r.message ? t(r.message) : t(`console.queue.error.${r.error === "forbidden" || r.error === "conflict" || r.error === "status_changed" || r.error === "rate_limited" ? r.error : "server"}`));
          return;
        }
        const d = r.data as DecisionData | undefined;
        if (d && typeof d === "object" && "ok" in d && d.ok === false && d.error === "already_decided") {
          toast(t("console.queue.already_decided", { name: d.by?.name || t("console.queue.someone") }));
          return;
        }
        const msg = done(r.data);
        if (msg) toast.success(msg);
      });
    },
    [rows, hide, loadPane, focusRow, t],
  );

  useEffect(() => {
    decideRef.current = decide;
  }, [decide]);

  const approve = useCallback(
    (row: QueueListRow, note?: string) =>
      decide([row.id], (opId) => approveReviewAction({ reviewId: row.id, ...(note ? { note } : {}), opId }), () => t("console.queue.done.approved", { store: handleOf(row) })),
    [decide, t],
  );

  const startApprove = useCallback(
    (row: QueueListRow) => {
      if (!grants.decide || !isOpen(row)) return;
      if (isRequestRow(row)) return setDialog({ kind: "resolve", row, outcome: "grant" });
      if (row.kind === "reopen" && row.store.status === "rejected") {
        return decide([row.id], (opId) => reopenReviewAction({ reviewId: row.id, opId }), () => t("console.queue.done.reopened", { store: handleOf(row) }));
      }
      if (row.band === "hold" || row.band === "reject_candidate") return setDialog({ kind: "approve_note", row });
      approve(row);
    },
    [grants.decide, approve, decide, t],
  );

  const startReject = useCallback(
    (row: QueueListRow) => {
      if (!grants.decide || !isOpen(row)) return;
      setDialog(isRequestRow(row) ? { kind: "resolve", row, outcome: "decline" } : { kind: "reject", row });
    },
    [grants.decide],
  );

  const bulkApprove = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      decide(
        ids,
        (opId) => approveBulkAction({ reviewIds: ids, opId }),
        (data) => {
          const d = data as { approved: string[]; skipped: unknown[] };
          return d.skipped.length ? t("console.queue.done.bulk_skipped", { approved: d.approved.length, skipped: d.skipped.length }) : t("console.queue.done.bulk", { count: d.approved.length });
        },
      );
    },
    [decide, t],
  );

  const openProfile = useCallback((row: QueueListRow) => router.push(`/admin/stores/${row.storeId}`), [router]);
  const viewAs = useCallback((row: QueueListRow) => router.push(`/admin/stores/${row.storeId}?sheet=view-as`), [router]);

  /* ---------------- keyboard ---------------- */

  const keyRows = useMemo<QueueKeyRow[]>(() => rows.map((r) => ({ id: r.id, fast: fastLane(r), decidable: tab !== "decided" && isOpen(r), request: isRequestRow(r) })), [rows, tab]);
  const selectedIds = useMemo(() => rows.filter((r) => selected.has(r.id)).map((r) => r.id), [rows, selected]);
  const onCommand = useCallback(
    (cmd: QueueCommand) => {
      const row = "id" in cmd ? rows.find((r) => r.id === cmd.id) : undefined;
      switch (cmd.kind) {
        case "focus":
          return select(cmd.id, false);
        case "open":
          return row && openProfile(row);
        case "view_as":
          return row && grants.viewAs && viewAs(row);
        case "approve":
          return row && startApprove(row);
        case "reject":
          return row && startReject(row);
        case "ask":
          return row && setDialog({ kind: "ask", row });
        case "snooze":
          return row && setDialog({ kind: "snooze", row });
        case "toggle":
          return toggle(cmd.id);
        case "clear":
          return setSelected(new Set());
        case "bulk_approve":
          return bulkApprove(cmd.ids);
      }
    },
    [rows, select, openProfile, viewAs, startApprove, startReject, toggle, bulkApprove, grants.viewAs],
  );
  useQueueKeys({ rows: keyRows, active, selected: selectedIds, tab, canDecide: grants.decide }, onCommand);

  useScreenKeys({
    title: t("console.keys.group.queue"),
    lines: [
      { label: t("console.keys.queue.move"), keys: ["J", "K"] },
      { label: t("console.keys.queue.open"), keys: ["E"] },
      ...(grants.viewAs ? [{ label: t("console.keys.queue.view_as"), keys: ["V"] }] : []),
      ...(grants.decide
        ? [
            { label: t("console.keys.queue.approve"), keys: ["A"] },
            { label: t("console.keys.queue.ask"), keys: ["I"] },
            { label: t("console.keys.queue.reject"), keys: ["R"] },
            { label: t("console.keys.queue.snooze"), keys: ["S"] },
            { label: t("console.keys.queue.select"), keys: ["X"] },
            { label: t("console.keys.queue.bulk"), keys: ["⇧", "A"] },
          ]
        : []),
    ],
  });

  /* ---------------- pieces ---------------- */

  const pushSearch = (v: string) => startSearch(() => router.replace(queueHref(tab, v), { scroll: false }));

  const emptyText = q ? t("console.queue.empty.search", { q }) : t(`console.queue.empty.${tab}`);
  const lastPulse = okAt ? durationText(now - okAt) : null;

  const listBody = (
    <div ref={listRef} role="listbox" aria-label={t("console.queue.list_label", { tab: t(`console.queue.tab.${tab}`) })} aria-multiselectable="true" aria-activedescendant={active ? `qrow-${active}` : undefined} className={cn("min-w-0", searching && "opacity-60 transition-opacity")}>
      {rows.length === 0 ? (
        <div className="grid justify-items-start gap-1.5 px-5 py-10">
          <InboxIcon aria-hidden="true" className="mb-1 size-5 text-muted-foreground" />
          <p className="text-[13px] font-medium">{emptyText}</p>
          <p className="text-[12px] text-muted-foreground" suppressHydrationWarning>{lastPulse ? t("console.queue.empty.checked", { ago: t("console.time.ago", { d: lastPulse }) }) : t("console.queue.empty.checked_now")}</p>
          {q && (
            <button type="button" onClick={() => pushSearch("")} className="mt-1 rounded-[4px] text-[12px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
              {t("console.queue.search.clear")}
            </button>
          )}
        </div>
      ) : (
        rows.map((row) => (
          <QueueRow
            key={row.id}
            row={row}
            active={row.id === active}
            selected={selected.has(row.id)}
            selecting={selected.size > 0}
            onOpen={(id) => select(id)}
            onToggle={toggle}
          />
        ))
      )}
      {(list.next || cursor) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[12px]">
          {cursor ? (
            <PrefetchLink href={queueHref(tab, q)} className="rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:inline-flex max-md:min-h-11 max-md:items-center">
              {t("console.queue.first_page")}
            </PrefetchLink>
          ) : (
            <span />
          )}
          {list.next && (
            <PrefetchLink href={queueHref(tab, q, { cursor: list.next })} className="rounded-[4px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:inline-flex max-md:min-h-11 max-md:items-center">
              {t("console.queue.next_page")}
            </PrefetchLink>
          )}
        </div>
      )}
    </div>
  );

  const paneState = active ? panes.get(active) : undefined;
  const bulk =
    selected.size > 0 ? (
      <BulkBar
        count={selectedIds.length}
        approvable={tab === "fast" ? keyRows.filter((r) => selected.has(r.id) && r.fast && r.decidable).map((r) => r.id) : []}
        tab={tab}
        canDecide={grants.decide}
        onApprove={bulkApprove}
        onClear={() => setSelected(new Set())}
      />
    ) : null;

  const bar = (row: QueueListRow, phone: boolean) =>
    bulk ??
    (grants.decide && tab !== "decided" && isOpen(row) ? (
      <DecisionBar
        row={row}
        phone={phone}
        onApprove={() => startApprove(row)}
        onAsk={() => setDialog({ kind: "ask", row })}
        onReject={() => startReject(row)}
        onSnooze={() => setDialog({ kind: "snooze", row })}
        onOpenProfile={() => openProfile(row)}
        onViewAs={grants.viewAs ? () => viewAs(row) : null}
      />
    ) : null);

  const detail = (phone: boolean) => {
    if (!activeRow) return <NoSelection />;
    if (!paneState || paneState.state === "loading") return <QueueDetailSkeleton />;
    if (paneState.state === "error")
      return (
        <div className="grid gap-2 py-6">
          <PanelError reference={paneState.ref} />
          <div className="px-4">
            <button type="button" className={cn(button.base, button.secondary)} onClick={() => {
                // the retry shows the bones while it loads
                setPanes((m) => new Map(m).set(activeRow.id, { state: "loading" }));
                void loadPane(activeRow.id, true);
              }}>
              {t("console.panel.retry")}
            </button>
          </div>
        </div>
      );
    return (
      <QueueDetail
        pane={paneState.pane}
        bar={bar(activeRow, phone)}
        onReload={() => void loadPane(activeRow.id, true)}
        onOpenProfile={() => openProfile(activeRow)}
        onViewAs={() => viewAs(activeRow)}
        canViewAs={grants.viewAs}
      />
    );
  };

  const header = <QueueHeader tab={tab} counts={list.counts} sla={list.sla} slaHours={slaHours} q={q} truncated={list.truncated} onSearch={pushSearch} />;

  return (
    <div className="-mx-4 -mt-5 -mb-16 flex flex-col md:-mx-6 lg:-mx-8 lg:-mt-7 xl:h-[calc(100dvh-3.5rem)]">
      {header}
      {layout === "split" ? (
        <div className="min-h-0 flex-1">
        <Group orientation="horizontal" id="sg-queue-split">
          <Panel id="list" defaultSize="44" minSize="30" maxSize="60" className="min-w-0">
            <div className="h-full overflow-y-auto overscroll-contain">
              {listBody}
              {!activeRow && bulk && <div className="sticky bottom-0">{bulk}</div>}
            </div>
          </Panel>
          <Separator className="group/sep relative w-px bg-[var(--c-hairline)] outline-none after:absolute after:inset-y-0 after:-start-1 after:-end-1 after:content-[''] focus-visible:bg-[var(--ring)] data-[separator=active]:bg-[var(--brand)] data-[separator=hover]:bg-[var(--border)]" />
          <Panel id="detail" defaultSize="56" minSize="40" className="min-w-0">
            <div className="h-full overflow-y-auto overscroll-contain bg-card">{detail(false)}</div>
          </Panel>
        </Group>
        </div>
      ) : layout === null ? (
        // before the first measure: the list alone at every width, so a phone never paints the desktop split
        <div className="min-h-0 flex-1 xl:grid xl:grid-cols-[44%_1fr]">
          <div className="min-w-0 xl:overflow-y-auto">{listBody}</div>
          <div className="hidden min-w-0 border-s border-[var(--c-hairline)] bg-card xl:block xl:overflow-y-auto">{detail(false)}</div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 pb-20">{listBody}</div>
          {bulk && <div className="fixed inset-x-0 bottom-0 z-30 lg:start-[240px]">{bulk}</div>}
          <DialogPrimitive.Root open={sheetOpen && !!activeRow} onOpenChange={setSheetOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[oklch(0.2_0.01_230/0.32)] max-md:hidden" />
              <DialogPrimitive.Content
                aria-describedby={undefined}
                onOpenAutoFocus={(e) => e.preventDefault()}
                className={cn(
                  styles.drawer,
                  "fixed inset-y-0 end-0 z-40 flex w-full flex-col bg-card outline-none md:w-[min(720px,92vw)] md:shadow-[0_0_0_1px_var(--c-hairline),-24px_0_64px_-32px_oklch(0.2_0.01_230/0.35)]",
                )}
              >
                <DialogPrimitive.Title className="sr-only">{activeRow?.store.name ?? t("console.queue.page_title")}</DialogPrimitive.Title>
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--c-hairline)] px-2">
                  <DialogPrimitive.Close className="inline-flex h-11 items-center gap-1 rounded-[var(--r-control)] px-2 text-[13px] font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                    <ChevronLeftIcon aria-hidden="true" className="size-4 rtl:rotate-180" />
                    {t("console.queue.back_to_list")}
                  </DialogPrimitive.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{detail(layout === "phone")}</div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </>
      )}

      {dialog?.kind === "approve_note" && (
        <ApproveNoteDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          store={dialog.row.store.name}
          band={dialog.row.band}
          onSubmit={(note) => {
            const row = dialog.row;
            setDialog(null);
            approve(row, note);
          }}
        />
      )}
      {dialog?.kind === "ask" && (
        <AskDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          store={dialog.row.store.name}
          onSubmit={(question) => {
            const row = dialog.row;
            setDialog(null);
            decide([row.id], (opId) => askInfoAction({ reviewId: row.id, question, opId }), () => t("console.queue.done.asked", { store: handleOf(row) }));
          }}
        />
      )}
      {dialog?.kind === "reject" && (
        <RejectDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          store={dialog.row.store.name}
          canBlock={grants.block}
          appeal={dialog.row.kind === "reopen"}
          onSubmit={(v: { reason: RejectReason; note: string; block: boolean }) => {
            const row = dialog.row;
            setDialog(null);
            decide(
              [row.id],
              (opId) => rejectReviewAction({ reviewId: row.id, reason: v.reason, ...(v.note ? { note: v.note } : {}), ...(v.block ? { block: true } : {}), opId }),
              () => t(v.block ? "console.queue.done.rejected_blocked" : "console.queue.done.rejected", { store: handleOf(row) }),
            );
          }}
        />
      )}
      {dialog?.kind === "snooze" && (
        <SnoozeDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          store={dialog.row.store.name}
          onPick={(until: SnoozeChoice) => {
            const row = dialog.row;
            setDialog(null);
            decide([row.id], (opId) => snoozeReviewAction({ reviewId: row.id, until, opId }), () => t("console.queue.done.snoozed", { store: handleOf(row), until: t(`console.queue.snooze.${until}`) }));
          }}
        />
      )}
      {dialog?.kind === "resolve" && (
        <ResolveDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          store={dialog.row.store.name}
          kind={dialog.row.kind}
          request={dialog.row.request}
          outcome={dialog.outcome}
          onSubmit={(v: { outcome: "grant" | "decline"; note: string; grant?: GrantSpec }) => {
            const row = dialog.row;
            setDialog(null);
            decide(
              [row.id],
              (opId) => resolveRequestAction({ reviewId: row.id, outcome: v.outcome, ...(v.note ? { note: v.note } : {}), ...(v.grant ? { grant: v.grant } : {}), opId }),
              () => t(v.outcome === "grant" ? "console.queue.done.granted" : "console.queue.done.declined", { store: handleOf(row) }),
            );
          }}
        />
      )}
      <StepUpSheet
        open={!!stepUp}
        surface="console"
        onClose={() => setStepUp(null)}
        onVerified={() => {
          const retry = stepUp;
          setStepUp(null);
          retry?.();
        }}
      />
    </div>
  );
}

function NoSelection() {
  const t = useT();
  return (
    <div className="grid h-full min-h-[320px] place-items-center px-6 text-center">
      <div className="grid justify-items-center gap-1.5">
        <CheckCheckIcon aria-hidden="true" className="size-5 text-muted-foreground" />
        <p className="text-[13px] font-medium">{t("console.queue.no_selection")}</p>
        <p className="text-[12px] text-muted-foreground">{t("console.queue.no_selection_hint")}</p>
      </div>
    </div>
  );
}

function DecisionBar({
  row,
  phone,
  onApprove,
  onAsk,
  onReject,
  onSnooze,
  onOpenProfile,
  onViewAs,
}: {
  row: QueueListRow;
  phone: boolean;
  onApprove(): void;
  onAsk(): void;
  onReject(): void;
  onSnooze(): void;
  onOpenProfile(): void;
  onViewAs: (() => void) | null;
}) {
  const t = useT();
  const request = isRequestRow(row);
  const appealRejected = row.kind === "reopen" && row.store.status === "rejected";
  const approveLabel = request ? t("console.request.grant") : appealRejected ? t("console.queue.reopen") : t("console.queue.approve");
  const rejectLabel = request ? t("console.request.decline") : t("console.queue.reject");
  return (
    <div className={cn("sticky bottom-0 z-10 mt-auto flex items-center gap-2 border-t border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--card)_92%,transparent)] px-4 py-2.5 backdrop-blur-[2px] md:px-5", phone && "pb-[max(10px,env(safe-area-inset-bottom))]")}>
      <button type="button" onClick={onApprove} className={cn(button.base, button.primary, phone && "flex-1")}>
        {approveLabel}
        <Kbd>A</Kbd>
      </button>
      {!request && (
        <button type="button" onClick={onAsk} className={cn(button.base, button.secondary, phone && "flex-1")}>
          {t("console.queue.ask")}
          <Kbd>I</Kbd>
        </button>
      )}
      <button type="button" onClick={onReject} className={cn(button.base, button.danger, phone && "flex-1")}>
        {rejectLabel}
        <Kbd>R</Kbd>
      </button>
      {phone ? (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={t("console.queue.more_actions")} className={cn(button.base, button.ghost, "w-11 px-0")}>
            <MoreHorizontalIcon aria-hidden="true" className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="min-w-[200px]">
            <DropdownMenuItem onSelect={onSnooze} className="min-h-11 text-[13px]">
              {t("console.queue.snooze_action")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenProfile} className="min-h-11 text-[13px]">
              {t("console.queue.open_profile")}
            </DropdownMenuItem>
            {onViewAs && (
              <DropdownMenuItem onSelect={onViewAs} className="min-h-11 text-[13px]">
                {t("console.queue.view_as")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" onClick={onSnooze} className={cn(button.base, button.ghost, "ms-auto")}>
          {t("console.queue.snooze_action")}
          <Kbd>S</Kbd>
        </button>
      )}
    </div>
  );
}

function BulkBar({ count, approvable, tab, canDecide, onApprove, onClear }: { count: number; approvable: string[]; tab: QueueTab; canDecide: boolean; onApprove(ids: string[]): void; onClear(): void }) {
  const t = useT();
  return (
    <div role="region" aria-label={t("console.queue.bulk.label")} className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--c-hairline)] bg-[color-mix(in_oklch,var(--brand-soft)_70%,var(--card))] px-4 py-2.5 pb-[max(10px,env(safe-area-inset-bottom))] md:px-5">
      <span className="num text-[13px] font-medium">{t("console.queue.bulk.selected", { count })}</span>
      {tab === "fast" ? (
        canDecide && (
          <button type="button" disabled={!approvable.length} onClick={() => onApprove(approvable)} className={cn(button.base, button.primary)}>
            {t("console.queue.bulk.approve", { count: approvable.length })}
            <Kbd>⇧A</Kbd>
          </button>
        )
      ) : (
        <span className="text-[12px] text-muted-foreground">{t("console.queue.bulk.fast_only")}</span>
      )}
      <button type="button" onClick={onClear} className={cn(button.base, button.ghost, "ms-auto")}>
        <XIcon aria-hidden="true" className="size-3.5" />
        {t("console.queue.bulk.clear")}
        <Kbd>Esc</Kbd>
      </button>
    </div>
  );
}
