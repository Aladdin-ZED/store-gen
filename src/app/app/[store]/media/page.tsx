import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { StorageChip, StorageNotice } from "@/components/admin/common/storage-notice";
import { MediaLibrary } from "@/components/admin/media/media-library";
import { mediaCounts, storeStorage } from "@/lib/admin-data/assets";
import { assetToJson, listAssets } from "@/lib/media";
import { getStoreSetting } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { getAssetUsageAction, setAssetAltAction } from "./actions";

export const metadata: Metadata = { title: "Media" };

type Params = Promise<{ store: string }>;

export default async function MediaPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "media.read" });
  const [first, counts, ai, storage] = await Promise.all([
    listAssets(ctx.scope, { page: 1, pageSize: 48 }),
    mediaCounts(ctx.scope),
    getStoreSetting(ctx.scope, "store_ai"),
    storeStorage(ctx.scope).catch(() => null),
  ]);

  return (
    <Screen wide>
      <PageHeader
        title="Media"
        description="Product photos, cutouts and clips for your pages. Uploads are re-encoded (metadata stripped) and served in modern formats at every size."
        actions={storage ? <StorageChip usage={storage} /> : undefined}
      >
        {storage && storage.level !== "ok" ? <StorageNotice usage={storage} /> : undefined}
      </PageHeader>
      <MediaLibrary
        initial={{ items: first.items.map(assetToJson), total: first.total }}
        counts={counts}
        canWrite={ctx.can("media.write")}
        ai={{ enabled: ai.localEnabled, tier: ai.localTierCeiling, bgRemoval: ai.bgRemoval }}
        setAlt={setAssetAltAction}
        usage={getAssetUsageAction}
      />
    </Screen>
  );
}
