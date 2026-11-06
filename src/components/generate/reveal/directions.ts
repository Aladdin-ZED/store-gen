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
 * The body (P6 step 11): the DES-§14.2 pipeline of the wizard (`runDesignPipeline`, code-split through `kit.ts`):
 * the photos' facts (the caller's facts pass, merged), the direction draw and attempts seeded by the store's seed and
 * the input hash, one novelty batch (`checkNoveltyAction`), the keep rule, the headline check (`checkHeadlinesAction`),
 * the repairs, then each direction's GenomeCard (bands only, DS7). The progress line and the novelty state reach
 * `RevealFolds` through ./status.ts (its props are frozen). A product the generator refuses (no name or price) rejects
 * with its GeneratorError, and P2 shows `error` with Retry. The signature is frozen (src/lib/contracts/r1-p0b-design.ts).
 */
import type { CopyFacts } from "@/lib/landing/honesty/facts.server";
import { mergePhotoFacts, type PhotoFacts } from "@/lib/design/photo-facts";
import type { GenerateInput } from "@/lib/generator/directions";
import type { PipelineDeps, PipelineDirection } from "../pipeline";
import type { Locale, ProductCategory } from "@/lib/page/schema";
import type { RevealDirection, RevealDirections } from "./RevealFolds";
import { setRevealStatus } from "./status";

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

const asReveal = (d: PipelineDirection): RevealDirection => ({ id: d.archetype, doc: d.doc, card: d.card, label: d.label });

/**
 * The two server round trips (DES-§14.2 steps 4 and 7), loaded with the run: outside the app (a script, a story) the
 * actions cannot load and the run degrades to no words, as a failed call would.
 */
async function serverChecks(niche: string): Promise<Pick<PipelineDeps, "novelty" | "headlines">> {
  try {
    const [{ checkNoveltyAction }, { checkHeadlinesAction }] = await Promise.all([import("@/app/app/[store]/generate/actions"), import("@/lib/design/actions")]);
    return {
      novelty: async (candidates) => {
        const r = await checkNoveltyAction({ niche, candidates });
        return r.ok ? r.data : null;
      },
      headlines: async (texts) => {
        const r = await checkHeadlinesAction(niche, texts);
        return r.ok ? r.data : null;
      },
    };
  } catch {
    return {};
  }
}

/** The three reveal directions, in display order, each with its GenomeCard (see the header). */
export async function buildRevealDirections(input: RevealInput): Promise<RevealDirections> {
  setRevealStatus({ step: "photos", novelty: "checked" });
  const kit = await import("../kit");
  const niche = kit.nicheKey(input.market, input.category);
  const checks = await serverChecks(niche);
  const photoFacts = mergePhotoFacts(input.photos);
  const result = await kit.runDesignPipeline(
    { product: input.product, palette: input.palette, facts: input.facts, locale: input.locale, market: input.market, seedBase: input.seedBase, niche, ...(photoFacts ? { photoFacts } : {}) },
    { onStep: (step) => setRevealStatus({ step }), ...checks },
  );
  setRevealStatus({ step: null, novelty: result.novelty });
  const [a, b, c] = result.directions;
  if (!a || !b || !c) throw new Error("buildRevealDirections: the generator returned fewer than three directions");
  return [asReveal(a), asReveal(b), asReveal(c)];
}
