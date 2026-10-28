import "server-only";
/**
 * The add-ons of one store document (P3 LANDING; landing.md LAN-§5.1, §5.3; docs/STORE-SAAS.md §H.13, D62; P0b, CCR
 * P3-2): what every store render path embeds, for the landing document and its thank-you document. P3 replaces the
 * body with `addonsFor(input)` (./plan.ts, pure) over the store's settings (checkout, landing, policies,
 * confirmation), its delivery zones and its templates; the signature is frozen (src/lib/contracts/r1-p0b-render.ts).
 *
 * The render paths that call it, and their mode (maintainer-wired):
 *   publish (`renderAndCommit`), the in-place re-render (`rerenderInPlace`, every `render_jobs` reason) → "live";
 *   the builder full preview (/app/<h>/preview/<id>) and the private preview (/preview/<token>) → "preview";
 *   the test render (`renderTestDocument`, which adds the test band itself) → "test";
 *   the export service, per export mode → "export-connected" | "export-php" | "export-whatsapp" ("export-static" is
 *   the static mode of LAN-§5.3, which no export offers in R1).
 * A set is passed to the renderer only when it is not empty (`hasAddons`, src/lib/render/store-context.server.ts), so
 * a document with every add-on off keeps today's bytes. Legal documents carry no add-on (no script).
 *
 * Until P3 merges: no add-on anywhere.
 */
import type { PageDoc } from "@/lib/page/schema";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { noAddons, type RenderAddons } from "./types";

export type AddonMode = "live" | "preview" | "test" | "export-static" | "export-connected" | "export-php" | "export-whatsapp";

export async function loadRenderAddons(scope: StoreScope, store: StoreRow, opts: { pageId: string | null; doc: PageDoc; mode: AddonMode }): Promise<{ landing: RenderAddons; thanks: RenderAddons }> {
  void scope;
  void store;
  void opts;
  return { landing: noAddons(), thanks: noAddons() };
}
