import "server-only";
/**
 * Test-order links (P3 LANDING; landing.md LAN-§14.1, SF-05; docs/STORE-SAAS.md D54, §K.2 P0): `storeUrl(store,
 * "/<slug>") + "?sg-test=" + token`, the token from the core's `signTestToken` (src/lib/tenancy/public.ts, T3), valid
 * 2 h and bound to the store, not the page; the page must be published (else `not_found`). Audited
 * `page.test_link_created` (`pages.publish`). Typed stub frozen at P0, with a `WriteScope` (D71: the audit row).
 */
import type { WriteScope } from "@/lib/tenancy/types";

export async function mintTestLink(scope: WriteScope, pageId: string): Promise<{ url: string; expiresAt: Date }> {
  void scope;
  void pageId;
  throw new Error("not implemented: P3 mintTestLink");
}
