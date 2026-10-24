import type { Metadata } from "next";
import { PixelLibrary } from "@/components/admin/pixels/pixel-library";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { pixelLibraryView } from "@/lib/pixels/library.server";

export const metadata: Metadata = { title: "Pixels" };

/** Settings → Pixels: the store's pixel library (pages own their pixels; docs/OFFERS.md §A.4). */
export default async function PixelsSettingsPage() {
  const ctx = await legacyStoreCtx({ permission: "settings.read" });
  // tokens leave the server only as masks (••••3f9a), and only for members who manage integrations
  const view = await pixelLibraryView(ctx.scope, { canCreate: ctx.can("pixels.manage"), canSeeTokens: ctx.can("integrations.manage"), fresh: true });
  return <PixelLibrary initial={view} canPages={ctx.can("pages.write")} canPublish={ctx.can("pages.publish")} />;
}
