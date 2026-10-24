import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { PixelLibrary } from "@/components/admin/pixels/pixel-library";
import { pixelLibraryView } from "@/lib/pixels/library.server";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const metadata: Metadata = { title: "Pixels" };

type Params = Promise<{ store: string }>;

/** Connect → Pixels: the store's pixel library (pages own their pixels; docs/OFFERS.md §A.4). */
export default async function PixelsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  // tokens leave the server only as masks (••••3f9a), and only for members who manage integrations
  const view = await pixelLibraryView(ctx.scope, { canCreate: ctx.can("pixels.manage"), canSeeTokens: ctx.can("integrations.manage"), fresh: true });
  return (
    <Screen>
      <PageHeader title="Pixels" description="Every ad pixel of this store in one library. Each page picks its own; tokens stay on the server." />
      <PixelLibrary initial={view} canPages={ctx.can("pages.write")} canPublish={ctx.can("pages.publish")} />
    </Screen>
  );
}
