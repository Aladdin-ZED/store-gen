import "server-only";
/**
 * `publicAction` (docs/STORE-SAAS.md §B.1, §E.2): the wrapper of every public form's server action (`/signup`,
 * `/invite/<token>`, `/reset/<token>`, `/report/<handle>`, `/login`). In this order, before `fn` runs:
 *
 *   1. same-origin (SEC-11; the forms post Server Actions under `Referrer-Policy: same-origin`, so the browser sends
 *      the page's real Origin; a missing or `null` one is refused)
 *   2. the in-memory burst floor (`burstLimit`, before any DB work)
 *   3. the form's DB bucket `p:<name>:ip:<ipHash>` (signup 5/h, invite:accept 10/15 min, reset 10/15 min, report 5/h)
 *   4. Turnstile: `required` (a verified token, nothing else), `when-configured` (a verified token when the platform
 *      widget exists; a Cloudflare outage lets the form through) or `challenge` (`fn` decides, through the lazy
 *      `ctx.turnstile()`: signup gates in approval / open and scores in invite mode, sign-in asks only past 3 failures)
 *   5. the device marker: read from `__Host-sgd`, or set here when the form arrived without one (T3's proxy sets it on
 *      area-`auth` GETs, SEC-12; this is the fallback)
 *
 * Answers are generic (`rate_limited`, `challenge`, `invalid` with field items, `busy`, `server`), never a raw error.
 */
import { cookies, headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { newToken } from "@/lib/db/ids";
import { BURST_LIMITS, burstLimit, type BurstScope } from "@/lib/security/burst-limit";
import { clientIp } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/rate-limit";
import { getRequestIdentity, identityHeaders } from "@/lib/tenancy/context";
import { actionFailure, assertActionOrigin } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { PUBLIC_FORM_LIMITS, publicFormBucket } from "./attempts";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_SEC, IS_PROD } from "./config";
import { deviceMarkerFromCookieHeader, isDeviceMarker } from "./identity";
import { checkPlatformTurnstile, type HumanCheck } from "./turnstile";

/** The burst limiter's names (src/lib/security/burst-limit.ts), the auth forms' included (CCR r1.0-t2-4). */
export type BurstName = BurstScope;

export interface PublicActionCtx {
  ip: string;
  ua: string;
  /** the `__Host-sgd` marker (a fresh one when the form arrived without), or null inside runAsIdentity without one */
  deviceId: string | null;
  /** the platform human check of the form's token, verified at most once */
  turnstile(): Promise<HumanCheck>;
}

export interface PublicActionOpts {
  turnstile: "required" | "when-configured" | "challenge";
  burst: BurstName;
  /** the widget's `cf-turnstile-response` field */
  token?: string | null;
}

const NAME_RE = /^[a-z][a-z0-9_-]*(?::[a-z0-9_-]+)*$/;

const isBurstScope = (name: string): name is BurstScope => Object.hasOwn(BURST_LIMITS, name);

/** The device marker of this request, set as a cookie when missing (server actions may set cookies). */
async function ensureDeviceMarker(): Promise<string> {
  const jar = await cookies();
  const current = jar.get(DEVICE_COOKIE)?.value;
  if (isDeviceMarker(current)) return current;
  const fresh = newToken(16); // 128 bits → 22 base64url characters
  jar.set(DEVICE_COOKIE, fresh, { httpOnly: true, secure: IS_PROD, sameSite: "lax", path: "/", maxAge: DEVICE_COOKIE_MAX_AGE_SEC });
  return fresh;
}

export async function publicAction<T>(name: string, fn: (ctx: PublicActionCtx) => Promise<T>, opts: PublicActionOpts): Promise<ActionResult<T>> {
  try {
    if (!NAME_RE.test(name) || name.length > 40) throw new Error(`publicAction: bad name "${name}"`);
    const identity = getRequestIdentity();
    await assertActionOrigin(identity);
    const h = identity ? (identityHeaders(identity) ?? new Headers()) : await headers();
    const ip = clientIp(h);
    const ua = (h.get("user-agent") ?? "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300);

    if (isBurstScope(opts.burst) && !burstLimit(opts.burst, ip).ok) return { ok: false, error: "rate_limited" };
    const form = PUBLIC_FORM_LIMITS[name];
    if (form && !(await rateLimit(publicFormBucket(name, ip), form.limit, form.windowSec)).ok) return { ok: false, error: "rate_limited" };

    let check: Promise<HumanCheck> | null = null;
    const turnstile = () => (check ??= checkPlatformTurnstile(opts.token, ip));
    if (opts.turnstile !== "challenge") {
      const verdict = await turnstile();
      const pass = opts.turnstile === "required" ? verdict === "ok" : verdict === "ok" || verdict === "off" || verdict === "error";
      if (!pass) return { ok: false, error: "challenge", message: "auth.challenge" };
    }

    const deviceId = identity ? deviceMarkerFromCookieHeader(h.get("cookie")) : await ensureDeviceMarker();
    return { ok: true, data: await fn({ ip, ua, deviceId, turnstile }) };
  } catch (err) {
    unstable_rethrow(err);
    return actionFailure(err, `public:${name}`);
  }
}
