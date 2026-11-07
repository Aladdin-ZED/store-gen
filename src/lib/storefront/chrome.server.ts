import "server-only";
/**
 * The store chrome around documents the storefront does not render itself (storefront.md STO-§10, STO-R18 / R36; core
 * §K.4: "`track/**` (landing's) gets the store chrome through one import of `wrapInStoreChrome(scope, html, kind)`").
 * Track S1 owns this file in R2 and writes the body: in `store` / `both` mode the store header and footer around the
 * document's body, styles and scripts the document's CSP hashes (the caller hashes the wrapped HTML); in `landing` mode
 * the HTML as given.
 *
 * The R2 contract step (C2-B2) wrote this passthrough and its one import, in src/app/s/[store]/track/route.ts, passed
 * to the track document only while `releaseOn("R2")` (R1 documents keep their bytes).
 */
import type { StoreScope } from "@/lib/tenancy/types";
import type { StoreDocKind } from "@/storefront/types";

/** The documents the chrome wraps from outside the storefront: the order tracking page (landing's). */
export type ChromeDocKind = Extract<StoreDocKind, "track">;

/** The document with the store's chrome (S1, R2). Contract stub: the document as given. */
export async function wrapInStoreChrome(scope: StoreScope, html: string, kind: ChromeDocKind): Promise<string> {
  void scope;
  void kind;
  return html;
}
