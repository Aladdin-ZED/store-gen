import "server-only";
/**
 * The `ai_jobs` repository, read side (P7 AI; ai.md AI-§B.13, AI-§A.4 `cloud.deepPass`, AI-§E.5; docs/STORE-SAAS.md
 * §E.3). `getAiJob` is the view `GET /api/app/<h>/ai/jobs/[id]` answers with (null for another store's id), and
 * `activeJobsFor` the viewer's own queued and running jobs (the progress chip, `cancelStoreAiJobs`). Claim, advance,
 * cancel and recovery arrive with the job runner (step 8); they write through a system or member `WriteScope`.
 * The view is metadata and the job's own result references only: never the input, never a prompt.
 */
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiJobs, type CriticPicks } from "@/lib/db/schema";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import type { AiTaskId } from "../tasks";

export type AiJobRowKind = (typeof aiJobs.$inferSelect)["kind"];
export type AiJobStatus = (typeof aiJobs.$inferSelect)["status"];

export interface AiJobView {
  id: string;
  kind: AiJobRowKind;
  task: AiTaskId;
  status: AiJobStatus;
  /** the stage running or last run ("read", "critique", "blueprint:2", "batch:<stage>", …) */
  stage: string | null;
  progress: { done: number; total: number; stages: Record<string, "done" | "running" | "failed"> };
  transport: "job" | "batch";
  /** the class that served it (`director_interactive` after a fallback) */
  class: "director_deep" | "director_interactive";
  /** set when done (or failed with the instant result kept) */
  result: { runIds: string[]; outputRef?: string; instant?: unknown; critique?: CriticPicks } | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
}

type JobRow = typeof aiJobs.$inferSelect;

function toView(r: JobRow): AiJobView {
  const p = r.progress;
  return {
    id: r.id,
    kind: r.kind,
    task: r.task as AiTaskId,
    status: r.status,
    stage: r.stage,
    progress: { done: p?.done ?? 0, total: p?.total ?? 0, stages: { ...(p?.stages ?? {}) } },
    transport: r.transport,
    class: r.class,
    result: r.status === "done" || r.status === "failed" ? (r.result ?? null) : null,
    error: r.error,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
  };
}

/** One job of the scope's store; null for a missing id or another store's. */
export async function getAiJob(scope: StoreScope, id: string): Promise<AiJobView | null> {
  const [row] = await db.select().from(aiJobs).where(byId(aiJobs, scope, id)).limit(1);
  return row ? toView(row) : null;
}

/** The viewer's own queued and running jobs, newest first (≤ 20). */
export async function activeJobsFor(scope: StoreScope, viewer: { userId: string }): Promise<AiJobView[]> {
  const rows = await db
    .select()
    .from(aiJobs)
    .where(whereStore(aiJobs, scope, eq(aiJobs.createdBy, viewer.userId), inArray(aiJobs.status, ["queued", "running"])))
    .orderBy(desc(aiJobs.createdAt))
    .limit(20);
  return rows.map(toView);
}

/** The deep kinds share one slot per store (`aj_active_uq` + AI-§A.4 `cloud.deepPass`). */
const DEEP_KINDS = ["director_deep", "store_blueprint", "logo_system"] as const;

/** True while one of the store's deep jobs is queued or running (`active = '1'`). */
export async function hasActiveDeepJob(scope: StoreScope): Promise<boolean> {
  const [row] = await db
    .select({ id: aiJobs.id })
    .from(aiJobs)
    .where(whereStore(aiJobs, scope, isNotNull(aiJobs.active), inArray(aiJobs.kind, [...DEEP_KINDS])))
    .limit(1);
  return row !== undefined;
}
