/**
 * The one adapter from a document and its context to the design gates' input (P6 DESIGN; design.md DES-§8.1,
 * DES-§8.13, DS52, CRIT18): `gateInputFor(doc, ctx)` with the signature core §M.1 and STO-D35 / STO-§8 cite verbatim,
 * and the `KIND_GATES` table of which design gates run per page kind (./gates/kinds.ts). Pure and isomorphic: the
 * context is data (no scope, no DB handle), so the wizard and the builder build it in the browser and the server
 * builds it with `gateCtxFrom(ctx)` (src/lib/render/prepublish/design.ts).
 *
 *  - a `PageDoc` (the landing path, complete): the genome is the document's reading (`genomeOf`: the look when the page
 *    has one, the archetype defaults otherwise), the register is the kind's (landing → marketing);
 *  - a `StorePageDoc` (R2, STO-§6.2): the theme and the look are the store theme's for the kind's register, resolved
 *    by the caller and passed in `ctx.theme` / `ctx.look`; the sections resolve through the store registry's features
 *    (`ctx.storeFeatures`), the store's market comes in `ctx.market`; there is no product, offer or form, so the
 *    landing-only gates skip (KIND_GATES). The store template type is storefront's frozen `StorePageDoc` (R2 contract
 *    step C2-B1, src/storefront/schema.ts).
 */
import type { Locale, Market, PageDoc, ThemeLook } from "@/lib/page/schema";
import type { BuiltTheme } from "@/lib/theme/types";
import { genomeOf } from "./derive";
import type { FactsArg } from "./cliche";
import { KIND_GATES, registerOfKind } from "./gates/kinds";
import type { AssetMeta, GateInput, OriginClass, StorePageDoc, StorePageKind } from "./gates/types";
import { isPageDoc } from "./gates/view";
import type { NoveltyVerdict } from "./novelty.server";
import type { VariantFeaturesResolved } from "./types.frozen";

export { KIND_GATES, registerOfKind, type KindGates } from "./gates/kinds";
export type { AssetMeta, OriginClass, StorePageDoc, StorePageKind } from "./gates/types";

/** rev 4 (CRIT18): the adapter's context, the single source the core (§M.1) and storefront (STO-D35, STO-§8) cite. */
export interface GateInputCtx {
  /** the page kind (`pages.kind`): its KIND_GATES row and with it `GateInput.register` */
  kind: "landing" | StorePageKind;
  /** PageDoc: buildTheme(doc.theme); StorePageDoc: the store theme for the kind's register (getStoreTheme, resolved by the caller) */
  theme: BuiltTheme;
  /** PageDoc: doc.theme.look; StorePageDoc: the store theme's brand look + the kind's page constants */
  look: ThemeLook | null;
  assets: ReadonlyMap<string, AssetMeta>;
  locale: Locale;
  context: GateInput["context"];
  origin: ReadonlyMap<string, OriginClass>;
  /** the core's CopyFacts (the facts as typed) or the richer DesignCopyFacts */
  facts: FactsArg;
  ownerProof: boolean;
  /** StorePageDoc: the store's market (the document carries none; R2 contract step C2-B1); "INTL" when absent */
  market?: Market;
  /** StorePageDoc: the store registry's features (STO-§6.1) */
  storeFeatures?: (type: string, variant: string, data: unknown) => VariantFeaturesResolved;
  novelty?: NoveltyVerdict | null;
}

/** rev 3 (DS52): one adapter for both document types (DES-§8.13); pure, isomorphic. */
export function gateInputFor(doc: PageDoc | StorePageDoc, ctx: GateInputCtx): GateInput {
  const kind = ctx.kind;
  void KIND_GATES[kind];
  const genome = isPageDoc(doc) ? genomeOf(doc) : genomeOf(doc, { look: ctx.look, market: ctx.market ?? "INTL" });
  return {
    doc,
    kind,
    theme: ctx.theme,
    genome,
    assets: ctx.assets,
    locale: ctx.locale,
    register: registerOfKind(kind),
    context: ctx.context,
    origin: ctx.origin,
    ownerProof: ctx.ownerProof,
    facts: ctx.facts,
    ...(ctx.novelty !== undefined ? { novelty: ctx.novelty } : {}),
    ...(ctx.storeFeatures ? { features: ctx.storeFeatures } : {}),
  };
}
