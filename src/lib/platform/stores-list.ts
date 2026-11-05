import "server-only";
/**
 * The console's stores list (platform.md PLA-§6.1, PL-06, TN-01, TN-03; PD26, PD35, PD44): `/admin/stores` and its CSV.
 *
 *   const page = await listStores(ctx, parseStoresFilter(searchParams), searchParams.cursor);   // 50 rows + next cursor
 *   const csv = await storesCsv(ctx, filter);                                                  // ≤ 10,000 rows, admin+
 *
 * One annotated statement lists the stores (`stores s LEFT JOIN store_health h`, the latest signup band through
 * `sr_store_kind_idx`, the owner e-mail search through `sm_store_role_idx`), keyset by `[sortValue, id]`, 51 rows; the
 * owners of the page come from a second statement over `store_members` for its 50 ids. Seller contact follows PD35:
 * analysts and support see the e-mail masked. The CSV carries no e-mail and no phone (PLA-§6.1) and is audited
 * `platform.stores.exported`. No bulk lifecycle action exists (PD44).
 */
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { plans, storeHealth, storeMembers, stores, users } from "@/lib/db/schema";
import { LEGACY_STORE_ID } from "@/lib/db/store-handles";
import type { HealthFlag, HealthGroup, HealthMetrics } from "@/lib/health/types";
import type { PlatformCtx, StoreStatus } from "@/lib/tenancy/types";
import { csvCell } from "./console-rules";
import { decodeCursor, encodeCursor } from "./cursor";
import { sellerContact, type Masked } from "./mask";
import { STORES_CSV_MAX, STORES_PAGE_SIZE, STORE_MODES, type StoreSort, type StoresFilter } from "./stores-filter";

export { STORES_CSV_MAX, STORES_PAGE_SIZE, STORE_SORTS, SAVED_CHIPS, StoresFilterSchema, parseStoresFilter, storesQuery, chipOf } from "./stores-filter";
export type { SavedChip, StoreSort, StoresFilter } from "./stores-filter";

