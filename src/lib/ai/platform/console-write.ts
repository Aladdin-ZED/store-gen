import "server-only";
/**
 * Console → AI writes (P7 AI; ai.md AI-§K.2, AI-§B.2, AI-§F.6, AI-§F.8, AI-§F.9; AI-01, AI-07 (3)(4)(5), AI-19 (9)(10);
 * docs/STORE-SAAS.md §B.7 step-up, §F.5 audits). The bodies of src/app/admin/(console)/ai/actions.ts, each called
 * inside `platformAction("ai.platform", …)`; every body checks `ai.platform` again, and the step-up writes (the key,
 * the cap, a class's model / effort / max_tokens, the rubric, a route's effort, Activate, Roll back, the emergency
 * switch) check the fresh step-up themselves too, so a caller that skipped the seam's option is still refused.
 *
 * The gate (AI-§F.6, never bypassed here):
 *   - a class's model, effort or max_tokens change needs a passing full `live` run ≤ 14 days old for the new model on
 *     the current fixtures hash of a family of that class; a new model id must have been checked (`modelInfo`);
 *   - the emergency switch (AI-D15) skips the run only when the active model answers `not_found` now, with step-up and
 *     a typed reason; a live eval is queued at once;
 *   - a jury that contains the candidate class's model is refused at save (the setting's own refinement, QUAL-13);
 *   - Canary needs a passing smoke or live run ≤ 14 days on the hash; Activate the promotion threshold of AI-§F.8 and a
 *     passing live run; "Activate on the offline gate alone" only once the canary is low-volume at day 28;
 *   - "Auto by default" needs the recorded passing preference test (lower bound ≥ 0.55 over ≥ 60 pairs).
 * Refusals come back as `{ ok: false, code }` (data, not a thrown error); the key is never returned, logged or audited.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { ZodError, z } from "zod";
import { auditFrom } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { aiBatchItems, aiBatches, aiEvalRuns, aiRuns, promptVersions } from "@/lib/db/schema";
import { getPlatformSetting, setPlatformSetting, type PlatformActor } from "@/lib/settings";
import { EffortZ, ModelId, PriceRow, TaskClassZ, TaskIdZ, type ModelInfo, type PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { ANTHROPIC_KEY_RE } from "@/lib/settings/keys/platform_ai_secret";
import { SeamError } from "@/lib/tenancy/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { canaryBp } from "../eval/canary-rules";
import { fixturesHash } from "../eval/fixtures";
import { estimateEvalRun, startEvalRun, type EvalEstimate } from "../eval/live";
import { R1_FAMILIES, SEED_VERSIONS, type R1Family } from "../prompts/registry";
import { sha256Hex } from "../prompts/sha256";
import { anthropic, resetAnthropic } from "../server/client";
import { fromSdkError } from "../server/errors";
import { keySource } from "../server/key";
import { checkModel } from "../server/models";
import { TASKS } from "../tasks";
import { updateBatch, unmarkSubmitted } from "./batches";
import { canaryPromotion, familiesOfClass, gateRunFor, naturalnessCases } from "./console-read";
import { daysBetween, EVAL_MAX_AGE_DAYS, naturalnessVerdict, PREFERENCE_PASS_LOWER_BOUND } from "./console-view";
import { passingRun } from "./eval-runs";
import { ensurePromptVersions, invalidateCanaries, type PromptVersionRow } from "./prompt-versions";
import { familyRuns7d } from "./rollups";

export type ConsoleCode =
  | "needs_live_run"
  | "not_checked"
  | "jury"
  | "not_not_found"
  | "model_not_found"
  | "no_canary_run"
  | "canary_exists"
  | "not_canary"
  | "not_ready"
  | "not_low_volume"
  | "is_seed"
  | "needs_preference"
  | "needs_key_and_cap"
  | "no_key"
  | "invalid_key"
  | "unreachable"
  | "bad_version"
  | "harness_broken"
  | "disabled"
  | "not_found"
  | "state"
  | "not_screened"
  | "fast_not_allowed";

export type ConsoleOutcome<T = null> = { ok: true; value: T } | { ok: false; code: ConsoleCode; detail?: string };

const done = <T>(value: T): ConsoleOutcome<T> => ({ ok: true, value });
const refuse = (code: ConsoleCode, detail?: string): ConsoleOutcome<never> => ({ ok: false, code, ...(detail ? { detail: detail.slice(0, 200) } : {}) });
const DAY = 86_400_000;

function gate(ctx: PlatformCtx, opts: { stepUp?: boolean } = {}): void {
  if (!ctx.can("ai.platform")) throw new SeamError("forbidden");
  if (opts.stepUp && !ctx.stepUpFresh) throw new SeamError("step_up");
}

const actorOf = (ctx: PlatformCtx): PlatformActor => ({ id: ctx.user.id, ip: ctx.actor.ip, kind: "platform" });

/** Reads platform_ai fresh, applies `change`, saves through the schema; a refused jury answers `jury`. */
async function saveAi(ctx: PlatformCtx, change: (s: PlatformAiSetting) => void): Promise<ConsoleOutcome<PlatformAiSetting>> {
  const next = await getPlatformSetting("platform_ai", { fresh: true });
  change(next);
  try {
    return done(await setPlatformSetting("platform_ai", next, actorOf(ctx)));
  } catch (err) {
    if (err instanceof ZodError) {
      const jury = err.issues.some((i) => i.path.includes("jury") || i.path.includes("judgeModel"));
      if (jury) return refuse("jury", err.issues[0]?.message);
      if (err.issues.some((i) => i.path.includes("directorAutoDefault"))) return refuse("needs_preference");
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Settings, cap, key                                                  */
/* ------------------------------------------------------------------ */

const SettingsInput = z.strictObject({
  enabled: z.boolean().optional(),
  storeDailyCapPct: z.number().int().min(5).max(100).optional(),
  directorSharePct: z.number().int().min(10).max(100).optional(),
  pendingSharePct: z.number().int().min(1).max(50).optional(),
  pendingDailyFloor: z.number().int().min(0).max(50).optional(),
  concurrentDirector: z.number().int().min(1).max(20).optional(),
  concurrentWorker: z.number().int().min(1).max(40).optional(),
  concurrentFast: z.number().int().min(1).max(60).optional(),
  perStoreWorker: z.number().int().min(1).max(6).optional(),
  directorPassesPerStorePerDay: z.number().int().min(1).max(500).optional(),
  deepPassesPerStorePerDay: z.number().int().min(0).max(100).optional(),
  streamTransport: z.enum(["stream", "poll"]).optional(),
  cacheTtl: z.enum(["1h", "5m"]).optional(),
  fallbacks: z.enum(["default", "off"]).optional(),
  patternLibrary: z.boolean().optional(),
});
const CAP_KEYS = ["storeDailyCapPct", "directorSharePct", "pendingSharePct", "pendingDailyFloor", "concurrentDirector", "concurrentWorker", "concurrentFast", "perStoreWorker", "directorPassesPerStorePerDay", "deepPassesPerStorePerDay"] as const;

export async function saveSettings(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome<{ fields: string[] }>> {
  gate(ctx);
  const v = SettingsInput.parse(input);
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  if (v.enabled === true && !cur.enabled && (cur.caps.monthlyUsd === null || (await keySource()) === "none")) return refuse("needs_key_and_cap");
  const fields = Object.keys(v);
  const saved = await saveAi(ctx, (s) => {
    if (v.enabled !== undefined) s.enabled = v.enabled;
    for (const k of CAP_KEYS) if (v[k] !== undefined) s.caps[k] = v[k];
    if (v.streamTransport) s.streamTransport = v.streamTransport;
    if (v.cacheTtl) s.cacheTtl.platform = v.cacheTtl;
    if (v.fallbacks) s.fallbacks = v.fallbacks;
    if (v.patternLibrary !== undefined) s.patternLibrary = v.patternLibrary;
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.settings_changed", { target: "platform_ai", meta: { fields } });
  if (v.streamTransport && v.streamTransport !== cur.streamTransport) await auditFrom(ctx, "platform.ai.transport_changed", { target: "platform_ai", meta: { from: cur.streamTransport, to: v.streamTransport } });
  return done({ fields });
}

export async function saveCap(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome> {
  gate(ctx, { stepUp: true });
  const { monthlyUsd } = z.strictObject({ monthlyUsd: z.number().positive().max(100_000).nullable() }).parse(input);
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  const saved = await saveAi(ctx, (s) => {
    s.caps.monthlyUsd = monthlyUsd;
    // no cap = cloud off (D40)
    if (monthlyUsd === null) s.enabled = false;
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.cap_changed", { target: "platform_ai", meta: { from: cur.caps.monthlyUsd, to: monthlyUsd } });
  return done(null);
}

/** Seals the key into `platform_ai_secret`; the answer and the audit row carry where the key comes from, never it. */
export async function setKey(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome<{ keySource: string }>> {
  gate(ctx, { stepUp: true });
  const parsed = z.strictObject({ apiKey: z.string().trim().max(256) }).safeParse(input);
  // never the issue text (it could echo the value): a plain refusal
  if (!parsed.success || !ANTHROPIC_KEY_RE.test(parsed.data.apiKey)) return refuse("invalid_key");
  await setPlatformSetting("platform_ai_secret", { apiKey: parsed.data.apiKey, setAt: new Date().toISOString(), setBy: ctx.user.id }, actorOf(ctx));
  resetAnthropic();
  await auditFrom(ctx, "platform.ai.key_set", { target: "platform_ai_secret", meta: { source: "settings" } });
  return done({ keySource: await keySource() });
}

export async function removeKey(ctx: PlatformCtx): Promise<ConsoleOutcome<{ keySource: string }>> {
  gate(ctx, { stepUp: true });
  await setPlatformSetting("platform_ai_secret", {}, actorOf(ctx));
  resetAnthropic();
  await auditFrom(ctx, "platform.ai.key_removed", { target: "platform_ai_secret", meta: {} });
  return done({ keySource: await keySource() });
}

/** A 1-token call on the Fast class: the latency and the served model's display name. */
export async function testConnection(ctx: PlatformCtx): Promise<ConsoleOutcome<{ ms: number; model: string; displayName: string }>> {
  gate(ctx);
  const client = await anthropic();
  if (!client) return refuse("no_key");
  const settings = await getPlatformSetting("platform_ai");
  const model = settings.classes.fast.model;
  const t0 = Date.now();
  let served = model;
  try {
    const res = await client.messages.create({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
    served = res.model || model;
  } catch (err) {
    return refuse("unreachable", fromSdkError(err).code);
  }
  const ms = Date.now() - t0;
  const known = settings.modelInfo[served];
  const info = known ?? (await checkModel(served).then((c) => (c.ok ? c.info : null)));
  return done({ ms, model: served, displayName: info?.display_name ?? served });
}

/* ------------------------------------------------------------------ */
/* Classes, routes, prices, rubric                                     */
/* ------------------------------------------------------------------ */

/** "Check model": `models.retrieve(id)` stored in `modelInfo[id]`; a `not_found` id answers model_not_found. */
export async function checkModelInfo(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome<ModelInfo>> {
  gate(ctx);
  const { id } = z.strictObject({ id: ModelId }).parse(input);
  const c = await checkModel(id);
  if (!c.ok) return refuse(c.code === "model_unavailable" ? "model_not_found" : c.code === "no_key" ? "no_key" : "unreachable", c.code);
  const saved = await saveAi(ctx, (s) => {
    s.modelInfo[id] = c.info;
  });
  if (!saved.ok) return saved;
  return done(c.info);
}

const ClassInput = z.strictObject({
  class: TaskClassZ,
  model: ModelId,
  effort: EffortZ,
  maxTokens: z.number().int().min(256).max(64_000),
  timeoutMs: z.number().int().min(5_000).max(90_000),
  fallbacks: z.enum(["default", "none"]),
  batch: z.enum(["never", "allowed", "always", "fallback"]),
});

/** Passing live runs ≤ 14 days old (P table), newest first. */
async function freshLiveRuns(now: Date) {
  return db
    .select()
    .from(aiEvalRuns)
    .where(and(eq(aiEvalRuns.kind, "live"), eq(aiEvalRuns.passed, true), sql`${aiEvalRuns.createdAt} >= ${new Date(now.getTime() - EVAL_MAX_AGE_DAYS * DAY)}`))
    .orderBy(sql`${aiEvalRuns.createdAt} DESC`)
    .limit(200);
}

export async function saveClass(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome> {
  gate(ctx);
  const v = ClassInput.parse(input);
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  const was = cur.classes[v.class];
  const modelChange = v.model !== was.model || v.effort !== was.effort || v.maxTokens !== was.maxTokens;
  if (modelChange) {
    gate(ctx, { stepUp: true });
    if (v.model !== was.model && !cur.modelInfo[v.model]) return refuse("not_checked");
    if (!gateRunFor(await freshLiveRuns(now), v.class, v.model)) return refuse("needs_live_run", familiesOfClass(v.class).join(", "));
  }
  const saved = await saveAi(ctx, (s) => {
    s.classes[v.class] = { ...s.classes[v.class], model: v.model, effort: v.effort, maxTokens: v.maxTokens, timeoutMs: v.timeoutMs, fallbacks: v.fallbacks, batch: v.batch };
  });
  if (!saved.ok) return saved;
  if (modelChange) {
    await auditFrom(ctx, "platform.ai.model_changed", { target: v.class, meta: { class: v.class, from: { model: was.model, effort: was.effort, maxTokens: was.maxTokens }, to: { model: v.model, effort: v.effort, maxTokens: v.maxTokens } } });
  } else {
    await auditFrom(ctx, "platform.ai.settings_changed", { target: "platform_ai", meta: { fields: [`classes.${v.class}`] } });
  }
  return done(null);
}

/** The emergency model switch (AI-D15): only while the active model answers not_found; a live eval is queued at once. */
export async function emergencySwitch(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome<{ evalRunId: string | null }>> {
  gate(ctx, { stepUp: true });
  const v = z.strictObject({ class: TaskClassZ, model: ModelId, reason: z.string().trim().min(12).max(300) }).parse(input);
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  const from = cur.classes[v.class].model;
  const current = await checkModel(from);
  if (current.ok || current.code !== "model_unavailable") return refuse("not_not_found", current.ok ? "the active model answers" : current.code);
  const next = await checkModel(v.model);
  if (!next.ok) return refuse(next.code === "model_unavailable" ? "model_not_found" : "unreachable", next.code);
  const saved = await saveAi(ctx, (s) => {
    s.classes[v.class].model = v.model;
    s.modelInfo[v.model] = next.info;
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.model_emergency_switch", { target: v.class, meta: { class: v.class, from, to: v.model, reason: v.reason } });
  // the live eval the switch owes (AI-§F.6): the first family of the class, its active server version
  let evalRunId: string | null = null;
  const family = familiesOfClass(v.class)[0];
  if (family) {
    try {
      const started = await startEvalRun({ userId: ctx.user.id }, { family, kind: "live", version: saved.value.promptVersions[family] ?? SEED_VERSIONS[family].server });
      if (started.ok) {
        evalRunId = started.runId;
        await auditFrom(ctx, "platform.ai.eval_started", { target: family, meta: { family, kind: "live", runId: started.runId, reason: "emergency_switch" } });
      }
    } catch (err) {
      console.error(`[ai] emergency switch: the follow-up eval did not start (${err instanceof Error ? err.name : "error"})`);
    }
  }
  return done({ evalRunId });
}

/** A jury (or the Worker's single judge); one containing the candidate class's model is refused at save. */
export async function saveJury(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome> {
  gate(ctx);
  const v = z.strictObject({ class: TaskClassZ, models: z.array(ModelId).min(1).max(2) }).parse(input);
  const saved = await saveAi(ctx, (s) => {
    if (v.class === "worker") s.evalGate.judgeModel = v.models[0]!;
    else if (v.class === "fast") s.evalGate.jury.fast = [v.models[0]!];
    else s.evalGate.jury[v.class] = [v.models[0]!, v.models[1] ?? v.models[0]!];
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.settings_changed", { target: "platform_ai", meta: { fields: [`evalGate.jury.${v.class}`] } });
  return done(null);
}

const RouteInput = z.strictObject({
  task: TaskIdZ,
  enabled: z.boolean().nullable().optional(),
  effort: EffortZ.nullable().optional(),
  fast: z.boolean().nullable().optional(),
  deadlineMs: z.number().int().min(5_000).max(90_000).nullable().optional(),
  maxTokens: z.number().int().min(256).max(64_000).nullable().optional(),
});

/** A per-task override (null clears a field back to the AI-§A.2 default); an effort or max_tokens change needs step-up. */
export async function saveRoute(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome> {
  gate(ctx);
  const v = RouteInput.parse(input);
  const def = TASKS[v.task];
  if (!def.class) return refuse("state");
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  const was = cur.routes[v.task] ?? {};
  if ((v.effort !== undefined && v.effort !== (was.effort ?? null)) || (v.maxTokens !== undefined && v.maxTokens !== (was.maxTokens ?? null))) gate(ctx, { stepUp: true });
  if (v.fast === true && !(/^claude-opus-(5-5|5|4-8)$/.test(cur.classes[def.class].model) && def.batch !== "always")) return refuse("fast_not_allowed");
  const saved = await saveAi(ctx, (s) => {
    const r = { ...(s.routes[v.task] ?? {}) };
    for (const k of ["enabled", "effort", "fast", "deadlineMs", "maxTokens"] as const) {
      const x = v[k];
      if (x === undefined) continue;
      if (x === null) delete r[k];
      else (r as Record<string, unknown>)[k] = x;
    }
    if (Object.keys(r).length) s.routes[v.task] = r;
    else delete s.routes[v.task];
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.settings_changed", { target: "platform_ai", meta: { fields: [`routes.${v.task}`] } });
  return done(null);
}

export async function savePrice(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome> {
  gate(ctx);
  const v = z.strictObject({ model: ModelId, row: PriceRow.nullable() }).parse(input);
  const saved = await saveAi(ctx, (s) => {
    if (v.row === null) delete s.prices[v.model];
    else s.prices[v.model] = v.row;
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.settings_changed", { target: "platform_ai", meta: { fields: [`prices.${v.model}`], removed: v.row === null } });
  return done(null);
}

/** The Director rubric version: a passing live run of director.critique on that rubric ≤ 14 days (AI-§F.6). */
export async function saveRubric(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome> {
  gate(ctx, { stepUp: true });
  const { version } = z.strictObject({ version: z.string().trim().min(1).max(16) }).parse(input);
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  if (version === cur.rubricVersion) return done(null);
  const hash = fixturesHash("director.critique");
  const ok = (await freshLiveRuns(now)).some((r) => r.task === "director.critique" && r.rubricVersion === version && r.fixturesHash === hash);
  if (!ok) return refuse("needs_live_run", "director.critique");
  const saved = await saveAi(ctx, (s) => {
    s.rubricVersion = version;
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.settings_changed", { target: "platform_ai", meta: { fields: ["rubricVersion"], from: cur.rubricVersion, to: version } });
  return done(null);
}

/* ------------------------------------------------------------------ */
/* Prompts & evals                                                     */
/* ------------------------------------------------------------------ */

const FamilyZ = z.enum(R1_FAMILIES);

/** "Run smoke eval" / "Run eval": the estimate first (`confirm: false`), then the run (AI-§F.6). */
export async function startEval(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome<{ estimate: EvalEstimate | null; runId: string | null; status: string | null }>> {
  gate(ctx);
  const v = z.strictObject({ family: FamilyZ, version: z.string().min(1).max(32), kind: z.enum(["smoke", "live"]), confirm: z.boolean() }).parse(input);
  const settings = await getPlatformSetting("platform_ai");
  const estimate = estimateEvalRun({ family: v.family, kind: v.kind, version: v.version }, settings);
  if (!estimate) return refuse("bad_version");
  if (!v.confirm) return done({ estimate, runId: null, status: null });
  const r = await startEvalRun({ userId: ctx.user.id }, { family: v.family, kind: v.kind, version: v.version });
  if (!r.ok) return refuse(r.code === "jury" ? "jury" : r.code === "no_key" ? "no_key" : r.code === "disabled" ? "disabled" : r.code === "harness_broken" ? "harness_broken" : "bad_version", r.why);
  await auditFrom(ctx, "platform.ai.eval_started", { target: v.family, meta: { family: v.family, version: v.version, kind: v.kind, runId: r.runId, estimateUsd: estimate.usd } });
  return done({ estimate, runId: r.runId, status: r.status });
}

async function versionRow(family: string, version: string): Promise<PromptVersionRow | null> {
  await ensurePromptVersions();
  // prompt_versions is a P table
  const [row] = await db.select().from(promptVersions).where(and(eq(promptVersions.task, family), eq(promptVersions.version, version))).limit(1);
  return row ?? null;
}

const VersionInput = z.strictObject({ family: FamilyZ, version: z.string().min(1).max(32) });

/** Canary: a server version with a passing smoke or live run ≤ 14 days; the slice is computed from the family's volume. */
export async function startCanary(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome<{ bp: number }>> {
  gate(ctx);
  const v = VersionInput.parse(input);
  const row = await versionRow(v.family, v.version);
  const settings = await getPlatformSetting("platform_ai", { fresh: true });
  const active = settings.promptVersions[v.family] ?? SEED_VERSIONS[v.family].server;
  if (!row || row.provider !== "server" || row.version === active || row.status === "active") return refuse("bad_version");
  if (row.status === "canary") return refuse("canary_exists");
  // prompt_versions is a P table: one canary per family
  const [other] = await db.select({ version: promptVersions.version }).from(promptVersions).where(and(eq(promptVersions.task, v.family), eq(promptVersions.status, "canary"))).limit(1);
  if (other) return refuse("canary_exists", other.version);
  const hash = fixturesHash(v.family);
  const run = (await passingRun(v.family, v.version, "smoke", hash, EVAL_MAX_AGE_DAYS, now)) ?? (await passingRun(v.family, v.version, "live", hash, EVAL_MAX_AGE_DAYS, now));
  if (!run) return refuse("no_canary_run");
  const bp = canaryBp((await familyRuns7d(now)).get(v.family) ?? 0, settings.evalGate.canary);
  // prompt_versions is a P table
  await db
    .update(promptVersions)
    .set({ status: "canary", canaryBp: bp, canaryStartedAt: now, canaryRuns: 0, rolledBackAt: null, rollbackReason: null, evalRunId: run.id })
    .where(and(eq(promptVersions.task, v.family), eq(promptVersions.version, v.version)));
  invalidateCanaries();
  await auditFrom(ctx, "platform.ai.prompt_canaried", { target: v.family, meta: { family: v.family, version: v.version, bp, runId: run.id } });
  return done({ bp });
}

/** The version becomes active; the previous active one is retired and platform_ai.promptVersions follows. */
async function activate(ctx: PlatformCtx, family: R1Family, row: PromptVersionRow, now: Date, notes: string | null): Promise<ConsoleOutcome<{ from: string }>> {
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  const from = cur.promptVersions[family] ?? SEED_VERSIONS[family].server;
  // prompt_versions is a P table: the old active retired, the new one active
  await db.update(promptVersions).set({ status: "retired" }).where(and(eq(promptVersions.task, family), eq(promptVersions.provider, "server"), eq(promptVersions.status, "active")));
  await db
    .update(promptVersions)
    .set({ status: "active", canaryBp: 0, activatedAt: now, activatedBy: ctx.user.id, ...(notes ? { notes } : {}) })
    .where(and(eq(promptVersions.task, family), eq(promptVersions.version, row.version)));
  const saved = await saveAi(ctx, (s) => {
    s.promptVersions[family] = row.version;
  });
  if (!saved.ok) return saved;
  invalidateCanaries();
  return done({ from });
}

/** Activate at the earlier promotion threshold of AI-§F.8, with a passing full live run. */
export async function activateVersion(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome<{ from: string }>> {
  gate(ctx, { stepUp: true });
  const v = VersionInput.parse(input);
  const row = await versionRow(v.family, v.version);
  if (!row || row.status !== "canary") return refuse("not_canary");
  const settings = await getPlatformSetting("platform_ai", { fresh: true });
  const { promotion } = await canaryPromotion(row, settings, now);
  if (promotion.status !== "ready") return refuse("not_ready", promotion.status === "waiting" ? promotion.reason : promotion.status);
  const out = await activate(ctx, v.family, row, now, null);
  if (out.ok) await auditFrom(ctx, "platform.ai.prompt_activated", { target: v.family, meta: { family: v.family, version: v.version, from: out.value.from, rule: promotion.rule } });
  return out;
}

/** "Activate on the offline gate alone": a canary that reached no threshold by day 28 (notes promoted-low-volume). */
export async function activateLowVolume(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome<{ from: string }>> {
  gate(ctx, { stepUp: true });
  const v = VersionInput.parse(input);
  const row = await versionRow(v.family, v.version);
  if (!row || row.status !== "canary") return refuse("not_canary");
  const settings = await getPlatformSetting("platform_ai", { fresh: true });
  const { promotion } = await canaryPromotion(row, settings, now);
  if (promotion.status !== "low_volume") return refuse("not_low_volume");
  const out = await activate(ctx, v.family, row, now, "promoted-low-volume");
  if (out.ok) await auditFrom(ctx, "platform.ai.prompt_activated", { target: v.family, meta: { family: v.family, version: v.version, from: out.value.from, lowVolume: true, days: row.canaryStartedAt ? daysBetween(row.canaryStartedAt, now) : null } });
  return out;
}

/** Roll back: a canary is retired; an active version returns the family to its frozen launch version. */
export async function rollbackVersion(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome<{ to: string | null }>> {
  gate(ctx, { stepUp: true });
  const v = VersionInput.extend({ reason: z.string().trim().min(3).max(100) }).parse(input);
  const row = await versionRow(v.family, v.version);
  if (!row || row.provider !== "server") return refuse("not_found");
  const settings = await getPlatformSetting("platform_ai", { fresh: true });
  const active = settings.promptVersions[v.family] ?? SEED_VERSIONS[v.family].server;
  const seed = SEED_VERSIONS[v.family].server;
  let to: string | null = null;
  if (row.status === "canary") {
    // prompt_versions is a P table
    await db
      .update(promptVersions)
      .set({ status: "retired", canaryBp: 0, rolledBackAt: now, rollbackReason: `manual: ${v.reason}`.slice(0, 120) })
      .where(and(eq(promptVersions.task, v.family), eq(promptVersions.version, v.version)));
    invalidateCanaries();
  } else if (row.version === active) {
    if (row.version === seed) return refuse("is_seed");
    const seedRow = await versionRow(v.family, seed);
    if (!seedRow) return refuse("not_found");
    const out = await activate(ctx, v.family, seedRow, now, null);
    if (!out.ok) return out;
    // prompt_versions is a P table
    await db.update(promptVersions).set({ rolledBackAt: now, rollbackReason: `manual: ${v.reason}`.slice(0, 120) }).where(and(eq(promptVersions.task, v.family), eq(promptVersions.version, v.version)));
    to = seed;
  } else return refuse("state");
  await auditFrom(ctx, "platform.ai.prompt_rolled_back", { target: v.family, meta: { family: v.family, version: v.version, to, reason: v.reason, manual: true } });
  return done({ to });
}

/** The native reviewer's labels of the 40-case naturalness slice: one `calibration` run (seeds KPI 9). */
export async function recordCalibration(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome<{ runId: string; mean: number | null; min: number | null; pass: boolean }>> {
  gate(ctx);
  const cases = new Set(naturalnessCases().map((c) => c.id));
  const v = z.strictObject({ labels: z.array(z.strictObject({ caseId: z.string().min(1).max(80), score: z.number().int().min(1).max(5) })).min(1).max(60) }).parse(input);
  const labels = v.labels.filter((l, i, all) => cases.has(l.caseId) && all.findIndex((x) => x.caseId === l.caseId) === i);
  if (!labels.length) return refuse("state");
  const verdict = naturalnessVerdict(labels.map((l) => l.score));
  const id = newId();
  // ai_eval_runs is a P table: a human calibration run, its labels in the report
  await db.insert(aiEvalRuns).values({
    id,
    kind: "calibration",
    task: "copy.page",
    promptVersion: SEED_VERSIONS["copy.page"].server,
    fixturesHash: sha256Hex([...cases].sort().join("\n")),
    status: "done",
    passed: verdict.pass,
    report: JSON.stringify({ slice: "naturalness", labels, mean: verdict.mean, min: verdict.min }),
    startedBy: ctx.user.id,
    createdAt: now,
    doneAt: now,
  });
  await auditFrom(ctx, "platform.ai.calibration_recorded", { target: id, meta: { slice: "naturalness", n: labels.length, mean: verdict.mean, min: verdict.min, pass: verdict.pass } });
  return done({ runId: id, mean: verdict.mean, min: verdict.min, pass: verdict.pass });
}

/** The paired blind preference test (AI-19 acceptance (10)): a `preference` run; a passing one is recorded on platform_ai. */
export async function recordPreference(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome<{ runId: string; pass: boolean }>> {
  gate(ctx);
  const v = z.strictObject({ lowerBound: z.number().min(0).max(1), pairs: z.number().int().min(1).max(10_000), note: z.string().trim().max(300).optional() }).parse(input);
  const pass = v.lowerBound >= PREFERENCE_PASS_LOWER_BOUND && v.pairs >= 60;
  const id = newId();
  // ai_eval_runs is a P table
  await db.insert(aiEvalRuns).values({
    id,
    kind: "preference",
    task: "director.critique",
    promptVersion: SEED_VERSIONS["director.critique"].server,
    rubricVersion: (await getPlatformSetting("platform_ai")).rubricVersion,
    fixturesHash: fixturesHash("director.critique"),
    status: "done",
    passed: pass,
    report: JSON.stringify({ lowerBound: v.lowerBound, pairs: v.pairs, note: v.note ?? null }),
    startedBy: ctx.user.id,
    createdAt: now,
    doneAt: now,
  });
  if (pass) {
    const saved = await saveAi(ctx, (s) => {
      s.preferenceTest = { runId: id, lowerBound: v.lowerBound, at: now.toISOString() };
    });
    if (!saved.ok) return saved;
  }
  await auditFrom(ctx, "platform.ai.preference_recorded", { target: id, meta: { lowerBound: v.lowerBound, pairs: v.pairs, pass } });
  return done({ runId: id, pass });
}

/** The Director default switch: "Auto by default" only with the recorded passing preference run. */
export async function setDirectorDefault(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome> {
  gate(ctx);
  const { auto } = z.strictObject({ auto: z.boolean() }).parse(input);
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  if (auto) {
    const t = cur.preferenceTest;
    if (!t || t.lowerBound < PREFERENCE_PASS_LOWER_BOUND) return refuse("needs_preference");
    // ai_eval_runs is a P table: the recorded run must exist and have passed
    const [run] = await db.select({ passed: aiEvalRuns.passed }).from(aiEvalRuns).where(and(eq(aiEvalRuns.id, t.runId), eq(aiEvalRuns.kind, "preference"))).limit(1);
    if (!run?.passed) return refuse("needs_preference");
  }
  if (cur.directorAutoDefault === auto) return done(null);
  const saved = await saveAi(ctx, (s) => {
    s.directorAutoDefault = auto;
  });
  if (!saved.ok) return saved;
  await auditFrom(ctx, "platform.ai.director_default_changed", { target: "platform_ai", meta: { from: cur.directorAutoDefault ? "auto" : "ask", to: auto ? "auto" : "ask" } });
  return done(null);
}

/* ------------------------------------------------------------------ */
/* Batches, screened rows                                              */
/* ------------------------------------------------------------------ */

export async function cancelBatch(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<ConsoleOutcome> {
  gate(ctx);
  const { id } = z.strictObject({ id: z.string().min(1).max(64) }).parse(input);
  // ai_batches is a P table
  const [b] = await db.select().from(aiBatches).where(eq(aiBatches.id, id)).limit(1);
  if (!b) return refuse("not_found");
  if (b.status === "building") {
    await unmarkSubmitted(b.id, now);
    await updateBatch(b.id, { status: "failed", error: "canceled by staff", endedAt: now });
  } else if (b.status === "submitted" || b.status === "in_progress") {
    if (b.providerBatchId) {
      const client = await anthropic();
      if (!client) return refuse("no_key");
      try {
        await client.messages.batches.cancel(b.providerBatchId);
      } catch (err) {
        return refuse("unreachable", fromSdkError(err).code);
      }
    }
    // the ai.batches cron sees it end and ingests what finished (the canceled items take their fallback)
    await updateBatch(b.id, { status: "canceling" });
  } else return refuse("state");
  await auditFrom(ctx, "platform.ai.batch_canceled", { target: b.id, meta: { kind: b.kind, items: b.items, from: b.status } });
  return done(null);
}

/** The batch's failed items (errored, expired, dropped) queued again for the next submission. */
export async function retryBatchItems(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome<{ items: number }>> {
  gate(ctx);
  const { batchId } = z.strictObject({ batchId: z.string().min(1).max(64) }).parse(input);
  // tenancy: platform ai_batch_items of one batch across stores (AI-§K.2 retry failed items): state only, payloads untouched
  const [res] = await db
    .update(aiBatchItems)
    .set({ state: "queued", batchId: null })
    .where(and(eq(aiBatchItems.batchId, batchId), inArray(aiBatchItems.state, ["errored", "expired", "dropped"])));
  const items = (res as { affectedRows?: number }).affectedRows ?? 0;
  // audited under its own name once CCR r1-p7-15 adds `platform.ai.batch_retried` to the shared union
  await auditFrom(ctx, "platform.ai.settings_changed", { target: batchId, meta: { op: "batch_retry", items } });
  return done({ items });
}

/** Clears `injection_suspected` on a screened row (task injection.screen) after a human look (AI-§E.3 step 4). */
export async function clearScreened(ctx: PlatformCtx, input: unknown): Promise<ConsoleOutcome> {
  gate(ctx);
  const { runId } = z.strictObject({ runId: z.string().length(26) }).parse(input);
  // tenancy: platform one ai_runs row by id (the console's human look at a screened row): metadata only
  const [row] = await db.select({ storeId: aiRuns.storeId, task: aiRuns.task, flags: aiRuns.flags }).from(aiRuns).where(eq(aiRuns.id, runId)).limit(1);
  if (!row) return refuse("not_found");
  if (row.task !== "injection.screen" || !(row.flags ?? []).includes("injection_suspected")) return refuse("not_screened");
  const flags = (row.flags ?? []).filter((f) => f !== "injection_suspected");
  // tenancy: platform the flag of that one row, the staff action AI-§E.3 names (audited); nothing else changes
  await db.update(aiRuns).set({ flags }).where(eq(aiRuns.id, runId));
  await auditFrom(ctx, "platform.ai.screen_cleared", { target: runId, storeId: row.storeId, meta: { runId } });
  return done(null);
}
