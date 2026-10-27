import "server-only";
/**
 * In-app notifications (docs/STORE-SAAS.md §I.4; platform.md PLA-§18.1, PLA Q.15): the frozen `notify()` signature.
 * R1.0: T2's minimal `notifications` insert behind it; R1 P0: working reads (below; P0 review G2); R1 product: P1's
 * full API (the kind registry's link builders and vars schemas, its refinements of the reads).
 *
 *   await notify({ audience: "store_role", storeId, roles: ["owner", "admin"] }, "store.restricted", { reason }, { link: appHref(h) });
 *
 * What the R1.0 insert does:
 *   - one `notifications` row per call, the audience columns from the target (`roles` for store_role,
 *     `platform_min_role` for platform_staff, `user_id` + optional `store_id` for user);
 *   - the link validated against NOTIFY_LINK_RES (SEC-6): a refused link is stored NULL, never rewritten;
 *   - `vars` keep only strings (≤ 120 chars), finite numbers, booleans and null; keys named like customer data are
 *     dropped (phone, name, address, email, note: `test:platform` refuses them in a kind's schema);
 *   - `dedupeKey`: INSERT IGNORE on `nt_dedupe_uq`, a second call answers `{ deduped: true }`; with `batch` the key is
 *     `<dedupeKey|kind:store>:<window start>` and a repeat increments `vars.count` instead (one row per window);
 *   - `text` (staff free text) ≤ 600, `expiresInDays` 1-365.
 * Never throws: a failure is logged without its values (error_events arrives with 0005) and answers `{ deduped: true }`.
 */
import { and, desc, eq, gt, inArray, isNull, lt, notExists, notInArray, or, sql, type SQL } from "drizzle-orm";
import { PLATFORM_ROLES, type PlatformRole, type StoreRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { notificationReads, notifications, users } from "@/lib/db/schema";
import { isAdminLocale, messageOf, t, type AdminLocale } from "@/lib/i18n/admin";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { NOTIFICATION_KINDS, notificationKind, safeNotifyLink, type NotificationGroup, type NotificationKind, type NotificationSeverity, type NotificationVars } from "@/lib/notify/registry";
import { errorSummary } from "@/lib/orders/log";
import { scopedCache } from "@/lib/tenancy/cache";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

export type NotifyTarget =
  | { audience: "user"; userId: string; storeId?: string | null } // one person (in one store, or platform-wide)
  | { audience: "store"; storeId: string } // every active member of the store
  | { audience: "store_role"; storeId: string; roles: readonly StoreRole[] }
  | { audience: "platform_staff"; minRole?: PlatformRole }; // staff feed (rank super_admin > admin > support > analyst)

export interface NotifyOpts {
  link?: string;
  severity?: NotificationSeverity;
  dedupeKey?: string;
  text?: string; // staff free text only, ≤ 600
  expiresInDays?: number;
  batch?: { windowMin: number };
}

const KIND_RE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;
const ID_RE = /^[0-9A-Z]{26}$/;
const SEVERITIES: ReadonlySet<string> = new Set(["info", "success", "warn", "danger"]);
/** customer data never rides in vars (core §I.4); member display names go in as `member`, a short label */
const BANNED_VAR = /^(?:phone|name|address|email|note)$/i;
const VAR_MAX = 120;

type Vars = Record<string, string | number>;

/** The storable vars (the column holds strings and numbers): strings bounded, booleans as 1 / 0, nulls dropped, at most 20 keys. Pure. */
export function cleanNotifyVars(vars: unknown): Vars {
  const out: Vars = {};
  if (!vars || typeof vars !== "object") return out;
  for (const [key, value] of Object.entries(vars as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key) || BANNED_VAR.test(key)) continue;
    if (typeof value === "string") out[key] = value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, VAR_MAX);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value ? 1 : 0;
  }
  return out;
}

