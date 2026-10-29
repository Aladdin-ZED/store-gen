import "server-only";
/**
 * The approval queue (platform.md PLA-§3.5, §3.7, §M.1, §M.4; PL-02, PL-04; PD5, PD7, PD35, PD52, PD65): what the
 * console's `/admin/queue` reads and the decisions its server actions call (`src/app/admin/(console)/queue/actions.ts`,
 * step 7). The tenant side (submit, answer, appeal, store requests) is src/lib/platform/requests.ts; the pure rules
 * (tabs, counts, SLA, paging, snooze times, inputs) are ./queue-rules.ts.
 *
 *   const list = await listQueue(ctx, "review", { q: "argan" }, cursor);     // rows, counts per tab, the SLA tile
 *   const card = await getReviewDetail(ctx, reviewId);                      // the split view's detail pane
 *   const r = await approveReview(ctx, { reviewId, note });                  // { ok: true } | already_decided
 *
 * Reads. Two statements cross stores, both annotated: the queue index (every open row and the last 30 days'
 * decisions, codes and search keys only, `sr_kind_queue_idx`) and the rows by id (a page's rows, a decision's row).
 * Everything else reads one store through `platformScope(ctx, storeId)`; the decisions write the store's row through
 * the system seam (`systemScope`, a review row is platform bookkeeping, never tenant data) with a compare-and-set on
 * its status.
 *
 * Decisions (each: one compare-and-set, at most one `transitionStore`, one store notification, one audit row):
 *   - approve: `pending` / `needs_info` / `snoozed` → `approved`, then `transitionStore(→ active, "approved")`, which
 *     writes the audit row `platform.signup.approved` and sends `signup.approved` (PLA Q.27; the meta `{ reviewId,
 *     score, band }` waits on CCR r1-p1-5 item 2); a note is required for `hold` / `reject_candidate`;
 *   - a lost race answers `already_decided` with the decider's name; a refused transition puts the row back;
 *   - bulk approve: only rows still waiting in the fast lane, one by one, then `platform.signup.bulk_approved`;
 *   - ask: `needs_info` + the question, `signup.info_requested` with the question as its text;
 *   - reject: `transitionStore(→ rejected, reason)`; `block` also bans the applicant (T2 `banUser`, users.manage ↑);
 *   - snooze: until 1 h / 4 h / tomorrow 09:00 platform time / 3 days, back in Review at query time;
 *   - reopen (an appeal): `transitionStore(rejected → pending, "appeal")`, the row stays a normal review;
 *   - resolve a request: grant applies the plan / override / boost (src/lib/platform/plans.ts, their own store
 *     notification silenced) or restores a restricted store (`go_live`), decline needs a note; `request.answered`.
 * Server time stays ≤ 1 s for one approval (PLA-§3.5 acceptance; qa:wow-demo measures it).
 */
