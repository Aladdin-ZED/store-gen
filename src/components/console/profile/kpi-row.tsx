"use client";
/**
 * The Overview's KPI row (platform.md PLA-§7.3; PL-07, D54; PLA-§4.7 rule 3): 7 / 30 / 90 days in the store's time
 * zone (the hint says so), test orders never counted. Visitors (unique), orders placed, the confirmation rate with its
 * n (P4's 7- or 28-day window; the tile says which), placed sales, confirmed sales and the average placed order; the
 * delivery figures fill in with delivery tracking (R2) and say so in one line. Placed, confirmed and delivered never
 * share a tile, and a rate never shows without its n. The daily chart draws orders placed (neutral) with ≥ 7 points,
 * else a table; the confirmed series (jade) waits for a daily source and its legend says so.
 *
 *   <ProfileKpis storeId={id} kpis={await getStoreOverview(ctx, id, 30)} />
 */
import { useT } from "@/lib/i18n/admin/client";
import { formatMoney } from "@/lib/markets/money";
import type { StoreOverviewKpis } from "@/lib/platform/profile/overview-strips";
import { cn } from "@/lib/utils";
import { compactCount } from "../format";
import { PanelError } from "../panel";
import { PrefetchLink } from "../prefetch-link";
import { profileHref } from "./tabs";

const RANGES = [7, 30, 90] as const;

function Tile({ label, value, sub, title, muted }: { label: string; value: string; sub?: string | null; title?: string; muted?: boolean }) {
  return (
    <div className="grid min-h-[96px] content-start gap-1 rounded-[var(--r-card)] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span title={title} className={cn("num text-[22px] leading-[1.2] font-semibold tracking-[-0.02em]", muted && "text-[15px] font-medium text-muted-foreground")}>
        {value}
      </span>
      {sub && <span className="num text-[11.5px] leading-snug text-muted-foreground">{sub}</span>}
    </div>
  );
}

