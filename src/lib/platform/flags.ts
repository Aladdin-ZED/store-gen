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
 */
import { db } from "@/lib/db/client";
import { flagOverrides, flags } from "@/lib/db/schema";
import { flagDef, isKillKey, type FlagDef, type FlagRule, type FlagValue } from "@/lib/flags/registry";
import { scopedCache } from "@/lib/tenancy/cache";
import { resolveFlag, type FlagContext, type FlagOverrideState, type FlagRowState } from "./flag-eval";
import { recordPlatformError } from "./log";

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
