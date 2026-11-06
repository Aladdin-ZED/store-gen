import "server-only";
/**
 * The store's merged timeline (platform.md PLA-§7.8, the Activity tab's `?view=timeline`, and Overview strip 10): one
 * stream, newest first, of lifecycle transitions, review decisions and requests, plan changes and boosts, milestones,
 * view-as sessions, staff notes of kind `decision` / `warning`, exports, handle renames and health snoozes.
 *
 *   const t = await listStoreTimeline(ctx, storeId, { limit: 8 });            // strip 10
 *   const next = await listStoreTimeline(ctx, storeId, { cursor: t.next });   // the tab, 50 per page
 *
 * Four bounded statements through `platformScope(ctx, storeId)` (§M.4): `audit_store_idx` with an action allow-list,
 * `sr_store_idx`, `imp_store_idx`, `pn_store_idx`, each at most `limit + 20` rows at or before the cursor, merged in
 * memory by time. Cursor = `{ at, source, id }` (signed, src/lib/platform/cursor.ts). Codes and names only: a
 * decision's note is staff text and shows to staff who may read notes (`stores.notes`; never analysts).
 */
import { desc, inArray, isNull, lte } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { auditLog, impersonationSessions, platformNotes, signupReviews, users } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import { decodeCursor, encodeCursor } from "../cursor";
import { platformScope } from "../seam";

export const TIMELINE_PAGE = 50;

/** the audit actions of the timeline (PLA-§7.8) */
export const TIMELINE_ACTIONS = [
  "store.created",
  "platform.store.restricted",
  "platform.store.suspended",
  "platform.store.restored",
  "platform.store.closed",
  "platform.store.deletion_cancelled",
  "platform.store.purge_requested",
  "platform.store.purge_confirmed",
  "store.closed",
  "store.reopened",
  "store.deletion_scheduled",
  "store.mode_changed",
  "platform.plan.changed",
  "platform.entitlement.set",
  "store.milestone.reached",
  "store.export_requested",
  "store.export_downloaded",
  "store.handle_renamed",
  "store.health.snoozed",
] as const;

export type TimelineSource = "audit" | "review" | "view" | "note";
const SOURCE_RANK: Record<TimelineSource, number> = { audit: 0, review: 1, view: 2, note: 3 };

export interface TimelineEvent {
  at: string;
  source: TimelineSource;
  id: string;
  /** the sentence: `console.timeline.<kind>` (an audit action, `review.<kind>.<status>`, `view.started`, `note.<kind>`) */
  kind: string;
  actor: { kind: "staff" | "member" | "system"; name: string | null };
  /** code-only variables (a reason code, a plan id, a milestone, a key, minutes) */
  vars: Record<string, string | number>;
  /** a decision's or a note's text (staff only, never analysts) */
  note: string | null;
}

export interface Timeline {
  events: TimelineEvent[];
  next: string | null;
}

const VAR_KEYS = ["from", "to", "reason", "milestone", "key", "source", "plan", "mode", "minutes", "why", "jobId"] as const;

