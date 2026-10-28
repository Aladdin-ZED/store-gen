import "server-only";
/**
 * In-app notifications (docs/STORE-SAAS.md §I.4; platform.md PLA-§18.1, PLA Q.15): the frozen `notify()` signature
 * and the read API P2's bell and centre build against (src/lib/contracts/r1-p0.ts). P1 owns the bodies: R1.0's
 * minimal insert (T2) and P0's working reads (review G2) become the API below, backwards compatible with every caller.
 *
 *   await notify({ audience: "store_role", storeId, roles: ["owner", "admin"] }, "store.restricted", { reason }, { link: appHref(h) });
 *
 * Writing (`notify`, never throws: a failure is logged and answers `{ deduped: true }`):
 *   - one `notifications` row per call, the audience columns from the target (`roles` for store_role,
 *     `platform_min_role` for platform_staff, `user_id` + optional `store_id` for user);
 *   - `vars` are parsed with the kind's schema (src/lib/notify/kinds/<track>.ts): unknown keys dropped; a mismatch is
 *     logged and the cleaned vars are stored as given (R1.0 callers keep working); then strings ≤ 120 chars, finite
 *     numbers, booleans as 1 / 0, keys named like customer data dropped (phone, name, address, email, note);
 *   - the link: `opts.link`, else the kind's `link(vars, { handle })`; either is checked by `notifyLinkOk` (the
 *     three in-app shapes of SEC-6, no dot segment, no `//`, no backslash) and a refused link is stored NULL;
 *   - `dedupeKey`: a repeat answers `{ deduped: true }` (INSERT IGNORE on `nt_dedupe_uq`); with `batch` (the option or
 *     the kind's) the key is `<dedupeKey|kind:store>:<window start>` and a repeat increments `vars.count` (one row per
 *     window, "12 new orders since 14:02"); `notifyLatest` makes a repeat replace the stored vars instead (the
 *     newest count wins, `staff.abuse_report`'s "3 reports in the last 24 hours");
 *   - `text` (staff free text) ≤ 600, `expiresInDays` 1-365.
 *
 * Reading (PLA-§18.1 "Reads", §M.4):
 *   - a member of a store (`storeId` set): the store's `store` and `store_role` rows (`nt_store_idx`, over-fetched
 *     2 × limit, `store_role` rows kept only when their `roles` hold the reader's role, filtered in code), the store's
 *     `user` rows addressed to the reader, and the reader's platform-wide `user` rows. `role: null` (staff viewing a
 *     store) reads only what is addressed to the reader;
 *   - staff in the console (`storeId` null, a platform role): `platform_staff` rows whose `minRole` rank is at most
 *     theirs (NULL = every staff role; `nt_aud_idx`) and their platform-wide `user` rows;
 *   - anyone else (`storeId` null): their platform-wide `user` rows.
 *   Expired rows are hidden. One page costs two queries run together: the rows with their read state (one UNION ALL
 *   statement, the read rows LEFT JOINed) and the reader's locale and store time zone. Titles and bodies are the
 *   messages `notify.<kind>.title` / `.body` in the reader's locale (`users.locale`, English when unset), each var
 *   shown through its kind's label (`notify.reason.fake_orders` → "Fake orders") and ISO dates in the store's time
 *   zone; staff free text is the body as is. A kind no track registers reads as group "store".
 *   `unreadCount` is cached 5 s (`notify-unread` per store and reader, `console-unread` for staff in the console) and
 *   stops at UNREAD_CAP; `markRead` marks at most 200 ids the reader may read and clears that count.
 */
