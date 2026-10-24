import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { GenerateWizard } from "@/components/generate/wizard";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { storeInfo } from "@/lib/render/publish.server";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "New page" };

const WIZARD_LOCALES = new Set(["ar", "fr", "en"]);

/**
 * The generator: drop product photos → on-device reading → product facts → three art-directed
 * directions → a draft page in the builder. Everything heavy runs in the admin's browser.
 */
export default async function GeneratePage() {
  const ctx = await legacyStoreCtx({ permission: "pages.write" });
  const [ai, defaults, store] = await Promise.all([getSetting("ai"), getSetting("defaults"), storeInfo()]);
  const storeAssets = await previewAssetsFor(ctx.scope, [], [store.logo]);
  const locale = WIZARD_LOCALES.has(defaults.locale) ? (defaults.locale as "ar" | "fr" | "en") : "ar";

  return (
    <Screen wide className="pb-24">
      <GenerateWizard
        ai={{ enabled: ai.enabled, tier: ai.tier, bgRemoval: ai.bgRemoval }}
        defaults={{
          locale,
          market: defaults.market,
          currency: defaults.currency,
          shippingFee: defaults.shippingFee,
          deliveryText: defaults.deliveryText || null,
        }}
        store={store}
        storeAssets={storeAssets}
        canUpload={ctx.can("media.write")}
      />
    </Screen>
  );
}
