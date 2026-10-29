/**
 * The approval queue's pure rules (platform.md PLA-§3.5, §3.7, §9.3-§9.4, §L, §M.4; PD5, PD52, PD65). Isomorphic and
 * selftested: the tabs a row is listed in, the tab counts, the SLA tile, the page of a tab (search, sort, keyset), the
 * snooze times and the zod inputs of the decisions. src/lib/platform/queue.ts (server-only) reads the rows and writes
 * the decisions; everything that can be decided without the database is decided here.
 *
 *   tabsOf(row, now)                  // ["review", "fast"]: pending (or snoozed past its time), band fast, no hold flag
 *   tabCounts(rows, now)              // { review: 12, fast: 8, hold: 2, needs_info: 1, requests: 3, snoozed: 1, decided: 40 }
 *   snoozeUntil("tomorrow", now, tz)  // 09:00 tomorrow in the platform's time zone
 *
 * Tab rules (PLA-§3.5 "Queue header"; decisions recorded in the P1 report):
 *   - Review: kinds `signup` / `reopen` waiting for staff: `pending`, or `snoozed` past `snooze_until` (re-entry at
 *     query time, no job). An answered question puts the row back to `pending` (PLA-§22.7), so "needs_info rows the
 *     seller has answered" are pending rows with `answered_at`;
 *   - Fast lane: Review rows of band `fast` with no hold-class flag; Hold: Review rows of band `hold` /
 *     `reject_candidate`; both are views of Review, a row stays in Review too;
 *   - Needs info: `needs_info` (waiting on the seller); Requests: the other kinds while waiting for staff; Snoozed:
 *     `snoozed` before its time, any kind; Decided: `approved` / `rejected` / `withdrawn` decided in the last 30 days.
 */
import { z } from "zod";
import { ENTITLEMENT_KEYS, type EntitlementKey } from "@/lib/tenancy/entitlement-keys";
import { HOLD_CLASS, isSignupFlagCode } from "./signup-band";
import type { SignupBand, SignupFlagCode } from "./types";

