/**
 * test:ai sections of detached jobs, Batches, the ai.* cron jobs, the live eval plan, the notification kinds and the
 * release flags (P7 AI; ai.md AI-§B.8, AI-§B.13, AI-§N, AI-§F.5, AI-§L, AI-§O; docs/STORE-SAAS.md §J.1 `test:ai`,
 * §H.2; step 8 of the P7 plan). Registered by src/lib/ai/selftest.ts. Offline and pure: the DB-backed halves (the
 * drivers, the lease race, the sweep, the batch ingest, the rollups) are test:ai-db.
 *
 *   jobs-critique-plan  the critique-as-job: one `critique` stage of design.critique on the interactive class, its
 *                       budget from tokPerSec.director_interactive (< 80 tok/s → a job; a stage that cannot fit →
 *                       batchOnly), every stage ≤ 90,000 ms, stage inputs keyed by stage base
 *   jobs-probe-plan     the probe's sleep stages (≤ 60 s each, no model, no tokens), at most 10
 *   jobs-pulse-since    the pulse's `since` clamped to [now − 10 min, now], absent → now − 30 s
 *   batch-rules         the submit rule (20 items, 15 min, an eval or a job waiting), custom ids ≤ 64 chars and back,
 *                       the dedupe key, the canary token of a batch item, the job reference of a stage
 *   eval-judge-items    judge ≠ candidate on every judge item of every R1 family (the jury per class), a jury that holds
 *                       the candidate refused, the A/B side stable per case and mixed over a run
 *   recover-graph       the spy row of core §J.1: recoverOrphans' import graph reaches no provider client, no call
 *                       module, no advanceJob and no after(); the sweep's file names none of them
 *   jobs-track          the five ai jobs in their slots with their budgets (core §H.2: 4b 8 s, 4c 1 s, slot 6 5 / 2 / 5 s)
 *   notify-kinds        every ai.* kind of AI-§L / §C.3 / §O declared once, vars without customer keys, the tenant kinds
 *                       titled in ar, fr and en, every staff kind in en
 *   ai-flags            the five release flags, default false, owner "ai"
 *   usage-rows          ai_runs → ai_usage_daily rows per store day, the 12 latency buckets, counts per status
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PlatformAi, type PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { flags as AI_FLAGS } from "@/lib/flags/defs/ai";
import { messages as AR } from "@/lib/i18n/admin/ar/ai";
import { messages as EN } from "@/lib/i18n/admin/en/ai";
import { messages as FR } from "@/lib/i18n/admin/fr/ai";
import { kinds as AI_KINDS } from "@/lib/notify/kinds/ai";
import { MAX_ITEMS_PER_BATCH, SUBMIT_MAX_AGE_MS, SUBMIT_MIN_ITEMS, batchCanaryOf, batchDedupe, customIdOf, itemIdOf, jobRefOf, shouldSubmit } from "./batch/rules";
import { JUDGE_PROPERTIES_OF, judgePlan, sideOf } from "./eval/live-plan";
import { R1_FAMILIES, SEED_VERSIONS, PROMPTS } from "./prompts/registry";
import { isCanary } from "./safety/canary";
import { CRITIQUE_JOB_BELOW_TOK_PER_SEC, PULSE_SINCE_DEFAULT_MS, PULSE_SINCE_MAX_MS, STAGE_DEADLINE_MS, clampSince, critiqueRunsAsJob, isCritiqueJob, jobClassFor, planForJob, probePlan, stageInputOf, stagePlanFor } from "./jobs/stages";
import { MS_BUCKETS, dayIn, msBucket, usageRowsOf, type RunLite } from "./store/usage-rows";
import { TASKS, type AiTaskId } from "./tasks";

export interface JobsSelftestApi {
  section(name: string, run: () => void | Promise<void>, opts?: { slow?: boolean; strict?: boolean }): void;
  check(ok: boolean, msg: string): void;
  eq(a: unknown, b: unknown, msg: string): void;
}

const DEFAULTS: PlatformAiSetting = PlatformAi.parse({});
const probeAt = (tps: Record<string, number>) => PlatformAi.parse({ probe: { at: "2026-11-01T10:00:00.000Z", tokPerSec: tps } }).probe;
const ID = "01JC0000000000000000000000";

/* ------------------------------------------------------------------ */
/* The import graph of a module (recover-graph)                        */
/* ------------------------------------------------------------------ */