/** The audience columns of a target, or null for a malformed one (a programming error: logged, nothing stored). */
function audienceOf(target: NotifyTarget): { audience: NotifyTarget["audience"]; storeId: string | null; userId: string | null; roles: StoreRole[] | null; platformMinRole: PlatformRole | null } | null {
  switch (target.audience) {
    case "user":
      if (!ID_RE.test(target.userId) || (target.storeId != null && !ID_RE.test(target.storeId))) return null;
      return { audience: "user", storeId: target.storeId ?? null, userId: target.userId, roles: null, platformMinRole: null };
    case "store":
      return ID_RE.test(target.storeId) ? { audience: "store", storeId: target.storeId, userId: null, roles: null, platformMinRole: null } : null;
    case "store_role":
      if (!ID_RE.test(target.storeId) || target.roles.length === 0) return null;
      return { audience: "store_role", storeId: target.storeId, userId: null, roles: [...new Set(target.roles)], platformMinRole: null };
    case "platform_staff":
      return { audience: "platform_staff", storeId: null, userId: null, roles: null, platformMinRole: target.minRole ?? null };
    default:
      return null;
  }
}

type NotifyRow = Omit<typeof notifications.$inferInsert, "storeId">;
type Inserted = { id: number } | { deduped: true };

/** MySQL answers 1 for an insert, 2 for an update of the existing row (a batch repeat), 0 for an ignored duplicate. */
const inserted = (res: { affectedRows: number; insertId: number | string }): Inserted => (res.affectedRows === 1 ? { id: Number(res.insertId) } : { deduped: true });

/** A store's row (`store`, `store_role`, a `user` target in one store): the store id from the scope only. */
async function insertStoreRow(scope: WriteScope, row: NotifyRow, batched: boolean): Promise<Inserted> {
  const [res] = batched
    ? await db
        .insert(notifications)
        .values(storeValues(scope, row))
        .onDuplicateKeyUpdate({ set: { vars: sql`JSON_SET(COALESCE(${notifications.vars}, '{}'), '$.count', COALESCE(JSON_EXTRACT(${notifications.vars}, '$.count'), 1) + 1)` } })
    : await db.insert(notifications).ignore().values(storeValues(scope, row));
  return inserted(res);
}

/** A platform row (`platform_staff`, a platform-wide `user` target): `store_id` NULL (§I.4). */
async function insertPlatformRow(row: NotifyRow, batched: boolean): Promise<Inserted> {
  // tenancy: platform a staff or platform-wide user notification, store_id NULL (§I.4, CCR r1.0-t2-9 item 8)
  const [res] = batched
    ? await db
        .insert(notifications)
        .values({ ...row, storeId: null })
        .onDuplicateKeyUpdate({ set: { vars: sql`JSON_SET(COALESCE(${notifications.vars}, '{}'), '$.count', COALESCE(JSON_EXTRACT(${notifications.vars}, '$.count'), 1) + 1)` } })
    : await db.insert(notifications).ignore().values({ ...row, storeId: null });
  return inserted(res);
}

