import "server-only";
/**
 * Live and smoke eval runs (P7 AI; ai.md AI-§F.5, AI-§F.6 "Runs", AI-§F.10; AI-07 (3), (4), (7)). Manual: the console
 * "Run eval" (step 13) and `scripts/qa/ai-eval.ts --live | --smoke`; they need the key and spend real money, so the
 * estimate always comes first and every call counts against the platform cap (`ai_cost_micros`).
 *
 *   estimateEvalRun(req, settings)   items, reps, judge items and the cost: "200 items × 2 reps · about $24 · ~2 h"
 *   startEvalRun(ctx, req)           (1) the estimate; (2) the oracle (the frozen baseline's own outputs) and the null
 *                                    (empty outputs) pushed through the whole pipeline first: the run stops when the
 *                                    oracle differs from the baseline or the null passes (the harness is broken);
 *                                    (3) the `ai_eval_runs` row; (4) `smoke`: the committed smoke cases × 1 rep as
 *                                    interactive calls plus ≤ 40 judgements, scored at once (≤ 1 h); `live`: ≤ 200
 *                                    cases × 2 reps queued as Batches items (0.5×), scored by `progressEvalRun`
 *   progressEvalRun(id)              (the batch ingest calls it) once every candidate item is in, the judge items: one
 *                                    per fixture × property × juror, the A/B order randomised per case, the jury of
 *                                    AI-§F.5, judge ≠ candidate asserted on every item; once they are in, the scores,
 *                                    the pairwise win-rate, the gate and the row
 * The candidate runs on the fixture stores (their policies, voice and memory: the same store layer a seller's run has),
 * never on a real store.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { newId } from "@/lib/db/ids";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { getPlatformSetting } from "@/lib/settings";
import { effectivePrices, type PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { queuePlatformItem, payloadOf } from "../batch/queue";
import { evalItems } from "../platform/batches";
import { getEvalRun, insertEvalRun, updateEvalRun, type EvalRunRow } from "../platform/eval-runs";
import { assemble } from "../prompts/assemble";
import { PROMPTS, promptFor, type R1Family } from "../prompts/registry";
import { sha256Hex } from "../prompts/sha256";
import type { PromptVersion } from "../prompts/types";
import { costMicros, estimate } from "../quota/cost";
import { AiQuotaError, reconcile, release, reserve } from "../quota/reserve";
import type { JudgeInput, JudgeProperty } from "../schema/tasks/eval-judge";
import { callClaude } from "../server/call";
import { anthropic } from "../server/client";
import { TASKS, routeFor, type AiTaskId, type TaskClass } from "../tasks";
import { productOf, textsOf } from "./adapters";
import { libraryBaseline } from "./baseline";
import { EVAL_SETS, fixtureStoreId, fixturesHash, storeCtxOf, withPhotos } from "./fixtures";
import { gate, thresholdsFrom, type GateResult } from "./gate";
import { juryFor } from "./jury";
import { JUDGE_PROPERTIES_OF, LIVE_MAX_CASES, LIVE_REPS, SMOKE_MAX_JUDGEMENTS, judgePlan, sideOf } from "./live-plan";
import { pairwise, type Judgement, type PairwiseScores, type Verdict } from "./pairwise";
import type { RecordedFile, RecordedRun, StopReason } from "./recorded";
import { oracleAndNull, scoreBaseline } from "./run";
import { aggregate, scoreRun, type EvalScores } from "./scorers";
import type { EvalFixture } from "./types";

export interface EvalRunRequest {
  family: R1Family;
  kind: "smoke" | "live";
  /** the server prompt version under test ("copy.page@s2") */
  version: string;
  /** at most this many cases (a dry run, the test harness) */
  limit?: number;
}

export interface EvalEstimate {
  cases: number;
  reps: number;
  candidateItems: number;
  judgeItems: number;
  micros: number;
  usd: number;
  /** "200 items × 2 reps · about $24 · results in ~2 h" */
  line: string;
}

/** The candidate of a request: its task, class, model and prompt (null when the version is not a server prompt of the family). */
function candidateOf(req: EvalRunRequest, settings: PlatformAiSetting): { task: AiTaskId; cls: TaskClass; model: string; p: PromptVersion } | null {
  const p = PROMPTS[req.version] as PromptVersion | undefined;
  if (!p || p.family !== req.family || p.provider !== "server") return null;
  const task = p.task as AiTaskId;
  const cls = TASKS[task].class;
  if (!cls) return null;
  return { task, cls, model: settings.classes[cls].model, p };
}

