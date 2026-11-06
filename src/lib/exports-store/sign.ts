import "server-only";
/**
 * The signed download link of an export part (docs/STORE-SAAS.md §F.9; R1 P8 step 8):
 *
 *   /api/app/<h>/exports/<jobId>/<part>?t=<exp>.<sig>
 *   sig = hmac(`${jobId}|${part}|${exp}`, `export-dl:${storeId}`)   (hex, APP_SECRET-derived, one key per store)
 *
 * `exp` is epoch seconds, at most 24 h ahead when minted (`listExportJobs` mints a fresh one per listing, never past
 * the job's 72 h expiry). The route checks it in constant time after `storeGuard`; a bad, expired or foreign token is
 * the neutral 404. A link alone is useless: the route still needs a session of the store with `store.export`.
 */
import { hmac, safeEqual } from "@/lib/security/crypto";

/** §F.9: a download link is valid 24 h */
export const EXPORT_LINK_TTL_S = 24 * 60 * 60;
const TOKEN_RE = /^(\d{1,12})\.([0-9a-f]{64})$/;

export function exportSignature(storeId: string, jobId: string, part: string, exp: number): string {
  return hmac(`${jobId}|${part}|${exp}`, `export-dl:${storeId}`);
}

/** `<exp>.<sig>` for a link valid until `exp` (epoch seconds). */
export function exportToken(storeId: string, jobId: string, part: string, exp: number): string {
  return `${exp}.${exportSignature(storeId, jobId, part, exp)}`;
}

/** The expiry of a link minted at `nowMs`: 24 h ahead, never after `notAfter` (the job's expiry). */
export function linkExpiry(nowMs: number, notAfter: Date | null): number {
  const exp = Math.floor(nowMs / 1000) + EXPORT_LINK_TTL_S;
  return notAfter ? Math.min(exp, Math.floor(notAfter.getTime() / 1000)) : exp;
}

/** True only for an unexpired token signed for this store, job and part. */
export function verifyExportToken(storeId: string, jobId: string, part: string, token: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (typeof token !== "string") return false;
  const m = TOKEN_RE.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= nowMs) return false;
  return safeEqual(m[2]!, exportSignature(storeId, jobId, part, exp));
}
