import "server-only";
/**
 * The AI read APIs other tracks call (P7 AI; ai.md AI-§K.4, AI-§O, AI R13, R18, R38; platform.md PLA Q.11, Q4.11;
 * docs/STORE-SAAS.md §H.5, §I.7, §K.2 P0 ai stubs): metadata only, never a prompt, an output or customer data.
 *   - `aiUsageForStore(scope, month)`: the store's credits and cost of a month (P1's console queue chip and Store
 *     Health inputs); `creditsLimit` is the pending cap while the store is `pending`;
 *   - `aiStoreSummary(ctx, storeId)`: the console store profile's AI tab (P1 mounts P7's component);
 *   - `aiHealth()`: the "AI" section of P8's `getHealth` and its alarms.
 * Frozen at P0 (src/lib/contracts/r1-p0.ts). P0 stubs: `aiUsageForStore` answers what is true before P7 writes any
 * `ai_runs` row (nothing used, no cost) and no limit it would have to invent (`creditsLimit: null`); `aiStoreSummary` and
 * `aiHealth` throw, because their answers (modes, key source, class states) are P7's to read; P8's `getHealth` keeps
 * its `ai` section `null` until then.
 */
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import type { AiProviderId, AiTaskId, TaskClass } from "./tasks";

/** One month of a store's AI use (PLA Q.11, Q4.11). */
export interface AiUsageSummary {
  /** "YYYY-MM" */
  month: string;
  creditsUsed: number;
  /** the store's monthly credits (the pending cap while `pending`); null = no limit known */
  creditsLimit: number | null;
  /** 1 USD = 1,000,000 micros */
  costMicros: number;
}

/** The console store profile's AI tab (AI-§K.4): metadata only. */
export interface AiStoreSummary {
  storeId: string;
  mode: "auto" | "local" | "server";
  director: "auto" | "ask" | "off" | null;
  deepPass: boolean;
  credits: { month: { used: number; limit: number | null }; day: { used: number; limit: number | null }; boosts: number };
  passesToday: { director: number; deep: number };
  costMicrosMonth: number;
  runs: { by: "task" | "class" | "provider"; key: string; n: number; p50Ms: number | null; p95Ms: number | null; refusals: number; fallbacks: number }[];
  /** guard rejections per task and field (the heat-map) */
  rejections: { task: AiTaskId; field: string; n: number }[];
  openJobs: number;
  /** the last 50 runs */
  recent: { id: string; at: string; task: AiTaskId; class: TaskClass | null; provider: AiProviderId; model: string | null; status: string; credits: number; ms: number | null }[];
  learning: { learn: boolean; share: boolean };
}

/** The "AI" section of the platform health (AI-§O, PLA-§15.1 AI panel row). */
export interface AiHealth {
  keySource: "env" | "settings" | "none";
  enabled: boolean;
  classes: { class: TaskClass; state: "ok" | "paused" | "unavailable"; model: string | null; fallbacks24h: number }[];
  breaker: "closed" | "open" | "half_open";
  transport: "stream" | "poll";
  deepTransport: "job" | "batch";
  lastOkAt: string | null;
  batches: { open: number; oldestAgeMin: number | null };
  jobs: { running: number; orphaned: number; failed24h: number; drivers: Partial<Record<"after" | "poll" | "cron" | "batch", number>> };
  spend: { monthMicros: number; capMicros: number | null; usedPct: number | null; pendingSliceUsedPct: number | null };
  refusalRate24h: number | null;
  errorsLastHour: number;
  directorShareRefusals24h: number;
  canary: { promptVersion: string } | null;
  detachedJobs: { flag: boolean; probedAt: string | null };
}

export async function aiUsageForStore(scope: StoreScope, month: string): Promise<AiUsageSummary> {
  void scope;
  return { month, creditsUsed: 0, creditsLimit: null, costMicros: 0 };
}

export async function aiStoreSummary(ctx: PlatformCtx, storeId: string): Promise<AiStoreSummary> {
  void ctx;
  void storeId;
  throw new Error("not implemented: P7 aiStoreSummary");
}

export async function aiHealth(): Promise<AiHealth> {
  throw new Error("not implemented: P7 aiHealth");
}
