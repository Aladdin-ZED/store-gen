/**
 * Auth routes and safe post-login redirects (isomorphic, no I/O).
 */

export const ADMIN_HOME_PATH = "/admin";
/**
 * The one sign-in of the platform host (§B.1: today's /admin/login moved to /login and rebranded). The console's old
 * /admin/login and /admin/login/verify URLs only redirect here, behind the gate.
 */
export const LOGIN_PATH = "/login";
export const VERIFY_PATH = "/login/verify";
export const SETUP_PATH = "/admin/setup";
/** The account's two-step enrolment page (docs/STORE-SAAS.md §B.7; `/app/account/**`, no store). */
export const ACCOUNT_TWO_FACTOR_PATH = "/app/account/two-factor";
/** @deprecated today's /admin/two-factor moved to the account pages (§I.1); the old URL redirects */
export const TWO_FACTOR_PATH = ACCOUNT_TWO_FACTOR_PATH;
export const FORBIDDEN_PATH = "/admin/forbidden";
/** The account's Security page: the two-step page returns here when opened with `?from=settings`. */
export const SECURITY_SETTINGS_PATH = "/app/account/security";
/** Notice the Security page shows after two-step verification was turned off there. */
export const TWO_FACTOR_OFF_NOTICE = "two-factor-off";
/** Where the seam sends a member of a store with "require 2FA for members" who has no TOTP yet (D12). */
export const STORE_2FA_ENROL_PATH = `${ACCOUNT_TWO_FACTOR_PATH}?for=store`;
/** Where `requirePlatform` sends a staff member without TOTP: the console stays closed until enrolment (§B.7). */
export const CONSOLE_2FA_ENROL_PATH = `${ACCOUNT_TWO_FACTOR_PATH}?for=console`;

/* The platform-host surfaces of §B.1 (public, no gate) and the tenant dashboard roots (§I.1). */
export const SIGN_IN_PATH = "/login";
export const SIGN_IN_VERIFY_PATH = "/login/verify";
export const SIGNUP_PATH = "/signup";
export const APP_HOME_PATH = "/app";
export const NEW_STORE_PATH = "/app/new";
export const ACCOUNT_PATH = "/app/account";

/** Pages that must never be used as a post-login destination (loops / stale flows). */
const NON_DESTINATIONS = [LOGIN_PATH, SETUP_PATH, FORBIDDEN_PATH];

const SAFE_PATH_RE = /^\/admin(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)*\/?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;
/** AUTH-21 (§B.3): the dashboard and the console, nothing else (no public page, no auth page). */
const SAFE_APP_PATH_RE = /^\/(?:app|admin)(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+)*\/?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;
/** The one public page a sign-in may return to: the store invite it interrupted (§B.5, "sign in first"). */
const INVITE_RETURN_RE = /^\/invite\/[A-Za-z0-9_-]{43}$/;

function safeAgainst(input: unknown, re: RegExp): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 512) return null;
  if (!re.test(input)) return null;
  const pathOnly = input.split("?")[0]!;
  if (/%2e|%2f|%5c/i.test(pathOnly) || /(^|\/)\.{1,2}(\/|$)/.test(pathOnly)) return null;
  if (NON_DESTINATIONS.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) return null;
  return input;
}

/**
 * Returns `input` when it is a same-site admin path that is safe to redirect to, otherwise null.
 * Rejects absolute/protocol-relative URLs, backslashes, dot segments and encoded slashes/dots.
 */
export function safeAdminPath(input: unknown): string | null {
  return safeAgainst(input, SAFE_PATH_RE);
}

/** `safeAdminPath` widened to the tenant dashboard: `/app/…` or `/admin/…`, same rules (§B.3, AUTH-21). */
export function safeAppPath(input: unknown): string | null {
  if (typeof input === "string" && INVITE_RETURN_RE.test(input)) return input;
  return safeAgainst(input, SAFE_APP_PATH_RE);
}

/** The sign-in page coming back to a console path (today's /admin guard; the console's home is kept as `next`). */
export function loginUrl(next?: string | null): string {
  const safe = safeAdminPath(next) ?? ADMIN_HOME_PATH;
  return `${LOGIN_PATH}?next=${encodeURIComponent(safe)}`;
}

export function verifyUrl(next?: string | null): string {
  const safe = safeAdminPath(next) ?? ADMIN_HOME_PATH;
  return `${VERIFY_PATH}?next=${encodeURIComponent(safe)}`;
}

/** The platform sign-in page (§B.1), coming back to a safe dashboard or console path. */
export function signInUrl(next?: string | null): string {
  const safe = safeAppPath(next);
  return safe && safe !== APP_HOME_PATH ? `${SIGN_IN_PATH}?next=${encodeURIComponent(safe)}` : SIGN_IN_PATH;
}

export function signInVerifyUrl(next?: string | null): string {
  const safe = safeAppPath(next);
  return safe && safe !== APP_HOME_PATH ? `${SIGN_IN_VERIFY_PATH}?next=${encodeURIComponent(safe)}` : SIGN_IN_VERIFY_PATH;
}
