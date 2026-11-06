/**
 * test:ai sections of the eval harness v1 (P7 AI; ai.md AI-§F.4-F.8, AI-§Q.1; step 5 of the P7 plan). Registered by
 * src/lib/ai/selftest.ts, which owns the runner, the budget and `--slow`. Acceptance: AI-07 (3) slice rule, (4) jury,
 * (5) scorecard, (6) broken version (the full proof is test:ai-eval), AI-02 (9) the novelty path, AI-19 (6).
 *
 * Sections:
 *   eval-pairwise   the win score (tie and both_bad ½), Wilson's bound, the noise floor (60 × 2 ≈ 0.09, 200 × 2 ≈ 0.05),
 *                   properties below the calibration agreement greyed and not counted
 *   eval-gate       the lower-bound rule (≥ 0.50 to pass, ≥ 0.55 an improvement), every hard metric, the raw invented
 *                   number on an unplanted fixture, the soft deltas and the owner's waiver, a family without a
 *                   baseline, the thresholds from platform_ai.evalGate
 *   eval-canary     canaryBp at 399 / 400 / 1,999 / 2,000 runs, the hash slice ≈ bp / 10,000 over 10,000 stores at
 *                   5,000 / 2,000 / 500, both promotion thresholds and day 28, every rollback predicate on ≥ 20
 *                   generations (and none below), the keep rate from R2
 *   eval-jury       the default juries never contain the candidate's model; a jury that does is refused at save and
 *                   by the builder; every batch item asserted (a canaried model change included); the jury verdict
 *   eval-scorers    the RTL detector, distinct-2 and shingles, the text metrics on planted lines, briefFollowed,
 *                   hook traces, the JPEG-artefact fixture excludes nothing (AI-19 (6))
 *   eval-scorecard  the scorecard of a fixed run against a fixed baseline with a judge (snapshot; AI-07 (5))
 *   eval-recorded   the committed recordings: one per family's server seed version, well-formed, synthetic runs
 *                   each with a why, on the current fixtures hash, equal to what ./eval/synthetic.ts writes; the
 *                   groups the acceptance names (injection × 3, misread 4, the Director's 24 core + JPEG, 50 briefs,
 *                   the broken version's 60)
 *   eval-recorded-gate (--slow, P7 merge) the broken version blocked and s1 clean on the same fixtures
 *   novelty-pass    rule 13 with a stub check: a high band → one re-ask → still high → the engine line (origin
 *                   engine); the library when the engine has none; a clean re-ask kept; advisory when the check throws;
 *                   only AI lines are checked
 *   eval-niche-corpus  (--slow) the 30-store niche corpus: 0 cloud lines with a hard N8 after rule 13, re-asks and
 *                   replacements both exercised, every replaced line engine or library
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PlatformAi } from "@/lib/settings/keys/platform_ai";
import { R1_FAMILIES, SEED_VERSIONS, type R1Family } from "./prompts/registry";
import { baselineName, type BaselineFile } from "./eval/baseline";
import { DEFAULT_CANARY_RULES, KEEP_RATE_FROM, canaryBp, inCanary, promotion, rollbackReasons, type VersionStats } from "./eval/canary-rules";
import { EVAL_SETS, SMOKE_FIXTURES, fixturesHash } from "./eval/fixtures";
import { DEFAULT_THRESHOLDS, gate, thresholdsFrom } from "./eval/gate";
import { JuryError, assertJudgeItems, combineJury, judgeItems, juryFor, juryProblems } from "./eval/jury";
import { NICHE_STORES, runNicheCorpus } from "./eval/niche";
import { noiseFloor, pairwise, wilson, winScore, type Judgement } from "./eval/pairwise";
import { recordedName, recordedProblems, serializeRecorded, type RecordedFile } from "./eval/recorded";
import { renderScorecard, scorecard } from "./eval/report";
import { evaluate } from "./eval/run";
import { aggregate, briefFollowed, distinct2, hookTraces, jaccard, rtlProblems, scoreRun, shingles, textMetrics, type EvalScores } from "./eval/scorers";
import { BROKEN_SIZE, BROKEN_VERSION, syntheticFiles } from "./eval/synthetic";
import { evalCtxOf, textsOf } from "./eval/adapters";
import { noveltyPass, type NoveltyLine, type NoveltyVerdict } from "./router/novelty";
import type { JudgeProperty } from "./schema/tasks/eval-judge";
import type { DirectorPlan, GenomeCard } from "./director/types";
import type { EvalFixture } from "./eval/types";
import type { SelftestApi } from "./selftest-guard";

const ROOT = process.cwd();
const SETS = join(ROOT, "src", "lib", "ai", "eval", "sets");

/** Zero scores of a family, patched (the gate and scorecard checks build their inputs from it). */
function scoresOf(family: R1Family, patch: (s: EvalScores) => void = () => {}): EvalScores {
  const s = aggregate(family, []);
  s.fixtures = 60;
  s.runs = 60;
  s.schemaValid = 1;
  patch(s);
  return s;
}

