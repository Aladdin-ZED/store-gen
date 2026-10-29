"use client";
/**
 * The plot of OrdersChart (recharts). Its own module so recharts is code-split out of the
 * dashboard's first-load bundle; still server-rendered (initialDimension), so nothing shifts.
 */
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { compact, dayLabel, int, money } from "../lib/format";

export type Metric = "orders" | "value" | "uniques";

export interface Point {
  day: string;
  orders: number;
  /** the value of the orders placed that day (money, placed and not delivered) */
  value: number;
  uniques: number;
}

const config: ChartConfig = {
  orders: { label: "Orders", color: "var(--brand)" },
  value: { label: "Placed", color: "var(--brand)" },
  uniques: { label: "Visitors", color: "var(--brand)" },
};

export function OrdersPlot({ series, metric, currency }: { series: Point[]; metric: Metric; currency: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full" initialDimension={{ width: 720, height: 256 }}>
      <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.32} />
            <stop offset="70%" stopColor="var(--brand)" stopOpacity={0.06} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="0" className="stroke-border/60" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={28}
          tickFormatter={(d: string) => dayLabel(d)}
        />
        <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={(n: number) => (metric === "value" ? compact(n) : int(n))} />
        <Tooltip
          cursor={{ stroke: "var(--brand)", strokeOpacity: 0.35, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
            if (!p) return null;
            return (
              <div className="adm-glass grid min-w-40 gap-1.5 rounded-xl px-3 py-2.5 text-xs">
                <span className="font-medium text-foreground">{dayLabel(p.day)}</span>
                <Row label="Orders" value={int(p.orders)} active={metric === "orders"} />
                <Row label="Placed" value={money(p.value, currency)} active={metric === "value"} />
                <Row label="Visitors" value={int(p.uniques)} active={metric === "uniques"} />
              </div>
            );
          }}
        />
        <Area
          key={metric}
          dataKey={metric}
          type="monotone"
          stroke="var(--brand)"
          strokeWidth={2.25}
          fill={`url(#fill-${gid})`}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)", fill: "var(--brand)" }}
          animationDuration={400}
          animationEasing="ease-out"
          name={String(config[metric]?.label)}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function Row({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <span className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={active ? "size-1.5 rounded-full bg-brand" : "size-1.5 rounded-full bg-foreground/20"} />
        {label}
      </span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </span>
  );
}