import { and, count, desc, eq, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { aiUsageForStore } from "@/lib/ai/summary.server";
import { auditFrom } from "@/lib/audit";
import { PLATFORM_TIMEZONE } from "@/lib/auth/config";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { listMemberships } from "@/lib/auth/landing";
import { banUser } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { designGenomes, identityLinks, pages, platformNotes, signupReviews, stores, users, type ReviewRequest, type SignupSignals } from "@/lib/db/schema";
import { designHealth } from "@/lib/design/health.server";
import { checkContextOf } from "@/lib/editor/check-context";
import { CHECK_SETTING_KEYS, loadCheckContext } from "@/lib/editor/check-context.server";
import { buildChecklist } from "@/lib/editor/checklist";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import type { PlatformPermission } from "@/lib/auth/permissions";
import { PageDoc as PageDocSchema } from "@/lib/page/schema";
import { mintPreviewToken } from "@/lib/render/preview-token";
import { getPlatformSetting, getStoreSettings } from "@/lib/settings";
import { periodOf } from "@/lib/tenancy/entitlement-keys";
import { transitionStore } from "@/lib/tenancy/lifecycle";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope, StoreStatus, WriteScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { decodeCursor, encodeCursor } from "./cursor";
import { recordPlatformError } from "./log";
import { QUEUE_PULSE, invalidateQueueSnapshot, queuePulseCache, type QueueSnapshot } from "./queue-cache";
import { maskEmail, maskPhone, sellerContact, type Masked } from "./mask";
import { notify } from "./notify";
import { assignPlan, setEntitlement } from "./plans";
import { platformScope } from "./seam";
import {
  ALL_KINDS,
  ApproveInput,
  AskInfoInput,
  BulkApproveInput,
  DECIDED_STATUSES,
  DECIDED_WINDOW_DAYS,
  OPEN_STATUSES,
  QUEUE_TABS,
  RejectInput,
  ReopenInput,
  ResolveInput,
  SnoozeInput,
  approveNeedsNote,
  holdCodes,
  inFastLane,
  isRequestKind,
  isReviewKind,
  pageOf,
  resolvePermission,
  slaTile,
  snoozeUntil,
  tabCounts,
  waitingFrom,
  type GrantSpec,
  type QueueFilter,
  type QueueIndexRow,
  type QueueTab,
  type RequestKind,
  type ReviewKind,
  type ReviewStatus,
  type SlaTile,
} from "./queue-rules";
import { explainBand, explainFlag, thresholdsOrDefault, type BandExplanation } from "./signup-band";
import { phoneCountryOf } from "./signup-risk";
import type { IdentityKind, SignupBand, SignupFlag, SignupFlagCode } from "./types";

export * from "./queue-rules";

const DAY = 86_400_000;
/** the queue index reads at most this many rows (open rows and 30 days of decisions; far above the R1 volume) */
const INDEX_MAX = 5_000;
/** PLA-§L / core §E.2: the console's preview links live 10 minutes */
const PREVIEW_TTL_SEC = 600;
/** linked accounts shown per applicant */
const LINKED_MAX = 10;
/** the checklist ids that are honesty items (LAN-§3.2: sample content, urgency, countdown resets, attested facts) */
const HONESTY_PREFIXES = ["sample:", "honesty:", "urgency:", "fact:"] as const;
/** PLA-§3.5 (rev 4, SEC-26): a sandbox that used half its pending credits before "Submit for review" is tinted */
const AI_TINT_SHARE = 0.5;

/* ------------------------------------------------------------------ */
/* Seams, caches                                                       */
/* ------------------------------------------------------------------ */

/** A review row is platform bookkeeping: its writes go through the system seam of its own store. */
const reviewScope = (storeId: string): WriteScope => systemScope(systemCtx("platform.queue"), storeId);

function requirePerm(ctx: PlatformCtx, p: PlatformPermission): void {
  if (!ctx.can(p)) throw new AuthRefusal("forbidden");
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/* ------------------------------------------------------------------ */
/* The cross-store reads (each one annotated query)                    */
/* ------------------------------------------------------------------ */

function codesOf(raw: unknown): string[] {
  try {
    const v = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    return Array.isArray(v) ? v.filter((c): c is string => typeof c === "string").slice(0, 40) : [];
  } catch {
    return [];
  }
}

/** The queue index: every open row and every row decided in the last 30 days, without their JSON (codes only). */
async function readIndex(now: Date): Promise<{ rows: QueueIndexRow[]; truncated: boolean }> {
  const since = new Date(now.getTime() - DECIDED_WINDOW_DAYS * DAY);
  // tenancy: platform the approval queue across stores (PLA-§3.5, §M.4 sr_kind_queue_idx): open rows and 30 days of decisions, flag codes and search keys only
  const rows = await db
    .select({
      id: signupReviews.id,
      storeId: signupReviews.storeId,
      kind: signupReviews.kind,
      status: signupReviews.status,
      band: signupReviews.band,
      score: signupReviews.score,
      codes: sql<unknown>`JSON_EXTRACT(${signupReviews.signals}, '$.flags[*].code')`,
      snoozeUntil: signupReviews.snoozeUntil,
      createdAt: signupReviews.createdAt,
      submittedAt: signupReviews.submittedAt,
      answeredAt: signupReviews.answeredAt,
      decidedAt: signupReviews.decidedAt,
      decidedBy: signupReviews.decidedBy,
      storeName: stores.name,
      handle: stores.handle,
      market: stores.market,
      email: users.email,
    })
    .from(signupReviews)
    .innerJoin(stores, eq(stores.id, signupReviews.storeId))
    .innerJoin(users, eq(users.id, signupReviews.userId))
    .where(
      and(
        inArray(signupReviews.kind, [...ALL_KINDS]),
        or(inArray(signupReviews.status, [...OPEN_STATUSES]), and(inArray(signupReviews.status, [...DECIDED_STATUSES]), sql`${signupReviews.decidedAt} >= ${since}`)),
      ),
    )
    .limit(INDEX_MAX + 1);
  return {
    truncated: rows.length > INDEX_MAX,
    rows: rows.slice(0, INDEX_MAX).map((r) => ({
      ...r,
      codes: codesOf(r.codes),
      storeName: r.storeName.toLowerCase(),
      email: r.email.toLowerCase(),
    })),
  };
}

const reviewColumns = {
  id: signupReviews.id,
  storeId: signupReviews.storeId,
  userId: signupReviews.userId,
  kind: signupReviews.kind,
  status: signupReviews.status,
  band: signupReviews.band,
  score: signupReviews.score,
  signals: signupReviews.signals,
  snoozeUntil: signupReviews.snoozeUntil,
  businessContext: signupReviews.businessContext,
  decidedBy: signupReviews.decidedBy,
  decidedAt: signupReviews.decidedAt,
  reasonCode: signupReviews.reasonCode,
  reasonNote: signupReviews.reasonNote,
  appeals: signupReviews.appeals,
  createdAt: signupReviews.createdAt,
  request: signupReviews.request,
  submittedAt: signupReviews.submittedAt,
  staffQuestion: signupReviews.staffQuestion,
  answeredAt: signupReviews.answeredAt,
  blocked: signupReviews.blocked,
  storeName: stores.name,
  handle: stores.handle,
  market: stores.market,
  mode: stores.mode,
  storeStatus: stores.status,
  defaultLocale: stores.defaultLocale,
  timezone: stores.timezone,
  storeCreatedAt: stores.createdAt,
  userName: users.name,
  email: users.email,
  phone: users.phone,
  userDisabled: users.disabled,
  userCreatedAt: users.createdAt,
};

/** The query of reviewRowsById (its own function so the row type can be named). */
function queryReviewRows(ids: string[]) {
  // tenancy: platform review rows by id across stores (PLA-§3.5: the queue's page and the row a decision names; the store comes from the row)
  return db
    .select(reviewColumns)
    .from(signupReviews)
    .innerJoin(stores, eq(stores.id, signupReviews.storeId))
    .innerJoin(users, eq(users.id, signupReviews.userId))
    .where(inArray(signupReviews.id, ids));
}

export type ReviewFull = Awaited<ReturnType<typeof queryReviewRows>>[number];

/** Review rows by id with their store and applicant (a page of the list, the row of a decision). */
export async function reviewRowsById(ids: readonly string[]): Promise<Map<string, ReviewFull>> {
  const wanted = [...new Set(ids)].filter((id) => /^[0-9A-Z]{26}$/.test(id)).slice(0, 100);
  if (!wanted.length) return new Map();
  const rows = await queryReviewRows(wanted);
  return new Map(rows.map((r) => [r.id, r]));
}

async function oneReview(reviewId: string): Promise<ReviewFull> {
  const row = (await reviewRowsById([reviewId])).get(reviewId);
  if (!row) throw new AuthRefusal("not_found");
  return row;
}

const toIndexRow = (r: ReviewFull): QueueIndexRow => ({
  id: r.id,
  storeId: r.storeId,
  kind: r.kind,
  status: r.status,
  band: r.band,
  score: r.score,
  codes: (r.signals?.flags ?? []).map((f) => f.code),
  snoozeUntil: r.snoozeUntil,
  createdAt: r.createdAt,
  submittedAt: r.submittedAt,
  answeredAt: r.answeredAt,
  decidedAt: r.decidedAt,
  decidedBy: r.decidedBy,
  storeName: r.storeName.toLowerCase(),
  handle: r.handle,
  email: r.email.toLowerCase(),
  market: r.market,
});

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

export type Readiness = "no_page" | "draft" | "submitted";

export interface QueueListRow {
  id: string;
  storeId: string;
  kind: ReviewKind;
  status: ReviewStatus;
  band: SignupBand;
  score: number;
  /** up to 3 flag codes, highest points first, and how many more */
  flags: { code: SignupFlagCode; points: number; evidence?: Record<string, string | number> }[];
  moreFlags: number;
  holds: SignupFlagCode[];
  store: { name: string; handle: string | null; market: string; mode: "landing" | "store" | "both"; status: StoreStatus };
  /** first name and the masked e-mail for every role (the list; the detail shows the full e-mail to admin+) */
  applicant: { firstName: string; email: Masked; phoneCountry: string | null };
  readiness: Readiness;
  waitingSince: string;
  /** other accounts sharing an identity link (`signals.cluster.users`) */
  linked: number;
  request: ReviewRequest | null;
  snoozeUntil: string | null;
  decidedAt: string | null;
  decision: { by: string | null; reason: string | null } | null;
}

export interface QueueList {
  tab: QueueTab;
  rows: QueueListRow[];
  counts: Record<QueueTab, number>;
  sla: SlaTile;
  /** the next page's cursor, or null */
  next: string | null;
  /** the index hit its row cap (counts are a lower bound) */
  truncated: boolean;
}

/** The newest page's draft (for readiness, the design chips and the preview) through the console's scope. */
async function storePages(scope: StoreScope): Promise<number> {
  const [row] = await db.select({ n: count() }).from(pages).where(whereStore(pages, scope));
  return Number(row?.n ?? 0);
}

function topFlags(signals: SignupSignals | null): { top: QueueListRow["flags"]; more: number } {
  const flags = [...(signals?.flags ?? [])].sort((a, b) => b.points - a.points);
  return { top: flags.slice(0, 3).map((f) => ({ code: f.code, points: f.points, ...(f.evidence ? { evidence: f.evidence } : {}) })), more: Math.max(0, flags.length - 3) };
}

async function namesOf(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, wanted));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** One page of a tab (PLA-§3.5 list rows) with every tab's count and the SLA tile. `console.read`. */
export async function listQueue(ctx: PlatformCtx, tab: QueueTab, filter: QueueFilter = {}, cursor: string | null = null, now: Date = new Date()): Promise<QueueList> {
  requirePerm(ctx, "console.read");
  if (!(QUEUE_TABS as readonly string[]).includes(tab)) throw new AuthRefusal("invalid");
  const [{ rows: index, truncated }, setting] = await Promise.all([readIndex(now), getPlatformSetting("platform")]);
  const keys = decodeCursor(cursor);
  const after = keys && keys.length === 2 && typeof keys[0] === "number" && typeof keys[1] === "string" ? ([keys[0], keys[1]] as [number, string]) : null;
  const { ids, next } = pageOf(index, tab, filter, after, now);
  const byId = await reviewRowsById(ids);
  const page = ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const [pageCounts, deciders] = await Promise.all([
    Promise.all(page.map((r) => (r.submittedAt ? Promise.resolve(1) : storePages(platformScope(ctx, r.storeId)).catch(() => 0)))),
    namesOf(page.map((r) => r.decidedBy)),
  ]);
  const rows = page.map((r, i): QueueListRow => {
    const { top, more } = topFlags(r.signals);
    return {
      id: r.id,
      storeId: r.storeId,
      kind: r.kind,
      status: r.status,
      band: r.band,
      score: r.score,
      flags: top,
      moreFlags: more,
      holds: holdCodes((r.signals?.flags ?? []).map((f) => f.code)),
      store: { name: r.storeName, handle: r.handle, market: r.market, mode: r.mode, status: r.storeStatus },
      applicant: { firstName: firstName(r.userName), email: maskEmail(r.email), phoneCountry: r.phone ? phoneCountryOf(r.phone) : (r.signals?.inputs.phoneCountry ?? null) },
      readiness: r.submittedAt ? "submitted" : pageCounts[i]! > 0 ? "draft" : "no_page",
      waitingSince: waitingFrom(r).toISOString(),
      linked: r.signals?.cluster.users ?? 0,
      request: r.request ?? null,
      snoozeUntil: iso(r.snoozeUntil),
      decidedAt: iso(r.decidedAt),
      decision: r.decidedAt ? { by: r.decidedBy ? (deciders.get(r.decidedBy) ?? null) : null, reason: r.reasonCode } : null,
    };
  });
  return { tab, rows, counts: tabCounts(index, now), sla: slaTile(index, now, setting.signup.slaHours), next: next ? encodeCursor(next) : null, truncated };
}

export type { QueueSnapshot } from "./queue-cache";
export { invalidateQueueSnapshot } from "./queue-cache";

/** The counts and the SLA tile for the console pulse and the overview (cached 5 s, dropped by every decision). */
export async function queueSnapshot(now: Date = new Date()): Promise<QueueSnapshot> {
  return queuePulseCache.getOrLoad(QUEUE_PULSE.scope, QUEUE_PULSE.key, async () => {
    const [{ rows }, setting] = await Promise.all([readIndex(now), getPlatformSetting("platform")]);
    return { counts: tabCounts(rows, now), sla: slaTile(rows, now, setting.signup.slaHours) };
  });
}

/* ------------------------------------------------------------------ */
/* The detail pane                                                     */
/* ------------------------------------------------------------------ */

export interface ReviewDetail {
  id: string;
  kind: ReviewKind;
  status: ReviewStatus;
  band: SignupBand;
  score: number;
  request: ReviewRequest | null;
  snoozeUntil: string | null;
  createdAt: string;
  submittedAt: string | null;
  answeredAt: string | null;
  decision: { at: string; by: { id: string; name: string } | null; reason: string | null; note: string | null; blocked: boolean } | null;
  store: { id: string; name: string; handle: string | null; mode: "landing" | "store" | "both"; market: string; status: StoreStatus; createdAt: string };
  /** PD35: the e-mail in full for admin and super_admin, masked for support and analyst; the phone masked for all */
  applicant: { id: string; name: string; email: string | Masked; phone: Masked | null; signedUpAt: string; banned: boolean };
  scoreCard: {
    flags: { code: SignupFlagCode; points: number; evidence: Record<string, string | number>; text: string }[];
    partial: boolean;
    explanation: BandExplanation;
    thresholds: { fastLaneMax: number; holdMin: number; rejectCandidateMin: number };
    appeal: boolean;
  };
  /** what the seller submitted (plain text; the link is never an auto-link), the staff question and the answer */
  context: { sells: string | null; link: string | null; whatsapp: Masked | null; question: string | null; answer: string | null; appeal: string | null } | null;
  evidence: DraftEvidence;
  linked: LinkedAccount[];
  notes: number;
}

/** PLA-§3.5 item 4 (PD52): facts only, never a model text; a chip is null when its source has nothing to say. */
export interface DraftEvidence {
  readiness: Readiness;
  pageId: string | null;
  design: { q: number | null; slop: number | null; hardFailing: number | null } | null;
  honesty: { count: number; first: string | null } | null;
  /** the genome distance band to the nearest live store in the niche (verdict bands only, core D64) */
  genomeBand: "ok" | "close" | "too_close" | null;
  ai: { creditsUsed: number; creditsLimit: number | null; costMicros: number; tint: boolean } | null;
  /** a 10-minute staff preview of the newest draft (rendered in a sandboxed iframe only) */
  preview: { url: string; expiresAt: string } | null;
}

export interface LinkedAccount {
  userId: string;
  kinds: IdentityKind[];
  email: Masked;
  banned: boolean;
  stores: { id: string; handle: string; name: string; status: StoreStatus }[];
}

/** The applicant's other accounts sharing an identity link (hashes only; `il_user_idx` then the link key). */
async function linkedAccounts(userId: string): Promise<LinkedAccount[]> {
  const mine = await db.select({ kind: identityLinks.kind, valueHash: identityLinks.valueHash }).from(identityLinks).where(eq(identityLinks.userId, userId)).limit(80);
  if (!mine.length) return [];
  const others = await db
    .select({ userId: identityLinks.userId, kind: identityLinks.kind })
    .from(identityLinks)
    .where(and(or(...mine.map((l) => and(eq(identityLinks.kind, l.kind), eq(identityLinks.valueHash, l.valueHash)))), sql`${identityLinks.userId} <> ${userId}`))
    .limit(200);
  const kinds = new Map<string, Set<IdentityKind>>();
  for (const o of others) (kinds.get(o.userId) ?? kinds.set(o.userId, new Set()).get(o.userId)!).add(o.kind);
  const ids = [...kinds.keys()].slice(0, LINKED_MAX);
  if (!ids.length) return [];
  const people = await db.select({ id: users.id, email: users.email, disabled: users.disabled }).from(users).where(inArray(users.id, ids));
  return Promise.all(
    people.map(async (p) => ({
      userId: p.id,
      kinds: [...(kinds.get(p.id) ?? [])],
      email: maskEmail(p.email),
      banned: p.disabled,
      stores: (await listMemberships(p.id).catch(() => [])).map((m) => ({ id: m.storeId, handle: m.handle, name: m.name, status: m.storeStatus })),
    })),
  );
}

/** The newest page of the store with its draft (readiness, the design chips, the checklist, the preview). */
async function newestPage(scope: StoreScope) {
  const [row] = await db
    .select({ id: pages.id, draft: pages.draft, publishedVersionId: pages.publishedVersionId, status: pages.status })
    .from(pages)
    .where(whereStore(pages, scope))
    .orderBy(desc(pages.updatedAt), desc(pages.id))
    .limit(1);
  return row ?? null;
}

async function honestyOf(scope: StoreScope, store: { market: string; timezone: string; handle: string | null }, page: NonNullable<Awaited<ReturnType<typeof newestPage>>>): Promise<DraftEvidence["honesty"]> {
  const parsed = PageDocSchema.safeParse(page.draft);
  if (!parsed.success) return null;
  const settings = await getStoreSettings(scope, [...CHECK_SETTING_KEYS]);
  const data = await loadCheckContext(scope, store, page, parsed.data, settings);
  const s = settings.store;
  const list = buildChecklist(
    parsed.data,
    checkContextOf(data, {
      store: { hasLegalName: !!s.legalName, hasPhone: !!(s.phone || s.whatsapp), hasEmail: !!s.email, hasAddress: !!s.address },
      appHref: (path) => (store.handle ? appHref(store.handle, path) : path),
    }),
  );
  const items = [...list.errors, ...list.warnings].filter((i) => HONESTY_PREFIXES.some((p) => i.id.startsWith(p)));
  return { count: items.length, first: items[0]?.title ?? null };
}

/** Every chip of the draft evidence in parallel, each on its own: a failing or stubbed source leaves its chip null. */
async function draftEvidence(ctx: PlatformCtx, scope: StoreScope, row: ReviewFull, now: Date): Promise<DraftEvidence> {
  const quiet = <T>(label: string, p: Promise<T>): Promise<T | null> =>
    p.catch((err: unknown) => {
      if (!(err instanceof Error && err.message.startsWith("not implemented"))) recordPlatformError(`queue evidence ${label}`, err, { storeId: row.storeId });
      return null;
    });
  const page = await quiet("page", newestPage(scope));
  const store = { market: row.market, timezone: row.timezone, handle: row.handle };
  const [health, honesty, ai, preview] = await Promise.all([
    page ? quiet("design", designHealth(scope)) : Promise.resolve(null),
    page ? quiet("honesty", honestyOf(scope, store, page)) : Promise.resolve(null),
    quiet("ai", aiUsageForStore(scope, periodOf("month", now, row.timezone))),
    page ? quiet("preview", mintPreviewToken(scope, { pageId: page.id, ttlSec: PREVIEW_TTL_SEC, audience: "staff", staffUserId: ctx.user.id, actor: ctx.actor })) : Promise.resolve(null),
  ]);
  const designRow = page ? health?.pages.find((p) => p.pageId === page.id) : undefined;
  let genome: { report: { hard: unknown[] } | null; novelty: { niche: "ok" | "close" | "too_close" } | null } | null = null;
  if (designRow?.genomeId) {
    const [g] = await quiet(
      "genome",
      db
        .select({ report: designGenomes.report, novelty: designGenomes.novelty })
        .from(designGenomes)
        .where(whereStore(designGenomes, scope, eq(designGenomes.id, designRow.genomeId)))
        .limit(1),
    ).then((r) => r ?? []);
    genome = g ? { report: g.report ? { hard: g.report.hard } : null, novelty: g.novelty ? { niche: g.novelty.niche } : null } : null;
  }
  const beforeSubmit = row.storeStatus === "pending" && !row.submittedAt;
  return {
    readiness: row.submittedAt ? "submitted" : page ? "draft" : "no_page",
    pageId: page?.id ?? null,
    design: designRow ? { q: designRow.q, slop: designRow.slop, hardFailing: genome?.report ? genome.report.hard.length : null } : null,
    honesty,
    genomeBand: genome?.novelty?.niche ?? null,
    ai: ai ? { ...ai, tint: beforeSubmit && ai.creditsLimit !== null && ai.creditsLimit > 0 && ai.creditsUsed >= AI_TINT_SHARE * ai.creditsLimit } : null,
    preview: preview ? { url: preview.url, expiresAt: preview.expiresAt.toISOString() } : null,
  };
}

/** The store's notes (not deleted), for the detail pane's Notes header. */
async function notesCount(scope: StoreScope): Promise<number> {
  const [row] = await db.select({ n: count() }).from(platformNotes).where(whereStore(platformNotes, scope, isNull(platformNotes.deletedAt)));
  return Number(row?.n ?? 0);
}

/** The detail pane of one row (PLA-§3.5 items 1-6). `console.read`; the e-mail per role (PD35). */
export async function getReviewDetail(ctx: PlatformCtx, reviewId: string, now: Date = new Date()): Promise<ReviewDetail> {
  requirePerm(ctx, "console.read");
  const r = await oneReview(reviewId);
  const scope = platformScope(ctx, r.storeId);
  const thresholds = thresholdsOrDefault((await getPlatformSetting("platform")).signup.thresholds);
  const [evidence, linked, notesRow, decider] = await Promise.all([
    draftEvidence(ctx, scope, r, now),
    linkedAccounts(r.userId).catch((err: unknown) => {
      recordPlatformError("queue linked accounts", err, { storeId: r.storeId });
      return [];
    }),
    notesCount(scope),
    namesOf([r.decidedBy]),
  ]);
  const flags = [...(r.signals?.flags ?? [])].sort((a, b) => b.points - a.points);
  const contact = sellerContact(ctx.role, { email: r.email, phone: null });
  const bc = r.businessContext ?? null;
  const ctxField = (k: string) => (bc && typeof bc[k] === "string" && bc[k] ? bc[k] : null);
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    band: r.band,
    score: r.score,
    request: r.request ?? null,
    snoozeUntil: iso(r.snoozeUntil),
    createdAt: r.createdAt.toISOString(),
    submittedAt: iso(r.submittedAt),
    answeredAt: iso(r.answeredAt),
    decision: r.decidedAt
      ? { at: r.decidedAt.toISOString(), by: r.decidedBy ? { id: r.decidedBy, name: decider.get(r.decidedBy) ?? "" } : null, reason: r.reasonCode, note: r.reasonNote, blocked: r.blocked }
      : null,
    store: { id: r.storeId, name: r.storeName, handle: r.handle, mode: r.mode, market: r.market, status: r.storeStatus, createdAt: r.storeCreatedAt.toISOString() },
    applicant: { id: r.userId, name: r.userName, email: contact.email, phone: r.phone ? maskPhone(r.phone) : null, signedUpAt: r.userCreatedAt.toISOString(), banned: r.userDisabled },
    scoreCard: {
      flags: flags.map((f: SignupFlag) => ({ code: f.code, points: f.points, evidence: f.evidence ?? {}, text: explainFlag(f) })),
      partial: r.signals?.partial === true,
      explanation: explainBand({ score: r.score, flags }, thresholds),
      thresholds,
      appeal: r.signals?.appeal === true,
    },
    context:
      bc || r.staffQuestion
        ? {
            sells: ctxField("sells"),
            link: ctxField("link"),
            whatsapp: ctxField("whatsapp") ? maskPhone(ctxField("whatsapp")!) : null,
            question: r.staffQuestion,
            answer: ctxField("answer"),
            appeal: ctxField("appeal"),
          }
        : null,
    evidence,
    linked,
    notes: notesRow,
  };
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export interface AlreadyDecided {
  ok: false;
  error: "already_decided";
  status: ReviewStatus;
  by: { id: string; name: string } | null;
  at: string | null;
}
export type DecisionResult = { ok: true; reviewId: string; storeId: string; status: ReviewStatus } | AlreadyDecided;

type ReviewSet = Partial<Omit<typeof signupReviews.$inferInsert, "id" | "storeId" | "userId" | "kind" | "createdAt">>;

/** The compare-and-set on one review row (its own store, its status among `from`); true when this call won. */
async function casRow(scope: WriteScope, reviewId: string, from: readonly ReviewStatus[], set: ReviewSet, extra?: SQL): Promise<boolean> {
  const [res] = await db
    .update(signupReviews)
    .set(set)
    .where(whereStore(signupReviews, scope, eq(signupReviews.id, reviewId), inArray(signupReviews.status, [...from]), extra));
  return res.affectedRows === 1;
}
const casReview = (storeId: string, reviewId: string, from: readonly ReviewStatus[], set: ReviewSet, extra?: SQL) => casRow(reviewScope(storeId), reviewId, from, set, extra);

async function decisionOf(scope: StoreScope, reviewId: string) {
  const [row] = await db
    .select({ status: signupReviews.status, decidedBy: signupReviews.decidedBy, decidedAt: signupReviews.decidedAt })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, eq(signupReviews.id, reviewId)))
    .limit(1);
  return row ?? null;
}

