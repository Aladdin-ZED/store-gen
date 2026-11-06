/**
 * The pure half of the signup risk score (platform.md PLA-§3.4, PD3, PD31, PD52): the starting points of every
 * signal, the bands, the hold class, auto-approval and the explanations. Isomorphic, so the console's thresholds bar
 * and the queue's counterfactual line compute exactly what the server stored. `signup-risk.ts` (server-only) gathers
 * the signals and re-exports everything here under the names PLA-§3.4 gives them.
 *
 *   bandFor(62, flags, thresholds)                    // "hold"
 *   explainBand(score, thresholds).pivot              // { code: "disposable_email", bandWithout: "fast" }
 *   autoApprove("open", score, { trustedCreator: false, setting: platform.signup })
 *
 * Nothing here rejects anyone: `reject_candidate` is a triage band (R-D12).
 */
import type { MessageKey } from "@/lib/tenancy/types";
import type { PlatformSetting } from "@/lib/settings/keys/platform";
import type { SignupBand, SignupFlag, SignupFlagCode, SignupMode, SignupSignals, SignupThresholds } from "./types";

/** Every flag code, in the order of the PLA-§3.4.1 table (`mixed_script` is R3, PL-22: never raised in R1). */
export const SIGNUP_FLAG_CODES = [
  "disposable_email",
  "null_mx",
  "no_mx",
  "mx_unknown",
  "brand_exact",
  "brand_near",
  "offensive_term",
  "dup_email_norm",
  "dup_phone",
  "dup_network",
  "dup_device",
  "linked_banned",
  "velocity_network",
  "turnstile_missing",
  "turnstile_unverified",
  "too_fast",
  "fast",
  "bot_ua",
  "no_ua",
  "phone_market_mismatch",
  "market_not_allowed",
  "invite_code",
  "trusted_creator",
  "mixed_script",
] as const satisfies readonly SignupFlagCode[];

/**
 * The starting points of PLA-§3.4.1 **[to tune]**; `platform.signup.weights[code]` overrides one (-50 … 100).
 * `dup_phone` is the base of a sliding scale: +10 per extra user, at most base + 20 (+20 / +30 / +40 by default).
 */
export const DEFAULT_SIGNUP_POINTS: Readonly<Record<SignupFlagCode, number>> = {
  disposable_email: 35,
  null_mx: 25,
  no_mx: 20,
  mx_unknown: 0,
  brand_exact: 40,
  brand_near: 25,
  offensive_term: 30,
  dup_email_norm: 25,
  dup_phone: 20,
  dup_network: 15,
  dup_device: 30,
  linked_banned: 50,
  velocity_network: 20,
  turnstile_missing: 20,
  turnstile_unverified: 10,
  too_fast: 30,
  fast: 10,
  bot_ua: 40,
  no_ua: 20,
  phone_market_mismatch: 5,
  market_not_allowed: 40,
  invite_code: -20,
  trusted_creator: -30,
  mixed_script: 15,
};

/** PLA-§2.4 defaults: fast ≤ 24 · review 25-59 · hold ≥ 60 · reject_candidate ≥ 85. */
export const DEFAULT_THRESHOLDS: Readonly<SignupThresholds> = { fastLaneMax: 24, holdMin: 60, rejectCandidateMin: 85 };

/**
 * Hold-class flags (PLA-§3.4.1): each alone blocks auto-approval in every mode and keeps the row out of the bulk fast
 * lane, whatever the score.
 */
export const HOLD_CLASS: ReadonlySet<SignupFlagCode> = new Set<SignupFlagCode>(["linked_banned", "brand_exact", "offensive_term", "bot_ua", "market_not_allowed", "dup_device"]);

/** fast < review < hold < reject_candidate */
export const BAND_ORDER: Readonly<Record<SignupBand, number>> = { fast: 0, review: 1, hold: 2, reject_candidate: 3 };

const isCode = (code: string): code is SignupFlagCode => Object.hasOwn(DEFAULT_SIGNUP_POINTS, code);

/** The points of one flag code under the stored weights (an override outside -50 … 100 or not an integer is ignored). */
export function pointsFor(code: SignupFlagCode, weights: Readonly<Record<string, number>> = {}): number {
  const w = weights[code];
  return typeof w === "number" && Number.isInteger(w) && w >= -50 && w <= 100 ? w : DEFAULT_SIGNUP_POINTS[code];
}

/** `dup_phone` for `users` other accounts: base, +10 per extra user, at most base + 20. */
export function dupPhonePoints(users: number, weights: Readonly<Record<string, number>> = {}): number {
  const base = pointsFor("dup_phone", weights);
  return base + 10 * Math.min(2, Math.max(0, Math.floor(users) - 1));
}

/** Σ points clamped to 0-100 (the score of PLA-§3.4.1). */
export function scoreOf(flags: readonly Pick<SignupFlag, "points">[]): number {
  const sum = flags.reduce((n, f) => n + f.points, 0);
  return Math.max(0, Math.min(100, Math.round(sum)));
}

