/**
 * The tick's slot table (docs/STORE-SAAS.md §H.2, OS-08; R1 P8). Pure: no I/O, no clock, so test:jobs, the runner and
 * the console's Cron panel (PLA-§15.1, "ms vs budget") read the same numbers.
 *
 *   slotOf(job)                 → "1" … "9": the slot a registered job runs in (by name, else by `every`)
 *   SLOTS                       → the 11 slots in run order with their guaranteed budget (Σ = 95 s) and leftover caps
 *   jobBudgetProblems(JOBS)     → [] when every job has a budget > 0 that fits its slot (registry test, §J.1)
 *   dailyCollisions(JOBS)       → slot-6 windows holding more than two daily jobs ("no tick carries more than two")
 *
 * **Budget decision (P8 step 3, recorded in the P8 report):** a slot's budget is the guarantee, a job's `budgetMs` is
 * its cap inside the slot. A job starts with min(budgetMs, what is left of its slot, what is left of the tick); jobs
 * sharing a slot run in registry order and spend one allowance. Time a slot does not use is carried on, and only
 * slots 4c (`ai.jobs`, up to 5 s) and 9 (`platform.*`, up to 6 s, which also holds the 5 s the table leaves
 * unassigned) may spend it, so a job there that wants the leftover declares a `budgetMs` above the slot's own
 * budget: ≤ 6,000 in 4c, ≤ 9,000 in 9.
 */
import type { Job } from "./runner";

export type SlotId = "1" | "2" | "3" | "4" | "4b" | "4c" | "5" | "6" | "7" | "8" | "9";

export interface Slot {
  id: SlotId;
  /** what runs there (§H.2's "Slot" column), for logs and the Cron panel */
  label: string;
  /** the guaranteed slice (ms) */
  budgetMs: number;
  /** the most carried leftover the slot may add to its slice (ms); 0 = none */
  leftoverCapMs: number;
}

/** The §H.2 table in run order. The guaranteed slices sum to 95 s; the last 5 s of the 100 s tick is slot 9's leftover. */
export const SLOTS: readonly Slot[] = Object.freeze(
  (
    [
      { id: "1", label: "sheets.push", budgetMs: 18_000, leftoverCapMs: 0 },
      { id: "2", label: "sheets.pull", budgetMs: 12_000, leftoverCapMs: 0 },
      { id: "3", label: "outbox", budgetMs: 13_000, leftoverCapMs: 0 },
      { id: "4", label: "renders", budgetMs: 12_000, leftoverCapMs: 0 },
      { id: "4b", label: "ai.batches", budgetMs: 8_000, leftoverCapMs: 0 },
      { id: "4c", label: "ai.jobs", budgetMs: 1_000, leftoverCapMs: 5_000 },
      { id: "5", label: "exports, backup, purge, imports.commit", budgetMs: 11_000, leftoverCapMs: 0 },
      { id: "6", label: "nightly and hourly", budgetMs: 8_000, leftoverCapMs: 0 },
      { id: "7", label: "lifecycle and the small tick jobs", budgetMs: 5_000, leftoverCapMs: 0 },
      { id: "8", label: "housekeeping", budgetMs: 4_000, leftoverCapMs: 0 },
      { id: "9", label: "platform.*", budgetMs: 3_000, leftoverCapMs: 6_000 },
    ] satisfies Slot[]
  ).map((s) => Object.freeze(s)),
);

/** Σ of the guaranteed slices (95 s). */
export const GUARANTEED_MS = SLOTS.reduce((n, s) => n + s.budgetMs, 0);

/** The tick's default budget inside the route's 120 s cap (§H.2). */
export const TICK_BUDGET_MS = 100_000;

export function slotById(id: SlotId): Slot {
  return SLOTS.find((s) => s.id === id)!;
}

/**
 * Every job name the R1 parts register (and the R2 / R3 names §H.2 already places), by slot: §H.2, OPE-§J, AI-§N,
 * DES-§24.1, LAN-§23.4 and PLA-§15. A name missing here falls back by `every` (slotOf).
 */
