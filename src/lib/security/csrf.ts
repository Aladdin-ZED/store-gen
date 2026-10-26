/**
 * Same-origin enforcement for state-changing platform requests (docs/STORE-SAAS.md §C.9, §F.7): server actions
 * (`storeAction`, `userAction`, `platformAction` call assertSameOrigin(headers()) first), `/api/app/**` and
 * `/api/admin/**` (`storeGuard`, `platformGuard`, adminGuard for non-safe methods, before the session lookup).
 *
 * Strict (rev 3, SEC-11), a request passes only when all of these hold:
 *  - `Sec-Fetch-Site` is "same-origin" (never "same-site": a store subdomain is same-site with the platform);
 *  - `Origin` is present (Next alone lets a request without one through with a warning) and is not the literal
 *    "null" (the proxy already answers that with a 403 for actions, §C.3 step 4);
 *  - the Origin's host is the host the request was addressed to, and that host is the platform host
 *    (`PLATFORM_HOST`) or the console host (`ADMIN_HOST`): effectiveHost() class `platform` or `console`. Never
 *    a store, custom or legacy host (AUTH-24); the allowed set comes from configuration, never from a reflected
 *    Host / X-Forwarded-Host.
 * Cross-site pages cannot forge these headers (forms can't set them; fetch would need a CORS preflight).
 */
import { effectiveHost } from "@/lib/edge/host";
import { hostOf } from "@/lib/edge/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class CsrfError extends Error {
  readonly status = 403;
  constructor(message = "Cross-site request rejected") {
    super(message);
    this.name = "CsrfError";
  }
}

/** The host of an http(s) Origin value, or null for "null", other schemes and anything malformed. */
function originHost(origin: string): string | null {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin === origin ? hostOf(u.host) : null; // an Origin is exactly scheme://host[:port]
  } catch {
    return null;
  }
}

/**
 * true when the request is same-origin with the platform or console host it was sent to. A `Request` with a
 * safe method (GET, HEAD, OPTIONS) always passes; plain `Headers` (a server action's `headers()`) are always
 * checked, since an action is a POST.
 */
export function checkSameOrigin(input: Request | Headers): boolean {
  const isRequest = input instanceof Request;
  if (isRequest && SAFE_METHODS.has(input.method.toUpperCase())) return true;
  const headers = isRequest ? input.headers : input;

  if (headers.get("sec-fetch-site") !== "same-origin") return false;
  const origin = headers.get("origin");
  if (origin === null || origin === "null") return false;
  const from = originHost(origin);
  if (!from) return false;

  const eff = effectiveHost(headers);
  if (eff.cls !== "platform" && eff.cls !== "console") return false;
  return from === eff.host;
}

/** Throws CsrfError (status 403) unless the request is same-origin. Call first in actions and non-safe handlers. */
export function assertSameOrigin(input: Request | Headers): void {
  if (!checkSameOrigin(input)) throw new CsrfError();
}
