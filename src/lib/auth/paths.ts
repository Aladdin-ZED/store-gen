/**
 * Admin auth routes and safe post-login redirects (isomorphic, no I/O).
 */

export const ADMIN_HOME_PATH = "/admin";
export const LOGIN_PATH = "/admin/login";
export const VERIFY_PATH = "/admin/login/verify";
export const SETUP_PATH = "/admin/setup";
export const TWO_FACTOR_PATH = "/admin/two-factor";
export const FORBIDDEN_PATH = "/admin/forbidden";
/** Settings → Security: the two-step page returns here when opened with `?from=settings`. */
export const SECURITY_SETTINGS_PATH = "/admin/settings/security";
/** Notice the Security settings page shows after two-step verification was turned off there. */
export const TWO_FACTOR_OFF_NOTICE = "two-factor-off";
/** The account's two-step enrolment page (docs/STORE-SAAS.md §B.7; `/app/account/**`, no store). */
export const ACCOUNT_TWO_FACTOR_PATH = "/app/account/two-factor";
/** Where the seam sends a member of a store with "require 2FA for members" who has no TOTP yet (D12). */
export const STORE_2FA_ENROL_PATH = `${ACCOUNT_TWO_FACTOR_PATH}?for=store`;
/** Where `requirePlatform` sends a staff member without TOTP: the console stays closed until enrolment (§B.7). */
export const CONSOLE_2FA_ENROL_PATH = `${ACCOUNT_TWO_FACTOR_PATH}?for=console`;

/** Pages that must never be used as a post-login destination (loops / stale flows). */
const NON_DESTINATIONS = [LOGIN_PATH, SETUP_PATH, FORBIDDEN_PATH];

const SAFE_PATH_RE = /^\/admin(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)*\/?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;

/**
 * Returns `input` when it is a same-site admin path that is safe to redirect to, otherwise null.
 * Rejects absolute/protocol-relative URLs, backslashes, dot segments and encoded slashes/dots.
 */
export function safeAdminPath(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) return null;
  if (!SAFE_PATH_RE.test(input)) return null;
  const pathOnly = input.split("?")[0]!;
  if (/%2e|%2f|%5c/i.test(pathOnly) || /(^|\/)\.{1,2}(\/|$)/.test(pathOnly)) return null;
  if (NON_DESTINATIONS.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) return null;
  return input;
}

export function loginUrl(next?: string | null): string {
  const safe = safeAdminPath(next);
  return safe && safe !== ADMIN_HOME_PATH ? `${LOGIN_PATH}?next=${encodeURIComponent(safe)}` : LOGIN_PATH;
}

export function verifyUrl(next?: string | null): string {
  const safe = safeAdminPath(next);
  return safe && safe !== ADMIN_HOME_PATH ? `${VERIFY_PATH}?next=${encodeURIComponent(safe)}` : VERIFY_PATH;
}
