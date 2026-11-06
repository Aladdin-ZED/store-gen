import "server-only";
/**
 * The lead read repository (P3 LANDING; landing.md LAN-§10.2 "Reads go through one repository, masked by scope",
 * §10.3, §23.8, §23.9; core D70, §B.8). Every lead read of the landing part lives here: the inbox rows
 * (`listLeadRows`), one lead (`getLeadRow`), the 30-day header (`leadCounts`) and the ⌘K lead and `WA-` ref search
 * (`searchLeads`). Each row leaves through P1's `maskIfImpersonation(scope, row)`, so under "View as store" names read
 * "Salma B." and notes "Hidden" with no work in a component; the phone is always masked by P4's `maskPhone`
 * ("06 •• •• 12 34") and the selection text carries no customer data.
 *
 * Who sees what: the store's members with `leads.read`; an agent sees the leads assigned to them plus the unassigned
 * `new` ones (the role arrives from the action's ctx, never from the query). Rows are those of the last 30 days (the
 * retention window, core §H.2 slot 8). Test leads are listed with their flag and never counted (D54). Risk chips come
 * from the store's `customers` counters and blocklist at list time, never stored.
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { likeEscape } from "@/lib/admin-data/store-audit";
import { dayStart } from "@/lib/admin-data/time";
import { db } from "@/lib/db/client";
import { blocklist, customers, leads, orders, pages } from "@/lib/db/schema";
import { maskPhone } from "@/lib/orders/masking";
import { maskIfImpersonation } from "@/lib/platform/mask";
import { storeTimeZone } from "@/lib/stats";
import { getStoreById } from "@/lib/tenancy/public";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import {
  LEAD_MIN_N,
  LEAD_WINDOW_DAYS,
  LeadQuery,
  type LeadCounts,
  type LeadQueryParsed,
  type LeadKind,
  type LeadRisk,
  type LeadRow,
  type LeadStatus,
  type LeadViewer,
  type LostReason,
  LOST_REASONS,
} from "./types";

const DAY_MS = 86_400_000;
const WA_REF_RE = /^WA-?([0-9A-HJKMNP-TV-Z]{6})$/;

/**
 * P4's mask ("+212612345678" → "06 •• •• 56 78"). Until P4 merges its body is a typed stub that throws; the same format
 * is then written here so the inbox never shows a full number (the stub is replaced at P4's merge, this path goes).
 */
export function maskLeadPhone(e164: string): string {
  try {
    return maskPhone(e164);
  } catch {
    const d = e164.replace(/\D/g, "");
    if (d.length < 8) return "•• •• •• ••";
    const last = `${d.slice(-4, -2)} ${d.slice(-2)}`;
    if (d.startsWith("212") && d.length === 12) return `0${d[3]} •• •• ${last}`;
    return `+${d.slice(0, 2)} ${d[2]} •• •• ${last}`;
  }
}

/** The agent restriction (LAN-§10.3): own leads plus the unassigned `new` ones. Managers and up see every lead. */
function visibleTo(viewer: LeadViewer): SQL | undefined {
  if (viewer.role !== "agent") return undefined;
  return or(eq(leads.assigneeId, viewer.userId), and(isNull(leads.assigneeId), eq(leads.status, "new")));
}

const windowStart = (now: Date) => new Date(now.getTime() - LEAD_WINDOW_DAYS * DAY_MS);

