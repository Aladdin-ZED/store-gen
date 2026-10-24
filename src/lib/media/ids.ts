import "server-only";
/**
 * Per-store asset ids (docs/STORE-SAAS.md D21, §G.4 step 3; TENANCY-MAP MED-01):
 *
 *   assetId = HMAC(master bytes, "media-id:" + storeId)[:32]
 *
 * Identical bytes uploaded by two stores get two unrelated ids, so dedup only ever finds the store's own row: no
 * "deduped" answer, no faster response and no shared row reveal that another store holds the same file. Ids keep
 * today's shape (32 lowercase hex), so KEY_RE, ASSET_ID_RE and every stored key stay valid; the ids of the rows
 * created before tenancy (sha256 prefixes, store #1) stay as they are.
 */
import { hmacBytes } from "@/lib/security/crypto";
import type { StoreScope } from "@/lib/tenancy/types";

const ID_RE = /^[a-f0-9]{32}$/;

/** The asset id of `master` (the processed master WebP, or the scrubbed video) in the scope's store. */
export function mediaAssetId(scope: StoreScope, master: Uint8Array): string {
  const id = hmacBytes(master, `media-id:${scope.storeId}`).slice(0, 32);
  // keys are "<id>-<width>.<fmt>" everywhere (renderer, exports, the public route): never store another shape
  if (!ID_RE.test(id)) throw new Error("media: hmacBytes must return lowercase hex");
  return id;
}
