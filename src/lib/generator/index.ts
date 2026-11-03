/**
 * Generator public API — pure & isomorphic (server, browser, worker).
 *
 *   generateDirections(input)        product + photos (+ AI analysis/copy) → 3 art-directed PageDocs
 *   generateDirections(input)        (design engine: genome → compile → choreography + rhythm planners → doc, DES-§14.2)
 *   remixDoc(doc, { seed, scope })   new take on a page: "design" | "layout" | "copy" | "all" | "more" | "bolder" |
 *                                    "calmer" | "upgrade" (design.md DES-§14.7)
 *   suggestBundles(price, currency…) ×1 / ×2 / ×3 packs with charming prices
 *   rankDirections(input)            archetypes for the product, mood-aware ("other styles" too)
 *   readMood / copyCategory          the product's mood (calm / lively / neutral) and its copy family
 *
 * Every generated theme is free of orange (owner rule: OKLCH hue 25°–75° above 0.06 chroma, see
 * theme.ts); a calm product (modest wear, soft materials, pale photos) only gets quiet directions.
 *
 * Art direction rules: docs/DESIGN.md §3–§4 (archetypes, page rhythm); copy: src/lib/ai/copy-library.
 */
export {
  generateDirections,
  buildDirection,
  buildDirectionWithGenome,
  pickArchetypes,
  rankDirections,
  inputHashOf,
  photoFactsOf,
  factsToDescription,
  factsFromDescription,
  GeneratorError,
  type BuiltDirection,
  type Direction,
  type DirectionDesign,
  type DirectionMatch,
  type GenerateInput,
  type RankedDirection,
} from "./directions";
export { copyCategory, readMood, productKeywords, type MoodReading, type ProductMood } from "./mood";
export { remixDoc, boldnessStep, type RemixOptions, type RemixScope } from "./remix";
export { suggestBundles, type BundleText } from "./bundles";
export { type PhotoInfo } from "./garment";
export { planSections, planDesign, type DesignInputs, type DesignPlan, type PlannedSection, type PlanContext } from "./plan";
