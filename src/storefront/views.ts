/**
 * S1 STOREFRONT owns this file (src/storefront/** outside the four frozen contract files, STO-§27.2). Pre-registered by
 * the R2 contract step (C2-B1, maintainer) so the frozen `StoreRenderContext` (./types.ts) names its view payloads; S1
 * adds fields freely (no CCR): the frozen context only fixes WHERE a view is, not what it carries. The fields below are
 * the identity every view has (products / collections rows, core §D.6; STO-§3.2).
 */

/** The product a PDP renders (S1 widens: offers, gallery, stock, facts, SEO, ...). */
export interface ProductView {
  id: string;
  slug: string;
  name: string;
  /** products.public_key (the payload v3 `pk`) */
  publicKey: string;
  /** products.rev the page was priced with (the payload v3 `rev`) */
  rev: string;
}

/** The collection a collection page renders (S1 widens: description, image, cards, sort, page). */
export interface CollectionView {
  id: string;
  slug: string;
  name: string;
}

/** The search page's query and results (S1 widens). */
export interface SearchView {
  q: string;
}

/** The store chrome: announcement bar, header menu, footer (STO-§10; S1 defines the fields). */
export type ChromeData = Record<string, unknown>;
