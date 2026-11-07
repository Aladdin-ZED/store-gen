import "server-only";
/**
 * Previews of store page drafts (storefront.md STO-§7.7, STO-R15; S1 STOREFRONT owns this file in R2). The R2 contract
 * step (C2-E) froze the signature for the maintainer's two seams, both reached only while `releaseOn("R2")`:
 *   - `/app/<h>/preview/<pageId>` (src/app/app/[store]/preview/[id]/route.ts): a page whose kind is not `landing`;
 *   - `/preview/<token>` (servePreview in src/lib/render/store-routes.server.ts, pending stores): the same drafts.
 * S1's body renders the template draft with `mode: "preview"`: `?product=<id>` / `?collection=<id>` pick the sample
 * (default: the most recently updated active one; product drafts preview with their draft data), `?v=<versionId>` a
 * version; no beacon, no pixel, the checkout block says "Aperçu : la commande n'est pas envoyée."; `noindex`,
 * `private, no-store`. Every refusal is the neutral 404. Contract body until S1 merges: the neutral 404.
 */
import { notFoundResponse } from "@/lib/render/serve.server";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";

/** Who asks: a member through the store guard (admin), or an opened preview token (pending stores, STO-R15). */
export interface StorePreviewCtx {
  scope: StoreScope;
  store: StoreRow;
  via: "admin" | "token";
  /** the request's CSP nonce when the proxy set one (admin previews) */
  nonce?: string | null;
}

/** A store page draft as a preview document (S1; contract body: the neutral 404). */
export async function serveStoreTemplatePreview(req: Request, ctx: StorePreviewCtx, pageId: string, params: URLSearchParams): Promise<Response> {
  void ctx;
  void pageId;
  void params;
  return notFoundResponse(req);
}
