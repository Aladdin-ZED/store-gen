import "server-only";
/**
 * Flag values (platform.md PLA-§12.2, PL-12; docs/STORE-SAAS.md §D.4, §E.6, §H.8). Declarations live in code
 * (`src/lib/flags/defs/<track>.ts`, read through src/lib/flags/registry.ts) and are seeded at boot; the console edits
 * a row's `default_value` and `rules` and the `flag_overrides` rows.
 *
 *   if (await flagValue<boolean>("health_tenant_ring", { storeId, planId, market, storeStatus })) …
 *   const on = await flagsFor(ctx, ["console_perf_panel", "health_tenant_ring"]);
 *
 * Resolution is `resolveFlag` (./flag-eval.ts, pure): an unexpired override (user > store > plan > market), then the
 * first matching rule with its sha256 rollout bucket, then the row's `default_value`, then the declaration's
 * `default` (also the answer while the table cannot be read).
 * Every row and every live override is one cached read: the `flags` scopedCache (core §E.6, 30 s, platform key "p"),
 * shared by name with the kill switches of src/lib/tenancy/entitlements.ts, so `invalidateFlags()` from either file
 * drops both (PLA Q.16b: every console flag or kill write). Kill switches are read through `activeKillSwitches()`;
 * `flagValue` answers them too, from their row only.
 *
 * The console (step 5, PLA-§12.1, §12.2): the kill-switch cards with their history and the toggle sheet's preview,
 * `setKillSwitch` (`kill.manage` ↑), the flags table by tab, the editor's `saveFlag` and the overrides. Kill-switch
 * rows never appear in the flag tabs; a flag missing from code reads "archived" and cannot be edited. The pure rules
 * (copy, typed words, validation, summaries) are ./flag-rules.ts.
 */
