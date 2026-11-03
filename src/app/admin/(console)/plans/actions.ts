"use server";
/**
 * Plan actions of the console (P1 CONSOLE; platform.md PLA-§9.1, §9.2, §M.1). A platform action file (lint L9):
 * `plans.manage` (super_admin). The plan editor's patch is checked at the boundary (one value per entitlement key:
 * a number, null for unlimited, a boolean, or "default"); src/lib/platform/plans.ts checks the keys and the rules.
 *
 *   const impact = await previewPlanChangeAction({ planId: "starter", patch: { pages_max: 5 } });   // read
 *   await savePlanAction({ planId: "starter", patch, opId });                                         // the same sheet's id
 */
import { z } from "zod";
import { FieldsError } from "@/lib/auth/errors";
import { done, opOf, withOp } from "@/lib/platform/op-dedupe";
import type { PlanImpact, PlanPatch, PlanStatus } from "@/lib/platform/plan-rules";
import { createPlan, previewPlanChange, savePlan, setPlanStatus } from "@/lib/platform/plans";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const Patch = z.record(z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/), z.union([z.number().finite(), z.null(), z.boolean(), z.literal("default")]));

function patchOf(input: unknown): PlanPatch {
  const raw = input && typeof input === "object" ? (input as { patch?: unknown }).patch : undefined;
  const parsed = Patch.safeParse(raw);
  if (!parsed.success || Object.keys(parsed.data).length > 100) throw new FieldsError({ patch: "console.plans.patch_invalid" });
  return parsed.data;
}

const planIdOf = (input: unknown): string => {
  const id = input && typeof input === "object" ? (input as { planId?: unknown }).planId : undefined;
  return typeof id === "string" ? id : "";
};

/** `plans.manage` (read): what saving the patch would do to the plan's stores (cached 60 s per patch). */
export async function previewPlanChangeAction(input: { planId: string; patch: PlanPatch }): Promise<ActionResult<PlanImpact>> {
  return platformAction("plans.manage", (ctx) => previewPlanChange(ctx, planIdOf(input), patchOf(input)));
}

/** `plans.manage`: the patch (and the name or order) saved; a repeat of the sheet's `opId` saves nothing (`saved: false`). */
export async function savePlanAction(input: { planId: string; patch: PlanPatch; opId: string; name?: string; sort?: number }): Promise<ActionResult<{ saved: boolean; stores: number }>> {
  return platformAction("plans.manage", async (ctx) => {
    const meta = { ...(typeof input?.name === "string" ? { name: input.name } : {}), ...(typeof input?.sort === "number" ? { sort: input.sort } : {}) };
    return done(await savePlan(ctx, planIdOf(input), patchOf(input), typeof input?.opId === "string" ? input.opId : "", meta));
  });
}

/** `plans.manage`: a new plan (`^[a-z][a-z0-9_]{1,31}$`), optionally a copy of another plan's values. */
export async function createPlanAction(input: { id: string; name: string; copyFrom?: string | null; status?: "active" | "hidden" } & { opId?: string }): Promise<ActionResult<{ id: string }>> {
  return platformAction("plans.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await createPlan(ctx, input))));
}

/** `plans.manage`: active, hidden (no new store) or retired (no store at all may stay on it). */
export async function setPlanStatusAction(input: { planId: string; status: PlanStatus } & { opId?: string }): Promise<ActionResult<{ changed: boolean }>> {
  return platformAction("plans.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await setPlanStatus(ctx, input))));
}
