/**
 * The welcome reveal's one swap point (P2 SHELL; platform.md PLA-§22.2 `reveal` row; P0b CCR P2-11, review F-8): what
 * the owner typed and the photos' facts become P6's `RevealInput`, and P6's `buildRevealDirections` turns it into the
 * three directions `RevealFolds` shows. P2 never builds a direction or a card itself; at the R1 integration P6's real
 * body replaces the stub behind this call and nothing here changes.
 *
 * Honesty (PD23): the product carries the typed price and, only when typed and higher, the price before; no rating, no
 * stock, no review is ever put on it. No model runs here (core D59): the generator is pure browser code.
 */
import { buildRevealDirections, type RevealInput } from "@/components/generate/reveal/directions";
import type { RevealDirections } from "@/components/generate/reveal/RevealFolds";
import type { PhotoFacts } from "@/lib/design/photo-facts";
import type { Locale, ProductCategory } from "@/lib/page/schema";
import type { ExtractedPalette } from "@/lib/theme";
import { keptCompareAt } from "./flow-logic";

/** The saved draft the reveal reads (the `onboarding` setting's `draft`, PLA-§2.4). */
export interface RevealDraft {
  category: ProductCategory;
  productName: string;
  priceMinor: number;
  compareAtMinor: number | null;
  fact: string | null;
  assetIds: readonly string[];
}

export interface RevealContext {
  /** the main photo's palette, read in the browser (null without photos or when the browser could not read it) */
  palette: ExtractedPalette | null;
  photos: readonly PhotoFacts[];
  locale: Locale;
  market: RevealInput["market"];
  seedBase: number;
}

/** The generator's product: the typed name, category, price (major units, 2 decimals) and the store's own photos. */
export function revealInputOf(draft: RevealDraft, c: RevealContext): RevealInput {
  const compareAt = keptCompareAt(draft.priceMinor, draft.compareAtMinor);
  return {
    product: {
      name: draft.productName,
      category: draft.category,
      price: draft.priceMinor / 100,
      ...(compareAt !== null ? { compareAt: compareAt / 100 } : {}),
      images: draft.assetIds.map((id) => ({ id, alt: "" })),
    },
    palette: c.palette,
    facts: draft.fact ? [draft.fact] : [],
    category: draft.category,
    locale: c.locale,
    photos: c.photos,
    market: c.market,
    seedBase: c.seedBase,
  };
}

/** The three directions of one round (P6's call; rejects when the generator refuses the product). */
export function loadRevealDirections(draft: RevealDraft, c: RevealContext): Promise<RevealDirections> {
  return buildRevealDirections(revealInputOf(draft, c));
}
