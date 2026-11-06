import "server-only";
/**
 * Plans, overrides and boosts from the console (platform.md PLA-§9, PL-11; core §A.4; PD8, PD58). Step 4 added the
 * grant functions the queue's `resolveRequest` and the profile's Usage & plan tab call; step 5 the plan list and
 * editor, the impact preview, the save, plan creation and status, and the `platform.entitlements` job.
 *
 *   await assignPlan(ctx, { storeId, planId: "growth", note });                       // entitlements.override
 *   await setEntitlement(ctx, { storeId, key: "media_bytes", source: "boost", value: 2 * GiB, expiresAt, reason });
 *   await clearEntitlement(ctx, { storeId, key: "media_bytes", source: "boost" });
 *   const editor = await getPlanEditor(ctx, "beta");                                    // rows by group, sentences
 *   const impact = await previewPlanChange(ctx, "beta", { media_bytes: 500 * MiB });  // plans.manage; cached 60 s
 *   await savePlan(ctx, "beta", { media_bytes: 500 * MiB }, opId);                     // audit platform.plan.updated { diff }
 *
 * Writes: `stores.plan_id` (the store row, not a tenant table), the store's `store_subscriptions` and
 * `store_entitlements` rows through the system seam (a staff decision about the store, never a member's write), the
 * audit row, one store notification (`plan.changed`, `plan.boost_granted`; a caller that answers the store itself,
 * the queue's `request.answered`, passes `{ notify: false }`), `invalidateEntitlements`, `markHealthDirty`.
 * `take_orders` can never be switched off (PD8: orders are never blocked by a plan): `take_orders_locked` in a plan
 * save and in an override. A plan save invalidates the entitlements of every store on the plan (≤ 2,000 in-process
 * deletes; another process sees the change within T1's 30 s TTL). The pure rules are ./plan-rules.ts; the
 * cross-store usage reads are ./usage-markers.ts.
 */
import { and, asc, count, eq, gt, inArray, isNull, lte, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { plans, storeEntitlements, stores, storeSubscriptions } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { getPlatformSetting } from "@/lib/settings";
import { invalidateStore, scopedCache } from "@/lib/tenancy/cache";
import { ENTITLEMENTS, isEntitlementKey, type EntitlementKey, type FeatureKey, type LimitKey } from "@/lib/tenancy/entitlement-keys";
import { invalidateEntitlements } from "@/lib/tenancy/entitlements";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, WriteScope } from "@/lib/tenancy/types";
import { markHealthDirty } from "./health-snapshot";
import { recordPlatformError } from "./log";
import { notify } from "./notify";
import { firstRun } from "./op-once";
import {
  DEFAULT_PLAN_ID,
  PLAN_ID_RE,
  PLAN_NAME_MAX,
  PLAN_STATUSES,
  BOOST_ENDING_DAYS,
  boostEndingDue,
  boostEndingKey,
  checkPlanPatch,
  computeImpact,
  effectiveOf,
  gaugeOf,
  lowers,
  patchHash,
  planDiff,
  planEditorRows,
  purgeBefore,
  type PendingCapValues,
  type PlanBags,
  type PlanEditorRow,
  type PlanImpact,
  type PlanPatch,
  type PlanStatus,
  type ImpactStore,
} from "./plan-rules";
import { cleanText } from "./queue-rules";
import { storesUsing, usageOf } from "./usage-markers";

const DAY = 86_400_000;
/** PLA-§9.4, §L: a boost needs an expiry, at most 90 days ahead */
export const BOOST_MAX_DAYS = 90;
/** PLA-§L: entitlement reasons */
export const ENTITLEMENT_REASON_MAX = 200;
const ID_RE = /^[0-9A-Z]{26}$/;

/** A staff decision about one store's plan rows: the system seam of that store (the console's own scope is read-only, D71). */
const grantScope = (storeId: string): WriteScope => systemScope(systemCtx("platform.plans"), storeId);

function requireOverride(ctx: PlatformCtx): void {
  if (!ctx.can("entitlements.override")) throw new AuthRefusal("forbidden");
}

async function storeRow(storeId: string): Promise<{ id: string; handle: string | null; planId: string; status: string }> {
  if (!ID_RE.test(storeId)) throw new AuthRefusal("not_found");
  const [row] = await db.select({ id: stores.id, handle: stores.handle, planId: stores.planId, status: stores.status }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!row || row.status === "purged") throw new AuthRefusal("not_found");
  return row;
}

