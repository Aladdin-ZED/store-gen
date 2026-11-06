/**
 * The paired win-rate of a candidate version against the frozen baseline (P7 AI; ai.md AI-§F.5, AI-§F.6; AI-07 (4),
 * (5), (6)). Isomorphic and pure.
 *
 * One judgement compares the candidate's output with the baseline's output of the same fixture on one atomic
 * property. Scored from the candidate's side: a win 1, a tie ½, a loss 0, and `both_bad` ½ (neither is preferred;
 * the human review queue reads them, so they are counted apart too). The rate is the mean score; its 95 % interval
 * is Wilson's score interval at that rate over the n judgements (with ties a fractional count: the binomial variance
 * p(1 − p) is then an upper bound, so the bound is conservative). The noise floor is the spec's ≈ 1 / sqrt(n · reps)
 * half-width (n fixtures, reps repetitions): a change smaller than the floor is "no change", never "better".
 *
 * Properties whose judge agreed with the human calibration labels less than `minAgreement` (0.85, `platform_ai.
 * evalGate.minJudgeAgreement`) are greyed: reported, not counted.
 */
import type { JudgeProperty } from "../schema/tasks/eval-judge";

export type Verdict = "A" | "B" | "tie" | "both_bad";

export interface Judgement {
  fixtureId: string;
  property: JudgeProperty;
  /** the judge's verdict on the shown order */
  verdict: Verdict;
  /** which side the candidate was shown on (the order is randomised per case) */
  candidateSide: "A" | "B";
  judgeModel: string;
  candidateModel: string;
}

/** The candidate's score in one judgement: win 1, tie or both_bad ½, loss 0. */
export function winScore(j: Pick<Judgement, "verdict" | "candidateSide">): 0 | 0.5 | 1 {
  if (j.verdict === "tie" || j.verdict === "both_bad") return 0.5;
  return j.verdict === j.candidateSide ? 1 : 0;
}

const Z95 = 1.959964;

/** Wilson's score interval for a rate p over n trials (95 %); [0, 1] when n = 0. */
export function wilson(p: number, n: number, z = Z95): { lower: number; upper: number } {
  if (n <= 0) return { lower: 0, upper: 1 };
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const d = 1 + z2 / n;
  return { lower: Math.max(0, (centre - half) / d), upper: Math.min(1, (centre + half) / d) };
}

/** The noise floor of a pass-rate delta: ≈ 1 / sqrt(n · reps) (60 × 2 ≈ 0.09, 200 × 2 ≈ 0.05, 20 × 1 ≈ 0.22). */
export function noiseFloor(n: number, reps: number): number {
  return n > 0 && reps > 0 ? 1 / Math.sqrt(n * reps) : 1;
}

export interface PairwiseProperty {
  property: JudgeProperty;
  n: number;
  wins: number;
  ties: number;
  losses: number;
  bothBad: number;
  winRate: number;
  lower: number;
  upper: number;
  /** the judge's calibration agreement for the property (null = not calibrated yet) */
  agreement: number | null;
  /** counted in the gate (agreement ≥ the minimum) */
  counted: boolean;
}

export interface PairwiseScores {
  properties: PairwiseProperty[];
  /** pooled over the counted properties */
  overall: { n: number; winRate: number; lower: number; upper: number };
  /** fixtures judged and repetitions: the noise floor's n and reps */
  fixtures: number;
  reps: number;
  floor: number;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export interface PairwiseOpts {
  /** the judge's calibration agreement per property (AI-§F.5) */
  agreement?: Partial<Record<JudgeProperty, number>>;
  /** default 0.85 */
  minAgreement?: number;
  /** repetitions per (fixture, property); default: judgements per (fixture, property), rounded down */
  reps?: number;
}

/** The win-rate with its bound and floor, per property and pooled over the counted ones. */
export function pairwise(judgements: readonly Judgement[], opts: PairwiseOpts = {}): PairwiseScores {
  const min = opts.minAgreement ?? 0.85;
  const by = new Map<JudgeProperty, Judgement[]>();
  for (const j of judgements) by.set(j.property, [...(by.get(j.property) ?? []), j]);
  const properties: PairwiseProperty[] = [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([property, js]) => {
      const scores = js.map(winScore);
      const winRate = scores.reduce<number>((a, b) => a + b, 0) / js.length;
      const { lower, upper } = wilson(winRate, js.length);
      const agreement = opts.agreement?.[property] ?? null;
      return {
        property,
        n: js.length,
        wins: scores.filter((s) => s === 1).length,
        losses: scores.filter((s) => s === 0).length,
        ties: js.filter((j) => j.verdict === "tie").length,
        bothBad: js.filter((j) => j.verdict === "both_bad").length,
        winRate: r4(winRate),
        lower: r4(lower),
        upper: r4(upper),
        agreement,
        counted: agreement === null ? false : agreement >= min,
      };
    });
  const counted = judgements.filter((j) => properties.find((p) => p.property === j.property)?.counted);
  const n = counted.length;
  const winRate = n ? counted.map(winScore).reduce<number>((a, b) => a + b, 0) / n : 0.5;
  const { lower, upper } = wilson(winRate, n);
  const fixtures = new Set(judgements.map((j) => j.fixtureId)).size;
  const pairs = new Set(judgements.map((j) => `${j.fixtureId}|${j.property}`)).size;
  const reps = opts.reps ?? (pairs ? Math.max(1, Math.floor(judgements.length / pairs)) : 1);
  return { properties, overall: { n, winRate: r4(winRate), lower: r4(lower), upper: r4(upper) }, fixtures, reps, floor: r4(noiseFloor(fixtures, reps)) };
}
