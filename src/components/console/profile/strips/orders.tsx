/**
 * Overview strip 4, Orders (platform.md PLA-§7.3 row 4; PD2, D54): orders placed in 7 days and in P4's 28-day window
 * (the label says 28, never "30"), the confirmation rate with its n, the risk mix (0-29 / 30-69 / ≥ 70) with n, and
 * the latest five orders masked (id, created, state, total, `maskName`, P4's masked phone; test orders never shown).
 * Every source is P4's console read: "unavailable" until P4 merges. End: the Orders tab.
 */
import { formatMoney } from "@/lib/markets/money";
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { Ago } from "../../ago";
import { profileHref } from "../tabs";
import { RiskBar } from "../risk-bar";
import { StripFrame, StripLine } from "./frame";
import { rateText, StripEmpty, StripNotOk, tr } from "./shared";

export async function OrdersStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.orders");
  const end = { href: profileHref(storeId, "orders"), label: tr("console.strip.orders.end") };
  const p = await loadStrip(ctx, storeId, "orders");
  if (p.state !== "ok") return <StripNotOk strip="orders" title={title} p={p} end={end} />;
  const d = p.data;
  return (
    <StripFrame strip="orders" title={title} at={p.at} end={end} summary={d.kpis7d ? tr("console.strip.orders.summary", { count: d.kpis7d.placed }) : null}>
      <dl className="grid">
        <StripLine label={tr("console.strip.orders.placed_7")}>{d.kpis7d ? d.kpis7d.placed : tr("console.strip.na")}</StripLine>
        <StripLine label={tr("console.strip.orders.placed_28")}>{d.kpis28d ? d.kpis28d.placed : tr("console.strip.na")}</StripLine>
        <StripLine label={tr("console.strip.orders.confirmation")}>{rateText(d.kpis28d?.confirmationRate)}</StripLine>
      </dl>
      {d.riskMix && (
        <div className="mt-2">
          <RiskBar mix={d.riskMix} />
        </div>
      )}
      {d.latest && d.latest.length === 0 && <StripEmpty text={tr("console.strip.orders.none")} />}
      {d.latest && d.latest.length > 0 && (
        <ul className="mt-2 grid">
          {d.latest.map((o) => (
            <li key={o.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2.5 border-t border-[var(--c-hairline)] py-1.5 text-[12.5px]">
              <bdi dir="ltr" className="font-mono text-[11.5px]">
                {o.id}
              </bdi>
              <span className="min-w-0 truncate text-muted-foreground">
                {o.customer} · <bdi dir="ltr">{o.phone}</bdi> · <Ago iso={o.createdAt} />
              </span>
              <span className="num text-end">{formatMoney(o.totalCents / 100, o.currency, "en")}</span>
            </li>
          ))}
        </ul>
      )}
    </StripFrame>
  );
}
