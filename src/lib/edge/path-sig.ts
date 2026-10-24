import "server-only";
/**
 * The signed request path (docs/STORE-SAAS.md §C.3 step 2, rev 3 SEC-3). src/proxy.ts stamps every request it
 * forwards with
 *
 *   x-sg-path      pathname + search, ≤ 512 chars
 *   x-sg-rid       a per-request ULID
 *   x-sg-path-sig  sign(x-sg-path + "|" + x-sg-rid, "proxy-path")
 *
 * after deleting any client-sent copy of the three. Only `storeAction` derives a store from the path (D2), and only
 * from `verifiedRequestPath()`, which checks the signature in constant time: a handler outside the proxy matcher (the
 * upload endpoints, /media) that sees a client-chosen x-sg-path can never pick a store with it. Without a usable
 * APP_SECRET nothing is stamped, so every store action answers not_found (fail closed).
 *
 * No Next.js request APIs and no shared state; the proxy and the seam are its only callers.
 */
import { isAppSecretConfigured } from "@/lib/auth/config";
import { newId } from "@/lib/db/ids";
import { safeEqual, sign } from "@/lib/security/crypto";

export const PATH_HEADERS = { path: "x-sg-path", rid: "x-sg-rid", sig: "x-sg-path-sig" } as const;
export const PATH_HEADER_MAX = 512;

const PURPOSE = "proxy-path";
const RID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const signature = (path: string, rid: string) => sign(`${path}|${rid}`, PURPOSE);

/**
 * Replace the path headers of `headers` (the mutable copy the proxy forwards) with fresh signed ones. A client
 * value is always deleted, even when signing is impossible.
 */
export function stampRequestPath(headers: Headers, pathAndSearch: string): void {
  for (const name of Object.values(PATH_HEADERS)) headers.delete(name);
  if (!isAppSecretConfigured()) return;
  const path = pathAndSearch.slice(0, PATH_HEADER_MAX);
  const rid = newId();
  try {
    headers.set(PATH_HEADERS.sig, signature(path, rid));
  } catch {
    return; // a secret the key derivation refuses: stamp nothing rather than an unsigned path
  }
  headers.set(PATH_HEADERS.path, path);
  headers.set(PATH_HEADERS.rid, rid);
}

/** x-sg-path when x-sg-rid and x-sg-path-sig verify (constant time), else null: missing, tampered or unsigned. */
export function verifiedRequestPath(headers: Headers): string | null {
  const path = headers.get(PATH_HEADERS.path);
  const rid = headers.get(PATH_HEADERS.rid);
  const sig = headers.get(PATH_HEADERS.sig);
  if (path === null || rid === null || sig === null) return null;
  if (path.length > PATH_HEADER_MAX || !RID_RE.test(rid) || !isAppSecretConfigured()) return null;
  try {
    return safeEqual(sig, signature(path, rid)) ? path : null;
  } catch {
    return null;
  }
}
