"use client";
/**
 * The order card of the agent console (P4 CALL CENTER; operations.md OPE-§5.3, §13.1, §13.5, §10.2, §9.3, OD39, OD48).
 * Presentational: product and offer (16 px semibold), the total (24 px, tabular), the units text, city + address +
 * landmark, the customer's first name and masked phone (or the number the agent revealed, held in the console's state
 * only), the history line, the risk chip with its reasons and the store's own calibration, the duplicate chip with its
 * two actions, the TEST chip as text, the delivery strip of the rescue lane, the hold and the ETA line. Every chip says
 * its meaning in words (core §I.8 rule 8: no decorative status dots); numbers, ids, phones and times sit in
 * `<bdi dir="ltr">` with tabular figures (OPE-§13.5).
 */
import { AlertTriangleIcon, CopyIcon, MapPinIcon, MessageSquareTextIcon, PhoneIcon, ShieldCheckIcon, TruckIcon, UserRoundIcon } from "lucide-react";
import { useState } from "react";
import type { QueueOrder } from "@/lib/callcenter/card";
import type { AdminLocale } from "@/lib/i18n/admin";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { ago, money, pctBp, ymdLabel } from "./time";

export interface Revealed {
  orderId: string;
  national: string;
  e164: string;
  why: "call" | "whatsapp" | "view";
  at: number;
}

export function OrderCard({
  card,
  locale,
  now,
  revealed,
  holdYmd,
  canAct,
  onMarkDuplicate,
  onKeepBoth,
  onShowNumber,
}: {
  card: QueueOrder;
  locale: AdminLocale;
  now: number;
  revealed: Revealed | null;
  holdYmd: string | null;
  canAct: boolean;
  onMarkDuplicate: (id: string) => void;
  onKeepBoth: (id: string) => void;
  /** "Show number" (`why: "view"`), when the viewer may reveal */
  onShowNumber?: () => void;
}) {
  const t = useT();
  const c = card.customer;
  const h = c.history;
  const risky = card.risk.level !== "low";
  const shown = revealed && revealed.orderId === card.id ? revealed : null;
  const place = [c.city, c.address].filter(Boolean).join(" · ");

  return (
    <article aria-labelledby={`q-card-${card.id}`} className="grid gap-4">
      {/* lane strip (OD48) */}
      {card.lane === "delivery" && card.delivery ? <DeliveryStrip d={card.delivery} /> : null}

      <header className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {card.isTest ? (
            <span title={t("ops.test.hint")} className="q-2xs inline-flex h-6 items-center rounded-md bg-foreground/[0.07] px-2 font-semibold text-foreground/75">
              {t("ops.test.chip")}
            </span>
          ) : null}
          {card.inbound ? <span className="q-info-chip q-2xs inline-flex h-6 items-center rounded-md px-2 font-medium">{t("ops.queue.inbound")}</span> : null}
          <span className="q-xs text-muted-foreground">
            <bdi dir="ltr" className="q-num">{card.id}</bdi>
            <span aria-hidden="true"> · </span>
            {t("ops.queue.placed", { ago: ago(Date.parse(card.createdAt), now, locale) })}
            <span aria-hidden="true"> · </span>
            {t("ops.queue.attempts", { n: card.attempts })}
          </span>
        </div>
        <h2 id={`q-card-${card.id}`} className="q-md font-semibold text-balance text-foreground">
          <bdi>{card.product}</bdi>
          {card.offerLabel ? (
            <span className="font-normal text-muted-foreground">
              <span aria-hidden="true"> · </span>
              <bdi>{card.offerLabel}</bdi>
            </span>
          ) : null}
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <bdi dir="ltr" className="q-xl q-num font-semibold text-foreground">
            {money(card.totalCents, card.currency, locale)}
          </bdi>
          {card.shippingCents > 0 ? <span className="q-xs q-num text-muted-foreground">{t("ops.queue.shipping", { amount: money(card.shippingCents, card.currency, locale) })}</span> : null}
        </div>
        {card.unitsText ? <p className="q-sm text-foreground/80">{card.unitsText}</p> : null}
        {holdYmd || card.shipAfter ? (
          <p className="q-info-chip q-xs inline-flex w-fit items-center rounded-md px-2 py-1 font-medium">
            {holdYmd ? t("ops.hold.pending", { date: ymdLabel(holdYmd, locale) }) : t("ops.hold.shipFrom", { date: ymdLabel(card.shipAfter!.slice(0, 10), locale) })}
          </p>
        ) : null}
      </header>

      <div className="grid gap-2.5 border-t border-border pt-4">
        <Row icon={<MapPinIcon />}>
          <div className="min-w-0">
            <p className="q-base text-foreground">{place ? <bdi>{place}</bdi> : <span className="text-muted-foreground">·</span>}</p>
            {c.landmark ? <p className="q-sm text-muted-foreground">{t("ops.queue.landmark", { text: c.landmark })}</p> : null}
            {card.eta.text ? <p className="q-xs mt-0.5 text-muted-foreground">{card.eta.text}</p> : null}
          </div>
        </Row>
        <Row icon={<UserRoundIcon />}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="q-base font-medium text-foreground">
              <bdi>{c.firstName || "·"}</bdi>
            </span>
            <PhoneLine masked={c.phoneMasked} shown={shown} onShow={onShowNumber} />
          </div>
        </Row>
        {c.note ? (
          <Row icon={<MessageSquareTextIcon />}>
            <p className="q-sm text-foreground/85">{t("ops.queue.customerNote", { text: c.note })}</p>
          </Row>
        ) : null}
        <Row icon={<ShieldCheckIcon />}>
          <p className="q-sm text-foreground/85">
            {h && h.orders > 1 ? (
              <bdi className="q-num">{t("ops.history.line", { delivered: h.delivered, refused: h.refused + h.returned, cancelled: h.cancelled + h.fake })}</bdi>
            ) : (
              t("ops.history.first")
            )}
          </p>
        </Row>
      </div>

      {(risky || card.risk.positive || card.duplicates.length || card.ui.bestHoursHint) && (
        <div className="grid gap-2">
          {risky ? <RiskChip risk={card.risk} locale={locale} /> : null}
          {!risky && card.risk.positive ? (
            <p className="q-xs inline-flex w-fit items-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-2 py-1 font-medium text-success-ink">
              {t(card.risk.positive.key, card.risk.positive.vars)}
            </p>
          ) : null}
          {card.duplicates.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-foreground/15 px-3 py-2">
              <p className="q-sm min-w-0 flex-1 text-foreground/85">
                {t("ops.dup.possible", { id: "⁨" + d.id + "⁩", ago: ago(Date.parse(d.createdAt), now, locale) })}
              </p>
              {canAct ? (
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => onMarkDuplicate(d.id)} className="q-xs inline-flex h-9 items-center rounded-lg border border-border px-2.5 font-medium hover:bg-muted">
                    {t("ops.dup.mark")}
                  </button>
                  <button type="button" onClick={() => onKeepBoth(d.id)} className="q-xs inline-flex h-9 items-center rounded-lg px-2.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                    {t("ops.dup.keep")}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {card.ui.bestHoursHint ? <p className="q-xs text-muted-foreground">{t(card.ui.bestHoursHint.key, card.ui.bestHoursHint.vars)}</p> : null}
        </div>
      )}
    </article>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function PhoneLine({ masked, shown, onShow }: { masked: string; shown: Revealed | null; onShow?: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  if (!shown) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="q-sm q-num inline-flex items-center gap-1 text-muted-foreground">
          <PhoneIcon className="size-3.5" aria-hidden="true" />
          <bdi dir="ltr">{masked}</bdi>
        </span>
        {onShow ? (
          <button type="button" onClick={onShow} className="q-xs inline-flex h-8 items-center rounded-md px-1.5 font-medium text-brand underline-offset-4 hover:underline">
            {t("ops.queue.showNumber")}
          </button>
        ) : null}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <bdi dir="ltr" className="q-base q-num font-semibold text-foreground select-all">
        {shown.national}
      </bdi>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(shown.national).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1_200);
            },
            () => undefined,
          );
        }}
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <CopyIcon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{copied ? t("ops.saved") : t("ops.queue.showNumber")}</span>
      </button>
    </span>
  );
}

