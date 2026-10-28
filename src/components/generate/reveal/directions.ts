/**
 * The onboarding reveal's three directions (P6 DESIGN; design.md DES-§14.3, DES-§8.9; docs/STORE-SAAS.md §K.2, §K.3;
 * P0b CCR P2-11): `buildRevealDirections(input)` turns what P2's welcome step knows about the product into the three
 * `RevealDirection`s `RevealFolds` shows, each with its genome card (`genomeCard(g, report, bands, slot)`, DES-§8.9),
 * which only P6 can compute. P2 calls this one function and never hand-builds a direction or a card.
 *
 * Async (P0b review F-8): DES-§14.2's path has server round trips (the novelty bands, the headline check), so P2 mounts
 * `RevealFolds` in `analysing` with `directions: null`, then `revealed` with the result, or `error` with null and
 * Retry when it rejects.
 *
 * P0b stub, the degraded contract (P0b review F-8, DES-§14.3): today's generator (`generateDirections`, code-split
 * like the wizard's) builds the three documents and every `card` is null, since no GenomeCard may be invented; so at
 * P2's merge the step runs its whole flow ("Use this design", routing, `reportRevealAction`) against real docs. A
 * product the generator refuses (no name or price) rejects with its GeneratorError. The signature is frozen
 * (src/lib/contracts/r1-p0b-design.ts); P6 replaces the body.
 */
import type { CopyFacts } from "@/lib/landing/honesty/facts.server";
import type { PhotoFacts } from "@/lib/design/photo-facts";
import type { Direction, GenerateInput } from "@/lib/generator/directions";
import type { Locale, ProductCategory } from "@/lib/page/schema";
import type { RevealDirection, RevealDirections } from "./RevealFolds";

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
  /** the store's market (generateDirections' `market`; P0b review F-8) */
  market: GenerateInput["market"];
  /** the run's seed (the store's `brandSeed`, DES-§14.2; generateDirections' `seedBase`; P0b review F-8) */
  seedBase: number;
}

const asReveal = (d: Direction): RevealDirection => ({ id: d.archetype, doc: d.doc, card: null, label: d.label });

/** The three reveal directions, in display order. P0b stub: today's generator, no card (see the header). */
export async function buildRevealDirections(input: RevealInput): Promise<RevealDirections> {
  const { generateDirections } = await import("../kit");
  const [a, b, c] = generateDirections({ product: input.product, palette: input.palette, facts: input.facts, locale: input.locale, market: input.market, seedBase: input.seedBase });
  if (!a || !b || !c) throw new Error("buildRevealDirections: the generator returned fewer than three directions");
  return [asReveal(a), asReveal(b), asReveal(c)];
}