/** The answer of a lost race: the row's status now and who decided it. */
async function alreadyDecided(storeId: string, reviewId: string): Promise<AlreadyDecided> {
  const row = await decisionOf(reviewScope(storeId), reviewId);
  const name = row?.decidedBy ? (await namesOf([row.decidedBy])).get(row.decidedBy) : undefined;
  return { ok: false, error: "already_decided", status: row?.status ?? "withdrawn", by: row?.decidedBy ? { id: row.decidedBy, name: name ?? "" } : null, at: iso(row?.decidedAt) };
}

/** Puts a row back after the write that followed its compare-and-set was refused (only this staff member's own decision). */
async function revert(ctx: PlatformCtx, r: ReviewFull, to: ReviewStatus): Promise<void> {
  await casReview(
    r.storeId,
    r.id,
    [to],
    { status: r.status, decidedBy: r.decidedBy, decidedAt: r.decidedAt, reasonCode: r.reasonCode, reasonNote: r.reasonNote, snoozeUntil: r.snoozeUntil, blocked: r.blocked },
    eq(signupReviews.decidedBy, ctx.user.id),
  ).catch((err: unknown) => recordPlatformError("queue revert", err, { storeId: r.storeId }));
}

const decided = (r: ReviewFull, status: ReviewStatus): DecisionResult => {
  invalidateQueueSnapshot();
  return { ok: true, reviewId: r.id, storeId: r.storeId, status };
};

