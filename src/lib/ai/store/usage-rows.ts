/**
 * The daily usage rows of one store, computed from its run rows (P7 AI; ai.md AI-§M.2 `ai_usage_daily`, AI-§N
 * `ai.rollups`). Pure and isomorphic: ./usage-daily.ts reads the runs and upserts these rows; test:ai checks them.
 * One row per (store day, task, provider, model); the latency histogram has 12 log buckets (p50 / p95).
 */
import type { AiFlag } from "@/lib/db/schema";

/** The upper edges of the latency buckets, in ms (bucket 11 is everything above 90 s). */
export const MS_BUCKETS = [250, 500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 45_000, 60_000, 90_000] as const;

export const msBucket = (ms: number): number => {
  const i = MS_BUCKETS.findIndex((edge) => ms <= edge);
  return i < 0 ? MS_BUCKETS.length : i;
};

/** "YYYY-MM-DD" of an instant in a time zone. */
export function dayIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export interface RunLite {
  createdAt: Date;
  task: string;
  provider: "server" | "local" | "library";
  model: string | null;
  via: string;
  status: string;
  flags: AiFlag[] | null;
  rejectedFields: string[] | null;
  inTok: number | null;
  outTok: number | null;
  cacheReadTok: number | null;
  cacheWriteTok: number | null;
  costMicros: number | null;
  credits: number | null;
  ms: number;
}

export interface UsageRow {
  day: string;
  task: string;
  provider: "server" | "local" | "library";
  model: string;
  runs: number;
  ok: number;
  refused: number;
  fallbacks: number;
  invalid: number;
  errors: number;
  cacheHits: number;
  rejectedFields: number;
  inTok: number;
  outTok: number;
  cacheReadTok: number;
  cacheWriteTok: number;
  costMicros: number;
  credits: number;
  msSum: number;
  msHist: number[];
}

/** The rows of the given days from a store's runs (a running, quota or blocked run is counted, never as an error). */
export function usageRowsOf(runs: readonly RunLite[], timeZone: string, days: ReadonlySet<string>): UsageRow[] {
  const by = new Map<string, UsageRow>();
  for (const r of runs) {
    const day = dayIn(r.createdAt, timeZone);
    if (!days.has(day)) continue;
    const model = (r.model ?? "").slice(0, 64);
    const key = `${day}|${r.task}|${r.provider}|${model}`;
    let u = by.get(key);
    if (!u) {
      u = { day, task: r.task, provider: r.provider, model, runs: 0, ok: 0, refused: 0, fallbacks: 0, invalid: 0, errors: 0, cacheHits: 0, rejectedFields: 0, inTok: 0, outTok: 0, cacheReadTok: 0, cacheWriteTok: 0, costMicros: 0, credits: 0, msSum: 0, msHist: Array.from({ length: MS_BUCKETS.length + 1 }, () => 0) };
      by.set(key, u);
    }
    u.runs++;
    if (r.status === "ok") u.ok++;
    else if (r.status === "refused") u.refused++;
    else if (r.status === "invalid_output") u.invalid++;
    else if (r.status !== "running" && r.status !== "quota" && r.status !== "blocked") u.errors++;
    if (r.flags?.includes("fallback_model") || r.flags?.includes("director_fallback")) u.fallbacks++;
    if (r.via === "cache") u.cacheHits++;
    u.rejectedFields += r.rejectedFields?.length ?? 0;
    u.inTok += r.inTok ?? 0;
    u.outTok += r.outTok ?? 0;
    u.cacheReadTok += r.cacheReadTok ?? 0;
    u.cacheWriteTok += r.cacheWriteTok ?? 0;
    u.costMicros += r.costMicros ?? 0;
    u.credits += r.credits ?? 0;
    u.msSum += r.ms;
    u.msHist[msBucket(r.ms)]!++;
  }
  return [...by.values()];
}
