import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { StorageChip, StorageNotice } from "@/components/admin/common/storage-notice";
import { MediaLibrary } from "@/components/admin/media/media-library";
import { mediaCounts } from "@/lib/admin-data/assets";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { getDbUsage } from "@/lib/db/usage";
import { assetToJson, listAssets } from "@/lib/media";
import { getSetting } from "@/lib/settings";
import { getAssetUsageAction, setAssetAltAction } from "./actions";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage() {
  const ctx = await legacyStoreCtx({ permission: "media.read" });
  const [first, counts, ai, storage] = await Promise.all([listAssets(ctx.scope, { page: 1, pageSize: 48 }), mediaCounts(ctx.scope), getSetting("ai"), getDbUsage()]);

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
        ai={{ enabled: ai.enabled, tier: ai.tier, bgRemoval: ai.bgRemoval }}
        setAlt={setAssetAltAction}
        usage={getAssetUsageAction}
      />
    </Screen>
  );
}
