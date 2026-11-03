/**
 * The eval harness (P7 AI; ai.md AI-§F.3-F.10, AI-§Q.1 `test:ai-eval`, AI-§Q.3 `qa:ai-eval-live` / `-local`; AI-07).
 *
 *   npm run test:ai-eval                               (= --offline; in test:slow, before each merge; < 60 s)
 *   npx tsx scripts/qa/ai-eval.ts --offline            every R1 family: the recorded outputs of its server seed version
 *                                                      (sets/<family>/recorded/<version>.json) → finalize / guard →
 *                                                      scorers → gate vs the frozen library baseline; the oracle and the
 *                                                      null; the broken-version self-check; the 6-store niche subset
 *                                                      through rule 13; prints the scorecards; exit 1 on any hard metric
 *   npx tsx scripts/qa/ai-eval.ts --offline --family copy.page [--smoke] [--verbose] [--json <file>]
 *                                                      one family; only the 20 committed smoke cases; every scorecard
 *                                                      row; the scorecards as JSON
 *   npx tsx scripts/qa/ai-eval.ts --broken             only the self-check: the gate blocks copy.page@x-broken (one
 *                                                      invented number in 1 of 60 fixtures) and passes s1 on the same 60
 *   npx tsx scripts/qa/ai-eval.ts --write-synthetic    (re)writes the hand-authored R1 recordings (./synthetic.ts); it
 *                                                      never overwrites a real recording (`synthetic: false`)
 *   --live --family <f> [--version <v>] [--limit <n>] [--yes] [--wait-min <m>]
 *                                                      a full live run (≤ 200 cases × 2 reps) through Message Batches
 *                                                      with the judge items (src/lib/ai/eval/live.ts): the estimate is
 *                                                      printed first and nothing is spent without --yes; the script then
 *                                                      drives the ai.batches tick itself until the row is done
 *   --smoke --live --family <f> [--version <v>] [--yes]  the 20-case interactive smoke run (≤ 1 h, enough to canary)
 *   --record --family <f> [--version <v>] [--yes]       the smoke cases × 1 rep, live, written as a real recording
 *                                                      sets/<family>/recorded/<version>.json (`synthetic: false`)
 *   --cut-baseline --family <f> --version <v>           the frozen baseline baseline/<version>.json from that real
 *                                                      recording, written once and never regenerated (AI-§F.5)
 *   The live modes need ANTHROPIC_API_KEY and DATABASE_URL (a throwaway or the platform DB with Cloud AI enabled and a
 *   cap); the cost counts against the platform cap. --local (qa:ai-eval-local, WebGPU) is not wired here.
 *
 * Infra failures (an `error` run, a served model other than the requested one, a case over the wall-clock ceiling)
 * go to qa/ai-eval/errors.jsonl and are never scored as 0. Node only; never imported by the app.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PlatformAi } from "../../src/lib/settings/keys/platform_ai";
import { R1_FAMILIES, SEED_VERSIONS, type R1Family } from "../../src/lib/ai/prompts/registry";
import { TASKS } from "../../src/lib/ai/tasks";
import { baselineName, type BaselineFile } from "../../src/lib/ai/eval/baseline";
import { baselinePath, writeBaselineOnce } from "../../src/lib/ai/eval/freeze";
import { EVAL_SETS, SMOKE_FIXTURES, fixturesHash } from "../../src/lib/ai/eval/fixtures";
import { juryFor } from "../../src/lib/ai/eval/jury";
import { NICHE_STORES, runNicheCorpus } from "../../src/lib/ai/eval/niche";
import { recordedName, recordedProblems, serializeRecorded, type RecordedFile } from "../../src/lib/ai/eval/recorded";
import { renderScorecard } from "../../src/lib/ai/eval/report";
import { evaluate, oracleAndNull, type EvalError, type FamilyEval } from "../../src/lib/ai/eval/run";
import { BROKEN_SIZE, BROKEN_VERSION, syntheticFiles } from "../../src/lib/ai/eval/synthetic";

const ROOT = process.cwd();
const SETS = join(ROOT, "src", "lib", "ai", "eval", "sets");
const ERRORS = join(ROOT, "qa", "ai-eval", "errors.jsonl");
const BUDGET_MS = 60_000;

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const value = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
}

const recordedPath = (family: R1Family, version: string) => join(SETS, family, recordedName(version));
const baselinePathOf = (family: R1Family) => join(SETS, family, "baseline", baselineName("library", fixturesHash(family)));

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};

/* ------------------------------------------------------------------ */
/* --write-synthetic                                                    */
/* ------------------------------------------------------------------ */