/** Plans, entitlement rows and the store row change together: every cache of the store goes, health is recomputed. */
function afterGrant(storeId: string): void {
  invalidateEntitlements(storeId);
  invalidateStore(storeId);
  void markHealthDirty(storeId).catch((err: unknown) => recordPlatformError("plans markHealthDirty", err, { storeId }));
}

/* ------------------------------------------------------------------ */
/* Assign a plan (PLA-§9.3)                                            */
/* ------------------------------------------------------------------ */

export interface AssignPlanInput {
  storeId: string;
  planId: string;
  note?: string | null;
}

/** The store row's plan, the current subscription ended and a manual one started, in one transaction. */
async function switchPlan(scope: WriteScope, planId: string, by: string, note: string | null, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(stores).set({ planId }).where(eq(stores.id, scope.storeId));
    await tx
      .update(storeSubscriptions)
      .set({ status: "ended", periodEnd: now })
      .where(whereStore(storeSubscriptions, scope, eq(storeSubscriptions.status, "active")));
    await tx.insert(storeSubscriptions).values(storeValues(scope, { id: newId(), planId, status: "active" as const, provider: "manual" as const, periodStart: now, createdBy: by, note }));
  });
}

/**
 * `entitlements.override`: the store moves to `planId` (active or hidden plans; a retired plan takes nobody new). The
 * current `store_subscriptions` row ends, a `manual` one starts now; audit `platform.plan.changed { from, to }`; the
 * store hears `plan.changed`. Moving a store to the plan it is on changes nothing and answers `{ changed: false }`.
 */
export async function assignPlan(ctx: PlatformCtx, input: AssignPlanInput, opts: { notify?: boolean } = {}): Promise<{ changed: boolean; from: string; to: string }> {
  requireOverride(ctx);
  const planId = typeof input.planId === "string" && PLAN_ID_RE.test(input.planId) ? input.planId : null;
  if (!planId) throw new FieldsError({ planId: "console.plans.unknown" });
  const note = typeof input.note === "string" ? cleanText(input.note).slice(0, 300) || null : null;
  const store = await storeRow(input.storeId);
  const [plan] = await db.select({ id: plans.id, name: plans.name, status: plans.status }).from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new FieldsError({ planId: "console.plans.unknown" });
  if (plan.status === "retired") throw new AuthRefusal("invalid", "console.plans.retired");
  if (store.planId === plan.id) return { changed: false, from: store.planId, to: plan.id };

  await switchPlan(grantScope(store.id), plan.id, ctx.user.id, note, new Date());
  afterGrant(store.id);
  await auditFrom(ctx, "platform.plan.changed", { storeId: store.id, target: store.id, meta: { from: store.planId, to: plan.id, ...(note ? { note } : {}) } });
  if (opts.notify !== false) await notify({ audience: "store_role", storeId: store.id, roles: ["owner", "admin"] }, "plan.changed", { plan: plan.name });
  return { changed: true, from: store.planId, to: plan.id };
}

/* ------------------------------------------------------------------ */
/* Overrides and boosts (PLA-§9.4)                                     */
/* ------------------------------------------------------------------ */

const EntitlementInput = z.object({
  storeId: z.string().regex(ID_RE),
  key: z.string().refine((k): k is EntitlementKey => isEntitlementKey(k), "unknown entitlement key"),
  source: z.enum(["override", "boost"]),
  value: z.union([z.number().int().min(0), z.boolean(), z.null()]),
  expiresAt: z.union([z.string(), z.date(), z.null()]).optional(),
  reason: z.string(),
});
export type SetEntitlementInput = z.input<typeof EntitlementInput>;

/**
 * The value an override or boost may hold, the expiry it needs and the reason, checked without the database (pure,
 * selftested): a limit is an integer ≥ 0 or null (unlimited), a feature a boolean; `take_orders` false is refused
 * (`take_orders_locked`); a boost needs an expiry in the future, at most 90 days ahead; an override's expiry, when
 * given, is in the future; the reason is 1-200 characters.
 */
