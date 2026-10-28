import "server-only";
/**
 * Store requests and the In-review card (P1 CONSOLE; platform.md PLA-§3.5, §3.7, §22.7; P0b: CCR P1-6, P2-5). The
 * tenant-callable side of `signup_reviews` (PLA-§3.7 rev 6): every function reads or writes the rows **of the
 * caller's own store only**, the store taken from `ctx` / the scope, never from input. P2 (merging before P1) builds
 * the review card, the plan and limit requests and the restricted banner's "Ask for a review" against it; the console
 * side (the queue's decisions) is P1's src/lib/platform/queue.ts.
 *
 * P0b stub: the track replaces the body, never the signature (src/lib/contracts/r1-p0b-platform.ts).
 *   - `listStoreRequests`, `getReviewCard`: **real** reads (ordinary store-scoped queries through `whereStore`), so
 *     P2's card and request list show the rows that exist from the first merge;
 *   - `createStoreRequest`, `withdrawStoreRequest`, `submitForReview`, `answerReviewQuestion`, `submitAppeal`: throw,
 *     since their writes (the one-open-request rule, the notifications, the audit rows) are P1's.
 */
import { desc, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { signupReviews, type ReviewRequest } from "@/lib/db/schema";
import type { StorePulse } from "@/lib/pulse/types";
import { getPlatformSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope } from "@/lib/tenancy/types";

export type { ReviewRequest } from "@/lib/db/schema";

type ReviewRow = typeof signupReviews.$inferSelect;

/** One request of the store (kinds other than signup / reopen), as P2's plan page and limit sheet list it. */
export interface StoreRequestRow {
  id: string;
  kind: ReviewRequest["kind"];
  status: (typeof signupReviews.$inferSelect)["status"];
  createdAt: string;
  /** staff's note once the request is decided (approved or rejected), else null */
  outcome: string | null;
}

/** The In-review card's state (PLA-§22.7), from the store's newest signup or reopen row. */
export interface ReviewCard {
  status: StorePulse["store"]["review"];
  /** the staff question while `needs_info` */
  question: string | null;
  submittedAt: string | null;
  /** the reject reason code while `rejected` (the seller reads `shell.rejected.<reason>`, never the risk flags) */
  rejectReason: string | null;
  /** one appeal per rejection (PLA-§3.5 "Appeals") */
  appealsLeft: 0 | 1;
  /** `signup.slaHours`: "Usually within {hours} hours" only when set (no invented promise) */
  slaHours: number | null;
}

/** The two kinds of the review card; every other kind is a request (PLA-§3.7). */
const CARD_KINDS = ["signup", "reopen"] as const;
const LIST_MAX = 20;
const isRequestKind = (kind: ReviewRow["kind"]): kind is ReviewRequest["kind"] => kind !== "signup" && kind !== "reopen";
const decided = (status: ReviewRow["status"]) => status === "approved" || status === "rejected";

/** billing.manage: one open request per kind per store (`sr_store_kind_idx`), else `{ already: true }`; bucket `s:<sid>:request` 5/day. */
export async function createStoreRequest(ctx: StoreCtx, req: ReviewRequest): Promise<{ id: string } | { already: true }> {
  void ctx;
  void req;
  throw new Error("not implemented: P1 createStoreRequest");
}

/** The store's own open request becomes `withdrawn` (`withdrawStoreRequestAction`, P2). */
export async function withdrawStoreRequest(ctx: StoreCtx, requestId: string): Promise<void> {
  void ctx;
  void requestId;
  throw new Error("not implemented: P1 withdrawStoreRequest");
}

/** The store's requests, newest first, at most 20. */
export async function listStoreRequests(scope: StoreScope): Promise<StoreRequestRow[]> {
  const rows = await db
    .select({ id: signupReviews.id, kind: signupReviews.kind, status: signupReviews.status, createdAt: signupReviews.createdAt, reasonNote: signupReviews.reasonNote })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, notInArray(signupReviews.kind, [...CARD_KINDS])))
    .orderBy(desc(signupReviews.createdAt), desc(signupReviews.id))
    .limit(LIST_MAX);
  const out: StoreRequestRow[] = [];
  for (const r of rows) {
    if (!isRequestKind(r.kind)) continue;
    out.push({ id: r.id, kind: r.kind, status: r.status, createdAt: r.createdAt.toISOString(), outcome: decided(r.status) ? r.reasonNote : null });
  }
  return out;
}

/**
 * The card's status from the newest signup or reopen row:
 *   - no row, or `withdrawn` → `none`;
 *   - a signup row `pending` or `snoozed` before "Submit for review" (`submitted_at` null) → `pending` (snoozing is
 *     staff's, the seller has still not submitted);
 *   - a signup row `pending` or `snoozed` with `submitted_at`, and a `pending` or `snoozed` reopen (an appeal) →
 *     `submitted`;
 *   - `needs_info`, `approved`, `rejected` → the same.
 * `appealsLeft` is 1 only for a rejected signup row with `appeals < 1`: a rejected reopen row is the one appeal
 * already used (submitAppeal increments `appeals` on the original row, not on the reopen row).
 */
export async function getReviewCard(scope: StoreScope): Promise<ReviewCard> {
  const [row] = await db
    .select({
      kind: signupReviews.kind,
      status: signupReviews.status,
      submittedAt: signupReviews.submittedAt,
      staffQuestion: signupReviews.staffQuestion,
      reasonCode: signupReviews.reasonCode,
      appeals: signupReviews.appeals,
    })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, inArray(signupReviews.kind, [...CARD_KINDS])))
    .orderBy(desc(signupReviews.createdAt), desc(signupReviews.id))
    .limit(1);
  const slaHours = (await getPlatformSetting("platform")).signup.slaHours ?? null;
  const card: ReviewCard = { status: "none", question: null, submittedAt: row?.submittedAt?.toISOString() ?? null, rejectReason: null, appealsLeft: 0, slaHours };
  if (!row || row.status === "withdrawn") return { ...card, submittedAt: null };
  switch (row.status) {
    case "pending":
    case "snoozed":
      return { ...card, status: row.kind === "reopen" || row.submittedAt !== null ? "submitted" : "pending" };
    case "needs_info":
      return { ...card, status: "needs_info", question: row.staffQuestion ?? null };
    case "approved":
      return { ...card, status: "approved" };
    case "rejected":
      return { ...card, status: "rejected", rejectReason: row.reasonCode ?? null, appealsLeft: row.kind === "signup" && row.appeals < 1 ? 1 : 0 };
  }
}

/** owner, store.read: writes only `business_context` (each field ≤ 200, plain text) and `submitted_at`; notifies `staff.signup_new`. */
export async function submitForReview(ctx: StoreCtx, input: { sells: string | null; link: string | null; whatsapp: string | null }): Promise<{ submittedAt: string }> {
  void ctx;
  void input;
  throw new Error("not implemented: P1 submitForReview");
}

/** owner: the answer (≤ 500) sets `answered_at`, the row goes back to `pending`; notifies `staff.info_answered`. */
export async function answerReviewQuestion(ctx: StoreCtx, answer: string): Promise<void> {
  void ctx;
  void answer;
  throw new Error("not implemented: P1 answerReviewQuestion");
}

/** owner, store.read: one appeal (≤ 500) → a `reopen` row (signals copied with `appeal: true`), `appeals` + 1 on the original; `staff.appeal`. */
export async function submitAppeal(ctx: StoreCtx, message: string): Promise<{ id: string }> {
  void ctx;
  void message;
  throw new Error("not implemented: P1 submitAppeal");
}
