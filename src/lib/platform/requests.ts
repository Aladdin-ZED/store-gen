import "server-only";
/**
 * Store requests and the In-review card (P1 CONSOLE; platform.md PLA-§3.5, §3.7, §22.7; P0b: CCR P1-6, P2-5). The
 * tenant-callable side of `signup_reviews` (PLA-§3.7 rev 6): every function reads or writes the rows **of the
 * caller's own store only**, the store taken from `ctx` / the scope, never from input. P2 (merging before P1) builds
 * the review card, the plan and limit requests and the restricted banner's "Ask for a review" against it; the console
 * side (the queue's decisions) is P1's src/lib/platform/queue.ts.
 *
 * The signatures are frozen at P0b (src/lib/contracts/r1-p0b-platform.ts); P1 wrote the bodies of the five writes:
 *   - reads (`listStoreRequests`, `getReviewCard`) go through the caller's scope (`whereStore`);
 *   - writes go through the system seam of the caller's own store (`ctx.store.id`): a review row is platform
 *     bookkeeping, and the reasons a member may write it are checked here (the owner for the review card,
 *     `billing.manage` for a request), never by the row; a read-only impersonation never writes;
 *   - every write drops the console pulse's queue counts and the store's cached views (`invalidateStore`: the store
 *     pulse, and the review row `applyStateCap` reads for the two-tier media cap, D69), writes one audit row and tells
 *     staff (`staff.request`, `staff.signup_new` batched per hour, `staff.signup_hold`, `staff.info_answered`,
 *     `staff.appeal`).
 */
import { asc, desc, eq, inArray, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { signupReviews, type ReviewRequest, type SignupSignals } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import type { StorePulse } from "@/lib/pulse/types";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getPlatformSetting } from "@/lib/settings";
import { invalidateStore } from "@/lib/tenancy/cache";
import { SeamError } from "@/lib/tenancy/seam";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { notify } from "./notify";
import { invalidateQueueSnapshot } from "./queue-cache";
import { BusinessContextInput, QUESTION_MAX, ReviewRequestSchema, plainText } from "./queue-rules";

export type { ReviewRequest } from "@/lib/db/schema";

type ReviewRow = typeof signupReviews.$inferSelect;

/**
 * One request of the store (kinds other than signup / reopen), as P2's plan page and limit sheet list it. P0b review
 * F-15: `outcome` is the decision in the words of `resolveRequestAction` / `request.answered` (`grant` → "granted",
 * `decline` → "declined"), never the staff's `reason_note`, which is internal (PLA-§22.10.4: no note reaches the seller).
 */
