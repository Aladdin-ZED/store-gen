/**
 * `copy.hero` (AI-02; ai.md AI-§A.8.2 stage 2b, AI-§D.3): one hero pack for one direction in the store's primary
 * locale. Types only. Guarded with the hero lengths (headline ≤ 84, sub ≤ 190, cta ≤ 32, kicker ≤ 56 optional) and the
 * direction's headline structure.
 */
import type { CopyDirection, CopyLocale, Market, TaskProduct } from "./common";

export interface HeroPackInput {
  locale: CopyLocale;
  market: Market;
  product: TaskProduct;
  deliveryText: string | null;
  direction: CopyDirection;
}

export interface HeroPack {
  kicker?: string;
  headline: string;
  sub: string;
  cta: string;
}
