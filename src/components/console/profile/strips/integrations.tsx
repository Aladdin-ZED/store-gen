/**
 * Overview strip 6, Integrations (platform.md PLA-§7.3 row 6, §7.10): one line per integration from P5's
 * `integrationHealth` (state, backlog, last error code; secrets only ever "set / not set", never shown), and this
 * store's outbox, pending and dead, with Replay on a dead row (`stores.lifecycle`, P8's `replay`). Both sources are
 * later tracks' stubs until they merge ("unavailable"). End: the Integrations health tab arrives with R2.
 */
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { Ago } from "../../ago";
import { ReplayButton } from "./replay";
import { StripFrame, StripLine } from "./frame";
import { StripChip, StripEmpty, StripNotOk, tr } from "./shared";

const STATE_TONE = { ok: "success", warn: "warn", failing: "danger", off: "neutral" } as const;

export async function IntegrationsStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.integrations");
  const p = await loadStrip(ctx, storeId, "integrations");
  if (p.state !== "ok") return <StripNotOk strip="integrations" title={title} p={p} end="r2" />;
  const { rows, outbox } = p.data;
  const canReplay = ctx.can("stores.lifecycle");
  const failing = rows?.filter((r) => r.state === "failing").length ?? 0;
  return (
    <StripFrame strip="integrations" title={title} at={p.at} end="r2" summary={rows ? tr("console.strip.integrations.summary", { count: rows.length, failing }) : null}>
      {rows === null ? (
        <StripEmpty text={tr("console.strip.integrations.health_na")} />
      ) : rows.length === 0 ? (
        <StripEmpty text={tr("console.strip.integrations.none")} />
      ) : (
        <dl className="grid">
          {rows.slice(0, 4).map((r) => (
            <StripLine key={`${r.kind}:${r.targetId}`} label={tr(`console.strip.integrations.kind.${r.kind}`)}>
              <span className="inline-flex items-center gap-1.5">
                {r.backlog > 0 && <span className="text-[12px] text-muted-foreground">{tr("console.strip.integrations.backlog", { count: r.backlog })}</span>}
                {r.lastErrorCode && r.state !== "ok" && (
                  <bdi dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                    {r.lastErrorCode}
                  </bdi>
                )}
                <StripChip tone={STATE_TONE[r.state]}>{tr(`console.strip.integrations.state.${r.state}`)}</StripChip>
              </span>
            </StripLine>
          ))}
        </dl>
      )}
      {outbox && (
        <div className="mt-2 grid gap-1.5 border-t border-[var(--c-hairline)] pt-2">
          <p className="num text-[12px] text-muted-foreground">
            {tr("console.strip.integrations.outbox", {
              pending: outbox.byKind.reduce((n, k) => n + k.pending, 0),
              dead: outbox.byKind.reduce((n, k) => n + k.dead, 0),
            })}
          </p>
          {outbox.dead.slice(0, 2).map((d) => (
            <div key={d.id} className="flex min-w-0 items-center gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">
                <bdi dir="ltr" className="font-mono text-[11.5px]">
                  {d.kind}/{d.topic}
                </bdi>{" "}
                <span className="text-muted-foreground">
                  · {tr("console.strip.integrations.attempts", { count: d.attempts })} · <Ago iso={d.at} />
                </span>
              </span>
              {canReplay && <ReplayButton storeId={storeId} id={d.id} />}
            </div>
          ))}
        </div>
      )}
    </StripFrame>
  );
}
