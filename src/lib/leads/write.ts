import "server-only";
/**
 * The lead inbox writes (P3 LANDING; landing.md LAN-§10.3, §10.4, §10.5). Every function takes a `WriteScope` (D71:
 * an impersonation or platform scope cannot reach them; `storeAction` refuses the write before) and the writer's
 * actor and role. An agent writes only the leads they see (their own, or an unassigned `new` one); every UPDATE carries
 * the store predicate and the same guard, so another store's or another agent's id answers `not_found`.
 *
 *   logAttempt     WhatsApp or call from the inbox: attempts + 1, the first contact time, `new` → `contacted`, the
 *                  next follow-up `next_at = contacted_at + followUpHours[attempts - 1]` (none past the list); the
 *                  phone is revealed to the caller, audited `lead.phone_revealed` (the OP-07 rule)
 *   assignLeads    managers: to an active member of the store, or back to the pool (null)
 *   takeNextLead   the oldest unassigned `new` lead, claimed by `UPDATE … WHERE assignee_id IS NULL`
 *   markLost       `lost` with a reason; no follow-up
 *   setFollowUp    the next follow-up, or none
 * No message is ever sent to a shopper by the platform (LD10): the inbox opens wa.me or tel: on the agent's device.
 */
import { and, asc, eq, gte, inArray, isNull, or, type SQL } from "drizzle-orm";
import { affected, auditIn } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { leads, storeMembers } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { whereStore } from "@/lib/tenancy/sql";
import type { Actor, WriteScope } from "@/lib/tenancy/types";
import { LEAD_WINDOW_DAYS, LOST_REASONS, type LostReason } from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Who writes: the seam's actor and the member's role (an agent's writes are limited to the leads they see). */
export interface LeadWriter {
  actor: Actor;
  role: string;
}

type NotFound = { ok: false; error: "not_found" };
const NOT_FOUND: NotFound = { ok: false, error: "not_found" };

/** The agent guard of a write: own leads, or an unassigned `new` one. */
function writableBy(by: LeadWriter): SQL | undefined {
  if (by.role !== "agent") return undefined;
  const me = by.actor.userId ?? "";
  return or(eq(leads.assigneeId, me), and(isNull(leads.assigneeId), eq(leads.status, "new")));
}

const OPEN = ["new", "contacted"] as const;

/** `contacted_at + followUpHours[attempts - 1]`, or null past the list (LAN-§10.4). Pure. */
export function nextFollowUp(contactedAt: Date, attempts: number, followUpHours: readonly number[]): Date | null {
  const hours = followUpHours[attempts - 1];
  return typeof hours === "number" && hours > 0 ? new Date(contactedAt.getTime() + hours * HOUR_MS) : null;
}

/**
 * One contact attempt (WhatsApp or call). Answers the lead's E.164 phone for the caller's link (null for an intent
 * without a phone) and the new attempt count. A converted, recovered or lost lead keeps its status and gets no
 * follow-up. The attempt is counted once even when two tabs race (the UPDATE is guarded by the count it read).
 */
export async function logAttempt(
  scope: WriteScope,
  by: LeadWriter,
  leadId: string,
  channel: "whatsapp" | "call",
  now: Date = new Date(),
): Promise<{ ok: true; phone: string | null; attempts: number } | NotFound> {
  if (!ID_RE.test(leadId) || (channel !== "whatsapp" && channel !== "call")) return NOT_FOUND;
  const landing = await getStoreSetting(scope, "landing");
  for (let tries = 0; tries < 3; tries++) {
    const [lead] = await db
      .select({ phone: leads.phone, status: leads.status, attempts: leads.attempts, contactedAt: leads.contactedAt, assigneeId: leads.assigneeId })
      .from(leads)
      .where(whereStore(leads, scope, eq(leads.id, leadId), gte(leads.createdAt, new Date(now.getTime() - LEAD_WINDOW_DAYS * DAY_MS)), writableBy(by)))
      .limit(1);
    if (!lead) return NOT_FOUND;
    const attempts = Math.min(127, Number(lead.attempts) + 1);
    const contactedAt = lead.contactedAt ?? now;
    const open = (OPEN as readonly string[]).includes(lead.status);
    const res = await db
      .update(leads)
      .set({
        attempts,
        contactedAt,
        status: lead.status === "new" ? "contacted" : lead.status,
        nextAt: open ? nextFollowUp(contactedAt, attempts, landing.leads.followUpHours) : null,
        // contacting an unassigned lead takes it (an agent's own queue from then on)
        assigneeId: lead.assigneeId ?? by.actor.userId,
        updatedAt: now,
      })
      .where(whereStore(leads, scope, eq(leads.id, leadId), eq(leads.attempts, Number(lead.attempts))));
    if (affected(res) === 1) {
      await auditIn(scope, by.actor, "lead.phone_revealed", { target: leadId, meta: { leadId, channel, attempts } });
      return { ok: true, phone: lead.phone, attempts };
    }
  }
  return NOT_FOUND;
}

/** Managers: the leads `ids` go to `userId` (an active member of this store) or back to the pool (null). */
export async function assignLeads(scope: WriteScope, by: LeadWriter, ids: readonly string[], userId: string | null): Promise<{ ok: true; n: number } | { ok: false; error: "invalid" }> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && ID_RE.test(id)))].slice(0, 200);
  if (!wanted.length) return { ok: true, n: 0 };
  if (userId !== null) {
    if (!ID_RE.test(userId)) return { ok: false, error: "invalid" };
    const [member] = await db
      .select({ role: storeMembers.role })
      .from(storeMembers)
      .where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId), eq(storeMembers.status, "active")))
      .limit(1);
    if (!member) return { ok: false, error: "invalid" };
  }
  const res = await db
    .update(leads)
    .set({ assigneeId: userId, updatedAt: new Date() })
    .where(whereStore(leads, scope, inArray(leads.id, wanted), writableBy(by)));
  return { ok: true, n: affected(res) };
}

