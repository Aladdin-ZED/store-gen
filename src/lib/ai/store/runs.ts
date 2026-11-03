import "server-only";
/**
 * The `ai_runs` repository (P7 AI; ai.md AI-§A.4 steps 5 and 9, AI-§E.5, AI-§M.1, AI-§K.1 "Recent AI activity";
 * docs/STORE-SAAS.md §E.3, D70, D71). Every function takes the scope first; writes take a `WriteScope`.
 *
 *   - `insertRun`: one row per call, `status = 'running'` (or a finished cache / report row in one statement);
 *   - `finishRun`: status, usage, served model, `stop_reason`, rejected fields, flags, timings, the output (≤ 64 KB,
 *     dropped above) and `reconciled_at` in the same statement as the run update (AI-§C.2 step 4);
 *   - `recentRuns`: the last runs as metadata only (never an input, a prompt or an output: Settings → AI and the
 *     console read it, and an impersonating staff member may see it, D70);
 *   - `monthCreditsByTask` / `monthCreditsByGroup`: the credits of a store-time month per task and per task group;
 *   - `insertReportRows`: the browser's local-run telemetry (`via = 'report'`, 0 credits, metadata only).
 * No customer field reaches any column here (SF-05, AI-§E.1): the rows carry task metadata, hashes and model text.
 */
import { desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { aiRuns, type AiFlag } from "@/lib/db/schema";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { sha256Hex } from "../prompts/sha256";
import { periodRangeUtc } from "../quota/periods";
import { AI_TASK_IDS, TASKS, type AiProviderId, type AiSurface, type AiTaskId, type Effort, type TaskClass } from "../tasks";

/** ai_runs.output and ai_cache.output (AI-§M.1): larger outputs are not stored (the run row keeps its metadata). */
export const OUTPUT_MAX_BYTES = 64 * 1024;

export type RunStatus = (typeof aiRuns.$inferSelect)["status"];
export type RunVia = (typeof aiRuns.$inferSelect)["via"];
export type RunStage = "plan" | "critique" | "verify" | "copy" | "judge" | "blueprint" | "logo" | "report";

/** The serialized output when it fits in 64 KB, else null. */
export function boundedOutput(output: unknown): unknown {
  if (output === undefined || output === null) return null;
  const text = JSON.stringify(output);
  return text !== undefined && Buffer.byteLength(text, "utf8") <= OUTPUT_MAX_BYTES ? output : null;
}

export interface NewRun {
  /** the reservation's run id (a ULID); minted here when absent */
  id?: string;
  userId: string | null;
  task: AiTaskId;
  surface?: AiSurface;
  provider: AiProviderId;
  via: RunVia;
  class?: TaskClass | null;
  stage?: RunStage | null;
  jobId?: string | null;
  requestedModel?: string | null;
  effort?: Effort | null;
  speed?: "standard" | "fast" | null;
  promptVersion?: string | null;
  rubricVersion?: string | null;
  inputHash: string;
  locale?: string | null;
  reservedCredits?: number | null;
  parentRunId?: string | null;
  batchItemId?: string | null;
  /** a row born finished (a cache hit, a report): written in the insert itself */
  finished?: RunFinish;
}

export interface RunUsage {
  inTok: number;
  outTok: number;
  cacheReadTok: number;
  cacheWriteTok: number;
}

export interface RunFinish {
  status: Exclude<RunStatus, "running">;
  errorCode?: string | null;
  /** the serving model (response.model) */
  model?: string | null;
  stopReason?: string | null;
  usage?: RunUsage | null;
  costMicros?: number | null;
  credits?: number | null;
  flags?: readonly AiFlag[];
  rejectedFields?: readonly string[];
  ms: number;
  ttftMs?: number | null;
  output?: unknown;
  /** the reservation was reconciled or released in this step (reconciled_at = now) */
  reconciled?: boolean;
}

const cut = (v: string | null | undefined, n: number): string | null => (v == null ? null : v.slice(0, n));
const int = (v: number | null | undefined): number | null => (v == null || !Number.isFinite(v) ? null : Math.max(0, Math.round(v)));

function finishColumns(f: RunFinish, now: Date) {
  return {
    status: f.status,
    errorCode: cut(f.errorCode, 40),
    model: cut(f.model, 64),
    stopReason: cut(f.stopReason, 48),
    inTok: int(f.usage?.inTok),
    outTok: int(f.usage?.outTok),
    cacheReadTok: int(f.usage?.cacheReadTok),
    cacheWriteTok: int(f.usage?.cacheWriteTok),
    costMicros: int(f.costMicros),
    credits: int(f.credits),
    flags: f.flags && f.flags.length ? [...new Set(f.flags)] : null,
    rejectedFields: f.rejectedFields && f.rejectedFields.length ? f.rejectedFields.slice(0, 64).map((x) => x.slice(0, 80)) : null,
    ms: int(f.ms) ?? 0,
    ttftMs: int(f.ttftMs),
    output: boundedOutput(f.output),
    reconciledAt: f.reconciled ? now : null,
  };
}

/** Inserts one run row (AI-§A.4 step 5); returns its id. */
export async function insertRun(scope: WriteScope, run: NewRun): Promise<string> {
  const id = run.id ?? newId();
  const now = new Date();
  await db.insert(aiRuns).values(
    storeValues(scope, {
      id,
      userId: run.userId,
      task: run.task,
      surface: run.surface ?? "system",
      provider: run.provider,
      via: run.via,
      class: run.class ?? null,
      stage: run.stage ?? null,
      jobId: run.jobId ?? null,
      requestedModel: cut(run.requestedModel, 64),
      effort: run.effort ?? null,
      speed: run.speed ?? null,
      promptVersion: cut(run.promptVersion, 32),
      rubricVersion: cut(run.rubricVersion, 16),
      inputHash: run.inputHash,
      locale: cut(run.locale, 5),
      reservedCredits: int(run.reservedCredits),
      parentRunId: run.parentRunId ?? null,
      batchItemId: run.batchItemId ?? null,
      ...(run.finished ? finishColumns(run.finished, now) : { status: "running" as const, ms: 0 }),
      createdAt: now,
    }),
  );
  return id;
}

/** Writes the end of a run (AI-§A.4 step 9); `reconciled_at` in the same statement. False when no such row of the store. */
export async function finishRun(scope: WriteScope, id: string, f: RunFinish): Promise<boolean> {
  const [res] = await db.update(aiRuns).set(finishColumns(f, new Date())).where(byId(aiRuns, scope, id));
  return (res as { affectedRows?: number }).affectedRows === 1;
}

/** One run as the console and Settings → AI show it: metadata only. */
export interface RunMeta {
  id: string;
  at: string;
  task: AiTaskId;
  class: TaskClass | null;
  provider: AiProviderId;
  via: RunVia;
  model: string | null;
  promptVersion: string | null;
  status: RunStatus;
  errorCode: string | null;
  credits: number;
  ms: number | null;
  flags: AiFlag[];
}

const META = {
  id: aiRuns.id,
  createdAt: aiRuns.createdAt,
  task: aiRuns.task,
  class: aiRuns.class,
  provider: aiRuns.provider,
  via: aiRuns.via,
  model: aiRuns.model,
  promptVersion: aiRuns.promptVersion,
  status: aiRuns.status,
  errorCode: aiRuns.errorCode,
  credits: aiRuns.credits,
  ms: aiRuns.ms,
  flags: aiRuns.flags,
};

function toMeta(r: { id: string; createdAt: Date; task: string; class: TaskClass | null; provider: AiProviderId; via: RunVia; model: string | null; promptVersion: string | null; status: RunStatus; errorCode: string | null; credits: number | null; ms: number; flags: AiFlag[] | null }): RunMeta {
  return {
    id: r.id,
    at: r.createdAt.toISOString(),
    task: r.task as AiTaskId,
    class: r.class,
    provider: r.provider,
    via: r.via,
    model: r.model,
    promptVersion: r.promptVersion,
    status: r.status,
    errorCode: r.errorCode,
    credits: r.credits ?? 0,
    ms: r.status === "running" ? null : r.ms,
    flags: r.flags ?? [],
  };
}

/** The store's latest runs, newest first (≤ 50), metadata only. */
export async function recentRuns(scope: StoreScope, limit = 50): Promise<RunMeta[]> {
  const n = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await db.select(META).from(aiRuns).where(whereStore(aiRuns, scope)).orderBy(desc(aiRuns.createdAt), desc(aiRuns.id)).limit(n);
  return rows.map(toMeta);
}

/** One run of the store by id, metadata only; null for another store's id (`runs/[id]`, AI-§Q.2). */
export async function getRunMeta(scope: StoreScope, id: string): Promise<RunMeta | null> {
  const [row] = await db.select(META).from(aiRuns).where(byId(aiRuns, scope, id)).limit(1);
  return row ? toMeta(row) : null;
}

/** The credits and cost of a store-time month ("YYYY-MM") per task. */
export async function monthCreditsByTask(scope: StoreScope, month: string, timezone: string): Promise<{ task: AiTaskId; runs: number; credits: number; costMicros: number }[]> {
  const { start, end } = periodRangeUtc(month, timezone);
  const rows = await db
    .select({
      task: aiRuns.task,
      runs: sql<number>`COUNT(*)`,
      credits: sql<number>`COALESCE(SUM(${aiRuns.credits}), 0)`,
      costMicros: sql<number>`COALESCE(SUM(${aiRuns.costMicros}), 0)`,
    })
    .from(aiRuns)
    .where(whereStore(aiRuns, scope, gte(aiRuns.createdAt, start), lt(aiRuns.createdAt, end)))
    .groupBy(aiRuns.task);
  return rows.filter((r) => (AI_TASK_IDS as readonly string[]).includes(r.task)).map((r) => ({ task: r.task as AiTaskId, runs: Number(r.runs), credits: Number(r.credits), costMicros: Number(r.costMicros) }));
}

/** The task groups Settings → AI shows credits by. */
export type TaskGroup = "copy" | "director" | "photos" | "ops" | "other";

export function taskGroupOf(task: AiTaskId): TaskGroup {
  if (task.startsWith("copy.")) return "copy";
  if (TASKS[task].caps?.passCounter || task === "critique.doc") return "director";
  if (task === "analyze" || task === "classify" || task === "removeBackground" || task === "image.studio" || task === "media.alt") return "photos";
  if (task === "callcenter.script" || task === "ad.brief" || task === "offers.advise" || task === "risk.explain") return "ops";
  return "other";
}

export async function monthCreditsByGroup(scope: StoreScope, month: string, timezone: string): Promise<{ total: { credits: number; costMicros: number }; groups: Record<TaskGroup, number> }> {
  const groups: Record<TaskGroup, number> = { copy: 0, director: 0, photos: 0, ops: 0, other: 0 };
  let credits = 0;
  let costMicros = 0;
  for (const r of await monthCreditsByTask(scope, month, timezone)) {
    groups[taskGroupOf(r.task)] += r.credits;
    credits += r.credits;
    costMicros += r.costMicros;
  }
  return { total: { credits, costMicros }, groups };
}

/** The sum of `ai_runs.cost_micros` of a store-time month (aiUsageForStore). */
export async function monthCostMicros(scope: StoreScope, month: string, timezone: string): Promise<number> {
  const { start, end } = periodRangeUtc(month, timezone);
  const [row] = await db
    .select({ micros: sql<number>`COALESCE(SUM(${aiRuns.costMicros}), 0)` })
    .from(aiRuns)
    .where(whereStore(aiRuns, scope, gte(aiRuns.createdAt, start), lt(aiRuns.createdAt, end)));
  return Number(row?.micros ?? 0);
}

/** `POST /ai/report` (AI-§A.7): local-run telemetry, metadata only, at most 20 rows per request. */
export const LocalReport = z.strictObject({
  task: z.enum(AI_TASK_IDS),
  provider: z.enum(["local", "library"]).default("local"),
  model: z.string().trim().min(1).max(64).nullable().default(null),
  promptVersion: z.string().trim().min(1).max(32).nullable().default(null),
  ms: z.number().int().min(0).max(600_000),
  status: z.enum(["ok", "invalid_output", "timeout", "error", "cancelled"]),
  rejected: z.array(z.string().trim().min(1).max(80)).max(64).default([]),
  locale: z.enum(["ar", "fr", "en"]).nullable().default(null),
  surface: z.enum(["onboarding", "wizard", "builder", "settings", "catalog", "ops", "copilot", "dashboard"]).default("wizard"),
});
export type LocalReport = z.output<typeof LocalReport>;

export async function insertReportRows(scope: WriteScope, userId: string | null, reports: readonly LocalReport[]): Promise<string[]> {
  if (reports.length > 20) throw new RangeError("ai: at most 20 report rows per request");
  const ids: string[] = [];
  for (const r of reports) {
    ids.push(
      await insertRun(scope, {
        userId,
        task: r.task,
        surface: r.surface,
        provider: r.provider,
        via: "report",
        stage: "report",
        requestedModel: r.model,
        promptVersion: r.promptVersion,
        // no input is ever sent: the hash names the report kind, so a report never matches a cache key
        inputHash: sha256Hex(`report:${r.task}:${r.promptVersion ?? ""}`),
        locale: r.locale,
        finished: { status: r.status, model: r.model, credits: 0, costMicros: 0, ms: r.ms, rejectedFields: r.rejected },
      }),
    );
  }
  return ids;
}

/** Runs of the store still `running` (the policy's busy line, the job views); never another store's. */
export async function runningRuns(scope: StoreScope, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(aiRuns)
    .where(whereStore(aiRuns, scope, eq(aiRuns.status, "running"), gte(aiRuns.createdAt, since)));
  return Number(row?.n ?? 0);
}

/** The run ids of one of the store's jobs, oldest first (the job view, ./jobs.ts). */
export async function runIdsOfJob(scope: StoreScope, jobId: string): Promise<string[]> {
  const rows = await db.select({ id: aiRuns.id }).from(aiRuns).where(whereStore(aiRuns, scope, eq(aiRuns.jobId, jobId))).orderBy(aiRuns.createdAt);
  return rows.map((r) => r.id);
}

/** What one of the store's jobs cost so far: the sum over its run rows (the job's reconcile, AI-§B.13). */
export async function jobCost(scope: StoreScope, jobId: string): Promise<{ micros: number; credits: number; runs: number }> {
  const [row] = await db
    .select({ micros: sql<number>`COALESCE(SUM(${aiRuns.costMicros}), 0)`, credits: sql<number>`COALESCE(SUM(${aiRuns.credits}), 0)`, runs: sql<number>`COUNT(*)` })
    .from(aiRuns)
    .where(whereStore(aiRuns, scope, eq(aiRuns.jobId, jobId)));
  return { micros: Number(row?.micros ?? 0), credits: Number(row?.credits ?? 0), runs: Number(row?.runs ?? 0) };
}