export interface StoreRequestRow {
  id: string;
  kind: ReviewRequest["kind"];
  status: (typeof signupReviews.$inferSelect)["status"];
  createdAt: string;
  /** "granted" (approved) or "declined" (rejected) once decided; null while open, snoozed or withdrawn */
  outcome: "granted" | "declined" | null;
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
const outcomeOf = (status: ReviewRow["status"]): StoreRequestRow["outcome"] => (status === "approved" ? "granted" : status === "rejected" ? "declined" : null);

/** The store's requests, newest first, at most 20. */
export async function listStoreRequests(scope: StoreScope): Promise<StoreRequestRow[]> {
  const rows = await db
    .select({ id: signupReviews.id, kind: signupReviews.kind, status: signupReviews.status, createdAt: signupReviews.createdAt })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, notInArray(signupReviews.kind, [...CARD_KINDS])))
    .orderBy(desc(signupReviews.createdAt), desc(signupReviews.id))
    .limit(LIST_MAX);
  const out: StoreRequestRow[] = [];
  for (const r of rows) {
    if (!isRequestKind(r.kind)) continue;
    out.push({ id: r.id, kind: r.kind, status: r.status, createdAt: r.createdAt.toISOString(), outcome: outcomeOf(r.status) });
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

/* ------------------------------------------------------------------ */
/* The writes (P1, step 4)                                             */
/* ------------------------------------------------------------------ */

const DAY_SEC = 86_400;
/** PLA-§3.7, §L: requests per store per day */
export const REQUEST_DAILY_LIMIT = 5;
const OPEN = ["pending", "needs_info", "snoozed"] as const;
const REQUEST_KINDS = ["go_live", "plan_change", "limit_raise", "mode_change", "domain"] as const;
const STAFF_TARGET = { audience: "platform_staff", minRole: "admin" } as const;

/**
 * The write scope of the store's own review rows: platform bookkeeping, written through the system seam of the
 * caller's own store (`ctx.store.id`, never an input). A read-only impersonation never writes (D70).
 */
function reviewWriteScope(ctx: StoreCtx): WriteScope {
  if (ctx.impersonation || ctx.scope.kind === "impersonation") throw new SeamError("impersonation_read_only");
  return systemScope(systemCtx("store.review"), ctx.store.id);
}

/** The review card's functions are the owner's (PLA-§3.5, §22.7: `storeAction("store.read")` + owner check). */
function requireOwner(ctx: StoreCtx): void {
  if (ctx.membership.role !== "owner" || ctx.membership.synthetic) throw new SeamError("forbidden");
}

type Row = typeof signupReviews.$inferSelect;
type RowSet = Partial<Omit<typeof signupReviews.$inferInsert, "id" | "storeId" | "userId" | "kind" | "createdAt">>;

async function openRequestRows(scope: StoreScope, kind: ReviewRequest["kind"]): Promise<{ id: string }[]> {
  return db
    .select({ id: signupReviews.id })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, eq(signupReviews.kind, kind), inArray(signupReviews.status, [...OPEN])))
    .orderBy(asc(signupReviews.createdAt), asc(signupReviews.id));
}

async function insertRow(scope: WriteScope, row: Omit<typeof signupReviews.$inferInsert, "storeId">): Promise<void> {
  await db.insert(signupReviews).values(storeValues(scope, row));
}

async function deleteRow(scope: WriteScope, id: string): Promise<void> {
  await db.delete(signupReviews).where(whereStore(signupReviews, scope, eq(signupReviews.id, id)));
}

/** The compare-and-set on one of the store's rows; true when this call changed it. */
async function casRow(scope: WriteScope, id: string, from: readonly Row["status"][], set: RowSet, extra?: SQL): Promise<boolean> {
  const [res] = await db
    .update(signupReviews)
    .set(set)
    .where(whereStore(signupReviews, scope, eq(signupReviews.id, id), inArray(signupReviews.status, [...from]), extra));
  return res.affectedRows === 1;
}

/** The store's newest signup or reopen row in one of `statuses` (the row the review card answers for). */
async function cardRow(scope: StoreScope, statuses: readonly Row["status"][], kinds: readonly ("signup" | "reopen")[] = CARD_KINDS) {
  const [row] = await db
    .select()
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, inArray(signupReviews.kind, [...kinds]), inArray(signupReviews.status, [...statuses])))
    .orderBy(desc(signupReviews.createdAt), desc(signupReviews.id))
    .limit(1);
  return row ?? null;
}

/** A review row's facts when it is a store's own request (PLA-§3.7: score 0, band review, the store's facts, no flags). */
function requestSignals(ctx: StoreCtx): SignupSignals {
  const locale = ctx.store.defaultLocale === "ar" || ctx.store.defaultLocale === "fr" ? ctx.store.defaultLocale : "en";
  return {
    v: 1,
    flags: [],
    band: "review",
    inputs: {
      emailDomain: (ctx.user.email.split("@")[1] ?? "").toLowerCase().slice(0, 120),
      phoneCountry: null,
      market: ctx.store.market,
      mode: ctx.store.mode,
      locale,
      uaLabel: "",
      turnstile: "off",
      formMs: null,
      // the request comes from the store's dashboard (the closest of the frozen `via` values)
      via: "app_new",
    },
    cluster: { users: 0, banned: 0, kinds: [] },
    partial: false,
    ms: 0,
  };
}

