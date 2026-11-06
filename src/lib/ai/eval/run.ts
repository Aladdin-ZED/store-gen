/**
 * One family's offline evaluation (P7 AI; ai.md AI-§F.6 "offline", AI-§F.10; AI-07 (1), (5), (6)). Pure and
 * isomorphic over parsed files: `scripts/qa/ai-eval.ts` reads them and prints; test:ai calls it on the committed
 * files for the broken-version check and the scorecard snapshot.
 *
 *   evaluate(recorded, baseline, { only })  recorded runs → finalize / guard → scorers → gate vs the frozen baseline
 *                                           scored the same way; infra failures (and runs over the per-case
 *                                           wall-clock ceiling) are returned apart, never scored as 0
 *   oracleAndNull(baseline)                 the harness self-check before any paid pass (AI-§F.6): the baseline's own
 *                                           outputs scored as a candidate must show no delta to the baseline, and
 *                                           empty outputs must fail. DECISION: the oracle's hard items are reported as
 *                                           baseline findings, not as a broken harness, because the R1 baseline is the
 *                                           library rung, whose own limits (a heuristic screen, a judge that only knows
 *                                           the negatives) the gate measures every candidate against
 *
 * A library baseline whose outputs are already in the finalized shape (the Director families, the script, the brief:
 * `TRUSTED_BASELINE`) is scored as final; the copy, screen and judge baselines go through the same finalize as a
 * candidate. A family without a library rung (analyze) has no baseline scores until its first live cut.
 */
import type { R1Family } from "../prompts/registry";
import type { BaselineFile } from "./baseline";
import { EVAL_SETS } from "./fixtures";
import { gate, type GateResult, type GateThresholds, DEFAULT_THRESHOLDS } from "./gate";
import type { RecordedFile, RecordedRun } from "./recorded";
import { scorecard, type Scorecard } from "./report";
import { aggregate, scoreRun, type EvalScores, type RunScore, type ScoreOpts } from "./scorers";
import type { EvalFixture } from "./types";

export const TRUSTED_BASELINE: ReadonlySet<R1Family> = new Set<R1Family>(["director.plan", "director.critique", "script", "brief"]);

/** The hard wall-clock ceiling of scoring one case (AI-§F.10): over it, the case is an infra failure. */
export const CASE_CEILING_MS = 2_000;

export interface EvalError {
  family: R1Family;
  version: string;
  fixtureId: string;
  run: number;
  error: string;
}

export interface FamilyEval {
  family: R1Family;
  version: string;
  runs: RunScore[];
  errors: EvalError[];
  candidate: EvalScores;
  baseline: EvalScores | null;
  gate: GateResult;
  card: Scorecard;
  /** fixtures of the family the recording has no run for */
  missing: string[];
}

export interface EvalOpts {
  /** score only these fixture ids (a smoke subset, the broken version's 60) */
  only?: ReadonlySet<string>;
  thresholds?: GateThresholds;
  ceilingMs?: number;
  /** the clock the ceiling reads (ms) */
  now?: () => number;
  scoreOpts?: ScoreOpts;
}

const fixturesOf = (family: R1Family): Map<string, EvalFixture> => new Map(EVAL_SETS[family].fixtures.map((f) => [f.id, f]));
const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Scores every recorded run of the file (the fixtures it names that still exist). */
export function scoreRecorded(file: RecordedFile, opts: EvalOpts = {}): { runs: RunScore[]; errors: EvalError[] } {
  const byId = fixturesOf(file.family);
  const now = opts.now ?? clock;
  const ceiling = opts.ceilingMs ?? CASE_CEILING_MS;
  const runs: RunScore[] = [];
  const errors: EvalError[] = [];
  for (const [id, recorded] of Object.entries(file.runs)) {
    if (opts.only && !opts.only.has(id)) continue;
    const f = byId.get(id);
    if (!f) {
      errors.push({ family: file.family, version: file.version, fixtureId: id, run: 0, error: "the fixture no longer exists (stale recording)" });
      continue;
    }
    recorded.forEach((r, i) => {
      const t0 = now();
      const s = scoreRun(f, r, i, { model: file.source.model, ...opts.scoreOpts });
      const ms = now() - t0;
      if (s.status === "error") errors.push({ family: file.family, version: file.version, fixtureId: id, run: i, error: s.error ?? "infra" });
      else if (ms > ceiling) errors.push({ family: file.family, version: file.version, fixtureId: id, run: i, error: `scoring took ${Math.round(ms)} ms, over the ${ceiling} ms ceiling` });
      else runs.push(s);
    });
  }
  return { runs, errors };
}

/** The baseline's outputs as one run per fixture (null when the rung had no output for any fixture). */
export function scoreBaseline(b: BaselineFile, only?: ReadonlySet<string>): EvalScores | null {
  const byId = fixturesOf(b.family);
  const trusted = TRUSTED_BASELINE.has(b.family);
  const runs: RunScore[] = [];
  for (const [id, output] of Object.entries(b.outputs)) {
    if (only && !only.has(id)) continue;
    const f = byId.get(id);
    if (!f || output === null) continue;
    const r: RecordedRun = { output, usage: null, ms: 0, stop: "end_turn" };
    runs.push(scoreRun(f, r, 0, { trusted }));
  }
  return runs.length ? aggregate(b.family, runs) : null;
}

/** The family's evaluation: the recording scored, gated against the baseline, as a scorecard. */
export function evaluate(file: RecordedFile, baseline: BaselineFile | null, opts: EvalOpts = {}): FamilyEval {
  const { runs, errors } = scoreRecorded(file, opts);
  const candidate = aggregate(file.family, runs);
  candidate.errors = errors.length;
  const only = opts.only ?? new Set(Object.keys(file.runs));
  const base = baseline ? scoreBaseline(baseline, only) : null;
  const g = gate(candidate, base, null, opts.thresholds ?? DEFAULT_THRESHOLDS);
  const missing = EVAL_SETS[file.family].fixtures.map((f) => f.id).filter((id) => (!opts.only || opts.only.has(id)) && !file.runs[id]);
  return {
    family: file.family,
    version: file.version,
    runs,
    errors,
    candidate,
    baseline: base,
    gate: g,
    card: scorecard({ family: file.family, version: file.version, baselineVersion: baseline?.version ?? null, fixturesHash: file.fixturesHash, candidate, baseline: base, judge: null, gate: g }),
    missing,
  };
}

/** The oracle (the baseline's own outputs as a candidate) and the null (empty outputs), each gated against the baseline. */
export function oracleAndNull(b: BaselineFile): { oracle: GateResult; null: GateResult } | null {
  const outputs = Object.entries(b.outputs).filter(([, o]) => o !== null);
  if (!outputs.length) return null;
  const trusted = TRUSTED_BASELINE.has(b.family);
  const byId = fixturesOf(b.family);
  const runsOf = (pick: (o: unknown) => unknown) =>
    outputs.flatMap(([id, o]) => {
      const f = byId.get(id);
      return f ? [scoreRun(f, { output: pick(o), usage: null, ms: 0, stop: "end_turn" }, 0, { trusted: trusted && pick(o) !== null })] : [];
    });
  const base = scoreBaseline(b);
  return {
    oracle: gate(aggregate(b.family, runsOf((o) => o)), base, null),
    null: gate(aggregate(b.family, runsOf(() => null)), base, null),
  };
}
