"use client";

import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  BanIcon,
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  Loader2Icon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SheetIcon,
  StickyNoteIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { OrderDetailJson } from "@/lib/admin-data/orders";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { writeClipboard } from "../common/copy-button";
import { StatusChip } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { actionMessage, runAction, type ActionResult } from "../lib/action-result";
import { useStore } from "../shell/store-context";
import { dateTime, money, phone as fmtPhone } from "../lib/format";
import { orderStatusMeta, riskFlagLabel, riskLevel, SHEET_STATUS_META } from "../lib/status";
import { OrderContents } from "./order-contents";
import { StatusMenu } from "./status-menu";

export interface OrderDrawerActions {
  get: (id: string) => Promise<ActionResult<OrderDetailJson>>;
  setStatus: (id: string, status: string) => Promise<ActionResult<{ sheet: "updated" | "not_found" | "skipped" | "queued" }>>;
  resend: (id: string) => Promise<ActionResult<{ synced: boolean }>>;
  block: (id: string, what: { phone: boolean; ip: boolean }, reason: string) => Promise<ActionResult<null>>;
}

const SHEET_NOTE: Record<"updated" | "not_found" | "skipped" | "queued", string> = {
  updated: "Status saved and written to the sheet",
  queued: "Status saved — it goes to the sheet with the order",
  not_found: "Status saved (the order's row wasn't found in the sheet)",
  skipped: "Status saved",
};

