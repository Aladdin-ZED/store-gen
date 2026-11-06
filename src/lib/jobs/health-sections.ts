/**
 * The sections of the platform health report (docs/STORE-SAAS.md §H.5; platform.md PLA-§15.1, PLA Q.25; P8 step 11):
 * their types, the isolation runner every section goes through, and the projection onto P0's frozen `PlatformHealth`.
 * Pure: the readers themselves are in src/lib/platform/health.ts; test:jobs drives `collectSections` with fakes.
 *
 * - **Each section fails alone.** A reader that throws, or outlasts its time limit, gives that section `null` and
 *   `sectionErrors[section] = <code>`; every other section is still read (PLA-§15.1 "each panel fails on its own").
 * - **null is not measured, 0 is measured zero.** A section that could not be read is null in the report. P0's frozen
 *   `PlatformHealth` has non-null fields, so its projection fills a failed section with empty values AND names it in
 *   `sectionErrors`: a panel whose section is listed there shows "unavailable", never those values (CCR r1-p8-23 asks
 *   the core to make the frozen fields nullable).
 * - No customer data: store ids and handles only, counts, sizes, times and codes.
 */
import type { AiHealth } from "@/lib/ai/summary.server";
import type { DbUsage } from "@/lib/db/usage";
import type { PlatformHealth } from "@/lib/platform/health";
import type { SheetsCapacity } from "./capacity";
import type { PlatformOutboxSummary } from "./outbox";
import type { PlatformRenderSummary, RenderState } from "./renders";

export const HEALTH_SECTIONS = ["tick", "outbox", "renders", "sheetsTop", "db", "dataDir", "errors", "runtime", "build", "edge", "commerce", "ai", "design", "health", "jobs"] as const;
export type HealthSection = (typeof HEALTH_SECTIONS)[number];

/** P1's `platform.alarms` cheap subset (every tick, ≤ 1 s): no information_schema scan, no file read beyond the gate. */
export const CHEAP_SECTIONS: readonly HealthSection[] = ["tick", "outbox", "renders", "sheetsTop", "dataDir", "edge", "build", "commerce", "health", "db"];

/** a section's time limit (ms) */
export const SECTION_TIMEOUT_MS = 8_000;

export interface JobRunPoint {
  at: string;
  ms: number;
  ok: boolean;
  processed: number;
  errorCode: string | null;
}

export interface TickSection {
  /** the last `tick` row (a skipped one included) */
  lastTickAt: string | null;
  lastTickMs: number | null;
  lastTickOk: boolean | null;
  /** the newest `job_runs` row of any job (the `no_tick` alarm) */
  lastRunAt: string | null;
  /** event-loop lag p95 of the last tick that ran (not skipped) */
  lagP95Ms: number | null;
  /** ticks skipped by the tick lease in 24 h */
  skipped24h: number;
  /** the last 50 runs of every registered job and of `tick` itself, newest first */
  jobs: { job: string; budgetMs: number | null; runs: JobRunPoint[] }[];
}

export interface SheetsTopRow {
  storeId: string;
  handle: string | null;
  /** non-test orders waiting (pending or failed) */
  pending: number;
  oldestPendingAt: string;
  oldestMin: number;
  /** the store's last successful Sheets run (`integration_status`), null when none is recorded */
  lastPushAt: string | null;
  /** not recorded apart from the push in R1: null (not measured) */
  lastPullAt: string | null;
}

export interface SheetsSection {
  /** top 10 by oldest pending, stores with Sheets on only */
  top: SheetsTopRow[];
  /** stores (active or restricted) with Sheets enabled */
  activeStores: number;
  capacity: SheetsCapacity;
}

export interface DbSection {
  usage: DbUsage | null;
  /** top 15 by data + index bytes; rows are InnoDB's estimate */
  tables: { name: string; bytes: number; rows: number }[];
  /** top 15 by `store_usage` media_bytes (total) */
  stores: { storeId: string; handle: string | null; bytes: number }[];
  poolWaitP95Ms: number | null;
  lockPoolWaitP95Ms: number | null;
}

export interface DataDirSection {
  /** the last complete bounded walk, null before the first one ("Snapshot not taken yet") */
  walk: { bytes: number; budgetBytes: number; files: number; at: string } | null;
  /** where new uploads go */
  backend: "fs" | "db";
  /** DATA_DIR is configured (backend db while it is set is red) */
  dataDirSet: boolean;
  /** the boot check's verdict (codes, never a path) */
  check: { ok: boolean; code: string; at: string; variable: string | null } | null;
  /** media_chunks' `DATA_FREE` (what OPTIMIZE TABLE gives back, §G.3), null when unreadable */
  mediaChunksReclaimableBytes: number | null;
  level: "data_dir_70" | "data_dir_85" | null;
  inodeWarn: boolean;
}

