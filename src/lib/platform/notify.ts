import "server-only";
/**
 * In-app notifications (docs/STORE-SAAS.md §I.4; platform.md PLA-§18.1, PLA Q.15): the frozen `notify()` signature.
 * R1.0: T2's minimal `notifications` insert behind it; R1 product: P1's full API (reads, unread counts, the kind
 * registry's link builders and vars schemas).
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
import { sql } from "drizzle-orm";
import type { PlatformRole, StoreRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { notificationKind, safeNotifyLink, type NotificationKind, type NotificationSeverity, type NotificationVars } from "@/lib/notify/registry";
import { errorSummary } from "@/lib/orders/log";
import { storeValues } from "@/lib/tenancy/sql";

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
    const values = aud.storeId ? storeValues(systemScope(systemCtx("notify"), aud.storeId), row) : { ...row, storeId: null };

    if (batch && dedupeKey) {
      const [res] = await db
        .insert(notifications)
        .values(values)
        .onDuplicateKeyUpdate({ set: { vars: sql`JSON_SET(COALESCE(${notifications.vars}, '{}'), '$.count', COALESCE(JSON_EXTRACT(${notifications.vars}, '$.count'), 1) + 1)` } });
      // MySQL answers 1 for an insert, 2 for an update of the existing row
      return res.affectedRows === 1 ? { id: Number(res.insertId) } : { deduped: true };
    }
    const [res] = await db.insert(notifications).ignore().values(values);
    return res.affectedRows === 1 ? { id: Number(res.insertId) } : { deduped: true };
  } catch (err) {
    console.error(`[notify] "${String(kind).slice(0, 40)}" not stored:`, errorSummary(err));
    return { deduped: true };
  }
}