const SRC = resolve(__dirname, "..", "..");
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^;'"]*?\sfrom\s+)?["']([^"']+)["']/g;
const DYNAMIC_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function resolveSpec(from: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  if (!base) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

/** Every value import reachable from `entry` (type-only imports are erased and skipped): files and package names. */
function importGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    const text = readFileSync(f, "utf8");
    const specs: string[] = [];
    for (const m of text.matchAll(IMPORT_RE)) if (!m[1]) specs.push(m[2]!);
    for (const m of text.matchAll(DYNAMIC_RE)) specs.push(m[1]!);
    for (const spec of specs) {
      const r = resolveSpec(f, spec);
      // the AI layer's own graph: the provider modules all live under src/lib/ai (a core module never imports them)
      if (r && rel(r).startsWith("lib/ai/")) todo.push(r);
      else if (!r && !spec.startsWith(".") && !spec.startsWith("@/")) packages.add(spec);
    }
  }
  return { files, packages };
}

const rel = (f: string) => f.slice(SRC.length + 1).replace(/\\/g, "/");

/* ------------------------------------------------------------------ */

export function registerJobsSections(t: JobsSelftestApi): void {
  const { section, check, eq } = t;

  section("jobs-critique-plan", () => {
    const input = { critique: { candidates: [] } };
    check(isCritiqueJob("director_deep", input) && !isCritiqueJob("director_deep", { brief: {}, critique: {} }) && !isCritiqueJob("store_blueprint", input), "the critique-as-job is a director_deep job holding only a critique");
    eq(jobClassFor("director_deep", input), "director_interactive", "the critique-as-job runs on the interactive Director class");
    eq(jobClassFor("director_deep", { brief: {} }), "director_deep", "a deep pass runs on the deep class");
    check(critiqueRunsAsJob(probeAt({ director_interactive: CRITIQUE_JOB_BELOW_TOK_PER_SEC - 1 })) && !critiqueRunsAsJob(probeAt({ director_interactive: 150 })) && !critiqueRunsAsJob(null), "the critique becomes a job below 80 tok/s on the interactive class (probe line 11), never without a measurement");
    const fast = stagePlanFor("director_deep", input, probeAt({ director_interactive: 200, director_deep: 20 })).stages;
    eq(fast.map((s) => [s.id, s.task, s.batchOnly]), [["critique", "design.critique", false]], "one critique stage at 200 tok/s (the interactive class's throughput, not the deep class's)");
    eq(fast[0]!.maxTokens, Math.floor(90 * 200 * 0.6), "its budget ⌊90 × tok/s × 0.6⌋");
    const slow = stagePlanFor("director_deep", input, probeAt({ director_interactive: 79 })).stages;
    check(slow.length === 1 && slow[0]!.batchOnly && slow[0]!.maxTokens < 5_000, "at 79 tok/s the slim critique (≤ 5,000) cannot fit a 90 s stage: batchOnly (AI-§B.8 case b)");
    for (const kind of ["director_deep", "store_blueprint", "logo_system", "health_report"] as const) {
      check(stagePlanFor(kind, input, null).stages.every((s) => s.deadlineMs <= STAGE_DEADLINE_MS && s.id.length <= 18), `${kind}: every stage ≤ 90,000 ms and ≤ 18 characters`);
    }
    eq(stageInputOf("critique", { brief: { a: 1 }, critique: { b: 2 } }), { b: 2 }, "a keyed job input hands each stage its own entry");
    eq(stageInputOf("blueprint:2", { blueprint: { c: 3 } }), { c: 3 }, "a numbered stage reads its base's entry");
    eq(stageInputOf("report", { x: 1 }), { x: 1 }, "an unkeyed input is the stage's input as a whole");
  });

  section("jobs-probe-plan", () => {
    const p = probePlan();
    eq(p.stages.map((s) => s.id), ["sleep:1", "sleep:2", "sleep:3", "sleep:4", "sleep:5"], "the probe: five sleep stages over about 5 minutes");
    check(p.stages.every((s) => s.task === "probe.sleep" && s.maxTokens === 0 && s.deadlineMs === 60_000 && !s.batchOnly), "no model, no tokens, 60 s each, never a batch");
    eq(planForJob("probe", { totalMs: 30_000, stageMs: 10_000 }, null).stages.length, 3, "the staff probe may be shortened");
    eq(probePlan(10 * 3_600_000, 60_000).stages.length, 10, "at most 10 sleep stages");
    check(probePlan(300_000, 200_000).stages.every((s) => s.deadlineMs <= STAGE_DEADLINE_MS), "a probe stage is never above 90 s");
  });

  section("jobs-pulse-since", () => {
    const now = new Date("2026-11-03T12:00:00.000Z");
    eq(clampSince(new Date(now.getTime() - 3_600_000), now).getTime(), now.getTime() - PULSE_SINCE_MAX_MS, "a `since` an hour ago is clamped to now − 10 min");
    eq(clampSince(new Date(now.getTime() + 60_000), now).getTime(), now.getTime(), "a `since` in the future is clamped to now");
    eq(clampSince(new Date("nonsense"), now).getTime(), now.getTime() - PULSE_SINCE_DEFAULT_MS, "an invalid `since` → now − 30 s");
    eq(clampSince(null, now).getTime(), now.getTime() - PULSE_SINCE_DEFAULT_MS, "an absent `since` → now − 30 s");
    eq(clampSince(new Date(now.getTime() - 60_000), now).getTime(), now.getTime() - 60_000, "a `since` inside the window is kept");
  });

  section("batch-rules", () => {
    const now = Date.UTC(2026, 10, 3, 12);
    check(!shouldSubmit({ queued: 0, oldest: null, urgent: true }, now), "nothing queued, nothing submitted");
    check(!shouldSubmit({ queued: SUBMIT_MIN_ITEMS - 1, oldest: new Date(now - SUBMIT_MAX_AGE_MS + 1_000), urgent: false }, now), "19 young items wait");
    check(shouldSubmit({ queued: SUBMIT_MIN_ITEMS, oldest: new Date(now), urgent: false }, now), "20 items are submitted");
    check(shouldSubmit({ queued: 1, oldest: new Date(now - SUBMIT_MAX_AGE_MS), urgent: false }, now), "an item 15 min old is submitted");
    check(shouldSubmit({ queued: 1, oldest: new Date(now), urgent: true }, now), "an eval run or a job stage waiting is submitted at once");
    eq(MAX_ITEMS_PER_BATCH, 1_000, "≤ 1,000 items per batch");
    const cid = customIdOf(ID);
    check(cid.length <= 64 && itemIdOf(cid) === ID && itemIdOf("x_" + ID) === null && itemIdOf("i_../etc") === null, "custom_id = i_<id> (≤ 64 chars) and back; anything else is no item");
    const d = batchDedupe("copy.page", { kind: "page", id: "P1" }, "h".repeat(64), "copy.page@s1");
    check(d === batchDedupe("copy.page", { kind: "page", id: "P1" }, "h".repeat(64), "copy.page@s1") && d !== batchDedupe("copy.page", { kind: "page", id: "P1" }, "h".repeat(64), "copy.page@s2") && /^[0-9a-f]{64}$/.test(d), "the dedupe key: sha256 over task, ref, input hash and version (a new version is new work)");
    check(isCanary(batchCanaryOf(ID)) && batchCanaryOf(ID) !== batchCanaryOf("01JC0000000000000000000001"), "a batch item's canary token is a valid token, distinct per item");
    eq(jobRefOf(`${ID}:critique`), { jobId: ID, stage: "critique" }, "a job stage's ref");
    eq(jobRefOf(`${ID}:blueprint:2`), { jobId: ID, stage: "blueprint:2" }, "a numbered stage's ref");
    check(jobRefOf("x:critique") === null && jobRefOf(`${ID}:../x`) === null, "a malformed ref is no job");
  });

  section("eval-judge-items", () => {
    let items = 0;
    for (const family of R1_FAMILIES) {
      const p = PROMPTS[SEED_VERSIONS[family].server];
      const cls = p ? TASKS[p.task as AiTaskId].class : undefined;
      if (!cls) continue;
      const model = DEFAULTS.classes[cls].model;
      const plan = judgePlan("RUN", family, cls, model, ["f1", "f2", "f3"], DEFAULTS);
      items += plan.length;
      check(plan.every((i) => i.judgeModel !== model && i.candidateModel === model), `${family}: judge ≠ candidate on every judge item`);
      eq(plan.length, 3 * JUDGE_PROPERTIES_OF[family].length * (cls === "worker" ? 1 : DEFAULTS.evalGate.jury[cls].length), `${family}: one item per fixture × property × juror`);
    }
    check(items > 0, "the R1 families have judge items");
    let refused = false;
    try {
      judgePlan("RUN", "director.plan", "director_interactive", DEFAULTS.evalGate.jury.director_interactive[0], ["f1"], DEFAULTS);
    } catch {
      refused = true;
    }
    check(refused, "a candidate whose model sits on its own jury is refused (a canaried class model)");
    eq(judgePlan("RUN", "screen", "fast", DEFAULTS.classes.fast.model, ["f1"], DEFAULTS).length, 0, "the screen is scored deterministically: no judge item");
    const sides = Array.from({ length: 40 }, (_, i) => sideOf("RUN", `f${i}`, "honesty"));
    check(sides.includes("A") && sides.includes("B") && sideOf("RUN", "f1", "honesty") === sideOf("RUN", "f1", "honesty"), "the A/B side is randomised per case and stable per run");
  });

  section("recover-graph", () => {
    const entry = join(SRC, "lib", "ai", "jobs", "recover.ts");
    const g = importGraph(entry);
    const files = [...g.files].map(rel);
    const forbidden = ["lib/ai/server/call.ts", "lib/ai/server/client.ts", "lib/ai/router/run.server.ts", "lib/ai/jobs/run.ts", "lib/ai/batch/submit.ts", "lib/ai/batch/ingest.ts", "lib/ai/eval/live.ts"];
    const hit = forbidden.filter((f) => files.includes(f));
    eq(hit, [], "recoverOrphans reaches no provider client, call module, advanceJob, batch submit / ingest or live eval");
    check(!g.packages.has("next/server") && !g.packages.has("@anthropic-ai/sdk"), "recoverOrphans imports neither after() (next/server) nor the SDK");
    check(files.includes("lib/ai/jobs/claim.ts") && files.includes("lib/ai/batch/queue.ts"), "the graph is real: it reaches the claim and the batch queue it hands stages to");
    const text = readFileSync(entry, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    check(!/\badvanceJob\b|\brunDetachedJob\b|\bafter\(|\bcallClaude\b|\banthropic\(/.test(text), "the sweep's code names no driver and no provider call");
  });

  section("jobs-track", () => {
    const text = readFileSync(join(SRC, "lib", "jobs", "tracks", "ai.ts"), "utf8");
    const rows = [...text.matchAll(/\{ name: "(ai\.[a-z]+)", every: ("tick"|"hourly"|\{ dailyAt: "\d\d:\d\d" \}), budgetMs: ([\d_]+), run: \w+ \}/g)].map((m) => [m[1], m[2], Number(m[3]!.replace(/_/g, ""))]);
    eq(rows, [["ai.batches", '"tick"', 8_000], ["ai.jobs", '"tick"', 1_000], ["ai.rollups", '"hourly"', 5_000], ["ai.reconcile", '"hourly"', 2_000], ["ai.retention", '{ dailyAt: "03:50" }', 5_000]], "the five ai jobs in their slots with their budgets (core §H.2, AI-§N)");
    check(!/runServerTask|advanceJob|callClaude/.test(text), "no ai job runs a stage or a live call inside the tick");
  });

  section("notify-kinds", () => {
    const names = AI_KINDS.map((k) => k.kind);
    eq(names.length, new Set(names).size, "every ai kind declared once");
    const required = ["ai.credits_80", "ai.credits_out", "ai.cap_80", "ai.cap_reached", "ai.auth_failed", "ai.director_unavailable", "ai.batch_done", "ai.batch_failed", "ai.job_done", "ai.job_failed", "ai.refusal_spike", "ai.canary_rolled_back", "ai.insights_ready", "ai.health_report_ready", "ai.pending_share_reached", "ai.canary_leak", "ai.job_orphaned"];
    eq(required.filter((k) => !names.includes(k)), [], "the kinds of AI-§L, §C.3 and §O are declared");
    check(AI_KINDS.every((k) => /^ai\.[a-z0-9_]+$/.test(k.kind) && k.kind.length <= 40 && k.group.length > 0), "kind names are ai.<event>, ≤ 40 chars");
    eq(AI_KINDS.filter((k) => k.tenant).map((k) => k.kind).sort(), ["ai.batch_done", "ai.credits_80", "ai.credits_out", "ai.health_report_ready", "ai.insights_ready", "ai.job_done", "ai.job_failed"], "the tenant kinds");
    const customer = /^(?:phone|name|address|email|note|customer)/i;
    check(AI_KINDS.every((k) => Object.keys((k.vars as unknown as { shape?: Record<string, unknown> }).shape ?? {}).every((v) => !customer.test(v))), "no kind carries a customer key in its vars");
    for (const k of AI_KINDS) {
      const keys = [`notify.${k.kind}.title`, `notify.${k.kind}.body`] as (keyof typeof EN)[];
      check(keys.every((key) => typeof EN[key] === "string" && EN[key].length > 0), `${k.kind}: en title and body`);
      check(keys.every((key) => typeof FR[key] === "string" && typeof AR[key] === "string"), `${k.kind}: fr and ar title and body`);
      check(keys.every((key) => !/!/.test(EN[key])), `${k.kind}: no exclamation mark (the owner's voice rules)`);
    }
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    check(Object.keys(EN).every((key) => vars(EN[key as keyof typeof EN]).join() === vars((FR as Record<string, string>)[key] ?? EN[key as keyof typeof EN]).join() && vars(EN[key as keyof typeof EN]).join() === vars((AR as Record<string, string>)[key] ?? EN[key as keyof typeof EN]).join()), "every translation keeps the English placeholders");
  });

  section("ai-flags", () => {
    eq(AI_FLAGS.map((f) => f.key).sort(), ["ai_copilot", "ai_detached_jobs", "ai_director_brief", "ai_learned_priors", "ai_risk_v2"], "the five AI release flags");
    check(AI_FLAGS.every((f) => f.kind === "release" && f.type === "boolean" && f.default === false && f.ownerTrack === "ai" && f.description.length <= 300), "release flags, boolean, default false, owner ai, ≤ 300-char description");
  });

  section("usage-rows", () => {
    eq(MS_BUCKETS.length + 1, 12, "12 latency buckets");
    check(msBucket(0) === 0 && msBucket(250) === 0 && msBucket(251) === 1 && msBucket(90_000) === 10 && msBucket(200_000) === 11, "bucket edges: ≤ 250 ms first, > 90 s last");
    const at = (iso: string) => new Date(iso);
    const run = (patch: Partial<RunLite>): RunLite => ({ createdAt: at("2026-11-03T10:00:00.000Z"), task: "copy.page", provider: "server", model: "claude-sonnet-5-5", via: "stream", status: "ok", flags: null, rejectedFields: null, inTok: 100, outTok: 50, cacheReadTok: 10, cacheWriteTok: 0, costMicros: 1_000, credits: 1, ms: 1_500, ...patch });
    const rows = usageRowsOf(
      [
        run({}),
        run({ status: "refused", ms: 300 }),
        run({ via: "cache", costMicros: 0, credits: 0, ms: 5 }),
        run({ status: "invalid_output", rejectedFields: ["hero.headline", "faq.1"] }),
        run({ flags: ["fallback_model"] }),
        run({ status: "timeout" }),
        run({ createdAt: at("2026-11-02T23:30:00.000Z") }),
        run({ createdAt: at("2026-10-30T10:00:00.000Z") }),
      ],
      "UTC",
      new Set(["2026-11-03", "2026-11-02"]),
    );
    const today = rows.find((r) => r.day === "2026-11-03")!;
    check(rows.length === 2 && today.runs === 6, "one row per store day; a day outside the window is left out");
    check(today.ok === 3 && today.refused === 1 && today.invalid === 1 && today.errors === 1 && today.cacheHits === 1 && today.fallbacks === 1 && today.rejectedFields === 2, "counts per status, cache hits, fallbacks, rejected fields");
    check(today.costMicros === 5_000 && today.credits === 5 && today.msHist.reduce((a, b) => a + b, 0) === 6, "cost, credits and the histogram add up");
    check(rows.find((r) => r.day === "2026-11-02")?.runs === 1, "yesterday's row holds yesterday's run");
    eq(dayIn(at("2026-11-02T23:30:00.000Z"), "Africa/Casablanca"), "2026-11-03", "the day is the store's (Casablanca is UTC+1 in November)");
  });
}
