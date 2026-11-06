/**
 * The CTA plan (P6 DESIGN; design.md DES-§5.9, G34, H31; R1, R7). Pure, isomorphic.
 *
 * The page's primary CTAs are the hero's, the order form's submit, the final `cta` block's and the sticky bar (one).
 * `offer:showcase` has none (the picker lives in the form, R2). `benefits`, `reviews`, `story`, `guarantee` and `faq`
 * render no button in a new document: their `cta` data toggle is written `false` (an old document keeps its own).
 * Any other section with a default button keeps it while the page stays within 6 primary CTAs; past that, the lowest
 * ones are switched off. The WhatsApp float exists only with the store's number and collapses into the bar on phones
 * (`floatCollapses`); the header's buy button hides while an in-flow CTA is on screen (`headerHidesInHero`). The
 * markup half of the plan (`data-hero-cta` on the hero, the form submit and the final CTA) is the renderers'.
 */
import { variantFeatures } from "./features";
import type { CtaPlan } from "./genome";

export interface CtaBlock {
  id: string;
  type: string;
  variant: string;
}

/** Sections that never carry a button in a planned page (DES-§5.9). */
export const NO_BUTTON_TYPES: ReadonlySet<string> = new Set(["benefits", "reviews", "story", "guarantee", "faq"]);
/** The primary CTA ceiling, the sticky bar included (H31, budget R1 soft). */
export const MAX_PRIMARY = 6;

export interface CtaPlanResult {
  plan: CtaPlan;
  /** section ids whose `cta` toggle the generator writes `false` */
  off: string[];
}

/** The CTA plan of an in-flow sequence (`blocks`, hero first). */
export function planCtas(blocks: readonly CtaBlock[], has: { sticky: boolean; whatsapp: boolean }): CtaPlanResult {
  const primary: string[] = [];
  const off: string[] = [];
  const hero = blocks.find((b) => b.type === "hero");
  const form = blocks.find((b) => b.type === "orderForm");
  const ctaAt = blocks.map((b) => b.type).lastIndexOf("cta");
  const final = ctaAt >= 0 ? blocks[ctaAt] : undefined;
  if (hero) primary.push(hero.id);
  if (form) primary.push(form.id);
  if (final) primary.push(final.id);
  // one intent, one label (rubric §4.5): every other default button is switched off; the ceiling holds by construction
  for (const b of blocks) {
    if (b === hero || b === form || b === final) continue;
    if (NO_BUTTON_TYPES.has(b.type) || variantFeatures(b.type, b.variant, null).ctas > 0) off.push(b.id);
  }
  if (has.sticky) primary.push("sticky");
  if (primary.length > MAX_PRIMARY) throw new Error(`CTA plan: ${primary.length} primary CTAs`);
  return { plan: { primary, headerHidesInHero: true, floatCollapses: has.whatsapp }, off };
}
