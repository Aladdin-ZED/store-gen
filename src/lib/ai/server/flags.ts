import "server-only";
/**
 * The AI release flags for one store (P7 AI; ai.md AI-§A.2 `TaskDef.flag`, AI-§A.4 `live` and `cloud.director`;
 * docs/STORE-SAAS.md §D.4 `flagValue`, PLA-§12.2). The core's `flagValue(key, ctx)` is P1's; until it lands the AI
 * layer resolves its own boolean release flags with the same §D.4 order: override user > store > plan > market → the
 * first matching rule (its rollout bucket = `parseInt(sha256(key + ":" + (storeId ?? userId))[0..7], 16) % 100`) →
 * `default_value` → the declared default (false: every AI release flag ships off). The kill switch
 * `ai_generation_enabled` is not read here: it is the core's `activeKillSwitches()` (30 s cache).
 *
 * The rows are platform data (`flags`, `flag_overrides` are P tables), read once per 30 s per process.
 */
import { createHash } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { flagOverrides, flags, type FlagRule } from "@/lib/db/schema";
import { flagDef } from "@/lib/flags/registry";
import { scopedCache } from "@/lib/tenancy/cache";
import type { StoreRow } from "@/lib/tenancy/types";
import { AI_FLAG_COPILOT, AI_FLAG_DIRECTOR_BRIEF, AI_FLAG_RISK_V2 } from "../tasks";

/** Every boolean flag the AI layer gates on (the registry's task flags, the `after()` driver, R3's learned priors). */
export const AI_RELEASE_FLAGS = [AI_FLAG_DIRECTOR_BRIEF, "ai_detached_jobs", AI_FLAG_COPILOT, "ai_learned_priors", AI_FLAG_RISK_V2] as const;
export type AiReleaseFlag = (typeof AI_RELEASE_FLAGS)[number];

interface FlagRows {
  rows: { key: string; value: unknown; rules: FlagRule[] | null; archived: boolean }[];
  overrides: { key: string; scope: "store" | "user" | "plan" | "market"; scopeId: string; value: unknown; expiresAt: Date | null }[];
}

const cache = scopedCache<FlagRows>({ name: "ai-flags", maxEntries: 1, ttlMs: 30_000 });

async function loadRows(): Promise<FlagRows> {
  const keys = [...AI_RELEASE_FLAGS];
  const [rows, overrides] = await Promise.all([
    db.select({ key: flags.key, value: flags.defaultValue, rules: flags.rules, archived: flags.archived }).from(flags).where(inArray(flags.key, keys)),
    db.select({ key: flagOverrides.flagKey, scope: flagOverrides.scope, scopeId: flagOverrides.scopeId, value: flagOverrides.value, expiresAt: flagOverrides.expiresAt }).from(flagOverrides).where(inArray(flagOverrides.flagKey, keys)),
  ]);
  return { rows, overrides };
}

/** What a rule and an override can match. */
export interface FlagSubject {
  storeId: string;
  userId: string | null;
  store: Pick<StoreRow, "planId" | "mode" | "market" | "status">;
  platformRole: string | null;
}

const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

function bucket(key: string, id: string): number {
  return parseInt(createHash("sha256").update(`${key}:${id}`).digest("hex").slice(0, 8), 16) % 100;
}

/** §D.4 resolution of one boolean flag (pure over the rows). */
export function resolveFlag(key: string, s: FlagSubject, data: FlagRows, now = Date.now()): boolean {
  const live = data.overrides.filter((o) => o.key === key && (o.expiresAt === null || o.expiresAt.getTime() > now));
  const pick = (scope: FlagRows["overrides"][number]["scope"], id: string | null) => (id === null ? null : bool(live.find((o) => o.scope === scope && o.scopeId === id)?.value));
  const over = pick("user", s.userId) ?? pick("store", s.storeId) ?? pick("plan", s.store.planId) ?? pick("market", s.store.market);
  if (over !== null) return over;
  const row = data.rows.find((r) => r.key === key && !r.archived);
  for (const rule of row?.rules ?? []) {
    const w = rule.when ?? {};
    if (w.plans && !w.plans.includes(s.store.planId)) continue;
    if (w.modes && !w.modes.includes(s.store.mode)) continue;
    if (w.markets && !w.markets.includes(s.store.market)) continue;
    if (w.storeStatus && !w.storeStatus.includes(s.store.status)) continue;
    if (w.platformRoles && !(s.platformRole && (w.platformRoles as readonly string[]).includes(s.platformRole))) continue;
    if (typeof rule.rollout === "number" && bucket(key, s.storeId) >= rule.rollout) continue;
    const v = bool(rule.value);
    if (v !== null) return v;
  }
  return bool(row?.value) ?? bool(flagDef(key)?.default) ?? false;
}

/** The AI release flags on for this subject (cached rows, 30 s). */
export async function aiFlagsFor(s: FlagSubject): Promise<Set<AiReleaseFlag>> {
  const data = await cache.getOrLoad("p", "rows", loadRows);
  return new Set(AI_RELEASE_FLAGS.filter((k) => resolveFlag(k, s, data)));
}

/** Drops the cached rows (a console flag write; the 30 s TTL otherwise). */
export function invalidateAiFlags(): void {
  cache.clear();
}