import { and, asc, count, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { releaseOn } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { auditLog, flagOverrides, flags, plans, stores, users } from "@/lib/db/schema";
import { KILL_SWITCHES, flagDef, isKillKey, killTripped, type FlagDef, type FlagRule, type FlagValue, type KillKey } from "@/lib/flags/registry";
import { ADMIN_LOCALES, type AdminLocale, type MessageKey } from "@/lib/i18n/admin";
import { scopedCache } from "@/lib/tenancy/cache";
import { invalidateFlags as invalidateKillSwitches } from "@/lib/tenancy/entitlements";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { resolveFlag, type FlagContext, type FlagOverrideState, type FlagRowState, type FlagType, type OverrideScope } from "./flag-eval";
import {
  KILL_AFFECTS,
  KILL_HISTORY_MAX,
  KILL_LIVE_STATES,
  KILL_ORDER,
  KILL_REASON_MAX,
  OVERRIDE_NOTE_MAX,
  OVERRIDE_SCOPES,
  checkFlagEdit,
  checkFlagValue,
  killBanner,
  killCopy,
  killState,
  killTypedFor,
  rulesSummary,
  scopeIdOk,
  type KillState,
} from "./flag-rules";
import { recordPlatformError } from "./log";
import { notify } from "./notify";
import { firstRun } from "./op-once";
import { cleanText } from "./queue-rules";
import { storesUsing } from "./usage-markers";

export type { FlagDef, FlagRule, FlagValue };
export { OVERRIDE_ORDER, inRollout, resolveFlag, rolloutBucket, ruleMatches, valueFits } from "./flag-eval";
export type { FlagContext, FlagOverrideState, FlagRowState, FlagSource, FlagType, OverrideScope } from "./flag-eval";

/* ------------------------------------------------------------------ */
/* The cached read                                                     */
/* ------------------------------------------------------------------ */

/** Every flag row and every override not yet expired, as one cached value. */
interface FlagSnapshot {
  rows: Record<string, FlagRowState>;
  overrides: FlagOverrideState[];
}

/** a bound no real table reaches (overrides are set by hand in the console) */
const OVERRIDES_MAX = 20_000;
const PLATFORM = "p";
/** the `flags` cache of core §E.6 (30 s), the same instance as the kill switches' (keys "kill" there, "values" here) */
const cache = scopedCache<FlagSnapshot>({ name: "flags", maxEntries: 500, ttlMs: 30_000 });

async function loadSnapshot(): Promise<FlagSnapshot> {
  return cache.getOrLoad(PLATFORM, "values", async () => {
    const [rows, overrides] = await Promise.all([
      db.select({ key: flags.key, kind: flags.kind, type: flags.type, defaultValue: flags.defaultValue, rules: flags.rules, archived: flags.archived }).from(flags),
      db
        .select({ flagKey: flagOverrides.flagKey, scope: flagOverrides.scope, scopeId: flagOverrides.scopeId, value: flagOverrides.value, expiresAt: flagOverrides.expiresAt })
        .from(flagOverrides)
        .limit(OVERRIDES_MAX),
    ]);
    const now = Date.now();
    return {
      rows: Object.fromEntries(rows.map((r) => [r.key, { ...r, rules: Array.isArray(r.rules) ? r.rules : null }])),
      overrides: overrides.filter((o) => o.expiresAt === null || o.expiresAt.getTime() > now),
    };
  });
}

/** The snapshot, or null while the table cannot be read (recorded; the declarations' defaults answer). */
async function snapshotOrNull(): Promise<FlagSnapshot | null> {
  try {
    return await loadSnapshot();
  } catch (err) {
    recordPlatformError("flags read", err);
    return null;
  }
}

/** A kill switch's safe value while its row cannot be read: nothing tripped (`*_enabled` true, read-only off). */
const killDefault = (key: string): FlagValue => key !== "platform_read_only";

function valueOf(key: string, ctx: FlagContext, snap: FlagSnapshot | null, now: Date): FlagValue {
  const def = flagDef(key);
  const row = snap ? snap.rows[key] : undefined;
  const resolved = resolveFlag(key, ctx, { def, row, overrides: snap?.overrides ?? [], now });
  if (resolved) return resolved.value;
  if (isKillKey(key)) return killDefault(key);
  throw new Error(`flags: unknown flag "${key.slice(0, 64)}"`);
}

/** One flag for a context. Throws only for a key that is neither declared nor a row (a programming error). */
export async function flagValue<T extends FlagValue>(key: string, ctx: FlagContext): Promise<T> {
  return valueOf(key, ctx, await snapshotOrNull(), new Date()) as T;
}

/** Several flags for one context, from one cached read. */
export async function flagsFor(ctx: FlagContext, keys: readonly string[]): Promise<Record<string, FlagValue>> {
  const snap = await snapshotOrNull();
  const now = new Date();
  return Object.fromEntries(keys.map((key) => [key, valueOf(key, ctx, snap, now)]));
}

/**
 * Drops the cached flag values and kill switches (PLA Q.16b), the same as src/lib/tenancy/entitlements.ts
 * `invalidateFlags()`: both clear the one `flags` cache. Other processes see a change within the 30 s TTL.
 */
export function invalidateFlags(): void {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* The console: kill switches (PLA-§12.1, PD29)                        */
/* ------------------------------------------------------------------ */

export interface KillHistoryEntry {
  at: string;
  by: { id: string; name: string } | null;
  from: boolean | null;
  to: boolean | null;
  reason: string | null;
}

export interface KillSwitchCard {
  key: KillKey;
  /** the row's value (`*_enabled` true = normal; `platform_read_only` true = read-only on) */
  value: boolean;
  tripped: boolean;
  state: KillState;
  name: MessageKey;
  effect: MessageKey;
  /** the last change (who, when, reason), from the newest audit row; null before the first */
  last: KillHistoryEntry | null;
  /** the last 20 changes, newest first */
  history: KillHistoryEntry[];
}

function requireFlags(ctx: PlatformCtx, permission: "console.read" | "flags.manage" | "kill.manage"): void {
  if (!ctx.can(permission)) throw new AuthRefusal("forbidden");
}

/** staff names by id (the cards' and the table's "who"; staff only, never a tenant field) */
async function namesOf(ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((id): id is string => typeof id === "string" && /^[0-9A-Z]{26}$/.test(id)))];
  if (!list.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** The kill-switch audit rows of the last 400 days (audit is kept 400 days), newest first, ≤ 20 per key. */
async function killHistory(): Promise<Map<KillKey, { at: Date; userId: string | null; meta: Record<string, unknown> }[]>> {
  const since = new Date(Date.now() - 400 * 86_400_000);
  // tenancy: platform the kill switches' history (PLA-§12.1): platform rows (store_id NULL) of one action, newest 140
  const rows = await db
    .select({ at: auditLog.createdAt, userId: auditLog.userId, meta: auditLog.meta })
    .from(auditLog)
    .where(and(eq(auditLog.action, "platform.kill.changed"), isNull(auditLog.storeId), gte(auditLog.createdAt, since)))
    .orderBy(desc(auditLog.id))
    .limit(KILL_SWITCHES.length * KILL_HISTORY_MAX);
  const out = new Map<KillKey, { at: Date; userId: string | null; meta: Record<string, unknown> }[]>();
  for (const r of rows) {
    const meta = r.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : {};
    if (!isKillKey(meta.key)) continue;
    const list = out.get(meta.key) ?? [];
    if (list.length < KILL_HISTORY_MAX) list.push({ at: r.at, userId: r.userId, meta });
    out.set(meta.key, list);
  }
  return out;
}

/** `console.read` (PLA-§12.1): one card per seeded switch, with its state, last change and history. */
export async function listKillSwitches(ctx: PlatformCtx): Promise<KillSwitchCard[]> {
  requireFlags(ctx, "console.read");
  const [rows, history] = await Promise.all([db.select({ key: flags.key, value: flags.defaultValue }).from(flags).where(eq(flags.kind, "kill")), killHistory()]);
  const names = await namesOf([...history.values()].flat().map((h) => h.userId));
  return KILL_ORDER.map((key): KillSwitchCard => {
    const raw = rows.find((r) => r.key === key)?.value;
    const value = typeof raw === "boolean" ? raw : key !== "platform_read_only";
    const entries = (history.get(key) ?? []).map(
      (h): KillHistoryEntry => ({
        at: h.at.toISOString(),
        by: h.userId ? { id: h.userId, name: names.get(h.userId) ?? "" } : null,
        from: typeof h.meta.from === "boolean" ? h.meta.from : null,
        to: typeof h.meta.to === "boolean" ? h.meta.to : null,
        reason: typeof h.meta.reason === "string" ? h.meta.reason : null,
      }),
    );
    const copy = killCopy(key);
    return { key, value, tripped: killTripped(key, value), state: killState(key, value), name: copy.name, effect: copy.effect, last: entries[0] ?? null, history: entries };
  });
}

export interface KillSwitchPreview {
  key: KillKey;
  from: boolean;
  to: boolean;
  tripping: boolean;
  stops: MessageKey;
  keeps: MessageKey;
  /** the tenant banner the change shows (tripping) or removes, in ar / fr / en: P2's `shell.kill.<key>` */
  banner: Record<AdminLocale, string>;
  /** true while P2's catalog lacks `shell.kill.<key>` and the reference texts stand in (CCR r1-p1-6) */
  bannerFallback: boolean;
  /** the stores the switch reaches; null for `signups_enabled` (no store is affected) */
  affectedStores: number | null;
  /** the word the confirmation needs (tripping `platform_read_only` or `signups_enabled`), else null */
  typed: string | null;
}

/** The stores a switch reaches now (PLA-§12.1). */
async function affectedStores(key: KillKey): Promise<number | null> {
  const affects = KILL_AFFECTS[key];
  if (affects === "none") return null;
  if (affects === "live_states") {
    const [row] = await db.select({ n: count() }).from(stores).where(inArray(stores.status, [...KILL_LIVE_STATES]));
    return Number(row?.n ?? 0);
  }
  return (await storesUsing(affects === "sheets" ? "sheets" : "pixels_capi", null))?.size ?? 0;
}

/** `kill.manage` (PLA-§12.1, PD29): the sheet before a toggle: what stops, what keeps working, the banner, the stores. */
export async function killSwitchPreview(ctx: PlatformCtx, key: string): Promise<KillSwitchPreview> {
  requireFlags(ctx, "kill.manage");
  if (!isKillKey(key)) throw new AuthRefusal("not_found");
  const [row] = await db.select({ value: flags.defaultValue }).from(flags).where(and(eq(flags.key, key), eq(flags.kind, "kill"))).limit(1);
  const from = typeof row?.value === "boolean" ? row.value : key !== "platform_read_only";
  const to = !from;
  const banners = ADMIN_LOCALES.map((l) => [l, killBanner(key, l)] as const);
  const copy = killCopy(key);
  return {
    key,
    from,
    to,
    tripping: killTripped(key, to),
    stops: copy.stops,
    keeps: copy.keeps,
    banner: Object.fromEntries(banners.map(([l, b]) => [l, b.text])) as Record<AdminLocale, string>,
    bannerFallback: banners.some(([, b]) => b.fallback),
    affectedStores: await affectedStores(key),
    typed: killTypedFor(key, to),
  };
}

const KillInput = z.object({
  key: z.string(),
  value: z.boolean(),
  reason: z.string(),
  typed: z.string().max(40).optional(),
  opId: z.string(),
});

/**
 * `kill.manage` ↑ (PLA-§12.1): sets the switch's `flags.default_value`; audit `platform.kill.changed { key, from, to,
 * reason }`; every staff member hears `staff.kill_changed`; `invalidateFlags()` (T1's, the one `flags` cache), so this
 * process applies it at once and the others within the 30 s TTL. The reason is 1-200 characters; tripping
 * `platform_read_only` or `signups_enabled` needs its typed word. `platform_read_only` can always be switched off
 * (the seam exempts `kill.manage` from read-only). A repeat of `opId`, or a value already set, changes nothing.
 */
export async function setKillSwitch(ctx: PlatformCtx, input: unknown): Promise<{ changed: boolean; from: boolean; to: boolean }> {
  requireFlags(ctx, "kill.manage");
  if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
  const v = KillInput.parse(input);
  if (!isKillKey(v.key)) throw new AuthRefusal("not_found");
  const reason = cleanText(v.reason);
  if (reason.length < 1 || reason.length > KILL_REASON_MAX) throw new FieldsError({ reason: "console.kill.reason_required" });
  const typed = killTypedFor(v.key, v.value);
  if (typed && v.typed?.trim().toLowerCase() !== typed) throw new FieldsError({ typed: "console.kill.typed_mismatch" });
  const [row] = await db.select({ value: flags.defaultValue }).from(flags).where(and(eq(flags.key, v.key), eq(flags.kind, "kill"))).limit(1);
  if (!row) throw new AuthRefusal("not_found");
  const from = typeof row.value === "boolean" ? row.value : v.key !== "platform_read_only";
  if (from === v.value || !(await firstRun(ctx, v.opId))) return { changed: false, from, to: from };
  await db.update(flags).set({ defaultValue: v.value, updatedBy: ctx.user.id }).where(and(eq(flags.key, v.key), eq(flags.kind, "kill")));
  invalidateKillSwitches();
  await auditFrom(ctx, "platform.kill.changed", { target: v.key, meta: { key: v.key, from, to: v.value, reason } });
  await notify({ audience: "platform_staff" }, "staff.kill_changed", { key: v.key, to: v.value });
  return { changed: true, from, to: v.value };
}

/* ------------------------------------------------------------------ */
/* The console: release and ops flags (PLA-§12.2)                      */
/* ------------------------------------------------------------------ */

export type FlagTab = "release" | "ops" | "experiment";

export interface FlagRowView {
  key: string;
  kind: FlagTab;
  type: FlagType;
  description: string;
  /** the row's default (the value without a rule or override) and the code's declaration */
  value: unknown;
  declared: unknown;
  rules: FlagRule[];
  /** "pro plan → on · 20 % of stores → on" */
  rulesSummary: string;
  overrides: number;
  ownerTrack: string | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
  /** in the table but no longer declared in code: read-only */
  archived: boolean;
  /** `design_publish_gates` only: design and budget overrides published in the last 7 days (the cost of `warn`) */
  overrides7d?: number;
}

/** The publish overrides of the last 7 days (PLA-§12.2: the `design_publish_gates` row's cost of `warn`). */
async function publishOverrides7d(): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  // tenancy: platform the flags table's design gate row (PLA-§12.2): a count of two audit actions over 7 days (audit_created_idx), no row returned
  const [row] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(and(gte(auditLog.createdAt, since), inArray(auditLog.action, ["page.publish.design_override", "page.publish.budget_override"])));
  return Number(row?.n ?? 0);
}

/** `console.read` (PLA-§12.2): every non-kill flag by tab (experiment rows from R3), with owner track and overrides count. */
export async function listFlags(ctx: PlatformCtx): Promise<Record<FlagTab, FlagRowView[]>> {
  requireFlags(ctx, "console.read");
  const [rows, overrideCounts] = await Promise.all([
    db.select().from(flags).where(ne(flags.kind, "kill")).orderBy(asc(flags.key)),
    db.select({ key: flagOverrides.flagKey, n: count() }).from(flagOverrides).groupBy(flagOverrides.flagKey),
  ]);
  const counts = new Map(overrideCounts.map((c) => [c.key, Number(c.n)]));
  const names = await namesOf(rows.map((r) => r.updatedBy));
  const out: Record<FlagTab, FlagRowView[]> = { release: [], ops: [], experiment: [] };
  for (const r of rows) {
    if (r.kind === "kill" || (r.kind === "experiment" && !releaseOn("R3"))) continue;
    const def = flagDef(r.key);
    const type: FlagType = def?.type ?? r.type;
    const rules = Array.isArray(r.rules) ? r.rules : [];
    const view: FlagRowView = {
      key: r.key,
      kind: r.kind,
      type,
      description: r.description ?? def?.description ?? "",
      value: r.defaultValue,
      declared: def?.default ?? null,
      rules,
      rulesSummary: rulesSummary(rules, type),
      overrides: counts.get(r.key) ?? 0,
      ownerTrack: r.ownerTrack ?? def?.ownerTrack ?? null,
      updatedBy: r.updatedBy ? { id: r.updatedBy, name: names.get(r.updatedBy) ?? "" } : null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
      archived: r.archived || !def,
    };
    if (r.key === "design_publish_gates") view.overrides7d = await publishOverrides7d();
    out[r.kind].push(view);
  }
  return out;
}

export interface FlagOverrideView {
  scope: OverrideScope;
  scopeId: string;
  value: unknown;
  note: string | null;
  expiresAt: string | null;
  expired: boolean;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string | null;
}

/** `console.read`: one flag's overrides for the editor (expired ones shown as such; they no longer apply). */
export async function listFlagOverrides(ctx: PlatformCtx, key: string): Promise<FlagOverrideView[]> {
  requireFlags(ctx, "console.read");
  const rows = await db.select().from(flagOverrides).where(eq(flagOverrides.flagKey, key.slice(0, 64))).orderBy(asc(flagOverrides.scope), asc(flagOverrides.scopeId)).limit(500);
  const names = await namesOf(rows.map((r) => r.updatedBy));
  const now = Date.now();
  return rows.map((r) => ({
    scope: r.scope,
    scopeId: r.scopeId,
    value: r.value,
    note: r.note,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    expired: r.expiresAt !== null && r.expiresAt.getTime() <= now,
    updatedBy: r.updatedBy ? { id: r.updatedBy, name: names.get(r.updatedBy) ?? "" } : null,
    updatedAt: r.updatedAt?.toISOString() ?? null,
  }));
}

/** The editable row of a flag: declared in code, not a kill switch, not archived. */
async function editableFlag(key: unknown): Promise<{ key: string; type: FlagType; defaultValue: unknown; rules: FlagRule[] }> {
  if (typeof key !== "string" || key.length > 64 || isKillKey(key)) throw new AuthRefusal("not_found");
  const [row] = await db.select().from(flags).where(eq(flags.key, key)).limit(1);
  if (!row || row.kind === "kill") throw new AuthRefusal("not_found");
  const def = flagDef(key);
  if (row.archived || !def) throw new AuthRefusal("invalid", "console.flag.archived");
  return { key, type: def.type, defaultValue: row.defaultValue, rules: Array.isArray(row.rules) ? row.rules : [] };
}

/**
 * `flags.manage` (PLA-§12.2): the flag's default and its ordered rules, validated for the flag's type (JSON checked
 * for `json`); audit `platform.flag.changed { key, diff }`; `invalidateFlags()`. Archived flags are read-only.
 */
export async function saveFlag(ctx: PlatformCtx, input: { key: string; default: unknown; rules: unknown; opId: string }): Promise<{ saved: boolean }> {
  requireFlags(ctx, "flags.manage");
  const row = await editableFlag(input.key);
  const check = checkFlagEdit(row.type, { default: input.default, rules: input.rules });
  if (!check.ok) throw new FieldsError({ [check.field]: `console.flag.${check.code}` });
  const sameDefault = JSON.stringify(check.default) === JSON.stringify(row.defaultValue);
  const sameRules = JSON.stringify(check.rules) === JSON.stringify(row.rules);
  if ((sameDefault && sameRules) || !(await firstRun(ctx, input.opId))) return { saved: false };
  await db.update(flags).set({ defaultValue: check.default, rules: check.rules, updatedBy: ctx.user.id }).where(eq(flags.key, row.key));
  invalidateFlags();
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (!sameDefault) diff.default = { from: row.defaultValue, to: check.default };
  if (!sameRules) diff.rules = { from: rulesSummary(row.rules, row.type), to: rulesSummary(check.rules, row.type) };
  await auditFrom(ctx, "platform.flag.changed", { target: row.key, meta: { key: row.key, diff } });
  return { saved: true };
}

const OverrideInput = z.object({
  key: z.string(),
  scope: z.enum(["store", "user", "plan", "market"]),
  scopeId: z.string().max(40),
  value: z.unknown(),
  note: z.string().max(400).nullish(),
  expiresAt: z.union([z.string(), z.date(), z.null()]).optional(),
});

/** The target of an override exists (a store that is not purged, a user, a plan); a market only needs its shape. */
async function overrideTargetExists(scope: OverrideScope, id: string): Promise<boolean> {
  if (scope === "market") return true;
  if (scope === "store") return (await db.select({ id: stores.id }).from(stores).where(and(eq(stores.id, id), ne(stores.status, "purged"))).limit(1)).length === 1;
  if (scope === "user") return (await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1)).length === 1;
  return (await db.select({ id: plans.id }).from(plans).where(eq(plans.id, id)).limit(1)).length === 1;
}

