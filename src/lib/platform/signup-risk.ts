import "server-only";
/**
 * Signup risk score (docs/STORE-SAAS.md §B.2 step 5; platform.md PLA-§3.4, PLA Q.9): the widened contract
 * `scoreSignup(input, deps?) → { score, flags, band, signals }`, in the pattern of scoreRisk (src/lib/orders/risk.ts),
 * with a 2 s budget (the MX lookup fails open). `signupAction` and the `/app/new` action pass the full input.
 *
 * C0a stub (§K.1): every signup lands in the `review` band with no flags and score 0, so nothing is auto-approved or
 * auto-rejected until P1 replaces the body; `signals` carries only the safe input summary (never a raw e-mail, phone,
 * IP or user agent).
 */
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { SignupBand, SignupFlag, SignupSignals } from "@/lib/db/schema";

export type { SignupBand, SignupFlag, SignupFlagCode, SignupSignals } from "@/lib/db/schema";

export type IdentityKind = "email_norm" | "phone" | "net" | "device";

export interface SignupRiskInput {
  email: string;
  phoneE164: string | null;
  name: string;
  storeName: string;
  handle: string;
  ip: string | null;
  ua: string | null;
  deviceId: string | null;
  turnstile: "ok" | "missing" | "unverified" | "off";
  formMs: number | null;
  market: string;
  mode: "landing" | "store" | "both";
  modeInterest?: "store" | "both";
  locale: "ar" | "fr" | "en";
  via: SignupSignals["inputs"]["via"];
  inviteLabel?: string;
  existingUserId?: string; // /app/new: the creator
}

export interface SignupScore {
  score: number; // 0-100
  flags: SignupFlag[];
  band: SignupBand;
  signals: SignupSignals;
}

/** Injectable for the selftest (no network, no DB). */
export interface SignupRiskDeps {
  now(): number;
  resolveMx(domain: string): Promise<"ok" | "none" | "null" | "timeout">;
  identityMatches(links: readonly { kind: IdentityKind; valueHash: string }[]): Promise<{ kind: IdentityKind; users: number; banned: number; recentUsers24h: number }[]>;
  velocity(netHash: string): Promise<boolean>; // p:signup:net:<hash> over 3/day
  protectedTerms(): Promise<readonly { term: string; kind: string; match: "exact" | "substring" | "skeleton" }[]>;
  trustedCreator(userId: string): Promise<boolean>;
}

/** C0a: the fixed `review` band (P1 implements the PLA-§3.4.1 signals). */
export async function scoreSignup(input: SignupRiskInput, deps?: Partial<SignupRiskDeps>): Promise<SignupScore> {
  void deps;
  const signals: SignupSignals = {
    v: 1,
    flags: [],
    band: "review",
    inputs: {
      emailDomain: (input.email.split("@")[1] ?? "").trim().toLowerCase().slice(0, 120),
      phoneCountry: (input.phoneE164 ? parsePhoneNumberFromString(input.phoneE164)?.country : undefined) ?? null,
      market: input.market,
      mode: input.mode,
      ...(input.modeInterest ? { modeInterest: input.modeInterest } : {}),
      locale: input.locale,
      uaLabel: "",
      turnstile: input.turnstile,
      formMs: input.formMs,
      via: input.via,
    },
    cluster: { users: 0, banned: 0, kinds: [] },
    partial: false,
    ms: 0,
  };
  return { score: 0, flags: [], band: "review", signals };
}
