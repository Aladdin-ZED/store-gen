"use client";
/**
 * The Break-even tab of `/finance` (P4 CALL CENTER; operations.md OPE-§16.2, OD25, OD26, OD56; SF-04).
 *
 *   card      "You can pay up to X per order placed (Y per delivered order). Last 28 days you paid Z per order
 *             placed." with the interval (Wilson 95 % of c and d) and the n behind each rate; the converted-spend rate
 *             line under the CPA, the days not counted, "as of the last sync"
 *   missing   with an input missing, the list of what to add instead of any number (works with zero costs typed)
 *   by angle  orders, confirmation and delivery per Campaign Kit angle with n; small groups suppressed; no CPA per angle
 *   alerts    the open alerts of the daily `fin.alerts` job
 *
 * Every figure is the server's (`breakEvenFor`); this file formats, never computes one.
 */
import { AlertTriangleIcon, ArrowRightIcon, CircleDashedIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AggCell } from "@/lib/callcenter/aggregates";
import type { BreakEvenCard } from "@/lib/finance/lite/breakeven.server";
import type { RateWithN } from "@/lib/finance/lite/breakeven";
import type { OpenAlertView } from "@/lib/finance/lite/view.server";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cityLabel, type CityKey } from "@/lib/orders/address";
import { cn } from "@/lib/utils";
import { money, num, pct, ymdLabel } from "../queue/time";

const MISSING_TAB: Record<string, "costs" | "ads" | null> = { item_costs: "costs", packaging: "costs", delivery_fee: "costs", return_fee: "costs", confirm_n: null, delivery_n: null };