export interface ErrorRow {
  area: string;
  code: string;
  route: string | null;
  count: number;
  stores: number;
  firstAt: string;
  lastAt: string;
}

export interface ErrorsSection {
  rows: ErrorRow[];
  /** the busiest hour per area and code in 24 h (`error_spike` > 50) */
  peaks: { area: string; code: string; peakHour: number }[];
}

export interface RuntimeSection {
  buildId: string | null;
  /** BUILD_ID's modification time */
  builtAt: string | null;
  node: string;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  uptimeSec: number;
  /** warn and error lines of the boot configuration (names and states, never values) */
  bootWarnings: { level: "error" | "warn"; text: string }[];
}

export interface BuildSection {
  id: string | null;
  gateSha: string | null;
  gateAt: string | null;
  /** `qa/.build-sha` (CCR P8-11), null when the file is absent */
  commit: string | null;
  /** null when either commit is unknown */
  gateMismatch: boolean | null;
}

export interface EdgeSection {
  sMode: boolean;
  workerVersion: string | null;
  lastEdgeAt: string | null;
  prevKeyRequests24h: number;
  badKey24h: number;
  /** null while the proxy's tally does not expose foreign hosts (CCR r1-p8-23) */
  foreignHosts24h: number | null;
  /** unverifiable x-sg-edge requests in the current minute of this process (`edge_bad_key` ≥ 10) */
  badKeyMinute: number;
  /** EDGE_KEY_PREV is set: a rotation is under way (the panel's checklist) */
  rotationPending: boolean;
}

export interface CommerceSection {
  lastOrderAt: string | null;
  /** 24 hourly buckets, oldest first; the last one ends now */
  ordersPerHour24: number[];
  /** start of the first bucket */
  from: string;
}

export interface DesignSection {
  genomesBytes: number;
  shinglesBytes: number;
  genomesRows: number;
  shinglesRows: number;
}

export interface HealthEngineSection {
  staleSnapshots: number;
  dirtyRows: number;
  /** max(staleAlarmMinutes, 1.5 × the job's measured cycleMin) */
  staleAfterMin: number;
  activeStores: number;
}

export interface JobsSection {
  exportsRunning: number;
  exportsPending: number;
  purgesRunning: number;
  backupsRunning: number;
}

export interface HealthSections {
  tick: TickSection;
  outbox: PlatformOutboxSummary;
  renders: PlatformRenderSummary;
  sheetsTop: SheetsSection;
  db: DbSection;
  dataDir: DataDirSection;
  errors: ErrorsSection;
  runtime: RuntimeSection;
  build: BuildSection;
  edge: EdgeSection;
  commerce: CommerceSection;
  ai: AiHealth;
  design: DesignSection;
  health: HealthEngineSection;
  jobs: JobsSection;
}

/** The honest report: a section is null when it was not requested or could not be read (then named in sectionErrors). */
export type HealthReport = { at: string; sectionErrors: Partial<Record<HealthSection, string>> } & { [K in HealthSection]: HealthSections[K] | null };

export type SectionReaders = { [K in HealthSection]: () => Promise<HealthSections[K]> };

class SectionTimeout extends Error {
  constructor() {
    super("health section timed out");
    this.name = "SectionTimeout";
  }
}

