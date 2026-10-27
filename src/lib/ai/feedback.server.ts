import "server-only";
/**
 * AI provenance and publish feedback (P7 AI; ai.md AI-§G, AI R22, QUAL-24; docs/STORE-SAAS.md §M.1 rule 4, §K.2 P0 ai
 * stubs). `linkAiRuns` ties the wizard's runs to the page the generate action created (`ai_runs.ref_kind = 'page'`,
 * ≤ 12 store-checked ULIDs); `recordPublishFeedback` is the ai publish listener's body (the one caller, §M.1 rule 4):
 * kept / edited signals per field, never throwing. Frozen at P0 (src/lib/contracts/r1-p0.ts). P0 stubs: no-ops, since
 * no `ai_runs` row exists to link before P7 writes them, and `ai_feedback` is a 0006 table (QUAL-24).
 */
import type { WriteScope } from "@/lib/tenancy/types";

export async function linkAiRuns(scope: WriteScope, runIds: readonly string[], ref: { kind: string; id: string }): Promise<void> {
  void scope;
  void runIds;
  void ref;
}

/** Never throws (a publish listener). */
export async function recordPublishFeedback(scope: WriteScope, pageId: string, versionId: string): Promise<void> {
  void scope;
  void pageId;
  void versionId;
}