/** The SQL half of "waiting for staff" (pending, or snoozed past its time), for the bulk approve's compare-and-set. */
const waitingNow = (now: Date) => or(eq(signupReviews.status, "pending"), and(eq(signupReviews.status, "snoozed"), or(isNull(signupReviews.snoozeUntil), lte(signupReviews.snoozeUntil, now))))!;

/** One approval after its row was validated: the compare-and-set, then the transition (the row is put back if refused). */
async function approveRow(ctx: PlatformCtx, r: ReviewFull, note: string | undefined, now: Date, extra?: SQL): Promise<DecisionResult> {
  const won = await casReview(r.storeId, r.id, OPEN_STATUSES, { status: "approved", decidedBy: ctx.user.id, decidedAt: now, reasonCode: "approved", reasonNote: note ?? null, snoozeUntil: null }, extra);
  if (!won) return alreadyDecided(r.storeId, r.id);
  try {
    await transitionStore(ctx, r.storeId, "active", { reason: "approved", ...(note ? { note } : {}) });
  } catch (err) {
    await revert(ctx, r, "approved");
    throw err;
  }
  return decided(r, "approved");
}

/** A signup or appeal row can be approved only while its store waits in `pending` (an appeal is reopened first). */
function assertApprovable(r: ReviewFull): void {
  if (!isReviewKind(r.kind)) throw new AuthRefusal("invalid", "console.queue.not_a_review");
  if (r.storeStatus === "rejected" && r.kind === "reopen") throw new AuthRefusal("invalid", "console.queue.reopen_first");
}