function casesOf(req: EvalRunRequest, settings: PlatformAiSetting): EvalFixture[] {
  const all = EVAL_SETS[req.family].fixtures;
  const set = req.kind === "smoke" ? all.filter((f) => f.smoke).slice(0, settings.evalGate.smokeCases) : all.slice(0, LIVE_MAX_CASES);
  return req.limit ? set.slice(0, req.limit) : [...set];
}

export function estimateEvalRun(req: EvalRunRequest, settings: PlatformAiSetting): EvalEstimate | null {
  const c = candidateOf(req, settings);
  if (!c) return null;
  const cases = casesOf(req, settings);
  const reps = req.kind === "smoke" ? 1 : LIVE_REPS;
  const batch = req.kind === "live";
  const prices = effectivePrices(settings.prices).rows;
  let micros = 0;
  for (const f of cases) micros += estimate(c.task, f.input, { batch, fast: false, model: c.model, prices }).micros * reps;
  const jury = juryFor(c.cls, settings, c.model);
  const props = JUDGE_PROPERTIES_OF[req.family].length;
  const judgeItems = Math.min(req.kind === "smoke" ? SMOKE_MAX_JUDGEMENTS : Infinity, cases.length * props * jury.length);
  for (const m of jury) micros += estimate("eval.judge", null, { batch, fast: false, model: m, prices }).micros * Math.ceil(judgeItems / jury.length);
  const usd = micros / 1e6;
  return { cases: cases.length, reps, candidateItems: cases.length * reps, judgeItems, micros, usd, line: `${cases.length} items × ${reps} reps · about $${usd < 10 ? usd.toFixed(2) : Math.round(usd)} · results in ~${req.kind === "smoke" ? "1 h" : "2 h"}` };
}

/** The harness self-check of AI-§F.6 before any paid pass: the oracle must match its baseline, the null must fail. */
export function harnessCheck(family: R1Family): { ok: true } | { ok: false; why: string } {
  const on = oracleAndNull(libraryBaseline(family));
  if (!on) return { ok: true };
  if (on.oracle.soft.length) return { ok: false, why: `oracle_differs: ${on.oracle.soft.join("; ").slice(0, 150)}` };
  if (on.null.pass) return { ok: false, why: "null_passes" };
  return { ok: true };
}

const evalCtx = () => systemCtx("ai.eval");

/** A fixture ready to send (an analyze case's photos read from the repo; a case whose photo is missing is skipped). */
function sendable(f: EvalFixture): EvalFixture | null {
  if (!f.photos?.length) return f;
  try {
    return withPhotos(f, (p) => new Uint8Array(readFileSync(path.join(process.cwd(), p))));
  } catch {
    return null;
  }
}

/** One interactive candidate or judge call, paid from the platform month (smoke runs). */
async function interactiveCall(task: AiTaskId, model: string, p: PromptVersion, f: EvalFixture, input: unknown, settings: PlatformAiSetting): Promise<{ run: RecordedRun; micros: number }> {
  const client = await anthropic();
  if (!client) return { run: { output: null, usage: null, ms: 0, stop: "end_turn", error: "no_key" }, micros: 0 };
  const prices = effectivePrices(settings.prices).rows;
  const prompt = assemble(systemScope(evalCtx(), fixtureStoreId(f.store)), p, input as never, storeCtxOf(f), { platformTtl: settings.cacheTtl.platform });
  const route = TASKS[task].class ? routeFor(task, settings) : { effort: TASKS[task].effort ?? "high", maxTokens: TASKS[task].maxTokens ?? 4_000 };
  let r;
  try {
    r = await reserve("platform", estimate(task, input, { batch: false, fast: false, model, prices }), newId(), { task, payer: "platform" });
  } catch (err) {
    return { run: { output: null, usage: null, ms: 0, stop: "end_turn", error: err instanceof AiQuotaError ? err.code : "reserve" }, micros: 0 };
  }
  const started = Date.now();
  try {
    const res = await callClaude(
      { task, class: TASKS[task].class ?? "worker", model, effort: route.effort, maxTokens: route.maxTokens, pattern: "A", system: prompt.system, messages: prompt.messages, ...(prompt.format ? { format: prompt.format } : {}), stream: false, fallbacks: false, fast: false, deadlineMs: 90_000 },
      { client, callShape: settings.callShape },
    );
    const micros = costMicros(res.iterations, prices, { batch: false, fast: false, writeTtl: settings.cacheTtl.platform }).micros;
    await reconcile(r, { micros, credits: Math.ceil(micros / 10_000) });
    const usage = { model: res.servedModel, inTok: res.iterations.reduce((n, i) => n + i.inTok, 0), outTok: res.iterations.reduce((n, i) => n + i.outTok, 0), cacheReadTok: res.iterations.reduce((n, i) => n + i.cacheReadTok, 0) };
    const stop = (res.stopReason === "refusal" || res.stopReason === "max_tokens" ? res.stopReason : "end_turn") as StopReason;
    return { run: { output: stop === "end_turn" ? (prompt.format ? res.parsed : res.text) : null, usage, ms: res.ms || Date.now() - started, stop, ...(prompt.canary ? { canary: prompt.canary } : {}) }, micros };
  } catch (err) {
    await release(r);
    return { run: { output: null, usage: null, ms: Date.now() - started, stop: "end_turn", error: err instanceof Error ? err.message.slice(0, 120) : "error" }, micros: 0 };
  }
}

