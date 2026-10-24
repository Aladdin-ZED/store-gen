import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { GenerateWizard } from "@/components/generate/wizard";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { storeInfoOf } from "@/lib/admin-data/store-info";
import { Market } from "@/lib/page/schema";
import { getStoreSettings } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const metadata: Metadata = { title: "New page" };

type Params = Promise<{ store: string }>;

const WIZARD_LOCALES = new Set(["ar", "fr", "en"]);

/**
 * The generator: drop product photos → on-device reading → product facts → three art-directed
 * directions → a draft page in the builder. Everything heavy runs in the member's browser; the store's
 * AI choices, market and page defaults come from the store (GEN-01), never from the platform.
 */
export default async function GeneratePage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "pages.write" });
  const [{ store_ai: ai, defaults }, store] = await Promise.all([getStoreSettings(ctx.scope, ["store_ai", "defaults"]), storeInfoOf(ctx.scope, ctx.store)]);
  const storeAssets = await previewAssetsFor(ctx.scope, [], [store.logo]);
  // the first page locale the store offers, else its default locale (§D.10 `defaults.locales`)
  const preferred = defaults.locales[0] ?? ctx.store.defaultLocale;
  const locale = WIZARD_LOCALES.has(preferred) ? (preferred as "ar" | "fr" | "en") : "ar";
  const market = Market.safeParse(ctx.store.market);

  return (
    <Screen wide className="pb-24">
      <GenerateWizard
        ai={{ enabled: ai.localEnabled, tier: ai.localTierCeiling, bgRemoval: ai.bgRemoval }}
        defaults={{
          locale,
          market: market.success ? market.data : "MA",
          currency: ctx.store.currency,
          // an unset fee prefills as today's default (0): the member sets it in the offers step
          shippingFee: defaults.shippingFee ?? 0,
          deliveryText: defaults.deliveryText || null,
        }}
        store={store}
        storeAssets={storeAssets}
        canUpload={ctx.can("media.write")}
        canCreatePixels={ctx.can("pixels.manage")}
      />
    </Screen>
  );
}