import { and, desc, eq, gt, inArray, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import { PLATFORM_ROLES, type PlatformRole, type StoreRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { notificationReads, notifications, stores, users } from "@/lib/db/schema";
import { isAdminLocale, messageOf, t, type AdminLocale, type MessageVars } from "@/lib/i18n/admin";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { NOTIFICATION_KINDS, notificationKind, type NotificationGroup, type NotificationKind, type NotificationSeverity, type NotificationVars } from "@/lib/notify/registry";
import { scopedCache } from "@/lib/tenancy/cache";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { recordPlatformError } from "./log";
import { displayVar, isBannedVarKey, labelsOf, notifyLinkOk } from "./notify-kinds";

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
const VAR_MAX = 120;
/** the time zone of rows read outside a store (platform-wide rows, the console): the platform's market */
const PLATFORM_TZ = "Africa/Casablanca";

type Vars = Record<string, string | number>;

/** The storable vars (the column holds strings and numbers): strings bounded, booleans as 1 / 0, nulls dropped, at most 20 keys. Pure. */
export function cleanNotifyVars(vars: unknown): Vars {
  const out: Vars = {};
  if (!vars || typeof vars !== "object") return out;
  for (const [key, value] of Object.entries(vars as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key) || isBannedVarKey(key)) continue;
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
      if (target.minRole !== undefined && !(PLATFORM_ROLES as readonly string[]).includes(target.minRole)) return null;
      return { audience: "platform_staff", storeId: null, userId: null, roles: null, platformMinRole: target.minRole ?? null };
    default:
      return null;
  }
}

type NotifyRow = Omit<typeof notifications.$inferInsert, "storeId">;
type Inserted = { id: number } | { deduped: true };
/** What a repeat of the dedupe key does to the stored row: nothing (INSERT IGNORE), `count + 1` (batch), or new vars. */
type OnRepeat = "ignore" | "count" | "replace";

/** The UPDATE of a repeat (only `vars` ever changes), or null for INSERT IGNORE. */
type RepeatSet = { vars: SQL | Vars };
function repeatSet(mode: OnRepeat, row: NotifyRow): RepeatSet | null {
  if (mode === "count") return { vars: sql`JSON_SET(COALESCE(${notifications.vars}, '{}'), '$.count', COALESCE(JSON_EXTRACT(${notifications.vars}, '$.count'), 1) + 1)` };
  if (mode === "replace") return { vars: row.vars ?? {} };
  return null;
}

/** MySQL answers 1 for an insert, 2 for an update of the existing row (a repeat), 0 for an ignored duplicate. */
const inserted = (res: { affectedRows: number; insertId: number | string }): Inserted => (res.affectedRows === 1 ? { id: Number(res.insertId) } : { deduped: true });

/** A store's row (`store`, `store_role`, a `user` target in one store): the store id from the scope only. */
async function insertStoreRow(scope: WriteScope, row: NotifyRow, onRepeat: RepeatSet | null): Promise<Inserted> {
  const [res] = onRepeat
    ? await db.insert(notifications).values(storeValues(scope, row)).onDuplicateKeyUpdate({ set: onRepeat })
    : await db.insert(notifications).ignore().values(storeValues(scope, row));
  return inserted(res);
}

/** A platform row (`platform_staff`, a platform-wide `user` target): `store_id` NULL (§I.4). */
async function insertPlatformRow(row: NotifyRow, onRepeat: RepeatSet | null): Promise<Inserted> {
  // tenancy: platform a staff or platform-wide user notification, store_id NULL (§I.4, CCR r1.0-t2-9 item 8)
  const [res] = onRepeat
    ? await db
        .insert(notifications)
        .values({ ...row, storeId: null })
        .onDuplicateKeyUpdate({ set: onRepeat })
    : await db.insert(notifications).ignore().values({ ...row, storeId: null });
  return inserted(res);
}

/** The kind's vars: parsed with its schema (unknown keys dropped), or the given vars cleaned when they do not match. */
function varsFor(kind: string, vars: unknown): { clean: Vars; parsed: Record<string, unknown> | null } {
  const def = notificationKind(kind);
  if (!def) return { clean: cleanNotifyVars(vars), parsed: null };
  const res = def.vars.safeParse(vars ?? {});
  if (res.success) return { clean: cleanNotifyVars(res.data), parsed: res.data };
  // a caller out of step with the kind's schema: the row still goes out (R1.0 behaviour), the mismatch is recorded by path only
  const paths = res.error.issues.map((i) => i.path.join(".") || "(root)").slice(0, 5);
  recordPlatformError(`notify "${kind}" vars do not match the kind (${paths.join(", ")})`, new Error("vars mismatch"));
  return { clean: cleanNotifyVars(vars), parsed: null };
}

/** The handle of a store, for a kind's link builder (null when the store is unknown or the lookup fails). */
async function handleOf(storeId: string | null): Promise<string | null> {
  if (!storeId) return null;
  try {
    const { getStoreById } = await import("@/lib/tenancy/public");
    return (await getStoreById(storeId))?.handle ?? null;
  } catch {
    return null;
  }
}

async function send(target: NotifyTarget, kind: string, vars: unknown, opts: NotifyOpts, mode: "notify" | "latest"): Promise<Inserted> {
  try {
    const aud = audienceOf(target);
    if (!aud || !KIND_RE.test(kind) || kind.length > 40) {
      console.error(`[notify] refused a malformed notification "${String(kind).slice(0, 40)}"`);
      return { deduped: true };
    }
    const def = notificationKind(kind);
    const severity: NotificationSeverity = opts.severity && SEVERITIES.has(opts.severity) ? opts.severity : (def?.defaultSeverity ?? "info");
    const { clean, parsed } = varsFor(kind, vars);
    const now = Date.now();

    let link: string | null = null;
    if (opts.link !== undefined) link = notifyLinkOk(opts.link);
    else if (def?.link && parsed) {
      try {
        link = notifyLinkOk(def.link(parsed, { handle: await handleOf(aud.storeId) }));
      } catch (err) {
        recordPlatformError(`notify "${kind}" link builder`, err);
      }
    }

    let dedupeKey = opts.dedupeKey ? opts.dedupeKey.slice(0, 120) : null;
    const batch = opts.batch ?? def?.batch;
    let onRepeat: OnRepeat = mode === "latest" && dedupeKey ? "replace" : "ignore";
    if (batch && batch.windowMin >= 1) {
      const windowMs = Math.round(batch.windowMin) * 60_000;
      const start = Math.floor(now / windowMs) * windowMs;
      dedupeKey = `${dedupeKey ?? `${kind}:${aud.storeId ?? aud.userId ?? "p"}`}:${start}`.slice(0, 120);
      if (typeof clean.count !== "number") clean.count = 1;
      onRepeat = "count";
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
      link,
      dedupeKey,
      expiresAt,
      platformMinRole: aud.platformMinRole,
    };
    const set = dedupeKey ? repeatSet(onRepeat, row) : null;
    // a store's rows carry its id through a scope (§E.3 rule 4); notify is platform plumbing, so the system seam
    return aud.storeId ? await insertStoreRow(systemScope(systemCtx("notify"), aud.storeId), row, set) : await insertPlatformRow(row, set);
  } catch (err) {
    recordPlatformError(`notify "${String(kind).slice(0, 40)}" not stored`, err);
    return { deduped: true };
  }
}

export async function notify<K extends NotificationKind>(target: NotifyTarget, kind: K, vars: NotificationVars<K>, opts: NotifyOpts = {}): Promise<{ id: number } | { deduped: true }> {
  return send(target, kind, vars, opts, "notify");
}

/**
 * `notify()` whose repeat of `opts.dedupeKey` replaces the stored vars instead of being ignored: one row per key that
 * always shows the newest numbers (`staff.abuse_report` deduped per store and day with `count24h`). The row keeps its
 * id, its read state and its creation time. Never throws.
 */
export async function notifyLatest<K extends NotificationKind>(target: NotifyTarget, kind: K, vars: NotificationVars<K>, opts: NotifyOpts & { dedupeKey: string }): Promise<{ id: number } | { deduped: true }> {
  return send(target, kind, vars, opts, "latest");
}

/* ------------------------------------------------------------------ */
/* Read API (PLA-§18.1, PLA Q.15 (a))                                  */
/* ------------------------------------------------------------------ */

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
/** a member's store rows are read 2 × limit at a time, the roles filtered in code (PLA-§M.4) */
const OVER_FETCH = 2;
/**
 * Further store-part reads when a page is still short after the filter (an agent behind many owner-only rows): each
 * twice the size of the one before (4×, 8×, 16× the limit), at most ROUND_MAX rows a read.
 */
const EXTRA_ROUNDS = 3;
const ROUND_MAX = 1_000;
/** the group of a kind no track file registers */
const UNREGISTERED_GROUP: NotificationGroup = "store";

const unreadCache = scopedCache<number>({ name: "notify-unread", maxEntries: 4_000, ttlMs: 5_000 });
const consoleUnread = scopedCache<number>({ name: "console-unread", maxEntries: 512, ttlMs: 5_000 });

/** Staff reading the console feed (no store): their count lives in `console-unread` (PLA-§M.5). */
const inConsole = (reader: Reader) => reader.storeId === null && reader.platformRole !== "none";
const unreadEntry = (reader: Reader) =>
  inConsole(reader)
    ? { cache: consoleUnread, store: "p", key: `${reader.userId}:${reader.platformRole}` }
    : { cache: unreadCache, store: reader.storeId ?? "p", key: `${reader.userId}:${reader.role ?? "-"}:${reader.platformRole}` };

function checkReader(reader: Reader): void {
  if (!ID_RE.test(reader.userId) || (reader.storeId !== null && !ID_RE.test(reader.storeId))) throw new Error("notify: malformed reader");
  if (reader.platformRole !== "none" && !(PLATFORM_ROLES as readonly string[]).includes(reader.platformRole)) throw new Error("notify: malformed reader");
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

/** The conditions every part shares: not expired, the page, the group, unread, the given ids. Null = nothing can match. */
function commonConds(f: ReadFilter): SQL[] | null {
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
  // the reader's read row is LEFT JOINed: unread = no such row
  if (f.unreadOnly) conds.push(isNull(notificationReads.notificationId));
  return conds;
}

const rowFields = {
  id: notifications.id,
  storeId: notifications.storeId,
  audience: notifications.audience,
  roles: notifications.roles,
  kind: notifications.kind,
  severity: notifications.severity,
  vars: notifications.vars,
  text: notifications.text,
  link: notifications.link,
  createdAt: notifications.createdAt,
  readAt: notificationReads.readAt,
};
type ReadRow = {
  id: number;
  storeId: string | null;
  audience: string;
  roles: StoreRole[] | null;
  kind: string;
  severity: string;
  vars: Record<string, string | number> | null;
  text: string | null;
  link: string | null;
  createdAt: Date;
  readAt: Date | null;
};

const readJoin = (reader: Reader) => and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, reader.userId));