/** Order details in a side sheet: customer, items, money, source, risk, sheet sync and actions. */
export function OrderDrawer({
  orderId,
  onOpenChange,
  canWrite,
  canBlock = canWrite,
  actions,
  onChanged,
}: {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
  /** blocklist.write (owner, admin, manager); defaults to canWrite */
  canBlock?: boolean;
  actions: OrderDrawerActions;
  /** a mutation succeeded (refresh the list) */
  onChanged: () => void;
}) {
  const storeView = useStore();
  const [loaded, setLoaded] = useState<{ id: string; order: OrderDetailJson | null; error?: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [statusPending, setStatusPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    actions.get(orderId).then(
      (res) => {
        if (!cancelled) setLoaded(res.ok ? { id: orderId, order: res.data } : { id: orderId, order: null, error: actionMessage(res) });
      },
      () => {
        if (!cancelled) setLoaded({ id: orderId, order: null, error: "Couldn't load this order. Check your connection." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [orderId, reload, actions]);

  const current = loaded && loaded.id === orderId ? loaded : null;
  const order = current?.order ?? null;

  const changeStatus = async (status: string) => {
    if (!order) return;
    setStatusPending(true);
    try {
      const res = await runAction(actions.setStatus(order.id, status), { success: (d) => SHEET_NOTE[d.sheet] });
      if (res) {
        setReload((n) => n + 1);
        onChanged();
      }
    } finally {
      setStatusPending(false);
    }
  };

  const resend = async () => {
    if (!order) return;
    setResending(true);
    try {
      const res = await runAction(actions.resend(order.id), { success: (d) => (d.synced ? "Sent to Google Sheets" : "Queued for the next sync") });
      setReload((n) => n + 1);
      if (res) onChanged();
    } finally {
      setResending(false);
    }
  };

  return (
    <Sheet open={!!orderId} onOpenChange={onOpenChange}>
      {/* data-[side=right]: the same variants as the sheet's default max-w-sm, so cn() replaces it */}
      <SheetContent side="right" className="gap-0 overflow-hidden p-0 duration-300 data-[side=right]:w-full data-[side=right]:sm:max-w-[34rem]">
        {!current ? (
          <DrawerSkeleton />
        ) : !order ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <SheetHeader className="items-center p-0">
              <SheetTitle>Order unavailable</SheetTitle>
              <SheetDescription>{current.error}</SheetDescription>
            </SheetHeader>
          </div>
        ) : (
          <>
            <SheetHeader className="gap-3 border-b border-border/70 p-5 pe-14">
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono text-[0.95rem] tracking-tight">{order.id}</SheetTitle>
                <button
                  type="button"
                  onClick={async () => (await writeClipboard(order.id)) && toast.success("Order number copied")}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Copy order number"
                >
                  <CopyIcon className="size-3.5" />
                </button>
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span>{dateTime(order.createdAt)}</span>
                <span aria-hidden="true">·</span>
                <RelativeTime iso={order.createdAt} />
                {order.pageName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{order.pageName}</span>
                  </>
                )}
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <StatusMenu status={order.status} onChange={canWrite ? changeStatus : undefined} pending={statusPending} />
                <SheetChip status={order.sheetStatus} />
                {riskLevel(order.riskScore) && <StatusChip tone={riskLevel(order.riskScore)!.tone}>{riskLevel(order.riskScore)!.label}</StatusChip>}
              </div>
            </SheetHeader>

            {/* one shrinkable column: no card is ever wider than the drawer (long URLs truncate) */}
            <div className="adm-scroll grid flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-5">
              <Block title="Customer">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-0.5">
                      <span className="text-[0.95rem] font-semibold [overflow-wrap:anywhere]">{order.name}</span>
                      <span className="font-mono text-sm tabular-nums">{fmtPhone(order.phone)}</span>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button asChild size="icon-sm" variant="outline" className="rounded-full" aria-label="Call">
                        <a href={`tel:${order.phone}`}>
                          <PhoneIcon />
                        </a>
                      </Button>
                      <Button asChild size="icon-sm" variant="outline" className="rounded-full text-emerald-700 dark:text-emerald-400" aria-label="WhatsApp">
                        <a href={`https://wa.me/${order.phone.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer">
                          <MessageCircleIcon />
                        </a>
                      </Button>
                    </div>
                  </div>
                  {(order.city || order.address) && (
                    <p className="flex gap-2 text-sm text-foreground/85">
                      <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{[order.address, order.city].filter(Boolean).join(", ")}</span>
                    </p>
                  )}
                  {order.note && (
                    <p className="flex gap-2 rounded-xl bg-warn/8 px-3 py-2 text-sm ring-1 ring-warn/40 ring-inset">
                      <StickyNoteIcon className="mt-0.5 size-4 shrink-0 text-warn-ink" />
                      <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{order.note}</span>
                    </p>
                  )}
                  {order.email && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{order.email}</p>}
                </div>
              </Block>

              <Block title="Order">
                <OrderContents order={order} />
              </Block>

              <Block
                title="Google Sheets"
                icon={<SheetIcon className="size-3.5" />}
                action={
                  canWrite &&
                  order.sheetStatus !== "disabled" && (
                    <Button size="sm" variant="ghost" className="-my-1 h-7 rounded-full" onClick={resend} disabled={resending}>
                      {resending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                      {order.sheetStatus === "synced" ? "Re-send" : "Send now"}
                    </Button>
                  )
                }
              >
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetChip status={order.sheetStatus} />
                    {order.sheetAttempts > 0 && order.sheetStatus !== "synced" && (
                      <span className="text-xs text-muted-foreground">
                        {order.sheetAttempts} attempt{order.sheetAttempts === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {order.sheetError && (
                    <p className="flex gap-2 rounded-xl bg-destructive/8 px-3 py-2 text-xs leading-relaxed text-destructive ring-1 ring-destructive/15 ring-inset">
                      <AlertTriangleIcon className="mt-px size-3.5 shrink-0" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{order.sheetError}</span>
                    </p>
                  )}
                  {order.sheetStatus === "disabled" && <p className="text-xs text-muted-foreground">Bot-flagged orders are never sent to the sheet.</p>}
                </div>
              </Block>

              <Block title="Risk" icon={<ShieldCheckIcon className="size-3.5" />}>
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(3, order.riskScore)}%` }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className={cn("h-full rounded-full", order.riskScore >= 60 ? "bg-destructive" : order.riskScore >= 30 ? "bg-warn" : "bg-emerald-500")}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-end text-sm font-semibold tabular-nums">{order.riskScore}/100</span>
                  </div>
                  {order.flags.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {order.flags.map((f) => (
                        <li key={f} className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs">
                          {riskFlagLabel(f)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2Icon className="size-3.5 text-emerald-600" /> No warning signs.
                    </p>
                  )}
                  {(order.blocked.phone || order.blocked.ip) && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <BanIcon className="size-3.5" />
                      {order.blocked.phone && order.blocked.ip ? "Phone and network are blocked" : order.blocked.phone ? "Phone is blocked" : "Network is blocked"}
                    </p>
                  )}
                </div>
              </Block>

              {order.history.length > 0 && (
                <Block title={`Same phone · ${order.history.length} other order${order.history.length === 1 ? "" : "s"}`} icon={<ClockIcon className="size-3.5" />}>
                  <ul className="grid grid-cols-1 gap-1">
                    {order.history.map((h) => {
                      const m = orderStatusMeta(h.status);
                      return (
                        <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-1 py-1.5 text-sm">
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{h.id}</span>
                          <span className="min-w-0 flex-1 basis-32 truncate" title={h.productName}>
                            {h.productName}
                          </span>
                          <span className="shrink-0 tabular-nums">{money(h.total, h.currency)}</span>
                          <StatusChip tone={m.tone} className="h-5 shrink-0 px-2 text-[0.68rem]">
                            {m.label}
                          </StatusChip>
                        </li>
                      );
                    })}
                  </ul>
                </Block>
              )}

              <Block title="Source">
                <dl className="grid grid-cols-1 gap-1.5 text-sm">
                  <Line label="Channel" value={order.source === "live" ? "Live page" : order.source === "export" ? "Exported site" : "Exported site (PHP)"} long />
                  {order.page && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">Page</dt>
                      <dd className="min-w-0">
                        <a
                          href={storeView.live(order.page.slug)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={storeView.livePath(order.page.slug)}
                          className="flex max-w-full items-center gap-1 font-medium hover:underline"
                        >
                          <span className="min-w-0 truncate">{storeView.livePath(order.page.slug)}</span>
                          <ArrowUpRightIcon className="size-3 shrink-0" />
                        </a>
                      </dd>
                    </div>
                  )}
                  {Object.entries(order.utm)
                    .filter(([k]) => ["source", "medium", "campaign", "content"].includes(k))
                    .map(([k, v]) => (
                      <Line key={k} label={`UTM ${k}`} value={v} long />
                    ))}
                  {order.ref && <Line label="Referrer" value={order.ref} long />}
                </dl>
              </Block>
            </div>

            {canBlock && (
              <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/30 px-5 py-3">
                <span className="text-xs text-muted-foreground">
                  Updated <RelativeTime iso={order.updatedAt} />
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={order.blocked.phone && (order.blocked.ip || !order.hasIp)}
                  onClick={() => setBlockOpen(true)}
                >
                  <BanIcon /> Block…
                </Button>
              </div>
            )}
            {blockOpen && (
              <BlockDialog
                order={order}
                onClose={() => setBlockOpen(false)}
                onBlock={async (what, reason) => {
                  const ok = await runAction(actions.block(order.id, what, reason), { success: "Added to the blocklist" });
                  if (ok !== undefined) {
                    setReload((n) => n + 1);
                    onChanged();
                  }
                  return ok !== undefined;
                }}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BlockDialog({
  order,
  onClose,
  onBlock,
}: {
  order: OrderDetailJson;
  onClose: () => void;
  onBlock: (what: { phone: boolean; ip: boolean }, reason: string) => Promise<boolean>;
}) {
  const [phone, setPhone] = useState(!order.blocked.phone);
  const [ip, setIp] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      destructive
      icon={<BanIcon />}
      title="Block future orders"
      description="Blocked customers can still browse, but their orders are refused. You can unblock them from Orders → Blocklist."
      confirmLabel="Block"
      pendingLabel="Blocking…"
      onConfirm={async () => (phone || ip ? onBlock({ phone, ip }, reason) : false)}
    >
      <div className="grid gap-3">
        <Label className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border ring-inset has-[[data-state=checked]]:bg-destructive/5 has-[[data-state=checked]]:ring-destructive/30">
          <Checkbox checked={phone} disabled={order.blocked.phone} onCheckedChange={(v) => setPhone(v === true)} />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">Phone {fmtPhone(order.phone)}</span>
            <span className="text-xs font-normal text-muted-foreground">{order.blocked.phone ? "Already blocked" : "Refuse any order with this number"}</span>
          </span>
        </Label>
        {order.hasIp && (
          <Label className="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-border ring-inset has-[[data-state=checked]]:bg-destructive/5 has-[[data-state=checked]]:ring-destructive/30">
            <Checkbox checked={ip} disabled={order.blocked.ip} onCheckedChange={(v) => setIp(v === true)} />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Network (IP)</span>
              <span className="text-xs font-normal text-muted-foreground">
                {order.blocked.ip ? "Already blocked" : "Careful: mobile carriers share IPs between many customers"}
              </span>
            </span>
          </Label>
        )}
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="Reason (optional), e.g. refused 3 deliveries"
          className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Reason"
        />
      </div>
    </ConfirmDialog>
  );
}

function SheetChip({ status }: { status: OrderDetailJson["sheetStatus"] }) {
  const m = SHEET_STATUS_META[status];
  return <StatusChip tone={m.tone}>{m.label}</StatusChip>;
}

function Block({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="adm-surface-flat grid min-w-0 grid-cols-1 gap-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-[0.72rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * A label/value row. Money rows keep the amount whole (a long add-on title truncates); `long` rows
 * (source, UTM, referrer) keep the label and truncate the value instead, all of it in a tooltip.
 */
function Line({ label, value, long }: { label: string; value: string; long?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-muted-foreground", long ? "shrink-0" : "min-w-0 truncate")}>
        {label}
      </dt>
      <dd className={cn("tabular-nums", long ? "line-clamp-3 min-w-0 text-start break-all" : "shrink-0 text-end")} title={long ? value : undefined}>
        {value}
      </dd>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="grid gap-4 p-5" aria-busy="true">
      <SheetHeader className="sr-only">
        <SheetTitle>Loading order</SheetTitle>
        <SheetDescription>Fetching the order details…</SheetDescription>
      </SheetHeader>
      <AnimatePresence>
        {[56, 140, 180, 90].map((h, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }} className="adm-shimmer rounded-2xl" style={{ height: h }} />
        ))}
      </AnimatePresence>
    </div>
  );
}