/** The texts a judge compares (each line "path: text"), bounded. */
function judgeText(f: EvalFixture, value: unknown): string {
  return textsOf(f, value)
    .map((t) => `${t.path}: ${t.text}`)
    .join("\n")
    .slice(0, 40_000);
}

function judgeInputOf(family: R1Family, property: JudgeProperty, f: EvalFixture, candidate: unknown, baseline: unknown, side: "A" | "B"): JudgeInput {
  const prod = productOf(f);
  const brief = `${prod.name}${prod.facts.length ? ` · ${prod.facts.join(" · ")}` : ""}`.slice(0, 4_000);
  const c = judgeText(f, candidate);
  const b = judgeText(f, baseline);
  return { family, property, locale: f.locale, fixture: { id: f.id.slice(0, 64), brief }, a: side === "A" ? c : b, b: side === "A" ? b : c };
}

const verdictOf = (v: unknown): Verdict | null => {
  const x = (v as { verdict?: unknown } | null)?.verdict;
  return x === "A" || x === "B" || x === "tie" || x === "both_bad" ? x : null;
};

/** The row's numeric score columns (`ai_eval_runs.scores` is a flat record of numbers). */
function scoreColumns(c: EvalScores): EvalRunRow["scores"] {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(c as unknown as Record<string, unknown>)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

/** The judge's tally per property (`ai_eval_runs.pairwise`). */
function pairwiseColumns(p: PairwiseScores | null): EvalRunRow["pairwise"] {
  if (!p) return null;
  return Object.fromEntries(p.properties.map((x) => [x.property, { wins: x.wins, losses: x.losses, ties: x.ties, bothBad: x.bothBad, lowerBound: x.lower, agreement: x.agreement ?? 0 }]));
}

/** Scores, pairwise and the gate of a finished run. */
function score(family: R1Family, model: string, runs: { f: EvalFixture; run: RecordedRun; i: number }[], judgements: Judgement[], only: ReadonlySet<string>, settings: PlatformAiSetting): { candidate: EvalScores; gate: GateResult; pairwise: ReturnType<typeof pairwise> | null } {
  const scored = runs.map((r) => scoreRun(r.f, r.run, r.i, { model }));
  const candidate = aggregate(family, scored);
  candidate.errors = runs.filter((r) => r.run.error).length;
  const base = scoreBaseline(libraryBaseline(family), only);
  const pw = judgements.length ? pairwise(judgements, { minAgreement: settings.evalGate.minJudgeAgreement }) : null;
  return { candidate, gate: gate(candidate, base, pw, thresholdsFrom(settings.evalGate)), pairwise: pw };
}

export type StartEvalResult = { ok: true; runId: string; estimate: EvalEstimate; status: "done" | "running" | "failed" } | { ok: false; code: "bad_version" | "harness_broken" | "disabled" | "no_key" | "jury"; why?: string; estimate?: EvalEstimate };

/** Starts a smoke or live run (see the header). `ctx.userId` is the staff member who started it (audited by the console). */
export async function startEvalRun(ctx: { userId: string | null }, req: EvalRunRequest): Promise<StartEvalResult> {
  const settings = await getPlatformSetting("platform_ai");
  const c = candidateOf(req, settings);
  const est = estimateEvalRun(req, settings);
  if (!c || !est) return { ok: false, code: "bad_version" };
  if (!settings.enabled) return { ok: false, code: "disabled", estimate: est };
  if (!(await anthropic())) return { ok: false, code: "no_key", estimate: est };
  const check = harnessCheck(req.family);
  if (!check.ok) return { ok: false, code: "harness_broken", why: check.why, estimate: est };
  const cases = casesOf(req, settings).map(sendable).filter((f): f is EvalFixture => f !== null);
  const runId = newId();
  let jury: string[];
  try {
    jury = juryFor(c.cls, settings, c.model);
  } catch (err) {
    return { ok: false, code: "jury", why: (err as Error).message, estimate: est };
  }
  const judgeP = promptFor("judge", settings, "server");
  await insertEvalRun({ id: runId, kind: req.kind, task: req.family, model: c.model, promptVersion: req.version, rubricVersion: c.p.rubricVersion, fixturesHash: fixturesHash(req.family), baselineVersion: "library", judgeModel: jury.join(",").slice(0, 64), judgeVersion: judgeP?.version ?? null, status: "running", startedBy: ctx.userId, now: new Date() });
  if (req.kind === "live") {
    for (const f of cases) {
      for (let rep = 0; rep < LIVE_REPS; rep++) {
        await queuePlatformItem({ task: c.task, input: f.input, ref: { kind: "eval", id: `${runId}|${f.id}|${rep}`.slice(0, 64) }, model: c.model, promptVersion: req.version, reserve: true, evalRunId: runId, extra: { fixtureId: f.id, rep, class: c.cls } });
      }
    }
    return { ok: true, runId, estimate: est, status: "running" };
  }
  // smoke: interactive, scored at once
  const runs: { f: EvalFixture; run: RecordedRun; i: number }[] = [];
  let micros = 0;
  for (const f of cases) {
    const out = await interactiveCall(c.task, c.model, c.p, f, f.input, settings);
    runs.push({ f, run: out.run, i: 0 });
    micros += out.micros;
  }
  const judgements: Judgement[] = [];
  let judgeMicros = 0;
  const baseline = libraryBaseline(req.family);
  if (judgeP) {
    const answered = runs.filter((r) => r.run.output !== null && baseline.outputs[r.f.id] != null).map((r) => r.f.id);
    for (const item of judgePlan(runId, req.family, c.cls, c.model, answered, settings, SMOKE_MAX_JUDGEMENTS)) {
      const r = runs.find((x) => x.f.id === item.fixtureId)!;
      const side = sideOf(runId, item.fixtureId, item.property);
      const input = judgeInputOf(req.family, item.property, r.f, r.run.output, baseline.outputs[item.fixtureId], side);
      const out = await interactiveCall("eval.judge", item.judgeModel, judgeP, r.f, input, settings);
      judgeMicros += out.micros;
      const v = verdictOf(out.run.output);
      if (v) judgements.push({ fixtureId: item.fixtureId, property: item.property, verdict: v, candidateSide: side, judgeModel: item.judgeModel, candidateModel: c.model });
    }
  }
  const s = score(req.family, c.model, runs, judgements, new Set(runs.map((r) => r.f.id)), settings);
  await updateEvalRun(runId, {
    status: "done",
    scores: scoreColumns(s.candidate),
    pairwise: pairwiseColumns(s.pairwise),
    gate: { pass: s.gate.pass, verdict: s.gate.verdict, hard: s.gate.hard, soft: s.gate.soft, floor: s.gate.floor },
    passed: s.gate.pass,
    costMicros: micros,
    judgeCostMicros: judgeMicros,
    errors: s.candidate.errors,
    report: JSON.stringify({ estimate: est, runs: runs.map((r) => ({ fixture: r.f.id, stop: r.run.stop, error: r.run.error ?? null, output: r.run.output })), judgements }),
    doneAt: new Date(),
  });
  return { ok: true, runId, estimate: est, status: "done" };
}

/** The live run's next step, called by the batch ingest after each of its items (idempotent). */
export async function progressEvalRun(evalRunId: string): Promise<void> {
  const row = await getEvalRun(evalRunId);
  if (!row || (row.status !== "running" && row.status !== "scoring") || row.kind !== "live") return;
  const settings = await getPlatformSetting("platform_ai");
  const family = row.task as R1Family;
  const c = candidateOf({ family, kind: "live", version: row.promptVersion }, settings);
  if (!c) {
    await updateEvalRun(evalRunId, { status: "failed", doneAt: new Date() });
    return;
  }
  const cands = await evalItems(evalRunId, "eval");
  if (cands.some((i) => i.state === "queued" || i.state === "submitted" || i.state === "succeeded" || i.state === "errored")) return;
  const fixtures = new Map(EVAL_SETS[family].fixtures.map((f) => [f.id, f]));
  const runs = cands.flatMap((it) => {
    const p = payloadOf(it.payload) as ReturnType<typeof payloadOf> & { output?: unknown; usage?: RecordedRun["usage"]; stop?: string | null; error?: string; costMicros?: number };
    const f = p.fixtureId ? fixtures.get(p.fixtureId) : undefined;
    if (!f) return [];
    const stop = (p.stop === "refusal" || p.stop === "max_tokens" ? p.stop : "end_turn") as StopReason;
    const run: RecordedRun = { output: p.output ?? null, usage: p.usage ?? null, ms: 0, stop, batch: true, ...(p.error ? { error: p.error } : {}), ...(p.output === undefined && !p.error ? { error: "missing" } : {}) };
    return [{ f, run, i: p.rep ?? 0, micros: p.costMicros ?? 0 }];
  });
  const judgeP = promptFor("judge", settings, "server");
  const baseline = libraryBaseline(family);
  if (row.status === "running") {
    const answered = [...new Set(runs.filter((r) => r.i === 0 && r.run.output !== null && baseline.outputs[r.f.id] != null).map((r) => r.f.id))];
    const plan = judgeP ? judgePlan(evalRunId, family, c.cls, c.model, answered, settings) : [];
    await updateEvalRun(evalRunId, { status: "scoring" });
    for (const item of plan) {
      const r = runs.find((x) => x.f.id === item.fixtureId && x.i === 0)!;
      const side = sideOf(evalRunId, item.fixtureId, item.property);
      // judge ≠ candidate, asserted again on the item about to be queued (AI-07 (4))
      if (item.judgeModel === item.candidateModel) throw new Error("ai eval: a judge item judged by the candidate's model");
      await queuePlatformItem({ task: "eval.judge", input: judgeInputOf(family, item.property, r.f, r.run.output, baseline.outputs[item.fixtureId], side), ref: { kind: "eval_judge", id: sha256Hex(item.customId).slice(0, 40) }, model: item.judgeModel, promptVersion: judgeP!.version, reserve: true, evalRunId, extra: { fixtureId: item.fixtureId, candidateSide: side, class: c.cls } });
    }
    if (plan.length) return;
  }
  const judges = await evalItems(evalRunId, "eval_judge");
  if (judges.some((i) => i.state === "queued" || i.state === "submitted" || i.state === "succeeded" || i.state === "errored")) return;
  const judgements: Judgement[] = [];
  let judgeMicros = 0;
  for (const it of judges) {
    const p = payloadOf(it.payload) as ReturnType<typeof payloadOf> & { output?: unknown; costMicros?: number };
    judgeMicros += p.costMicros ?? 0;
    const input = p.input as JudgeInput;
    const v = verdictOf(p.output);
    if (v && p.candidateSide && p.fixtureId) judgements.push({ fixtureId: p.fixtureId, property: input.property, verdict: v, candidateSide: p.candidateSide, judgeModel: it.model, candidateModel: c.model });
  }
  const s = score(family, c.model, runs, judgements, new Set(runs.map((r) => r.f.id)), settings);
  await updateEvalRun(evalRunId, {
    status: "done",
    scores: scoreColumns(s.candidate),
    pairwise: pairwiseColumns(s.pairwise),
    gate: { pass: s.gate.pass, verdict: s.gate.verdict, hard: s.gate.hard, soft: s.gate.soft, floor: s.gate.floor },
    passed: s.gate.pass,
    costMicros: runs.reduce((n, r) => n + r.micros, 0),
    judgeCostMicros: judgeMicros,
    errors: s.candidate.errors,
    report: JSON.stringify({ runs: runs.map((r) => ({ fixture: r.f.id, rep: r.i, stop: r.run.stop, error: r.run.error ?? null })), judgements: judgements.length }),
    doneAt: new Date(),
  });
}

/**
 * `ai-eval.ts --record`: the family's committed smoke cases × 1 rep, interactive, paid from the platform month, as a
 * real recording (`synthetic: false`, never overwritten by `--write-synthetic`) for the offline harness.
 */
export async function recordFamily(req: { family: R1Family; version: string; limit?: number }): Promise<RecordedFile | null> {
  const settings = await getPlatformSetting("platform_ai");
  const c = candidateOf({ ...req, kind: "smoke" }, settings);
  if (!c) return null;
  const cases = casesOf({ ...req, kind: "smoke" }, settings).map(sendable).filter((f): f is EvalFixture => f !== null);
  const runs: Record<string, RecordedRun[]> = {};
  for (const f of cases) runs[f.id] = [(await interactiveCall(c.task, c.model, c.p, f, f.input, settings)).run];
  return { family: req.family, version: req.version, synthetic: false, why: `recorded live on ${new Date().toISOString().slice(0, 10)} on the smoke cases`, source: { rung: "server", model: c.model }, fixturesHash: fixturesHash(req.family), runs };
}