/** "Take next": the oldest unassigned `new` lead of the last 30 days, claimed for the writer; null when none is left. */
export async function takeNextLead(scope: WriteScope, by: LeadWriter, now: Date = new Date()): Promise<string | null> {
  const me = by.actor.userId;
  if (!me) return null;
  const since = new Date(now.getTime() - LEAD_WINDOW_DAYS * DAY_MS);
  for (let tries = 0; tries < 5; tries++) {
    const [next] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(whereStore(leads, scope, isNull(leads.assigneeId), eq(leads.status, "new"), gte(leads.createdAt, since)))
      .orderBy(asc(leads.createdAt), asc(leads.id))
      .limit(1);
    if (!next) return null;
    // the claim: a parallel "Take next" that won the row leaves this UPDATE with no row, and the loop tries the next one
    const res = await db
      .update(leads)
      .set({ assigneeId: me, updatedAt: now })
      .where(whereStore(leads, scope, eq(leads.id, next.id), isNull(leads.assigneeId), eq(leads.status, "new")));
    if (affected(res) === 1) return next.id;
  }
  return null;
}

/** `lost` with a reason (LAN-§2.1); only an open lead (`new` or `contacted`). */
export async function markLost(scope: WriteScope, by: LeadWriter, leadId: string, reason: LostReason): Promise<{ ok: true } | NotFound | { ok: false; error: "invalid" }> {
  if (!(LOST_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "invalid" };
  if (!ID_RE.test(leadId)) return NOT_FOUND;
  const res = await db
    .update(leads)
    .set({ status: "lost", lostReason: reason, nextAt: null, updatedAt: new Date() })
    .where(whereStore(leads, scope, eq(leads.id, leadId), inArray(leads.status, [...OPEN]), writableBy(by)));
  return affected(res) === 1 ? { ok: true } : NOT_FOUND;
}

/** The next follow-up of an open lead (now … 30 days ahead), or none (null). */
export async function setFollowUp(scope: WriteScope, by: LeadWriter, leadId: string, at: Date | null, now: Date = new Date()): Promise<{ ok: true } | NotFound | { ok: false; error: "invalid" }> {
  if (!ID_RE.test(leadId)) return NOT_FOUND;
  if (at !== null && (!(at instanceof Date) || Number.isNaN(at.getTime()) || at.getTime() < now.getTime() - 60_000 || at.getTime() > now.getTime() + LEAD_WINDOW_DAYS * DAY_MS)) {
    return { ok: false, error: "invalid" };
  }
  const res = await db
    .update(leads)
    .set({ nextAt: at, updatedAt: now })
    .where(whereStore(leads, scope, eq(leads.id, leadId), inArray(leads.status, [...OPEN]), writableBy(by)));
  return affected(res) === 1 ? { ok: true } : NOT_FOUND;
}