const ROW = {
  id: leads.id,
  status: leads.status,
  kind: leads.kind,
  ref: leads.ref,
  phone: leads.phone,
  name: leads.name,
  city: leads.city,
  note: leads.note,
  pageId: leads.pageId,
  pageName: pages.name,
  locale: pages.locale,
  selection: leads.selection,
  totalCents: leads.totalCents,
  createdAt: leads.createdAt,
  attempts: leads.attempts,
  assigneeId: leads.assigneeId,
  contactedAt: leads.contactedAt,
  nextAt: leads.nextAt,
  lostReason: leads.lostReason,
  convertedOrderId: leads.convertedOrderId,
  convertedVia: leads.convertedVia,
  isTest: leads.isTest,
};
type RawLead = {
  id: string;
  status: LeadStatus;
  kind: LeadKind;
  ref: string | null;
  phone: string | null;
  name: string | null;
  city: string | null;
  note: string | null;
  pageId: string;
  pageName: string | null;
  locale: string | null;
  selection: string | null;
  totalCents: number | null;
  createdAt: Date;
  attempts: number;
  assigneeId: string | null;
  contactedAt: Date | null;
  nextAt: Date | null;
  lostReason: string | null;
  convertedOrderId: string | null;
  convertedVia: "idem" | "phone" | "agent" | null;
  isTest: boolean;
};

/** The inbox columns of the store's leads matching `conds`, with their page's name and locale (the store's own page). */
function selectLeads(scope: StoreScope, ...conds: (SQL | undefined)[]) {
  return db
    .select(ROW)
    .from(leads)
    .leftJoin(pages, and(eq(pages.id, leads.pageId), inStore(pages, scope)))
    .where(whereStore(leads, scope, ...conds));
}

