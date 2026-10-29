import "server-only";
/**
 * Plans, overrides and boosts from the console (platform.md PLA-§9, PL-11; core §A.4). Step 4 holds the grant
 * functions the queue's `resolveRequest` and the profile's Usage & plan tab call; the plan editor (`previewPlanChange`,
 * `savePlan`, PLA-§9.2) and the `platform.entitlements` job come with step 5.
 *
 *   await assignPlan(ctx, { storeId, planId: "growth", note });                       // entitlements.override
 *   await setEntitlement(ctx, { storeId, key: "media_bytes", source: "boost", value: 2 * GiB, expiresAt, reason });
 *   await clearEntitlement(ctx, { storeId, key: "media_bytes", source: "boost" });
 *
 * Writes: `stores.plan_id` (the store row, not a tenant table), the store's `store_subscriptions` and
 * `store_entitlements` rows through the system seam (a staff decision about the store, never a member's write), the
 * audit row, one store notification (`plan.changed`, `plan.boost_granted`; a caller that answers the store itself,
 * the queue's `request.answered`, passes `{ notify: false }`), `invalidateEntitlements`, `markHealthDirty`.
 * `take_orders` can never be overridden to false (PD8: orders are never blocked by a plan): `take_orders_locked`.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { plans, storeEntitlements, stores, storeSubscriptions } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { invalidateStore } from "@/lib/tenancy/cache";
import { ENTITLEMENTS, isEntitlementKey, type EntitlementKey } from "@/lib/tenancy/entitlement-keys";
import { invalidateEntitlements } from "@/lib/tenancy/entitlements";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, WriteScope } from "@/lib/tenancy/types";
import { markHealthDirty } from "./health-snapshot";
import { recordPlatformError } from "./log";
import { notify } from "./notify";
import { cleanText } from "./queue-rules";

const DAY = 86_400_000;
/** PLA-§9.4, §L: a boost needs an expiry, at most 90 days ahead */
export const BOOST_MAX_DAYS = 90;
/** PLA-§L: entitlement reasons */
export const ENTITLEMENT_REASON_MAX = 200;
const ID_RE = /^[0-9A-Z]{26}$/;
const PLAN_ID_RE = /^[a-z][a-z0-9_]{1,31}$/;

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
