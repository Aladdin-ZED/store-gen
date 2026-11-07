"use server";
/**
 * The policies editor's write (P3 LANDING; landing.md LAN-§3.3, §8.5, §23.1; docs/STORE-SAAS.md D76, §I.8): the whole
 * `policies` key, `return storeAction("settings.write", …)` with the browser's op id. The write itself (brand check of
 * every free-text field, `reviewedAt`, audit `store.policies.updated`, the `policies` re-render of the live pages, the
 * revalidation) is `savePolicies` of src/lib/landing/policies.server.ts (extracted at the R2 contract step C2-E so
 * S7's AI-10 translations go through the same write); the owner's own save is a reviewed one. The legal pages read the
 * facts at serve time, so they change at once.
 */
import { onceForStore } from "@/lib/landing/op-once.server";
import { savePolicies, type PoliciesInput, type SavePoliciesResult } from "@/lib/landing/policies.server";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

export type { PoliciesInput, SavePoliciesResult } from "@/lib/landing/policies.server";

export async function savePoliciesAction(opId: string, input: PoliciesInput): Promise<ActionResult<SavePoliciesResult>> {
  return storeAction("settings.write", (ctx) => onceForStore(ctx.scope, opId, () => savePolicies(ctx, input, { reviewed: true })));
}