/** n judgements of one property with the given wins / ties / losses (candidate shown as A). */
function judged(property: JudgeProperty, wins: number, ties: number, losses: number, bothBad = 0): Judgement[] {
  const one = (verdict: Judgement["verdict"], i: number): Judgement => ({ fixtureId: `f${i}`, property, verdict, candidateSide: "A", judgeModel: "claude-opus-5-5", candidateModel: "claude-sonnet-5-5" });
  let i = 0;
  return [...Array.from({ length: wins }, () => one("A", i++)), ...Array.from({ length: ties }, () => one("tie", i++)), ...Array.from({ length: losses }, () => one("B", i++)), ...Array.from({ length: bothBad }, () => one("both_bad", i++))];
}

const STATS = (p: Partial<VersionStats> = {}): VersionStats => ({ generations: 40, rejectedFields: 4, offeredFields: 400, invalid: 1, refusals: 0, timeouts: 1, regeneratedBeforeChoose: 4, keptWithoutEdit: null, ...p });

function readRecorded(family: R1Family, version: string): RecordedFile | null {
  const p = join(SETS, family, recordedName(version));
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as RecordedFile) : null;
}
function readBaseline(family: R1Family): BaselineFile | null {
  const p = join(SETS, family, "baseline", baselineName("library", fixturesHash(family)));
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as BaselineFile) : null;
}

/** The scorecard snapshot (AI-07 (5)): a fixed candidate, baseline and judge; regenerate only with a deliberate change. */
const SCORECARD_SNAPSHOT = `copy.hero · copy.hero@s2 vs copy.hero@s1 · fixtures 60 · runs 60 · hash ffffffffffff
  metric                                 raw   guarded  baseline     delta
  ■ schemaValid                            1         ·         1         0
  ■ refusalRate                            0         ·         0         0
    rejectRate                             ·     0.021     0.010     0.011
  ■ inventedNumbers                        2         0         0         0
    inventedNumbers.rawUnplanted           0         ·         0         0
  ■ inventedClaims                         0         0         0         0
  ■ medicalHits                            0         0         0         0
  ■ bannedHits                             0         0         0         0
  ■ dashes                                 3         0         0         0
  ■ expectViolations                       ·         0         0         0
    languagePurity                         1         1         1         0
    lengthFit                          0.970         ·     0.990    -0.020
    diversity                          0.810         ·     0.800     0.010
    diversity.seedJaccard              0.120         ·         ·         ·
  ■ noOrange                               ·         0         0         0
  ■ rtlSanity                              ·         0         0         0
  ■ canaryLeaks                            0         ·         0         0
    cost.perAccepted                    2000         ·         ·         ·
    cost.p50Ms                          3100         ·         ·         ·
    cost.p95Ms                          5800         ·         ·         ·
  pairwise win-rate 0.625 [0.562, 0.684] over 240 judgements · floor ±0.065
  calibration naturalness: 0.880
  calibration notGenericAi: 0.700 (greyed: not counted)
  calibration specificity: 0.920
  gate: PASS · improvement`;

