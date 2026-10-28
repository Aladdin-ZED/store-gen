/**
 * The onboarding reveal's three directions (P6 DESIGN; design.md DES-§14.3, DES-§8.9; docs/STORE-SAAS.md §K.2, §K.3;
 * P0b CCR P2-11): `buildRevealDirections(input)` turns what P2's welcome step knows about the product into the three
 * `RevealDirection`s `RevealFolds` shows, each with its genome card (`genomeCard(g, report, bands, slot)`, DES-§8.9),
 * which only P6 can compute. P2 calls this one function and never hand-builds a direction or a card.
 *
 * P0b stub: throws `not implemented: P6 buildRevealDirections`. No GenomeCard may be invented, so P2 treats the reveal
 * as unavailable (its fallback path) until P6 merges; the reveal acceptance runs at the integration. The signature is
 * frozen (src/lib/contracts/r1-p0b-design.ts); P6 replaces the body.
 */
import type { CopyFacts } from "@/lib/landing/honesty/facts.server";
import type { PhotoFacts } from "@/lib/design/photo-facts";
import type { GenerateInput } from "@/lib/generator/directions";
import type { Locale, ProductCategory } from "@/lib/page/schema";
import type { RevealDirection } from "./RevealFolds";

/** What the welcome step hands the reveal: the generator's product and palette inputs, the facts, the photos' facts. */
export interface RevealInput {
  /** the product as typed in onboarding (generateDirections' `product`, validated with the Product schema) */
  product: GenerateInput["product"];
  /** palette extracted from the main product photo (generateDirections' `palette`) */
  palette: GenerateInput["palette"];
  /** the merchant facts the owner typed */
  facts: CopyFacts;
  /** the product's category (the Product schema's, which generateDirections reads from `product`) */
  category: ProductCategory;
  locale: Locale;
  photos: readonly PhotoFacts[];
}

/** The three reveal directions, in display order. P0b stub: throws (see the header). */
export function buildRevealDirections(input: RevealInput): readonly [RevealDirection, RevealDirection, RevealDirection] {
  void input;
  throw new Error("not implemented: P6 buildRevealDirections");
}