export function BreakEvenTab({ card, alerts, hrefs, tz }: { card: BreakEvenCard; alerts: OpenAlertView[]; hrefs: { costs: string; ads: string; zones: string }; tz: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const m = (c: number) => money(c, card.currency, locale);
  const r = card.result;
  const cpa = card.cpa;
  const dayFmt = (ymd: string) => ymdLabel(ymd, locale);
  const asOf = card.outcomesAsOf ? new Intl.DateTimeFormat(locale, { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(card.outcomesAsOf)) : null;

  return (
    <div className="grid gap-5">
      {alerts.length > 0 && <Alerts alerts={alerts} currency={card.currency} zones={hrefs.zones} />}

      <section aria-labelledby="fin-be" className="grid gap-5 rounded-[18px] border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fin-be" className="q-md font-semibold text-foreground">
            {t("fin.be.title")}
          </h2>
          <span className="q-xs q-num text-muted-foreground">{t("fin.be.window", { from: dayFmt(card.window.from), to: dayFmt(card.window.to) })}</span>
        </div>

        {r.ok ? (
          <div className="grid gap-4">
            <p className="text-[1.5rem] leading-snug font-semibold tracking-[-0.01em] text-balance text-foreground sm:text-[1.75rem]">
              {r.beCpaDeliveredCents === null
                ? t("fin.be.headlineNoDelivered", { placed: m(r.beCpaPlacedCents) })
                : t("fin.be.headline", { placed: m(r.beCpaPlacedCents), delivered: m(r.beCpaDeliveredCents) })}
            </p>
            <p className="q-sm q-num text-muted-foreground">{t("fin.be.interval", { low: m(r.interval.lowCents), high: m(r.interval.highCents) })}</p>
            <div className="grid gap-1 rounded-[14px] bg-muted/40 p-3.5">
              {cpa.placedCents !== null ? (
                <p className={cn("q-md font-medium", cpa.placedCents > r.beCpaPlacedCents ? "text-destructive" : "text-foreground")}>{t("fin.be.paid", { cpa: m(cpa.placedCents) })}</p>
              ) : (
                <p className="q-sm text-muted-foreground">
                  {t("fin.be.noSpend")}{" "}
                  <Link href={hrefs.ads} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {t("fin.be.addSpend")}
                  </Link>
                </p>
              )}
              {cpa.ratesUsed.map((x) => (
                <p key={`${x.currency}-${x.fromDay}`} className="q-xs q-num text-muted-foreground">
                  {t("fin.be.converted", { currency: x.currency, rate: num(x.rateMilli / 1000, locale), storeCurrency: card.currency, day: dayFmt(x.fromDay) })}
                </p>
              ))}
              {cpa.daysNotCounted > 0 && (
                <p className="q-xs text-muted-foreground">
                  {t("fin.be.daysNotCounted", { n: cpa.daysNotCounted })}{" "}
                  <Link href={hrefs.ads} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {t("fin.ads.addRate")}
                  </Link>
                </p>
              )}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label={t("fin.be.rateConfirm")} value={<RateLine rate={r.c} />} />
              <Fact label={t("fin.be.rateDelivery")} value={<RateLine rate={r.d} />} />
              <Fact label={t("fin.be.margin")} value={m(r.marginDeliveredCents)} />
              <Fact label={t("fin.be.loss")} value={m(r.lossFailedCents)} />
            </dl>
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="q-md font-medium text-foreground">{t("fin.missing.title")}</p>
            <ul className="grid gap-2">
              {r.missing.map((k) => {
                const tab = MISSING_TAB[k];
                return (
                  <li key={k} className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-background px-3.5 py-2.5">
                    <span className="q-sm inline-flex items-center gap-2 text-foreground">
                      <CircleDashedIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {k === "confirm_n" ? t("fin.missing.confirm_n", { n: r.nC }) : k === "delivery_n" ? t("fin.missing.delivery_n", { n: r.nD }) : t(`fin.missing.${k}`)}
                    </span>
                    {tab && (
                      <Link href={tab === "costs" ? hrefs.costs : hrefs.ads} className="q-sm inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                        {t("fin.be.addCosts")}
                        <ArrowRightIcon className="size-3.5 rtl:rotate-180" aria-hidden="true" />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
            {r.uncosted > 0 && <p className="q-xs text-muted-foreground">{t("fin.be.uncosted", { n: r.uncosted })}</p>}
          </div>
        )}

        <div className="q-xs flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-muted-foreground">
          <span className="q-num">{t("fin.be.placed", { n: card.counts.placed })}</span>
          {asOf && <span className="q-num">{t("fin.be.outcomesAsOf", { time: asOf })}</span>}
          {card.capped && <span>{t("fin.be.capped")}</span>}
        </div>
      </section>

      <ByAngle cells={card.byAngle.cells} suppressed={card.byAngle.suppressed} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-[14px] border border-border p-3">
      <dt className="q-xs text-muted-foreground">{label}</dt>
      <dd className="q-md q-num font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function RateLine({ rate }: { rate: RateWithN }) {
  const t = useT();
  const locale = useAdminLocale();
  return (
    <span className="grid gap-0.5">
      <span>{pct(rate.value, locale)}</span>
      <span className="q-2xs font-normal text-muted-foreground">{t("fin.be.rateRange", { low: pct(rate.low, locale), high: pct(rate.high, locale), n: num(rate.n, locale) })}</span>
    </span>
  );
}

function ByAngle({ cells, suppressed }: { cells: AggCell[]; suppressed: number }) {
  const t = useT();
  const locale = useAdminLocale();
  const kpi = (k: AggCell["confirmationRate"]) => ("value" in k ? `${pct(k.value, locale)} · n = ${num(k.n, locale)}` : t("fin.be.needs", { min: k.min }));
  return (
    <section aria-labelledby="fin-angle" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="fin-angle" className="q-md font-semibold text-foreground">
          {t("fin.be.byAngle")}
        </h2>
        <p className="q-sm text-muted-foreground">{t("fin.be.byAngle.note")}</p>
      </div>
      {cells.length === 0 ? (
        <p className="q-sm rounded-[14px] border border-dashed border-border px-4 py-3.5 text-muted-foreground">{t("fin.be.angle.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[18px] border border-border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="q-2xs border-b border-border text-muted-foreground [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                <th>{t("fin.be.angle.col.angle")}</th>
                <th className="!text-end">{t("fin.be.angle.col.placed")}</th>
                <th className="!text-end">{t("fin.be.angle.col.confirm")}</th>
                <th className="!text-end">{t("fin.be.angle.col.deliver")}</th>
              </tr>
            </thead>
            <tbody className="q-num">
              {cells.map((c) => (
                <tr key={c.key} className="border-b border-border/70 last:border-0 [&>td]:px-4 [&>td]:py-2.5">
                  <td className="font-medium text-foreground">{c.key === "" || c.key === "*" ? t("fin.be.angle.none") : c.key}</td>
                  <td className="text-end">{num(c.placed, locale)}</td>
                  <td className="text-end">{kpi(c.confirmationRate)}</td>
                  <td className="text-end">{kpi(c.deliveryRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {suppressed > 0 && <p className="q-xs text-muted-foreground">{t("fin.be.suppressed", { n: suppressed })}</p>}
    </section>
  );
}

function Alerts({ alerts, currency, zones }: { alerts: OpenAlertView[]; currency: string; zones: string }) {
  const t = useT();
  const locale = useAdminLocale();
  const pctBpText = (bp: number) => num(Math.round(bp) / 100, locale);
  return (
    <section aria-labelledby="fin-alerts" className="grid gap-2">
      <h2 id="fin-alerts" className="sr-only">
        {t("fin.alerts.title")}
      </h2>
      {alerts.map((a) => {
        const e = a.evidence;
        const n = Math.trunc(e.n ?? 0);
        let text = "";
        if (a.kind === "cpa_over_breakeven") text = t("fin.alert.cpa_over_breakeven", { value: money(e.cpaCents ?? 0, currency, locale), threshold: money(e.beCpaCents ?? 0, currency, locale) });
        else if (a.kind === "refusal_spike") text = t("fin.alert.refusal_spike", { value: pctBpText(e.rate7Bp ?? 0), threshold: pctBpText(e.rate28Bp ?? 0), n });
        else if (a.kind === "city_refusal") text = t("fin.alert.city_refusal", { city: cityLabel(a.key as CityKey, locale), value: pctBpText(e.rateBp ?? 0), threshold: pctBpText(e.storeRateBp ?? 0), n });
        else return null;
        const reasons = Object.entries(e)
          .filter(([k]) => k.startsWith("reason_"))
          .sort((x, y) => y[1] - x[1]);
        const top = reasons[0];
        return (
          <div key={`${a.kind}-${a.key}-${a.firedAt}`} role="status" className="flex flex-col gap-2 rounded-[14px] border border-destructive/30 bg-destructive/[0.05] p-3.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-2.5">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
              <div className="grid gap-1">
                <p className="q-sm text-foreground">{text}</p>
                {a.kind === "city_refusal" && top && (e.refused ?? 0) > 0 && (
                  <p className="q-xs text-muted-foreground">{t("fin.alert.city_refusal.reasons", { count: top[1], total: Math.trunc(e.refused ?? 0), reason: t(`ops.reason.return.${top[0].slice(7)}`) })}</p>
                )}
              </div>
            </div>
            {a.kind === "city_refusal" && (
              <Link href={zones} className="q-sm shrink-0 font-medium text-foreground underline-offset-2 hover:underline">
                {t("fin.alert.city_refusal.fix")}
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