/** The code a failed section is reported under: a known code, the driver's or the error's own, else "unknown". */
export function sectionErrorCode(err: unknown): string {
  if (err instanceof SectionTimeout) return "timeout";
  if (err instanceof Error && /^not implemented/i.test(err.message)) return "not_implemented";
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^[A-Za-z0-9_.:-]{2,64}$/.test(code)) return code;
  const name = err instanceof Error ? err.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 64) : "";
  return name && name !== "Error" ? name : "read_failed";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    // kept ref'd: a hanging source must still end in its timeout (cleared as soon as the read settles)
    timer = setTimeout(() => reject(new SectionTimeout()), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/**
 * Reads the `wanted` sections (default all) in parallel, each under its time limit; a failure is that section's null
 * and its code, reported to `onError` (the error ring) unless it is a stub's `not_implemented`.
 */
export async function collectSections(
  readers: SectionReaders,
  opts: { sections?: readonly HealthSection[]; timeoutMs?: number; now?: () => number; onError?: (section: HealthSection, err: unknown, code: string) => void } = {},
): Promise<HealthReport> {
  const wanted = new Set<HealthSection>(opts.sections?.length ? opts.sections.filter((s) => (HEALTH_SECTIONS as readonly string[]).includes(s)) : HEALTH_SECTIONS);
  const timeoutMs = opts.timeoutMs ?? SECTION_TIMEOUT_MS;
  const report = { at: new Date((opts.now ?? Date.now)()).toISOString(), sectionErrors: {} } as HealthReport;
  const rec = report as unknown as Record<HealthSection, unknown>;
  await Promise.all(
    HEALTH_SECTIONS.map(async (section) => {
      rec[section] = null;
      if (!wanted.has(section)) return;
      try {
        const read = readers[section] as () => Promise<unknown>;
        rec[section] = await withTimeout(Promise.resolve().then(read), timeoutMs);
      } catch (err) {
        const code = sectionErrorCode(err);
        report.sectionErrors[section] = code;
        if (code !== "not_implemented") opts.onError?.(section, err, code);
      }
    }),
  );
  return report;
}

const EMPTY_RENDER_TOTALS: Record<RenderState, number> = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 };

/** PlatformHealth's additive `detail` (P8 step 11): what the frozen fields have no room for; null with its section. */
export interface HealthDetail {
  tick: { lastRunAt: string | null } | null;
  sheets: { activeStores: number; capacity: SheetsCapacity; handles: Record<string, string | null> } | null;
  storage: { tableRows: Record<string, number>; handles: Record<string, string | null> } | null;
  dataDir: (Omit<DataDirSection, "walk"> & { at: string | null }) | null;
  errorPeaks: ErrorsSection["peaks"] | null;
  runtime: Pick<RuntimeSection, "buildId" | "builtAt" | "bootWarnings"> | null;
  build: Pick<BuildSection, "commit" | "gateMismatch"> | null;
  edge: Pick<EdgeSection, "badKeyMinute" | "rotationPending"> | null;
  commerce: { from: string } | null;
  design: Pick<DesignSection, "genomesRows" | "shinglesRows"> | null;
  health: Pick<HealthEngineSection, "staleAfterMin" | "activeStores"> | null;
  jobs: JobsSection | null;
}

/**
 * The frozen `PlatformHealth` from the report. Failed or unrequested sections get empty values and stay named in
 * `sectionErrors` (an unrequested one as `not_requested`); `dataDir` before the first walk is `no_snapshot`.
 */
