/**
 * Overview strip 7, AI (platform.md PLA-§7.3 row 7, §7.11): credits used / limit this month, the cloud cost this
 * month (USD micros as "$1.84"), the store's AI mode and Director mode, runs by provider, the last run (task, provider,
 * ms, outcome) and the open AI jobs. Never prompt or output text. P7's `aiStoreSummary` is a stub until P7 merges
 * ("unavailable"). End: none in R1 (the per-store AI pages are P7's).
 */
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { Ago } from "../../ago";
import { StripFrame, StripLine } from "./frame";
import { StripNotOk, tr } from "./shared";

const usd = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

export async function AiStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.ai");
  const p = await loadStrip(ctx, storeId, "ai");
  if (p.state !== "ok") return <StripNotOk strip="ai" title={title} p={p} end={null} />;
  const d = p.data;
  const month = d.credits.month;
  const runs = d.runs.reduce((n, r) => n + r.n, 0);
  return (
    <StripFrame strip="ai" title={title} at={p.at} end={null} summary={tr("console.strip.ai.summary", { used: month.used, limit: month.limit ?? "∞" })}>
      <dl className="grid">
        <StripLine label={tr("console.strip.ai.credits")}>{month.limit === null ? tr("console.strip.ai.credits_unlimited", { used: month.used }) : tr("console.strip.ai.credits_value", { used: month.used, limit: month.limit })}</StripLine>
        <StripLine label={tr("console.strip.ai.cost")}>{usd(d.costMicrosMonth)}</StripLine>
        <StripLine label={tr("console.strip.ai.mode")}>
          {tr(`console.strip.ai.mode.${d.mode}`)} · {d.director ? tr(`console.strip.ai.director.${d.director}`) : tr("console.strip.ai.director.none")}
        </StripLine>
        <StripLine label={tr("console.strip.ai.runs")}>{runs ? d.runs.map((r) => `${r.key} ${r.n}`).join(" · ") : tr("console.strip.ai.no_runs")}</StripLine>
        <StripLine label={tr("console.strip.ai.last")}>
          {d.last ? (
            <span className="text-[12.5px]">
              <bdi dir="ltr" className="font-mono text-[11.5px]">
                {d.last.task}
              </bdi>{" "}
              · {d.last.provider} · {d.last.ms !== null ? `${d.last.ms} ms` : ""} · {d.last.status} · <Ago iso={d.last.at} />
            </span>
          ) : (
            <span className="text-muted-foreground">{tr("console.strip.ai.no_runs")}</span>
          )}
        </StripLine>
        <StripLine label={tr("console.strip.ai.jobs")}>{d.openJobs}</StripLine>
      </dl>
    </StripFrame>
  );
}
