"use client";
/** The page's thumbnail on the share page `/kit/<token>` (P3 LANDING, wave 2; LAN-§13.5): two sections, decorative frame. */
import { LandingThumbnail, type PreviewAssets } from "@/components/preview";
import type { StoreInfo } from "@/landing/context";
import type { PageDoc } from "@/lib/page/schema";

export function SharedThumbnail({ doc, assets, store, label }: { doc: PageDoc; assets: PreviewAssets; store: StoreInfo; label: string }) {
  return (
    <div className="w-20 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/70">
      <LandingThumbnail doc={doc} assets={assets} store={store} device="mobile" sections={2} aspectRatio="4 / 5" label={label} />
    </div>
  );
}
