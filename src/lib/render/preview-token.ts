import "server-only";
/**
 * Private preview links (docs/STORE-SAAS.md §E.2, PLA Q.6, rev 3 SEC-7: store-bound and revocable). Mint runs
 * `assertOwned(scope, "page", [pageId])` first (another store's page id → not_found), inserts a `preview_tokens` row
 * and seals `{ v: 1, jti, storeId, pageId, audience, staffUserId?, exp }` with the platform envelope (purpose
 * "preview:v1"); `/preview/<token>` opens it, loads the row by jti (not revoked, not expired), re-checks the page's
 * store and the store's servable state, bumps `opened`, and renders the latest draft `noindex`, `private, no-store`.
 * Audit `store.preview_link.created` / `.revoked` in the page's store.
 *
 * Signatures frozen at C0a; T3 implements the bodies (§K.1).
 */
import type { StoreScope } from "@/lib/tenancy/types";

/** The longest a preview link may live: 3 days. */
export const PREVIEW_TTL_MAX_SEC = 259_200;

export async function mintPreviewToken(
  scope: StoreScope,
  input: { pageId: string; ttlSec: number /* ≤ 259200 */; audience: "staff" | "seller"; staffUserId?: string },
): Promise<{ url: string; expiresAt: Date; tokenId: string }> {
  void scope;
  void input;
  throw new Error("not implemented: T3 (mintPreviewToken)");
}

/** "Share a private preview" → "Revoke"; audit store.preview_link.revoked. */
export async function revokePreviewToken(scope: StoreScope, tokenId: string): Promise<void> {
  void scope;
  void tokenId;
  throw new Error("not implemented: T3 (revokePreviewToken)");
}
