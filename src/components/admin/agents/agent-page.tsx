/**
 * `/app/<h>/team/agents/<userId>` (P4 CALL CENTER; operations.md OPE-§14.2, OD17; core §I.6 data rules). A server
 * component: every figure comes from `agentDetail` (test and honeypot orders excluded, D54).
 *
 *   KPIs        7 and 28 days, each rate with its n, "needs 20" below the agent minimum
 *   trend       the 28 days as bars (decided, confirmed inside) from 7 active days; fewer → a table of those days
 *   mixes       outcomes and cancel reasons as counts with shares only from n ≥ 20 (no pie, core §I.6)
 *   first call  the distribution of first-call delays in window minutes; under 5 calls a plain list
 *   recent      the latest orders the agent held or confirmed, masked
 */
import "../queue/queue.css";
import { ArrowLeftIcon, CircleDotIcon, CoffeeIcon, MoonIcon } from "lucide-react";
import Link from "next/link";
import { FIRST_TOUCH_EDGES, type AgentDetail } from "@/lib/callcenter/agents.server";
import { translator, type AdminLocale, type MessageKey } from "@/lib/i18n/admin";
import type { Kpi } from "@/lib/orders/profile";
import { cn } from "@/lib/utils";
import { money, num, pct, ymdLabel } from "../queue/time";

type T = ReturnType<typeof translator>;
const AGENT_MIN = 20;

