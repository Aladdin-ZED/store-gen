/**
 * Cost, credits and the reservation plan (P7 AI; ai.md AI-§C.1, AI-§C.2 steps 1-2, AI-§C.3, AI-D11, AI-D34). Pure and
 * isomorphic; integers only: cost in micros (1 USD = 1,000,000 micros) and credits (1 credit = $0.01 = 10,000 micros).
 *
 *   - `costMicros`: Σ over `usage.iterations`, each at its own model's price row (a fallback iteration bills at the
 *     serving model's row), × 0.5 for a Batch, × 2 for fast mode, rounded up. With prices in USD per million tokens,
 *     one token costs exactly `price` micros, so the sum is exact in integer arithmetic (prices kept to 1/10,000 of a
 *     dollar per MTok).
 *   - `estimate`: the p90 reservation of AI-§C.2 step 1 (never `max_tokens`).
 *   - the limits: the daily credits, the Director share, the pending share, the platform cap.
 *   - `planReservation`: the counters a call charges, in the AI-§C.2 order, which `reserve` (quota/reserve.ts) walks.
 */
import type { UsageMetricName, PlatformUsageMetric } from "@/lib/tenancy/entitlement-keys";
import { LONG_PROMPT_PRICING, type PriceRowValue, type PriceTable } from "@/lib/settings/keys/platform_ai";
import { TASKS, type AiTaskId, type TaskDef } from "../tasks";

export const MICROS_PER_CREDIT = 10_000;
export const MICROS_PER_USD = 1_000_000;
/** price precision: 1/10,000 USD per MTok */
const PRICE_SCALE = 10_000;

/** One billed attempt (`usage.iterations[i]`, or the top-level usage when the API sends none). */
export interface UsageIteration {
  model: string;
  inTok: number;
  outTok: number;
  cacheReadTok: number;
  /** `usage.cache_creation` when the API splits the writes by TTL */
  cacheWrite5mTok?: number;
  cacheWrite1hTok?: number;
  /** the unsplit total, priced at the TTL the request asked for */
  cacheWriteTok?: number;
}

export interface CostOpts {
  batch: boolean;
  fast: boolean;
  /** the TTL of the request's breakpoints, for unsplit cache writes */
  writeTtl: "5m" | "1h";
}

/** The row for a model, or the most expensive row on file with `missing: true` (AI-§B.2: the red "price missing" chip). */
export function priceRowFor(model: string, prices: PriceTable): { row: PriceRowValue; missing: boolean } {
  const known = prices[model];
  if (known) return { row: known, missing: false };
  const rows = Object.values(prices);
  if (rows.length === 0) throw new Error("ai cost: no price row on file");
  const dearest = rows.reduce((a, b) => (b.out > a.out || (b.out === a.out && b.in > a.in) ? b : a));
  return { row: dearest, missing: true };
}

const scaled = (perMtok: number) => Math.round(perMtok * PRICE_SCALE);
const tok = (n: number | undefined) => (Number.isFinite(n) && (n as number) > 0 ? Math.floor(n as number) : 0);

/** The cost of a call in micros, rounded up; the models with no row are reported. */
export function costMicros(iterations: readonly UsageIteration[], prices: PriceTable, opts: CostOpts): { micros: number; missing: string[] } {
  let scaledMicros = 0;
  const missing: string[] = [];
  for (const it of iterations) {
    const { row, missing: miss } = priceRowFor(it.model, prices);
    if (miss && !missing.includes(it.model)) missing.push(it.model);
    const split = it.cacheWrite5mTok !== undefined || it.cacheWrite1hTok !== undefined;
    const cw5 = split ? tok(it.cacheWrite5mTok) : opts.writeTtl === "5m" ? tok(it.cacheWriteTok) : 0;
    const cw1h = split ? tok(it.cacheWrite1hTok) : opts.writeTtl === "1h" ? tok(it.cacheWriteTok) : 0;
    const promptTok = tok(it.inTok) + tok(it.cacheReadTok) + cw5 + cw1h;
    const long = LONG_PROMPT_PRICING[it.model];
    const factor = long && promptTok > long.aboveTokens ? long.factor : 1;
    scaledMicros +=
      factor *
      (tok(it.inTok) * scaled(row.in) +
        tok(it.outTok) * scaled(row.out) +
        tok(it.cacheReadTok) * scaled(row.cacheRead) +
        cw5 * scaled(row.cacheWrite5m) +
        cw1h * scaled(row.cacheWrite1h));
  }
  const numerator = scaledMicros * (opts.fast ? 2 : 1);
  const denominator = PRICE_SCALE * (opts.batch ? 2 : 1);
  return { micros: Math.ceil(numerator / denominator), missing };
}