/** The risk chips of the rows' phones: the store's customers counters and its phone blocklist. */
async function riskOf(scope: StoreScope, phones: readonly string[]): Promise<Map<string, LeadRisk>> {
  const out = new Map<string, LeadRisk>();
  const unique = [...new Set(phones)];
  if (!unique.length) return out;
  const [counters, blocked] = await Promise.all([
    db
      .select({ phone: customers.phone, orders: customers.ordersCount, delivered: customers.deliveredCount, refused: customers.refusedCount, fake: customers.fakeCount })
      .from(customers)
      .where(whereStore(customers, scope, inArray(customers.phone, unique))),
    db
      .select({ value: blocklist.value })
      .from(blocklist)
      .where(whereStore(blocklist, scope, eq(blocklist.kind, "phone"), inArray(blocklist.value, unique))),
  ]);
  const isBlocked = new Set(blocked.map((b) => b.value));
  for (const c of counters) out.set(c.phone, { orders: c.orders, delivered: c.delivered, refused: c.refused, fake: c.fake, blocked: isBlocked.has(c.phone) });
  for (const phone of isBlocked) if (!out.has(phone)) out.set(phone, { orders: 0, delivered: 0, refused: 0, fake: 0, blocked: true });
  return out;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const lostReasonOf = (v: string | null): LostReason | null => ((LOST_REASONS as readonly string[]).includes(v ?? "") ? (v as LostReason) : null);

/** Raw rows → inbox rows: risk, masked phone, then the scope's mask (the one call site of `maskIfImpersonation`). */
async function toRows(scope: StoreScope, raw: readonly RawLead[]): Promise<LeadRow[]> {
  if (!raw.length) return [];
  const [risk, store] = await Promise.all([riskOf(scope, raw.flatMap((r) => (r.phone ? [r.phone] : []))), getStoreById(scope.storeId)]);
  const currency = store?.currency ?? "MAD";
  return raw.map((r) => {
    // the phone is masked for every scope; the mask helper then hides the name and the note under impersonation
    const fields = maskIfImpersonation(scope, { name: r.name, phone: null, address: null, city: r.city, landmark: null, note: r.note });
    return {
      id: r.id,
      status: r.status,
      kind: r.kind,
      ref: r.ref,
      phone: r.phone ? maskLeadPhone(r.phone) : null,
      name: fields.name,
      city: fields.city,
      note: fields.note,
      pageId: r.pageId,
      pageName: r.pageName,
      locale: r.locale,
      selection: r.selection,
      totalCents: r.totalCents === null ? null : Number(r.totalCents),
      currency,
      createdAt: r.createdAt.toISOString(),
      attempts: Number(r.attempts),
      assigneeId: r.assigneeId,
      contactedAt: iso(r.contactedAt),
      nextAt: iso(r.nextAt),
      lostReason: lostReasonOf(r.lostReason),
      convertedOrderId: r.convertedOrderId,
      convertedVia: r.convertedVia,
      isTest: !!r.isTest,
      risk: r.phone ? (risk.get(r.phone) ?? null) : null,
    };
  });
}

function viewCond(view: LeadQuery["view"], now: Date): SQL | undefined {
  switch (view) {
    case "new":
    case "contacted":
    case "recovered":
    case "lost":
      return eq(leads.status, view);
    case "due":
      return and(isNotNull(leads.nextAt), lte(leads.nextAt, now), inArray(leads.status, ["new", "contacted"]));
    default:
      return undefined;
  }
}

const CURSOR_RE = /^(\d{10,16})_([0-9A-HJKMNP-TV-Z]{26})$/;
const cursorOf = (r: RawLead) => `${r.createdAt.getTime()}_${r.id}`;

/** The inbox query's predicates (window, agent visibility, view, filters), shared by the list and the CSV export. */
async function queryConds(scope: StoreScope, q: LeadQueryParsed, viewer: LeadViewer, now: Date): Promise<(SQL | undefined)[]> {
  const conds: (SQL | undefined)[] = [gte(leads.createdAt, windowStart(now)), visibleTo(viewer), viewCond(q.view, now)];
  if (q.pageId) conds.push(eq(leads.pageId, q.pageId));
  if (q.city) conds.push(eq(leads.city, q.city));
  if (q.kind) conds.push(eq(leads.kind, q.kind));
  if (q.assignee) conds.push(q.assignee === "none" ? isNull(leads.assigneeId) : eq(leads.assigneeId, q.assignee));
  if (q.from || q.to) {
    const tz = await storeTimeZone(scope);
    if (q.from) conds.push(gte(leads.createdAt, dayStart(q.from, tz)));
    if (q.to) conds.push(lt(leads.createdAt, new Date(dayStart(q.to, tz).getTime() + DAY_MS)));
  }
  return conds;
}

/**
 * One page of the inbox, newest first, in the 30-day window. `next` is the cursor of the following page. Every row is
 * the store's own (scope), visible to the viewer (agents) and masked for the scope.
 */
export async function listLeadRows(scope: StoreScope, input: LeadQuery, viewer: LeadViewer, now: Date = new Date()): Promise<{ rows: LeadRow[]; next?: string }> {
  const q = LeadQuery.parse(input);
  const conds = await queryConds(scope, q, viewer, now);
  const cur = q.cursor ? CURSOR_RE.exec(q.cursor) : null;
  if (cur) {
    const at = new Date(Number(cur[1]));
    conds.push(or(lt(leads.createdAt, at), and(eq(leads.createdAt, at), lt(leads.id, cur[2]!))));
  }
  const raw = (await selectLeads(scope, ...conds)
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(q.limit + 1)) as RawLead[];
  const more = raw.length > q.limit;
  const page = more ? raw.slice(0, q.limit) : raw;
  const rows = await toRows(scope, page);
  return more ? { rows, next: cursorOf(page[page.length - 1]!) } : { rows };
}

/** One lead of the store, visible to the viewer, or null (another store's id answers like a missing one). */
export async function getLeadRow(scope: StoreScope, id: string, viewer: LeadViewer, now: Date = new Date()): Promise<LeadRow | null> {
  if (typeof id !== "string" || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return null;
  const raw = (await selectLeads(scope, eq(leads.id, id), gte(leads.createdAt, windowStart(now)), visibleTo(viewer))
    .limit(1)) as RawLead[];
  const [row] = await toRows(scope, raw);
  return row ?? null;
}

/** The CSV export's ceiling (one file, newest first). */
export const LEAD_EXPORT_MAX = 5_000;

/**
 * Every lead of the inbox query for the CSV export (`orders.export`, LAN-§10.3 bulk), newest first, at most
 * `LEAD_EXPORT_MAX`: the inbox rows themselves, so phones stay masked and names and notes follow the scope's mask.
 * `ids` narrows the export to a bulk selection.
 */
export async function exportLeadRows(scope: StoreScope, input: LeadQuery, viewer: LeadViewer, ids: readonly string[] | null = null, now: Date = new Date()): Promise<LeadRow[]> {
  const q = LeadQuery.parse(input);
  const conds = await queryConds(scope, q, viewer, now);
  if (ids) {
    const wanted = [...new Set(ids.filter((id) => typeof id === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)))].slice(0, 500);
    if (!wanted.length) return [];
    conds.push(inArray(leads.id, wanted));
  }
  const raw = (await selectLeads(scope, ...conds)
    .orderBy(desc(leads.createdAt), desc(leads.id))
    .limit(LEAD_EXPORT_MAX)) as RawLead[];
  return toRows(scope, raw);
}

/** The cities of the viewer's leads in the 30-day window (the inbox's city filter), most frequent first, at most 40. */
export async function leadCities(scope: StoreScope, viewer: LeadViewer, now: Date = new Date()): Promise<string[]> {
  const rows = await db
    .select({ city: leads.city, n: sql<number>`COUNT(*)` })
    .from(leads)
    .where(whereStore(leads, scope, gte(leads.createdAt, windowStart(now)), visibleTo(viewer), isNotNull(leads.city)))
    .groupBy(leads.city)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(40);
  return rows.flatMap((r) => (r.city ? [r.city] : []));
}

/** The middle value (minutes, rounded) of a sorted list. */
function median(sorted: readonly number[]): number {
  const m = sorted.length >> 1;
  return Math.round(sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2);
}

/**
 * The inbox header over the last 30 days (LAN-§10.3): leads, contacted, recovered (n, % of contacted, and the
 * confirmed and delivered orders among them, never blended), converted without contact, first-contact p50. Test leads
 * are excluded from every count; a % or a median below n = 20 is null. An agent's header counts what they see.
 */
export async function leadCounts(scope: StoreScope, viewer: LeadViewer, now: Date = new Date()): Promise<LeadCounts> {
  const base = [gte(leads.createdAt, windowStart(now)), eq(leads.isTest, false), visibleTo(viewer)];
  const [[agg], waits] = await Promise.all([
    db
      .select({
        leads: sql<number>`COUNT(*)`,
        contacted: sql<number>`COALESCE(SUM(${leads.contactedAt} IS NOT NULL), 0)`,
        recovered: sql<number>`COALESCE(SUM(${leads.status} = 'recovered'), 0)`,
        recoveredConfirmed: sql<number>`COALESCE(SUM(${leads.status} = 'recovered' AND ${orders.confirmState} = 'confirmed'), 0)`,
        recoveredDelivered: sql<number>`COALESCE(SUM(${leads.status} = 'recovered' AND ${orders.shipState} = 'delivered'), 0)`,
        convertedWithoutContact: sql<number>`COALESCE(SUM(${leads.status} = 'converted' AND ${leads.attempts} = 0), 0)`,
      })
      .from(leads)
      .leftJoin(orders, and(eq(orders.id, leads.convertedOrderId), inStore(orders, scope)))
      .where(whereStore(leads, scope, ...base)),
    db
      .select({ s: sql<number>`TIMESTAMPDIFF(SECOND, ${leads.createdAt}, ${leads.contactedAt})` })
      .from(leads)
      .where(whereStore(leads, scope, ...base, isNotNull(leads.contactedAt)))
      .orderBy(asc(leads.createdAt))
      .limit(10_000),
  ]);
  const contacted = Number(agg?.contacted ?? 0);
  const recovered = Number(agg?.recovered ?? 0);
  const minutes = waits.map((w) => Math.max(0, Number(w.s)) / 60).sort((a, b) => a - b);
  return {
    days: LEAD_WINDOW_DAYS,
    leads: Number(agg?.leads ?? 0),
    contacted,
    recovered: {
      n: recovered,
      pct: contacted >= LEAD_MIN_N ? Math.round((recovered / contacted) * 1000) / 10 : null,
      confirmed: Number(agg?.recoveredConfirmed ?? 0),
      delivered: Number(agg?.recoveredDelivered ?? 0),
    },
    convertedWithoutContact: Number(agg?.convertedWithoutContact ?? 0),
    firstContactP50Min: minutes.length >= LEAD_MIN_N ? median(minutes) : null,
    firstContactN: minutes.length,
  };
}

/** A typed `WA-XXXXXX` (or `wa xxxxxx`): the canonical ref, else null. */
export function waRefOf(q: string): string | null {
  const m = WA_REF_RE.exec(q.trim().toUpperCase().replace(/\s+/g, "-"));
  return m ? `WA-${m[1]}` : null;
}

/**
 * ⌘K over the store's leads (LAN-§23.9): a `WA-` ref finds its intent; six digits or more search the phones; two
 * letters or more search names by prefix. Agents get only what they see in the inbox. Masked like the inbox rows.
 */
export async function searchLeads(scope: StoreScope, q: string, viewer: LeadViewer, limit = 6, now: Date = new Date()): Promise<{ rows: LeadRow[]; byRef: boolean }> {
  const text = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const ref = waRefOf(text);
  let match: SQL | undefined;
  if (ref) match = eq(leads.ref, ref);
  else {
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 6 && digits.length >= text.replace(/[\s+().-]/g, "").length) match = like(leads.phone, `%${likeEscape(digits.replace(/^0+/, "").slice(-9))}%`);
    else if (text.length >= 2) match = like(leads.name, `${likeEscape(text)}%`);
  }
  if (!match) return { rows: [], byRef: false };
  const raw = (await selectLeads(scope, match, gte(leads.createdAt, windowStart(now)), visibleTo(viewer))
    .orderBy(desc(leads.createdAt))
    .limit(Math.max(1, Math.min(20, limit)))) as RawLead[];
  return { rows: await toRows(scope, raw), byRef: !!ref };
}