function writeSynthetic(): void {
  for (const file of syntheticFiles()) {
    const path = recordedPath(file.family, file.version);
    const prev = readJson<RecordedFile>(path);
    if (prev && prev.synthetic === false) {
      console.log(`${file.family}: kept the real recording ${recordedName(file.version)} (never overwritten by a synthetic one)`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    const text = serializeRecorded(file);
    const same = existsSync(path) && readFileSync(path, "utf8") === text;
    if (!same) writeFileSync(path, text);
    const runs = Object.values(file.runs).reduce((n, r) => n + r.length, 0);
    console.log(`${file.family}: ${same ? "unchanged" : "wrote"} ${recordedName(file.version)} (${Object.keys(file.runs).length} fixtures, ${runs} runs)`);
  }
}

/* ------------------------------------------------------------------ */
/* --offline                                                           */
/* ------------------------------------------------------------------ */

function loadRecorded(family: R1Family, version: string): RecordedFile | null {
  const path = recordedPath(family, version);
  const file = readJson<RecordedFile>(path);
  if (!file) {
    fail(`${family}: no recording ${recordedName(version)} (run --write-synthetic, or --live --record in step 8)`);
    return null;
  }
  const problems = recordedProblems(file);
  if (problems.length) {
    fail(`${family}: ${recordedName(version)} is malformed (${problems.slice(0, 5).join(", ")})`);
    return null;
  }
  if (file.fixturesHash !== fixturesHash(family)) {
    fail(`${family}: ${recordedName(version)} was recorded on fixtures ${file.fixturesHash.slice(0, 12)}, the set is now ${fixturesHash(family).slice(0, 12)} (re-record, or --write-synthetic for a synthetic file)`);
    return null;
  }
  return file;
}

function loadBaseline(family: R1Family): BaselineFile | null {
  const b = readJson<BaselineFile>(baselinePathOf(family));
  if (!b) fail(`${family}: no frozen library baseline for the current fixtures (npx tsx src/lib/ai/eval/freeze.ts)`);
  return b;
}

function printEval(e: FamilyEval, verbose: boolean): void {
  if (verbose) {
    console.log(renderScorecard(e.card));
    return;
  }
  const g = e.gate;
  const shown = e.card.rows.filter((r) => r.hard && r.ok === false);
  console.log(`  ${g.pass ? "✓" : g.hard.length ? "✗" : "~"} ${e.family.padEnd(18)} ${e.version.padEnd(22)} fixtures ${String(e.candidate.fixtures).padStart(3)} · runs ${String(e.candidate.runs).padStart(3)} · reject ${e.candidate.rejectRate.toFixed(3)} · raw dashes ${e.candidate.dashes.raw} → ${e.candidate.dashes.guarded} · raw numbers ${e.candidate.inventedNumbers.raw} → ${e.candidate.inventedNumbers.guarded} · ${g.verdict}${shown.length ? ` · ${shown.map((r) => r.id).join(", ")}` : ""}`);
  for (const h of g.hard) console.log(`      hard: ${h}`);
  for (const s of g.soft) console.log(`      soft: ${s}`);
}

function brokenCheck(): boolean {
  const broken = loadRecorded("copy.page", BROKEN_VERSION);
  const s1 = loadRecorded("copy.page", SEED_VERSIONS["copy.page"].server);
  const base = loadBaseline("copy.page");
  if (!broken || !s1 || !base) return false;
  const only = new Set(Object.keys(broken.runs));
  const b = evaluate(broken, base, { only });
  const ok = evaluate(s1, base, { only });
  const blocked = !b.gate.pass && b.gate.hard.some((h) => h.startsWith("inventedNumbers"));
  console.log(`  ${blocked ? "✓" : "✗"} broken version ${BROKEN_VERSION} over ${only.size} fixtures: gate ${b.gate.pass ? "PASS" : "FAIL"} (${b.gate.hard.join("; ") || "no hard item"})`);
  console.log(`  ${ok.gate.hard.length === 0 ? "✓" : "✗"} ${s1.version} over the same ${only.size} fixtures: ${ok.gate.hard.length ? ok.gate.hard.join("; ") : "no hard item"}`);
  if (only.size !== BROKEN_SIZE) fail(`the broken version is recorded over ${only.size} fixtures, not ${BROKEN_SIZE}`);
  if (!blocked) fail("the gate did not block the deliberately broken version (AI-07 (6))");
  if (ok.gate.hard.length) fail(`${s1.version} fails a hard metric on the broken version's fixtures`);
  return blocked && ok.gate.hard.length === 0;
}

async function offline(): Promise<void> {
  const started = performance.now();
  const only = value("--family") as R1Family | undefined;
  if (only && !(R1_FAMILIES as readonly string[]).includes(only)) {
    console.error(`unknown family ${only}; one of ${R1_FAMILIES.join(", ")}`);
    process.exit(2);
  }
  const smoke = flag("--smoke");
  const verbose = flag("--verbose");
  const families = only ? [only] : [...R1_FAMILIES];
  const settings = PlatformAi.parse({});
  const errors: EvalError[] = [];
  const evals: FamilyEval[] = [];

  console.log(`ai-eval --offline: ${families.length} famil${families.length === 1 ? "y" : "ies"}${smoke ? ", the 20 smoke cases only" : ""}`);
  for (const family of families) {
    const version = SEED_VERSIONS[family].server;
    const file = loadRecorded(family, version);
    const base = loadBaseline(family);
    if (!file || !base) continue;
    // the judge never runs on the model under test, and no jury contains it (AI-07 (4)); asserted per class here
    const cls = TASKS[EVAL_SETS[family].task].class;
    if (cls) {
      try {
        juryFor(cls, settings);
      } catch (e) {
        fail(`${family}: ${(e as Error).message}`);
      }
    }
    const smokeIds = new Set(SMOKE_FIXTURES.filter((f) => f.family === family).map((f) => f.id));
    const e = evaluate(file, base, smoke ? { only: smokeIds } : {});
    evals.push(e);
    errors.push(...e.errors);
    printEval(e, verbose);
    for (const id of smokeIds) if (!file.runs[id]) fail(`${family}: the smoke case ${id} has no recorded run`);
    if (e.gate.hard.length) fail(`${family}: ${e.gate.hard.length} hard metric(s) failed`);
    // the harness self-check: the oracle scores like the baseline (no delta of its own), the null fails
    const on = oracleAndNull(base);
    if (on) {
      if (on.oracle.soft.length) fail(`${family}: the oracle (the baseline's own outputs) differs from the baseline: ${on.oracle.soft.join("; ")} (the harness is broken)`);
      if (on.null.pass) fail(`${family}: the null (empty outputs) passes the gate (the harness is broken)`);
      if (on.oracle.hard.length && verbose) console.log(`      baseline findings (the library rung's own limits, never the candidate's): ${on.oracle.hard.join("; ")}`);
    }
  }

  if (!only || only === "copy.page") brokenCheck();

  if (!only || only === "copy.hero") {
    // the 6-store niche subset through rule 13 (the full 30 stores are test:ai:slow)
    const r = await runNicheCorpus(NICHE_STORES.slice(0, 6));
    const ok = r.hardN8.length === 0 && r.reasked > 0;
    console.log(`  ${ok ? "✓" : "✗"} niche subset (6 stores): ${r.reasked} lines re-asked, ${r.replaced} replaced, ${r.hardN8.length} cloud lines left colliding`);
    if (!ok) fail(`niche subset: ${r.hardN8.length} cloud / local lines collide after rule 13${r.reasked ? "" : " (and nothing was re-asked: the corpus does not exercise the rule)"}`);
  }

  if (errors.length) {
    mkdirSync(dirname(ERRORS), { recursive: true });
    writeFileSync(ERRORS, errors.map((e) => JSON.stringify(e)).join("\n") + "\n");
    console.log(`  ${errors.length} infra failure(s), not scored: ${ERRORS}`);
  }
  const json = value("--json");
  if (json) writeFileSync(json, JSON.stringify(evals.map((e) => e.card), null, 2));

  const ms = performance.now() - started;
  console.log(`  ${(ms / 1000).toFixed(1)} s of the ${BUDGET_MS / 1000} s budget`);
  if (ms > BUDGET_MS) fail(`test:ai-eval took ${(ms / 1000).toFixed(1)} s, over its ${BUDGET_MS / 1000} s budget`);
  if (failures) {
    console.error(`✗ ai-eval --offline: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("✓ ai-eval --offline: every hard metric holds");
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* --live, --smoke --live, --record, --cut-baseline (manual)           */
/* ------------------------------------------------------------------ */

/** The app's server modules carry `import "server-only"`; this Node script loads them the way the server does. */
function serverOnlyShim(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require("node:module") as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
  const empty = require.resolve("drizzle-orm");
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request: string, ...rest: unknown[]) {
    return request === "server-only" ? empty : (orig as (...a: unknown[]) => string).call(this, request, ...rest);
  };
}

function familyArg(): { family: R1Family; version: string } {
  const family = value("--family") as R1Family | undefined;
  if (!family || !(R1_FAMILIES as readonly string[]).includes(family)) {
    console.error(`--family is required; one of ${R1_FAMILIES.join(", ")}`);
    process.exit(2);
  }
  return { family, version: value("--version") ?? SEED_VERSIONS[family].server };
}

function cutBaseline(): void {
  const { family, version } = familyArg();
  const rec = readJson<RecordedFile>(recordedPath(family, version));
  if (!rec || rec.synthetic) {
    console.error(`${family}: no real recording of ${version} (record one with --record first; a synthetic file is never a baseline)`);
    process.exit(1);
  }
  const outputs: Record<string, unknown> = {};
  for (const [id, runs] of Object.entries(rec.runs)) outputs[id] = runs.find((r) => r.output !== null && !r.error)?.output ?? null;
  const b: BaselineFile = { family, version, source: { rung: "server", model: rec.source.model }, fixturesHash: rec.fixturesHash, outputs };
  const out = writeBaselineOnce(baselinePath(family, version), b);
  console.log(`${family}: baseline ${version} ${out === "written" ? "written" : "already exists (never regenerated)"}`);
}

async function liveMain(): Promise<void> {
  if (flag("--cut-baseline")) return cutBaseline();
  if (!process.env.ANTHROPIC_API_KEY || !process.env.DATABASE_URL) {
    console.error("the live modes need ANTHROPIC_API_KEY and DATABASE_URL; nothing was run");
    process.exit(2);
  }
  serverOnlyShim();
  const { family, version } = familyArg();
  const limit = value("--limit") ? Number(value("--limit")) : undefined;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const live = require("../../src/lib/ai/eval/live") as typeof import("../../src/lib/ai/eval/live");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getPlatformSetting } = require("../../src/lib/settings") as typeof import("../../src/lib/settings");
  const settings = await getPlatformSetting("platform_ai");
  const kind = flag("--smoke") || flag("--record") ? "smoke" : "live";
  const est = live.estimateEvalRun({ family, kind, version, ...(limit ? { limit } : {}) }, settings);
  if (!est) {
    console.error(`${version} is not a server prompt of ${family}`);
    process.exit(2);
  }
  console.log(`${family} ${version} ${flag("--record") ? "record" : kind}: ${est.line} (${est.judgeItems} judgements)`);
  if (!flag("--yes")) {
    console.log("nothing spent: run again with --yes to start it");
    return;
  }
  if (flag("--record")) {
    const file = await live.recordFamily({ family, version, ...(limit ? { limit } : {}) });
    if (!file) process.exit(1);
    const path = recordedPath(family, version);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeRecorded(file));
    console.log(`${family}: wrote ${recordedName(version)} (${Object.keys(file.runs).length} fixtures)`);
    return;
  }
  const started = await live.startEvalRun({ userId: null }, { family, kind, version, ...(limit ? { limit } : {}) });
  if (!started.ok) {
    console.error(`not started: ${started.code}${started.why ? ` (${started.why})` : ""}`);
    process.exit(1);
  }
  console.log(`eval run ${started.runId}: ${started.status}`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getEvalRun } = require("../../src/lib/ai/platform/eval-runs") as typeof import("../../src/lib/ai/platform/eval-runs");
  if (started.status === "running") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { jobs } = require("../../src/lib/jobs/tracks/ai") as typeof import("../../src/lib/jobs/tracks/ai");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { systemCtx } = require("../../src/lib/jobs/scope") as typeof import("../../src/lib/jobs/scope");
    const batches = jobs.find((j) => j.name === "ai.batches")!;
    const until = Date.now() + Number(value("--wait-min") ?? 180) * 60_000;
    while (Date.now() < until) {
      const ctx = { ...systemCtx("ai.batches"), deadline: Date.now() + 8_000, tickId: "ai-eval", cursor: "", setCursor: async () => undefined, yield: () => new Promise<void>((r) => setImmediate(r)), lagMs: () => 0 };
      const r = await batches.run(ctx);
      const row = await getEvalRun(started.runId);
      console.log(`  ${new Date().toISOString().slice(11, 19)} ${row?.status} ${JSON.stringify(r.summary)}`);
      if (row?.status === "done" || row?.status === "failed") break;
      await new Promise((res) => setTimeout(res, 60_000));
    }
  }
  const row = await getEvalRun(started.runId);
  console.log(`${family} ${version}: ${row?.status}, gate ${row?.gate ? JSON.stringify(row.gate) : "none"}, cost $${((row?.costMicros ?? 0) / 1e6).toFixed(2)} + judge $${((row?.judgeCostMicros ?? 0) / 1e6).toFixed(2)}`);
  process.exit(row?.passed ? 0 : 1);
}

async function main(): Promise<void> {
  if (flag("--write-synthetic")) return writeSynthetic();
  if (flag("--local")) {
    console.error("--local is qa:ai-eval-local (Playwright msedge with WebGPU on the owner's PC); nothing was run");
    process.exit(2);
  }
  if (flag("--live") || flag("--record") || flag("--cut-baseline")) return liveMain();
  if (flag("--broken")) {
    const ok = brokenCheck();
    process.exit(ok && !failures ? 0 : 1);
  }
  if (flag("--offline") || !argv.length || flag("--family") || flag("--smoke")) return offline();
  console.error("usage: ai-eval.ts --offline [--family <f>] [--smoke] [--verbose] [--json <file>] | --broken | --write-synthetic");
  process.exit(2);
}

void main();
