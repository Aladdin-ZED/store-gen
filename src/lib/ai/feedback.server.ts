import "server-only";
/**
 * AI provenance and publish feedback (P7 AI; ai.md AI-§G, AI R22, QUAL-24; docs/STORE-SAAS.md §M.1 rule 4, §K.2 P0 ai
 * stubs). `linkAiRuns` ties the wizard's runs to the page the generate action created (`ai_runs.ref_kind = 'page'`,
 * ≤ 12 store-checked ULIDs); `recordPublishFeedback` is the ai publish listener's body (the one caller, §M.1 rule 4):
 * kept / edited signals per field, never throwing. Frozen at P0 (src/lib/contracts/r1-p0.ts). `linkAiRuns` is real from
 * P7 step 6 (provenance in R1); `recordPublishFeedback` stays the P0 no-op, since `ai_feedback` is a 0006 table (QUAL-24).
 */
import { inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiRuns } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";

/** the wizard's runs of one generation (AI-§G, ≤ 12 store-checked ULIDs) */
export const MAX_LINKED = 12;

const RUN_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const REF_KIND_RE = /^[a-z][a-z0-9_]{0,23}$/;
const REF_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Provenance (AI-D35, R1 decision): one scoped UPDATE sets `ref_kind` / `ref_id` on at most 12 of the store's own runs
 * that carry no ref yet; another store's id matches nothing, an id that is not a ULID is ignored, and a run already
 * linked keeps its first ref. No feedback row is written (that is `ai_feedback`, 0006). A bad ref throws a RangeError
 * (a programming error of the caller); nothing is written then.
 */
export async function linkAiRuns(scope: WriteScope, runIds: readonly string[], ref: { kind: string; id: string }): Promise<void> {
  if (!REF_KIND_RE.test(ref.kind) || !REF_ID_RE.test(ref.id)) throw new RangeError("ai: linkAiRuns needs a ref { kind, id }");
  const ids = [...new Set(runIds.filter((id) => typeof id === "string" && RUN_ID_RE.test(id)))].slice(0, MAX_LINKED);
  if (ids.length === 0) return;
  await db
    .update(aiRuns)
    .set({ refKind: ref.kind, refId: ref.id })
    .where(whereStore(aiRuns, scope, inArray(aiRuns.id, ids), isNull(aiRuns.refKind)));
}

/** Never throws (a publish listener). */
export async function recordPublishFeedback(scope: WriteScope, pageId: string, versionId: string): Promise<void> {
  void scope;
  void pageId;
  void versionId;
}
