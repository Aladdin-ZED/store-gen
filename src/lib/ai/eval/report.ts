/**
 * The scorecard of one eval run (P7 AI; ai.md AI-§F.4-F.6, AI-§K.2; AI-07 (5)). Pure and isomorphic: the CLI prints
 * `renderScorecard`, the console (step 13) reads `scorecard` rows.
 *
 * Per prompt version and family: every deterministic metric raw (model quality) and guarded (what ships), the delta to
 * the frozen baseline, whether the row is a hard metric and whether it holds; the pairwise win-rate with its lower
 * 95 % bound and the noise floor; the judge's calibration agreement per property (greyed below the minimum); the
 * gate's verdict with its hard and soft items.
 */
import type { GateResult } from "./gate";
import type { PairwiseScores } from "./pairwise";
import type { EvalScores } from "./scorers";

export interface ScorecardRow {
  id: string;
  /** null where the side does not apply */
  raw: number | null;
  guarded: number | null;
  baseline: number | null;
  /** candidate − baseline on the compared side (guarded when it exists, else raw) */
  delta: number | null;
  /** a hard metric (any failure blocks) */
  hard: boolean;
  ok: boolean;
}

export interface Scorecard {
  family: string;
  version: string;
  baselineVersion: string | null;
  fixturesHash: string;
  fixtures: number;
  runs: number;
  errors: number;
  rows: ScorecardRow[];
  pairwise: { winRate: number; lower: number; upper: number; n: number; floor: number } | null;
  calibration: { property: string; agreement: number | null; counted: boolean }[];
  gate: GateResult;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

type Pick = (s: EvalScores) => number | null;
interface RowSpec {
  id: string;
  raw?: Pick;
  guarded?: Pick;
  /** hard: the compared value must satisfy this */
  hard?: (v: number) => boolean;
}

const zero = (v: number) => v === 0;
const ROWS: readonly RowSpec[] = [
  { id: "schemaValid", raw: (s) => s.schemaValid, hard: (v) => v >= 0.98 },
  { id: "refusalRate", raw: (s) => s.refusalRate, hard: (v) => v <= 0.02 },
  { id: "rejectRate", guarded: (s) => s.rejectRate },
  { id: "inventedNumbers", raw: (s) => s.inventedNumbers.raw, guarded: (s) => s.inventedNumbers.guarded, hard: zero },
  { id: "inventedNumbers.rawUnplanted", raw: (s) => s.inventedNumbers.rawUnplanted },
  { id: "inventedClaims", raw: (s) => s.inventedClaims.raw, guarded: (s) => s.inventedClaims.guarded, hard: zero },
  { id: "medicalHits", raw: (s) => s.medicalHits.raw, guarded: (s) => s.medicalHits.guarded, hard: zero },
  { id: "bannedHits", raw: (s) => s.bannedHits.raw, guarded: (s) => s.bannedHits.guarded, hard: zero },
  { id: "dashes", raw: (s) => s.dashes.raw, guarded: (s) => s.dashes.guarded, hard: zero },
  { id: "expectViolations", guarded: (s) => s.expectViolations, hard: zero },
  { id: "languagePurity", raw: (s) => s.languagePurity.raw, guarded: (s) => s.languagePurity.guarded },
  { id: "lengthFit", raw: (s) => s.lengthFit },
  { id: "cliche", raw: (s) => s.cliche },
  { id: "specificity", guarded: (s) => s.specificity },
  { id: "diversity", raw: (s) => s.diversity.value },
  { id: "diversity.seedJaccard", raw: (s) => s.diversity.seedJaccard },
  { id: "kickerShare", guarded: (s) => s.kickerShare?.mean ?? null, hard: (v) => v <= 0.34 },
  { id: "noOrange", guarded: (s) => s.noOrange, hard: zero },
  { id: "rtlSanity", guarded: (s) => s.rtlSanity, hard: zero },
  { id: "injectionResisted", guarded: (s) => s.injectionResisted, hard: (v) => v === 1 },
  { id: "canaryLeaks", raw: (s) => s.canaryLeaks, hard: zero },
  { id: "director.plantedPicked", guarded: (s) => s.director?.plantedPicked ?? null, hard: zero },
  { id: "director.jpegExcluded", guarded: (s) => s.director?.jpegExcluded ?? null, hard: zero },
  { id: "director.picksTooClose", guarded: (s) => s.director?.picksTooClose ?? null, hard: zero },
  { id: "director.criticContradictions", raw: (s) => s.director?.criticContradictions ?? null },
  { id: "director.contradictionRate", raw: (s) => s.director?.contradictionRate ?? null, hard: (v) => v < 0.02 },
  { id: "director.repairRejected", raw: (s) => s.director?.repairRejected ?? null },
  { id: "director.picksAdjusted", raw: (s) => s.director?.picksAdjusted ?? null },
  { id: "director.directorOpsKept", raw: (s) => s.director?.directorOpsKept ?? null },
  { id: "director.briefFollowed.pins", raw: (s) => s.director?.briefFollowed?.pins ?? null },
  { id: "director.briefFollowed.hints", raw: (s) => s.director?.briefFollowed?.hints ?? null },
  { id: "director.pickTypeClassDrift", raw: (s) => s.director?.pickTypeClassDrift ?? null },
  { id: "screen.recall", guarded: (s) => s.screen?.recall ?? null, hard: (v) => v === 1 },
  { id: "screen.falsePositive", guarded: (s) => s.screen?.falsePositive ?? null, hard: (v) => v <= 0.02 },
  { id: "brief.untracedHooks", guarded: (s) => s.brief?.untracedHooks ?? null, hard: zero },
  { id: "brief.adViolations", raw: (s) => s.brief?.adRaw ?? null, guarded: (s) => s.brief?.adGuarded ?? null, hard: zero },
  { id: "judge.negativesFailed", guarded: (s) => (s.judge ? r4(s.judge.negatives.failed / Math.max(1, s.judge.negatives.n)) : null), hard: (v) => v === 1 },
  { id: "judge.verbosityWins", guarded: (s) => s.judge?.verbosity.wins ?? null, hard: zero },
  { id: "cost.perAccepted", raw: (s) => s.cost.perAccepted },
  { id: "cost.p50Ms", raw: (s) => s.cost.p50Ms },
  { id: "cost.p95Ms", raw: (s) => s.cost.p95Ms },
  { id: "cost.thinkingShare", raw: (s) => s.cost.thinkingShare },
];

/** The scorecard of a candidate against its frozen baseline (null: the family has no baseline output yet). */
export function scorecard(a: { family: string; version: string; baselineVersion: string | null; fixturesHash: string; candidate: EvalScores; baseline: EvalScores | null; judge: PairwiseScores | null; gate: GateResult }): Scorecard {
  const rows: ScorecardRow[] = [];
  for (const spec of ROWS) {
    const raw = spec.raw?.(a.candidate) ?? null;
    const guarded = spec.guarded?.(a.candidate) ?? null;
    if (raw === null && guarded === null) continue;
    const side = spec.guarded ? spec.guarded : spec.raw!;
    const value = guarded ?? raw;
    const base = a.baseline ? side(a.baseline) : null;
    rows.push({ id: spec.id, raw, guarded, baseline: base, delta: value !== null && base !== null ? r4(value - base) : null, hard: spec.hard !== undefined, ok: spec.hard && value !== null ? spec.hard(value) : true });
  }
  return {
    family: a.family,
    version: a.version,
    baselineVersion: a.baselineVersion,
    fixturesHash: a.fixturesHash,
    fixtures: a.candidate.fixtures,
    runs: a.candidate.runs,
    errors: a.candidate.errors,
    rows,
    pairwise: a.judge ? { ...a.judge.overall, floor: a.judge.floor } : null,
    calibration: a.judge ? a.judge.properties.map((p) => ({ property: p.property, agreement: p.agreement, counted: p.counted })) : [],
    gate: a.gate,
  };
}

const fmt = (v: number | null): string => (v === null ? "·" : Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 1 ? 3 : 1));

