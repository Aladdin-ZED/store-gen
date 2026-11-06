"use client";
/**
 * The overview's six KPI tiles (platform.md PLA-§5.2, PL-05; PD15, PD21; core §I.8 rule 3) through P2's `KpiTile`
 * (PLA-§22.12 props). Real data only: a tile without data says so ("No orders in the last 24 h") instead of a 0 with an
 * arrow; money stays per currency (the largest as the value, the others in the hint, never summed across); the sales
 * tile says "Placed, not delivered"; an analyst below `analytics.k` contributing stores reads "Hidden: fewer than 5
 * stores contribute" on both order tiles; a tile whose source failed or is not installed yet says that, alone.
 * No sparkline: the read model has no hourly series of ≥ 7 points to draw.
 *
 *   <KpiRow tiles={await overviewKpis(ctx)} />
 */
import { KpiTile, type KpiTileProps } from "@/components/admin/common/kpi-tile";
import { useT } from "@/lib/i18n/admin/client";
import { formatMoney } from "@/lib/markets/money";
import type { KpiTiles } from "@/lib/platform/overview";
import type { Panel } from "@/lib/platform/panel";
import { cn } from "@/lib/utils";
import { bytesText, compactCount, minutesText } from "../format";
import styles from "../shell/console.module.css";

type T = ReturnType<typeof useT>;

/** A tile whose source is not "ok": the value "Unknown" and why. */
function notOk(t: T, label: string, p: Exclude<Panel<unknown>, { state: "ok" }>, kind: KpiTileProps["kind"]): KpiTileProps {
  return { label, kind, value: t("console.kpi.unknown"), hint: p.state === "error" ? `${t("console.panel.error")} · ${t("console.panel.ref", { ref: p.ref })}` : t("console.panel.unavailable") };
}

const count = (n: number) => compactCount(n).text;

/** Percent change against the previous 24 h, only when there is a previous figure to compare with. */
function deltaOf(cur: number, prev: number, period: string): KpiTileProps["delta"] {
  if (prev <= 0) return undefined;
  return { value: Math.round(((cur - prev) / prev) * 100), period };
}

export function tilesOf(t: T, tiles: KpiTiles): KpiTileProps[] {
  const out: KpiTileProps[] = [];

  const active = tiles.activeStores;
  const activeLabel = t("console.kpi.active");
  out.push(active.state === "ok" ? { label: activeLabel, kind: "count", value: count(active.data.active), hint: t("console.kpi.active_hint", { restricted: active.data.restricted, review: active.data.inReview }) } : notOk(t, activeLabel, active, "count"));

  const w = tiles.waiting;
  const wLabel = t("console.kpi.waiting");
  if (w.state !== "ok") out.push(notOk(t, wLabel, w, "count"));
  else {
    const age = minutesText(w.data.oldestMin);
    const hint = w.data.count === 0 || !age ? t("console.kpi.waiting_none") : w.data.pastSla ? t("console.kpi.waiting_past", { age, count: w.data.pastSla }) : t("console.kpi.waiting_hint", { age });
    out.push({ label: wLabel, kind: "count", value: count(w.data.count), hint, emphasis: (w.data.pastSla ?? 0) > 0 });
  }

  const o = tiles.orders;
  const oLabel = t("console.kpi.orders");
  if (o.state !== "ok") out.push(notOk(t, oLabel, o, "count"));
  else if (o.data.kind === "hidden") out.push({ label: oLabel, kind: "count", value: t("console.kpi.hidden"), hint: t("console.kpi.hidden_hint", { k: o.data.k }) });
  else if (o.data.kind === "empty") out.push({ label: oLabel, kind: "count", value: t("console.kpi.none"), hint: t("console.kpi.orders_empty") });
  else
    out.push({
      label: oLabel,
      kind: "count",
      value: count(o.data.count),
      delta: deltaOf(o.data.count, o.data.prev, t("console.kpi.vs_prev")),
      hint: t("console.kpi.orders_hint", { stores: o.data.stores, confirmed: o.data.confirmed, risky: o.data.risky }),
      n: o.data.count,
    });

  const s = tiles.sales;
  const sLabel = t("console.kpi.sales");
  if (s.state !== "ok") out.push(notOk(t, sLabel, s, "money"));
  else if (s.data.kind === "hidden") out.push({ label: sLabel, kind: "money", value: t("console.kpi.hidden"), hint: t("console.kpi.hidden_hint", { k: s.data.k }) });
  else if (s.data.kind === "empty" || s.data.byCurrency.length === 0) out.push({ label: sLabel, kind: "money", value: t("console.kpi.none"), hint: t("console.kpi.sales_empty") });
  else {
    const [top, ...rest] = s.data.byCurrency;
    const money = (c: { currency: string; cents: number }) => formatMoney(c.cents / 100, c.currency, "en");
    const placed = t("console.kpi.sales_hint");
    out.push({ label: sLabel, kind: "money", value: money(top!), hint: rest.length ? `${rest.map(money).join(" · ")} · ${placed}` : placed, n: top!.orders });
  }

  const e = tiles.errors;
  const eLabel = t("console.kpi.errors");
  if (e.state !== "ok") out.push(notOk(t, eLabel, e, "count"));
  else if (e.data.kind === "empty") out.push({ label: eLabel, kind: "count", value: t("console.kpi.none"), hint: t("console.kpi.errors_empty") });
  else out.push({ label: eLabel, kind: "count", value: count(e.data.count), hint: e.data.top ? t("console.kpi.errors_hint", { code: e.data.top.code, area: e.data.top.area }) : "" });

  const d = tiles.database;
  const dLabel = t("console.kpi.database");
  if (d.state !== "ok") out.push(notOk(t, dLabel, d, "count"));
  else if (!d.data) out.push({ label: dLabel, kind: "count", value: t("console.kpi.unknown"), hint: t("console.kpi.database_unknown") });
  else {
    const vars = { used: bytesText(d.data.bytes), quota: bytesText(d.data.quotaBytes) };
    const key = d.data.level === "full" ? "console.kpi.database_full" : d.data.level === "warn" ? "console.kpi.database_warn" : "console.kpi.database_hint";
    out.push({ label: dLabel, kind: "count", value: `${Math.round(d.data.ratio * 100)} %`, hint: t(key, vars), emphasis: d.data.level !== "ok" });
  }
  return out;
}

export function KpiRow({ tiles }: { tiles: KpiTiles }) {
  const t = useT();
  return (
    <div className={cn(styles.kpis, "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6")}>
      {tilesOf(t, tiles).map((p) => (
        <KpiTile key={p.label} {...p} />
      ))}
    </div>
  );
}
