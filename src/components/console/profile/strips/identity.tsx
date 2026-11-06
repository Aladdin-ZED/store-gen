/**
 * Overview strip 1, Identity & address (platform.md PLA-§7.3 row 1): the mode, the address mode (P / S / C), the
 * canonical URL with Copy and Open (live stores only), the handle history count, the `address` re-renders (pending /
 * failed; "unavailable" while P8's summary is a stub), and the store id with Copy. The brand seed is never shown.
 * End: the Domains tab arrives with R2.
 */
import { ArrowUpRightIcon } from "lucide-react";
import { CopyButton } from "@/components/admin/common/copy-button";
import { ModeBadge } from "@/components/admin/common/mode-badge";
import { loadStrip } from "@/lib/platform/profile/overview-strips";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { StripFrame, StripLine } from "./frame";
import { StripChip, StripNotOk, tr } from "./shared";

export async function IdentityStrip({ ctx, storeId }: { ctx: PlatformCtx; storeId: string }) {
  const title = tr("console.strip.identity");
  const p = await loadStrip(ctx, storeId, "identity");
  if (p.state !== "ok") return <StripNotOk strip="identity" title={title} p={p} end="r2" />;
  const d = p.data;
  return (
    <StripFrame strip="identity" title={title} at={p.at} end="r2" summary={tr(`console.strip.identity.address.${d.addressMode}`)}>
      <dl className="grid">
        <StripLine label={tr("console.strip.identity.mode")}>
          <ModeBadge mode={d.mode} />
        </StripLine>
        <StripLine label={tr("console.strip.identity.address")}>{tr(`console.strip.identity.address.${d.addressMode}`)}</StripLine>
        <StripLine label={tr("console.strip.identity.url")}>
          {d.canonicalUrl ? (
            <span className="inline-flex max-w-full items-center gap-0.5">
              <bdi dir="ltr" className="truncate font-mono text-[12px]" title={d.canonicalUrl}>
                {d.canonicalUrl.replace(/^https?:\/\//, "")}
              </bdi>
              <CopyButton value={d.canonicalUrl} label={tr("console.strip.identity.copy_url")} toastMessage={tr("console.profile.copied")} size="icon-xs" />
              <a href={d.canonicalUrl} target="_blank" rel="noopener noreferrer" aria-label={tr("console.strip.identity.open_url")} className="inline-grid size-6 place-items-center rounded-[var(--r-control)] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                <ArrowUpRightIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
              </a>
            </span>
          ) : (
            <span className="text-muted-foreground">{tr("console.strip.identity.not_live")}</span>
          )}
        </StripLine>
        <StripLine label={tr("console.strip.identity.renames")}>{d.handleHistory === 0 ? <span className="text-muted-foreground">{tr("console.strip.identity.never_renamed")}</span> : tr("console.strip.identity.renamed", { count: d.handleHistory })}</StripLine>
        <StripLine label={tr("console.strip.identity.renders")}>
          {d.addressRenders === null ? (
            <span className="text-muted-foreground">{tr("console.strip.na")}</span>
          ) : d.addressRenders.failed > 0 ? (
            <StripChip tone="danger">{tr("console.strip.identity.renders_failed", { count: d.addressRenders.failed })}</StripChip>
          ) : d.addressRenders.pending > 0 ? (
            <StripChip tone="warn">{tr("console.strip.identity.renders_pending", { count: d.addressRenders.pending })}</StripChip>
          ) : (
            <span className="text-muted-foreground">{tr("console.strip.identity.renders_none")}</span>
          )}
        </StripLine>
        <StripLine label={tr("console.strip.identity.store_id")}>
          <span className="inline-flex items-center gap-0.5">
            <bdi dir="ltr" className="font-mono text-[11.5px]">
              {d.storeId}
            </bdi>
            <CopyButton value={d.storeId} label={tr("console.profile.copy_id")} toastMessage={tr("console.profile.copied")} size="icon-xs" />
          </span>
        </StripLine>
      </dl>
    </StripFrame>
  );
}