function varsOf(meta: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!meta || typeof meta !== "object") return out;
  for (const k of VAR_KEYS) {
    const v = (meta as Record<string, unknown>)[k];
    if (typeof v === "string" && /^[A-Za-z0-9_.:-]{1,40}$/.test(v)) out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** a < b in the stream's order (newest first; ties by source, then id, both descending) */
function after(e: { at: number; source: TimelineSource; id: string }, c: { at: number; source: TimelineSource; id: string }): boolean {
  if (e.at !== c.at) return e.at < c.at;
  if (SOURCE_RANK[e.source] !== SOURCE_RANK[c.source]) return SOURCE_RANK[e.source] < SOURCE_RANK[c.source];
  return e.id < c.id;
}

async function auditEvents(scope: StoreScope, before: Date, take: number) {
  return db
    .select({ id: auditLog.id, at: auditLog.createdAt, action: auditLog.action, meta: auditLog.meta, actorKind: auditLog.actorKind, userId: auditLog.userId })
    .from(auditLog)
    .where(whereStore(auditLog, scope, inArray(auditLog.action, [...TIMELINE_ACTIONS]), lte(auditLog.createdAt, before)))
    .orderBy(desc(auditLog.id))
    .limit(take);
}

async function reviewEvents(scope: StoreScope, before: Date, take: number) {
  return db
    .select({
      id: signupReviews.id,
      at: signupReviews.createdAt,
      kind: signupReviews.kind,
      status: signupReviews.status,
      decidedBy: signupReviews.decidedBy,
      decidedAt: signupReviews.decidedAt,
      reasonCode: signupReviews.reasonCode,
      reasonNote: signupReviews.reasonNote,
    })
    .from(signupReviews)
    .where(whereStore(signupReviews, scope, lte(signupReviews.createdAt, before)))
    .orderBy(desc(signupReviews.createdAt), desc(signupReviews.id))
    .limit(take);
}

async function viewEvents(scope: StoreScope, before: Date, take: number) {
  return db
    .select({ id: impersonationSessions.id, at: impersonationSessions.startedAt, staffUserId: impersonationSessions.staffUserId, reason: impersonationSessions.reason, endedAt: impersonationSessions.endedAt, endedReason: impersonationSessions.endedReason, expiresAt: impersonationSessions.expiresAt })
    .from(impersonationSessions)
    .where(whereStore(impersonationSessions, scope, lte(impersonationSessions.startedAt, before)))
    .orderBy(desc(impersonationSessions.startedAt), desc(impersonationSessions.id))
    .limit(take);
}

async function noteEvents(scope: StoreScope, before: Date, take: number) {
  return db
    .select({ id: platformNotes.id, at: platformNotes.createdAt, kind: platformNotes.kind, body: platformNotes.body, authorId: platformNotes.authorId })
    .from(platformNotes)
    .where(whereStore(platformNotes, scope, inArray(platformNotes.kind, ["decision", "warning"]), isNull(platformNotes.deletedAt), lte(platformNotes.createdAt, before)))
    .orderBy(desc(platformNotes.createdAt), desc(platformNotes.id))
    .limit(take);
}

async function namesOf(ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((id): id is string => !!id && /^[0-9A-Z]{26}$/.test(id)))];
  if (!list.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

function parseCursor(token: string | null | undefined): { at: number; source: TimelineSource; id: string } | null {
  const k = decodeCursor(token);
  if (!k || k.length !== 3 || typeof k[0] !== "string" || typeof k[1] !== "string" || typeof k[2] !== "string") return null;
  const at = Date.parse(k[0]);
  if (!Number.isFinite(at) || !(k[1] in SOURCE_RANK)) return null;
  return { at, source: k[1] as TimelineSource, id: k[2] };
}

/** PLA-§7.8 (`console.read`): one page of the merged stream. */
export async function listStoreTimeline(ctx: PlatformCtx, storeId: string, opts: { cursor?: string | null; limit?: number } = {}): Promise<Timeline> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  const scope = platformScope(ctx, storeId);
  const limit = Math.max(1, Math.min(TIMELINE_PAGE, opts.limit ?? TIMELINE_PAGE));
  const cursor = parseCursor(opts.cursor);
  const before = new Date(cursor ? cursor.at : Date.now() + 60_000);
  const take = limit + 20;
  const notesAllowed = ctx.can("stores.notes") && ctx.role !== "analyst";
  const [audits, reviews, views, notes] = await Promise.all([
    auditEvents(scope, before, take),
    reviewEvents(scope, before, take),
    viewEvents(scope, before, take),
    notesAllowed ? noteEvents(scope, before, take) : Promise.resolve([]),
  ]);
  const staffNames = ctx.role === "analyst" ? new Map<string, string>() : await namesOf([...audits.map((a) => a.userId), ...reviews.map((r) => r.decidedBy), ...views.map((v) => v.staffUserId), ...notes.map((n) => n.authorId)]);
  const staff = (id: string | null) => ({ kind: "staff" as const, name: id ? (staffNames.get(id) ?? null) : null });

  const events: (TimelineEvent & { t: number })[] = [
    ...audits.map((a) => ({
      t: a.at.getTime(),
      at: a.at.toISOString(),
      source: "audit" as const,
      id: String(a.id).padStart(16, "0"),
      kind: a.action,
      actor: a.actorKind === "platform" || a.actorKind === "impersonation" ? staff(a.userId) : a.actorKind === "system" ? { kind: "system" as const, name: null } : { kind: "member" as const, name: null },
      vars: varsOf(a.meta),
      note: null,
    })),
    ...reviews.map((r) => ({
      t: r.at.getTime(),
      at: r.at.toISOString(),
      source: "review" as const,
      id: r.id,
      kind: `review.${r.kind}.${r.status}`,
      actor: r.decidedBy ? staff(r.decidedBy) : { kind: "member" as const, name: null },
      vars: { ...(r.reasonCode ? { reason: r.reasonCode } : {}), ...(r.decidedAt ? { decidedAt: r.decidedAt.toISOString() } : {}) },
      note: notesAllowed ? (r.reasonNote ?? null) : null,
    })),
    ...views.map((v) => {
      const end = v.endedAt ?? (v.expiresAt.getTime() < Date.now() ? v.expiresAt : null);
      return {
        t: v.at.getTime(),
        at: v.at.toISOString(),
        source: "view" as const,
        id: v.id,
        kind: end ? "view.ended" : "view.started",
        actor: staff(v.staffUserId),
        vars: { reason: v.reason, ...(end ? { minutes: Math.max(0, Math.round((end.getTime() - v.at.getTime()) / 60_000)) } : {}), ...(v.endedReason ? { why: v.endedReason } : {}) },
        note: null,
      };
    }),
    ...notes.map((n) => ({ t: n.at.getTime(), at: n.at.toISOString(), source: "note" as const, id: n.id, kind: `note.${n.kind}`, actor: staff(n.authorId), vars: {}, note: n.body })),
  ];
  const ordered = events
    .filter((e) => !cursor || after({ at: e.t, source: e.source, id: e.id }, cursor))
    .sort((a, b) => (after({ at: a.t, source: a.source, id: a.id }, { at: b.t, source: b.source, id: b.id }) ? 1 : -1));
  const page = ordered.slice(0, limit);
  const last = page[page.length - 1];
  return {
    events: page.map(({ t, ...e }) => (void t, e)),
    next: ordered.length > limit && last ? encodeCursor([last.at, last.source, last.id]) : null,
  };
}