/** PLA-§3.5 `approveReviewAction`: `signups.decide`; a note for `hold` / `reject_candidate`. */
export async function approveReview(ctx: PlatformCtx, input: unknown): Promise<DecisionResult> {
  requirePerm(ctx, "signups.decide");
  const { reviewId, note } = ApproveInput.parse(input);
  const r = await oneReview(reviewId);
  assertApprovable(r);
  if (!(OPEN_STATUSES as readonly string[]).includes(r.status)) return alreadyDecided(r.storeId, r.id);
  if (approveNeedsNote(r.band) && !note) throw new FieldsError({ note: "console.queue.note_required" });
  if (r.storeStatus !== "pending") throw new AuthRefusal("status_changed", "console.queue.store_not_pending");
  return approveRow(ctx, r, note, new Date());
}

export type BulkSkip = "not_found" | "not_fast_lane" | "already_decided" | "refused";

/** PLA-§3.5 `approveBulkAction`: ≤ 50 ids; only rows still waiting in the fast lane, one by one. */
export async function approveBulk(ctx: PlatformCtx, input: unknown): Promise<{ approved: string[]; skipped: { id: string; why: BulkSkip }[] }> {
  requirePerm(ctx, "signups.decide");
  const { reviewIds } = BulkApproveInput.parse(input);
  const ids = [...new Set(reviewIds)];
  const rows = await reviewRowsById(ids);
  const now = new Date();
  const approved: string[] = [];
  const skipped: { id: string; why: BulkSkip }[] = [];
  for (const id of ids) {
    const r = rows.get(id);
    if (!r) {
      skipped.push({ id, why: "not_found" });
      continue;
    }
    if (!inFastLane(toIndexRow(r), now) || r.storeStatus !== "pending") {
      skipped.push({ id, why: "not_fast_lane" });
      continue;
    }
    try {
      const res = await approveRow(ctx, r, undefined, now, waitingNow(now));
      if (res.ok) approved.push(id);
      else skipped.push({ id, why: "already_decided" });
    } catch (err) {
      recordPlatformError("queue bulk approve", err, { storeId: r.storeId });
      skipped.push({ id, why: "refused" });
    }
  }
  if (approved.length) await auditFrom(ctx, "platform.signup.bulk_approved", { meta: { count: approved.length, skipped: skipped.length } });
  return { approved, skipped };
}

