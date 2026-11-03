"use server";
/**
 * The In-review card's actions (P2 SHELL; platform.md PLA-§22.7, §3.5, §3.6, §M.1, §L; docs/STORE-SAAS.md §E.2 SEC-7).
 * Every body is `return storeAction(…)` (lint L9); the store is the signed request path's (D2), never the input's.
 *
 *   submitForReviewAction        store.read + owner   P1's submitForReview: business_context and submitted_at only
 *                                                     (its notification staff.signup_new); audit store.review.submitted
 *   answerReviewQuestionAction   store.read + owner   P1's answerReviewQuestion (≤ 500): back to pending,
 *                                                     staff.info_answered; audit store.review.answered
 *   submitAppealAction           store.read + owner   P1's submitAppeal (≤ 500), one per rejection; audit
 *                                                     store.appeal.submitted
 *   mintPreviewLinkAction        pages.read           T3's mintPreviewToken: 72 h, seller audience, ≤ 10 active;
 *                                                     another store's page is not_found (assertOwned)
 *   revokePreviewLinkAction      pages.read           T3's revokePreviewToken (its audit store.preview_link.revoked)
 *
 * The keys are reads, so the "view as store" and read-only refusals are this file's (`guardReadKeyWrite`, audited like
 * the seam's).
 * A card state the action does not belong to answers `review_closed`. The review writes are P1's: until P1 merges,
 * its stubs answer `unavailable` (`crossTrack`). After a review write the store's caches are dropped, so the media cap
 * (two-tier, D69: the review row's `submitted_at`) and the pulse's `review` follow at once.
 */
import { activePreviewLinks } from "@/lib/admin-data/dashboard";
import { revalidateStore } from "@/lib/admin-data/shell";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { answerReviewQuestion, getReviewCard, submitAppeal, submitForReview } from "@/lib/platform/requests";
import { mintPreviewToken, revokePreviewToken } from "@/lib/render/preview-token";
import { invalidateStore } from "@/lib/tenancy/cache";
import { assertOwned } from "@/lib/tenancy/owned";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, StoreCtx } from "@/lib/tenancy/types";
import { crossTrack, guardReadKeyWrite, ownerOnly } from "@/components/admin/shell/action-guards";
import {
  AnswerQuestionInput,
  AppealInput,
  MintPreviewInput,
  parseInput,
  PREVIEW_LINK_TTL_SEC,
  PREVIEW_LINKS_ACTIVE_MAX,
  RevokePreviewInput,
  SubmitReviewInput,
} from "@/components/admin/shell/action-inputs";

/** The card is in the state this action belongs to (the store's own newest signup / reopen row), else `review_closed`. */
async function cardIs(ctx: StoreCtx, ok: (card: Awaited<ReturnType<typeof getReviewCard>>) => boolean): Promise<void> {
  if (!ok(await getReviewCard(ctx.scope))) throw new AuthRefusal("review_closed", "error.review_closed");
}

/** After a review write: the store's caches (the pulse's review, the two-tier media cap) and the dashboard. */
function afterReview(ctx: StoreCtx): void {
  invalidateStore(ctx.store.id);
  revalidateStore(ctx.store.handle, "");
}

export async function submitForReviewAction(input: unknown): Promise<ActionResult<{ submittedAt: string }>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "submitForReviewAction");
    ownerOnly(ctx);
    const v = parseInput(SubmitReviewInput, input);
    if (ctx.store.status !== "pending") throw new AuthRefusal("review_closed", "error.review_closed");
    await cardIs(ctx, (card) => card.status === "pending");
    const r = await crossTrack(() => submitForReview(ctx, { sells: v.sells, link: v.link, whatsapp: v.whatsapp }));
    afterReview(ctx);
    // what was given, never the text itself (the console reads the row)
    await auditFrom(ctx, "store.review.submitted", { target: ctx.store.id, meta: { sells: v.sells !== null, link: v.link !== null, whatsapp: v.whatsapp !== null } });
    return r;
  });
}

export async function answerReviewQuestionAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "answerReviewQuestionAction");
    ownerOnly(ctx);
    const { answer } = parseInput(AnswerQuestionInput, input);
    await cardIs(ctx, (card) => card.status === "needs_info");
    await crossTrack(() => answerReviewQuestion(ctx, answer));
    afterReview(ctx);
    await auditFrom(ctx, "store.review.answered", { target: ctx.store.id, meta: { chars: answer.length } });
    return null;
  });
}

export async function submitAppealAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return storeAction("store.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "submitAppealAction");
    ownerOnly(ctx);
    const { message } = parseInput(AppealInput, input);
    // one appeal per rejection, only while the store is rejected (PLA-§3.5 "Appeals")
    if (ctx.store.status !== "rejected") throw new AuthRefusal("review_closed", "error.review_closed");
    await cardIs(ctx, (card) => card.status === "rejected" && card.appealsLeft === 1);
    const r = await crossTrack(() => submitAppeal(ctx, message));
    afterReview(ctx);
    await auditFrom(ctx, "store.appeal.submitted", { target: r.id, meta: { chars: message.length } });
    return r;
  });
}

export async function mintPreviewLinkAction(input: unknown): Promise<ActionResult<{ tokenId: string; url: string; expiresAt: string }>> {
  return storeAction("pages.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "mintPreviewLinkAction");
    const { pageId } = parseInput(MintPreviewInput, input);
    // another store's page id answers like a missing one (§E.3 rule 5)
    await assertOwned(ctx.scope, "page", [pageId]);
    if ((await activePreviewLinks(ctx.scope)).length >= PREVIEW_LINKS_ACTIVE_MAX) throw new AuthRefusal("preview_links_max", "error.preview_links_max");
    // T3 writes the row and the audit (store.preview_link.created) with the member as the actor
    const r = await mintPreviewToken(ctx.scope, { pageId, ttlSec: PREVIEW_LINK_TTL_SEC, audience: "seller", actor: ctx.actor });
    revalidateStore(ctx.store.handle, "");
    return { tokenId: r.tokenId, url: r.url, expiresAt: r.expiresAt.toISOString() };
  });
}

export async function revokePreviewLinkAction(input: unknown): Promise<ActionResult<null>> {
  return storeAction("pages.read", async (ctx) => {
    await guardReadKeyWrite(ctx, "revokePreviewLinkAction");
    const { tokenId } = parseInput(RevokePreviewInput, input);
    // another store's link, a revoked or an unknown one: not_found (0 rows); the link answers the 404 at once
    await revokePreviewToken(ctx.scope, tokenId, ctx.actor);
    revalidateStore(ctx.store.handle, "");
    return null;
  });
}
