import "server-only";
/**
 * The platform human check (docs/STORE-SAAS.md §B.2 step 2, §B.3, D69): the `platform_turnstile` widget on the auth
 * forms. One verification per token (Cloudflare refuses a second `siteverify` of the same token anyway).
 *
 *   ok       the token verified
 *   missing  the widget is configured and no token came
 *   failed   Cloudflare refused the token
 *   error    Cloudflare did not answer (an outage never locks the forms; a gate decides what to do with it)
 *   off      no widget is configured
 */
import { verifyTurnstile } from "@/lib/orders/turnstile";
import { platformTurnstileKeys } from "./platform-config";

export type HumanCheck = "ok" | "missing" | "failed" | "error" | "off";

const TOKEN_MAX = 2048;

export async function checkPlatformTurnstile(token: string | null | undefined, ip: string, keys?: { secretKey: string } | null): Promise<HumanCheck> {
  const widget = keys === undefined ? await platformTurnstileKeys() : keys;
  if (!widget) return "off";
  const t = typeof token === "string" ? token.trim() : "";
  if (!t || t.length > TOKEN_MAX) return "missing";
  const verdict = await verifyTurnstile(widget.secretKey, t, ip);
  return verdict === "ok" ? "ok" : verdict === "failed" ? "failed" : "error";
}

/** The state `scoreSignup` scores (PLA-§3.4.1): a refused or unanswered token is `unverified`. */
export function riskTurnstileState(check: HumanCheck): "ok" | "missing" | "unverified" | "off" {
  return check === "failed" || check === "error" ? "unverified" : check;
}
