import "server-only";
/**
 * Attached landings, the server side (landing.md LAN-§17, LAN-§26.2 = storefront.md STO-§17; core §H.3 rev 5 CRIT2-17,
 * LAN Q24, STO-R41). Track S1 owns this file in R2 (P3's in R1, where it did not exist) and writes the bodies: the
 * attach and detach flows, `onProductChanged`, `materializeAttached` (./attach.ts) and the republish below.
 *
 *   republishAttached(scope, pageId, opts)   the handler of EVERY render job of a page with `pages.product_id`, whatever
 *                                            the job's reason: it materialises the mirror from the product at run time
 *                                            and diffs the priced fields (item price and compare-at, the option and
 *                                            variant set, every offer's `orderTotals` total) against the published doc:
 *                                            a difference publishes a `sync` version, none re-renders in place
 *
 * The R2 contract step (C2-B2) registered it: the render queue's port (src/lib/jobs/renders.ts `appPort`) sends every
 * job of an attached page here. Until S1 writes the body this seam re-renders in place, R1's behaviour, and records
 * `attached_in_place` so the gap is visible. No R1 path reaches it: no landing is attached to a product before R2.
 */
import type { RenderReason } from "@/lib/jobs/renders";
import { recordError } from "@/lib/jobs/errors";
import type { RerenderResult } from "@/lib/render/publish.server";
import type { Actor, WriteScope } from "@/lib/tenancy/types";

/** The render job handler of an attached page (S1, R2; LAN Q24, STO-R41). Contract seam: the in-place re-render. */
export async function republishAttached(scope: WriteScope, pageId: string, opts: { reason: RenderReason; actor: Actor }): Promise<RerenderResult> {
  recordError("renders", null, { code: "attached_in_place", storeId: scope.storeId, route: `renders:${opts.reason}` });
  const { rerenderInPlace } = await import("@/lib/render/publish.server");
  return rerenderInPlace(scope, pageId, opts);
}
