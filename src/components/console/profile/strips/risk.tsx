/**
 * Overview strip 9, Risk (platform.md PLA-§7.3 row 9; PD52, PD70): the latest sign-up review (score ring, band, the
 * top 3 flags as sentences, the counterfactual line, `partial`), linked accounts with a banned badge, the blocklist
 * size, the restriction history, the live brand state (the protected term and field, or "No protected term on live
 * pages") and the abuse reports ("3 reports, 2 in 24 h: phishing ×2 …" with the newest reason and page path; the
 * reporter's details are R3 triage, never shown). End: the Risk tab arrives with R2.
 */
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { SignupBand } from "@/lib/platform/types";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { ScoreRing } from "../../ring";
import { bandTint } from "../../tints";
import { StripFrame, StripLine } from "./frame";
import { StripChip, StripEmpty, StripNotOk, tr } from "./shared";

const LOWER: Record<SignupBand, SignupBand | null> = { fast: null, review: "fast", hold: "review", reject_candidate: "hold" };

function flagText(code: string, evidence: Record<string, string | number> | undefined): string {
  const vars: Record<string, string | number> = { ...(evidence ?? {}) };
  if (typeof vars.field === "string") vars.field = tr(`console.risk.field.${vars.field}`);
  return tr(`console.risk.${code}`, vars);
}

export async function RiskStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.risk");
  const p = await loadStrip(ctx, storeId, "risk");
  if (p.state !== "ok") return <StripNotOk strip="risk" title={title} p={p} end="r2" />;
  const d = p.data;
  const r = d.review;
  const ex = r?.explain;
  const lower = ex ? LOWER[ex.band] : null;
  return (
    <StripFrame strip="risk" title={title} at={p.at} end="r2" summary={r ? tr("console.strip.risk.summary", { score: r.score, band: tr(`console.band.${r.band}`) }) : tr("console.strip.risk.no_review_short")}>
      {r ? (
        <div className="grid gap-2">
          <div className="flex items-center gap-2.5">
            <ScoreRing score={r.score} tint={bandTint(r.band)} size={32} />
            <div className="grid min-w-0 gap-0.5">
              <span className="text-[13px] font-medium">{tr(`console.band.${r.band}`)}</span>
              <span className="text-[11.5px] text-muted-foreground">{r.partial ? tr("console.strip.risk.partial") : tr("console.strip.risk.signup")}</span>
            </div>
          </div>
          {r.flags.length > 0 && (
            <ul className="grid gap-0.5">
              {r.flags.map((f) => (
                <li key={f.code} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[12.5px] leading-[1.45]">
                  <span className="min-w-0">{flagText(f.code, f.evidence)}</span>
                  <span className="num text-[11.5px] text-[var(--c-danger-ink)]">+{f.points}</span>
                </li>
              ))}
              {r.moreFlags > 0 && <li className="text-[11.5px] text-muted-foreground">{tr("console.strip.risk.more_flags", { count: r.moreFlags })}</li>}
            </ul>
          )}
          {ex?.pivot ? (
            <p className="text-[12px] text-muted-foreground">{tr("console.queue.pivot", { flag: tr(`console.sflag.${ex.pivot.code}`), band: tr(`console.band.${ex.pivot.bandWithout}`) })}</p>
          ) : lower && ex && ex.marginToLower > 0 ? (
            <p className="text-[12px] text-muted-foreground">{tr("console.queue.margin", { band: tr(`console.band.${lower}`), points: ex.marginToLower })}</p>
          ) : null}
        </div>
      ) : (
        <StripEmpty text={tr("console.strip.risk.no_review")} />
      )}
      <dl className="mt-1 grid border-t border-[var(--c-hairline)] pt-1">
        <StripLine label={tr("console.strip.risk.linked")}>
          <span className="inline-flex items-center gap-1.5">
            {d.linked.accounts}
            {d.linked.banned > 0 && <StripChip tone="danger">{tr("console.strip.risk.banned", { count: d.linked.banned })}</StripChip>}
          </span>
        </StripLine>
        <StripLine label={tr("console.strip.risk.blocklist")}>{d.blocklist}</StripLine>
        <StripLine label={tr("console.strip.risk.restrictions")}>{d.restrictions}</StripLine>
        <StripLine label={tr("console.strip.risk.brand")}>
          {d.brand ? (
            <StripChip tone={d.brand.code === "brand_term_live" ? "danger" : "warn"} title={tr(`console.risk.field.${d.brand.field}`)}>
              {tr(`console.strip.risk.${d.brand.code}`, { term: d.brand.term, field: tr(`console.risk.field.${d.brand.field}`) })}
            </StripChip>
          ) : (
            <span className="text-[12.5px] text-muted-foreground">{d.brandChecked ? tr("console.strip.risk.brand_none") : tr("console.strip.risk.brand_unchecked")}</span>
          )}
        </StripLine>
        <StripLine label={tr("console.strip.risk.reports")}>
          {d.abuse.total === 0 ? (
            <span className="text-muted-foreground">0</span>
          ) : (
            <span className="text-[12.5px]" title={d.abuse.byReason.map((b) => `${tr(`console.strip.risk.report_reason.${b.reason}`)} ×${b.count}`).join(", ")}>
              {tr("console.strip.risk.reports_value", { total: d.abuse.total, day: d.abuse.last24h })}
            </span>
          )}
        </StripLine>
      </dl>
      {d.abuse.newest && (
        <p className="truncate text-[11.5px] text-muted-foreground">
          {tr("console.strip.risk.newest_report", { reason: tr(`console.strip.risk.report_reason.${d.abuse.newest.reason}`) })}
          {d.abuse.newest.pagePath && (
            <>
              {" "}
              <bdi dir="ltr" className="font-mono">
                {d.abuse.newest.pagePath}
              </bdi>
            </>
          )}
        </p>
      )}
    </StripFrame>
  );
}
