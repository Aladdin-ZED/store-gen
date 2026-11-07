/**
 * Home grammar (storefront.md STO-§11.1, ST-09 / ST-19; pure). Track S1 STOREFRONT owns this file in R2 and adds the
 * storylines' slot lists, `expandHome`, `checkHomeDoc`, `defaultStoryline` and `homeSeed`. The contract step (C2-C)
 * froze the storyline ids alone because `StoreBlueprint.storyline` (src/lib/catalog/blueprint.ts) is a closed
 * vocabulary S7 AI DATA's `store.blueprint` task validates against (AI-§D.3) before S1 merges. A storyline is a slot
 * list, never a look (rev 1 called them "archetypes").
 */

/** R2 storylines first; the last four are R3 (D3). */
export const HOME_STORYLINES = ["hero-product", "category-bento", "editorial", "catalogue-dense", /* R3 */ "drop", "routine", "gift-guide", "local-maker"] as const;
export type HomeStorylineId = (typeof HOME_STORYLINES)[number];

/** The storylines a blueprint may choose in R2 (STO-§11.2: the R3 four are not offered before D3 ships them). */
export const HOME_STORYLINES_R2 = ["hero-product", "category-bento", "editorial", "catalogue-dense"] as const satisfies readonly HomeStorylineId[];
