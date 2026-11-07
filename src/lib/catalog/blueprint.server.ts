import "server-only";
/**
 * Applying a store blueprint (storefront.md STO-§11.5, AI-11 consumer). Track S1 STOREFRONT owns this file in R2 and
 * writes both bodies. The contract step (C2-C) froze the two entry points S7 AI DATA's blueprint UI and job results
 * call (S7 merges after S1, STO-§27.4, but builds against these):
 *   - `startStoreDesign(ctx)`: the three instant candidates at once (< 2 s) and, when Cloud AI and
 *     `store_ai.deepPass` allow, the `ai_jobs` row (kind `store_blueprint`, pattern B) through `enqueueAiJob`;
 *   - `applyStoreBlueprint(ctx, bp)`: draft collections (`assertOwned`), the `@home` draft (StorePageDoc +
 *     `checkHomeDoc`, invalid slots dropped and listed), draft custom pages flagged `needsReview`; never publishes; audit
 *     `store.storefront.blueprint_applied`.
 * Stubs until S1 merges: both throw `NotBuiltYet("S1", …)`. No R1 path calls them.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { StoreCtx, WriteCtx } from "@/lib/tenancy/types";
import type { StoreBlueprint } from "./blueprint";

export type { StoreBlueprint } from "./blueprint";

/** Interactive entry: the instant candidates (3) and, when allowed, the deep job's id. S1 (stub: NotBuiltYet). */
export async function startStoreDesign(ctx: StoreCtx): Promise<{ instant: { candidates: StoreBlueprint[] }; job: { jobId: string } | null }> {
  void ctx;
  return notBuiltYet("S1", "startStoreDesign");
}

/** Apply a blueprint as drafts (never publishes). S1 (stub: NotBuiltYet). */
export async function applyStoreBlueprint(ctx: WriteCtx, bp: StoreBlueprint): Promise<{ collections: string[]; homeDraftVersionId: string; pages: string[]; dropped: string[] }> {
  void ctx;
  void bp;
  return notBuiltYet("S1", "applyStoreBlueprint");
}