export async function notify<K extends NotificationKind>(target: NotifyTarget, kind: K, vars: NotificationVars<K>, opts: NotifyOpts = {}): Promise<{ id: number } | { deduped: true }> {
  try {
    const aud = audienceOf(target);
    if (!aud || !KIND_RE.test(kind) || kind.length > 40) {
      console.error(`[notify] refused a malformed notification "${String(kind).slice(0, 40)}"`);
      return { deduped: true };
    }
    const def = notificationKind(kind);
    const severity: NotificationSeverity = opts.severity && SEVERITIES.has(opts.severity) ? opts.severity : (def?.defaultSeverity ?? "info");
    const clean = cleanNotifyVars(vars);
    const now = Date.now();

    let dedupeKey = opts.dedupeKey ? opts.dedupeKey.slice(0, 120) : null;
    const batch = opts.batch ?? def?.batch;
    if (batch && batch.windowMin >= 1) {
      const windowMs = Math.round(batch.windowMin) * 60_000;
      const start = Math.floor(now / windowMs) * windowMs;
      dedupeKey = `${dedupeKey ?? `${kind}:${aud.storeId ?? aud.userId ?? "p"}`}:${start}`.slice(0, 120);
      if (typeof clean.count !== "number") clean.count = 1;
    }
    const days = opts.expiresInDays;
    const expiresAt = typeof days === "number" && Number.isFinite(days) ? new Date(now + Math.max(1, Math.min(365, Math.round(days))) * 86_400_000) : null;

    const row = {
      userId: aud.userId,
      audience: aud.audience,
      roles: aud.roles,
      kind,
      severity,
      vars: clean,
      text: opts.text ? opts.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, 600) : null,
      link: safeNotifyLink(opts.link),
      dedupeKey,
      expiresAt,
      platformMinRole: aud.platformMinRole,
    };
    // a store's rows carry its id through a scope (§E.3 rule 4); notify is platform plumbing, so the system seam
    const batched = !!(batch && dedupeKey);
    return aud.storeId ? await insertStoreRow(systemScope(systemCtx("notify"), aud.storeId), row, batched) : await insertPlatformRow(row, batched);
  } catch (err) {
    console.error(`[notify] "${String(kind).slice(0, 40)}" not stored:`, errorSummary(err));
    return { deduped: true };
  }
}

/* ------------------------------------------------------------------ */
/* Read API (PLA-§18.1, PLA Q.15 (a)): frozen at P0, P1 refines        */
/* ------------------------------------------------------------------ */
/*
 * Working reads over the R1.0 rows (P0 review G2: P2 merges before P1 and its pulse fills `StorePulse.unread` on every
 * poll; the rows exist since R1.0, so the honest answer is the real one). P1 owns the bodies from its merge (the kind
 * registry's groups and texts, `console-unread`). Who reads what (PLA-§18.1 "Reads"):
 *   - a member of a store (`storeId` set): that store's `store` rows, its `store_role` rows whose `roles` hold the
 *     reader's role (none when `role` is null: a "view as" session reads only what is addressed to the staff member),
 *     its `user` rows addressed to the reader, and the reader's platform-wide `user` rows (`store_id` NULL);
 *   - staff in the console (`storeId` null, `platformRole` not none): `platform_staff` rows whose `minRole` rank is at
 *     most theirs (NULL = every staff role) and their platform-wide `user` rows;
 *   - anyone else (`storeId` null): their platform-wide `user` rows.
 * Expired rows (`expires_at` past) are hidden. Titles and bodies are the messages `notify.<kind>.title` / `.body` in
 * `users.locale` (NULL: English; a missing key renders as the key, like `t()`); staff free text is the body as is. A
 * kind no track has registered yet reads as group "store". The unread count is cached 5 s per (store, reader) and
 * stops at UNREAD_CAP (the bell shows "9+" above nine).
 */

/** Who reads: a member of one store (role) or staff (platformRole); the reads filter on these. */
export interface Reader {
  userId: string;
  storeId: string | null;
  role: StoreRole | null;
  platformRole: PlatformRole | "none";
}

/** One row as the centre shows it: title and body rendered in the reader's locale. */
export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  group: NotificationGroup;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
}

const LIST_DEFAULT = 20;
const LIST_MAX = 50;
/** "Mark all read" marks at most this many unread rows per call (PLA-§18.1) */
const MARK_ALL_MAX = 200;
/** the count stops here (the bell shows "9+" above nine, the console badge "99+") */
export const UNREAD_CAP = 100;
/** the group of a kind no track file registers yet (R1.0's kinds until P1 registers them) */
const UNREGISTERED_GROUP: NotificationGroup = "store";

const unreadCache = scopedCache<number>({ name: "notify-unread", maxEntries: 4_000, ttlMs: 5_000 });
const cacheStore = (reader: Reader) => reader.storeId ?? "p";
const cacheKey = (reader: Reader) => `${reader.userId}:${reader.role ?? "-"}:${reader.platformRole}`;

