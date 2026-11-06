/**
 * Overview strip 2, Health (platform.md PLA-§7.3 row 2, PL-18; PD6, PD53, PD66, PD67): the 40 px ring with the score,
 * the seven group penalties as one compact bar (each group's cell filled by its penalty over its cap), the top 5
 * unsnoozed issues (sentence, evidence with n, severity in words), the issues the store snoozed with their date, the
 * console flags as chips, and "Mark dirty" (the next run recomputes the store first). Same row as the tenant's ring.
 * End: the stores list filtered by this store's first flag (or sorted by health when it has none).
 */
import { HealthRing } from "@/components/admin/common/health-ring";
import { HEALTH_CAPS, type HealthGroup } from "@/lib/health/types";
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { Ago, Until } from "../../ago";
import { MarkDirtyButton, StripFrame } from "./frame";
import { StripChip, StripEmpty, StripNotOk, tr } from "./shared";

const GROUPS = Object.keys(HEALTH_CAPS) as HealthGroup[];
const SEV_TONE = { 1: "neutral", 2: "warn", 3: "danger" } as const;

export async function HealthStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.health");
  const p = await loadStrip(ctx, storeId, "health");
  const fallbackEnd = { href: "/admin/stores?sort=health", label: tr("console.strip.health.end") };
  if (p.state !== "ok") return <StripNotOk strip="health" title={title} p={p} end={fallbackEnd} />;
  const d = p.data;
  if (!d) {
    return (
      <StripFrame strip="health" title={title} at={p.at} end={fallbackEnd} summary={tr("console.strip.health.none_short")}>
        <StripEmpty text={tr("console.strip.health.none")} />
      </StripFrame>
    );
  }
  const end = d.flags[0] ? { href: `/admin/stores?flag=${d.flags[0].code}`, label: tr("console.strip.health.end_flag", { flag: tr(`console.hflag.${d.flags[0].code}`) }) } : fallbackEnd;
  const penalty = GROUPS.reduce((n, g) => n + (d.components[g] ?? 0), 0);
  return (
    <StripFrame strip="health" title={title} at={p.at} end={end} summary={tr("console.strip.health.summary", { score: d.score, issues: d.issues.length })} aside={<MarkDirtyButton storeId={storeId} dirty={d.dirty} />}>
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <HealthRing score={d.score} attention={d.issues.some((i) => i.severity >= 3) ? 3 : d.issues.length ? 2 : 0} size={40} computedAt={d.computedAt} dirty={d.dirty} surface="console" />
          <div className="grid min-w-0 flex-1 gap-1.5">
            <p className="text-[12px] text-muted-foreground">
              {tr("console.strip.health.penalty", { points: penalty })} · <Ago iso={d.computedAt} template="console.strip.health.computed" />
            </p>
            <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={GROUPS.map((g) => `${tr(`console.hgroup.${g}`)} ${d.components[g] ?? 0}/${HEALTH_CAPS[g]}`).join(", ")}>
              {GROUPS.map((g) => {
                const share = Math.min(1, (d.components[g] ?? 0) / HEALTH_CAPS[g]);
                return (
                  <span key={g} className="relative h-full bg-[var(--c-hairline)]" style={{ flexGrow: HEALTH_CAPS[g], flexBasis: 0 }} title={`${tr(`console.hgroup.${g}`)}: −${d.components[g] ?? 0} / ${HEALTH_CAPS[g]}`}>
                    <span className="absolute inset-y-0 start-0 bg-[oklch(0.78_0.14_95)] dark:bg-[oklch(0.72_0.13_95)]" style={{ width: `${share * 100}%` }} />
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {d.issues.length === 0 ? (
          <StripEmpty text={tr("console.strip.health.no_issues")} />
        ) : (
          <ul className="grid">
            {d.issues.map((i) => (
              <li key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-b border-[var(--c-hairline)] py-1.5 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate text-[13px]" title={tr(i.text)}>
                    {tr(i.text)}
                  </span>
                  <span className="num block text-[11.5px] text-muted-foreground">{tr("console.strip.health.evidence", { value: i.evidence.value, window: i.evidence.window, n: i.evidence.n })}</span>
                </span>
                <StripChip tone={SEV_TONE[i.severity]}>{tr(`console.strip.health.sev.${i.severity}`)}</StripChip>
              </li>
            ))}
          </ul>
        )}

        {d.snoozed.length > 0 && (
          <p className="text-[12px] text-muted-foreground">
            {tr("console.strip.health.snoozed", { count: d.snoozed.length })} <Until iso={d.snoozed.map((s) => s.until).sort()[0]!} template="console.strip.health.snoozed_until" />
          </p>
        )}
        {d.flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.flags.map((f) => (
              <StripChip key={f.code} tone={f.severity >= 3 ? "danger" : "warn"}>
                {tr(`console.hflag.${f.code}`)}
              </StripChip>
            ))}
          </div>
        )}
      </div>
    </StripFrame>
  );
}
