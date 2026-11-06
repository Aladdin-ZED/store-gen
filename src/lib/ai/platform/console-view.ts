/**
 * Console → AI view helpers (P7 AI; ai.md AI-§K.2, AI-§O, AI-§F.8, AI-§F.9; docs/STORE-SAAS.md §I.8): pure, shared by
 * the loaders (./console-read.ts), the summaries (./summary.ts) and the pages.
 *   - the tabs and their paths;
 *   - the month forecast (`mtd / elapsed days × days in month`, AI-§O cost dashboard), labelled as a straight line;
 *   - p50 / p95 from the 12 log buckets of `ai_usage_daily.ms_hist` (the bucket's upper edge, "> 90 s" for the last);
 *   - the ten KPIs of AI-§F.9 with the minimum each needs before it shows a number (never a number without data);
 *   - the quarter labels of the KPI card.
 */
import { MS_BUCKETS } from "../store/usage-rows";

export const CONSOLE_TABS = ["overview", "classes", "prices", "prompts", "stores", "quality", "batches", "settings"] as const;
export type ConsoleTab = (typeof CONSOLE_TABS)[number];

export const tabHref = (t: ConsoleTab): `/${string}` => (t === "overview" ? "/admin/ai" : `/admin/ai/${t}`);

/** The console paths the panels link to (the components build none by hand, lint L8 / ADM-37). */
export const consoleHref = {
  setKey: "/admin/ai/settings#key",
  flags: "/admin/flags",
  batches: "/admin/ai/batches",
  stores: (plan?: string | null): `/${string}` => (plan ? `/admin/ai/stores?plan=${encodeURIComponent(plan)}` : "/admin/ai/stores"),
  store: (storeId: string): `/${string}` => `/admin/ai/stores/${encodeURIComponent(storeId)}`,
} as const;

/** A gate run counts for 14 days on the family's current fixtures hash (AI-§F.6). */
export const EVAL_MAX_AGE_DAYS = 14;
/** "targets assume ≥ 150 tok/s" on the Director classes (AI-§P); below 80 the critique runs as a job stage. */
export const TOK_PER_SEC_TARGET = 150;
/** A running job whose heartbeat is older than this is an orphan (AI-§P "orphan at 60 s"). */
export const ORPHAN_AFTER_MS = 60_000;
/** The pending stores' share alarm thresholds (AI-§O). */
export const PENDING_SHARE_WARN_PCT = 80;

/** a / b, or null when b is 0 (a rate never shows without its n). */
export const rateOf = (n: number, d: number): number | null => (d > 0 ? n / d : null);

/** The UTC month's straight-line forecast: month-to-date ÷ elapsed days × days in the month. */
export function monthForecast(mtdMicros: number, now: Date): { forecastMicros: number; elapsedDays: number; daysInMonth: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const start = Date.UTC(y, m, 1);
  // a partial day counts as elapsed in proportion, never below one hour (no forecast blown up on the 1st at 00:05)
  const elapsedDays = Math.max(1 / 24, (now.getTime() - start) / 86_400_000);
  return { forecastMicros: Math.round((mtdMicros / elapsedDays) * daysInMonth), elapsedDays, daysInMonth };
}

/** Adds histogram `h` into `into` (12 buckets), returning `into`. */
export function addHist(into: number[], h: readonly number[] | null | undefined): number[] {
  if (!h) return into;
  for (let i = 0; i < h.length; i++) into[i] = (into[i] ?? 0) + (Number(h[i]) || 0);
  return into;
}

export const emptyHist = (): number[] => Array.from({ length: MS_BUCKETS.length + 1 }, () => 0);

/**
 * The q-quantile of a latency histogram as its bucket's upper edge in ms (the last bucket, above 90 s, answers
 * Infinity); null without samples.
 */
export function histQuantile(hist: readonly number[], q: number): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const target = Math.max(1, Math.ceil(total * q));
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    seen += hist[i] ?? 0;
    if (seen >= target) return i < MS_BUCKETS.length ? MS_BUCKETS[i]! : Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}

/** Exact quantile of raw samples (the store tab reads raw `ms`); null without samples. */
export function quantile(values: readonly number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(s.length * q) - 1))]!;
}

/** "2026-Q4" for a UTC date. */
export const quarterOf = (d: Date): string => `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;

/** The current quarter and the three before it, newest first. */
export function lastQuarters(now: Date, k = 4): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = [];
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3);
  for (let i = 0; i < k; i++) {
    const start = new Date(Date.UTC(y, q * 3, 1));
    const end = new Date(Date.UTC(y, q * 3 + 3, 1));
    out.push({ label: `${y}-Q${q + 1}`, start, end });
    q -= 1;
    if (q < 0) {
      q = 3;
      y -= 1;
    }
  }
  return out;
}

/** The ten numbers of AI-§F.9 and the minimum each needs (shown as "needs data · <minimum>" until it is met). */
export const KPI_IDS = ["keep_rate", "edit_ratio", "regenerate", "win_rate", "slop", "distinctness", "market_effect", "cost_per_accepted", "naturalness", "director_lift"] as const;
export type KpiId = (typeof KPI_IDS)[number];

export interface KpiCell {
  /** null = needs data (the minimum is shown instead) */
  value: number | null;
  /** the sample behind the value (runs, labels, pairs) */
  n: number;
}

export interface KpiRow {
  id: KpiId;
  unit: "pct" | "ratio" | "usd" | "score";
  /** what has to exist before a number is shown */
  minimum: number;
  /** newest quarter first, aligned with `lastQuarters()` */
  cells: KpiCell[];
}

/** The minimum sample of each KPI; 0 = not measurable in R1 (its data source arrives later, the cell says so). */
export const KPI_MINIMUM: Readonly<Record<KpiId, number>> = {
  keep_rate: 0,
  edit_ratio: 0,
  regenerate: 50,
  win_rate: 1,
  slop: 0,
  distinctness: 0,
  market_effect: 0,
  cost_per_accepted: 20,
  naturalness: 40,
  director_lift: 60,
};

export const KPI_UNIT: Readonly<Record<KpiId, KpiRow["unit"]>> = {
  keep_rate: "pct",
  edit_ratio: "ratio",
  regenerate: "ratio",
  win_rate: "pct",
  slop: "score",
  distinctness: "score",
  market_effect: "pct",
  cost_per_accepted: "usd",
  naturalness: "score",
  director_lift: "pct",
};

/** A cell whose sample is below the minimum shows no number. */
export const kpiCell = (id: KpiId, value: number | null, n: number): KpiCell => ({ value: KPI_MINIMUM[id] > 0 && n >= KPI_MINIMUM[id] && value !== null && Number.isFinite(value) ? value : null, n });

/** The preference test that unlocks "Auto by default" (AI-19 acceptance (10), AI-§F.9 #10). */
export const PREFERENCE_PASS_LOWER_BOUND = 0.55;
/** The launch naturalness slice (AI-§F.5, QUAL-30): 40 labels, mean ≥ 4.0, none below 3. */
export const NATURALNESS_SLICE = { cases: 40, mean: 4, floor: 3 } as const;

export function naturalnessVerdict(scores: readonly number[]): { mean: number | null; min: number | null; pass: boolean } {
  if (!scores.length) return { mean: null, min: null, pass: false };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  return { mean: Math.round(mean * 100) / 100, min, pass: scores.length >= NATURALNESS_SLICE.cases && mean >= NATURALNESS_SLICE.mean && min >= NATURALNESS_SLICE.floor };
}

/** Whole days between two instants (floored). */
export const daysBetween = (from: Date, to: Date): number => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