/** Credits charged for a cost: ⌈micros / 10,000⌉; 0 for a cache hit, a local or a library run. */
export function creditsFor(micros: number): number {
  return micros > 0 ? Math.ceil(micros / MICROS_PER_CREDIT) : 0;
}

/** The token cost of one image at its sent size (AI-§A.8.4, [web]): ⌈w/28⌉ × ⌈h/28⌉ (1,369 for 1,024 × 1,024). */
export function imageTokens(w: number, h: number): number {
  return Math.ceil(Math.max(1, w) / 28) * Math.ceil(Math.max(1, h) / 28);
}
/** the per-image tokens before the probe measured them (a 1,024 px square) */
export const DEFAULT_IMAGE_TOKENS = imageTokens(1_024, 1_024);

export interface EstimateOpts {
  batch: boolean;
  fast: boolean;
  /** pattern B: every stage of the plan is reserved up front */
  stages?: number;
  model: string;
  prices: PriceTable;
  /** the probed per-image tokens (probe line 5); default ⌈1,024/28⌉² */
  imageTokens?: number;
}

/** Characters of the input's text, images excluded (`data` of an image block). */
function textChars(input: unknown): number {
  let n = 0;
  const walk = (v: unknown, key: string | null): void => {
    if (typeof v === "string") {
      if (key !== "data") n += v.length;
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, null));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k);
  };
  walk(input, null);
  return n;
}

function imagesIn(input: unknown): number {
  const imgs = (input as { images?: unknown } | null)?.images;
  return Array.isArray(imgs) ? imgs.length : 0;
}

/**
 * The p90 reservation of one call (AI-§C.2 step 1): input tokens = the larger of the task's p90 and the actual text at
 * 4 characters per token plus the images at the probed per-image tokens; output = the task's p90 (never `max_tokens`,
 * which would over-reserve 5-10×); the cached share at the cache-read price (the AI-§A.2 cost column). Pattern B
 * multiplies by its stages.
 */
export function estimate(task: AiTaskId, input: unknown, opts: EstimateOpts): { micros: number; credits: number } {
  const def: TaskDef = TASKS[task];
  const perImage = opts.imageTokens ?? DEFAULT_IMAGE_TOKENS;
  const actualIn = Math.ceil(textChars(input) / 4) + imagesIn(input) * perImage;
  const inTok = Math.max(def.estimate.inTok, actualIn);
  const one = costMicros([{ model: opts.model, inTok, outTok: def.estimate.outTok, cacheReadTok: def.estimate.cachedTok }], opts.prices, {
    batch: opts.batch,
    fast: opts.fast,
    writeTtl: "1h",
  }).micros;
  const micros = one * Math.max(1, Math.floor(opts.stages ?? 1));
  return { micros, credits: creditsFor(micros) };
}

/* ------------------------------------------------------------------ */
/* Limits (AI-§C.1, AI-§C.2, AI-§C.3)                                  */
/* ------------------------------------------------------------------ */

/** whole USD cents of a USD amount (`dailyUsdPerStore` 1.1 → 110) */
const cents = (usd: number) => Math.round(usd * 100);

/**
 * The store's daily credit limit: max(floor, ⌈monthly × storeDailyCapPct / 100⌉), the floor 50 for an approved store and
 * `pendingDailyFloor` (10) for a pending one, capped by `dailyUsdPerStore` × 100 when set; null when the month is
 * unlimited (`internal`).
 */
export function dailyCreditLimit(i: { monthly: number | null; storeDailyCapPct: number; dailyUsdPerStore: number | null; pending: boolean; pendingDailyFloor: number }): number | null {
  if (i.monthly === null) return i.dailyUsdPerStore === null ? null : cents(i.dailyUsdPerStore);
  const floor = i.pending ? i.pendingDailyFloor : 50;
  const base = Math.max(floor, Math.ceil((i.monthly * i.storeDailyCapPct) / 100));
  return i.dailyUsdPerStore === null ? base : Math.min(base, cents(i.dailyUsdPerStore));
}