/**
 * `flags.manage` (PLA-§12.2): one override (scope store / user / plan / market, a value of the flag's type, a note
 * ≤ 200, an optional expiry in the future) upserted; audit `platform.flag.changed { key, override }`; invalidated.
 */
export async function setFlagOverride(ctx: PlatformCtx, input: unknown): Promise<{ saved: true }> {
  requireFlags(ctx, "flags.manage");
  const v = OverrideInput.parse(input);
  const row = await editableFlag(v.key);
  if (!scopeIdOk(v.scope, v.scopeId)) throw new FieldsError({ scopeId: "console.flag.scope_id_invalid" });
  if (!(await overrideTargetExists(v.scope, v.scopeId))) throw new FieldsError({ scopeId: "console.flag.scope_id_unknown" });
  const value = checkFlagValue(row.type, v.value);
  if (!value.ok) throw new FieldsError({ value: `console.flag.${value.code}` });
  const note = v.note ? cleanText(v.note) || null : null;
  if (note && note.length > OVERRIDE_NOTE_MAX) throw new FieldsError({ note: "console.flag.note_too_long" });
  const expiresAt = v.expiresAt ? new Date(v.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) throw new FieldsError({ expiresAt: "console.entitlement.expiry_past" });
  const set = { value: value.value, note, expiresAt, updatedBy: ctx.user.id };
  await db
    .insert(flagOverrides)
    .values({ flagKey: row.key, scope: v.scope, scopeId: v.scopeId, ...set })
    .onDuplicateKeyUpdate({ set });
  invalidateFlags();
  await auditFrom(ctx, "platform.flag.changed", { target: row.key, meta: { key: row.key, override: { scope: v.scope, scopeId: v.scopeId, value: value.value, expiresAt: expiresAt?.toISOString() ?? null } } });
  return { saved: true };
}

/** `flags.manage`: removes one override; audit `platform.flag.changed { key, override: { cleared } }`. */
export async function clearFlagOverride(ctx: PlatformCtx, input: { key: string; scope: OverrideScope; scopeId: string }): Promise<{ cleared: boolean }> {
  requireFlags(ctx, "flags.manage");
  const row = await editableFlag(input.key);
  if (!OVERRIDE_SCOPES.includes(input.scope) || !scopeIdOk(input.scope, input.scopeId)) throw new AuthRefusal("not_found");
  const [res] = await db.delete(flagOverrides).where(and(eq(flagOverrides.flagKey, row.key), eq(flagOverrides.scope, input.scope), eq(flagOverrides.scopeId, input.scopeId)));
  if (res.affectedRows === 0) return { cleared: false };
  invalidateFlags();
  await auditFrom(ctx, "platform.flag.changed", { target: row.key, meta: { key: row.key, override: { scope: input.scope, scopeId: input.scopeId, cleared: true } } });
  return { cleared: true };
}
