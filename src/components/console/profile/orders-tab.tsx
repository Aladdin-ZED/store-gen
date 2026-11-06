"use client";
/**
 * The store profile's Orders tab (platform.md PLA-§7.4, PL-07; PD2, core §F.11, D74, OPS-9, OPS-15): a read-only
 * table of the store's orders, masked on the server before it reaches this component: id, created (store time),
 * confirmation / shipping state, total, the masked customer, the page or "Store checkout", and a risk chip (≥ 70
 * crimson). Filters (state, risk ≥ 70, dates, page) and the cursor live in the URL. Above the table the placed /
 * confirmed / delivered counts of the window and the risk distribution with n.
 *
 * A row opens the read-only drawer (`?order=<id>`): the lines, the timeline (codes only), the integration states,
 * the carrier label and tracking reference in <bdi dir="ltr">, "Sent to the carrier file on <date>". "Reveal customer
 * details" (`pii.reveal` ↑) asks a reason (+ note for Other) and shows the answer for 60 s, then masks it again; the
 * value lives in this component's state only (never stored, never logged) and P4 records the reveal in the store's
 * Activity. No CSV export exists here (core §F.11).
 */
import { EyeIcon, XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useId, useState } from "react";
import { revealOrderPiiAction } from "@/app/admin/(console)/stores/[id]/actions";
import { MaskedValue } from "@/components/admin/common/masked-value";
import { StepUpSheet } from "@/components/admin/common/step-up-sheet";
import { useT } from "@/lib/i18n/admin/client";
import { formatMoney } from "@/lib/markets/money";
import type { Panel } from "@/lib/platform/panel";
import type { MaskedOrderDetail, OrdersSummary, RevealedPii, StoreOrdersFilter, StoreOrdersPage } from "@/lib/platform/profile/orders";
import { cn } from "@/lib/utils";
import { PanelError, PanelUnavailable, QuietEmpty } from "../panel";
import { button, ConsoleDialog, NoteField } from "../queue/decision-dialogs";
import { OlderLink } from "./older-link";
import { RiskBar } from "./risk-bar";
import { rateLine } from "./rate";
import styles from "../shell/console.module.css";

/** src/lib/platform/profile/orders.ts REVEAL_REASONS (the selftest keeps them equal) */
export const REVEAL_REASON_LIST = ["ticket", "fraud_review", "legal_request", "delivery_dispute", "other"] as const;
const CONFIRM = ["new", "attempting", "callback", "confirmed", "cancelled", "fake", "duplicate", "unreachable"] as const;
const SHIP = ["to_pack", "packed", "shipped", "in_transit", "out_for_delivery", "attempt_failed", "postponed", "delivered", "refused", "returned", "lost"] as const;

type Props = {
  storeId: string;
  timeZone: string;
  summary: OrdersSummary;
  page: Panel<StoreOrdersPage>;
  filter: StoreOrdersFilter;
  pages: { id: string; name: string }[];
  detail: MaskedOrderDetail | null | "missing";
  canReveal: boolean;
};

const storeTime = (iso: string, timeZone: string) => {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
};

