/**
 * Overview strip 10, Timeline (platform.md PLA-§7.3 row 10, §7.8): the last 8 events of the merged stream
 * (lifecycle, decisions, plan changes, milestones, views, decision and warning notes, exports, renames) with their
 * actor and time, and the milestones pinned above them as markers with their dates (first draft, first publish,
 * first order, 10th order, first teammate, first delivered). End: the Activity tab's Timeline view.
 */
import type { Milestone } from "@/lib/health/types";
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { Ago } from "../../ago";
import { profileHref } from "../tabs";
import { timelineSentence } from "../timeline-text";
import { StripFrame } from "./frame";
import { StripEmpty, StripNotOk, tr } from "./shared";

const MILESTONES: Milestone[] = ["first_draft", "first_publish", "first_order", "tenth_order", "first_member", "first_delivered"];

export async function TimelineStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.timeline");
  const end = { href: profileHref(storeId, "activity", "view=timeline"), label: tr("console.strip.timeline.end") };
  const p = await loadStrip(ctx, storeId, "timeline");
  if (p.state !== "ok") return <StripNotOk strip="timeline" title={title} p={p} end={end} />;
  const d = p.data;
  const reached = MILESTONES.filter((m) => d.milestones[m]);
  return (
    <StripFrame strip="timeline" title={title} at={p.at} end={end} summary={tr("console.strip.timeline.summary", { count: d.events.length })}>
      {reached.length > 0 && (
        <ol aria-label={tr("console.strip.timeline.milestones")} className="mb-2 flex flex-wrap gap-1.5">
          {reached.map((m) => (
            <li key={m} className="inline-flex h-6 items-center gap-1.5 rounded-[var(--r-chip)] bg-[color-mix(in_oklch,var(--brand)_8%,transparent)] px-2 text-[11.5px] text-[var(--c-brand-ink)]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--brand)]" />
              {tr(`console.milestone.${m}`)}
              <span className="num text-muted-foreground">{d.milestones[m]!.slice(0, 10)}</span>
            </li>
          ))}
        </ol>
      )}
      {d.events.length === 0 ? (
        <StripEmpty text={tr("console.strip.timeline.none")} />
      ) : (
        <ol className="relative grid ps-3.5 before:absolute before:inset-y-1.5 before:start-[3px] before:w-px before:bg-[var(--c-hairline)]">
          {d.events.map((e) => {
            const s = timelineSentence(tr, e);
            return (
              <li key={`${e.source}:${e.id}`} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1 text-[12.5px]">
                <span aria-hidden="true" className={`absolute -start-3.5 top-[9px] size-[7px] rounded-full ring-2 ring-card ${e.source === "note" ? "bg-[oklch(0.8_0.15_95)]" : e.source === "view" ? "bg-[oklch(0.6_0.14_295)]" : "bg-[color-mix(in_oklch,var(--foreground)_35%,transparent)]"}`} />
                <span className="min-w-0 truncate" title={s.text}>
                  {s.known ? s.text : <bdi dir="ltr" className="font-mono text-[11.5px]">{s.text}</bdi>}
                  {e.actor.name && <span className="text-muted-foreground"> · {e.actor.name}</span>}
                </span>
                <Ago iso={e.at} className="shrink-0 text-[11.5px] text-muted-foreground" />
              </li>
            );
          })}
        </ol>
      )}
    </StripFrame>
  );
}
