import "server-only";
/**
 * The `ai_eval_runs` rows (P7 AI; ai.md AI-§F.6 "Runs", AI-§M.2; AI-07 (3), (4)). A P table (no store column): the
 * platform's own eval runs, one row per run with its per-family fixtures hash, the candidate's cost and the judge's
 * cost apart (judge spend neither hides nor dampens differences between versions), the gate verdict and the report
 * (≤ 256 KB, nulled after 180 days by `ai.retention`).
 */
import { and, desc, eq, gte, lt, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiEvalRuns } from "@/lib/db/schema";

export type EvalRunRow = typeof aiEvalRuns.$inferSelect;
export type EvalRunKind = EvalRunRow["kind"];

/** The report column's cap (AI-§M.2). */
export const EVAL_REPORT_MAX_BYTES = 256 * 1024;

export async function insertEvalRun(r: Pick<EvalRunRow, "id" | "kind" | "task" | "model" | "promptVersion" | "rubricVersion" | "fixturesHash" | "baselineVersion" | "judgeModel" | "judgeVersion" | "status" | "startedBy"> & { now: Date }): Promise<void> {
  const { now, ...row } = r;
  await db.insert(aiEvalRuns).values({ ...row, createdAt: now });
}

export async function updateEvalRun(id: string, set: Partial<Omit<EvalRunRow, "id" | "createdAt">>): Promise<void> {
  const report = set.report;
  const bounded = report && Buffer.byteLength(report, "utf8") > EVAL_REPORT_MAX_BYTES ? JSON.stringify({ truncated: true, bytes: Buffer.byteLength(report, "utf8") }) : report;
  await db.update(aiEvalRuns).set({ ...set, ...(report !== undefined ? { report: bounded } : {}) }).where(eq(aiEvalRuns.id, id));
}

export async function getEvalRun(id: string): Promise<EvalRunRow | null> {
  const [row] = await db.select().from(aiEvalRuns).where(eq(aiEvalRuns.id, id)).limit(1);
  return row ?? null;
}

/** The family's runs, newest first (the console's Prompts & evals tab). */
export async function evalRunsOf(family: string, limit = 20): Promise<EvalRunRow[]> {
  return db.select().from(aiEvalRuns).where(eq(aiEvalRuns.task, family)).orderBy(desc(aiEvalRuns.createdAt)).limit(limit);
}

/** A passing run of a kind on this fixtures hash within `maxAgeDays` (AI-§F.6: what canarying or promoting needs). */
export async function passingRun(family: string, version: string, kind: EvalRunKind, fixturesHash: string, maxAgeDays = 14, now = new Date()): Promise<EvalRunRow | null> {
  const [row] = await db
    .select()
    .from(aiEvalRuns)
    .where(and(eq(aiEvalRuns.task, family), eq(aiEvalRuns.promptVersion, version), eq(aiEvalRuns.kind, kind), eq(aiEvalRuns.fixturesHash, fixturesHash), eq(aiEvalRuns.passed, true), gte(aiEvalRuns.createdAt, new Date(now.getTime() - maxAgeDays * 86_400_000))))
    .orderBy(desc(aiEvalRuns.createdAt))
    .limit(1);
  return row ?? null;
}

/** Retention (core §H.11): reports older than 180 days nulled, in slices. */
export async function nullOldReports(before: Date, limit: number): Promise<number> {
  const [res] = await db.update(aiEvalRuns).set({ report: null }).where(and(lt(aiEvalRuns.createdAt, before), isNotNull(aiEvalRuns.report))).limit(limit);
  return (res as { affectedRows?: number }).affectedRows ?? 0;
}
