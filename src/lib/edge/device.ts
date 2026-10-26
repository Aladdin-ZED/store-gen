import "server-only";
/**
 * The device marker `__Host-sgd` (docs/STORE-SAAS.md §B.1 "Device marker", PLA Q.3, rev 3 SEC-12): a random
 * 128-bit id that feeds the `identity_links` kind `device` signal of signup and login. Set by src/proxy.ts on
 * every area-`auth` GET of the platform host that arrives without a well-formed one (a page response cannot set
 * a cookie, and a marker set only after the first submit would miss the signup it serves); `publicAction` sets
 * it as a fallback when a form arrives without one. T2 only reads it (`readDeviceId`).
 *
 * It carries no user data: a cleared cookie only weakens the duplicate signal. In P mode the browser also sends
 * it on `/s/<h>/**` (Path=/); it is never read there and the proxy deletes the Cookie header of store requests.
 * No Next.js request APIs and no shared state.
 */
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SEC, DEVICE_MARKER_RE, IS_PROD } from "@/lib/auth/config";

/**
 * The name, format and lifetime are T2's constants (CCR r1.0-t2-7), so the proxy and `publicAction`'s fallback
 * never differ: `__Host-sgd` (Secure, Path=/, no Domain) in production like every platform cookie (§C.9), a plain
 * name in dev; 400 days, the longest lifetime browsers keep; 16 random bytes, base64url without padding.
 */
export { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SEC };

/** A fresh marker: 128 bits from the Web Crypto RNG, base64url. */
export function newDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** The marker value when it is well formed, else null (a client can send anything in a cookie). */
export function readDeviceId(value: string | null | undefined): string | null {
  return value && DEVICE_MARKER_RE.test(value) ? value : null;
}

export function deviceCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SEC,
  };
}