export function checkEntitlementGrant(
  input: { key: EntitlementKey; source: "override" | "boost"; value: number | boolean | null; expiresAt: Date | null; reason: string },
  now: Date,
): { ok: true } | { ok: false; field: "value" | "expiresAt" | "reason"; code: string } {
  const def = ENTITLEMENTS[input.key];
  if (input.key === "take_orders" && input.value === false) return { ok: false, field: "value", code: "take_orders_locked" };
  if (def.kind === "feature" ? typeof input.value !== "boolean" : !(input.value === null || (typeof input.value === "number" && Number.isInteger(input.value) && input.value >= 0))) {
    return { ok: false, field: "value", code: "value_type" };
  }
  if (input.source === "boost" && !input.expiresAt) return { ok: false, field: "expiresAt", code: "boost_expiry_required" };
  if (input.expiresAt) {
    if (input.expiresAt.getTime() <= now.getTime()) return { ok: false, field: "expiresAt", code: "expiry_past" };
    if (input.source === "boost" && input.expiresAt.getTime() > now.getTime() + BOOST_MAX_DAYS * DAY) return { ok: false, field: "expiresAt", code: "boost_too_long" };
  }
  const reason = cleanText(input.reason);
  if (reason.length < 1 || reason.length > ENTITLEMENT_REASON_MAX) return { ok: false, field: "reason", code: "reason_length" };
  return { ok: true };
}

function dateOf(v: string | Date | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) throw new FieldsError({ expiresAt: "console.entitlement.expiry_invalid" });
  return d;
}

type EntitlementRow = Omit<typeof storeEntitlements.$inferInsert, "storeId" | "createdAt">;

async function upsertEntitlement(scope: WriteScope, row: EntitlementRow, now: Date): Promise<void> {
  await db
    .insert(storeEntitlements)
    .values(storeValues(scope, { ...row, createdAt: now }))
    .onDuplicateKeyUpdate({ set: { value: row.value, expiresAt: row.expiresAt ?? null, setBy: row.setBy, reason: row.reason, createdAt: now } });
}

async function deleteEntitlement(scope: WriteScope, key: EntitlementKey, source: "override" | "boost"): Promise<number> {
  const [res] = await db.delete(storeEntitlements).where(whereStore(storeEntitlements, scope, and(eq(storeEntitlements.key, key), eq(storeEntitlements.source, source))));
  return res.affectedRows;
}

/**
 * `entitlements.override` (PLA-§9.4): upserts the store's override or boost of `key`; audit
 * `platform.entitlement.set`; a boost tells the store (`plan.boost_granted`). `take_orders` false answers
 * `take_orders_locked` (refused server-side, PL-11 acceptance).
 */
export async function setEntitlement(ctx: PlatformCtx, input: SetEntitlementInput, opts: { notify?: boolean } = {}): Promise<void> {
  requireOverride(ctx);
  const v = EntitlementInput.parse(input);
  const expiresAt = dateOf(v.expiresAt);
  const now = new Date();
  const check = checkEntitlementGrant({ key: v.key, source: v.source, value: v.value, expiresAt, reason: v.reason }, now);
  if (!check.ok) {
    if (check.code === "take_orders_locked") throw new AuthRefusal("take_orders_locked", "console.plans.take_orders_locked");
    throw new FieldsError({ [check.field]: `console.entitlement.${check.code}` });
  }
  const store = await storeRow(v.storeId);
  const reason = cleanText(v.reason);
  await upsertEntitlement(grantScope(store.id), { key: v.key, source: v.source, value: v.value, expiresAt, setBy: ctx.user.id, reason }, now);
  afterGrant(store.id);
  await auditFrom(ctx, "platform.entitlement.set", { storeId: store.id, target: store.id, meta: { key: v.key, source: v.source, value: v.value, expiresAt: expiresAt?.toISOString() ?? null, reason } });
  if (v.source === "boost" && expiresAt && opts.notify !== false) {
    await notify({ audience: "store_role", storeId: store.id, roles: ["owner", "admin"] }, "plan.boost_granted", { key: v.key, until: expiresAt.toISOString() });
  }
}

/** `entitlements.override`: removes the store's override or boost of `key` (audit `platform.entitlement.set { cleared }`). */
export async function clearEntitlement(ctx: PlatformCtx, input: { storeId: string; key: string; source: "override" | "boost"; reason?: string }): Promise<{ cleared: boolean }> {
  requireOverride(ctx);
  if (!isEntitlementKey(input.key) || (input.source !== "override" && input.source !== "boost")) throw new AuthRefusal("invalid");
  const store = await storeRow(input.storeId);
  const cleared = (await deleteEntitlement(grantScope(store.id), input.key, input.source)) > 0;
  if (cleared) {
    afterGrant(store.id);
    const reason = typeof input.reason === "string" ? cleanText(input.reason).slice(0, ENTITLEMENT_REASON_MAX) : "";
    await auditFrom(ctx, "platform.entitlement.set", { storeId: store.id, target: store.id, meta: { key: input.key, source: input.source, cleared: true, ...(reason ? { reason } : {}) } });
  }
  return { cleared };
}

