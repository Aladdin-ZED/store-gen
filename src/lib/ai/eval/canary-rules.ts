/**
 * The canary of a prompt version (P7 AI; ai.md AI-§F.8, AI-D29; ENGP-14, QUAL-24; AI-07 (3), (7)). Pure and
 * isomorphic; `ai.rollups` (step 8) applies these rules hourly and the console (step 13) shows them.
 *
 *   canaryBp(runs7d)                 the volume-scaled slice: 5,000 bp below 400 runs of the family in the last 7 days,
 *                                    2,000 below 2,000, else 500 (`platform_ai.evalGate.canary`)
 *   inCanary(storeId, family, day, bp)  hash(storeId|family|day) mod 10,000 < bp: a store sees one version per day
 *   rollbackReasons(canary, active)  on ≥ 20 generations of the canary: guard rejections 2×, invalid + refusal +
 *                                    timeout 2×, regenerate-before-choose + 10 points; the keep rate from R2 (AI-12)
 *   promotion(state)                 "Activate" at the earlier of 7 days with ≥ 50 generations or 14 days with ≥ 20,
 *                                    no rollback and a passing full live run; day 28 without either: "not enough
 *                                    traffic to judge" (activate on the offline gate alone, audited, or retire)
 *
 * DECISION (a zero rate): "2× the active version's rate" against an active version that had no rejection would retire
 * a canary on its first one. The comparison floor is one event over the active version's generations (at least the
 * 20 the rule needs), so a single rejection never retires a canary on its own.
 */
import { PlatformAi, type PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { sha256Hex } from "../prompts/sha256";

export type CanaryRules = PlatformAiSetting["evalGate"]["canary"];
export const DEFAULT_CANARY_RULES: CanaryRules = PlatformAi.parse({}).evalGate.canary;

/** The R1 rollback metrics; the keep rate needs `ai_feedback` (AI-12), so the console labels its column "from R2". */
export const KEEP_RATE_FROM = "R2" as const;

/** The canary slice in basis points for a family that ran `runs7d` times in the last 7 days. */
export function canaryBp(runs7d: number, rules: CanaryRules = DEFAULT_CANARY_RULES): number {
  const rows = [...rules.bpByWeeklyRuns].sort((a, b) => a.below - b.below);
  for (const r of rows) if (runs7d < r.below) return r.bp;
  return rules.bpDefault;
}

/** The bucket 0-9,999 of one (store, family, day): the first 8 hex of sha256, mod 10,000. */
export function canaryBucket(storeId: string, family: string, day: string): number {
  return parseInt(sha256Hex(`${storeId}|${family}|${day}`).slice(0, 8), 16) % 10_000;
}

/** The router's pick: this store runs the canary version of the family today. `day` is "YYYY-MM-DD" (UTC). */
export function inCanary(storeId: string, family: string, day: string, bp: number): boolean {
  return canaryBucket(storeId, family, day) < bp;
}

/** One version's online counts over the canary period (from `ai_runs`; `keptWithoutEdit` from `ai_feedback`, R2). */
export interface VersionStats {
  generations: number;
  /** guard rejections and the fields offered to the guard */
  rejectedFields: number;
  offeredFields: number;
  invalid: number;
  refusals: number;
  timeouts: number;
  /** a `nonce` run on the same `input_hash` inside one wizard session, before a choice */
  regeneratedBeforeChoose: number;
  /** hero fields kept without an edit, of those shown (R2, AI-12); null in R1 */
  keptWithoutEdit: { kept: number; shown: number } | null;
}

export type RollbackMetric = "guard_rejections" | "invalid_refusal_timeout" | "regenerate_before_choose" | "keep_rate";

export interface RollbackReason {
  metric: RollbackMetric;
  /** "auto-rollback: <metric>" for `prompt_versions.notes` */
  note: string;
  canary: number;
  active: number;
}

const rate = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Why the canary must be retired now (empty: keep it running); nothing below `rollbackMinRuns` generations. */
export function rollbackReasons(canary: VersionStats, active: VersionStats, rules: CanaryRules = DEFAULT_CANARY_RULES): RollbackReason[] {
  if (canary.generations < rules.rollbackMinRuns) return [];
  const out: RollbackReason[] = [];
  const floor = (eventsPer: number) => 1 / Math.max(rules.rollbackMinRuns, eventsPer);
  const push = (metric: RollbackMetric, c: number, a: number) => out.push({ metric, note: `auto-rollback: ${metric}`, canary: Math.round(c * 10_000) / 10_000, active: Math.round(a * 10_000) / 10_000 });

  const cRej = rate(canary.rejectedFields, canary.offeredFields);
  const aRej = rate(active.rejectedFields, active.offeredFields);
  if (cRej > 2 * Math.max(aRej, floor(active.offeredFields))) push("guard_rejections", cRej, aRej);

  const fails = (s: VersionStats) => rate(s.invalid + s.refusals + s.timeouts, s.generations);
  if (fails(canary) > 2 * Math.max(fails(active), floor(active.generations))) push("invalid_refusal_timeout", fails(canary), fails(active));

  const regen = (s: VersionStats) => rate(s.regeneratedBeforeChoose, s.generations);
  if (regen(canary) > regen(active) + 0.1) push("regenerate_before_choose", regen(canary), regen(active));

  // R2 (AI-12): only when both versions have keep data
  if (canary.keptWithoutEdit && active.keptWithoutEdit && canary.keptWithoutEdit.shown > 0 && active.keptWithoutEdit.shown > 0) {
    const ck = rate(canary.keptWithoutEdit.kept, canary.keptWithoutEdit.shown);
    const ak = rate(active.keptWithoutEdit.kept, active.keptWithoutEdit.shown);
    if (ck < ak - 0.1) push("keep_rate", ck, ak);
  }
  return out;
}

export interface CanaryState {
  /** whole days since the canary started */
  days: number;
  generations: number;
  rolledBack: boolean;
  /** a passing full `live` eval run, ≤ 14 days old, on the family's current fixtures hash (AI-§F.6) */
  liveGatePassed: boolean;
}

export type Promotion =
  | { status: "ready"; rule: { days: number; minRuns: number } }
  | { status: "waiting"; reason: "rolled_back" | "needs_live_run" | "collecting"; next: { days: number; minRuns: number; daysLeft: number; runsLeft: number }[] }
  | { status: "low_volume" };

/** Whether "Activate" is offered, and what is left before it is. */
export function promotion(s: CanaryState, rules: CanaryRules = DEFAULT_CANARY_RULES): Promotion {
  const met = rules.promote.find((p) => s.days >= p.days && s.generations >= p.minRuns);
  const next = rules.promote.map((p) => ({ ...p, daysLeft: Math.max(0, p.days - s.days), runsLeft: Math.max(0, p.minRuns - s.generations) }));
  if (s.rolledBack) return { status: "waiting", reason: "rolled_back", next };
  if (met && s.liveGatePassed) return { status: "ready", rule: { days: met.days, minRuns: met.minRuns } };
  if (met) return { status: "waiting", reason: "needs_live_run", next };
  if (s.days >= rules.lowVolumeReviewDays) return { status: "low_volume" };
  return { status: "waiting", reason: "collecting", next };
}
