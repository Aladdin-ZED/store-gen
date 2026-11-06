/**
 * Overview strip 3, Pages (platform.md PLA-§7.3 row 3, §7.5; PD16): published and draft counts, the last publish, the
 * live URL, the newest page with its Design check chips (Q, slop, a look in use; absent checks show nothing, never a
 * number), and Preview (a 10-minute staff link in a sandboxed sheet). End: the Catalog & pages tab arrives with R2.
 */
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { Ago } from "../../ago";
import { StripFrame, StripLine } from "./frame";
import { PagePreviewButton } from "./preview";
import { StripChip, StripEmpty, StripNotOk, tr } from "./shared";

export async function PagesStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.pages");
  const p = await loadStrip(ctx, storeId, "pages");
  if (p.state !== "ok") return <StripNotOk strip="pages" title={title} p={p} end="r2" />;
  const d = p.data;
  const summary = tr("console.strip.pages.summary", { published: d.published, drafts: d.drafts });
  if (!d.newest) {
    return (
      <StripFrame strip="pages" title={title} at={p.at} end="r2" summary={summary}>
        <StripEmpty text={tr("console.strip.pages.none")} />
      </StripFrame>
    );
  }
  const n = d.newest;
  return (
    <StripFrame strip="pages" title={title} at={p.at} end="r2" summary={summary}>
      <dl className="grid">
        <StripLine label={tr("console.strip.pages.published")}>{d.published}</StripLine>
        <StripLine label={tr("console.strip.pages.drafts")}>{d.drafts}</StripLine>
        <StripLine label={tr("console.strip.pages.last_publish")}>{d.lastPublishAt ? <Ago iso={d.lastPublishAt} /> : <span className="text-muted-foreground">{tr("console.strip.pages.never")}</span>}</StripLine>
        <StripLine label={tr("console.strip.pages.live_url")}>
          {d.liveUrl ? (
            <a href={d.liveUrl} target="_blank" rel="noopener noreferrer" className="block truncate font-mono text-[12px] text-[var(--c-brand-ink)] hover:underline">
              <bdi dir="ltr">{d.liveUrl.replace(/^https?:\/\//, "")}</bdi>
            </a>
          ) : (
            <span className="text-muted-foreground">{tr("console.strip.identity.not_live")}</span>
          )}
        </StripLine>
      </dl>
      <div className="mt-2 grid gap-2 rounded-[var(--r-control)] bg-[color-mix(in_oklch,var(--muted)_55%,transparent)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={n.name}>
            {n.name}
          </span>
          <StripChip tone={n.status === "published" ? "success" : "neutral"}>{tr(`console.strip.pages.status.${n.status === "published" ? "published" : "draft"}`)}</StripChip>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {n.design ? (
            <>
              {n.design.q !== null && <StripChip tone="brand">{tr("console.strip.pages.q", { q: n.design.q })}</StripChip>}
              {n.design.slop !== null && <StripChip tone={n.design.slop > 0 ? "warn" : "neutral"}>{tr("console.strip.pages.slop", { count: n.design.slop })}</StripChip>}
              {n.design.hasLook && <StripChip>{tr("console.strip.pages.look")}</StripChip>}
            </>
          ) : (
            <span className="text-[12px] text-muted-foreground">{tr("console.strip.pages.no_design")}</span>
          )}
          <span className="flex-1" />
          <PagePreviewButton storeId={storeId} pageId={n.id} name={n.name} />
        </div>
      </div>
    </StripFrame>
  );
}