/** PLA-§3.5 `askInfoAction`: `needs_info` + the question; the owners read it as the notification's text. */
export async function askInfo(ctx: PlatformCtx, input: unknown): Promise<DecisionResult> {
  requirePerm(ctx, "signups.decide");
  const { reviewId, question } = AskInfoInput.parse(input);
  const r = await oneReview(reviewId);
  if (!isReviewKind(r.kind)) throw new AuthRefusal("invalid", "console.queue.not_a_review");
  const won = await casReview(r.storeId, r.id, ["pending", "snoozed"], { status: "needs_info", staffQuestion: question, answeredAt: null, snoozeUntil: null });
  if (!won) return alreadyDecided(r.storeId, r.id);
  await notify({ audience: "store_role", storeId: r.storeId, roles: ["owner"] }, "signup.info_requested", {}, { text: question, ...(r.handle ? { link: appHref(r.handle) } : {}) });
  await auditFrom(ctx, "platform.signup.info_requested", { storeId: r.storeId, target: r.id, meta: { reviewId: r.id } });
  return decided(r, "needs_info");
}

/** PLA-§3.5 `rejectReviewAction`: the store reads `shell.rejected.<reason>`; `block` bans the applicant (users.manage ↑). */
export async function rejectReview(ctx: PlatformCtx, input: unknown): Promise<DecisionResult & { banned?: boolean }> {
  requirePerm(ctx, "signups.decide");
  const { reviewId, reason, note, block } = RejectInput.parse(input);
  if (block) {
    requirePerm(ctx, "users.manage");
    if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  }
  if (reason === "other" && !note) throw new FieldsError({ note: "console.queue.note_required" });
  const r = await oneReview(reviewId);
  if (!isReviewKind(r.kind)) throw new AuthRefusal("invalid", "console.queue.not_a_review");
  if (!(OPEN_STATUSES as readonly string[]).includes(r.status)) return alreadyDecided(r.storeId, r.id);
  // an appeal declined before it was reopened leaves the store rejected: no transition, the notification by hand
  const appealOnly = r.kind === "reopen" && r.storeStatus === "rejected";
  if (!appealOnly && r.storeStatus !== "pending") throw new AuthRefusal("status_changed", "console.queue.store_not_pending");
  const now = new Date();
  const won = await casReview(r.storeId, r.id, OPEN_STATUSES, { status: "rejected", decidedBy: ctx.user.id, decidedAt: now, reasonCode: reason, reasonNote: note ?? null, snoozeUntil: null, blocked: block === true });
  if (!won) return alreadyDecided(r.storeId, r.id);
  try {
    if (appealOnly) {
      await notify({ audience: "store_role", storeId: r.storeId, roles: ["owner", "admin"] }, "signup.rejected", { reason }, r.handle ? { link: appHref(r.handle) } : {});
      await auditFrom(ctx, "platform.signup.rejected", { storeId: r.storeId, target: r.storeId, meta: { from: "rejected", to: "rejected", reason, reviewId: r.id, appeal: true } });
    } else await transitionStore(ctx, r.storeId, "rejected", { reason, ...(note ? { note } : {}) });
  } catch (err) {
    await revert(ctx, r, "rejected");
    throw err;
  }
  let banned: boolean | undefined;
  if (block) {
    try {
      await banUser(ctx, r.userId, { reason: `Rejected at review: ${reason}`, ...(note ? { note } : {}) });
      banned = true;
    } catch (err) {
      // the rejection stands; the row says what really happened
      banned = false;
      await casReview(r.storeId, r.id, ["rejected"], { blocked: false }).catch(() => undefined);
      if (!(err instanceof AuthRefusal)) recordPlatformError("queue reject block", err, { storeId: r.storeId });
    }
  }
  return { ...decided(r, "rejected"), ...(banned === undefined ? {} : { banned }) };
}