/** A member's candidate rows of the store (`nt_store_idx`): the store rows, every store_role row (filtered in code), their own user rows. */
function storePart(scope: StoreScope, reader: Reader, conds: SQL[], limit: number) {
  const audience = reader.role
    ? or(inArray(notifications.audience, ["store", "store_role"]), and(eq(notifications.audience, "user"), eq(notifications.userId, reader.userId)))
    : and(eq(notifications.audience, "user"), eq(notifications.userId, reader.userId));
  return db
    .select(rowFields)
    .from(notifications)
    .leftJoin(notificationReads, readJoin(reader))
    .where(whereStore(notifications, scope, audience, ...conds))
    .orderBy(desc(notifications.id))
    .limit(limit);
}

/** The reader's store-less rows: their platform-wide user rows, and the staff feed when they read from the console. */
function platformPart(reader: Reader, conds: SQL[], limit: number) {
  const audience: SQL[] = [and(eq(notifications.audience, "user"), eq(notifications.userId, reader.userId))!];
  if (inConsole(reader) && reader.platformRole !== "none") {
    audience.push(and(eq(notifications.audience, "platform_staff"), or(isNull(notifications.platformMinRole), inArray(notifications.platformMinRole, staffRolesUpTo(reader.platformRole))))!);
  }
  // tenancy: platform the reader's own store-less rows (user-level and the staff feed), store_id NULL (§I.4, PLA-§18.1)
  return db
    .select(rowFields)
    .from(notifications)
    .leftJoin(notificationReads, readJoin(reader))
    .where(and(isNull(notifications.storeId), or(...audience), ...conds))
    .orderBy(desc(notifications.id))
    .limit(limit);
}