export const QUEUE_TABS = ["review", "fast", "hold", "needs_info", "requests", "snoozed", "decided"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export const REVIEW_KINDS = ["signup", "reopen"] as const;
export const REQUEST_KINDS = ["go_live", "plan_change", "limit_raise", "mode_change", "domain"] as const;
export const ALL_KINDS = [...REVIEW_KINDS, ...REQUEST_KINDS] as const;
export type ReviewKind = (typeof ALL_KINDS)[number];
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const OPEN_STATUSES = ["pending", "needs_info", "snoozed"] as const;
export const DECIDED_STATUSES = ["approved", "rejected", "withdrawn"] as const;
export type ReviewStatus = (typeof OPEN_STATUSES)[number] | (typeof DECIDED_STATUSES)[number];

/** Decided rows stay listed this long (the Decided tab). */
export const DECIDED_WINDOW_DAYS = 30;
/** The SLA tile's median reads this window. */
export const SLA_WINDOW_DAYS = 7;
/** PLA-§L: list page size (25 below 768 px is the client's choice of the first page). */
export const QUEUE_PAGE_SIZE = 50;
/** PLA-§L: bulk approve. */
export const BULK_MAX = 50;
/** PLA-§L: staff question, seller answer, appeal, business-context field lengths. */
export const QUESTION_MAX = 500;
export const NOTE_MAX = 500;
export const CONTEXT_FIELD_MAX = 200;

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

export const isReviewKind = (kind: string): kind is (typeof REVIEW_KINDS)[number] => kind === "signup" || kind === "reopen";
export const isRequestKind = (kind: string): kind is RequestKind => (REQUEST_KINDS as readonly string[]).includes(kind);

/* ------------------------------------------------------------------ */
/* The index row and the tabs                                          */
/* ------------------------------------------------------------------ */

/** What the queue reads of every open row and every row decided in the last 30 days (the "index"). */
export interface QueueIndexRow {
  id: string;
  storeId: string;
  kind: ReviewKind;
  status: ReviewStatus;
  band: SignupBand;
  score: number;
  /** the stored flag codes (`signals.flags[*].code`) */
  codes: readonly string[];
  snoozeUntil: Date | null;
  createdAt: Date;
  submittedAt: Date | null;
  answeredAt: Date | null;
  decidedAt: Date | null;
  /** a staff member decided it (an automatic approval has no decider and is no SLA sample) */
  decidedBy: string | null;
  /** lower-cased search keys: store name, handle, the applicant's exact e-mail */
  storeName: string;
  handle: string | null;
  email: string;
  market: string;
}

/** The hold-class flags among stored codes (PLA-§3.4.1: each keeps the row out of the fast lane). */
export function holdCodes(codes: readonly string[]): SignupFlagCode[] {
  return [...new Set(codes.filter((c): c is SignupFlagCode => isSignupFlagCode(c) && HOLD_CLASS.has(c)))];
}

/** Waiting for staff now: `pending`, or `snoozed` whose time has come (a snooze without a time counts as due). */
export function waitingForStaff(row: Pick<QueueIndexRow, "status" | "snoozeUntil">, now: Date): boolean {
  return row.status === "pending" || (row.status === "snoozed" && (row.snoozeUntil === null || row.snoozeUntil.getTime() <= now.getTime()));
}

/** In the fast lane: a review row waiting for staff, band `fast`, no hold-class flag (bulk approve takes only these). */
export function inFastLane(row: Pick<QueueIndexRow, "kind" | "status" | "snoozeUntil" | "band" | "codes">, now: Date): boolean {
  return isReviewKind(row.kind) && waitingForStaff(row, now) && row.band === "fast" && holdCodes(row.codes).length === 0;
}

/** The tabs a row is listed in (none for an old decided row). */
export function tabsOf(row: QueueIndexRow, now: Date): QueueTab[] {
  if ((DECIDED_STATUSES as readonly string[]).includes(row.status)) {
    return row.decidedAt && row.decidedAt.getTime() >= now.getTime() - DECIDED_WINDOW_DAYS * DAY ? ["decided"] : [];
  }
  if (row.status === "snoozed" && !waitingForStaff(row, now)) return ["snoozed"];
  if (isRequestKind(row.kind)) return ["requests"];
  if (row.status === "needs_info") return ["needs_info"];
  const tabs: QueueTab[] = ["review"];
  if (inFastLane(row, now)) tabs.push("fast");
  if (row.band === "hold" || row.band === "reject_candidate") tabs.push("hold");
  return tabs;
}

export function tabCounts(rows: readonly QueueIndexRow[], now: Date): Record<QueueTab, number> {
  const counts = Object.fromEntries(QUEUE_TABS.map((t) => [t, 0])) as Record<QueueTab, number>;
  for (const row of rows) for (const tab of tabsOf(row, now)) counts[tab]++;
  return counts;
}

/** When the row started waiting for staff: the seller's answer, else "Submit for review", else the row itself. */
export function waitingFrom(row: Pick<QueueIndexRow, "answeredAt" | "submittedAt" | "createdAt">): Date {
  return row.answeredAt ?? row.submittedAt ?? row.createdAt;
}

/* ------------------------------------------------------------------ */
/* The SLA tile                                                        */
/* ------------------------------------------------------------------ */

export interface SlaTile {
  /** median minutes from "waiting" to a staff decision over the last 7 days (review kinds); null below one sample */
  medianDecisionMin: number | null;
  /** the decisions the median reads */
  n: number;
  /** the oldest review row waiting for staff, in minutes; null when nothing waits */
  oldestWaitingMin: number | null;
  /** review rows waiting longer than `signup.slaHours`; null while the target is unset (no invented promise) */
  pastSla: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function slaTile(rows: readonly QueueIndexRow[], now: Date, slaHours: number | null): SlaTile {
  const since = now.getTime() - SLA_WINDOW_DAYS * DAY;
  const samples: number[] = [];
  const waits: number[] = [];
  for (const r of rows) {
    if (!isReviewKind(r.kind)) continue;
    if ((r.status === "approved" || r.status === "rejected") && r.decidedBy && r.decidedAt && r.decidedAt.getTime() >= since) {
      samples.push(Math.max(0, (r.decidedAt.getTime() - (r.submittedAt ?? r.createdAt).getTime()) / MIN));
    } else if (waitingForStaff(r, now)) waits.push(Math.max(0, (now.getTime() - waitingFrom(r).getTime()) / MIN));
  }
  const med = median(samples);
  return {
    medianDecisionMin: med === null ? null : Math.round(med),
    n: samples.length,
    oldestWaitingMin: waits.length ? Math.floor(Math.max(...waits)) : null,
    pastSla: slaHours === null ? null : waits.filter((m) => m > slaHours * 60).length,
  };
}

/* ------------------------------------------------------------------ */
/* One page of a tab                                                   */
/* ------------------------------------------------------------------ */

export interface QueueFilter {
  /** store name or handle prefix, or an exact e-mail (≥ 2 characters) */
  q?: string;
  market?: string;
}

/** The sort key of a row in its tab: oldest waiting first, the Decided tab newest decision first. */
export function sortKeyOf(row: QueueIndexRow, tab: QueueTab): [number, string] {
  return tab === "decided" ? [-(row.decidedAt?.getTime() ?? 0), row.id] : [waitingFrom(row).getTime(), row.id];
}

const before = (a: readonly [number, string], b: readonly [number, string]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

export function matchesFilter(row: QueueIndexRow, f: QueueFilter): boolean {
  if (f.market && row.market !== f.market) return false;
  const q = f.q?.trim().toLowerCase();
  if (!q || q.length < 2) return true;
  const handle = q.startsWith("@") ? q.slice(1) : q;
  return row.storeName.startsWith(q) || (row.handle !== null && row.handle.startsWith(handle)) || (q.includes("@") && !q.startsWith("@") && row.email === q);
}

/**
 * The ids of one page of `tab` after the keyset `after` (the sort key of the previous page's last row), and the key of
 * this page's last row when more rows follow.
 */
export function pageOf(rows: readonly QueueIndexRow[], tab: QueueTab, filter: QueueFilter, after: [number, string] | null, now: Date, size = QUEUE_PAGE_SIZE): { ids: string[]; next: [number, string] | null } {
  const listed = rows
    .filter((r) => tabsOf(r, now).includes(tab) && matchesFilter(r, filter))
    .map((r) => ({ id: r.id, key: sortKeyOf(r, tab) }))
    .filter((r) => after === null || before(after, r.key))
    .sort((a, b) => (before(a.key, b.key) ? -1 : before(b.key, a.key) ? 1 : 0));
  const page = listed.slice(0, size);
  return { ids: page.map((r) => r.id), next: listed.length > size ? page[page.length - 1]!.key : null };
}

/* ------------------------------------------------------------------ */
/* Snooze                                                              */
/* ------------------------------------------------------------------ */

export const SNOOZE_CHOICES = ["1h", "4h", "tomorrow", "3d"] as const;
export type SnoozeChoice = (typeof SNOOZE_CHOICES)[number];

/** The UTC instant of the wall time `y-m-d hh:mm` in `timeZone` (two passes cover a DST jump). */
export function zonedInstant(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): Date {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (at: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(at))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(at / 1000) * 1000;
  };
  let t = wall - offset(wall);
  const second = wall - offset(t);
  if (second !== t) t = second;
  return new Date(t);
}

/** PLA-§3.5: 1 h, 4 h, tomorrow 09:00 in the platform's time zone, 3 days. */
export function snoozeUntil(choice: SnoozeChoice, now: Date, timeZone: string): Date {
  if (choice === "1h") return new Date(now.getTime() + HOUR);
  if (choice === "4h") return new Date(now.getTime() + 4 * HOUR);
  if (choice === "3d") return new Date(now.getTime() + 3 * DAY);
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number) as [number, number, number];
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  return zonedInstant(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 9, 0, timeZone);
}

/* ------------------------------------------------------------------ */
/* Inputs (zod v4)                                                     */
/* ------------------------------------------------------------------ */

const ID_RE = /^[0-9A-Z]{26}$/;
export const id26 = z.string().regex(ID_RE, "invalid id");

/** Plain text as stored: NFKC, control characters (but newlines) as spaces, trimmed. */
export function cleanText(s: string): string {
  return s.normalize("NFKC").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
}

/** One line or a short paragraph of plain text, 1..max characters once cleaned. */
export const plainText = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));
/** An optional text: missing, null or blank → undefined; else cleaned, ≤ max characters. */
export const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((s) => (s == null ? undefined : cleanText(s) || undefined))
    .pipe(z.string().max(max).optional());