export function ProfileKpis({ storeId, kpis }: { storeId: string; kpis: StoreOverviewKpis }) {
  const t = useT();
  const stats = kpis.stats.state === "ok" ? kpis.stats.data : null;
  const orders = kpis.orders.state === "ok" ? kpis.orders.data : null;
  const na = t("console.profile.kpi.na");
  const money = (cents: number) => formatMoney(cents / 100, kpis.currency, "en");
  const count = (n: number) => compactCount(n);
  const rate = orders?.confirmationRate;
  const window = orders ? t("console.profile.kpi.window", { days: orders.windowDays }) : null;

  return (
    <section aria-label={t("console.profile.kpi.title")} className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-muted-foreground">{t("console.profile.kpi.hint", { days: kpis.range, tz: kpis.timezone })}</p>
        <nav aria-label={t("console.profile.kpi.range")} className="inline-flex rounded-[var(--r-control)] bg-secondary p-0.5">
          {RANGES.map((r) => (
            <PrefetchLink
              key={r}
              href={profileHref(storeId, "overview", r === 30 ? "" : `range=${r}`)}
              scroll={false}
              aria-current={kpis.range === r ? "true" : undefined}
              className={cn(
                "num inline-flex h-7 items-center rounded-[calc(var(--r-control)-2px)] px-3 text-[12px] font-medium text-muted-foreground outline-none transition-colors duration-[var(--dur-1)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-10",
                kpis.range === r && "bg-card text-foreground shadow-[0_1px_2px_oklch(0.2_0.01_230/0.12),inset_0_0_0_1px_var(--c-hairline)]",
              )}
            >
              {t("console.profile.kpi.days", { count: r })}
            </PrefetchLink>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label={t("console.profile.kpi.visitors")} value={stats ? count(stats.uniques).text : na} title={stats ? count(stats.uniques).exact : undefined} muted={!stats} sub={stats ? t("console.profile.kpi.unique") : null} />
        <Tile label={t("console.profile.kpi.placed")} value={stats ? count(stats.orders).text : na} title={stats ? count(stats.orders).exact : undefined} muted={!stats} sub={stats ? t("console.profile.kpi.no_tests") : null} />
        <Tile
          label={t("console.profile.kpi.confirmation")}
          value={!rate ? na : "insufficient" in rate ? t("console.profile.kpi.needs_n_short") : `${Math.round(rate.value * 100)} %`}
          muted={!rate || "insufficient" in rate}
          sub={!rate ? (kpis.range === 90 ? t("console.profile.kpi.no_90") : null) : "insufficient" in rate ? t("console.strip.needs_n", { min: rate.min, n: rate.n }) : `${t("console.profile.kpi.n", { n: rate.n })} · ${window}`}
        />
        <Tile label={t("console.profile.kpi.placed_sales")} value={stats ? money(stats.placedCents) : na} muted={!stats} sub={stats ? kpis.currency : null} />
        <Tile label={t("console.profile.kpi.confirmed_sales")} value={na} muted sub={t("console.profile.kpi.confirmed_sales_na")} />
        <Tile
          label={t("console.profile.kpi.average")}
          value={stats && stats.orders > 0 ? money(Math.round(stats.placedCents / stats.orders)) : na}
          muted={!stats || stats.orders === 0}
          sub={stats && stats.orders > 0 ? t("console.profile.kpi.n", { n: stats.orders }) : null}
        />
      </div>
      <p className="text-[12px] text-muted-foreground">{t("console.profile.kpi.r2")}</p>
      {kpis.stats.state === "error" && (
        <div className="rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          <PanelError compact reference={kpis.stats.ref} />
        </div>
      )}
      {stats && <DailyChart days={stats.days} />}
    </section>
  );
}

/** Orders placed per day: bars with ≥ 7 points, else a table (PLA-§4.7 rule 3). */
function DailyChart({ days }: { days: { day: string; orders: number }[] }) {
  const t = useT();
  const total = days.reduce((n, d) => n + d.orders, 0);
  if (total === 0) return <p className="rounded-[var(--r-card)] bg-card px-4 py-3 text-[12.5px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--c-hairline)]">{t("console.profile.kpi.chart_empty")}</p>;
  if (days.length < 7) {
    return (
      <table className="w-full max-w-md text-[12.5px]">
        <caption className="pb-1 text-start text-[12px] text-muted-foreground">{t("console.profile.kpi.chart_title")}</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day} className="border-t border-[var(--c-hairline)]">
              <td className="num py-1 text-muted-foreground">{d.day}</td>
              <td className="num py-1 text-end">{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const max = Math.max(1, ...days.map((d) => d.orders));
  return (
    <figure className="grid gap-2 rounded-[var(--r-card)] bg-card px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="font-medium">{t("console.profile.kpi.chart_title")}</span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" className="size-2 rounded-[2px] bg-[color-mix(in_oklch,var(--foreground)_38%,transparent)]" />
          {t("console.profile.kpi.series_placed", { n: total })}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" className="size-2 rounded-[2px] border border-dashed border-[oklch(0.64_0.13_160)]" />
          {t("console.profile.kpi.series_confirmed_na")}
        </span>
      </figcaption>
      <div role="img" aria-label={t("console.profile.kpi.chart_label", { days: days.length, total })} className="flex h-24 items-end gap-[2px] border-b border-[var(--c-hairline)]">
        {days.map((d) => (
          <span key={d.day} title={`${d.day}: ${d.orders}`} className="min-w-0 flex-1 rounded-t-[2px] bg-[color-mix(in_oklch,var(--foreground)_30%,transparent)] transition-colors hover:bg-[color-mix(in_oklch,var(--foreground)_55%,transparent)]" style={{ height: d.orders === 0 ? 0 : `${Math.max(3, (d.orders / max) * 100)}%` }} />
        ))}
      </div>
      <div className="num flex justify-between text-[10.5px] text-muted-foreground" aria-hidden="true">
        <span>{days[0]!.day.slice(5)}</span>
        <span>{days[days.length - 1]!.day.slice(5)}</span>
      </div>
    </figure>
  );
}

export function ProfileKpisSkeleton() {
  return (
    <div aria-busy="true" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="min-h-[96px] rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]" />
      ))}
    </div>
  );
}