/** Thresholds in the PLA-§2.4 order, else the defaults (a stored value the schema refuses never reaches a band). */
export function thresholdsOrDefault(t: Partial<SignupThresholds> | null | undefined): SignupThresholds {
  const ok =
    !!t &&
    [t.fastLaneMax, t.holdMin, t.rejectCandidateMin].every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100) &&
    t.fastLaneMax! < t.holdMin! &&
    t.holdMin! < t.rejectCandidateMin!;
  return ok ? { fastLaneMax: t.fastLaneMax!, holdMin: t.holdMin!, rejectCandidateMin: t.rejectCandidateMin! } : { ...DEFAULT_THRESHOLDS };
}

/**
 * PLA-§3.4.1: `linked_banned` → reject_candidate whatever the score; else ≥ rejectCandidateMin → reject_candidate;
 * ≥ holdMin → hold; ≤ fastLaneMax → fast; else review.
 */
export function bandFor(score: number, flags: readonly Pick<SignupFlag, "code">[], t: SignupThresholds): SignupBand {
  const th = thresholdsOrDefault(t);
  if (flags.some((f) => f.code === "linked_banned")) return "reject_candidate";
  if (score >= th.rejectCandidateMin) return "reject_candidate";
  if (score >= th.holdMin) return "hold";
  if (score <= th.fastLaneMax) return "fast";
  return "review";
}

/** What auto-approval reads of a score (PLA-§3.4.1). */
export interface ScoredSignup {
  band: SignupBand;
  flags: readonly Pick<SignupFlag, "code">[];
  signals: { inputs: Pick<SignupSignals["inputs"], "turnstile"> };
}

/**
 * PLA-§3.4.1 / PD3 / PD31: true only for `open`, or `approval` with a trusted creator while
 * `signup.trustedCreatorAutoApprove` is on; and the band is `fast`; and no hold-class flag; and the human check is
 * `ok` (or `off`, which `open` refuses: an open platform without a widget never auto-approves). An invite code with
 * `auto_approve` is decided before scoring (core §B.2 step 6), not here.
 */
export function autoApprove(mode: SignupMode, s: ScoredSignup, ctx: { trustedCreator: boolean; setting: Pick<PlatformSetting["signup"], "trustedCreatorAutoApprove"> }): boolean {
  const modeAllows = mode === "open" || (mode === "approval" && ctx.trustedCreator && ctx.setting.trustedCreatorAutoApprove);
  if (!modeAllows || s.band !== "fast" || s.flags.some((f) => HOLD_CLASS.has(f.code))) return false;
  const human = s.signals.inputs.turnstile;
  return human === "ok" || (human === "off" && mode !== "open");
}

/** `console.risk.<code>` (P1's console catalog), rendered with `flag.evidence` as its variables. */
export function explainFlag(flag: Pick<SignupFlag, "code">): MessageKey {
  return `console.risk.${flag.code}`;
}

/** rev 2 (PD52): the counterfactual of a stored score. Pure over the flags and the current thresholds. */
export interface BandExplanation {
  band: SignupBand;
  /** the single flag whose removal would lower the band the most, with the band it would give (null when none changes it) */
  pivot: { code: SignupFlagCode; bandWithout: SignupBand } | null;
  /** hold-class flags present (each alone keeps the row out of auto-approval and the fast lane) */
  holds: SignupFlagCode[];
  /** points to the next lower band boundary (0 for fast, and 0 when `linked_banned` holds the band whatever the score) */
  marginToLower: number;
}

/**
 * PD52's line "Without `disposable_email` this would be `fast`": every flag is removed in turn and the rest re-scored
 * with `bandFor`; the pivot is the removal that lowers the band most (ties: the flag with more points, then the
 * earlier one). Negative flags (an invite code) never lower a band, so they are never the pivot.
 */
export function explainBand(s: { score: number; flags: readonly SignupFlag[] }, t: SignupThresholds): BandExplanation {
  const th = thresholdsOrDefault(t);
  const band = bandFor(s.score, s.flags, th);
  let pivot: BandExplanation["pivot"] = null;
  let pivotPoints = -Infinity;
  let pivotDrop = 0;
  for (let i = 0; i < s.flags.length; i++) {
    const flag = s.flags[i]!;
    const rest = s.flags.filter((_, j) => j !== i);
    const without = bandFor(scoreOf(rest), rest, th);
    const drop = BAND_ORDER[band] - BAND_ORDER[without];
    if (drop > pivotDrop || (drop === pivotDrop && drop > 0 && flag.points > pivotPoints)) {
      pivot = { code: flag.code, bandWithout: without };
      pivotDrop = drop;
      pivotPoints = flag.points;
    }
  }
  const holds = [...new Set(s.flags.filter((f) => HOLD_CLASS.has(f.code)).map((f) => f.code))];
  const forced = s.flags.some((f) => f.code === "linked_banned") && s.score < th.rejectCandidateMin;
  const floor: Record<SignupBand, number> = { fast: Infinity, review: th.fastLaneMax, hold: th.holdMin - 1, reject_candidate: th.rejectCandidateMin - 1 };
  const marginToLower = band === "fast" || forced ? 0 : Math.max(0, s.score - floor[band]);
  return { band, pivot, holds, marginToLower };
}

/** Is `value` a flag code this release knows (stored rows may carry a code a later release removed)? */
export function isSignupFlagCode(value: unknown): value is SignupFlagCode {
  return typeof value === "string" && isCode(value);
}
