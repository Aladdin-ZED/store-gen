import "server-only";
/**
 * The add-ons of one store document (P3 LANDING; landing.md LAN-§5.1, §5.3; docs/STORE-SAAS.md §H.13, D62; P0b, CCR
 * P3-2): what every store render path embeds, for the landing document and its thank-you document. The body gathers
 * the store's settings (checkout, landing, the store contacts and its confirmation block), its value-keyed zone table
 * (`zonesForCheckout`), its calling window (operations' `callingWindowFor`) and its `customer_confirm` template
 * (`templateFor`) through the store scope, then calls `addonsFor(input)` (./plan.ts, pure) once per document; the
 * signature is frozen (src/lib/contracts/r1-p0b-render.ts). Each source is read only when a setting needs it.
 *
 * The render paths that call it, and their mode (maintainer-wired):
 *   publish (`renderAndCommit`), the in-place re-render (`rerenderInPlace`, every `render_jobs` reason) → "live";
 *   the builder full preview (/app/<h>/preview/<id>) and the private preview (/preview/<token>) → "preview";
 *   the test render (`renderTestDocument`, which adds the test band itself) → "test";
 *   the export service, per export mode → "export-connected" | "export-php" | "export-whatsapp" ("export-static" is
 *   the static mode of LAN-§5.3, which no export offers in R1).
 * A set is passed to the renderer only when it is not empty (`hasAddons`, src/lib/render/store-context.server.ts), so
 * a document with every add-on off keeps today's bytes. Legal documents carry no add-on (no script).
 */
import type { PageDoc } from "@/lib/page/schema";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { zonesForCheckout } from "@/lib/delivery/zones.server";
import { templateFor } from "@/lib/landing/templates.server";
import { getStoreSettings } from "@/lib/settings";
import type { StoreRow, StoreScope } from "@/lib/tenancy/types";
import { storePath, storeUrl } from "@/lib/urls";
import { addonsFor, type AddonInput } from "./plan";
import type { RenderAddons } from "./types";

export type AddonMode = "live" | "preview" | "test" | "export-static" | "export-connected" | "export-php" | "export-whatsapp";

export async function loadRenderAddons(scope: StoreScope, store: StoreRow, opts: { pageId: string | null; doc: PageDoc; mode: AddonMode }): Promise<{ landing: RenderAddons; thanks: RenderAddons }> {
  const { doc, mode } = opts;
  const { checkout, landing, store: contacts } = await getStoreSettings(scope, ["checkout", "landing", "store"]);
  const ty = landing.thankYou;
  const [table, window, confirmTpl] = await Promise.all([
    checkout.zonesEnabled && checkout.lineOnLanding ? zonesForCheckout(scope) : null,
    ty.expectation && contacts.confirmation.callerPhone ? callingWindowFor(scope) : null,
    ty.confirmWhatsapp ? templateFor(scope, "customer_confirm", doc.locale) : null,
  ]);
  const input: Omit<AddonInput, "page"> = {
    mode,
    doc,
    store: { handle: store.handle, timezone: store.timezone },
    settings: { checkout, landing, confirmation: contacts.confirmation, ...(contacts.whatsapp ? { whatsapp: contacts.whatsapp } : {}) },
    table,
    window,
    templates: confirmTpl ? { customer_confirm: confirmTpl } : {},
    links: { trackBase: mode === "export-connected" ? storeUrl(store, "/track") : storePath(store, "/track") },
    now: new Date(),
  };
  return { landing: addonsFor({ ...input, page: "landing" }), thanks: addonsFor({ ...input, page: "thanks" }) };
}
