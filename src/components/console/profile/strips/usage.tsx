/**
 * Overview strip 8, Usage & plan (platform.md PLA-§7.3 row 8, §7.9): the plan and since when, the gauges (media,
 * pages, members, agents, campaigns, short links) and this month's counters (exports, AI credits, orders) as
 * UsageMeters, the active boosts with their expiry, and the state caps in force ("Pending: 100 MiB"). End: the
 * Usage & plan tab.
 */
import { UsageMeter } from "@/components/admin/common/usage-meter";
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { Until } from "../../ago";
import { profileHref } from "../tabs";
import { StripFrame } from "./frame";
import { StripChip, StripNotOk, tr } from "./shared";

const UNIT: Record<string, "bytes" | "count" | "credits"> = { media_bytes: "bytes", ai_credits: "credits" };

export async function UsageStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.usage");
  const end = { href: profileHref(storeId, "usage"), label: tr("console.strip.usage.end") };
  const p = await loadStrip(ctx, storeId, "usage");
  if (p.state !== "ok") return <StripNotOk strip="usage" title={title} p={p} end={end} />;
  const d = p.data;
  const near = d.meters.filter((m) => m.pct !== null && m.pct >= 80).length;
  return (
    <StripFrame strip="usage" title={title} at={p.at} end={end} summary={d.plan.name ?? d.plan.id}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <StripChip tone="brand">{d.plan.name ?? d.plan.id}</StripChip>
        {d.plan.since && <span className="text-[12px] text-muted-foreground">{tr("console.strip.usage.since", { date: d.plan.since.slice(0, 10) })}</span>}
        {near > 0 && <StripChip tone="warn">{tr("console.strip.usage.near", { count: near })}</StripChip>}
      </div>
      <div className="grid gap-2 [&>div:not([class])]:grid [&>div:not([class])]:grid-cols-[minmax(0,1fr)_auto] [&>div:not([class])]:gap-x-3 [&>div:not([class])]:text-[12.5px] [&>div:not([class])>meter]:col-span-2 [&>div:not([class])>meter]:h-1.5 [&>div:not([class])>meter]:w-full [&>div:not([class])>span:first-child]:text-muted-foreground">
        {d.meters.slice(0, 6).map((m) => (
          <UsageMeter key={m.metric} label={tr(`console.usage.metric.${m.metric}`)} used={m.used} limit={m.limit} unit={UNIT[m.metric] ?? "count"} />
        ))}
      </div>
      {(d.boosts.length > 0 || d.stateCaps.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--c-hairline)] pt-2">
          {d.boosts.map((b) => (
            <StripChip key={b.key} tone="success">
              {tr("console.strip.usage.boost", { key: tr(`console.entitlement.${b.key}`) })} {b.expiresAt && <Until iso={b.expiresAt} />}
            </StripChip>
          ))}
          {d.stateCaps.map((c) => (
            <StripChip key={c.key} tone="warn">
              {c.mib !== undefined ? tr("console.strip.usage.cap_mib", { key: tr(`console.entitlement.${c.key}`), mib: c.mib }) : tr("console.strip.usage.cap", { key: tr(`console.entitlement.${c.key}`) })}
            </StripChip>
          ))}
        </div>
      )}
    </StripFrame>
  );
}
