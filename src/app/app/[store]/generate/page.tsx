import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { GenerateWizard } from "@/components/generate/wizard";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { aiPolicyFor } from "@/lib/ai/router/server";
import { releaseOn } from "@/lib/auth/permissions";
import { wizardSeedFromProduct } from "@/lib/catalog/wizard-seed.server";
import { designFlag } from "@/lib/design/flags.server";
import { brandView } from "@/lib/settings/keys/brand";
import { storeInfoOf } from "@/lib/admin-data/store-info";
import { Market } from "@/lib/page/schema";
import { getStoreSettings } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const metadata: Metadata = { title: "New page" };

type Params = Promise<{ store: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const WIZARD_LOCALES = new Set(["ar", "fr", "en"]);

/**
 * The generator: drop product photos → on-device reading → product facts → three art-directed
 * directions → a draft page in the builder. Everything heavy runs in the member's browser; the store's
 * AI choices, market and page defaults come from the store (GEN-01), never from the platform. `pages.write` +
 * `ai.use` (§I.1). The design engine's store inputs (design.md DES-§14.2, DES-§14.6): the brand seed (DS5), the brand
 * kit with the store's voice (`brandView`), the AI policy and P7's `ai_director_brief` flag (GH-1).
 */
export default async function GeneratePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: ["pages.write", "ai.use"] });
  // R2 (LAN-§17.2, STO-§17.5; contract step C2-E): `?product=<id>` starts from the product (S1's seed); R1 ignores it
  const asked = releaseOn("R2") ? (await searchParams).product : undefined;
  const productId = typeof asked === "string" && ROW_ID.test(asked) ? asked : null;
  const productSeed = productId ? await wizardSeedFromProduct(ctx.scope, productId) : null;
  const [{ store_ai: ai, defaults, brand }, store, aiPolicy, director] = await Promise.all([
    getStoreSettings(ctx.scope, ["store_ai", "defaults", "brand"]),
    storeInfoOf(ctx.scope, ctx.store),
    aiPolicyFor(ctx),
    designFlag("ai_director_brief", ctx.scope),
  ]);
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
        design={{ brandSeed: ctx.store.brandSeed, brand: brandView(brand, ai), director: director === true, aiPolicy, handle: ctx.store.handle }}
        {...(productId && productSeed ? { fromProduct: { id: productId, seed: productSeed } } : {})}
      />
    </Screen>
  );
}