export interface StoreListRow {
  id: string;
  handle: string | null;
  name: string;
  status: StoreStatus;
  mode: (typeof STORE_MODES)[number];
  plan: { id: string; name: string | null };
  market: string;
  currency: string;
  /** plan `internal` or store #1 (TN-03) */
  internal: boolean;
  owner: { userId: string; firstName: string; email: string | Masked } | null;
  /** owners beyond the first */
  moreOwners: number;
  health: { score: number; attention: number; components: Partial<Record<HealthGroup, number>>; computedAt: string } | null;
  /** up to 3 flags, most severe first, and how many more */
  flags: HealthFlag[];
  moreFlags: number;
  /** `store_health.metrics.orders7d`; null for pending stores and before the first snapshot ("—") */
  orders7d: number | null;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface StoresPage {
  rows: StoreListRow[];
  next: string | null;
  sort: StoreSort;
  /** the filters in force (for the chips and "Clear filters") */
  filter: StoresFilter;
}

function requireRead(ctx: PlatformCtx): void {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
}

const likePrefix = (q: string) => `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const latestBand = sql`(SELECT r.band FROM signup_reviews r WHERE r.store_id = ${stores.id} AND r.kind = 'signup' ORDER BY r.created_at DESC, r.id DESC LIMIT 1)`;
const scoreKey = sql`COALESCE(${storeHealth.score}, 101)`;
const activityKey = sql`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${storeHealth.metrics}, '$.lastActiveAt')), '')`;

/** The WHERE of a filter (shared by the list and the CSV). */
function filterConds(f: StoresFilter): SQL[] {
  const conds: SQL[] = [];
  if (f.status?.length) conds.push(inArray(stores.status, f.status));
  if (f.mode) conds.push(eq(stores.mode, f.mode));
  if (f.plan) conds.push(eq(stores.planId, f.plan));
  if (f.market) conds.push(eq(stores.market, f.market));
  if (f.attention) conds.push(sql`${storeHealth.attention} >= 2`);
  if (f.dormant) conds.push(sql`${storeHealth.dormant} = 1`);
  if (f.band?.length) conds.push(sql`${latestBand} IN (${sql.join(f.band.map((b) => sql`${b}`), sql`, `)})`);
  if (f.flag?.length) {
    conds.push(sql`(${sql.join(f.flag.map((code) => sql`JSON_CONTAINS(JSON_EXTRACT(${storeHealth.flags}, '$[*].code'), ${JSON.stringify(code)})`), sql` OR `)})`);
  }
  const q = f.q?.trim();
  if (q && q.length >= 2) {
    if (q.includes("@") && !q.startsWith("@")) {
      const email = q.toLowerCase();
      conds.push(sql`EXISTS (SELECT 1 FROM store_members m JOIN users u ON u.id = m.user_id WHERE m.store_id = ${stores.id} AND m.role = 'owner' AND u.email = ${email})`);
    } else {
      const handle = q.replace(/^@/, "").toLowerCase();
      conds.push(or(sql`${stores.name} LIKE ${likePrefix(q)}`, sql`${stores.handle} LIKE ${likePrefix(handle)}`)!);
    }
  }
  return conds;
}

/** The keyset condition after `[value, id]` for `sort`, or null when the cursor does not fit the sort. */
function afterCond(sort: StoreSort, key: unknown[] | null): SQL | null {
  if (!key || key.length !== 2 || typeof key[1] !== "string" || !/^[0-9A-Z]{26}$/.test(key[1])) return null;
  const id = key[1];
  const v = key[0];
  switch (sort) {
    case "health":
      return typeof v === "number" ? sql`(${scoreKey} > ${v} OR (${scoreKey} = ${v} AND ${stores.id} > ${id}))` : null;
    case "name":
      return typeof v === "string" ? sql`(${stores.name} > ${v} OR (${stores.name} = ${v} AND ${stores.id} > ${id}))` : null;
    case "activity":
      return typeof v === "string" ? sql`(${activityKey} < ${v} OR (${activityKey} = ${v} AND ${stores.id} < ${id}))` : null;
    case "created":
    default: {
      if (typeof v !== "string" || !Number.isFinite(Date.parse(v))) return null;
      const at = new Date(v);
      return sql`(${stores.createdAt} < ${at} OR (${stores.createdAt} = ${at} AND ${stores.id} < ${id}))`;
    }
  }
}

function orderOf(sort: StoreSort): SQL[] {
  switch (sort) {
    case "health":
      return [asc(scoreKey), asc(stores.id)];
    case "name":
      return [asc(stores.name), asc(stores.id)];
    case "activity":
      return [desc(activityKey), desc(stores.id)];
    case "created":
    default:
      return [desc(stores.createdAt), desc(stores.id)];
  }
}

const listColumns = {
  id: stores.id,
  handle: stores.handle,
  name: stores.name,
  status: stores.status,
  mode: stores.mode,
  planId: stores.planId,
  planName: plans.name,
  market: stores.market,
  currency: stores.currency,
  createdAt: stores.createdAt,
  score: storeHealth.score,
  attention: storeHealth.attention,
  components: storeHealth.components,
  flags: storeHealth.flags,
  metrics: storeHealth.metrics,
  computedAt: storeHealth.computedAt,
  scoreKey: sql<number>`${scoreKey}`,
  activityKey: sql<string>`${activityKey}`,
};

function selectStores(where: SQL | undefined, sort: StoreSort, limit: number) {
  // tenancy: platform the console stores list across stores (PLA-§6.1, §M.4 stores_status_idx / stores_plan_idx, PK join store_health; the latest band through sr_store_kind_idx, the owner e-mail search through sm_store_role_idx): store rows and health numbers, never customer data
  return db
    .select(listColumns)
    .from(stores)
    .leftJoin(storeHealth, eq(storeHealth.storeId, stores.id))
    .leftJoin(plans, eq(plans.id, stores.planId))
    .where(where)
    .orderBy(...orderOf(sort))
    .limit(limit);
}

type RawRow = Awaited<ReturnType<typeof selectStores>>[number];

function sortValue(sort: StoreSort, r: RawRow): string | number {
  switch (sort) {
    case "health":
      return Number(r.scoreKey);
    case "name":
      return r.name;
    case "activity":
      return r.activityKey ?? "";
    case "created":
    default:
      return r.createdAt.toISOString();
  }
}

const SEVERITY_ORDER = (a: HealthFlag, b: HealthFlag) => b.severity - a.severity || (a.code < b.code ? -1 : 1);

/** The owners (active) of up to 50 stores, first joined first (one statement, sm_store_role_idx). */
async function ownersOf(storeIds: readonly string[]): Promise<Map<string, { userId: string; name: string; email: string }[]>> {
  if (!storeIds.length) return new Map();
  // tenancy: platform the owners of one page of the stores list (PLA-§6.1, §M.4 sm_store_role_idx IN (…50 ids)): name and e-mail, masked per role before they leave
  const rows = await db
    .select({ storeId: storeMembers.storeId, userId: storeMembers.userId, joinedAt: storeMembers.joinedAt, name: users.name, email: users.email })
    .from(storeMembers)
    .innerJoin(users, eq(users.id, storeMembers.userId))
    .where(and(inArray(storeMembers.storeId, [...storeIds]), eq(storeMembers.role, "owner"), eq(storeMembers.status, "active")))
    .orderBy(asc(storeMembers.joinedAt), asc(storeMembers.userId));
  const out = new Map<string, { userId: string; name: string; email: string }[]>();
  for (const r of rows) {
    const list = out.get(r.storeId) ?? [];
    list.push({ userId: r.userId, name: r.name, email: r.email });
    out.set(r.storeId, list);
  }
  return out;
}

function toRow(ctx: PlatformCtx, r: RawRow, owners: { userId: string; name: string; email: string }[]): StoreListRow {
  const flags = [...(Array.isArray(r.flags) ? r.flags : [])].sort(SEVERITY_ORDER);
  const metrics = (r.metrics ?? null) as Partial<HealthMetrics> | null;
  const first = owners[0];
  return {
    id: r.id,
    handle: r.handle,
    name: r.name,
    status: r.status,
    mode: r.mode,
    plan: { id: r.planId, name: r.planName ?? null },
    market: r.market,
    currency: r.currency,
    internal: r.planId === "internal" || r.id === LEGACY_STORE_ID,
    owner: first ? { userId: first.userId, firstName: firstName(first.name), email: sellerContact(ctx.role, { email: first.email, phone: null }).email } : null,
    moreOwners: Math.max(0, owners.length - 1),
    health: r.score !== null && r.computedAt ? { score: r.score, attention: r.attention ?? 0, components: (r.components ?? {}) as Partial<Record<HealthGroup, number>>, computedAt: r.computedAt.toISOString() } : null,
    flags: flags.slice(0, 3),
    moreFlags: Math.max(0, flags.length - 3),
    orders7d: r.status === "pending" || !metrics || typeof metrics.orders7d !== "number" ? null : metrics.orders7d,
    lastActiveAt: typeof metrics?.lastActiveAt === "string" ? metrics.lastActiveAt : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** PLA-§6.1 (`console.read`): one page of 50 (25 on a phone: `pageSize`), keyset by the sort's value and the id. */
export async function listStores(ctx: PlatformCtx, filter: StoresFilter = {}, cursor: string | null = null, opts: { pageSize?: number } = {}): Promise<StoresPage> {
  requireRead(ctx);
  const sort: StoreSort = filter.sort ?? "created";
  const size = Math.max(1, Math.min(STORES_PAGE_SIZE, opts.pageSize ?? STORES_PAGE_SIZE));
  const after = afterCond(sort, decodeCursor(cursor));
  const conds = filterConds(filter);
  if (after) conds.push(after);
  const raw = await selectStores(conds.length ? and(...conds) : undefined, sort, size + 1);
  const page = raw.slice(0, size);
  const owners = await ownersOf(page.map((r) => r.id));
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => toRow(ctx, r, owners.get(r.id) ?? [])),
    next: raw.length > size && last ? encodeCursor([sortValue(sort, last), last.id]) : null,
    sort,
    filter,
  };
}

/** Does any store exist at all? (the two empty states of PLA-§6.1 differ) */
export async function anyStore(): Promise<boolean> {
  const [row] = await db.select({ id: stores.id }).from(stores).limit(1);
  return row !== undefined;
}

/* ------------------------------------------------------------------ */
/* CSV (PLA-§6.1: admin+, ≤ 10,000 rows, no e-mail, no phone)          */
/* ------------------------------------------------------------------ */

export const STORES_CSV_COLUMNS = ["id", "handle", "name", "status", "mode", "plan", "market", "created", "score", "flags"] as const;

/** `console.read` + admin rank (PLA-§M.2): the filtered list as CSV text, audited `platform.stores.exported`. */
export async function storesCsv(ctx: PlatformCtx, filter: StoresFilter = {}): Promise<{ csv: string; rows: number; truncated: boolean }> {
  requireRead(ctx);
  if (ctx.role !== "admin" && ctx.role !== "super_admin") throw new AuthRefusal("forbidden");
  const sort: StoreSort = filter.sort ?? "created";
  const conds = filterConds(filter);
  const raw = await selectStores(conds.length ? and(...conds) : undefined, sort, STORES_CSV_MAX + 1);
  const rows = raw.slice(0, STORES_CSV_MAX);
  const lines = [STORES_CSV_COLUMNS.join(",")];
  for (const r of rows) {
    const flags = (Array.isArray(r.flags) ? r.flags : []).map((f) => f.code).join(" ");
    lines.push([r.id, r.handle, r.name, r.status, r.mode, r.planId, r.market, r.createdAt.toISOString(), r.score ?? null, flags].map((v) => csvCell(v)).join(","));
  }
  const filterMeta = Object.fromEntries(Object.entries(filter).filter(([k]) => k !== "q"));
  await auditFrom(ctx, "platform.stores.exported", { meta: { rows: rows.length, truncated: raw.length > STORES_CSV_MAX, filter: filterMeta, ...(filter.q ? { search: true } : {}) } });
  return { csv: `${lines.join("\r\n")}\r\n`, rows: rows.length, truncated: raw.length > STORES_CSV_MAX };
}