function checkReader(reader: Reader): void {
  if (!ID_RE.test(reader.userId) || (reader.storeId !== null && !ID_RE.test(reader.storeId))) throw new Error("notify: malformed reader");
}

const groupOf = (kind: string): NotificationGroup => notificationKind(kind)?.group ?? UNREGISTERED_GROUP;

/** The SQL filter of one group (its registered kinds; the unregistered ones count as "store"), or null when no row can match. */
function groupCond(group: NotificationGroup): SQL | null {
  const of = NOTIFICATION_KINDS.filter((k) => k.group === group).map((k) => k.kind);
  const all = NOTIFICATION_KINDS.map((k) => k.kind);
  const conds: SQL[] = [];
  if (of.length) conds.push(inArray(notifications.kind, of));
  if (group === UNREGISTERED_GROUP) conds.push(all.length ? notInArray(notifications.kind, all) : sql`TRUE`);
  if (!conds.length) return null;
  return conds.length === 1 ? conds[0]! : or(...conds)!;
}

/** The staff roles whose rows a reader of `role` may read (rank super_admin > admin > support > analyst). */
function staffRolesUpTo(role: PlatformRole): PlatformRole[] {
  return PLATFORM_ROLES.slice(PLATFORM_ROLES.indexOf(role));
}

interface ReadFilter {
  beforeId?: number;
  limit: number;
  group?: NotificationGroup;
  unreadOnly?: boolean;
  ids?: readonly number[];
}

/** The conditions every source shares: not expired, the page, the group, unread, the given ids. Null = nothing can match. */
function commonConds(reader: Reader, f: ReadFilter): SQL[] | null {
  const conds: SQL[] = [or(isNull(notifications.expiresAt), gt(notifications.expiresAt, new Date()))!];
  if (f.beforeId !== undefined) conds.push(lt(notifications.id, f.beforeId));
  if (f.group !== undefined) {
    const g = groupCond(f.group);
    if (!g) return null;
    conds.push(g);
  }
  if (f.ids) {
    if (!f.ids.length) return null;
    conds.push(inArray(notifications.id, [...f.ids]));
  }
  if (f.unreadOnly) conds.push(notExists(db.select({ one: sql`1` }).from(notificationReads).where(and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, reader.userId)))));
  return conds;
}

const rowFields = {
  id: notifications.id,
  kind: notifications.kind,
  severity: notifications.severity,
  vars: notifications.vars,
  text: notifications.text,
  link: notifications.link,
  createdAt: notifications.createdAt,
};
type ReadRow = { id: number; kind: string; severity: string; vars: Record<string, string | number> | null; text: string | null; link: string | null; createdAt: Date };

/** A member's rows of the store: audience store, their role's store_role rows, their own user rows in this store. */
async function storeRows(scope: StoreScope, reader: Reader, conds: SQL[], limit: number): Promise<ReadRow[]> {
  const audience: SQL[] = [and(eq(notifications.audience, "user"), eq(notifications.userId, reader.userId))!];
  if (reader.role) {
    audience.push(eq(notifications.audience, "store"));
    audience.push(and(eq(notifications.audience, "store_role"), sql`JSON_CONTAINS(${notifications.roles}, ${JSON.stringify(reader.role)})`)!);
  }
  return db
    .select(rowFields)
    .from(notifications)
    .where(whereStore(notifications, scope, or(...audience), ...conds))
    .orderBy(desc(notifications.id))
    .limit(limit);
}

