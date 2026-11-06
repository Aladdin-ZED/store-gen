/**
 * `/queue/me` (P4 CALL CENTER; operations.md OPE-§15.5 R1 half, §14.3, §13.2a; core §I.8 rule 3). A server component:
 * the end-of-day line, then three periods side by side (today, 7 days, 28 days), each figure with its n and a rate
 * withheld below the agent minimum ("needs 20", OD17). Counts and rates only; placed, confirmed and delivered never
 * share a tile (OD38).
 */
import "./queue.css";
import { ArrowLeftIcon } from "lucide-react";
import type { MyFigures } from "@/lib/callcenter/console.server";
import type { AgentPeriodKpis } from "@/lib/callcenter/kpis.server";
import { translator, type AdminLocale } from "@/lib/i18n/admin";
import type { Kpi } from "@/lib/orders/profile";
import { num, pct } from "./time";

export function MyDay({ figures, locale, storeName, queueHref }: { figures: MyFigures; locale: AdminLocale; storeName: string; queueHref: string }) {
  const t = translator(locale);
  const e = figures.endOfDay;
  const periods: { id: string; k: AgentPeriodKpis }[] = [
    { id: "ops.me.period.today", k: figures.today },
    { id: "ops.me.period.d7", k: figures.d7 },
    { id: "ops.me.period.d28", k: figures.d28 },
  ];
  const rate = (k: Kpi) => ("value" in k ? { v: pct(k.value, locale), n: k.n } : { v: null, n: k.n, min: k.min });
  const minutes = (k: Kpi) => ("value" in k ? { v: t("ops.me.min", { v: num(Math.round(k.value), locale) }), n: k.n } : { v: null, n: k.n, min: k.min });
  const seconds = (k: Kpi) => ("value" in k ? { v: t("ops.me.sec", { v: num(Math.round(k.value), locale) }), n: k.n } : { v: null, n: k.n, min: k.min });
  const ratio = (k: Kpi) => ("value" in k ? { v: new Intl.NumberFormat(`${locale}-u-nu-latn`, { maximumFractionDigits: 1 }).format(k.value), n: k.n } : { v: null, n: k.n, min: k.min });

  return (
    <div className="q-root mx-auto grid w-full max-w-[1100px] gap-8 px-4 pt-6 pb-16 sm:px-8 sm:pt-10">
      <header className="grid gap-3">
        <a href={queueHref} className="q-sm inline-flex w-fit items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("ops.me.back")}
        </a>
        <h1 className="q-xl font-semibold text-foreground">{t("ops.me.title")}</h1>
        <p className="q-sm max-w-prose text-muted-foreground">{t("ops.me.lead", { store: storeName })}</p>
      </header>

      <p className="q-md q-num rounded-2xl border border-border bg-card px-5 py-4 font-medium text-foreground">
        {t("ops.me.endOfDay", { decided: num(e.decided, locale), confirmed: num(e.confirmed, locale), callbacks: num(e.callbacksTomorrow, locale) })}
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        {periods.map(({ id, k }, i) => (
          <section key={id} className="q-rise grid content-start gap-4 rounded-[22px] border border-border bg-card p-5" style={{ animationDelay: `${i * 20}ms` }}>
            <h2 className="q-sm font-semibold text-muted-foreground">{t(id)}</h2>
            <div className="grid grid-cols-3 gap-2">
              <Count label={t("ops.me.kpi.decided")} value={num(k.decided, locale)} />
              <Count label={t("ops.me.kpi.confirmed")} value={num(k.confirmed, locale)} />
              <Count label={t("ops.me.kpi.attempts")} value={num(k.attempts, locale)} />
            </div>
            <dl className="grid gap-0.5">
              <Line label={t("ops.me.kpi.confirmationRate")} {...rate(k.confirmationRate)} t={t} locale={locale} />
              <Line label={t("ops.me.kpi.deliveryRate")} {...rate(k.deliveryRate)} t={t} locale={locale} />
              <Line label={t("ops.me.kpi.firstTouch")} {...minutes(k.firstTouchP50Min)} t={t} locale={locale} />
              <Line label={t("ops.me.kpi.attemptsPerConfirmation")} {...ratio(k.attemptsPerConfirmation)} t={t} locale={locale} />
              <Line label={t("ops.me.kpi.handling")} {...seconds(k.handlingP50Sec)} t={t} locale={locale} />
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-foreground/[0.03] px-3 py-2.5">
      <p className="q-lg q-num font-semibold text-foreground">{value}</p>
      <p className="q-2xs mt-0.5 text-muted-foreground">{label}</p>
    </div>
  );
}

function Line({ label, v, n, min, t, locale }: { label: string; v: string | null; n: number; min?: number; t: ReturnType<typeof translator>; locale: AdminLocale }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2 last:border-0">
      <dt className="q-sm text-foreground/85">{label}</dt>
      <dd className="q-xs q-num shrink-0 text-end text-muted-foreground">
        {v !== null ? (
          <>
            <bdi dir="ltr" className="q-sm font-semibold text-foreground">
              {v}
            </bdi>{" "}
            · {t("ops.counter.n", { n: num(n, locale) })}
          </>
        ) : (
          t("ops.counter.needs", { min: min ?? 20 })
        )}
      </dd>
    </div>
  );
}