/** After a write the console pulse and the store's own cached views (pulse, entitlements, the review row) are stale. */
function afterWrite(storeId: string): void {
  invalidateQueueSnapshot();
  invalidateStore(storeId);
}

const label = (ctx: StoreCtx) => ctx.store.handle;

/**
 * billing.manage (PLA-§3.7): one open request per kind per store (`sr_store_kind_idx`), else `{ already: true }`; the
 * bucket `s:<sid>:request` allows 5 a day (a duplicate costs nothing). Audit `store.request.created`, staff
 * notification `staff.request`. Two concurrent requests of one kind both insert, then the younger one removes itself
 * and answers `{ already: true }`, so the rule holds without a lock.
 */
export async function createStoreRequest(ctx: StoreCtx, req: ReviewRequest): Promise<{ id: string } | { already: true }> {
  if (!ctx.can("billing.manage")) throw new SeamError("forbidden");
  const scope = reviewWriteScope(ctx);
  const request = ReviewRequestSchema.parse(req) as ReviewRequest;
  if ((await openRequestRows(scope, request.kind)).length > 0) return { already: true };
  if (!(await rateLimit(storeBucket(ctx.scope, "request"), REQUEST_DAILY_LIMIT, DAY_SEC)).ok) throw new SeamError("rate_limited");
  const id = newId();
  await insertRow(scope, { id, userId: ctx.user.id, kind: request.kind, score: 0, band: "review", status: "pending", signals: requestSignals(ctx), request });
  const open = await openRequestRows(scope, request.kind);
  if (open.length > 1 && open[0]!.id !== id) {
    await deleteRow(scope, id);
    return { already: true };
  }
  afterWrite(ctx.store.id);
  await auditFrom(ctx, "store.request.created", { target: id, meta: { requestId: id, kind: request.kind } });
  await notify(STAFF_TARGET, "staff.request", { store: label(ctx), requestKind: request.kind, requestId: id });
  return { id };
}

/** billing.manage: the store's own open request becomes `withdrawn` (`withdrawStoreRequestAction`, P2). */
export async function withdrawStoreRequest(ctx: StoreCtx, requestId: string): Promise<void> {
  if (!ctx.can("billing.manage")) throw new SeamError("forbidden");
  const scope = reviewWriteScope(ctx);
  if (typeof requestId !== "string" || !/^[0-9A-Z]{26}$/.test(requestId)) throw new SeamError("not_found");
  const won = await casRow(scope, requestId, OPEN, { status: "withdrawn", decidedAt: new Date(), decidedBy: null, reasonCode: "withdrawn", snoozeUntil: null }, inArray(signupReviews.kind, [...REQUEST_KINDS]));
  if (!won) throw new SeamError("not_found");
  afterWrite(ctx.store.id);
  await auditFrom(ctx, "store.request.withdrawn", { target: requestId, meta: { requestId } });
}

/**
 * owner, store.read (PLA-§22.7): writes only `business_context` (each field ≤ 200, plain text; the WhatsApp number
 * E.164) and `submitted_at` (the first press; a later press updates the context and keeps the time). The store's
 * cached review row (the two-tier media cap of `applyStateCap`, D69) is dropped. The first submit tells staff:
 * `staff.signup_new` batched per hour (`signup_new:<hour>`, the count grows) and, for a `hold` / `reject_candidate`
 * row, `staff.signup_hold`. Audit `store.review.submitted`.
 */