function RiskChip({ risk, locale }: { risk: QueueOrder["risk"]; locale: AdminLocale }) {
  const t = useT();
  const high = risk.level === "high";
  return (
    <div className={cn("grid gap-1.5 rounded-xl px-3 py-2.5", high ? "bg-[color-mix(in_oklab,var(--destructive)_7%,transparent)]" : "bg-warn/12")}>
      <p className={cn("q-sm inline-flex items-center gap-1.5 font-semibold", high ? "text-destructive" : "text-warn-ink")}>
        <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
        {t(high ? "ops.risk.high" : "ops.risk.check")}
      </p>
      {risk.reasons.length ? (
        <ul className="q-xs grid gap-0.5 text-foreground/80">
          {risk.reasons.slice(0, 3).map((r) => (
            <li key={r.flag}>{t(r.text.key, r.text.vars)}</li>
          ))}
        </ul>
      ) : null}
      {risk.calibration ? <p className="q-2xs q-num text-muted-foreground">{t("ops.risk.calibration", { share: pctBp(risk.calibration.badShareBp, locale), n: risk.calibration.n })}</p> : null}
    </div>
  );
}

function DeliveryStrip({ d }: { d: NonNullable<QueueOrder["delivery"]> }) {
  const t = useT();
  return (
    <div className="grid gap-1 rounded-xl bg-[color-mix(in_oklab,var(--destructive)_7%,transparent)] px-3 py-2.5">
      <p className="q-sm inline-flex flex-wrap items-center gap-x-1.5 font-semibold text-destructive">
        <TruckIcon className="size-4" aria-hidden="true" />
        <span>{t("ops.lane.delivery", { n: d.attempts })}</span>
        {d.carrierLabel || d.lastCarrierStatus ? (
          <span className="font-normal text-foreground/80">
            <span aria-hidden="true">· </span>
            <bdi>{t("ops.lane.carrier", { carrier: d.carrierLabel ?? "", status: d.lastCarrierStatus ?? "" }).replace(/^:\s*|\s*:\s*$/g, "")}</bdi>
          </span>
        ) : null}
      </p>
      <p className="q-xs text-foreground/75">
        <span className="q-num">{t("ops.rescue.callsLeft", { n: d.rescueCallsLeft })}</span>
        {d.trackingRef ? (
          <>
            <span aria-hidden="true"> · </span>
            {t("ops.rescue.tracking", { ref: "⁨" + d.trackingRef + "⁩" })}
          </>
        ) : null}
      </p>
    </div>
  );
}