export function AgentPage({ a, locale, tz, hrefs }: { a: AgentDetail; locale: AdminLocale; tz: string; hrefs: { agents: string; orders: string } }) {
  const t = translator(locale);
  const presence = a.presence === "online" && !a.live ? "offline" : a.presence;
  const PIcon = presence === "online" ? CircleDotIcon : presence === "break" ? CoffeeIcon : MoonIcon;
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <Link href={hrefs.agents} className="q-sm inline-flex w-fit items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("ops.agents.title")}
        </Link>
        <h1 className="flex flex-wrap items-center gap-2.5 text-[1.625rem] leading-tight font-semibold text-foreground">
          {a.name}
          {a.role !== "agent" && (
            <span className="q-2xs rounded-full px-2 py-0.5 font-medium text-muted-foreground ring-1 ring-border ring-inset">
              {t(`ops.agents.role.${a.role === "owner" || a.role === "admin" || a.role === "manager" ? a.role : "other"}` as MessageKey)}
            </span>
          )}
        </h1>
        <p className="q-sm flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1.5", presence === "online" && "text-emerald-700 dark:text-emerald-300")}>
            <PIcon className="size-3.5" aria-hidden="true" />
            {t(`ops.board.agent.presence.${presence}` as MessageKey)}
          </span>
          <span>
            {a.dailyCap === null ? t("ops.board.cap.none") : t("ops.agents.cap", { cap: num(a.dailyCap, locale) })} · {t("ops.agents.weight", { weight: a.weight })}
          </span>
          {a.labels.map((l) => (
            <span key={l} className="q-2xs rounded-full bg-foreground/[0.05] px-2.5 py-0.5 font-medium text-foreground/80" title={t("ops.agents.labelHint")}>
              <bdi>{l}</bdi>
            </span>
          ))}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { id: "ops.me.period.d7" as const, k: a.d7 },
          { id: "ops.me.period.d28" as const, k: a.d28 },
        ].map(({ id, k }) => (
          <section key={id} className="grid content-start gap-4 rounded-[22px] border border-border bg-card p-5">
            <h2 className="q-sm font-semibold text-muted-foreground">{t(id)}</h2>
            <div className="grid grid-cols-3 gap-2">
              <Count label={t("ops.me.kpi.decided")} value={num(k.decided, locale)} />
              <Count label={t("ops.me.kpi.confirmed")} value={num(k.confirmed, locale)} />
              <Count label={t("ops.me.kpi.attempts")} value={num(k.attempts, locale)} />
            </div>
            <dl className="grid">
              <Line t={t} locale={locale} label={t("ops.me.kpi.confirmationRate")} k={k.confirmationRate} fmt={(v) => pct(v, locale)} />
              <Line t={t} locale={locale} label={t("ops.me.kpi.deliveryRate")} k={k.deliveryRate} fmt={(v) => pct(v, locale)} />
              <Line t={t} locale={locale} label={t("ops.me.kpi.firstTouch")} k={k.firstTouchP50Min} fmt={(v) => t("ops.me.min", { v: num(Math.round(v), locale) })} />
              <Line t={t} locale={locale} label={t("ops.me.kpi.attemptsPerConfirmation")} k={k.attemptsPerConfirmation} fmt={(v) => new Intl.NumberFormat(`${locale}-u-nu-latn`, { maximumFractionDigits: 1 }).format(v)} />
              <Line t={t} locale={locale} label={t("ops.me.kpi.handling")} k={k.handlingP50Sec} fmt={(v) => t("ops.me.sec", { v: num(Math.round(v), locale) })} />
            </dl>
          </section>
        ))}
      </div>

      <Trend a={a} t={t} locale={locale} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Mix
          title={t("ops.agent.outcomes")}
          t={t}
          locale={locale}
          rows={(
            [
              ["confirmed", a.outcomes.confirmed],
              ["cancelled", a.outcomes.cancelled],
              ["unreachable", a.outcomes.unreachable],
              ["fake", a.outcomes.fake],
              ["duplicate", a.outcomes.duplicates],
            ] as const
          ).map(([id, v]) => ({ label: t(`ops.status.${id}` as MessageKey), count: v }))}
          extra={a.outcomes.callbacks > 0 ? t("ops.agent.callbacks", { n: num(a.outcomes.callbacks, locale) }) : null}
        />
        <Mix title={t("ops.agent.cancelReasons")} t={t} locale={locale} rows={a.cancelReasons.map((r) => ({ label: t(`ops.reason.${r.reason}` as MessageKey), count: r.count }))} extra={null} />
        <FirstTouch a={a} t={t} locale={locale} />
      </div>

      <section aria-labelledby="agent-recent" className="grid gap-3">
        <h2 id="agent-recent" className="q-md font-semibold text-foreground">
          {t("ops.agent.recent")}
        </h2>
        {a.recent.length === 0 ? (
          <p className="q-sm rounded-[18px] border border-dashed border-border px-4 py-5 text-muted-foreground">{t("ops.agent.noRecent")}</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-card">
            {a.recent.map((o) => (
              <li key={o.id}>
                <Link href={`${hrefs.orders}?order=${o.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-4 py-3 transition-colors hover:bg-foreground/[0.025]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[0.8125rem] font-medium text-foreground">{o.id}</span>
                    {o.isTest && <span className="q-2xs rounded px-1 font-semibold text-muted-foreground ring-1 ring-border ring-inset">{t("ops.test.chip")}</span>}
                    <span className="q-xs truncate text-muted-foreground">{t(`ops.status.${o.status}` as MessageKey)}</span>
                  </span>
                  <span className="q-sm q-num text-end font-medium text-foreground">{money(o.totalCents, o.currency, locale)}</span>
                  <span className="q-xs min-w-0 truncate text-muted-foreground">
                    {o.customer} ·{" "}
                    <bdi dir="ltr" className="font-mono">
                      {o.phoneMasked}
                    </bdi>
                    {o.city ? ` · ${o.city}` : ""}
                  </span>
                  <span className="q-2xs q-num text-end text-muted-foreground">
                    {new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { timeZone: tz, day: "numeric", month: "short" }).format(new Date(o.createdAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
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

function Line({ label, k, fmt, t, locale }: { label: string; k: Kpi; fmt: (v: number) => string; t: T; locale: AdminLocale }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/70 py-2 last:border-0">
      <dt className="q-sm text-foreground/85">{label}</dt>
      <dd className="q-xs q-num shrink-0 text-end text-muted-foreground">
        {"value" in k ? (
          <>
            <bdi dir="ltr" className="q-sm font-semibold text-foreground">
              {fmt(k.value)}
            </bdi>{" "}
            · {t("ops.counter.n", { n: num(k.n, locale) })}
          </>
        ) : (
          t("ops.counter.needs", { min: k.min })
        )}
      </dd>
    </div>
  );
}

function Trend({ a, t, locale }: { a: AgentDetail; t: T; locale: AdminLocale }) {
  const active = a.trend.filter((d) => d.decided > 0 || d.attempts > 0);
  const max = Math.max(1, ...a.trend.map((d) => d.decided));
  return (
    <section aria-labelledby="agent-trend" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="agent-trend" className="q-md font-semibold text-foreground">
          {t("ops.agent.trend")}
        </h2>
        {active.length >= 7 && (
          <span className="q-2xs flex items-center gap-3 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-foreground/15" aria-hidden="true" />
              {t("ops.me.kpi.decided")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-500/80" aria-hidden="true" />
              {t("ops.me.kpi.confirmed")}
            </span>
          </span>
        )}
      </div>
      {active.length === 0 ? (
        <p className="q-sm rounded-[18px] border border-dashed border-border px-4 py-5 text-muted-foreground">{t("ops.agent.noActivity")}</p>
      ) : active.length >= 7 ? (
        <div className="rounded-[18px] border border-border bg-card p-4">
          <ol className="flex h-40 items-end gap-[3px]" dir="ltr" aria-label={t("ops.agent.trendLabel", { days: a.trend.length })}>
            {a.trend.map((d) => (
              <li
                key={d.day}
                className="relative flex h-full flex-1 flex-col justify-end"
                title={t("ops.agent.trendCell", { day: ymdLabel(d.day, locale), decided: num(d.decided, locale), confirmed: num(d.confirmed, locale) })}
              >
                <span className="relative block w-full rounded-t-[3px] bg-foreground/15" style={{ blockSize: `${(d.decided / max) * 100}%` }}>
                  <span className="absolute inset-x-0 bottom-0 block rounded-t-[3px] bg-emerald-500/80" style={{ blockSize: d.decided ? `${(d.confirmed / d.decided) * 100}%` : 0 }} />
                </span>
              </li>
            ))}
          </ol>
          <div className="q-2xs q-num mt-2 flex justify-between text-muted-foreground" dir="ltr">
            <span>{ymdLabel(a.trend[0]!.day, locale)}</span>
            <span>{ymdLabel(a.trend[a.trend.length - 1]!.day, locale)}</span>
          </div>
        </div>
      ) : (
        <table className="w-full overflow-hidden rounded-[18px] border border-border bg-card text-sm">
          <thead>
            <tr className="q-2xs border-b border-border text-muted-foreground [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
              <th>{t("ops.agent.day")}</th>
              <th className="!text-end">{t("ops.me.kpi.decided")}</th>
              <th className="!text-end">{t("ops.me.kpi.confirmed")}</th>
              <th className="!text-end">{t("ops.me.kpi.attempts")}</th>
            </tr>
          </thead>
          <tbody className="q-num">
            {active.map((d) => (
              <tr key={d.day} className="border-b border-border/70 last:border-0 [&>td]:px-4 [&>td]:py-2">
                <td>{ymdLabel(d.day, locale)}</td>
                <td className="text-end">{num(d.decided, locale)}</td>
                <td className="text-end">{num(d.confirmed, locale)}</td>
                <td className="text-end">{num(d.attempts, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Mix({ title, rows, extra, t, locale }: { title: string; rows: { label: string; count: number }[]; extra: string | null; t: T; locale: AdminLocale }) {
  const shown = rows.filter((r) => r.count > 0).sort((x, y) => y.count - x.count);
  const total = shown.reduce((s, r) => s + r.count, 0);
  const shares = total >= AGENT_MIN;
  return (
    <section className="grid content-start gap-3 rounded-[22px] border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="q-sm font-semibold text-foreground">{title}</h2>
        <span className="q-2xs q-num text-muted-foreground">{shares ? t("ops.counter.n", { n: num(total, locale) }) : t("ops.counter.needs", { min: AGENT_MIN })}</span>
      </div>
      {shown.length === 0 ? (
        <p className="q-xs text-muted-foreground">{t("ops.agent.nothingYet")}</p>
      ) : (
        <ul className="grid gap-2.5">
          {shown.map((r) => (
            <li key={r.label} className="grid gap-1">
              <span className="q-xs q-num flex items-baseline justify-between gap-3">
                <span className="truncate text-foreground/85">{r.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  <span className="font-medium text-foreground">{num(r.count, locale)}</span>
                  {shares && ` · ${pct(r.count / total, locale)}`}
                </span>
              </span>
              {shares && (
                <span className="h-1 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-foreground/40" style={{ inlineSize: `${(r.count / total) * 100}%` }} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {extra && <p className="q-2xs text-muted-foreground">{extra}</p>}
    </section>
  );
}

function FirstTouch({ a, t, locale }: { a: AgentDetail; t: T; locale: AdminLocale }) {
  const { buckets, n } = a.firstTouch;
  const edges = [0, ...FIRST_TOUCH_EDGES];
  const label = (i: number) => (i < FIRST_TOUCH_EDGES.length ? t("ops.agent.bucket", { from: edges[i]!, to: edges[i + 1]! }) : t("ops.agent.bucketOver", { from: edges[i]! }));
  const max = Math.max(1, ...buckets);
  return (
    <section className="grid content-start gap-3 rounded-[22px] border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="q-sm font-semibold text-foreground">{t("ops.agent.firstTouch")}</h2>
        <span className="q-2xs q-num text-muted-foreground">{t("ops.counter.n", { n: num(n, locale) })}</span>
      </div>
      {n === 0 ? (
        <p className="q-xs text-muted-foreground">{t("ops.agent.nothingYet")}</p>
      ) : (
        <ul className="grid gap-2">
          {buckets.map((c, i) => (
            <li key={i} className="q-xs q-num grid grid-cols-[5.5rem_minmax(0,1fr)_2rem] items-center gap-2">
              <span className="text-foreground/85">{label(i)}</span>
              {n >= 5 ? (
                <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-foreground/40" style={{ inlineSize: `${(c / max) * 100}%` }} />
                </span>
              ) : (
                <span />
              )}
              <span className="text-end font-medium text-foreground">{num(c, locale)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
