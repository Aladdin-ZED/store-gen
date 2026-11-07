import "server-only";
/**
 * The store page render pipeline (storefront.md STO-§7.3). Track S1 STOREFRONT owns this file in R2 and writes the
 * pipeline (template → data for the kind → `StoreRenderContext` → sections → document, CSP, etag). The contract step
 * (C2-C) froze `renderStorePage` and its route type for the two tracks that render store pages in preview before S1
 * merges:
 *   - S2 BRAND & LOGO: the theme preview (`/app/<h>/preview/theme/<version>`) renders the home and one PDP with
 *     `{ mode: "preview" }`; the theme MUST be read through `getStoreTheme` (S2's preview seam applies there) and a
 *     preview never writes the render cache;
 *   - S6 PLATFORM UX: the store-mode onboarding reveal renders its three folds in preview mode.
 * Until S1 merges the stub throws `NotBuiltYet("S1", "renderStorePage")`; the callers show their placeholder for a
 * store kind (`isNotBuiltYet`). No R1 path calls it: store pages are served only with `releaseOn("R2")`.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { ProductRow } from "@/lib/db/schema";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import type { StorePageDoc, StorePageKind } from "@/storefront/schema";
import type { SortKey } from "@/storefront/types";

/** A store page request (STO-§7.2; `serveStorePage` in src/lib/storefront/serve.server.ts builds it). */
export interface StoreRoute {
  kind: StorePageKind | "thanks" | "policy" | "track";
  slug?: string;
  query: { page?: number; sort?: SortKey; q?: string; /** R3 URL arm, LAN-§18.5 */ xv?: string };
  /** the `sg-test` token when present (STO-D33) */
  test: string | null;
  status?: 200 | 404;
}

export interface RenderedStorePage {
  html: string;
  csp: string;
  etag: string;
  status: 200 | 404;
  bytes: number;
  noindex: boolean;
}

/** Render one store page (live, preview of a draft, or a test render). S1 (stub: NotBuiltYet). */
export async function renderStorePage(
  scope: StoreScope,
  store: StoreRow,
  route: StoreRoute,
  opts?: { mode?: "live" | "preview" | "test"; draft?: StorePageDoc; productDraft?: ProductRow },
): Promise<RenderedStorePage> {
  void scope;
  void store;
  void route;
  void opts;
  return notBuiltYet("S1", "renderStorePage");
}