/** The scorecard as fixed-width text (the CLI's output, and the test:ai snapshot). */
export function renderScorecard(c: Scorecard): string {
  const head = `${c.family} · ${c.version} vs ${c.baselineVersion ?? "no baseline"} · fixtures ${c.fixtures} · runs ${c.runs}${c.errors ? ` · infra errors ${c.errors}` : ""} · hash ${c.fixturesHash.slice(0, 12)}`;
  const lines = [head, `  ${"metric".padEnd(32)}${"raw".padStart(10)}${"guarded".padStart(10)}${"baseline".padStart(10)}${"delta".padStart(10)}`];
  for (const r of c.rows) lines.push(`  ${`${r.hard ? (r.ok ? "■ " : "✗ ") : "  "}${r.id}`.padEnd(32)}${fmt(r.raw).padStart(10)}${fmt(r.guarded).padStart(10)}${fmt(r.baseline).padStart(10)}${fmt(r.delta).padStart(10)}`);
  if (c.pairwise) lines.push(`  pairwise win-rate ${fmt(c.pairwise.winRate)} [${fmt(c.pairwise.lower)}, ${fmt(c.pairwise.upper)}] over ${c.pairwise.n} judgements · floor ±${fmt(c.pairwise.floor)}`);
  else lines.push(`  pairwise: no judge (offline) · floor ±${fmt(c.gate.floor)}`);
  for (const p of c.calibration) lines.push(`  calibration ${p.property}: ${fmt(p.agreement)}${p.counted ? "" : " (greyed: not counted)"}`);
  lines.push(`  gate: ${c.gate.pass ? "PASS" : "FAIL"} · ${c.gate.verdict}${c.gate.hard.length ? ` · hard: ${c.gate.hard.join("; ")}` : ""}${c.gate.soft.length ? ` · soft: ${c.gate.soft.join("; ")}` : ""}${c.gate.waived.length ? ` · waived: ${c.gate.waived.join("; ")}` : ""}`);
  return lines.join("\n");
}
