import "server-only";
/**
 * "Créer une page de vente" from a product (landing.md LAN-§17.2, storefront.md STO-§17.5; R2, S1 STOREFRONT owns
 * `src/lib/catalog/**`). The R2 contract step (C2-E) froze the signature for the maintainer's seam in P6's generate
 * page (src/app/app/[store]/generate/page.tsx, `?product=<id>`, R2 only): the wizard state to start from, which the
 * wizard applies once with its `reset` action. S1's body: the product's photos (uploaded assets, so no upload runs),
 * Details filled from the product's facts, the offers prefilled, the step at Directions, `theme_mode` campaign with
 * the brand locks; null for a product that is not the store's (or not active). Contract body until S1 merges: null
 * (the wizard opens empty, as today).
 */
import type { WizardState } from "@/components/generate/state";
import type { StoreScope } from "@/lib/tenancy/types";

/** The wizard state seeded from one of the store's products (S1; contract body: none). */
export async function wizardSeedFromProduct(scope: StoreScope, productId: string): Promise<WizardState | null> {
  void scope;
  void productId;
  return null;
}