export function OrdersTab({ storeId, timeZone, summary, page, filter, pages, detail, canReveal }: Props) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const pageName = new Map(pages.map((p) => [p.id, p.name]));

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("cursor" in patch)) next.delete("cursor");
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const k = summary.kpis28d;
  const nothing = !k && !summary.riskMix;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {nothing ? (
        <p className="rounded-[var(--r-card)] bg-card px-4 py-3 text-[12.5px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--c-hairline)]">{t("console.orders_tab.window_note")}</p>
      ) : (
      <section aria-label={t("console.orders_tab.summary")} className="grid gap-3 rounded-[var(--r-card)] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--c-hairline)] md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-8">
        <dl className="num flex flex-wrap gap-x-6 gap-y-2">
          {(["placed", "confirmed", "delivered"] as const).map((s) => (
            <div key={s} className="grid gap-0.5">
              <dt className="text-[11.5px] text-muted-foreground">{t(`console.orders_tab.count.${s}`)}</dt>
              <dd className="text-[18px] font-semibold tracking-[-0.02em]">{k ? k[s] : <span className="text-[13px] font-normal text-muted-foreground">{t("console.strip.na")}</span>}</dd>
            </div>
          ))}
          <div className="grid gap-0.5">
            <dt className="text-[11.5px] text-muted-foreground">{t("console.strip.orders.confirmation")}</dt>
            <dd className="text-[13px]">{rateLine(t, k?.confirmationRate)}</dd>
          </div>
        </dl>
        <div className="grid gap-1">
          <span className="text-[11.5px] text-muted-foreground">{t("console.orders_tab.risk_28")}</span>
          {summary.riskMix ? <RiskBar mix={summary.riskMix} /> : <span className="text-[12.5px] text-muted-foreground">{t("console.strip.na")}</span>}
        </div>
      </section>
      )}

      <Filters filter={filter} pages={pages} onChange={setParam} />

      <section aria-label={t("console.profile.tab.orders")} className="min-w-0 overflow-hidden rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
        {page.state === "error" ? (
          <PanelError reference={page.ref} />
        ) : page.state === "unavailable" ? (
          <PanelUnavailable text={t("console.orders_tab.unavailable")} />
        ) : page.data.items.length === 0 ? (
          <QuietEmpty text={t(Object.keys(filter).length ? "console.orders_tab.empty_filtered" : "console.orders_tab.empty")} />
        ) : (
          <>
            <table className="w-full text-[13px] max-md:hidden">
              <thead>
                <tr className="border-b border-[var(--c-hairline)] text-start text-[11.5px] text-muted-foreground">
                  {["id", "created", "state", "total", "customer", "page", "risk"].map((c) => (
                    <th key={c} scope="col" className={cn("h-9 px-3 text-start font-medium first:ps-4 last:pe-4", (c === "total" || c === "risk") && "text-end")}>
                      {t(`console.orders_tab.col.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.data.items.map((o) => (
                  <tr key={o.id} className="h-[calc(var(--row)+8px)] cursor-pointer border-b border-[var(--c-hairline)] last:border-b-0 hover:bg-accent/60" onClick={() => setParam({ order: o.id, cursor: search.get("cursor") })}>
                    <td className="ps-4 pe-3">
                      <button type="button" className="font-mono text-[12px] outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), setParam({ order: o.id, cursor: search.get("cursor") }))}>
                        <bdi dir="ltr">{o.id}</bdi>
                      </button>
                    </td>
                    <td className="num px-3 whitespace-nowrap text-muted-foreground">{storeTime(o.createdAt, timeZone)}</td>
                    <td className="px-3">
                      <span className="block truncate">{t(`console.order_state.${o.states.confirm}`)}</span>
                      {o.states.ship !== "none" && <span className="block truncate text-[11.5px] text-muted-foreground">{t(`console.order_state.${o.states.ship}`)}</span>}
                    </td>
                    <td className="num px-3 text-end whitespace-nowrap">{formatMoney(o.totalCents / 100, o.currency, "en")}</td>
                    <td className="max-w-[220px] px-3">
                      <span className="block truncate">
                        <MaskedValue value={o.customer} />
                      </span>
                      <bdi dir="ltr" className="block truncate text-[11.5px] text-muted-foreground">
                        {o.phone}
                      </bdi>
                    </td>
                    <td className="max-w-[180px] truncate px-3 text-muted-foreground">{o.storeCheckout ? t("console.orders_tab.store_checkout") : (pageName.get(o.pageId ?? "") ?? t("console.orders_tab.a_page"))}</td>
                    <td className="pe-4 ps-3 text-end">
                      <RiskChip risk={o.risk} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="md:hidden">
              {page.data.items.map((o) => (
                <li key={o.id} className="border-b border-[var(--c-hairline)] last:border-b-0">
                  <button type="button" onClick={() => setParam({ order: o.id, cursor: search.get("cursor") })} className="grid min-h-14 w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-2.5 text-start outline-none focus-visible:bg-accent">
                    <span className="truncate text-[13px]">
                      <bdi dir="ltr" className="font-mono text-[12px]">
                        {o.id}
                      </bdi>{" "}
                      · {o.customer}
                    </span>
                    <span className="num text-end text-[13px]">{formatMoney(o.totalCents / 100, o.currency, "en")}</span>
                    <span className="truncate text-[12px] text-muted-foreground">
                      {t(`console.order_state.${o.states.confirm}`)} · {storeTime(o.createdAt, timeZone)}
                    </span>
                    <RiskChip risk={o.risk} />
                  </button>
                </li>
              ))}
            </ul>
            <OlderLink param="cursor" next={page.data.next} />
          </>
        )}
      </section>

      {detail !== null && <OrderDrawer storeId={storeId} timeZone={timeZone} detail={detail} pageName={pageName} canReveal={canReveal} onClose={() => setParam({ order: null, cursor: search.get("cursor") })} />}
    </div>
  );
}

function RiskChip({ risk }: { risk: number }) {
  const t = useT();
  const high = risk >= 70;
  return (
    <span title={t("console.orders_tab.risk_title", { risk })} className={cn("num inline-flex h-6 min-w-9 items-center justify-center rounded-[var(--r-chip)] px-1.5 text-[11.5px] font-medium", high ? "bg-[var(--c-danger-soft)] text-[var(--c-danger-ink)]" : risk >= 30 ? "bg-[var(--c-warn-soft)] text-foreground" : "bg-secondary text-muted-foreground")}>
      {risk}
    </span>
  );
}

function Filters({ filter, pages, onChange }: { filter: StoreOrdersFilter; pages: { id: string; name: string }[]; onChange(p: Record<string, string | null>): void }) {
  const t = useT();
  const id = useId();
  const field = "h-[var(--ctl)] rounded-[var(--r-control)] bg-card px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11";
  return (
    <div role="group" aria-label={t("console.orders_tab.filters")} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-[11.5px] text-muted-foreground">
        {t("console.orders_tab.filter.state")}
        <select className={field} value={filter.state ?? ""} onChange={(e) => onChange({ state: e.target.value || null })}>
          <option value="">{t("console.orders_tab.filter.any")}</option>
          <optgroup label={t("console.orders_tab.filter.confirm")}>
            {CONFIRM.map((s) => (
              <option key={s} value={s}>
                {t(`console.order_state.${s}`)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("console.orders_tab.filter.ship")}>
            {SHIP.map((s) => (
              <option key={s} value={s}>
                {t(`console.order_state.${s}`)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {pages.length > 0 && (
        <label className="grid gap-1 text-[11.5px] text-muted-foreground">
          {t("console.orders_tab.filter.page")}
          <select className={cn(field, "max-w-[200px]")} value={filter.pageId ?? ""} onChange={(e) => onChange({ page: e.target.value || null })}>
            <option value="">{t("console.orders_tab.filter.any")}</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="grid gap-1 text-[11.5px] text-muted-foreground">
        {t("console.orders_tab.filter.from")}
        <input type="date" className={cn(field, "num")} value={filter.from ?? ""} onChange={(e) => onChange({ from: e.target.value || null })} />
      </label>
      <label className="grid gap-1 text-[11.5px] text-muted-foreground">
        {t("console.orders_tab.filter.to")}
        <input type="date" className={cn(field, "num")} value={filter.to ?? ""} onChange={(e) => onChange({ to: e.target.value || null })} />
      </label>
      <label htmlFor={`${id}-risk`} className={cn(field, "inline-flex cursor-pointer items-center gap-2 text-foreground")}>
        <input id={`${id}-risk`} type="checkbox" checked={!!filter.risky} onChange={(e) => onChange({ risky: e.target.checked ? "1" : null })} className="size-3.5 accent-[oklch(0.55_0.19_17)]" />
        {t("console.orders_tab.filter.risky")}
      </label>
    </div>
  );
}

function OrderDrawer({ storeId, timeZone, detail, pageName, canReveal, onClose }: { storeId: string; timeZone: string; detail: MaskedOrderDetail | "missing"; pageName: Map<string, string>; canReveal: boolean; onClose(): void }) {
  const t = useT();
  const [revealing, setRevealing] = useState(false);
  const [shown, setShown] = useState<{ pii: RevealedPii; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!shown) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= shown.until) setShown(null);
    }, 1000);
    return () => clearInterval(id);
  }, [shown]);
  const d = detail === "missing" ? null : detail;
  const left = shown ? Math.max(0, Math.ceil((shown.until - now) / 1000)) : 0;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_230/0.24)]" />
        <DialogPrimitive.Content className={cn(styles.drawer, "fixed inset-y-0 end-0 z-50 grid w-full grid-rows-[auto_1fr] bg-popover text-[13px] text-popover-foreground outline-none ring-1 ring-[var(--c-hairline)] sm:w-[min(480px,94vw)] sm:shadow-[0_24px_64px_-24px_oklch(0.2_0.01_230/0.35)]")}>
          <div className="flex items-start gap-3 border-b border-[var(--c-hairline)] px-5 pt-4 pb-3">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <DialogPrimitive.Title className="text-[15px] font-semibold">
                {d ? (
                  <bdi dir="ltr" className="font-mono">
                    {d.id}
                  </bdi>
                ) : (
                  t("console.orders_tab.drawer_missing")
                )}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[12px] text-muted-foreground">{d ? `${storeTime(d.createdAt, timeZone)} · ${t("console.orders_tab.read_only")}` : t("console.orders_tab.drawer_missing_lead")}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label={t("console.dialog.close")} className="-me-1.5 inline-grid size-8 shrink-0 place-items-center rounded-[var(--r-control)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:size-11">
              <XIcon aria-hidden="true" className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {d && (
            <div className="grid content-start gap-5 overflow-y-auto px-5 py-4">
              <section className="grid gap-1.5">
                <h3 className="text-[11.5px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">{t("console.orders_tab.customer")}</h3>
                {shown ? (
                  <div className="grid gap-1 rounded-[var(--r-control)] bg-[var(--c-warn-soft)] p-3" role="status">
                    <p className="font-medium">{shown.pii.name}</p>
                    <bdi dir="ltr" className="font-mono text-[12.5px]">
                      {shown.pii.e164}
                    </bdi>
                    {(shown.pii.address || shown.pii.city) && <p className="text-[12.5px]">{[shown.pii.address, shown.pii.city].filter(Boolean).join(", ")}</p>}
                    {shown.pii.note && <p className="text-[12.5px] text-muted-foreground">{shown.pii.note}</p>}
                    <p className="num text-[11.5px] text-muted-foreground">{t("console.orders_tab.reveal_left", { seconds: left })}</p>
                  </div>
                ) : (
                  <div className="grid gap-0.5">
                    <MaskedValue value={d.customer} />
                    <bdi dir="ltr" className="text-[12.5px] text-muted-foreground">
                      {d.phone}
                    </bdi>
                    <span className="text-[12px] text-muted-foreground">{d.city ? t("console.orders_tab.city_hidden", { city: d.city }) : t("console.orders_tab.address_hidden")}</span>
                  </div>
                )}
                {canReveal && !shown && (
                  <button type="button" onClick={() => setRevealing(true)} className={cn(button.base, button.secondary, "w-fit")}>
                    <EyeIcon aria-hidden="true" className="size-3.5" />
                    {t("console.orders_tab.reveal")}
                  </button>
                )}
              </section>
              <section className="grid gap-1.5">
                <h3 className="text-[11.5px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">{t("console.orders_tab.lines")}</h3>
                <pre className="rounded-[var(--r-control)] bg-[color-mix(in_oklch,var(--muted)_55%,transparent)] p-3 font-sans text-[12.5px] leading-[1.5] whitespace-pre-wrap">{d.itemsText}</pre>
                <p className="num flex justify-between text-[13px]">
                  <span className="text-muted-foreground">{d.storeCheckout ? t("console.orders_tab.store_checkout") : (pageName.get(d.pageId ?? "") ?? t("console.orders_tab.a_page"))}</span>
                  <span className="font-medium">{formatMoney(d.totalCents / 100, d.currency, "en")}</span>
                </p>
              </section>
              <section className="grid gap-1.5">
                <h3 className="text-[11.5px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">{t("console.orders_tab.delivery")}</h3>
                <dl className="grid gap-1 text-[12.5px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("console.orders_tab.state")}</dt>
                    <dd>
                      {t(`console.order_state.${d.states.confirm}`)} · {t(`console.order_state.${d.states.ship}`)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("console.orders_tab.carrier")}</dt>
                    <dd>{d.carrierLabel ? <bdi dir="ltr">{d.carrierLabel}</bdi> : <span className="text-muted-foreground">{t("console.orders_tab.none")}</span>}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("console.orders_tab.tracking")}</dt>
                    <dd>{d.trackingRef ? <bdi dir="ltr" className="font-mono">{d.trackingRef}</bdi> : <span className="text-muted-foreground">{t("console.orders_tab.none")}</span>}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("console.orders_tab.sheet")}</dt>
                    <dd>{t(`console.orders_tab.sheet_state.${d.integrations.sheet}`)}</dd>
                  </div>
                </dl>
                {d.carrierExportedAt && (
                  <p className="text-[12px] text-muted-foreground">
                    {t("console.orders_tab.carrier_file")}{" "}
                    <bdi dir="ltr">{storeTime(d.carrierExportedAt, timeZone)}</bdi>
                  </p>
                )}
              </section>
              <section className="grid gap-1.5">
                <h3 className="text-[11.5px] font-semibold tracking-[0.01em] text-muted-foreground uppercase">{t("console.orders_tab.timeline", { count: d.timeline.length })}</h3>
                {d.timeline.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">{t("console.orders_tab.timeline_empty")}</p>
                ) : (
                  <ol className="grid">
                    {d.timeline.map((e) => (
                      <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-[var(--c-hairline)] py-1.5 text-[12.5px] first:border-t-0">
                        <span className="min-w-0">
                          <bdi dir="ltr" className="font-mono text-[11.5px]">
                            {e.type}
                          </bdi>
                          {e.toState && <span className="text-muted-foreground"> → {e.toState}</span>}
                          {e.reasonCode && <span className="text-muted-foreground"> · {e.reasonCode}</span>}
                          <span className="text-muted-foreground"> · {t(`console.orders_tab.actor.${e.actorKind}`)}</span>
                        </span>
                        <span className="num text-[11.5px] text-muted-foreground">{storeTime(e.at, timeZone)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
          {d && revealing && (
            <RevealDialog
              storeId={storeId}
              orderId={d.id}
              onClose={() => setRevealing(false)}
              onShown={(pii) => {
                setRevealing(false);
                setNow(Date.now());
                setShown({ pii, until: Date.now() + pii.showForSec * 1000 });
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function RevealDialog({ storeId, orderId, onClose, onShown }: { storeId: string; orderId: string; onClose(): void; onShown(p: RevealedPii): void }) {
  const t = useT();
  const name = useId();
  const [reason, setReason] = useState<(typeof REVEAL_REASON_LIST)[number] | null>(null);
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteNeeded = reason === "other";

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setProblem(null);
    const r = await revealOrderPiiAction({ storeId, orderId, reason, note: note.trim() || undefined }).catch(() => null);
    setBusy(false);
    if (r?.ok) return onShown(r.data);
    if (r?.error === "step_up") return setStepUp(true);
    setProblem(r?.message ? t(r.message) : t(r?.error === "rate_limited" ? "console.orders_tab.reveal_limit" : r?.error === "unavailable" ? "console.action.unavailable" : "console.orders_tab.reveal_failed"));
  };

  return (
    <>
      <ConsoleDialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t("console.orders_tab.reveal_title")}
        description={t("console.orders_tab.reveal_lead")}
        footer={
          <>
            <DialogPrimitive.Close className={cn(button.base, button.ghost)}>{t("console.dialog.cancel")}</DialogPrimitive.Close>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setTried(true);
                if (!reason || (noteNeeded && !note.trim())) return;
                void send();
              }}
              className={cn(button.base, button.primary)}
            >
              {t("console.orders_tab.reveal_submit")}
            </button>
          </>
        }
      >
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-[12.5px] font-medium">{t("console.orders_tab.reveal_reason")}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {REVEAL_REASON_LIST.map((r) => (
              <label key={r} className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 text-[13px] shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)] max-md:min-h-11", reason === r && "bg-[color-mix(in_oklch,var(--brand)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--brand)_45%,transparent)]")}>
                <input type="radio" name={name} value={r} checked={reason === r} onChange={() => setReason(r)} className="size-3.5 accent-[var(--brand)]" />
                {t(`console.orders_tab.reveal_reason.${r}`)}
              </label>
            ))}
          </div>
          {tried && !reason && <p className="text-[12px] text-[var(--c-danger-ink)]">{t("console.reveal.invalid")}</p>}
        </fieldset>
        <NoteField label={t("console.orders_tab.reveal_note")} value={note} onChange={setNote} max={300} required={noteNeeded} problem={tried && noteNeeded && !note.trim() ? t("console.reveal.note_required") : null} rows={2} />
        <p className="text-[12px] text-muted-foreground">{t("console.orders_tab.reveal_record")}</p>
        {problem && (
          <p role="alert" className="text-[12.5px] text-[var(--c-danger-ink)]">
            {problem}
          </p>
        )}
      </ConsoleDialog>
      <StepUpSheet
        open={stepUp}
        surface="console"
        method="totp"
        onClose={() => setStepUp(false)}
        onVerified={() => {
          setStepUp(false);
          void send();
        }}
      />
    </>
  );
}