/**
 * The pulse counters (LAN-§23.8, SF-06): one indexed COUNT each (`leads_store_next_idx`, `leads_store_status_idx`) over
 * the last 30 days, test leads left out. `leadsDue`: open leads whose follow-up time has come (an agent: their own);
 * `leadsNew`: `new` form leads; `waIntentsNew`: `new` WhatsApp intents (an agent: their own and the unassigned ones).
 * Counts only: nothing here is customer data, so nothing is masked.
 */
export async function pulseLeadCounts(scope: StoreScope, viewer: LeadViewer, now: Date = new Date()): Promise<{ leadsDue: number; leadsNew: number; waIntentsNew: number }> {
  const count = async (...conds: (SQL | undefined)[]) => {
    const [row] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(leads)
      .where(whereStore(leads, scope, ...conds));
    return Number(row?.n ?? 0);
  };
  const since = gte(leads.createdAt, windowStart(now));
  const real = eq(leads.isTest, false);
  const agent = viewer.role === "agent";
  const seen = agent ? or(eq(leads.assigneeId, viewer.userId), isNull(leads.assigneeId)) : undefined;
  const [leadsDue, leadsNew, waIntentsNew] = await Promise.all([
    count(and(isNotNull(leads.nextAt), lte(leads.nextAt, now)), inArray(leads.status, ["new", "contacted"]), real, since, agent ? eq(leads.assigneeId, viewer.userId) : undefined),
    count(eq(leads.status, "new"), eq(leads.kind, "form"), real, since, seen),
    count(eq(leads.status, "new"), eq(leads.kind, "whatsapp"), real, since, seen),
  ]);
  return { leadsDue, leadsNew, waIntentsNew };
}