export async function submitForReview(ctx: StoreCtx, input: { sells: string | null; link: string | null; whatsapp: string | null }): Promise<{ submittedAt: string }> {
  requireOwner(ctx);
  const scope = reviewWriteScope(ctx);
  if (ctx.store.status !== "pending") throw new SeamError("forbidden");
  const fields = BusinessContextInput.parse(input);
  const row = await cardRow(scope, OPEN, ["signup"]);
  if (!row) throw new SeamError("not_found");
  const context: Record<string, string> = { ...(row.businessContext ?? {}) };
  for (const key of ["sells", "link", "whatsapp"] as const) {
    const value = fields[key];
    if (value) context[key] = value;
    else delete context[key];
  }
  const first = row.submittedAt === null;
  const submittedAt = row.submittedAt ?? new Date();
  const won = await casRow(scope, row.id, OPEN, { businessContext: context, submittedAt });
  if (!won) throw new SeamError("not_found");
  afterWrite(ctx.store.id);
  await auditFrom(ctx, "store.review.submitted", { target: row.id, meta: { reviewId: row.id, first, fields: Object.keys(context).filter((k) => k !== "answer" && k !== "appeal") } });
  if (first) {
    await notify(STAFF_TARGET, "staff.signup_new", { store: label(ctx), requestId: row.id }, { dedupeKey: "signup_new" });
    if (row.band === "hold" || row.band === "reject_candidate") await notify(STAFF_TARGET, "staff.signup_hold", { store: label(ctx), requestId: row.id });
  }
  return { submittedAt: submittedAt.toISOString() };
}

/** owner (PLA-§22.7): the answer (≤ 500) sets `answered_at` and the row goes back to `pending`; `staff.info_answered`. */
export async function answerReviewQuestion(ctx: StoreCtx, answer: string): Promise<void> {
  requireOwner(ctx);
  const scope = reviewWriteScope(ctx);
  const text = plainText(QUESTION_MAX).parse(answer);
  const row = await cardRow(scope, ["needs_info"]);
  if (!row) throw new SeamError("not_found");
  const won = await casRow(scope, row.id, ["needs_info"], { status: "pending", answeredAt: new Date(), businessContext: { ...(row.businessContext ?? {}), answer: text } });
  if (!won) throw new SeamError("not_found");
  afterWrite(ctx.store.id);
  await auditFrom(ctx, "store.review.answered", { target: row.id, meta: { reviewId: row.id } });
  await notify(STAFF_TARGET, "staff.info_answered", { store: label(ctx), requestId: row.id });
}

/**
 * owner, store.read (PLA-§3.5 "Appeals"): one appeal per rejection. `appeals` + 1 on the rejected signup row (a
 * compare-and-set on `appeals < 1`, so two presses never make two appeals), then a new `reopen` row: `pending`, the
 * signals copied with `appeal: true`, the message in its business context. Staff hear `staff.appeal`.
 */
export async function submitAppeal(ctx: StoreCtx, message: string): Promise<{ id: string }> {
  requireOwner(ctx);
  const scope = reviewWriteScope(ctx);
  if (ctx.store.status !== "rejected") throw new SeamError("forbidden");
  const text = plainText(QUESTION_MAX).parse(message);
  const row = await cardRow(scope, ["rejected"], ["signup"]);
  if (!row) throw new SeamError("not_found");
  const won = await casRow(scope, row.id, ["rejected"], { appeals: sql`${signupReviews.appeals} + 1` as unknown as number }, lt(signupReviews.appeals, 1));
  if (!won) throw new AuthRefusal("invalid", "shell.appeal.used");
  const id = newId();
  await insertRow(scope, {
    id,
    userId: row.userId,
    kind: "reopen",
    score: row.score,
    band: row.band,
    status: "pending",
    signals: { ...row.signals, appeal: true },
    businessContext: { ...(row.businessContext ?? {}), appeal: text },
    submittedAt: new Date(),
  });
  afterWrite(ctx.store.id);
  await auditFrom(ctx, "store.appeal.submitted", { target: id, meta: { reviewId: row.id, appealId: id } });
  await notify(STAFF_TARGET, "staff.appeal", { store: label(ctx), requestId: id });
  return { id };
}