const SLOT_OF_NAME: Readonly<Record<string, SlotId>> = Object.freeze({
  // 1-2 Sheets (P5)
  "sheets.push": "1",
  "sheets.pull": "2",
  // 3 the outbox drain (core; handlers P5), R3 carrier polling
  outbox: "3",
  "carrier.poll": "3",
  // 4 renders (core)
  renders: "4",
  // 4b / 4c ai (P7)
  "ai.batches": "4b",
  "ai.jobs": "4c",
  // 5 one job row at a time (core; imports R2)
  exports: "5",
  backup: "5",
  purge: "5",
  "imports.commit": "5",
  // 6 nightly / hourly
  "media.migrate": "6",
  "media.sweep": "6",
  "storage.walk": "6",
  "refs.reconcile": "6",
  "usage.reconcile": "6",
  "ops.rollup": "6",
  "ops.customers_reconcile": "6",
  "fin.alerts": "6",
  "fin.rollup": "6",
  "fin.recurring": "6",
  "money.close_period": "6",
  store_daily_rollup: "6",
  "ai.rollups": "6",
  "ai.reconcile": "6",
  "ai.retention": "6",
  "ai.distill": "6",
  "ai.genes": "6",
  "ai.genes_platform": "6",
  "ai.risk_train": "6",
  "ai.insights": "6",
  "design.retention": "6",
  "design.shingles": "6",
  "design.archive": "6",
  "leads.followups": "6",
  "delivery.holidays_review": "6",
  "campaigns.share_expiry": "6",
  "experiments.weights": "6",
  "catalog.stock_reconcile": "6",
  "catalog.collections": "6",
  "catalog.bestsellers": "6",
  // R2 (contract step C2-E, S2 DES-§24.1): the hourly brand.assets job (logo exports and PNG renditions, ≤ 3 s)
  "brand.assets": "6",
  // 7 lifecycle and the small tick jobs
  lifecycle: "7",
  "renders.fanout": "7", // the platform-wide re-render's store-by-store enqueue (PLA-§16.2, P8 step 5)
  "ops.presence": "7",
  "sheets.bind_legacy": "7",
  "int.telegram_daily": "7",
  "links.flush": "7",
  "design.reserve": "7",
  "design.backfill": "7",
  "experiments.autoend": "7",
  "landing.schedules": "7",
  "pages.copy": "7",
  "stock.holds_expire": "7",
  // 8 housekeeping
  housekeeping: "8",
  "ops.capi_ctx_purge": "8",
  "imports.cleanup": "8",
  "ship.raw_purge": "8",
  // 9 platform (P1)
  "platform.health": "9",
  "platform.alarms": "9",
  "platform.requests": "9",
  "platform.entitlements": "9",
});

/** The slot a job runs in: its name in the table, else the `platform.*` family → 9, else daily / hourly → 6, tick → 7. */
export function slotOf(job: Pick<Job, "name" | "every">): SlotId {
  const named = Object.prototype.hasOwnProperty.call(SLOT_OF_NAME, job.name) ? SLOT_OF_NAME[job.name] : undefined;
  if (named) return named;
  if (job.name.startsWith("platform.")) return "9";
  return job.every === "tick" ? "7" : "6";
}

/** The most a job in `slot` may declare: the slot's budget plus its leftover cap. */
export function maxJobBudgetMs(slot: SlotId): number {
  const s = slotById(slot);
  return s.budgetMs + s.leftoverCapMs;
}

/** "HH:MM" (00:00-23:59) → minutes after local midnight, or null. */
export function dailyMinutes(at: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Problems of a job list against the slot table (the §J.1 registry rows); [] when every job fits. */
export function jobBudgetProblems(jobs: readonly Pick<Job, "name" | "every" | "budgetMs">[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const j of jobs) {
    if (seen.has(j.name)) out.push(`${j.name}: registered twice`);
    seen.add(j.name);
    if (!Number.isFinite(j.budgetMs) || j.budgetMs <= 0) {
      out.push(`${j.name}: no positive budget`);
      continue;
    }
    const every = j.every as unknown;
    const dailyAt = typeof every === "object" && every !== null ? (every as { dailyAt?: unknown }).dailyAt : undefined;
    if (every !== "tick" && every !== "hourly" && !(typeof dailyAt === "string" && dailyMinutes(dailyAt) !== null)) out.push(`${j.name}: bad every`);
    const slot = slotOf(j);
    if (j.budgetMs > maxJobBudgetMs(slot)) out.push(`${j.name}: ${j.budgetMs} ms > slot ${slot} (${maxJobBudgetMs(slot)} ms)`);
  }
  return out;
}

/**
 * The guaranteed time a job list can claim: per slot, min(slot budget, Σ of its jobs' budgets each capped at the slot
 * budget). ≤ 95 s by construction; the registry test asserts it (§H.2 last paragraph).
 */
export function guaranteedMs(jobs: readonly Pick<Job, "name" | "every" | "budgetMs">[]): number {
  let total = 0;
  for (const s of SLOTS) {
    const inSlot = jobs.filter((j) => slotOf(j) === s.id).reduce((n, j) => n + Math.min(Math.max(0, j.budgetMs), s.budgetMs), 0);
    total += Math.min(s.budgetMs, inSlot);
  }
  return total;
}

/**
 * Slot-6 daily jobs that become due in the same 5-minute cron window, when more than two do (§H.2 slot 6: "no single
 * tick carries more than two"). A job set for HH:MM first runs in the tick at or after it, i.e. the window ending at
 * the next multiple of 5 minutes.
 */
export function dailyCollisions(jobs: readonly Pick<Job, "name" | "every">[]): { window: string; jobs: string[] }[] {
  const windows = new Map<number, string[]>();
  for (const j of jobs) {
    if (typeof j.every !== "object" || slotOf(j) !== "6") continue;
    const min = dailyMinutes(j.every.dailyAt);
    if (min === null) continue;
    const w = (Math.ceil(min / 5) * 5) % 1440;
    windows.set(w, [...(windows.get(w) ?? []), j.name]);
  }
  return [...windows.entries()]
    .filter(([, names]) => names.length > 2)
    .sort(([a], [b]) => a - b)
    .map(([w, names]) => ({ window: `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`, jobs: names }));
}
