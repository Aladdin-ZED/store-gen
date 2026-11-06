"use client";
/**
 * `/app/<h>/customers/<id>` (P4 CALL CENTER; operations.md OPE-§9.2, §9.5, OP-06, OP-12).
 *
 *   header    name, the masked phone + Show number (a `phone_revealed` row on the customer's latest order, through
 *             revealPhone: the number lives in this component's state only), city, first and last order, delivered
 *             of shipped as counts (a customer's few orders never make a rate)
 *   counts    orders, confirmed, delivered, refused, returned, cancelled, fake (test orders apart, D54)
 *   orders    the list for owners, admins and managers; agents see the counts only (OD12)
 *   note      the internal note, ≤ 300 characters (customers.read + orders.write)
 *   actions   New order for this customer (the manual-order sheet with the revealed number), Block (and cancel open
 *             orders) with its preview, Unblock
 */
import "../queue/queue.css";
import { ArrowLeftIcon, BanIcon, EyeIcon, Loader2Icon, PlusIcon, ShieldOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveCustomerNoteAction, unblockAction } from "@/app/app/[store]/customers/actions";
import { revealPhoneAction } from "@/app/app/[store]/queue/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { MessageKey } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import type { OrderStatus } from "@/lib/orders/contract";
import type { CustomerDetail } from "@/lib/orders/customers";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { StatusChip } from "../common/status-chip";
import type { Tone } from "../lib/status";
import { ManualOrderSheet, type ManualInitial } from "../orders/manual/manual-order-sheet";
import { settle } from "../orders/ops-ui";
import { money, num } from "../queue/time";
import { BlockDialog } from "./block-dialog";

const NOTE_MAX = 300;

const STATUS_TONE: Partial<Record<OrderStatus, Tone>> = {
  new: "blue",
  confirmed: "emerald",
  no_answer: "warn",
  callback: "violet",
  shipped: "teal",
  in_transit: "blue",
  delivered: "green",
  returned: "rose",
  refused: "rose",
  cancelled: "neutral",
  fake: "red",
  duplicate: "neutral",
  unreachable: "neutral",
  lost: "red",
};