/** PLA-§3.5: what the seller reads is `shell.rejected.<reason>`, never the risk flags. */
export const REJECT_REASONS = ["brand_impersonation", "prohibited_goods", "suspected_scam", "fake_identity", "duplicate_account", "incomplete", "market_not_served", "other"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

const entitlementKey = z.string().refine((k): k is EntitlementKey => (ENTITLEMENT_KEYS as readonly string[]).includes(k), "unknown entitlement key");

/** PLA-§3.5 `GrantSpec`: a plan, or an override / boost of one key (§9.4). */
export const GrantSpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan"), planId: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/) }),
  z.object({ kind: z.enum(["override", "boost"]), key: entitlementKey, value: z.union([z.number().int().min(0), z.boolean(), z.null()]), expiresAt: z.iso.datetime({ offset: true }).optional() }),
]);
export type GrantSpec = z.infer<typeof GrantSpecSchema>;

export const ApproveInput = z.object({ reviewId: id26, note: optionalText(NOTE_MAX) });
export const BulkApproveInput = z.object({ reviewIds: z.array(id26).min(1).max(BULK_MAX) });
export const AskInfoInput = z.object({ reviewId: id26, question: plainText(QUESTION_MAX) });
export const RejectInput = z.object({ reviewId: id26, reason: z.enum(REJECT_REASONS), note: optionalText(NOTE_MAX), block: z.boolean().optional() });
export const SnoozeInput = z.object({ reviewId: id26, until: z.enum(SNOOZE_CHOICES) });
export const ReopenInput = z.object({ reviewId: id26 });
export const ResolveInput = z.object({ reviewId: id26, outcome: z.enum(["grant", "decline"]), grant: GrantSpecSchema.optional(), note: optionalText(NOTE_MAX) });

