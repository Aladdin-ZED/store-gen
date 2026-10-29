"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { EmptyState } from "../common/empty-state";
import { Segmented } from "../common/segmented";
import { int, money, percent } from "../lib/format";
import type { Metric, Point } from "./orders-chart-plot";

// recharts is code-split: server-rendered as before, hydrated once its chunk is in
const OrdersPlot = dynamic(() => import("./orders-chart-plot").then((m) => m.OrdersPlot), {
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" aria-hidden="true" />,
});

/** The daily area chart (four weeks) with a metric switch; soft brand gradient, hairline grid, glass tooltip. */
export function OrdersChart({ series, currency }: { series: Point[]; currency: string }) {
  const [metric, setMetric] = useState<Metric>("orders");
  const totals = useMemo(
    () => series.reduce((a, p) => ({ orders: a.orders + p.orders, value: a.value + p.value, uniques: a.uniques + p.uniques }), { orders: 0, value: 0, uniques: 0 }),
    [series],
  );
  const empty = totals.orders === 0 && totals.uniques === 0;
  const fmt = (n: number) => (metric === "value" ? money(n, currency) : int(n));
  const title = `Last ${series.length} days`;
  const conversion = totals.uniques ? totals.orders / totals.uniques : 0;

  return (
    <section className="adm-surface adm-rise flex flex-col gap-5 p-5 sm:p-6" style={{ ["--i" as string]: 4 }} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-[0.95rem] font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {/* a rate never without its n (core §I.8 rule 3): the conversion names the visitors it is of */}
            {int(totals.orders)} orders · {money(totals.value, currency)} placed · {totals.uniques ? `${percent(conversion)} of ${int(totals.uniques)} visitors` : "no visitors yet"}
          </p>
        </div>
        <Segmented
          label="Chart metric"
          size="sm"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "orders", label: "Orders" },
            { value: "value", label: "Placed" },
            { value: "uniques", label: "Visitors" },
          ]}
        />
      </div>
      {empty ? (
        <EmptyState compact illustration="chart" title="No traffic yet" description="Publish a page and share its link. Visits and orders draw here, day by day." className="min-h-64" />
      ) : (
        <OrdersPlot series={series} metric={metric} currency={currency} />
      )}
      <p className="sr-only">Values shown: {fmt(totals[metric])} in total.</p>
    </section>
  );
}