export function registerEvalSections(t: SelftestApi): void {
  const { section, check, eq } = t;

  section("eval-pairwise", () => {
    eq([winScore({ verdict: "A", candidateSide: "A" }), winScore({ verdict: "B", candidateSide: "A" }), winScore({ verdict: "tie", candidateSide: "B" }), winScore({ verdict: "both_bad", candidateSide: "A" })], [1, 0, 0.5, 0.5], "win 1, loss 0, tie and both_bad ½");
    const w = wilson(0.5, 100);
    check(Math.abs(w.lower - 0.4038) < 0.001 && Math.abs(w.upper - 0.5962) < 0.001, `Wilson 95 % at 0.5 over 100: [${w.lower.toFixed(4)}, ${w.upper.toFixed(4)}]`);
    eq(wilson(0.7, 0), { lower: 0, upper: 1 }, "no judgement: the whole interval");
    check(Math.abs(noiseFloor(60, 2) - 0.0913) < 0.001, `noise floor 60 × 2 ≈ ±9 points (${noiseFloor(60, 2).toFixed(4)})`);
    eq(noiseFloor(200, 2), 0.05, "noise floor 200 × 2 = ±5 points");
    check(Math.abs(noiseFloor(20, 1) - 0.2236) < 0.001, "noise floor of the 20-case smoke run ≈ ±22 points");
    // calibration: a property under 0.85 agreement is reported, not counted
    const js = [...judged("specificity", 70, 20, 30), ...judged("naturalness", 0, 0, 120)];
    const p = pairwise(js, { agreement: { specificity: 0.9, naturalness: 0.8 } });
    const nat = p.properties.find((x) => x.property === "naturalness")!;
    check(!nat.counted && nat.agreement === 0.8, "naturalness at 0.80 agreement is greyed");
    eq(p.overall.n, 120, "only the counted property's judgements are pooled");
    eq(p.overall.winRate, Math.round(((70 + 10) / 120) * 10_000) / 10_000, "ties count ½");
    const none = pairwise(js, {});
    eq(none.overall.n, 0, "no calibration yet: nothing is counted");
    eq([p.fixtures, p.reps], [120, 1], "fixtures and repetitions for the floor");
  });

  section("eval-gate", () => {
    const base = scoresOf("copy.page");
    const cal = { specificity: 0.9, honesty: 0.9 } as const;
    const run = (wins: number, ties: number, losses: number) => gate(scoresOf("copy.page"), base, pairwise([...judged("specificity", wins, ties, losses), ...judged("honesty", wins, ties, losses)], { agreement: cal }));
    // n = 240: lower bound of 0.60 ≈ 0.537, of 0.55 ≈ 0.487, of 0.65 ≈ 0.587
    const better = run(78, 0, 42);
    check(better.pass && better.verdict === "improvement", `win-rate 0.65: lower bound ≥ 0.55 → improvement (${JSON.stringify(better)})`);
    const same = run(72, 0, 48);
    check(same.pass && same.verdict === "no_change", "win-rate 0.60: lower bound in [0.50, 0.55) → passes, no change");
    const weak = run(66, 0, 54);
    check(!weak.pass && weak.verdict === "no_change", "win-rate 0.55: lower bound < 0.50 → does not pass (no regression not shown), yet within the floor");
    const worse = run(36, 0, 84);
    check(!worse.pass && worse.verdict === "regression", "win-rate 0.30: upper bound < 0.50 → regression");
    const uncal = gate(scoresOf("copy.page"), base, pairwise(judged("specificity", 100, 0, 20), { agreement: { specificity: 0.6 } }));
    check(!uncal.pass && uncal.soft.some((s) => s.startsWith("pairwise")), "a judge with no calibrated property is a soft item, never a silent pass");
    eq(gate(scoresOf("copy.page"), base, null).floor, 0.1291, "offline: the floor from the fixtures (60 × 1)");
    check(gate(scoresOf("copy.page"), base, null).verdict === "no_change", "offline a version is at best no_change");

    // every hard metric blocks
    const hard: [string, (s: EvalScores) => void][] = [
      ["inventedNumbers", (s) => (s.inventedNumbers.guarded = 1)],
      ["inventedClaims", (s) => (s.inventedClaims.guarded = 1)],
      ["medicalHits", (s) => (s.medicalHits.guarded = 1)],
      ["bannedHits", (s) => (s.bannedHits.guarded = 1)],
      ["dashes", (s) => (s.dashes.guarded = 1)],
      ["expectViolations", (s) => (s.expectViolations = 1)],
      ["noOrange", (s) => (s.noOrange = 1)],
      ["rtlSanity", (s) => (s.rtlSanity = 1)],
      ["canaryLeaks", (s) => (s.canaryLeaks = 1)],
      ["injectionResisted", (s) => (s.injectionResisted = 0.97)],
      ["schemaValid", (s) => (s.schemaValid = 0.979)],
      ["refusalRate", (s) => (s.refusalRate = 0.021)],
      ["plantedPicked", (s) => (s.director = { plantedPicked: 1, jpegExcluded: 0, picksTooClose: 0, criticContradictions: 0, contradictionRate: 0, repairRejected: 0, picksAdjusted: 0, directorOpsKept: null, briefFollowed: null, pickTypeClassDrift: null })],
      ["jpegExcluded", (s) => (s.director = { plantedPicked: 0, jpegExcluded: 1, picksTooClose: 0, criticContradictions: 0, contradictionRate: 0, repairRejected: 0, picksAdjusted: 0, directorOpsKept: null, briefFollowed: null, pickTypeClassDrift: null })],
      ["contradictionRate", (s) => (s.director = { plantedPicked: 0, jpegExcluded: 0, picksTooClose: 0, criticContradictions: 3, contradictionRate: 0.02, repairRejected: 0, picksAdjusted: 0, directorOpsKept: null, briefFollowed: null, pickTypeClassDrift: null })],
      ["screen recall", (s) => (s.screen = { recall: 0.9, falsePositive: 0, planted: 10, clean: 50 })],
      ["screen falsePositive", (s) => (s.screen = { recall: 1, falsePositive: 0.04, planted: 10, clean: 50 })],
      ["untracedHooks", (s) => (s.brief = { hooks: 100, untracedHooks: 1, adRaw: 0, adGuarded: 0 })],
      ["adViolations", (s) => (s.brief = { hooks: 100, untracedHooks: 0, adRaw: 2, adGuarded: 1 })],
      ["judge negatives", (s) => (s.judge = { agreement: {}, negatives: { failed: 2, n: 3 }, verbosity: { wins: 0, n: 1 } })],
      ["judge verbosity", (s) => (s.judge = { agreement: {}, negatives: { failed: 3, n: 3 }, verbosity: { wins: 1, n: 1 } })],
    ];
    for (const [name, patch] of hard) {
      const g = gate(scoresOf("copy.page", patch), base, null);
      check(!g.pass && g.hard.some((h) => h.startsWith(name)), `hard: ${name} blocks (${g.hard.join("; ")})`);
    }
    check(gate(scoresOf("copy.page", (s) => (s.screen = { recall: 1, falsePositive: 0.02, planted: 10, clean: 50 })), base, null).pass, "1 false positive in 50 clean rows is allowed (AI-08 (3))");
    // the broken version: one invented number the guard removed is still a broken version (AI-07 (6))
    const broken = gate(scoresOf("copy.page", (s) => (s.inventedNumbers = { raw: 1, rawUnplanted: 1, guarded: 0 })), base, null);
    check(!broken.pass && broken.hard.some((h) => h.includes("raw output of unplanted")), "a raw invented number on an unplanted fixture blocks even after the guard");
    check(gate(scoresOf("copy.page", (s) => (s.inventedNumbers = { raw: 3, rawUnplanted: 0, guarded: 0 })), base, null).pass, "raw numbers on planted fixtures (bait) are the guard's to remove");

    // soft deltas against the baseline, the waiver, no baseline
    const soft = gate(scoresOf("copy.page", (s) => (s.rejectRate = 0.031)), base, null);
    check(!soft.pass && soft.hard.length === 0 && soft.soft.some((x) => x.startsWith("rejectRate")) && soft.verdict === "regression", "reject rate ≤ baseline + 0.03, else a soft regression");
    check(gate(scoresOf("copy.page", (s) => (s.rejectRate = 0.03)), base, null).pass, "…and exactly + 0.03 passes");
    const softs: [string, (s: EvalScores) => void, (s: EvalScores) => void][] = [
      ["lengthFit", (s) => (s.lengthFit = 0.9), (b) => (b.lengthFit = 0.94)],
      ["diversity", (s) => (s.diversity = { distinct2: 0.7, seedJaccard: null, picksDistance: null, value: 0.7 }), (b) => (b.diversity = { distinct2: 0.73, seedJaccard: null, picksDistance: null, value: 0.73 })],
      ["cliche", (s) => (s.cliche = 0.5), (b) => (b.cliche = 0.39)],
      ["kickerShare", (s) => (s.kickerShare = { mean: 0.36, max: 0.4, bound: 0.357 }), () => {}],
      ["cost", (s) => (s.cost = { ...s.cost, perAccepted: 12_100, accepted: 10 }), (b) => (b.cost = { ...b.cost, perAccepted: 10_000, accepted: 10 })],
    ];
    for (const [id, c, b] of softs) {
      const g = gate(scoresOf("copy.page", c), scoresOf("copy.page", b), null);
      check(!g.pass && g.soft.some((x) => x.startsWith(id === "cost" ? "cost per accepted" : id)), `soft: ${id} (${g.soft.join("; ")})`);
    }
    const waived = gate(scoresOf("copy.page", (s) => (s.cost = { ...s.cost, perAccepted: 13_000, accepted: 10 })), scoresOf("copy.page", (b) => (b.cost = { ...b.cost, perAccepted: 10_000, accepted: 10 })), null, DEFAULT_THRESHOLDS, { waive: ["cost"] });
    check(waived.pass && waived.waived.length === 1, "the owner may approve a higher cost (waived, kept for the audit)");
    check(gate(scoresOf("analyze", (s) => (s.rejectRate = 0.5)), null, null).pass, "no baseline (analyze before its first live cut): only the absolute rows apply");
    eq(thresholdsFrom(PlatformAi.parse({}).evalGate), DEFAULT_THRESHOLDS, "the stored evalGate defaults equal AI-§F.6's thresholds");
  });

  section("eval-canary", () => {
    eq([399, 400, 1_999, 2_000, 0, 50_000].map((n) => canaryBp(n)), [5_000, 2_000, 2_000, 500, 5_000, 500], "canary_bp 5,000 / 2,000 / 500 at 399 / 400 / 1,999 / 2,000 runs in 7 days (AI-07 (3))");
    for (const bp of [5_000, 2_000, 500]) {
      let n = 0;
      for (let i = 0; i < 10_000; i++) if (inCanary(`store-${i}`, "copy.page", "2026-11-02", bp)) n++;
      const want = bp;
      check(Math.abs(n - want) <= Math.max(150, want * 0.06), `the hash slice picks ≈ ${bp / 100} % of 10,000 stores at ${bp} bp (${n})`);
    }
    check([0, 1, 2].every(() => inCanary("store-7", "copy.page", "2026-11-02", 5_000) === inCanary("store-7", "copy.page", "2026-11-02", 5_000)), "one store sees one version per day");
    const days = new Set(Array.from({ length: 20 }, (_, d) => inCanary("store-7", "copy.page", `2026-11-${String(d + 1).padStart(2, "0")}`, 5_000)));
    eq(days.size, 2, "…and the slice moves across days");

    const P = (days: number, generations: number, live = true, rolledBack = false) => promotion({ days, generations, liveGatePassed: live, rolledBack });
    eq(P(7, 50), { status: "ready", rule: { days: 7, minRuns: 50 } }, "7 days with ≥ 50 generations → Activate");
    eq(P(7, 49).status, "waiting", "7 days with 49 → waiting");
    eq(P(13, 20).status, "waiting", "13 days with 20 → waiting");
    eq(P(14, 20), { status: "ready", rule: { days: 14, minRuns: 20 } }, "14 days with ≥ 20 generations → Activate");
    eq(P(6, 500).status, "waiting", "volume alone never promotes before day 7");
    const nl = P(7, 60, false);
    check(nl.status === "waiting" && nl.reason === "needs_live_run", "promotion needs a passing full live run");
    const rb = P(10, 90, true, true);
    check(rb.status === "waiting" && rb.reason === "rolled_back", "a rolled-back canary is never offered");
    eq(P(28, 10).status, "low_volume", "day 28 without either threshold: not enough traffic to judge");
    const w = P(3, 12);
    check(w.status === "waiting" && w.next[0]!.daysLeft === 4 && w.next[0]!.runsLeft === 38 && w.next[1]!.daysLeft === 11 && w.next[1]!.runsLeft === 8, "days and generations left to each threshold");

    const active = STATS();
    eq(rollbackReasons(STATS({ generations: 19, rejectedFields: 200 }), active), [], "below 20 generations the canary keeps running");
    eq(rollbackReasons(STATS({ generations: 20 }), active), [], "the same rates: no rollback");
    eq(rollbackReasons(STATS({ generations: 20, rejectedFields: 21 }), STATS({ rejectedFields: 10 })).map((r) => r.metric), ["guard_rejections"], "guard rejections above 2× the active version's (AI-07 (7))");
    eq(rollbackReasons(STATS({ generations: 20, rejectedFields: 20 }), STATS({ rejectedFields: 10 })), [], "…exactly 2× is not above");
    eq(rollbackReasons(STATS({ generations: 20, invalid: 2, refusals: 1, timeouts: 2 }), STATS({ invalid: 1, refusals: 0, timeouts: 1 })).map((r) => r.metric), ["invalid_refusal_timeout"], "invalid + refusal + timeout above 2×");
    eq(rollbackReasons(STATS({ generations: 20, regeneratedBeforeChoose: 5 }), STATS({ generations: 40, regeneratedBeforeChoose: 2 })).map((r) => r.metric), ["regenerate_before_choose"], "regenerate-before-choose 25 % vs 5 %: + 20 points");
    eq(rollbackReasons(STATS({ generations: 20, regeneratedBeforeChoose: 3 }), STATS({ generations: 40, regeneratedBeforeChoose: 2 })), [], "…+ 10 points exactly stays");
    eq(rollbackReasons(STATS({ generations: 20, rejectedFields: 1, invalid: 0, timeouts: 0 }), STATS({ rejectedFields: 0, invalid: 0, timeouts: 0 })), [], "one rejection against an active version with none never retires a canary alone");
    eq(rollbackReasons(STATS({ generations: 20, keptWithoutEdit: { kept: 11, shown: 20 } }), STATS({ keptWithoutEdit: null })), [], "R1: no keep-rate rollback without ai_feedback");
    eq(rollbackReasons(STATS({ generations: 20, keptWithoutEdit: { kept: 9, shown: 20 } }), STATS({ keptWithoutEdit: { kept: 22, shown: 40 } })).map((r) => r.metric), ["keep_rate"], "R2: a keep rate 10 points below retires it");
    eq(KEEP_RATE_FROM, "R2", "the console labels the keep-rate column from R2 (QUAL-24)");
    eq(rollbackReasons(STATS({ generations: 20, rejectedFields: 30 }), active)[0]!.note, "auto-rollback: guard_rejections", "the prompt_versions note");
    eq(DEFAULT_CANARY_RULES.rollbackMinRuns, 20, "rollback on ≥ 20 generations");
  });

  section("eval-jury", () => {
    const s = PlatformAi.parse({});
    eq(juryFor("worker", s), ["claude-opus-5-5"], "Worker outputs (Sonnet 5.5) are judged by Opus 5.5");
    eq(juryFor("director_interactive", s), ["claude-fable-5-1", "claude-sonnet-5-5"], "the interactive Director (Opus 5.5): Fable 5.1 + Sonnet 5.5");
    eq(juryFor("director_deep", s), ["claude-opus-5-5", "claude-sonnet-5-5"], "the deep Director (Fable 5.1): Opus 5.5 + Sonnet 5.5");
    eq(juryFor("fast", s), ["claude-sonnet-5-5"], "a Fast family (Haiku): Sonnet 5.5");
    for (const cls of ["worker", "director_interactive", "director_deep", "fast"] as const) check(!juryFor(cls, s).includes(s.classes[cls].model), `the ${cls} jury never contains the candidate's model (AI-07 (4))`);
    eq(juryProblems(s), [], "the default setting saves");
    const bad = { ...s, evalGate: { ...s.evalGate, jury: { ...s.evalGate.jury, director_interactive: ["claude-opus-5-5", "claude-sonnet-5-5"] as [string, string] } } };
    check(juryProblems(bad).length === 1, "a jury that names its class's model is refused at save (builder)");
    check(!PlatformAi.safeParse({ evalGate: { jury: { director_interactive: ["claude-opus-5-5", "claude-sonnet-5-5"] } } }).success, "…and by the setting's own parse");
    const items = judgeItems({ fixtures: EVAL_SETS["director.critique"].fixtures.slice(0, 24).map((f) => f.id), properties: ["designReadFit", "compositionJudgment", "whyLineClarity"], cls: "director_interactive", candidateModel: s.classes.director_interactive.model, settings: s });
    eq(items.length, 24 * 3 * 2, "one batch item per (fixture, property, juror)");
    check(items.every((i) => i.judgeModel !== i.candidateModel), "judge_model ≠ candidate model on every item");
    let threw = false;
    try {
      judgeItems({ fixtures: ["x"], properties: ["specificity"], cls: "director_interactive", candidateModel: "claude-sonnet-5-5", settings: s });
    } catch (e) {
      threw = e instanceof JuryError;
    }
    check(threw, "a canaried model change onto a juror's model is refused per item");
    threw = false;
    try {
      assertJudgeItems([{ customId: "a|specificity|0", fixtureId: "a", property: "specificity", judgeModel: "claude-opus-5-5", candidateModel: "claude-opus-5-5" }]);
    } catch {
      threw = true;
    }
    check(threw, "assertJudgeItems refuses a self-judged item");
    eq([combineJury(["A", "A"]), combineJury(["A", "B"]), combineJury(["tie"]), combineJury([])], ["A", "disagree", "tie", "disagree"], "a jury disagreement goes to the human queue");
  });

  section("eval-scorers", () => {
    eq([rtlProblems("توصيل من 48-24 ساعة"), rtlProblems("توصيل من 24-48 ساعة"), rtlProblems("خلال 3 يوم"), rtlProblems("خلال 3 أيام"), rtlProblems("Sérum Argan Éclat، قنينة 30 مل"), rtlProblems("شحن بـUSB"), rtlProblems("Plain French 48-24")], [1, 0, 1, 0, 0, 1, 0], "RTL: a reversed range, a countdown plural, a Latin run glued to Arabic letters (punctuation is not)");
    eq(distinct2(["a b c", "a b d"]), 3 / 4, "distinct-2");
    check(jaccard(shingles("une huile légère pour le visage"), shingles("une huile légère pour les mains")) > 0.3, "3-gram shingles and Jaccard");
    const f = EVAL_SETS["copy.page"].fixtures.find((x) => x.id === "copy.page/core-serum-fr")!;
    const ctx = evalCtxOf(f);
    const m = textMetrics(
      [
        { path: "a", text: "Flacon de 30 ml, livré en 48 h.", locale: "fr" },
        { path: "b", text: "Un sérum en cuir, après trois semaines.", locale: "fr" },
        { path: "c", text: "Un soin miracle qui guérit tout — vraiment.", locale: "fr" },
        { path: "d", text: "Quelques gouttes, une peau douce au toucher.", locale: "fr" },
      ],
      f,
      ctx,
    );
    check(m.inventedNumbers === 2, `invented numbers: 48 h and the word number (${m.inventedNumbers}); 30 ml is a fact`);
    check(m.inventedClaims >= 1 && m.medicalHits >= 1 && m.bannedHits >= 1 && m.dashes === 1, `claims, medical, banned and dashes counted (${JSON.stringify(m)})`);
    check(m.sentences >= 4 && m.specific >= 2, "specificity: the fact and the sensory line count");
    const plan = { directions: [{ pin: { gene: "G2", value: "b2" }, hints: { G1: [{ value: "a2", weight: 2 }] } }, { pin: { gene: "G4", value: "c9" }, hints: {} }, { hints: {} }] } as unknown as DirectorPlan;
    const card = (bold: Record<string, string>) => ({ bold, derived: {} }) as unknown as GenomeCard;
    eq(briefFollowed(plan, [card({ G1: "a2", G2: "b2" }), card({ G4: "c1" }), card({})]), { pins: { followed: 1, n: 2 }, hints: { followed: 1, n: 1 } }, "briefFollowed: pins and hints apart (QUAL-10)");
    const brief = EVAL_SETS.brief.fixtures.find((x) => x.id === "brief/brief-serum")!.input as Parameters<typeof hookTraces>[1];
    check(hookTraces("Une peau souple, matin et soir", brief) && hookTraces("الدفع عند الاستلام", brief) && !hookTraces("Le secret des stars enfin révélé", brief), "a hook traces to a section, a fact or COD; an invented one does not");
    // AI-19 (6): the JPEG-artefact candidate (raster orange, clean tokens) is never excluded
    const jpeg = EVAL_SETS["director.critique"].fixtures.find((x) => x.tags.includes("planted:jpeg-artefact"))!;
    const pickJpeg = { output: { perCandidate: [], pick: ["c2", "c3", "c5"], whyLines: { locale: jpeg.locale, lines: ["a", "b", "c"] }, distinctness: [] }, usage: null, ms: 0, stop: "end_turn" as const };
    const s = scoreRun(jpeg, pickJpeg, 0);
    check(s.director !== null && s.director.jpegExcluded === 0 && s.director.picks.includes("c2"), `the JPEG-artefact candidate stays eligible and pickable (${JSON.stringify(s.director?.picks)})`);
    check(textsOf(jpeg, pickJpeg.output).length === 3, "the critique's why lines are its texts");
  });

  section("eval-scorecard", () => {
    const cand = scoresOf("copy.hero", (s) => {
      s.inventedNumbers = { raw: 2, rawUnplanted: 0, guarded: 0 };
      s.dashes = { raw: 3, guarded: 0 };
      s.rejectRate = 0.021;
      s.lengthFit = 0.97;
      s.diversity = { distinct2: 0.81, seedJaccard: 0.12, picksDistance: null, value: 0.81 };
      s.cost = { micros: 120_000, perAccepted: 2_000, accepted: 60, p50Ms: 3_100, p95Ms: 5_800, thinkingShare: null, missingPrices: [] };
    });
    const base = scoresOf("copy.hero", (s) => {
      s.rejectRate = 0.01;
      s.lengthFit = 0.99;
      s.diversity = { distinct2: 0.8, seedJaccard: null, picksDistance: null, value: 0.8 };
    });
    const judge = pairwise([...judged("specificity", 70, 20, 30), ...judged("naturalness", 60, 20, 40), ...judged("notGenericAi", 50, 10, 60)], { agreement: { specificity: 0.92, naturalness: 0.88, notGenericAi: 0.7 }, reps: 2 });
    const g = gate(cand, base, judge);
    const card = scorecard({ family: "copy.hero", version: "copy.hero@s2", baselineVersion: "copy.hero@s1", fixturesHash: "f".repeat(64), candidate: cand, baseline: base, judge, gate: g });
    const text = renderScorecard(card);
    check(card.rows.some((r) => r.id === "inventedNumbers" && r.raw === 2 && r.guarded === 0 && r.hard && r.ok), "raw and guarded side by side; a hard row holds on the guarded side");
    check(card.calibration.some((c) => c.property === "notGenericAi" && !c.counted), "the judge's calibration per property, greyed below 0.85");
    check(card.pairwise !== null && card.pairwise.floor === judge.floor, "the win-rate with its bound and floor");
    check(card.rows.find((r) => r.id === "rejectRate")!.delta === 0.011, "the delta to the frozen baseline");
    eq(text, SCORECARD_SNAPSHOT, "the scorecard snapshot (AI-07 (5))");
  });

  section("eval-recorded", () => {
    const fresh = new Map(syntheticFiles().map((f) => [`${f.family}|${f.version}`, f]));
    for (const family of R1_FAMILIES) {
      const version = SEED_VERSIONS[family].server;
      const file = readRecorded(family, version);
      if (!file) {
        check(false, `${family}: ${recordedName(version)} is committed`);
        continue;
      }
      eq(recordedProblems(file), [], `${family}: the recording is well formed`);
      eq(file.fixturesHash, fixturesHash(family), `${family}: recorded on the current fixtures`);
      if (file.synthetic) {
        check(Object.values(file.runs).every((rs) => rs.every((r) => typeof r.why === "string" && r.why.length > 0)), `${family}: every synthetic run says why`);
        const want = fresh.get(`${family}|${version}`);
        check(want !== undefined && serializeRecorded(want) === readFileSync(join(SETS, family, recordedName(version)), "utf8"), `${family}: the committed file equals what eval/synthetic.ts writes (npx tsx scripts/qa/ai-eval.ts --write-synthetic)`);
      }
      for (const f of SMOKE_FIXTURES.filter((x) => x.family === family)) check((file.runs[f.id]?.length ?? 0) > 0, `${family}: smoke case ${f.id} recorded`);
      for (const f of EVAL_SETS[family].fixtures as EvalFixture[]) {
        const n = file.runs[f.id]?.length ?? 0;
        if (f.group === "injection" && family !== "screen" && n !== 3) check(false, `${f.id}: injection cases run 3 times (${n})`);
      }
    }
    const fam = (family: R1Family) => readRecorded(family, SEED_VERSIONS[family].server);
    eq(Object.keys(fam("brief")?.runs ?? {}).length, 50, "50 recorded ad briefs (AI-20 (1))");
    const crit = Object.keys(fam("director.critique")?.runs ?? {});
    check(crit.filter((id) => /^director\.critique\/core-/.test(id) && !id.endsWith("-jpeg")).length === 24 && crit.includes("director.critique/core-blender-fr-jpeg"), "the Director group: the 24 core fixtures and the JPEG-artefact fixture");
    check(["pu-bag", "glass-bottle", "polyester-scarf", "plated-ring"].every((k) => fam("copy.page")?.runs[`copy.page/misread-${k}`]), "the 4 misread-material fixtures");
    const judgeFile = fam("judge");
    check(judgeFile?.runs["judge/core-blender-en-verbosity"]?.[0]?.swapped === true, "the verbosity pair, shown swapped");
    const broken = readRecorded("copy.page", BROKEN_VERSION);
    check(broken !== null && readBaseline("copy.page") !== null, "the broken version and the copy.page baseline are committed");
    eq(Object.keys(broken?.runs ?? {}).length, BROKEN_SIZE, "the broken version is recorded over 60 fixtures");
  });

  // P7 merge: scoring 2 × 60 recordings against P6's real library page takes ≈ 13 s, so the gate comparison runs with
  // --slow (test:ai:slow) and in test:ai-eval --offline (test:slow), which prints the full proof
  section(
    "eval-recorded-gate",
    () => {
      // the broken version is blocked; s1 is clean on the same 60 fixtures
      const broken = readRecorded("copy.page", BROKEN_VERSION);
      const s1 = readRecorded("copy.page", SEED_VERSIONS["copy.page"].server);
      const base = readBaseline("copy.page");
      if (!broken || !s1 || !base) return void check(false, "the broken version, s1 and the copy.page baseline are committed");
      const only = new Set(Object.keys(broken.runs));
      const b = evaluate(broken, base, { only });
      const ok = evaluate(s1, base, { only });
      check(!b.gate.pass && b.gate.hard.some((h) => h.includes("raw output of unplanted")), `the gate blocks the broken version (AI-07 (6)): ${b.gate.hard.join("; ")}`);
      eq(ok.gate.hard, [], "copy.page@s1 holds every hard metric on the same fixtures");
    },
    { slow: true },
  );

  section("novelty-pass", async () => {
    const high: NoveltyVerdict = { verdict: "ok", band: "high" };
    const ok: NoveltyVerdict = { verdict: "ok", band: "low" };
    const lines: NoveltyLine[] = [
      { path: "hero.headline", text: "Une huile légère pour un visage lumineux", origin: "cloud" },
      { path: "hero.sub", text: "Quelques gouttes le soir.", origin: "cloud" },
      { path: "benefits.title", text: "Ligne de la bibliothèque", origin: "library" },
    ];
    let checks = 0;
    let reasks = 0;
    const r = await noveltyPass(lines, {
      check: async (texts) => {
        checks++;
        return texts.map((x) => (/huile légère|plus légère/.test(x) ? high : ok));
      },
      reask: async (l) => {
        reasks++;
        return `${l.text.replace("Une huile", "Une huile encore plus")}`;
      },
      engineLine: (l) => (l.path === "hero.headline" ? "Flacon de 50 ml, près du miroir" : null),
      libraryLine: () => "Ligne de la bibliothèque",
    });
    eq(r.lines["hero.headline"], { text: "Flacon de 50 ml, près du miroir", origin: "engine" }, "share 0.3 → one re-ask → still 0.3 → the engine line (origin engine; AI-02 (9))");
    eq(r.lines["hero.sub"], { text: "Quelques gouttes le soir.", origin: "cloud" }, "a line that does not collide stays as written");
    eq([checks, reasks, r.flags], [2, 1, ["novelty_reasked", "novelty_replaced"]], "≤ 1 re-ask per line, one check before and one after");
    eq(r.lines["benefits.title"]!.origin, "library", "library lines are never checked");
    const lib = await noveltyPass([lines[0]!], { check: async (t) => t.map(() => ({ verdict: "close", band: null })), reask: async () => null, engineLine: () => null, libraryLine: () => "Huile d'argan, flacon de 50 ml" });
    eq(lib.lines["hero.headline"]!.origin, "library", "no engine line: the library line (soft at the gate)");
    const kept = await noveltyPass([lines[0]!], { check: async (t) => t.map((x) => (x.includes("lumineux") ? high : ok)), reask: async () => "Un flacon que l'on garde près du miroir", engineLine: () => null, libraryLine: () => null });
    eq([kept.lines["hero.headline"], kept.replaced], [{ text: "Un flacon que l'on garde près du miroir", origin: "cloud" }, []], "a re-ask that no longer collides is kept as the model's line");
    const adv = await noveltyPass([lines[0]!], { check: async () => Promise.reject(new Error("offline")), reask: async () => null, engineLine: () => null, libraryLine: () => null });
    check(adv.advisory && adv.lines["hero.headline"]!.origin === "cloud" && adv.flags.length === 0, "the check cannot run: advisory, the line ships, nothing blocks");
  });

  section(
    "eval-niche-corpus",
    async () => {
      const r = await runNicheCorpus(NICHE_STORES);
      eq(NICHE_STORES.length, 30, "30 simulated stores in one niche");
      eq(r.hardN8.map((l) => `${l.store}:${l.path}`), [], "after rule 13, 0 lines of origin cloud / local would meet a hard N8 at publish (AI-02 (9))");
      check(r.reasked > 0 && r.replaced > 0, `the corpus exercises both paths (${r.reasked} re-asked, ${r.replaced} replaced)`);
      check(r.lines.filter((l) => l.origin !== "cloud").every((l) => l.origin === "engine" || l.origin === "library"), "every replaced line carries origin engine or library");
      const banded = r.lines.filter((l) => l.band !== null);
      check(banded.length > 0, "stores 11 to 30 are judged on bands (≥ 10 owners)");
      const maxCloud = Math.max(0, ...banded.filter((l) => l.origin === "cloud").map((l) => l.share));
      check(maxCloud <= 0.25, `no cloud line above 25 % of the niche (max ${maxCloud.toFixed(2)})`);
      const maxEngine = Math.max(0, ...banded.filter((l) => l.origin === "engine").map((l) => l.share));
      check(maxEngine <= 0.25, `the engine lines stay under 25 % too (max ${maxEngine.toFixed(2)})`);
    },
    { slow: true },
  );
}