/* ------------------------------------------------------------------ */
/* The plans list and the editor (PLA-§9.1, §9.2)                      */
/* ------------------------------------------------------------------ */

export interface PlanListRow {
  id: string;
  name: string;
  status: PlanStatus;
  sort: number;
  /** stores on the plan (purged ones aside) */
  stores: number;
  updatedAt: string | null;
  /** `beta`: the column default of new stores (PLA-§9.1) */
  isDefault: boolean;
}

function requirePlans(ctx: PlatformCtx, permission: "console.read" | "plans.manage"): void {
  if (!ctx.can(permission)) throw new AuthRefusal("forbidden");
}

type PlanRow = typeof plans.$inferSelect;

async function planRow(planId: string): Promise<PlanRow> {
  if (typeof planId !== "string" || !PLAN_ID_RE.test(planId)) throw new AuthRefusal("not_found");
  const [row] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!row) throw new AuthRefusal("not_found");
  return row;
}

const bagsOf = (row: Pick<PlanRow, "limits" | "features">): PlanBags => ({
  limits: row.limits && typeof row.limits === "object" ? { ...row.limits } : {},
  features: row.features && typeof row.features === "object" ? { ...row.features } : {},
});

/** `console.read`: every plan with its store count, in sort order. */
export async function listPlans(ctx: PlatformCtx): Promise<PlanListRow[]> {
  requirePlans(ctx, "console.read");
  const [rows, counts] = await Promise.all([
    db.select({ id: plans.id, name: plans.name, status: plans.status, sort: plans.sort, updatedAt: plans.updatedAt }).from(plans).orderBy(asc(plans.sort), asc(plans.id)),
    db.select({ planId: stores.planId, n: count() }).from(stores).where(ne(stores.status, "purged")).groupBy(stores.planId),
  ]);
  const byPlan = new Map(counts.map((c) => [c.planId, Number(c.n)]));
  return rows.map((r) => ({ ...r, stores: byPlan.get(r.id) ?? 0, updatedAt: r.updatedAt?.toISOString() ?? null, isDefault: r.id === DEFAULT_PLAN_ID }));
}

export interface PlanEditor {
  plan: PlanListRow;
  rows: PlanEditorRow[];
  /** the pending caps the rows' sentences quote, so the editor can say them again for an edited value */
  caps: PendingCapValues;
}

/** The pending caps the sentences quote (`platform.signup.*`, PLA-§2.4). */
async function pendingCaps(): Promise<PendingCapValues> {
  const { signup } = await getPlatformSetting("platform");
  return { mediaMiB: signup.pendingMediaMiB, mediaMiBBeforeSubmit: signup.pendingMediaMiBBeforeSubmit, membersMax: signup.pendingMembersMax };
}

/** `console.read`: the plan and its rows grouped Limits / Features / Later releases, each with its three explanations. */
export async function getPlanEditor(ctx: PlatformCtx, planId: string): Promise<PlanEditor> {
  requirePlans(ctx, "console.read");
  const row = await planRow(planId);
  const [[n], caps] = await Promise.all([db.select({ n: count() }).from(stores).where(and(eq(stores.planId, row.id), ne(stores.status, "purged"))), pendingCaps()]);
  return {
    plan: { id: row.id, name: row.name, status: row.status, sort: row.sort, stores: Number(n?.n ?? 0), updatedAt: row.updatedAt?.toISOString() ?? null, isDefault: row.id === DEFAULT_PLAN_ID },
    rows: planEditorRows(bagsOf(row), caps),
    caps,
  };
}

/** A refused patch as the editor shows it: the row's field, or the take_orders refusal. */
function patchRefusal(check: Extract<ReturnType<typeof checkPlanPatch>, { ok: false }>): Error {
  if (check.code === "take_orders_locked") return new AuthRefusal("take_orders_locked", "console.plans.take_orders_locked");
  if (check.code === "empty") return new FieldsError({ patch: "console.plans.no_change" });
  return new FieldsError({ [check.key || "patch"]: `console.plans.${check.code}` });
}

