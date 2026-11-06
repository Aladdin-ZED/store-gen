/**
 * Store-prefixed web storage for the add-on chunks (P3 LANDING; landing.md LAN-§5.2; docs/STORE-SAAS.md §C.9 rev 4).
 * On a store page in P mode (`/s/<handle>` and below) every store shares the platform origin, so a key carries the
 * store: "lp:<handle>:<key>"; anywhere else (the store's own host, exports, the preview) it is "lp-<key>". The regex
 * is the core's (`skey` in src/landing/runtime/core.ts, which the add-ons never import: the core's state is
 * module-private); `test:landing-addons` proves both give the same names on /s/nour, /s/nour/, /s/nour/serum, /serum
 * and /s/x. Storage never throws here (private mode, blocked site data, sandboxed previews).
 */

/** `/s/<handle>`, with or without a trailing path (the store home and its pages share one prefix). */
export const STORE_PATH_RE = /^\/s\/([a-z0-9-]{3,30})(?:\/|$)/;

/** "lp:<handle>:" under /s/<handle>, else "" (outside /s/). */
export function storePrefix(pathname: string): string {
  const m = STORE_PATH_RE.exec(pathname);
  return m ? "lp:" + m[1] + ":" : "";
}

/** The storage name of `key` on `pathname`: "lp:<h>:<key>" under /s/<h>, else "lp-<key>" (the core's `skey`). */
export function storageKey(pathname: string, key: string): string {
  return (storePrefix(pathname) || "lp-") + key;
}

export function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string): boolean {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
