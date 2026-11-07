/**
 * Store SEO rules shared by the server and the tests (storefront.md STO-§20; S1 STOREFRONT owns this file in R2). The
 * R2 contract step (C2-E) froze `storeRobotsDisallow` for the maintainer's robots.txt seam in
 * `src/lib/render/store-routes.server.ts` (R2, `store` and `both` modes): S1's body returns the STO-§20.5 lines
 * `Disallow: <base>/cart`, `/checkout`, `/search`, `/track`, `/reviews/` for the store's base path (`/s/<h>` in P mode,
 * empty in S / C, core D48). Pure. Contract body until S1 merges: no line.
 */

/** The robots.txt `Disallow:` lines of a store's private paths (S1; contract body: none). */
export function storeRobotsDisallow(base: string): string[] {
  void base;
  return [];
}