/** A store row the reader may see: `store_role` rows only when their roles hold the reader's role (PL-13). */
const roleAllows = (reader: Reader, r: ReadRow) => r.audience !== "store_role" || (reader.role !== null && Array.isArray(r.roles) && r.roles.includes(reader.role));

const byIdDesc = (a: ReadRow, b: ReadRow) => b.id - a.id;

/** Every row the reader may read under `f`, newest first, at most `f.limit`. One statement in the usual case. */
async function visibleRows(reader: Reader, f: ReadFilter): Promise<ReadRow[]> {
  const conds = commonConds(f);
  if (!conds) return [];
  if (!reader.storeId) return ((await platformPart(reader, conds, f.limit)) as ReadRow[]).sort(byIdDesc).slice(0, f.limit);

  // the store is the reader's (the caller resolved the membership); reads go through the system seam like notify()'s writes
  const scope = systemScope(systemCtx("notify"), reader.storeId);
  const over = f.limit * OVER_FETCH;
  const first = (await storePart(scope, reader, conds, over).unionAll(platformPart(reader, conds, f.limit))) as ReadRow[];
  const outside = first.filter((r) => r.storeId === null);
  let batch = first.filter((r) => r.storeId !== null);
  const kept = batch.filter((r) => roleAllows(reader, r));
  // below the horizon the store part is unread: a full batch may hide visible rows further back
  let horizon = batch.length === over ? Math.min(...batch.map((r) => r.id)) : 0;
  const shown = () => [...kept, ...outside].filter((r) => r.id >= horizon);
  for (let round = 1; round <= EXTRA_ROUNDS && horizon > 0 && shown().length < f.limit; round++) {
    const size = Math.min(ROUND_MAX, over * 2 ** round);
    batch = (await storePart(scope, reader, [...conds, lt(notifications.id, horizon)], size)) as ReadRow[];
    kept.push(...batch.filter((r) => roleAllows(reader, r)));
    horizon = batch.length === size ? Math.min(...batch.map((r) => r.id)) : 0;
  }
  return shown().sort(byIdDesc).slice(0, f.limit);
}