/** The Director's share of the store's month (QUAL-34): ⌊monthly × directorSharePct / 100⌋ (180 of 300 at 60 %). */
export function directorShareLimit(monthly: number | null, directorSharePct: number): number | null {
  return monthly === null ? null : Math.floor((monthly * directorSharePct) / 100);
}

/** The platform cap in micros (`caps.monthlyUsd` × 1e6); null = no cap (cloud off, `no_cap`). */
export function platformCapMicros(monthlyUsd: number | null): number | null {
  return monthlyUsd === null ? null : cents(monthlyUsd) * (MICROS_PER_USD / 100);
}

/** The pending stores' slice of the platform cap in micros (SEC-26): monthlyUsd × pendingSharePct / 100 × 1e6. */
export function pendingShareMicros(monthlyUsd: number | null, pendingSharePct: number): number | null {
  const cap = platformCapMicros(monthlyUsd);
  return cap === null ? null : Math.floor((cap * pendingSharePct) / 100);
}

/* ------------------------------------------------------------------ */
/* The reservation planner (AI-§C.2 step 2)                            */
/* ------------------------------------------------------------------ */

export type ReservationKey = "store" | "day" | "director" | "pass" | "platform" | "pending";

export interface CounterCharge {
  key: ReservationKey;
  scope: "store" | "platform";
  metric: UsageMetricName | PlatformUsageMetric;
  /** what the amount is counted in */
  unit: "credits" | "micros" | "passes";
  /** reconcile and release touch it (a pass is one unit whatever it cost, never reconciled) */
  reconciled: boolean;
  /** the refusal when the counter is at its limit */
  refusal: "quota_store" | "quota_day" | "quota_director" | "quota_platform" | "quota_platform_pending";
}

/**
 * The counters a call charges, in order (a refusal at step k refunds steps < k): store month → store day → the
 * Director share (a Director-pass task) → the pass counter (only the first stage of a pass) → platform month → the
 * pending share (a pending store). A platform-paid call (eval) charges only the platform month.
 */
export function planReservation(i: { task: AiTaskId; payer?: "store" | "platform"; pending: boolean; passCharged: boolean }): CounterCharge[] {
  const def = TASKS[i.task];
  const payer = i.payer ?? def.payer;
  const platform: CounterCharge = { key: "platform", scope: "platform", metric: "ai_cost_micros", unit: "micros", reconciled: true, refusal: "quota_platform" };
  if (payer === "platform") return [platform];
  const plan: CounterCharge[] = [
    { key: "store", scope: "store", metric: "ai_credits", unit: "credits", reconciled: true, refusal: "quota_store" },
    { key: "day", scope: "store", metric: "ai_credits_day", unit: "credits", reconciled: true, refusal: "quota_day" },
  ];
  const pass = def.caps?.passCounter;
  if (pass) {
    plan.push({ key: "director", scope: "store", metric: "ai_credits_director", unit: "credits", reconciled: true, refusal: "quota_director" });
    if (!i.passCharged) {
      plan.push({ key: "pass", scope: "store", metric: pass === "deep" ? "ai_deep_passes" : "ai_director_passes", unit: "passes", reconciled: false, refusal: "quota_day" });
    }
  }
  plan.push(platform);
  if (i.pending) plan.push({ key: "pending", scope: "platform", metric: "ai_cost_micros_pending", unit: "micros", reconciled: true, refusal: "quota_platform_pending" });
  return plan;
}

/** `Reservation.keys` (AI-§C.2): which counters a plan charged. */
export function reservationKeys(plan: readonly CounterCharge[]): Record<ReservationKey, boolean> {
  const keys: Record<ReservationKey, boolean> = { store: false, day: false, director: false, pass: false, platform: false, pending: false };
  for (const c of plan) keys[c.key] = true;
  return keys;
}

/** What reconcile does on the reconciled counters: refund the difference or charge the excess with `allowOver`. */
export function reconcileDelta(reserved: { micros: number; credits: number }, actual: { micros: number; credits: number }): {
  credits: { refund: number; charge: number };
  micros: { refund: number; charge: number };
} {
  const dc = actual.credits - reserved.credits;
  const dm = actual.micros - reserved.micros;
  return {
    credits: { refund: dc < 0 ? -dc : 0, charge: dc > 0 ? dc : 0 },
    micros: { refund: dm < 0 ? -dm : 0, charge: dm > 0 ? dm : 0 },
  };
}
