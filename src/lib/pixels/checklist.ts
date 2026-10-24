/**
 * Pixel checks of the pre-publish checklist (docs/OFFERS.md §A.4), spread by
 * src/lib/editor/checklist.ts. Pure and isomorphic.
 *
 *   pixelChecks(doc, ctx)   warnings: "No ad pixel on this page" (hidden with tracking.none) and
 *                           "{label}: server refused events (permission) since 13:40"
 *   pixelNotes(doc, ctx)    info lines: each browser-only Meta/TikTok pixel, "Pixels copied from
 *                           {page}" — shown by the publish block and the builder's pixels section
 *                           (the checklist has no info level)
 *
 * Pixels never block a publish here; the only refusal is the server's library rule for non-owners.
 */
import type { CheckItem } from "@/lib/editor/checklist";
import type { PageDoc } from "@/lib/page/schema";
import type { PixelHealth } from "@/lib/settings/schemas";
import { isServerPlatform } from "./ids";
import { clock, findEntryView, missingPixels, pixelKey, pixelLabel, trackingRefs, type PixelLibraryView } from "./library";

export type { PixelHealth, PixelLibraryView };

export interface PixelCheckContext {
  library: PixelLibraryView | null;
  health: PixelHealth;
  /** the page is published */
  live: boolean;
}

const CODE_TEXT: Record<string, string> = { token: "token", permission: "permission", pixel: "pixel", rate: "rate limit", network: "network", other: "error" };

export function pixelChecks(doc: PageDoc, ctx: PixelCheckContext): CheckItem[] {
  const out: CheckItem[] = [];
  const t = doc.tracking;
  if (missingPixels(t)) {
    out.push({
      id: "pixels:none",
      level: "warning",
      title: "No ad pixel on this page",
      detail: "Ads can't optimize without events. Pick this page's pixels, or choose “No pixel on this page” for organic or test pages.",
      fix: { tab: "seo" },
    });
  }
  for (const r of trackingRefs(t)) {
    const h = ctx.health[pixelKey(r.platform, r.id)];
    if (h?.state !== "refused") continue;
    const label = pixelLabel(findEntryView(ctx.library, r.platform, r.id), r.platform, r.id);
    out.push({
      id: `pixels:refused:${r.platform}:${r.id}`,
      level: "warning",
      title: `${label}: server refused events (${CODE_TEXT[h.code ?? "other"]}) since ${clock(h.at)}`,
      detail: "Check the token in Connect → Pixels, then send a test event.",
      // store-relative: the builder resolves it under /app/<handle>
      fix: { href: "/integrations/pixels" },
    });
  }
  return out;
}

export interface PixelNote {
  id: string;
  text: string;
}

export function pixelNotes(doc: PageDoc, ctx: Pick<PixelCheckContext, "library">): PixelNote[] {
  const out: PixelNote[] = [];
  const t = doc.tracking;
  if (t.copiedFrom) out.push({ id: "pixels:copied", text: `Pixels copied from ${t.copiedFrom}` });
  if (ctx.library) {
    for (const r of trackingRefs(t)) {
      if (!isServerPlatform(r.platform)) continue;
      const e = findEntryView(ctx.library, r.platform, r.id);
      if (e && !e.server) out.push({ id: `pixels:browser:${r.platform}:${r.id}`, text: `${pixelLabel(e)}: browser only — no server events, so in-app and iOS purchases are under-counted` });
    }
  }
  return out;
}