/** PLA-§3.5 `snoozeReviewAction`: until 1 h / 4 h / tomorrow 09:00 platform time / 3 days; any kind. */
export async function snoozeReview(ctx: PlatformCtx, input: unknown, now: Date = new Date()): Promise<DecisionResult & { until?: string }> {
  requirePerm(ctx, "signups.decide");
  const { reviewId, until } = SnoozeInput.parse(input);
  const r = await oneReview(reviewId);
  const at = snoozeUntil(until, now, PLATFORM_TIMEZONE);
  const won = await casReview(r.storeId, r.id, ["pending", "snoozed"], { status: "snoozed", snoozeUntil: at });
  if (!won) return alreadyDecided(r.storeId, r.id);
  await auditFrom(ctx, "platform.signup.snoozed", { storeId: r.storeId, target: r.id, meta: { reviewId: r.id, until: at.toISOString() } });
  return { ...decided(r, "snoozed"), until: at.toISOString() };
}

/** PLA-§3.5 `reopenReviewAction`: an appeal row → `transitionStore(rejected → pending, "appeal")`; the row stays a review. */
export async function reopenReview(ctx: PlatformCtx, input: unknown): Promise<DecisionResult> {
  requirePerm(ctx, "signups.decide");
  const { reviewId } = ReopenInput.parse(input);
  const r = await oneReview(reviewId);
  if (r.kind !== "reopen") throw new AuthRefusal("invalid", "console.queue.not_an_appeal");
  if (!(OPEN_STATUSES as readonly string[]).includes(r.status)) return alreadyDecided(r.storeId, r.id);
  if (r.storeStatus !== "rejected") throw new AuthRefusal("status_changed", "console.queue.store_not_rejected");
  await transitionStore(ctx, r.storeId, "pending", { reason: "appeal" });
  if (r.status !== "pending") await casReview(r.storeId, r.id, ["snoozed", "needs_info"], { status: "pending", snoozeUntil: null });
  return decided(r, "pending");
}

