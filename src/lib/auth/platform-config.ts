import "server-only";
/**
 * The platform values identity reads (docs/STORE-SAAS.md §B.2, §B.7, §H.8, D9): the `platform` setting (brand,
 * signup mode and ceilings, new-store defaults, reserved handles), the platform Turnstile widget and the kill
 * switches.
 *
 * T1 owns the readers (`getPlatformSetting`, `activeKillSwitches`, 30 s caches); a fresh 0004 database reads as the
 * registry defaults (the schema defaults, the env TURNSTILE_* keys of `platform_turnstile`, no switch tripped). A read
 * error propagates, so a failed read never opens a gate.
 */
import { subdomainMode } from "@/lib/edge/env";
import type { KillKey } from "@/lib/flags/registry";
import { getPlatformSetting } from "@/lib/settings";
import type { PlatformSetting } from "@/lib/settings/keys/platform";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import { TOTP_ISSUER } from "./config";

/** The `platform` setting with every default filled in. */
export function platformSetting(): Promise<PlatformSetting> {
  return getPlatformSetting("platform");
}

/** The platform Turnstile widget (`platform_turnstile`, env TURNSTILE_* as defaults, SET-09), or null when not configured. */
export async function platformTurnstileKeys(): Promise<{ siteKey: string; secretKey: string } | null> {
  const value = await getPlatformSetting("platform_turnstile");
  return value.siteKey && value.secretKey ? { siteKey: value.siteKey, secretKey: value.secretKey } : null;
}

/** Is the kill switch tripped (§H.8: `signups_enabled` false, `platform_read_only` true, …)? */
export async function killSwitchTripped(key: KillKey): Promise<boolean> {
  return (await activeKillSwitches()).includes(key);
}

/** The platform brand (`platform.brand.name`, default "Store Gen"): the TOTP issuer, titles, mails. */
export async function brandName(): Promise<string> {
  try {
    return (await platformSetting()).brand.name;
  } catch {
    return TOTP_ISSUER; // a label only: a settings outage must not break 2FA enrolment
  }
}

export type SignupMode = "closed" | "invite" | "approval" | "waitlist" | "open";

export interface EffectiveSignupMode {
  mode: SignupMode;
  /** the stored `signup.mode`; null = derived (D9) */
  stored: SignupMode | null;
  /** a stored `approval` / `open` without a configured widget, served as `invite` (alarm `signup_unguarded`) */
  unguarded: boolean;
  /** the platform widget, when configured */
  turnstile: { siteKey: string; secretKey: string } | null;
}

let unguardedWarned = false;

/**
 * §B.2 / D9: the stored mode, else `approval` once S mode is on and the domain check V13 "human check ready" has passed,
 * else `invite`. `approval` and `open` need the platform widget: a stored one without it is served as `invite` and
 * logged once per process (P1's alarm job raises `signup_unguarded` from the same state).
 */
export async function effectiveSignupMode(): Promise<EffectiveSignupMode> {
  const [setting, turnstile] = await Promise.all([platformSetting(), platformTurnstileKeys()]);
  const stored = setting.signup.mode;
  if (stored === null) {
    const humanCheckReady = turnstile !== null && Boolean(setting.domainMove.checks["V13"]?.passedAt);
    return { mode: subdomainMode() && humanCheckReady ? "approval" : "invite", stored, unguarded: false, turnstile };
  }
  if ((stored === "approval" || stored === "open") && !turnstile) {
    if (!unguardedWarned) {
      unguardedWarned = true;
      console.warn(`[signup] signup_unguarded: the stored mode "${stored}" needs the platform Turnstile widget; serving "invite" until one is configured`);
    }
    return { mode: "invite", stored, unguarded: true, turnstile };
  }
  return { mode: stored, stored, unguarded: false, turnstile };
}