/** The reader's locale (`users.locale`, English when unset) and the time zone their dates read in. */
async function readerContext(reader: Reader): Promise<{ locale: AdminLocale; timeZone: string }> {
  const [row] = await db
    .select({ locale: users.locale, timeZone: stores.timezone })
    .from(users)
    .leftJoin(stores, eq(stores.id, reader.storeId ?? ""))
    .where(eq(users.id, reader.userId))
    .limit(1);
  return { locale: isAdminLocale(row?.locale) ? row.locale : "en", timeZone: row?.timeZone ?? PLATFORM_TZ };
}

/** A row as the reader sees it: labels for coded vars, dates in their time zone, the kind's texts in their locale. */
function render(r: ReadRow, locale: AdminLocale, timeZone: string): NotificationItem {
  const labels = labelsOf(notificationKind(r.kind));
  const vars: MessageVars = {};
  for (const [key, value] of Object.entries(r.vars ?? {})) {
    const prefix = labels[key];
    const label = prefix && typeof value === "string" ? messageOf(`${prefix}.${value}`, locale) : undefined;
    vars[key] = label ?? displayVar(value, locale, timeZone);
  }
  const bodyKey = `notify.${r.kind}.body`;
  return {
    id: r.id,
    kind: r.kind,
    group: groupOf(r.kind),
    severity: r.severity,
    title: t(`notify.${r.kind}.title`, vars, locale),
    body: r.text ?? (messageOf(bodyKey, locale) !== undefined ? t(bodyKey, vars, locale) : null),
    // stored links were checked at write time; R1.0 rows are checked again with today's rule
    link: notifyLinkOk(r.link),
    createdAt: r.createdAt.toISOString(),
    read: r.readAt !== null,
  };
}

/** Newest first; `limit` 1-50 (default 20), keyset paging with `beforeId`. Two queries, run together. */
export async function listNotifications(reader: Reader, opts: { beforeId?: number; limit?: number; group?: NotificationGroup; unreadOnly?: boolean }): Promise<NotificationItem[]> {
  checkReader(reader);
  const limit = Math.max(1, Math.min(LIST_MAX, Math.floor(opts.limit ?? LIST_DEFAULT) || LIST_DEFAULT));
  const beforeId = typeof opts.beforeId === "number" && Number.isSafeInteger(opts.beforeId) && opts.beforeId > 0 ? opts.beforeId : undefined;
  const [rows, ctx] = await Promise.all([visibleRows(reader, { beforeId, limit, group: opts.group, unreadOnly: opts.unreadOnly }), readerContext(reader)]);
  return rows.map((r) => render(r, ctx.locale, ctx.timeZone));
}

/** Cached 5 s per (store, reader) (`console-unread` for staff in the console); at most UNREAD_CAP. */
export async function unreadCount(reader: Reader): Promise<number> {
  checkReader(reader);
  const { cache, store, key } = unreadEntry(reader);
  return cache.getOrLoad(store, key, async () => (await visibleRows(reader, { limit: UNREAD_CAP, unreadOnly: true })).length);
}

/** "Mark all read" inserts one read row per unread id shown (at most 200); ids the reader may not read are ignored. */
export async function markRead(reader: Reader, ids: readonly number[] | "all"): Promise<void> {
  checkReader(reader);
  const wanted = ids === "all" ? undefined : [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, MARK_ALL_MAX);
  const rows = await visibleRows(reader, { limit: MARK_ALL_MAX, unreadOnly: true, ids: wanted });
  if (rows.length) await db.insert(notificationReads).ignore().values(rows.map((r) => ({ notificationId: r.id, userId: reader.userId })));
  const { cache, store, key } = unreadEntry(reader);
  cache.delete(store, key);
}