export function toPlatformHealth(r: HealthReport): PlatformHealth {
  const sectionErrors: Partial<Record<HealthSection, string>> = { ...r.sectionErrors };
  for (const s of HEALTH_SECTIONS) if (r[s] === null && !sectionErrors[s]) sectionErrors[s] = "not_requested";
  if (r.dataDir && !r.dataDir.walk) sectionErrors.dataDir = "no_snapshot";
  const notMeasured: string[] = [];
  if (r.edge && r.edge.foreignHosts24h === null) notMeasured.push("edge.foreignHosts24h");
  if (r.sheetsTop) notMeasured.push("sheets.lastPullAt");

  const tick = r.tick;
  const renders = r.renders ?? {
    byReason: [],
    oldestPending: null,
    failed24h: [],
    doneLastHour: 0,
    notes: 0,
    totals: { ...EMPTY_RENDER_TOTALS },
    oldestMin: null,
    finishedLastHour: 0,
    throughputPerMin: 0,
    etaMin: null,
    failedOld: 0,
    topNotes: [],
    republish: [],
    at: r.at,
  };
  const walk = r.dataDir?.walk ?? null;
  return {
    at: r.at,
    cron: {
      lastTickAt: tick?.lastTickAt ?? null,
      lastTickMs: tick?.lastTickMs ?? null,
      lastTickOk: tick?.lastTickOk ?? null,
      jobs: (tick?.jobs ?? []).map((j) => ({ job: j.job, budgetMs: j.budgetMs, runs: j.runs })),
    },
    outbox: r.outbox ?? { byKind: [], oldestPending: [] },
    renders,
    sheets: (r.sheetsTop?.top ?? []).map((s) => ({ storeId: s.storeId, pending: s.pending, oldestPendingAt: s.oldestPendingAt, lastPushAt: s.lastPushAt, lastPullAt: s.lastPullAt })),
    storage: { db: r.db?.usage ?? null, tables: (r.db?.tables ?? []).map((t) => ({ name: t.name, bytes: t.bytes })), stores: (r.db?.stores ?? []).map((s) => ({ storeId: s.storeId, bytes: s.bytes })) },
    dataDir: { bytes: walk?.bytes ?? 0, budgetBytes: walk?.budgetBytes ?? null, files: walk?.files ?? 0 },
    errors24h: r.errors?.rows ?? [],
    runtime: r.runtime
      ? { node: r.runtime.node, memory: r.runtime.memory, uptimeSec: r.runtime.uptimeSec, bootWarnings: r.runtime.bootWarnings.map((w) => `${w.level}: ${w.text}`) }
      : { node: "", memory: { rss: 0, heapUsed: 0, heapTotal: 0 }, uptimeSec: 0, bootWarnings: [] },
    edge: r.edge
      ? { sMode: r.edge.sMode, workerVersion: r.edge.workerVersion, lastEdgeAt: r.edge.lastEdgeAt, prevKeyRequests24h: r.edge.prevKeyRequests24h, badKey24h: r.edge.badKey24h, foreignHosts24h: r.edge.foreignHosts24h ?? 0 }
      : { sMode: false, workerVersion: null, lastEdgeAt: null, prevKeyRequests24h: 0, badKey24h: 0, foreignHosts24h: 0 },
    build: r.build ? { id: r.build.id, gateSha: r.build.gateSha, gateAt: r.build.gateAt } : { id: null, gateSha: null, gateAt: null },
    db: r.db ? { poolWaitP95Ms: r.db.poolWaitP95Ms, lockPoolWaitP95Ms: r.db.lockPoolWaitP95Ms } : { poolWaitP95Ms: null, lockPoolWaitP95Ms: null },
    tick: { lagP95Ms: tick?.lagP95Ms ?? null, skipped24h: tick?.skipped24h ?? 0 },
    commerce: r.commerce ? { lastOrderAt: r.commerce.lastOrderAt, ordersPerHour24: r.commerce.ordersPerHour24 } : { lastOrderAt: null, ordersPerHour24: [] },
    sheetsTop: (r.sheetsTop?.top ?? []).map((s) => ({ storeId: s.storeId, oldestMin: s.oldestMin })),
    ai: r.ai,
    design: r.design ? { genomesBytes: r.design.genomesBytes, shinglesBytes: r.design.shinglesBytes } : { genomesBytes: 0, shinglesBytes: 0 },
    health: r.health ? { staleSnapshots: r.health.staleSnapshots, dirtyRows: r.health.dirtyRows } : { staleSnapshots: 0, dirtyRows: 0 },
    sectionErrors,
    notMeasured,
    detail: {
      tick: tick ? { lastRunAt: tick.lastRunAt } : null,
      sheets: r.sheetsTop ? { activeStores: r.sheetsTop.activeStores, capacity: r.sheetsTop.capacity, handles: Object.fromEntries(r.sheetsTop.top.map((s) => [s.storeId, s.handle])) } : null,
      storage: r.db ? { tableRows: Object.fromEntries(r.db.tables.map((t) => [t.name, t.rows])), handles: Object.fromEntries(r.db.stores.map((s) => [s.storeId, s.handle])) } : null,
      dataDir: r.dataDir ? { at: walk?.at ?? null, backend: r.dataDir.backend, dataDirSet: r.dataDir.dataDirSet, check: r.dataDir.check, mediaChunksReclaimableBytes: r.dataDir.mediaChunksReclaimableBytes, level: r.dataDir.level, inodeWarn: r.dataDir.inodeWarn } : null,
      errorPeaks: r.errors?.peaks ?? null,
      runtime: r.runtime ? { buildId: r.runtime.buildId, builtAt: r.runtime.builtAt, bootWarnings: r.runtime.bootWarnings } : null,
      build: r.build ? { commit: r.build.commit, gateMismatch: r.build.gateMismatch } : null,
      edge: r.edge ? { badKeyMinute: r.edge.badKeyMinute, rotationPending: r.edge.rotationPending } : null,
      commerce: r.commerce ? { from: r.commerce.from } : null,
      design: r.design ? { genomesRows: r.design.genomesRows, shinglesRows: r.design.shinglesRows } : null,
      health: r.health ? { staleAfterMin: r.health.staleAfterMin, activeStores: r.health.activeStores } : null,
      jobs: r.jobs,
    },
  };
}