/* ------------------------------------------------------------------ */
/* The impact preview (PLA-§9.2, PD58)                                 */
/* ------------------------------------------------------------------ */

/** `plan-impact` (PLA-§M.5): `"p"` : `<planId>:<patchHash>`, 60 s, cleared by every plan save */
const impactCache = scopedCache<PlanImpact>({ name: "plan-impact", maxEntries: 50, ttlMs: 60_000 });
const PLATFORM = "p";

/** The live override and boost keys of the stores among `changed` (one annotated read per 500 stores). */
async function shieldedKeys(storeIds: readonly string[], changed: readonly EntitlementKey[], now: Date): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (let i = 0; i < storeIds.length; i += 500) {
    const ids = storeIds.slice(i, i + 500);
    // tenancy: platform plan impact (PLA-§9.2): which of ≤ 500 stores override or boost the changed keys (store_entitlements PK prefix), keys only
    const rows = await db
      .select({ storeId: storeEntitlements.storeId, key: storeEntitlements.key })
      .from(storeEntitlements)
      .where(and(inArray(storeEntitlements.storeId, ids), inArray(storeEntitlements.key, [...changed]), or(isNull(storeEntitlements.expiresAt), gt(storeEntitlements.expiresAt, now))));
    for (const r of rows) {
      const set = out.get(r.storeId) ?? new Set<string>();
      set.add(r.key);
      out.set(r.storeId, set);
    }
  }
  return out;
}

/**
 * `plans.manage` (PLA-§9.2): what saving `patch` would do to the plan's stores. Validated like the save (refusals
 * answer the same); reads the plan's stores, their overrides and boosts of the changed keys, then one counter or
 * marker read per lowered limit and per feature switched off (`IN (…)` chunked by 500). Cached 60 s per patch.
 */
export async function previewPlanChange(ctx: PlatformCtx, planId: string, patch: PlanPatch): Promise<PlanImpact> {
  requirePlans(ctx, "plans.manage");
  const row = await planRow(planId);
  const check = checkPlanPatch(bagsOf(row), patch);
  if (!check.ok) throw patchRefusal(check);
  return impactCache.getOrLoad(PLATFORM, `${row.id}:${patchHash(patch)}`, async () => {
    const now = new Date();
    const onPlan = await db
      .select({ id: stores.id, handle: stores.handle, timezone: stores.timezone })
      .from(stores)
      .where(and(eq(stores.planId, row.id), ne(stores.status, "purged")))
      .orderBy(asc(stores.id));
    const ids = onPlan.map((s) => s.id);
    const changes = check.changes.map((c) => ({ key: c.key, from: effectiveOf(c.key, c.from), to: effectiveOf(c.key, c.to) }));
    const zones = new Map(onPlan.map((s) => [s.id, s.timezone]));
    const shield = ids.length ? await shieldedKeys(ids, changes.map((c) => c.key), now) : new Map<string, Set<string>>();
    const usage = new Map<LimitKey, Map<string, number> | null>();
    const users = new Map<FeatureKey, Set<string> | null>();
    for (const c of changes) {
      if (ENTITLEMENTS[c.key].kind === "limit") {
        if (!lowers(c.from as number | null, c.to as number | null)) continue;
        const gauge = gaugeOf(c.key as LimitKey);
        usage.set(c.key as LimitKey, gauge ? (ids.length ? await usageOf(gauge, ids, zones, now) : new Map()) : null);
      } else if (c.from === true && c.to === false) {
        users.set(c.key as FeatureKey, ids.length ? await storesUsing(c.key as FeatureKey, ids) : new Set());
      }
    }
    const impactStores: ImpactStore[] = onPlan.map((s) => ({ id: s.id, handle: s.handle, shielded: shield.get(s.id) ?? new Set() }));
    return computeImpact({ stores: impactStores, changes, usage: (k) => usage.get(k) ?? null, users: (k) => users.get(k) ?? null });
  });
}

/* ------------------------------------------------------------------ */
/* Save, create, status (PLA-§9.1, §9.2)                               */
/* ------------------------------------------------------------------ */

const PlanMetaInput = z.object({
  name: z.string().transform(cleanText).pipe(z.string().min(1).max(PLAN_NAME_MAX)).optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
});

