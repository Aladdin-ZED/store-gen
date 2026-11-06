import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { BrandPage } from "@/components/admin/brand/brand-page";
import { pairingCards } from "@/components/admin/brand/pairing-cards";
import { brandKitView } from "@/lib/design/brand-kit.server";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const metadata: Metadata = { title: "Brand" };

type Params = Promise<{ store: string }>;

/**
 * `/app/<h>/brand` (P6 DESIGN; design.md DES-§12.1, BK-1; core §I.1): the brand kit. Reading needs `pages.read`;
 * every write is a `brand.write` action (./actions.ts), so a viewer sees the kit read-only. Logo uploads also need
 * `media.write` (the core media endpoint).
 */
export default async function BrandRoute({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "pages.read" });
  const view = await brandKitView(ctx.scope, ctx.store.currency);
  return (
    <Screen wide>
      <BrandPage
        view={view}
        storeName={ctx.store.name}
        canEdit={ctx.can("brand.write")}
        canUpload={ctx.can("brand.write") && ctx.can("media.write")}
        pairings={pairingCards()}
        wordsHref={ctx.can("settings.read") ? appHref(ctx.store.handle, "/settings/ai") : null}
      />
    </Screen>
  );
}