/** The reader's store-less rows: their platform-wide user rows, and the staff feed when they read from the console. */
async function platformRows(reader: Reader, conds: SQL[], limit: number): Promise<ReadRow[]> {
  const audience: SQL[] = [and(eq(notifications.audience, "user"), eq(notifications.userId, reader.userId))!];
  if (reader.storeId === null && reader.platformRole !== "none") {
    audience.push(and(eq(notifications.audience, "platform_staff"), or(isNull(notifications.platformMinRole), inArray(notifications.platformMinRole, staffRolesUpTo(reader.platformRole))))!);
  }
  // tenancy: platform the reader's own store-less rows (user-level and the staff feed), store_id NULL (§I.4, PLA-§18.1)
  return db.select(rowFields).from(notifications).where(and(isNull(notifications.storeId), or(...audience), ...conds)).orderBy(desc(notifications.id)).limit(limit);
}

/** Every row the reader may read under `f`, newest first, at most `f.limit`. */
async function visibleRows(reader: Reader, f: ReadFilter): Promise<ReadRow[]> {
  checkReader(reader);
  const conds = commonConds(reader, f);
  if (!conds) return [];
  // the store is the reader's (the caller resolved the membership); reads go through the system seam like notify()'s writes
  const [inStore, outside] = await Promise.all([
    reader.storeId ? storeRows(systemScope(systemCtx("notify"), reader.storeId), reader, conds, f.limit) : Promise.resolve([]),
    platformRows(reader, conds, f.limit),
  ]);
  return [...inStore, ...outside].sort((a, b) => b.id - a.id).slice(0, f.limit);
}

async function readerLocale(userId: string): Promise<AdminLocale> {
  const [row] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  const locale = row?.locale;
  return isAdminLocale(locale) ? locale : "en";
}

/** Newest first; `limit` 1-50 (default 20), keyset paging with `beforeId`. */
export async function listNotifications(reader: Reader, opts: { beforeId?: number; limit?: number; group?: NotificationGroup; unreadOnly?: boolean }): Promise<NotificationItem[]> {
  const limit = Math.max(1, Math.min(LIST_MAX, Math.floor(opts.limit ?? LIST_DEFAULT) || LIST_DEFAULT));
  const rows = await visibleRows(reader, { beforeId: opts.beforeId, limit, group: opts.group, unreadOnly: opts.unreadOnly });
  if (!rows.length) return [];
  const [locale, reads] = await Promise.all([
    readerLocale(reader.userId),
    db
      .select({ id: notificationReads.notificationId })
      .from(notificationReads)
      .where(and(eq(notificationReads.userId, reader.userId), inArray(notificationReads.notificationId, rows.map((r) => r.id)))),
  ]);
  const read = new Set(reads.map((r) => r.id));
  return rows.map((r) => {
    const vars = r.vars ?? {};
    const bodyKey = `notify.${r.kind}.body`;
    return {
      id: r.id,
      kind: r.kind,
      group: groupOf(r.kind),
      severity: r.severity,
      title: t(`notify.${r.kind}.title`, vars, locale),
      body: r.text ?? (messageOf(bodyKey, locale) !== undefined ? t(bodyKey, vars, locale) : null),
      link: r.link,
      createdAt: r.createdAt.toISOString(),
      read: read.has(r.id),
    };
  });
}

/** Cached 5 s per (user, store); at most UNREAD_CAP. */
export async function unreadCount(reader: Reader): Promise<number> {
  checkReader(reader);
  return unreadCache.getOrLoad(cacheStore(reader), cacheKey(reader), async () => (await visibleRows(reader, { limit: UNREAD_CAP, unreadOnly: true })).length);
}

/** "Mark all read" inserts one read row per unread id shown (at most 200); ids the reader may not read are ignored. */
export async function markRead(reader: Reader, ids: readonly number[] | "all"): Promise<void> {
  const wanted = ids === "all" ? undefined : [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, MARK_ALL_MAX);
  const rows = await visibleRows(reader, { limit: MARK_ALL_MAX, unreadOnly: true, ids: wanted });
  if (rows.length) await db.insert(notificationReads).ignore().values(rows.map((r) => ({ notificationId: r.id, userId: reader.userId })));
  unreadCache.delete(cacheStore(reader), cacheKey(reader));
}
