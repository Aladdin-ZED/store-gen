import "server-only";
/**
 * Optional Cloudflare Turnstile check for public order submissions, with the keys of the target's store
 * (docs/STORE-SAAS.md §D.10, SET-09): the store's own widget keys (custom domains, R3), else the platform widget
 * (`platform_turnstile`, whose hostnames cover the platform and every store subdomain). The rule is the one the
 * renderer embeds the widget by (src/lib/render/store-context.server.ts), so a page is checked with the secret of
 * the site key it carries.
 *
 * Enforcement rule: a missing token is only rejected when the page's published HTML actually embeds
 * the widget (site key present in the stored HTML). Pages published before Turnstile was configured
 * keep taking orders — flagged "captcha_missing" — until they are re-published.
 *
 * Connected exports cannot carry the widget, yet resolve to the same page, prices and pixels: they
 * must not become the way around the captcha. While Turnstile is configured, an export order without
 * a token is refused when it has no Origin header (an export always runs in a browser on another
 * origin, and browsers always send Origin on those POSTs — only scripts omit it), and otherwise comes
 * back "unprotected": stored, held for review and kept out of the server-side Purchase events
 * (risk.ts UNPROTECTED_MIN_SCORE).
 * A Cloudflare outage never blocks sales (token marked "unverified").
 */
import { getPlatformSetting, getStoreSettings } from "@/lib/settings";
import type { StoreScope } from "@/lib/tenancy/types";
import type { CaptchaState } from "./risk";
import { versionEmbedsSiteKey, type PageTarget } from "./resolve";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaOutcome = CaptchaState | "failed";

/** A widget's key pair (both set, or Turnstile is off for the store). */
export interface TurnstileKeys {
  siteKey: string;
  secretKey: string;
}

/** The keys the store's documents embed: its own pair, else the platform widget's; null when neither is configured. */
export async function turnstileKeysFor(scope: StoreScope): Promise<TurnstileKeys | null> {
  const { turnstile } = await getStoreSettings(scope, ["turnstile"] as const);
  if (turnstile.siteKey && turnstile.secretKey) return { siteKey: turnstile.siteKey, secretKey: turnstile.secretKey };
  const platform = await getPlatformSetting("platform_turnstile");
  return platform.siteKey && platform.secretKey ? { siteKey: platform.siteKey, secretKey: platform.secretKey } : null;
}

export async function verifyTurnstile(secret: string, token: string, ip: string): Promise<"ok" | "failed" | "unverified"> {
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip && ip !== "0.0.0.0" ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return "unverified";
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; "error-codes"?: string[] };
    if (j.success === true) return "ok";
    return (j["error-codes"] ?? []).includes("internal-error") ? "unverified" : "failed";
  } catch {
    return "unverified";
  }
}

/**
 * The captcha outcome of an order on `target` (a page of the scope's store). `opts.keys` passes the store's keys
 * when the caller already has them (null: Turnstile is off); otherwise they are read for the store.
 */
export async function checkCaptcha(
  scope: StoreScope,
  target: Pick<PageTarget, "kind" | "versionId">,
  token: string | null | undefined,
  ip: string,
  opts: { noOrigin?: boolean; keys?: TurnstileKeys | null } = {},
): Promise<CaptchaOutcome> {
  const cfg = opts.keys !== undefined ? opts.keys : await turnstileKeysFor(scope);
  if (!cfg) return "off";
  const t = typeof token === "string" ? token.trim() : "";
  if (!t || t.length > 2048) {
    if (target.kind === "export") return opts.noOrigin ? "failed" : "unprotected";
    return (await versionEmbedsSiteKey(scope, target.versionId, cfg.siteKey)) ? "failed" : "missing";
  }
  return verifyTurnstile(cfg.secretKey, t, ip);
}
