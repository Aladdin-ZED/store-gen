"use client";
/**
 * FunnelChart (P2 SHELL; platform.md PLA-§22.12, §22.17, PD63; design.md DES-§16.9; docs/STORE-SAAS.md §I.6, §I.8 rule
 * 3): the order funnel (orders, confirmed, shipped, delivered, collected) as horizontal stepped bars: each bar's
 * length is its share of the first step, context bars in graphite (`--chart-2`), delivered in jade (`--brand`), the
 * count and the rate from the step before in tabular numerals at the inline end.
 *
 * One of the three places the dashboard draws numbers, so the honest rules of `funnelView` (./honest.ts) apply: a step
 * the release cannot measure (`value: null`) is the neutral line "Fills in with delivery tracking", never a 0 bar;
 * rates are recomputed from the counts; with fewer than 5 measured steps the chart is a table (§I.6). Props frozen at
 * PLA-§22.12 (src/lib/contracts/r1-p0b-platform.ts); `r1Funnel()` makes a 0 for a missing R1 step a type error.
 */
import type { ReactElement } from "react";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { funnelView } from "./honest";

export interface FunnelChartProps {
  steps: { id: "orders" | "confirmed" | "shipped" | "delivered" | "collected"; label: string; value: number | null /* null = not available in this release */; rate?: number }[];
  period: string;
}

export function FunnelChart(p: FunnelChartProps): ReactElement | null {
  const t = useT();
  const locale = useAdminLocale();
  const view = funnelView(p.steps);
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale);
  const pct = (rate: number) => `${num.format(rate)} %`;

  if (view.asTable) {
    return (
      <figure className="grid gap-3">
        <figcaption className="text-xs text-muted-foreground">{p.period}</figcaption>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-medium text-muted-foreground">
              <th scope="col" className="pb-2 text-start font-medium">
                {t("shell.funnel.stage")}
              </th>
              <th scope="col" className="pb-2 text-end font-medium">
                {t("shell.funnel.count")}
              </th>
              <th scope="col" className="pb-2 text-end font-medium">
                {t("shell.funnel.rate")}
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.id} data-step={row.id} className="border-t border-border">
                <th scope="row" className="py-2.5 text-start font-normal">
                  {row.label}
                </th>
                {row.value === null ? (
                  <td colSpan={2} className="py-2.5 text-end text-xs text-muted-foreground">
                    {t(view.missingKey)}
                  </td>
                ) : (
                  <>
                    <td className={cn("py-2.5 text-end font-medium tabular-nums", row.id === "delivered" && "text-brand")}>
                      <bdi>{num.format(row.value)}</bdi>
                    </td>
                    <td className="py-2.5 text-end text-muted-foreground tabular-nums">{row.rate === null ? "" : <bdi>{pct(row.rate)}</bdi>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    );
  }

  return (
    <figure className="grid gap-3">
      <figcaption className="text-xs text-muted-foreground">{p.period}</figcaption>
      <ol className="grid gap-2.5">
        {view.rows.map((row) => (
          <li key={row.id} data-step={row.id} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{row.label}</span>
              {row.value !== null && (
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <bdi className="font-medium">{num.format(row.value)}</bdi>
                  {row.rate !== null && (
                    <bdi className="text-xs text-muted-foreground" title={t("shell.funnel.rate")}>
                      {pct(row.rate)}
                    </bdi>
                  )}
                </span>
              )}
            </div>
            {row.value === null ? (
              <p className="border-t border-dashed border-border pt-1.5 text-xs text-muted-foreground">{t(view.missingKey)}</p>
            ) : (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", row.id === "delivered" ? "bg-brand" : "bg-chart-2")}
                  style={{ width: `${Math.max(row.share ?? 0, row.value > 0 ? 0.015 : 0) * 100}%` }}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}