export function CustomerPage({
  c,
  tz,
  hrefs,
  perms,
}: {
  c: CustomerDetail;
  tz: string;
  hrefs: { customers: string; orders: string };
  perms: { reveal: boolean; create: boolean; block: boolean; move: boolean; note: boolean; readOnly: boolean };
}) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const latest = c.orders?.find((o) => !o.isTest)?.id ?? c.orders?.[0]?.id ?? null;
  const [shown, setShown] = useState<{ national: string; e164: string } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [sheet, setSheet] = useState<ManualInitial | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [unblockOpen, setUnblockOpen] = useState(false);
  const ro = perms.readOnly;

  const reveal = async (): Promise<{ national: string; e164: string } | null> => {
    if (shown) return shown;
    if (!latest) return null;
    setRevealing(true);
    const res = await settle<{ national: string; e164: string }>(revealPhoneAction(latest, "view"));
    setRevealing(false);
    if (!res.ok) {
      const key = `ops.error.${res.error}` as MessageKey;
      toast.error(t(key) === key ? t("ops.error.generic") : t(key));
      return null;
    }
    setShown(res.data);
    return res.data;
  };

  const newOrder = async () => {
    const r = await reveal();
    if (!r) return;
    setSheet({ phone: r.e164, ...(c.name ? { name: c.name } : {}), ...(c.city ? { city: c.city } : {}) });
  };

  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { timeZone: tz, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)) : "–");
  const shipped = c.counts.delivered + c.counts.refused + c.counts.returned;
  const counts: { key: MessageKey; v: number; tone?: string }[] = [
    { key: "ops.customer.count.orders", v: c.counts.orders },
    { key: "ops.customer.count.confirmed", v: c.counts.confirmed },
    { key: "ops.customer.count.delivered", v: c.counts.delivered },
    { key: "ops.customer.count.refused", v: c.counts.refused, tone: "text-rose-700 dark:text-rose-300" },
    { key: "ops.customer.count.returned", v: c.counts.returned, tone: "text-rose-700 dark:text-rose-300" },
    { key: "ops.customer.count.cancelled", v: c.counts.cancelled },
    { key: "ops.customer.count.fake", v: c.counts.fake },
  ];

  return (
    <div className="grid gap-8">
      <header className="grid gap-4">
        <Link href={hrefs.customers} className="q-sm inline-flex w-fit items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("ops.customers.title")}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid min-w-0 gap-2">
            <h1 className="flex flex-wrap items-center gap-2.5 text-[1.625rem] leading-tight font-semibold text-foreground [overflow-wrap:anywhere]">
              {c.name ?? t("ops.customers.noName")}
              {c.blocked && (
                <StatusChip tone="red" className="h-6 text-xs">
                  <BanIcon className="size-3" aria-hidden="true" /> {t("ops.drawer.blocked")}
                </StatusChip>
              )}
            </h1>
            <p className="q-sm flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              <bdi dir="ltr" className="font-mono text-foreground/85">
                {shown?.national ?? c.phoneMasked}
              </bdi>
              {!shown && perms.reveal && latest && !ro && (
                <button
                  type="button"
                  onClick={() => void reveal()}
                  disabled={revealing}
                  className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  {revealing ? <Loader2Icon className="size-3 animate-spin" aria-hidden="true" /> : <EyeIcon className="size-3" aria-hidden="true" />}
                  {t("ops.drawer.showNumber")}
                </button>
              )}
              {c.city && <span>{c.city}</span>}
            </p>
            <p className="q-xs q-num text-muted-foreground">
              {t("ops.customer.dates", { first: date(c.firstOrderAt), last: date(c.lastOrderAt) })}
              {" · "}
              {shipped > 0 ? t("ops.customer.deliveredOf", { delivered: num(c.counts.delivered, locale), shipped: num(shipped, locale) }) : t("ops.customer.noShipped")}
            </p>
          </div>
          {!ro && (perms.create || perms.block) && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {perms.create && perms.reveal && latest && !c.blocked && (
                <Button onClick={() => void newOrder()} disabled={revealing} className="gap-1.5">
                  <PlusIcon className="size-4" aria-hidden="true" />
                  {t("ops.customer.newOrder")}
                </Button>
              )}
              {perms.block && latest && !c.blocked && (
                <Button variant="outline" onClick={() => setBlockOpen(true)} className="gap-1.5 text-destructive hover:text-destructive">
                  <BanIcon className="size-4" aria-hidden="true" />
                  {t("ops.customer.block")}
                </Button>
              )}
              {perms.block && c.blocked && c.blockId && (
                <Button variant="outline" onClick={() => setUnblockOpen(true)} className="gap-1.5">
                  <ShieldOffIcon className="size-4" aria-hidden="true" />
                  {t("ops.customers.unblock")}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[18px] border border-border bg-border sm:grid-cols-4 lg:grid-cols-7">
        {counts.map((x, i) => (
          <div key={x.key} className={cn("grid gap-0.5 bg-card px-4 py-3", i === counts.length - 1 && "col-span-full sm:col-span-2 lg:col-span-1")}>
            <dt className="q-2xs text-muted-foreground">{t(x.key)}</dt>
            <dd className={cn("q-lg q-num font-semibold", x.v > 0 && x.tone ? x.tone : "text-foreground")}>{num(x.v, locale)}</dd>
          </div>
        ))}
      </dl>
      {c.counts.test > 0 && <p className="q-xs -mt-5 text-muted-foreground">{t("ops.customer.tests", { n: c.counts.test })}</p>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="customer-orders" className="grid content-start gap-3">
          <h2 id="customer-orders" className="q-md font-semibold text-foreground">
            {t("ops.customer.orders")}
          </h2>
          {c.orders === null ? (
            <p className="q-sm rounded-[18px] border border-dashed border-border px-4 py-5 text-muted-foreground">{t("ops.customer.countsOnly")}</p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-card">
              {c.orders.map((o) => (
                <li key={o.id}>
                  <Link href={`${hrefs.orders}?order=${o.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 transition-colors hover:bg-foreground/[0.025]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[0.8125rem] font-medium text-foreground">{o.id}</span>
                      {o.isTest && <span className="q-2xs rounded px-1 font-semibold text-muted-foreground ring-1 ring-border ring-inset">{t("ops.test.chip")}</span>}
                    </span>
                    <span className="q-sm q-num text-end font-medium text-foreground">{money(o.totalCents, o.currency, locale)}</span>
                    <span className="q-xs min-w-0 truncate text-muted-foreground">
                      {date(o.createdAt)} · {o.productName}
                    </span>
                    <span className="justify-self-end">
                      <StatusChip tone={STATUS_TONE[o.status] ?? "neutral"} className="h-5 px-2 text-[0.6875rem]">
                        {t(`ops.status.${o.status}` as MessageKey)}
                      </StatusChip>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {perms.note && c.orders !== null && <NoteCard id={c.id} initial={c.note} readOnly={ro} onSaved={() => router.refresh()} />}
      </div>

      {latest && (
        <BlockDialog
          open={blockOpen}
          onOpenChange={setBlockOpen}
          target={{ orderId: latest }}
          canMove={perms.move}
          onDone={(r) => {
            setBlockOpen(false);
            toast.success(t("ops.block.done", { moved: r.moved }));
            router.refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={unblockOpen}
        onOpenChange={setUnblockOpen}
        title={t("ops.customers.unblock.title")}
        description={t("ops.customers.unblock.text", { target: c.phoneMasked })}
        confirmLabel={t("ops.customers.unblock")}
        onConfirm={async () => {
          if (!c.blockId) return false;
          const res = await settle(unblockAction(c.blockId));
          if (!res.ok) {
            toast.error(t("ops.error.generic"));
            return false;
          }
          toast.success(t("ops.customers.unblocked"));
          setUnblockOpen(false);
          router.refresh();
        }}
      />
      <ManualOrderSheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        {...(sheet ? { initial: sheet } : {})}
        onDone={() => {
          setSheet(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function NoteCard({ id, initial, readOnly, onSaved }: { id: string; initial: string | null; readOnly: boolean; onSaved: () => void }) {
  const t = useT();
  const [text, setText] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = text.trim() !== (initial ?? "");
  const save = async () => {
    setSaving(true);
    const res = await settle(saveCustomerNoteAction(id, text));
    setSaving(false);
    if (!res.ok) toast.error(t("ops.error.generic"));
    else {
      toast.success(t("ops.saved"));
      onSaved();
    }
  };
  return (
    <section aria-labelledby="customer-note" className="grid content-start gap-3">
      <h2 id="customer-note" className="q-md font-semibold text-foreground">
        {t("ops.customer.note")}
      </h2>
      <div className="grid gap-2 rounded-[18px] border border-border bg-card p-4">
        <Textarea
          aria-labelledby="customer-note"
          value={text}
          readOnly={readOnly}
          maxLength={NOTE_MAX}
          rows={4}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("ops.customer.notePlaceholder")}
          className="resize-none"
        />
        <div className="flex items-center justify-between gap-3">
          <span className={cn("q-2xs q-num", text.length >= NOTE_MAX ? "text-destructive" : "text-muted-foreground")}>
            <bdi dir="ltr">
              {Array.from(text).length} / {NOTE_MAX}
            </bdi>
          </span>
          {!readOnly && (
            <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={() => void save()}>
              {saving && <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />}
              {t("ops.drawer.save")}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