/** Every cache a plan change reaches: each store's entitlements, then the previews. Answers how many stores. */
async function invalidatePlanStores(planId: string): Promise<number> {
  const onPlan = await db.select({ id: stores.id }).from(stores).where(and(eq(stores.planId, planId), ne(stores.status, "purged")));
  for (const s of onPlan) invalidateEntitlements(s.id);
  impactCache.clear();
  return onPlan.length;
}

/**
 * `plans.manage` (PLA-§9.2): the patch (and optionally the plan's name and sort order) saved in one locked
 * read-modify-write; audit `platform.plan.updated { planId, diff }`; then `invalidateEntitlements` for every store on
 * the plan. `opId` makes a repeat of the same confirmed sheet a no-op (`{ saved: false }`). Refusals as the preview's.
 */
export async function savePlan(ctx: PlatformCtx, planId: string, patch: PlanPatch, opId: string, meta: { name?: string; sort?: number } = {}): Promise<{ saved: boolean; stores: number }> {
  requirePlans(ctx, "plans.manage");
  const m = PlanMetaInput.safeParse(meta);
  if (!m.success) throw new FieldsError({ [String(m.error.issues[0]?.path[0] ?? "name")]: "console.plans.name_invalid" });
  await planRow(planId);
  if (!(await firstRun(ctx, opId))) return { saved: false, stores: 0 };
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(plans).where(eq(plans.id, planId)).for("update");
    if (!row) throw new AuthRefusal("not_found");
    const renamed = m.data.name !== undefined && m.data.name !== row.name ? { from: row.name, to: m.data.name } : null;
    const resorted = m.data.sort !== undefined && m.data.sort !== row.sort ? { from: row.sort, to: m.data.sort } : null;
    const check = Object.keys(patch ?? {}).length ? checkPlanPatch(bagsOf(row), patch) : null;
    if (check && !check.ok && !(check.code === "empty" && (renamed || resorted))) throw patchRefusal(check);
    const values = check?.ok ? check : null;
    if (!values && !renamed && !resorted) throw new FieldsError({ patch: "console.plans.no_change" });
    await tx
      .update(plans)
      .set({
        ...(values ? { limits: values.next.limits, features: values.next.features } : {}),
        ...(renamed ? { name: renamed.to } : {}),
        ...(resorted ? { sort: resorted.to } : {}),
      })
      .where(eq(plans.id, row.id));
    return { diff: values ? planDiff(values.changes) : {}, renamed, resorted };
  });
  const invalidated = await invalidatePlanStores(planId);
  await auditFrom(ctx, "platform.plan.updated", {
    target: planId,
    meta: { planId, diff: result.diff, ...(result.renamed ? { name: result.renamed } : {}), ...(result.resorted ? { sort: result.resorted } : {}), stores: invalidated },
  });
  return { saved: true, stores: invalidated };
}

const CreatePlanInput = z.object({
  id: z.string().regex(PLAN_ID_RE),
  name: z.string().transform(cleanText).pipe(z.string().min(1).max(PLAN_NAME_MAX)),
  copyFrom: z.string().regex(PLAN_ID_RE).nullish(),
  status: z.enum(["active", "hidden"]).default("active"),
});

const isDuplicate = (err: unknown): boolean => {
  const e = err as { errno?: number; cause?: { errno?: number } } | null;
  return e?.errno === 1062 || e?.cause?.errno === 1062;
};

/**
 * `plans.manage` (PLA-§9.1): a new plan with an id of `^[a-z][a-z0-9_]{1,31}$`, its name, and the limits and features
 * copied from an existing plan (else empty: the registry defaults). Sorted last. Audit `platform.plan.created`.
 */
export async function createPlan(ctx: PlatformCtx, input: unknown): Promise<{ id: string }> {
  requirePlans(ctx, "plans.manage");
  const parsed = CreatePlanInput.safeParse(input);
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? "id");
    throw new FieldsError({ [path]: path === "name" ? "console.plans.name_invalid" : path === "copyFrom" ? "console.plans.unknown" : "console.plans.id_invalid" });
  }
  const v = parsed.data;
  const source = v.copyFrom ? await planRow(v.copyFrom).catch(() => null) : null;
  if (v.copyFrom && !source) throw new FieldsError({ copyFrom: "console.plans.unknown" });
  const [last] = await db.select({ sort: sql<number>`COALESCE(MAX(${plans.sort}), 0)` }).from(plans);
  const bags = source ? bagsOf(source) : { limits: {}, features: {} };
  try {
    await db.insert(plans).values({ id: v.id, name: v.name, status: v.status, sort: Number(last?.sort ?? 0) + 10, limits: bags.limits, features: bags.features });
  } catch (err) {
    if (isDuplicate(err)) throw new FieldsError({ id: "console.plans.id_taken" });
    throw err;
  }
  await auditFrom(ctx, "platform.plan.created", { target: v.id, meta: { planId: v.id, name: v.name, status: v.status, copyFrom: source?.id ?? null } });
  return { id: v.id };
}

