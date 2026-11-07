"use client";

/**
 * The order drawer (P4 CALL CENTER; operations.md OPE-§12.7, §4.2, §9.2, §10.1; OD49, OD52, OD55): a full-height
 * sheet on phones, 520 px from 1024 px, opened by `?order=<id>` (or `?o=<id>`). Blocks: Header (mono id, store-time,
 * source, TEST chip, the three axis chips, Move to…), Actions (claim holder: Call, WhatsApp, outcome grid; others:
 * Take this order, Assign, Pin), Customer, Order, Delivery, Money, Risk, Script, Google Sheets, Ad events, Timeline +
 * notes. States: a skeleton mirroring the blocks, not_found (one copy for every unknown id), the conflict refresh, and
 * read-only (store or impersonation: actions hidden, one reason line). Phones stay masked: "Show number" and the call
 * buttons go through the audited reveal (OD11).
 */
import "../queue/queue.css";
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  BanIcon,
  BanknoteIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  HandIcon,
  HeadsetIcon,
  Loader2Icon,
  LockIcon,
  MapPinIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  PinIcon,
  RefreshCwIcon,
  SheetIcon,
  ShieldCheckIcon,
  StickyNoteIcon,
  TruckIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  assignOrderAction,
  blockFromOrderAction,
  bulkPinAction,
  dismissDuplicateAction,
  editOrderAction,
  forceMoveAction,
  getOrderAction,
  markCarrierNotifiedAction,
  moveOrderAction,
  resendToSheetAction,
  setShipAfterAction,
  setTrackingAction,
  undoMoveAction,
} from "@/app/app/[store]/orders/actions";
import { markCashReceivedAction } from "@/app/app/[store]/finance/actions";
import { MoneySlot } from "@/components/admin/finance/drawer-money";
import { ShipmentPanel } from "@/components/admin/shipping/shipment-panel";
import { queueScriptAction, recordOutcomeAction, releaseOrderAction, revealPhoneAction, takeOrderAction } from "@/app/app/[store]/queue/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { OrderDrawerJson, OrdersMember } from "@/lib/admin-data/orders";
import type { CompiledScript, ScriptLocale } from "@/lib/callcenter/script";
import { dirOf, type AdminLocale, type MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { OrderStatus } from "@/lib/orders/contract";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { writeClipboard } from "../common/copy-button";
import { StatusChip } from "../common/status-chip";
import { SHEET_STATUS_META, type Tone } from "../lib/status";
import { useStore } from "../shell/store-context";
import { HistoryBlock } from "../queue/parts";
import { DateSheet, ReasonSheet, WaSheet, type PickReason } from "../queue/pickers";
import { ScriptPanel } from "../queue/script-panel";
import { ago, money, ymdLabel } from "../queue/time";
import { MergeDialog } from "./manual/merge-dialog";
import { OrderContents } from "./order-contents";
import { CONFIRM_TONE, MONEY_TONE, moveEntries, newIdem, settle, SHIP_TONE, viewerMovePerms } from "./ops-ui";
import { MoveMenu, type MovePick } from "./status-menu";
import { OrderTimeline } from "./timeline";

export interface DrawerPerms {
  write: boolean;
  assign: boolean;
  ship: boolean;
  finance: boolean;
  force: boolean;
  reveal: boolean;
  edit: boolean;
  block: boolean;
  /** owner / admin: the Money and Ad events blocks, Sheets */
  owner: boolean;
  /** the console's agents.self (Take this order) */
  agent: boolean;
  /** suspended store or impersonation: actions hidden with one reason line */
  readOnly: "impersonation" | "store" | null;
}

const ORDER_ID = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;
export const isOrderId = (v: string) => ORDER_ID.test(v);

const dateIn = (iso: string, tz: string, locale: AdminLocale) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export function OrderDrawer({
  orderId,
  onOpenChange,
  perms,
  members,
  tz,
  locale,
  rtl,
  onChanged,
  onEdit,
}: {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  perms: DrawerPerms;
  members: readonly OrdersMember[];
  tz: string;
  locale: AdminLocale;
  rtl: boolean;
  /** a write succeeded: refresh the list */
  onChanged: () => void;
  /** "Edit" opens the manual-order sheet in edit mode */
  onEdit?: (order: OrderDrawerJson) => void;
}) {
  const t = useT();
  const [loaded, setLoaded] = useState<{ id: string; order: OrderDrawerJson | null; error?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    settle<OrderDrawerJson>(getOrderAction(orderId)).then((res) => {
      if (cancelled) return;
      setLoaded(res.ok ? { id: orderId, order: res.data } : { id: orderId, order: null, error: res.error });
      setConflict(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, reload]);

  const current = loaded && loaded.id === orderId ? loaded : null;
  const order = current?.order ?? null;
  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const done = useCallback(() => {
    refresh();
    onChanged();
  }, [refresh, onChanged]);

  /** run one write: a conflict shows the refresh line, other refusals toast; true when it went through */
  const write = async <T,>(tag: string, p: Promise<unknown>, success?: string): Promise<T | null> => {
    setBusy(tag);
    try {
      const res = await settle<T>(p);
      if (!res.ok) {
        if (res.error === "conflict") setConflict(true);
        else toast.error(errorText(t, res.error));
        return null;
      }
      if (success) toast.success(success);
      done();
      return res.data;
    } finally {
      setBusy(null);
    }
  };

  const ro = perms.readOnly !== null;

  const move = async (pick: MovePick) => {
    if (!order) return;
    const res = await write<{ changed?: boolean; undo?: string }>(
      "move",
      pick.force ? forceMoveAction(order.id, pick.label, pick.reason ?? "", order.rev) : moveOrderAction(order.id, pick.label, order.rev, pick.reason ? { reason: pick.reason } : {}),
    );
    if (!res) return;
    const label = t(`ops.status.${pick.label}` as MessageKey);
    const token = res.undo;
    toast.success(t("ops.move.done", { status: label }), {
      duration: 10_000,
      ...(token
        ? {
            action: {
              label: t("ops.bulk.undo"),
              onClick: async () => {
                const u = await settle(undoMoveAction(token));
                if (u.ok) {
                  toast.success(t("ops.bulk.undone"));
                  done();
                } else toast.error(t("ops.bulk.undoExpired"));
              },
            },
          }
        : {}),
    });
  };

  return (
    <Sheet open={!!orderId} onOpenChange={onOpenChange}>
      <SheetContent
        dir={rtl ? "rtl" : "ltr"}
        side={rtl ? "left" : "right"}
        showCloseButton={false}
        className="gap-0 overflow-hidden p-0 duration-300 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:lg:max-w-[520px] data-[side=right]:lg:max-w-[520px] data-[side=left]:sm:max-w-full data-[side=right]:sm:max-w-full"
      >
        <SheetClose
          aria-label={t("ops.drawer.close")}
          className="absolute end-3 top-3 z-10 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="size-4" />
        </SheetClose>
        {!current ? (
          <DrawerSkeleton />
        ) : !order ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="mb-2 grid size-12 place-items-center rounded-2xl bg-foreground/[0.04] text-muted-foreground">
              <LockIcon className="size-5" />
            </div>
            <SheetHeader className="items-center p-0">
              <SheetTitle>{t("ops.drawer.notFound")}</SheetTitle>
              <SheetDescription>{current.error === "network" ? t("ops.error.network") : t("ops.drawer.notFoundHint")}</SheetDescription>
            </SheetHeader>
          </div>
        ) : (
          <>
            <Header order={order} tz={tz} locale={locale} perms={perms} pending={busy === "move"} onMove={move} />
            {conflict && (
              <div role="status" className="flex items-center justify-between gap-3 border-b border-border/70 bg-warn/10 px-5 py-2.5 text-[0.8125rem]">
                <span className="text-warn-ink">{t("ops.state.conflictAnon")}</span>
                <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={refresh}>
                  <RefreshCwIcon /> {t("ops.drawer.refresh")}
                </Button>
              </div>
            )}
            {ro && (
              <p className="flex items-center gap-2 border-b border-border/70 bg-foreground/[0.025] px-5 py-2.5 text-[0.8125rem] text-muted-foreground">
                <EyeIcon className="size-3.5 shrink-0" />
                {perms.readOnly === "impersonation" ? t("ops.drawer.roImpersonation") : t("ops.drawer.roStore")}
              </p>
            )}

            <div className="adm-scroll grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto p-4 sm:p-5">
              {!ro && <ActionsBlock order={order} perms={perms} members={members} tz={tz} locale={locale} write={write} busy={busy} />}
              <CustomerBlock order={order} perms={perms} locale={locale} write={write} />
              <Block title={t("ops.drawer.order")} action={!ro && perms.edit && onEdit && order.source !== "export" ? (
                <Button size="sm" variant="ghost" className="-my-1 h-7 rounded-full" onClick={() => onEdit(order)}>
                  <PencilIcon /> {t("ops.drawer.edit")}
                </Button>
              ) : null}>
                <OrderContents order={order} />
                {order.adjustCents !== 0 && (
                  <p className="flex items-center justify-between gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2 text-[0.8125rem]">
                    <span className="text-muted-foreground">{t("ops.drawer.adjustment")}</span>
                    <span className="font-medium tabular-nums">{money(order.adjustCents, order.currency, locale)}</span>
                  </p>
                )}
              </Block>
              <DeliveryBlock order={order} perms={perms} tz={tz} locale={locale} write={write} busy={busy} />
              {perms.owner || perms.finance ? <MoneyBlock order={order} perms={perms} locale={locale} write={write} busy={busy} /> : null}
              <RiskBlock order={order} locale={locale} />
              {order.ops.script && <ScriptBlock orderId={order.id} script={order.ops.script} />}
              {(perms.owner || perms.assign) && <SheetsBlock order={order} canWrite={perms.write && !ro} write={write} busy={busy} />}
              {perms.owner && order.adEvents.length > 0 && <AdEventsBlock order={order} tz={tz} locale={locale} />}
              <div className="adm-surface-flat rounded-2xl p-4">
                <OrderTimeline orderId={order.id} initial={order.ops.timeline} tz={tz} locale={locale} canNote={perms.write && !ro} canHide={perms.assign && !ro} />
              </div>
            </div>

            {perms.block && !ro && (
              <BlockFooter order={order} onDone={done} />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type WriteFn = <T>(tag: string, p: Promise<unknown>, success?: string) => Promise<T | null>;

function errorText(t: ReturnType<typeof useT>, code: string): string {
  const key = `ops.error.${code}` as MessageKey;
  const text = t(key);
  return text === key ? t("ops.error.generic") : text;
}

/* ------------------------------------------------------------------ */
/* header                                                              */
/* ------------------------------------------------------------------ */

export function AxisChips({ states, size = "md", money: showMoney = true }: { states: OrderDrawerJson["states"]; size?: "sm" | "md"; money?: boolean }) {
  const t = useT();
  const cls = size === "sm" ? "h-5 px-2 text-[0.6875rem]" : "h-6 text-xs";
  return (
    <>
      <StatusChip tone={CONFIRM_TONE[states.confirm]} className={cls}>
        {t(`ops.confirm.${states.confirm}` as MessageKey)}
      </StatusChip>
      {states.ship !== "none" && (
        <StatusChip tone={SHIP_TONE[states.ship]} className={cls}>
          {t(`ops.ship.${states.ship}` as MessageKey)}
        </StatusChip>
      )}
      {showMoney && states.money !== "unpaid" && (
        <StatusChip tone={MONEY_TONE[states.money]} className={cls}>
          {t(`ops.money.${states.money}` as MessageKey)}
        </StatusChip>
      )}
    </>
  );
}

function Header({ order, tz, locale, perms, pending, onMove }: { order: OrderDrawerJson; tz: string; locale: AdminLocale; perms: DrawerPerms; pending: boolean; onMove: (p: MovePick) => Promise<void> }) {
  const t = useT();
  const entries = perms.readOnly || !perms.write ? [] : moveEntries(order.states, viewerMovePerms((p) => (p === "orders.write" ? perms.write : p === "orders.assign" ? perms.assign : p === "shipments.write" ? perms.ship : p === "finance.write" ? perms.finance : p === "orders.force_status" ? perms.force : false)));
  return (
    <SheetHeader className="gap-3 border-b border-border/70 px-5 pt-5 pb-4 pe-14">
      <div className="flex items-center gap-2">
        <SheetTitle className="font-mono text-[0.95rem] font-semibold tracking-tight">
          <bdi dir="ltr">{order.id}</bdi>
        </SheetTitle>
        <button
          type="button"
          onClick={async () => (await writeClipboard(order.id)) && toast.success(t("ops.drawer.copied"))}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("ops.drawer.copyId")}
        >
          <CopyIcon className="size-3.5" />
        </button>
        {order.isTest && <TestTag />}
        {order.pinned && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <PinIcon className="size-3" /> {t("ops.drawer.pinned")}
          </span>
        )}
      </div>
      <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <bdi dir="ltr" className="tabular-nums">{dateIn(order.createdAt, tz, locale)}</bdi>
        <span aria-hidden="true">·</span>
        <span>{t(`ops.source.${order.source}` as MessageKey)}</span>
        {order.pageName && (
          <>
            <span aria-hidden="true">·</span>
            <span className="max-w-48 truncate">{order.pageName}</span>
          </>
        )}
      </SheetDescription>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <AxisChips states={order.states} />
        </div>
        {entries.length > 0 && <MoveMenu entries={entries} onMove={onMove} pending={pending} size="sm" />}
      </div>
    </SheetHeader>
  );
}

/** The TEST chip (D54, OD31): text, never a colour alone. */
export function TestTag({ className }: { className?: string }) {
  const t = useT();
  return (
    <span title={t("ops.test.hint")} className={cn("inline-flex h-5 shrink-0 items-center rounded-md px-1.5 font-mono text-[0.625rem] font-semibold tracking-wider text-violet-700 ring-1 ring-violet-500/30 ring-inset dark:text-violet-300", className)}>
      {t("ops.test.chip")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

function ActionsBlock({ order, perms, members, tz, locale, write, busy }: { order: OrderDrawerJson; perms: DrawerPerms; members: readonly OrdersMember[]; tz: string; locale: AdminLocale; write: WriteFn; busy: string | null }) {
  const t = useT();
  const storeView = useStore();
  const [sheet, setSheet] = useState<"wa" | "cancel" | "recall" | "reschedule" | null>(null);
  const idem = useRef(newIdem());
  const now = new Date();
  const mine = order.ops.mine;
  const delivery = order.ops.lane === "delivery";

  const dial = async (why: "call" | "whatsapp", templateId?: string) => {
    const res = await settle<{ tel: string; wa: string }>(revealPhoneAction(order.id, why, templateId ? { templateId } : {}));
    if (!res.ok) {
      toast.error(errorText(t, res.error));
      return;
    }
    if (why === "call") window.location.href = res.data.tel;
    else window.open(res.data.wa, "_blank", "noopener,noreferrer");
  };

  const outcome = async (name: string, extra: Record<string, unknown> = {}) => {
    const res = await write("outcome", recordOutcomeAction({ orderId: order.id, expectRev: order.rev, channel: "call", outcome: name, idem: idem.current, ...extra } as Parameters<typeof recordOutcomeAction>[0]), t("ops.drawer.saved"));
    if (res) idem.current = newIdem();
  };

  if (mine) {
    const cells: { id: string; label: MessageKey; tone: "ok" | "danger" | "info" | "neutral"; run: () => void }[] = delivery
      ? [
          { id: "customer_informed", label: "ops.rescue.customer_informed", tone: "ok", run: () => void outcome("customer_informed") },
          { id: "reschedule", label: "ops.rescue.reschedule", tone: "info", run: () => setSheet("reschedule") },
          { id: "no_answer", label: "ops.outcome.no_answer", tone: "neutral", run: () => void outcome("no_answer") },
          { id: "busy", label: "ops.rescue.busy", tone: "neutral", run: () => void outcome("busy") },
          { id: "cancel_recall", label: "ops.rescue.cancel_recall", tone: "danger", run: () => setSheet("recall") },
          { id: "skip", label: "ops.skip", tone: "neutral", run: () => void write("outcome", releaseOrderAction(order.id, "skip")) },
        ]
      : [
          { id: "confirmed", label: "ops.outcome.confirmed", tone: "ok", run: () => void outcome("confirmed") },
          { id: "no_answer", label: "ops.outcome.no_answer", tone: "neutral", run: () => void outcome("no_answer") },
          { id: "busy", label: "ops.outcome.busy", tone: "neutral", run: () => void outcome("busy") },
          { id: "callback", label: "ops.outcome.callback", tone: "info", run: () => (window.location.href = storeView.href("/queue")) },
          { id: "cancelled", label: "ops.outcome.cancelled", tone: "danger", run: () => setSheet("cancel") },
          { id: "more", label: "ops.outcome.more", tone: "neutral", run: () => (window.location.href = storeView.href("/queue")) },
        ];
    return (
      <Block title={t("ops.drawer.actions")} tone="brand">
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-11 rounded-xl" onClick={() => void dial("call")} disabled={!perms.reveal}>
            <PhoneIcon /> {t("ops.drawer.call")}
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => setSheet("wa")} disabled={!perms.reveal}>
            <MessageCircleIcon /> {t("ops.drawer.whatsapp")}
          </Button>
        </div>
        <div role="group" aria-label={t("ops.drawer.outcome")} className="grid grid-cols-3 gap-1.5">
          {cells.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy === "outcome" || !perms.write}
              onClick={c.run}
              className={cn(
                "min-h-11 rounded-xl px-2 py-2 text-[0.8125rem] font-medium ring-1 transition-colors duration-150 ring-inset disabled:opacity-50",
                c.tone === "ok" && "bg-emerald-500/10 text-emerald-800 ring-emerald-500/25 hover:bg-emerald-500/15 dark:text-emerald-300",
                c.tone === "danger" && "bg-destructive/[0.07] text-destructive ring-destructive/20 hover:bg-destructive/10",
                c.tone === "info" && "bg-sky-500/[0.08] text-sky-800 ring-sky-500/20 hover:bg-sky-500/12 dark:text-sky-300",
                c.tone === "neutral" && "ring-border hover:bg-foreground/[0.04]",
              )}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
        <WaSheet open={sheet === "wa"} onOpenChange={(o) => !o && setSheet(null)} templates={order.ops.templates} onPick={(id) => { setSheet(null); void dial("whatsapp", id); }} />
        <ReasonSheet open={sheet === "cancel" || sheet === "recall"} onOpenChange={(o) => !o && setSheet(null)} title={sheet === "recall" ? t("ops.recall.title") : t("ops.cancel.title")} onPick={(r: PickReason) => { const which = sheet; setSheet(null); void outcome(which === "recall" ? "cancel_recall" : "cancelled", { reason: r }); }} />
        <DateSheet open={sheet === "reschedule"} onOpenChange={(o) => !o && setSheet(null)} title={t("ops.hold.title")} now={now} tz={tz} locale={locale} onPick={(ymd) => { setSheet(null); void outcome("reschedule", { shipAfter: ymd }); }} />
      </Block>
    );
  }

  const canTake = perms.agent && order.ops.takeable;
  if (!canTake && !perms.assign) {
    return order.ops.heldBy ? (
      <p className="flex items-center gap-2 rounded-2xl bg-foreground/[0.03] px-4 py-3 text-[0.8125rem] text-muted-foreground">
        <HeadsetIcon className="size-4 shrink-0" /> {t("ops.drawer.heldBy", { name: order.ops.heldBy })}
      </p>
    ) : null;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canTake && (
        <Button
          className="h-9 rounded-full"
          disabled={busy === "take"}
          onClick={async () => {
            await write("take", takeOrderAction(order.id), t("ops.drawer.taken"));
          }}
        >
          {busy === "take" ? <Loader2Icon className="animate-spin" /> : <HandIcon />}
          {t("ops.inbound.take")}
        </Button>
      )}
      {perms.assign && (
        <AssignMenu
          members={members}
          current={order.assignee?.id ?? null}
          pending={busy === "assign"}
          onPick={(id) => void write("assign", assignOrderAction(order.id, id), id ? t("ops.drawer.assigned", { name: members.find((m) => m.id === id)?.name ?? "" }) : t("ops.drawer.unassigned"))}
        />
      )}
      {perms.assign && (
        <Button
          variant="outline"
          className="h-9 rounded-full"
          disabled={busy === "pin"}
          onClick={() => void write("pin", bulkPinAction([order.id], !order.pinned, newIdem()), order.pinned ? t("ops.drawer.unpinnedDone") : t("ops.drawer.pinnedDone"))}
        >
          <PinIcon /> {order.pinned ? t("ops.drawer.unpin") : t("ops.drawer.pin")}
        </Button>
      )}
      {order.ops.heldBy && <span className="text-xs text-muted-foreground">{t("ops.drawer.heldBy", { name: order.ops.heldBy })}</span>}
    </div>
  );
}

export function AssignMenu({ members, current, pending, onPick, label }: { members: readonly OrdersMember[]; current: string | null; pending: boolean; onPick: (id: string | null) => void; label?: string }) {
  const t = useT();
  const dir = dirOf(useAdminLocale());
  const who = members.find((m) => m.id === current);
  return (
    <DropdownMenu dir={dir} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 max-w-56 rounded-full" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <UserRoundIcon />}
          <span className="truncate">{label ?? (who ? who.name : t("ops.drawer.assign"))}</span>
          <ChevronDownIcon className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 rounded-xl">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("ops.bulk.assignTo")}</DropdownMenuLabel>
        {members.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => onPick(m.id)} className="gap-2 rounded-lg">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-[0.6875rem] font-semibold">{Array.from(m.name.trim())[0] ?? "?"}</span>
            <span className="flex-1 truncate">{m.name}</span>
            {m.id === current && <CheckIcon className="size-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onPick(null)} className="rounded-lg text-muted-foreground">
          {t("ops.bulk.unassign")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/* customer                                                            */
/* ------------------------------------------------------------------ */

function CustomerBlock({ order, perms, locale, write }: { order: OrderDrawerJson; perms: DrawerPerms; locale: AdminLocale; write: WriteFn }) {
  const t = useT();
  const storeView = useStore();
  const [shown, setShown] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const ro = perms.readOnly !== null;
  const h = order.ops.history;
  const blocked = order.blocked.phone || order.blocked.ip;

  const reveal = async () => {
    setRevealing(true);
    const res = await settle<{ national: string }>(revealPhoneAction(order.id, "view"));
    setRevealing(false);
    if (!res.ok) toast.error(errorText(t, res.error));
    else setShown(res.data.national);
  };

  return (
    <Block title={t("ops.drawer.customer")}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="flex items-center gap-2 text-[0.95rem] font-semibold [overflow-wrap:anywhere]">
            {order.name}
            {blocked && (
              <StatusChip tone="red" className="h-5 px-2 text-[0.6875rem]">
                <BanIcon className="size-3" /> {t("ops.drawer.blocked")}
              </StatusChip>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-sm tabular-nums">
            <bdi dir="ltr" className="whitespace-nowrap">{shown ?? order.phone}</bdi>
            {!shown && perms.reveal && !ro && (
              <button type="button" onClick={() => void reveal()} disabled={revealing} className="inline-flex items-center gap-1 font-sans text-xs font-medium whitespace-nowrap text-foreground/70 underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50">
                {revealing ? <Loader2Icon className="size-3 animate-spin" /> : <EyeIcon className="size-3" />}
                {t("ops.drawer.showNumber")}
              </button>
            )}
          </span>
        </div>
        {order.customerId && perms.assign && (
          <Link href={storeView.href(`/customers/${order.customerId}`)} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground">
            {t("ops.drawer.customerPage")} <ArrowUpRightIcon className="size-3 rtl:-scale-x-100" />
          </Link>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {h && h.orders > 1 ? t("ops.history.line", { delivered: h.delivered, refused: h.refused + h.returned, cancelled: h.cancelled + h.fake }) : t("ops.history.first")}
      </p>
      {h && h.orders > 1 && perms.assign && <HistoryBlock history={h} locale={locale} />}
      {order.note && (
        <p className="flex gap-2 rounded-xl bg-warn/8 px-3 py-2 text-[0.8125rem] ring-1 ring-warn/40 ring-inset">
          <StickyNoteIcon className="mt-0.5 size-4 shrink-0 text-warn-ink" />
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{order.note}</span>
        </p>
      )}
      {order.ops.duplicates.length > 0 && (
        <ul className="grid gap-1.5">
          {order.ops.duplicates.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-violet-500/[0.06] px-3 py-2 text-[0.8125rem] ring-1 ring-violet-500/20 ring-inset">
              <span className="min-w-0">
                {t("ops.dup.possible", { id: d.id, ago: ago(Date.parse(d.createdAt), Date.now(), locale) })}
              </span>
              {perms.write && !ro && (
                <span className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 rounded-full" onClick={() => void write("dup", moveOrderAction(order.id, "duplicate" satisfies OrderStatus, order.rev, { duplicateOf: d.id }), t("ops.drawer.markedDup"))}>
                    {t("ops.dup.mark")}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => void write("dup", dismissDuplicateAction(order.id, d.id), t("ops.drawer.keptBoth"))}>
                    {t("ops.dup.keep")}
                  </Button>
                  {/* R2 (OP-06 merge; contract step C2-E): S4's dialog for orders.edit + orders.assign holders */}
                  {order.r2 && perms.edit && perms.assign ? <MergeDialog keepId={order.id} dupId={d.id} onDone={() => void write("merge", Promise.resolve({ ok: true, data: null }))} /> : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {perms.assign && order.history.length > 0 && (
        <ul className="grid gap-0.5 border-t border-border/60 pt-2">
          {order.history.slice(0, 5).map((o) => (
            <li key={o.id} className="flex items-center gap-3 py-1 text-[0.8125rem]">
              <Link href={`?order=${o.id}`} scroll={false} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                <bdi dir="ltr">{o.id}</bdi>
              </Link>
              <span className="min-w-0 flex-1 truncate">{o.productName}</span>
              <span className="shrink-0 tabular-nums">{money(Math.round(o.total * 100), o.currency, locale)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t(`ops.status.${o.status}` as MessageKey)}</span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* delivery                                                            */
/* ------------------------------------------------------------------ */

function DeliveryBlock({ order, perms, tz, locale, write, busy }: { order: OrderDrawerJson; perms: DrawerPerms; tz: string; locale: AdminLocale; write: WriteFn; busy: string | null }) {
  const t = useT();
  const ro = perms.readOnly !== null;
  const [holdOpen, setHoldOpen] = useState(false);
  const [tracking, setTracking] = useState<{ ref: string; carrier: string } | null>(null);
  const held = order.shipAfter && Date.parse(order.shipAfter) > Date.now();
  const holdYmd = order.shipAfter ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(order.shipAfter)) : null;
  const inTransit = ["shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed"].includes(order.states.ship);
  const canHold = perms.write && !ro && order.states.confirm === "confirmed" && ["none", "to_pack", "packed"].includes(order.states.ship);

  return (
    <Block title={t("ops.drawer.delivery")} icon={<TruckIcon className="size-3.5" />}>
      <div className="grid gap-2 text-[0.8125rem]">
        <p className="flex gap-2">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="font-medium">{order.city ?? t("ops.drawer.noCity")}</span>
            {order.address ? <span className="text-foreground/80">{` · ${order.address}`}</span> : null}
            {order.landmark ? <span className="block text-muted-foreground">{t("ops.drawer.landmark", { text: order.landmark })}</span> : null}
          </span>
        </p>
        {order.ops.cityFix.length > 0 && perms.edit && !ro && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-sky-500/[0.06] px-3 py-2 ring-1 ring-sky-500/15 ring-inset">
            <span className="text-xs text-muted-foreground">{t("ops.drawer.didYouMean")}</span>
            {order.ops.cityFix.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={busy === "city"}
                onClick={() => void write("city", editOrderAction(order.id, { city: c.label }, order.rev), t("ops.drawer.cityFixed", { city: c.label }))}
                className="h-7 rounded-full bg-background px-2.5 text-xs font-medium ring-1 ring-border ring-inset hover:bg-foreground/[0.04]"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        {order.ops.eta.text && <p className="text-xs text-muted-foreground">{order.ops.eta.text}</p>}

        {held || (canHold && order.shipAfter) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-violet-500/[0.06] px-3 py-2 ring-1 ring-violet-500/20 ring-inset">
            <span className="font-medium">{t("ops.hold.shipFrom", { date: holdYmd ? ymdLabel(holdYmd, locale) : "" })}</span>
            {canHold && (
              <span className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setHoldOpen(true)}>
                  {t("ops.drawer.change")}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-full" disabled={busy === "hold"} onClick={() => void write("hold", setShipAfterAction(order.id, null, order.rev), t("ops.drawer.holdRemoved"))}>
                  {t("ops.drawer.remove")}
                </Button>
              </span>
            )}
          </div>
        ) : canHold ? (
          <button type="button" onClick={() => setHoldOpen(true)} className="justify-self-start text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline">
            {t("ops.hold.deliverFrom")}
          </button>
        ) : null}

        {/* R2 (OD55, OPE-§17.4; contract step C2-E): the shipment is the truth, S4's panel replaces the tracking block */}
        {order.r2?.hasShipment ? <ShipmentPanel orderId={order.id} onChanged={() => void write("shipment", Promise.resolve({ ok: true, data: null }))} /> : null}
        {!order.r2?.hasShipment && (order.trackingRef || order.carrierLabel || perms.ship) && (
          <div className="grid gap-1.5 rounded-xl bg-foreground/[0.03] px-3 py-2">
            {tracking ? (
              <form
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await write("tracking", setTrackingAction(order.id, { trackingRef: tracking.ref.trim() || null, carrierLabel: tracking.carrier.trim() || null }), t("ops.drawer.trackingSaved"));
                  if (ok !== null) setTracking(null);
                }}
              >
                <input autoFocus dir="ltr" value={tracking.ref} maxLength={64} onChange={(e) => setTracking({ ...tracking, ref: e.target.value })} placeholder={t("ops.drawer.trackingRef")} aria-label={t("ops.drawer.trackingRef")} className="h-9 rounded-lg border border-input bg-background px-2.5 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
                <input value={tracking.carrier} maxLength={60} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} placeholder={t("ops.drawer.carrier")} aria-label={t("ops.drawer.carrier")} className="h-9 rounded-lg border border-input bg-background px-2.5 text-[0.8125rem] outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
                <span className="flex gap-1">
                  <Button type="submit" size="sm" className="h-9 rounded-lg" disabled={busy === "tracking"}>
                    {t("ops.drawer.save")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-9 rounded-lg" onClick={() => setTracking(null)}>
                    {t("ops.common.cancel")}
                  </Button>
                </span>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{t("ops.drawer.tracking")} </span>
                  {order.trackingRef ? <bdi dir="ltr" className="font-mono text-xs">{order.trackingRef}</bdi> : <span className="text-muted-foreground">{t("ops.drawer.none")}</span>}
                  {order.carrierLabel && <span className="text-muted-foreground">{` · ${order.carrierLabel}`}</span>}
                </span>
                {perms.ship && !ro && (
                  <Button size="sm" variant="ghost" className="-my-1 h-7 rounded-full" onClick={() => setTracking({ ref: order.trackingRef ?? "", carrier: order.carrierLabel ?? "" })}>
                    <PencilIcon /> {order.trackingRef ? t("ops.drawer.edit") : t("ops.drawer.add")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {order.deliveryAttempts > 0 && <p className="text-xs text-muted-foreground">{t("ops.drawer.attempts", { n: order.deliveryAttempts })}</p>}
        {order.ops.recall && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive/[0.05] px-3 py-2 ring-1 ring-destructive/15 ring-inset">
            <span className="font-medium text-destructive">{t("ops.manual.recallRequested")}</span>
            {order.ops.recall.carrierNotified ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CheckIcon className="size-3" /> {t("ops.manual.carrierNotified")}
              </span>
            ) : perms.ship && !ro ? (
              <Button size="sm" variant="outline" className="h-7 rounded-full" disabled={busy === "notify"} onClick={() => void write("notify", markCarrierNotifiedAction(order.id), t("ops.manual.carrierNotified"))}>
                {t("ops.drawer.tellCarrier")}
              </Button>
            ) : null}
          </div>
        )}
        {inTransit && !order.ops.recall && order.ops.timeline.items.some((i) => i.type === "field_edited") && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warn/12 px-2.5 py-1 text-xs font-medium text-warn-ink">
            <AlertTriangleIcon className="size-3" /> {t("ops.drawer.tellCarrierChip")}
          </span>
        )}
      </div>
      <DateSheet
        open={holdOpen}
        onOpenChange={setHoldOpen}
        title={t("ops.hold.title")}
        description={t("ops.hold.hint")}
        now={new Date()}
        tz={tz}
        locale={locale}
        onPick={(ymd) => {
          setHoldOpen(false);
          void write("hold", setShipAfterAction(order.id, ymd, order.rev), t("ops.hold.shipFrom", { date: ymdLabel(ymd, locale) }));
        }}
      />
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* money, risk, script, sheets, ad events                              */
/* ------------------------------------------------------------------ */

function MoneyBlock({ order, perms, locale, write, busy }: { order: OrderDrawerJson; perms: DrawerPerms; locale: AdminLocale; write: WriteFn; busy: string | null }) {
  const t = useT();
  const collected = order.states.money === "collected";
  const days = order.money.deliveredAt ? Math.max(0, Math.floor((Date.now() - Date.parse(order.money.deliveredAt)) / 86_400_000)) : 0;
  return (
    <Block title={t("ops.drawer.money")} icon={<BanknoteIcon className="size-3.5" />}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
          <StatusChip tone={MONEY_TONE[order.states.money]} className="h-6 text-xs">
            {t(`ops.money.${order.states.money}` as MessageKey)}
          </StatusChip>
          {collected && <span className="text-muted-foreground">{order.money.settlement === "at_delivery" ? t("ops.drawer.cashInHand") : t("ops.drawer.heldByCarrier", { n: days })}</span>}
        </span>
        <span className="text-sm font-semibold tabular-nums">{money(Math.round(order.total * 100), order.currency, locale)}</span>
      </div>
      {collected && perms.finance && perms.readOnly === null && (
        <Button size="sm" variant="outline" className="h-8 w-fit rounded-full" disabled={busy === "cash"} onClick={() => void write("cash", markCashReceivedAction([order.id]), t("ops.drawer.cashMarked"))}>
          {busy === "cash" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} {t("ops.drawer.markCash")}
        </Button>
      )}
      {/* R2 (OD51, OD59, OPE-§16.7; contract step C2-E): S3's money slot */}
      {order.r2 ? (
        <MoneySlot
          orderId={order.id}
          money={order.states.money}
          ship={order.states.ship}
          totalCents={Math.round(order.total * 100)}
          collectedCents={order.r2.collectedCents}
          refundCents={order.r2.refundCents}
          currency={order.currency}
          settlement={order.r2.settlement}
          remitted={order.r2.remitted}
        />
      ) : null}
    </Block>
  );
}

function RiskBlock({ order, locale }: { order: OrderDrawerJson; locale: AdminLocale }) {
  const t = useT();
  const r = order.ops.risk;
  const tone: Tone = r.level === "high" ? "red" : r.level === "check" ? "warn" : "emerald";
  return (
    <Block title={t("ops.drawer.risk")} icon={<ShieldCheckIcon className="size-3.5" />}>
      <div className="flex items-center gap-3">
        <StatusChip tone={tone} className="h-6 text-xs">
          {r.level === "low" ? t("ops.drawer.riskLow") : t(`ops.risk.${r.level}` as MessageKey)}
        </StatusChip>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden="true">
          <div className={cn("h-full rounded-full transition-[width] duration-500", r.level === "high" ? "bg-destructive" : r.level === "check" ? "bg-warn" : "bg-emerald-500")} style={{ width: `${Math.max(3, r.score)}%` }} />
        </div>
        <span className="w-12 shrink-0 text-end text-sm font-semibold tabular-nums">{r.score}</span>
      </div>
      {r.reasons.length > 0 && (
        <ul className="grid gap-1">
          {r.reasons.slice(0, 3).map((x) => (
            <li key={x.flag} className="flex items-baseline gap-2 text-[0.8125rem]">
              <span className="size-1 shrink-0 translate-y-[-2px] rounded-full bg-foreground/40" aria-hidden="true" />
              {t(x.text.key, x.text.vars)}
            </li>
          ))}
        </ul>
      )}
      {r.positive && (
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-emerald-700 dark:text-emerald-300">
          <CheckIcon className="size-3.5" /> {t(r.positive.key, r.positive.vars)}
        </p>
      )}
      {r.calibration && (
        <p className="text-xs text-muted-foreground">
          {t("ops.risk.calibration", { share: `${new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { maximumFractionDigits: 0 }).format(r.calibration.badShareBp / 100)}%`, n: r.calibration.n })}
        </p>
      )}
    </Block>
  );
}

function ScriptBlock({ orderId, script }: { orderId: string; script: CompiledScript }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(script);
  const [loading, setLoading] = useState<ScriptLocale | null>(null);
  const [objection, setObjection] = useState<string | null>(null);
  return (
    <ScriptPanel
      script={cur}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      loadingLocale={loading}
      objectionId={objection}
      onObjection={setObjection}
      className="adm-surface-flat rounded-2xl"
      onLocale={async (l) => {
        setLoading(l);
        const res = await settle<{ script: CompiledScript }>(queueScriptAction(orderId, l));
        setLoading(null);
        if (res.ok && res.data?.script) setCur(res.data.script);
      }}
    />
  );
}

function SheetsBlock({ order, canWrite, write, busy }: { order: OrderDrawerJson; canWrite: boolean; write: WriteFn; busy: string | null }) {
  const t = useT();
  const m = SHEET_STATUS_META[order.sheetStatus];
  return (
    <Block
      title={t("ops.drawer.sheets")}
      icon={<SheetIcon className="size-3.5" />}
      action={
        canWrite && order.sheetStatus !== "disabled" ? (
          <Button size="sm" variant="ghost" className="-my-1 h-7 rounded-full" disabled={busy === "sheet"} onClick={() => void write("sheet", resendToSheetAction(order.id), t("ops.drawer.resent"))}>
            {busy === "sheet" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            {t("ops.drawer.resend")}
          </Button>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
        <StatusChip tone={m.tone} className="h-6 text-xs">
          {t(`ops.sheet.${order.sheetStatus}` as MessageKey)}
        </StatusChip>
        {order.sheetAttempts > 0 && order.sheetStatus !== "synced" && <span className="text-xs text-muted-foreground">{t("ops.drawer.sheetAttempts", { n: order.sheetAttempts })}</span>}
      </div>
      {order.sheetError && (
        <p className="flex gap-2 rounded-xl bg-destructive/[0.06] px-3 py-2 text-xs leading-relaxed text-destructive ring-1 ring-destructive/15 ring-inset">
          <AlertTriangleIcon className="mt-px size-3.5 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{order.sheetError}</span>
        </p>
      )}
      {order.sheetStatus === "disabled" && <p className="text-xs text-muted-foreground">{order.isTest ? t("ops.drawer.sheetTest") : t("ops.drawer.sheetBot")}</p>}
    </Block>
  );
}

function AdEventsBlock({ order, tz, locale }: { order: OrderDrawerJson; tz: string; locale: AdminLocale }) {
  const t = useT();
  return (
    <Block title={t("ops.drawer.adEvents")}>
      <ul className="grid gap-1.5">
        {order.adEvents.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 text-[0.8125rem]">
            <span className="flex min-w-0 items-center gap-2">
              <span className={cn("size-1.5 shrink-0 rounded-full", e.type === "capi_sent" ? "bg-emerald-500" : e.type === "capi_failed" ? "bg-destructive" : "bg-foreground/30")} aria-hidden="true" />
              <span className="font-medium">{e.platform ?? t("ops.drawer.pixel")}</span>
              <span className="truncate text-muted-foreground">
                {e.type === "capi_sent" ? t("ops.drawer.capiSent", { event: e.event ?? "Purchase" }) : e.type === "capi_stale" ? t("ops.drawer.capiStale") : t("ops.drawer.capiFailed", { reason: e.reason ?? "" })}
              </span>
            </span>
            <bdi dir="ltr" className="shrink-0 text-xs text-muted-foreground tabular-nums">{dateIn(e.at, tz, locale)}</bdi>
          </li>
        ))}
      </ul>
    </Block>
  );
}

/* ------------------------------------------------------------------ */
/* block footer and frame                                              */
/* ------------------------------------------------------------------ */

function BlockFooter({ order, onDone }: { order: OrderDrawerJson; onDone: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(!order.blocked.phone);
  const [ip, setIp] = useState(false);
  const [reason, setReason] = useState("");
  const all = order.blocked.phone && (order.blocked.ip || !order.hasIp);
  return (
    <div className="flex items-center justify-end gap-2 border-t border-border/70 bg-muted/30 px-5 py-2.5">
      <Button variant="ghost" size="sm" className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={all} onClick={() => setOpen(true)}>
        <BanIcon /> {t("ops.drawer.block")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        destructive
        icon={<BanIcon />}
        title={t("ops.drawer.blockTitle")}
        description={t("ops.drawer.blockHint")}
        confirmLabel={t("ops.drawer.block")}
        onConfirm={async () => {
          if (!phone && !ip) return false;
          const res = await settle(blockFromOrderAction(order.id, { phone, ip }, reason));
          if (!res.ok) {
            toast.error(t("ops.error.generic"));
            return false;
          }
          toast.success(t("ops.drawer.blockedDone"));
          onDone();
          return true;
        }}
      >
        <div className="grid gap-2.5">
          <Label className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border ring-inset">
            <Checkbox checked={phone} disabled={order.blocked.phone} onCheckedChange={(v) => setPhone(v === true)} />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">
                {t("ops.drawer.blockPhone")} <bdi dir="ltr">{order.phone}</bdi>
              </span>
            </span>
          </Label>
          {order.hasIp && (
            <Label className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border ring-inset">
              <Checkbox checked={ip} disabled={order.blocked.ip} onCheckedChange={(v) => setIp(v === true)} />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{t("ops.drawer.blockIp")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t("ops.drawer.blockIpHint")}</span>
              </span>
            </Label>
          )}
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={t("ops.drawer.blockReason")} aria-label={t("ops.drawer.blockReason")} className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Block({ title, icon, action, tone, children }: { title: string; icon?: ReactNode; action?: ReactNode; tone?: "brand"; children: ReactNode }) {
  return (
    <section className={cn("grid min-w-0 grid-cols-1 gap-3 rounded-2xl p-4", tone === "brand" ? "bg-brand/[0.035] ring-1 ring-brand/15 ring-inset" : "adm-surface-flat")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] font-semibold text-foreground/90 [&_svg]:text-muted-foreground">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** the skeleton mirrors the blocks: header, actions, customer, order, delivery, timeline */
function DrawerSkeleton() {
  const t = useT();
  return (
    <div className="grid gap-0" aria-busy="true">
      <SheetHeader className="sr-only">
        <SheetTitle>{t("ops.drawer.loading")}</SheetTitle>
        <SheetDescription>{t("ops.drawer.loading")}</SheetDescription>
      </SheetHeader>
      <div className="grid gap-3 border-b border-border/70 px-5 pt-5 pb-4">
        <div className="adm-shimmer h-5 w-40 rounded-md" />
        <div className="adm-shimmer h-3 w-56 rounded-md" />
        <div className="flex gap-1.5">
          <div className="adm-shimmer h-6 w-20 rounded-full" />
          <div className="adm-shimmer h-6 w-16 rounded-full" />
        </div>
      </div>
      <div className="grid gap-3 p-5">
        {[72, 120, 150, 96, 180].map((h, i) => (
          <div key={i} className="adm-shimmer rounded-2xl" style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}