/** PLA-§3.5: a note is required to approve a `hold` / `reject_candidate` row, and with every `other` reason. */
export function approveNeedsNote(band: SignupBand): boolean {
  return band === "hold" || band === "reject_candidate";
}

/** PLA-§3.5 `resolveRequestAction`: plan and limit requests are `entitlements.override`, the others `signups.decide`. */
export function resolvePermission(kind: RequestKind): "entitlements.override" | "signups.decide" {
  return kind === "plan_change" || kind === "limit_raise" ? "entitlements.override" : "signups.decide";
}

/* ------------------------------------------------------------------ */
/* Store requests (PLA-§3.7) and the business context (§22.7)          */
/* ------------------------------------------------------------------ */

const message = optionalText(QUESTION_MAX).transform((m) => m ?? null);

/** The request a store files (`ReviewRequest`, PLA-§2.1); unknown keys are dropped. */
export const ReviewRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan_change"), planId: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/), message }),
  z.object({
    kind: z.literal("limit_raise"),
    key: entitlementKey,
    used: z.number().int().min(0),
    limit: z.number().int().min(0).nullable(),
    asked: z.number().int().min(0).nullable(),
    message,
  }),
  z.object({ kind: z.literal("mode_change"), mode: z.enum(["store", "both"]), message }),
  z.object({ kind: z.literal("go_live"), message }),
  z.object({ kind: z.literal("domain"), host: z.string().min(3).max(253).regex(/^[a-z0-9.-]+$/) }),
]);

/** E.164: "+" and 8-15 digits, no leading zero. */
export const E164_RE = /^\+[1-9]\d{7,14}$/;

/** "Submit for review" (PLA-§22.7, §L): every field optional, plain text, the WhatsApp number E.164. */
export const BusinessContextInput = z.object({
  sells: optionalText(CONTEXT_FIELD_MAX).transform((v) => v ?? null),
  link: optionalText(CONTEXT_FIELD_MAX).transform((v) => v ?? null),
  whatsapp: z
    .string()
    .nullish()
    .transform((v) => (v == null ? null : v.replace(/[\s().-]/g, "") || null))
    .pipe(z.string().regex(E164_RE, "invalid phone").nullable()),
});