/**
 * `plans.manage` (PLA-§9.1): active (offered), hidden (assignable by staff only), retired (stores keep it, nobody
 * moves onto it). `beta` stays active: it is the column default of every new store (`default_plan_locked`).
 */
export async function setPlanStatus(ctx: PlatformCtx, input: { planId: string; status: PlanStatus }): Promise<{ changed: boolean }> {
  requirePlans(ctx, "plans.manage");
  if (!PLAN_STATUSES.includes(input.status)) throw new FieldsError({ status: "console.plans.status_invalid" });
  const row = await planRow(input.planId);
  if (row.id === DEFAULT_PLAN_ID && input.status !== "active") throw new AuthRefusal("invalid", "console.plans.default_plan_locked");
  if (row.status === input.status) return { changed: false };
  await db.update(plans).set({ status: input.status }).where(eq(plans.id, row.id));
  impactCache.clear();
  await auditFrom(ctx, "platform.plan.updated", { target: row.id, meta: { planId: row.id, status: { from: row.status, to: input.status } } });
  return { changed: true };
}

/* ------------------------------------------------------------------ */
/* The platform.entitlements job (PLA-§9.4, hourly)                    */
/* ------------------------------------------------------------------ */

export interface EntitlementsJobSummary {
  /** boosts expiring within 3 days, and the notices sent for them (a repeat is deduplicated per row and expiry) */
  boostsEnding: number;
  notified: number;
  /** override and boost rows expired for more than 30 days, deleted */
  deleted: number;
  done: boolean;
}

/** at most this many ending boosts per run (the next hour takes the rest) */
const ENDING_BATCH = 200;

/**
 * The hourly job (PLA-§9.4): `plan.boost_ending` to the store's owners and admins once per boost row and expiry, 3
 * days before it ends; override and boost rows expired for more than 30 days are deleted (an expired row is already
 * ignored by `entitlement()`). Stops starting notices at `deadline`.
 */
export async function runEntitlementsJob(now: Date = new Date(), opts: { deadline?: number } = {}): Promise<EntitlementsJobSummary> {
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const out: EntitlementsJobSummary = { boostsEnding: 0, notified: 0, deleted: 0, done: true };
  const horizon = new Date(now.getTime() + BOOST_ENDING_DAYS * 86_400_000);
  // tenancy: platform the hourly entitlements job (PLA-§9.4): boosts ending within 3 days across stores, ids, keys and expiries only
  const ending = await db
    .select({ storeId: storeEntitlements.storeId, key: storeEntitlements.key, source: storeEntitlements.source, expiresAt: storeEntitlements.expiresAt })
    .from(storeEntitlements)
    .where(and(eq(storeEntitlements.source, "boost"), gt(storeEntitlements.expiresAt, now), lte(storeEntitlements.expiresAt, horizon)))
    .limit(ENDING_BATCH + 1);
  for (const row of ending.slice(0, ENDING_BATCH)) {
    if (!row.expiresAt || !boostEndingDue(row, now)) continue;
    if (Date.now() >= deadline) {
      out.done = false;
      break;
    }
    out.boostsEnding++;
    const sent = await notify({ audience: "store_role", storeId: row.storeId, roles: ["owner", "admin"] }, "plan.boost_ending", { key: row.key, until: row.expiresAt.toISOString() }, { dedupeKey: boostEndingKey(row.storeId, row.key, row.expiresAt) });
    if ("id" in sent) out.notified++;
  }
  if (ending.length > ENDING_BATCH) out.done = false;
  // tenancy: platform the hourly entitlements job (PLA-§9.4): delete override / boost rows expired for 30 days, every store
  const [res] = await db.delete(storeEntitlements).where(lt(storeEntitlements.expiresAt, purgeBefore(now)));
  out.deleted = res.affectedRows;
  return out;
}
