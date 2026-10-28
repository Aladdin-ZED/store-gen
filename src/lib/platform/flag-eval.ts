/**
 * Flag resolution, pure (platform.md PLA-§12.2, PL-12): the order `flagValue()` (src/lib/platform/flags.ts) applies to
 * one flag's row and overrides, kept apart from the cached read so `test:platform` runs it without a database.
 *
 * The first value that exists and fits the flag's type:
 *   1. an override, user > store > plan > market, not expired;
 *   2. the first rule whose conditions all hold (a condition the context cannot answer does not hold) and whose
 *      rollout, when set, takes the context: bucket = parseInt(sha256(key + ":" + (storeId ?? userId ?? ""))[0..7], 16)
 *      % 100 < rollout, so a store stays in or out of a 20 % rollout on every evaluation;
 *   3. the row's `default_value`;
 *   4. the declaration's `default`.
 */
import { createHash } from "node:crypto";
import type { PlatformRole } from "@/lib/auth/permissions";
import type { FlagDef, FlagRule, FlagValue } from "@/lib/flags/registry";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";

export interface FlagContext {
  storeId?: string;
  userId?: string;
  planId?: string;
  mode?: StoreMode;
  market?: string;
  storeStatus?: StoreStatus;
  platformRole?: PlatformRole | "none";
}

export type FlagType = FlagDef["type"];
export type OverrideScope = "user" | "store" | "plan" | "market";

/** One `flags` row as the resolver reads it. */
export interface FlagRowState {
  key: string;
  kind: "release" | "ops" | "kill" | "experiment";
  type: FlagType;
  defaultValue: unknown;
  rules: FlagRule[] | null;
  archived: boolean;
}

/** One `flag_overrides` row. */
export interface FlagOverrideState {
  flagKey: string;
  scope: OverrideScope;
  scopeId: string;
  value: unknown;
  expiresAt: Date | null;
}

/** Where a resolved value came from (the console's "why" line). */
export type FlagSource = `override:${OverrideScope}` | `rule:${number}` | "row" | "code";

/** user > store > plan > market (PLA-§12.2) */
export const OVERRIDE_ORDER: readonly OverrideScope[] = ["user", "store", "plan", "market"];

/** The context's id for an override scope. */
function scopeIdOf(scope: OverrideScope, ctx: FlagContext): string | undefined {
  return scope === "user" ? ctx.userId : scope === "store" ? ctx.storeId : scope === "plan" ? ctx.planId : ctx.market;
}

/** Does `value` have the flag's type? (`json` = a plain object.) */
export function valueFits(type: FlagType, value: unknown): value is FlagValue {
  switch (type) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "json":
      return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

/** The rollout bucket 0-99 of a flag for a store (or a user without a store). Stable across processes. */
export function rolloutBucket(key: string, ctx: FlagContext): number {
  const hex = createHash("sha256").update(`${key}:${ctx.storeId ?? ctx.userId ?? ""}`, "utf8").digest("hex");
  return parseInt(hex.slice(0, 8), 16) % 100;
}

const holds = <T>(list: readonly T[] | undefined, value: T | undefined) => list === undefined || (value !== undefined && list.includes(value));

/** Every condition of the rule holds for the context (an empty `when` always holds). */
export function ruleMatches(rule: FlagRule, ctx: FlagContext): boolean {
  const w = rule.when ?? {};
  const role = ctx.platformRole === "none" ? undefined : ctx.platformRole;
  return holds(w.plans, ctx.planId) && holds(w.modes, ctx.mode) && holds(w.markets, ctx.market) && holds(w.storeStatus, ctx.storeStatus) && holds(w.platformRoles, role);
}

/** Is the context inside the rule's rollout? (No rollout = everyone; 0 = no one; 100 = everyone.) */
export function inRollout(key: string, rule: FlagRule, ctx: FlagContext): boolean {
  if (rule.rollout === undefined || rule.rollout === null) return true;
  const pct = Math.max(0, Math.min(100, Math.floor(rule.rollout)));
  return rolloutBucket(key, ctx) < pct;
}

/**
 * The value of one flag for a context (the order of the header). `type` is the declaration's, else the row's; a
 * value of another type is skipped. Null when nothing answers (no row, no declaration).
 */
export function resolveFlag(
  key: string,
  ctx: FlagContext,
  state: { def?: FlagDef; row?: FlagRowState; overrides: readonly FlagOverrideState[]; now: Date },
): { value: FlagValue; source: FlagSource } | null {
  const type: FlagType = state.def?.type ?? state.row?.type ?? "boolean";
  const live = state.overrides.filter((o) => o.flagKey === key && (o.expiresAt === null || o.expiresAt.getTime() > state.now.getTime()));
  for (const scope of OVERRIDE_ORDER) {
    const id = scopeIdOf(scope, ctx);
    if (id === undefined) continue;
    const hit = live.find((o) => o.scope === scope && o.scopeId === id);
    if (hit && valueFits(type, hit.value)) return { value: hit.value, source: `override:${scope}` };
  }
  const rules = Array.isArray(state.row?.rules) ? state.row.rules : [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (ruleMatches(rule, ctx) && inRollout(key, rule, ctx) && valueFits(type, rule.value)) return { value: rule.value, source: `rule:${i}` };
  }
  if (state.row && valueFits(type, state.row.defaultValue)) return { value: state.row.defaultValue, source: "row" };
  if (state.def) return { value: state.def.default, source: "code" };
  return null;
}
