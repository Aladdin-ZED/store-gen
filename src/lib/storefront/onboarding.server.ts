import "server-only";
/**
 * The store-mode onboarding entry point (storefront.md STO-§4.5 rev 4; core §A.2 / §K.4, OPS-14, PLA Q3.8). Track S1
 * STOREFRONT owns this file in R2. The contract step (C2-C) froze `setThemeDraft(ctx, direction)` for S6 PLATFORM UX's
 * `useDirectionAction` (the store-mode branch of the onboarding reveal, with `createProduct(ctx, { facts })` and the
 * direction-aware `productAsPageDoc`).
 *
 * The body (S1): hand the direction's genome to S2's store-theme writer (`writeThemeDraft`, source "onboarding",
 * src/lib/design/store-theme.server.ts; design owns `store_themes`, S1 never writes it) as the store's DRAFT theme
 * version, and record the drawn PDP family as the `@product` template draft's `productDetail` variant
 * (`ensureTemplateSet` creates the row first); nothing is published. Stub until S1 merges: throws
 * `NotBuiltYet("S1", "setThemeDraft")`. No R1 path calls it.
 */
import { notBuiltYet } from "@/lib/contracts/not-built";
import type { PageGenes } from "@/lib/design/genome";
import type { WriteCtx } from "@/lib/tenancy/types";
import type { PdpFamily } from "@/storefront/fold";

/** The chosen onboarding direction becomes the store's draft theme and the PDP template's family. S1 (stub: NotBuiltYet). */
export async function setThemeDraft(ctx: WriteCtx, direction: { key: string; genome: PageGenes }): Promise<{ themeDraftVersion: number; pdpFamily: PdpFamily }> {
  void ctx;
  void direction;
  return notBuiltYet("S1", "setThemeDraft");
}