/** The grant a request gets when staff press "Grant" without choosing one: the plan or the limit the store asked for. */
export function defaultGrant(req: ReviewRequest | null): GrantSpec | null {
  if (req?.kind === "plan_change") return { kind: "plan", planId: req.planId };
  if (req?.kind === "limit_raise" && req.asked !== null) return { kind: "override", key: req.key, value: req.asked };
  return null;
}

/** PLA-§3.5 `resolveRequestAction`: grant applies §9 (or restores a restricted store, or records the interest); decline needs a note. */
export async function resolveRequest(ctx: PlatformCtx, input: unknown): Promise<DecisionResult> {
  const { reviewId, outcome, grant, note } = ResolveInput.parse(input);
  const r = await oneReview(reviewId);
  if (!isRequestKind(r.kind)) throw new AuthRefusal("invalid", "console.queue.not_a_request");
  const kind: RequestKind = r.kind;
  requirePerm(ctx, resolvePermission(kind));
  if (!(OPEN_STATUSES as readonly string[]).includes(r.status)) return alreadyDecided(r.storeId, r.id);
  if (outcome === "decline" && !note) throw new FieldsError({ note: "console.queue.decline_note_required" });
  const spec = outcome === "grant" && (kind === "plan_change" || kind === "limit_raise") ? (grant ?? defaultGrant(r.request ?? null)) : null;
  if (outcome === "grant" && (kind === "plan_change" || kind === "limit_raise") && !spec) throw new FieldsError({ grant: "console.queue.grant_required" });
  if (spec && spec.kind !== "plan") requirePerm(ctx, "entitlements.override");
  if (outcome === "grant" && kind === "go_live" && r.storeStatus !== "restricted") throw new AuthRefusal("status_changed", "console.queue.store_not_restricted");

  const status: ReviewStatus = outcome === "grant" ? "approved" : "rejected";
  const won = await casReview(r.storeId, r.id, OPEN_STATUSES, { status, decidedBy: ctx.user.id, decidedAt: new Date(), reasonCode: outcome === "grant" ? "granted" : "declined", reasonNote: note ?? null, snoozeUntil: null });
  if (!won) return alreadyDecided(r.storeId, r.id);
  let restored = false;
  try {
    if (spec?.kind === "plan") await assignPlan(ctx, { storeId: r.storeId, planId: spec.planId, note: note ?? `Request ${r.id}` }, { notify: false });
    else if (spec) await setEntitlement(ctx, { storeId: r.storeId, key: spec.key, source: spec.kind, value: spec.value, expiresAt: spec.expiresAt ?? null, reason: note ?? `Request ${r.id}` }, { notify: false });
    else if (outcome === "grant" && kind === "go_live") {
      await transitionStore(ctx, r.storeId, "active", { reason: "issue_resolved", ...(note ? { note } : {}) });
      restored = true;
    }
  } catch (err) {
    await revert(ctx, r, status);
    throw err;
  }
  // one store notification per decision: the restore already told the store (store.restored)
  if (!restored) {
    await notify({ audience: "store_role", storeId: r.storeId, roles: ["owner", "admin"] }, "request.answered", { requestKind: kind, outcome: outcome === "grant" ? "granted" : "declined" });
  }
  await auditFrom(ctx, "platform.request.resolved", {
    storeId: r.storeId,
    target: r.id,
    meta: { reviewId: r.id, kind, outcome, ...(spec ? { grant: spec.kind === "plan" ? { kind: "plan", planId: spec.planId } : { kind: spec.kind, key: spec.key, value: spec.value } } : {}) },
  });
  return decided(r, status);
}

