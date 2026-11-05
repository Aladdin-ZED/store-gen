import "server-only";
/**
 * Platform health data (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.5, OS-09; platform.md PLA-§15, PLA Q.25; §K.2 P0): what
 * the console's `/admin/health` panels and the `platform.alarms` job read. P8 owns the data, P1 the screens and the
 * alarms. The `PlatformHealth` fields are P0's frozen shape (core §H.5 and PLA Q.25's `edge`, `commerce`, `sheetsTop`);
 * P8 step 11 adds `sectionErrors`, `notMeasured` and `detail`.
 *
 *   await getHealth(ctx);                                     // every section, the frozen shape (needs health.read)
 *   await getHealthReport(ctx, { sections: CHEAP_SECTIONS }); // the honest report: a failed section is null
 *
 * - Each section is read on its own (src/lib/jobs/health-sections.ts `collectSections`): a failing source gives that
 *   section null and `sectionErrors[section] = <code>`, counted in the error ring (area `health`, route = section).
 * - Before the sections are read, the proxy's edge tally since the last look goes into the error ring and the ring is
 *   flushed (CCR r1-p8-8 item 4), so `edge.*24h` and `errors24h` include this process's latest events.
 * - No customer data: store ids and handles, counts, sizes, times and codes only. Every cross-store statement is
 *   annotated `tenancy: platform health` (console code only, behind `health.read`).
 * - The thresholds live in src/lib/jobs/alarms.ts (pure), re-exported here for the console.
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { RowDataPacket } from "mysql2/promise";
import type { AiHealth } from "@/lib/ai/summary.server";
import type { DbUsage } from "@/lib/db/usage";
import { collectSections, toPlatformHealth, type HealthDetail, type HealthReport, type HealthSection, type HealthSections, type SectionReaders } from "@/lib/jobs/health-sections";
import type { OutboxKind, OutboxState } from "@/lib/jobs/outbox";
import type { RenderSummary } from "@/lib/jobs/renders";
import type { PlatformCtx } from "@/lib/tenancy/types";

export {
  dataDirLevel,
  dbLevel,
  designTablesLarge,
  edgeBadKeyAlarm,
  errorSpike,
  gateMismatchAlarm,
  inodeWarn,
  noTick,
  poolWaitAlarm,
  renderFailedOld,
  renderStuck,
  sheetsBacklogAlarm,
  tickLagAlarm,
} from "@/lib/jobs/alarms";
export { CHEAP_SECTIONS, HEALTH_SECTIONS } from "@/lib/jobs/health-sections";
export type { HealthDetail, HealthReport, HealthSection, HealthSections } from "@/lib/jobs/health-sections";

export interface JobRunSummary {
  at: string;
  ms: number;
  ok: boolean;
  processed: number;
  errorCode: string | null;
}

export interface PlatformHealth {
  at: string;
  /** the last tick and the last 50 `job_runs` per job */
  cron: { lastTickAt: string | null; lastTickMs: number | null; lastTickOk: boolean | null; jobs: { job: string; budgetMs: number | null; runs: JobRunSummary[] }[] };
  /** outbox depth by kind and state, and the oldest pending item per store */
  outbox: { byKind: { kind: OutboxKind; state: OutboxState; count: number }[]; oldestPending: { storeId: string | null; kind: OutboxKind; at: string }[] };
  renders: RenderSummary;
  /** Sheets backlog per store */
  sheets: { storeId: string; pending: number; oldestPendingAt: string | null; lastPushAt: string | null; lastPullAt: string | null }[];
  /** total vs quota (`getDbUsage`), per table (`information_schema.tables`) and per store (`store_usage`) */
  storage: { db: DbUsage | null; tables: { name: string; bytes: number }[]; stores: { storeId: string; bytes: number }[] };
  /** `DATA_DIR` from the bounded walk (ENGC-14), not live */
  dataDir: { bytes: number; budgetBytes: number | null; files: number };
  /** `error_events` of the last 24 h */
  errors24h: { area: string; code: string; route: string | null; count: number; stores: number; firstAt: string; lastAt: string }[];
  runtime: { node: string; memory: { rss: number; heapUsed: number; heapTotal: number }; uptimeSec: number; bootWarnings: string[] };
  /** rev 2 (PLA Q.25), rev 4 `badKey24h` */
  edge: { sMode: boolean; workerVersion: string | null; lastEdgeAt: string | null; prevKeyRequests24h: number; badKey24h: number; foreignHosts24h: number };
  /** rev 3 (SEC-10): the build id (`.next/BUILD_ID`) and the offline gate's commit logged at boot */
  build: { id: string | null; gateSha: string | null; gateAt: string | null };
  /** rev 3 (ENGC-12) */
  db: { poolWaitP95Ms: number | null; lockPoolWaitP95Ms: number | null };
  /** rev 3 (ENGC-11) */
  tick: { lagP95Ms: number | null; skipped24h: number };
  /** PLA Q.25: the last order platform-wide and orders per hour for 24 h (test orders excluded) */
  commerce: { lastOrderAt: string | null; ordersPerHour24: number[] };
  /** PLA Q.25: the stores with the oldest Sheets backlog */
  sheetsTop: { storeId: string; oldestMin: number }[];
  /** P7's `aiHealth()` (AI R13, R18); null while it is unavailable (its P0 stub throws) */
  ai: AiHealth | null;
  /** DES-R12: the design tables' bytes (alarm at 300 MB) */
  design: { genomesBytes: number; shinglesBytes: number };
  /** the `platform.health` job (§I.7) */
  health: { staleSnapshots: number; dirtyRows: number };
  /**
   * P8 step 11 (additive): the sections that could not be read (or were not requested), with a code. A section named
   * here carries empty values in the fields above: the panel shows it as unavailable, never as zeros. `dataDir` is
   * `no_snapshot` before the first walk ("Snapshot not taken yet").
   */
  sectionErrors: Partial<Record<HealthSection, string>>;
  /** P8 step 11 (additive): numeric fields above that are placeholders because nothing measures them yet */
  notMeasured: string[];
  /** P8 step 11 (additive): what the frozen fields have no room for (handles, capacity, verdicts, peaks) */
  detail: HealthDetail;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const minutesSince = (at: string, now: number) => Math.max(0, Math.floor((now - Date.parse(at)) / 60_000));

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Buffer.isBuffer(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function q(sqlText: string, values: unknown[] = []): Promise<RowDataPacket[]> {
  const { pool } = await import("@/lib/db/client");
  const [rows] = await pool().query<RowDataPacket[]>(sqlText, values);
  return rows;
}

async function readText(rel: string[]): Promise<string | null> {
  try {
    return await readFile(join(process.cwd(), ...rel), "utf8");
  } catch {
    return null;
  }
}

/** `.next/BUILD_ID` and its time, null when there is no build (dev). */
async function buildIdOf(): Promise<{ id: string | null; at: string | null }> {
  const raw = (await readText([".next", "BUILD_ID"]))?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return { id: null, at: null };
  const at = await stat(join(process.cwd(), ".next", "BUILD_ID")).then(
    (s) => s.mtime.toISOString(),
    () => null,
  );
  return { id: raw, at };
}

/* ------------------------------------------------------------------ */
/* The section readers                                                 */
/* ------------------------------------------------------------------ */

async function readTick(now: number): Promise<HealthSections["tick"]> {
  const { JOBS } = await import("@/lib/jobs/registry");
  const names = ["tick", ...new Set(JOBS.map((j) => j.name))];
  const budget = new Map(JOBS.map((j) => [j.name, j.budgetMs]));
  const jobs: HealthSections["tick"]["jobs"] = [];
  let lagP95Ms: number | null = null;
  let last: RowDataPacket | null = null;
  for (const job of names) {
    // tenancy: platform health the Cron panel: one job's last 50 run rows (store_id NULL), times, counts and codes only
    const rows = await q("SELECT started_at, ms, ok, processed, error_code, summary FROM job_runs WHERE job = ? AND store_id IS NULL ORDER BY started_at DESC, id DESC LIMIT 50", [job]);
    if (job === "tick") {
      last = rows[0] ?? null;
      for (const r of rows) {
        const s = parseJson(r.summary);
        if (s?.skipped === true) continue;
        lagP95Ms = typeof s?.lagP95Ms === "number" && Number.isFinite(s.lagP95Ms) ? s.lagP95Ms : null;
        break;
      }
    }
    jobs.push({
      job,
      budgetMs: budget.get(job) ?? null,
      runs: rows.map((r) => ({ at: iso(r.started_at)!, ms: num(r.ms), ok: !!Number(r.ok), processed: num(r.processed), errorCode: r.error_code === null ? null : String(r.error_code) })),
    });
  }
  // tenancy: platform health the skipped ticks of 24 h: platform run rows, a count
  const [skipped] = await q("SELECT COUNT(*) AS n FROM job_runs WHERE job = 'tick' AND store_id IS NULL AND started_at >= ? AND JSON_VALID(summary) AND JSON_UNQUOTE(JSON_EXTRACT(summary, '$.skipped')) = 'true'", [new Date(now - DAY)]);
  // tenancy: platform health the newest run row of any job (the no_tick alarm), a time only
  const [newest] = await q("SELECT MAX(started_at) AS at FROM job_runs");
  return {
    lastTickAt: last ? iso(last.started_at) : null,
    lastTickMs: last ? num(last.ms) : null,
    lastTickOk: last ? !!Number(last.ok) : null,
    lastRunAt: iso(newest?.at),
    lagP95Ms,
    skipped24h: num(skipped?.n),
    jobs,
  };
}

const SHEETS_ON = "EXISTS (SELECT 1 FROM store_settings ss WHERE ss.store_id = s.id AND ss.`key` = 'sheets' AND ss.encrypted = 0 AND JSON_VALID(ss.value) AND JSON_UNQUOTE(JSON_EXTRACT(ss.value, '$.enabled')) = 'true')";

async function readSheets(now: number): Promise<HealthSections["sheetsTop"]> {
  const { sheetsCapacity } = await import("@/lib/jobs/capacity");
  // tenancy: platform health the Sheets panel: the 10 stores with the oldest waiting non-test order (ids, handles, counts, times)
  const rows = await q(
    `SELECT o.store_id, s.handle, COUNT(*) AS n, MIN(o.created_at) AS oldest FROM orders o JOIN stores s ON s.id = o.store_id WHERE o.is_test = 0 AND o.sheet_status IN ('pending', 'failed') AND s.status IN ('active', 'restricted') AND ${SHEETS_ON} GROUP BY o.store_id, s.handle ORDER BY oldest ASC LIMIT 10`,
  );
  // tenancy: platform health the stores with Sheets on (the slot-1 capacity line), a count
  const [active] = await q(`SELECT COUNT(*) AS n FROM stores s WHERE s.status IN ('active', 'restricted') AND ${SHEETS_ON}`);
  const ids = rows.map((r) => String(r.store_id));
  const pushed = new Map<string, string | null>();
  if (ids.length) {
    // tenancy: platform health the last successful Sheets run of those stores (integration_status), times only
    const st = await q("SELECT store_id, MAX(last_ok_at) AS at FROM integration_status WHERE kind = 'sheets' AND store_id IN (?) GROUP BY store_id", [ids]);
    for (const r of st) pushed.set(String(r.store_id), iso(r.at));
  }
  const activeStores = num(active?.n);
  return {
    top: rows.map((r) => {
      const oldestPendingAt = iso(r.oldest)!;
      return { storeId: String(r.store_id), handle: r.handle === null ? null : String(r.handle), pending: num(r.n), oldestPendingAt, oldestMin: minutesSince(oldestPendingAt, now), lastPushAt: pushed.get(String(r.store_id)) ?? null, lastPullAt: null };
    }),
    activeStores,
    capacity: sheetsCapacity(activeStores),
  };
}

async function readDb(): Promise<HealthSections["db"]> {
  const [{ getDbUsage }, M] = await Promise.all([import("@/lib/db/usage"), import("@/lib/jobs/metrics")]);
  M.ensureOpsSamplers();
  const usage = await getDbUsage();
  // tenancy: platform health the 15 largest tables of this database (information_schema: names and sizes)
  const tables = await q("SELECT table_name AS name, COALESCE(data_length, 0) + COALESCE(index_length, 0) AS bytes, COALESCE(table_rows, 0) AS n FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY bytes DESC LIMIT 15");
  // tenancy: platform health the 15 stores with the most media bytes (store_usage gauges: ids, handles, sizes)
  const stores = await q("SELECT su.store_id, s.handle, su.value FROM store_usage su JOIN stores s ON s.id = su.store_id WHERE su.metric = 'media_bytes' AND su.period = 'total' ORDER BY su.value DESC LIMIT 15");
  return {
    usage,
    tables: tables.map((t) => ({ name: String(t.name), bytes: num(t.bytes), rows: num(t.n) })),
    stores: stores.map((s) => ({ storeId: String(s.store_id), handle: s.handle === null ? null : String(s.handle), bytes: num(s.value) })),
    poolWaitP95Ms: M.poolWaitP95Ms(),
    lockPoolWaitP95Ms: M.lockPoolWaitP95Ms(),
  };
}

async function readDataDir(): Promise<HealthSections["dataDir"]> {
  const [W, S, A] = await Promise.all([import("@/lib/storage/walk"), import("@/lib/media/storage"), import("@/lib/jobs/alarms")]);
  // tenancy: platform health the storage.walk job row (cron_cursors, no store column): the last snapshot's totals
  const [row] = await q("SELECT state FROM cron_cursors WHERE job = ?", [W.WALK_JOB]);
  const snap = W.readWalkSnapshot(parseJson(row?.state));
  const budget = W.budgetBytes();
  const verdict = await S.mediaStorageChecked();
  // tenancy: platform health media_chunks' reclaimable bytes (information_schema DATA_FREE, §G.3)
  const [free] = await q("SELECT data_free AS free FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'media_chunks'");
  const reclaim = free ? Number(free.free) : NaN;
  return {
    walk: snap ? { bytes: snap.bytes, budgetBytes: budget, files: snap.files, at: snap.at } : null,
    backend: verdict.ok ? "fs" : "db",
    dataDirSet: !!process.env.DATA_DIR?.trim(),
    check: { ok: verdict.ok, code: verdict.code, at: verdict.at, variable: verdict.variable },
    mediaChunksReclaimableBytes: Number.isFinite(reclaim) && reclaim >= 0 ? reclaim : null,
    level: snap ? A.dataDirLevel(snap.bytes, budget) : null,
    inodeWarn: snap ? A.inodeWarn(snap.files) : false,
  };
}

async function readErrors(now: number): Promise<HealthSections["errors"]> {
  const { errorBucket } = await import("@/lib/jobs/errors");
  const from = errorBucket(now - DAY);
  // tenancy: platform health the error ring of 24 h by area, code and route: counts, stores affected, times (no sample)
  const rows = await q(
    "SELECT area, code, route, SUM(count) AS n, COUNT(DISTINCT store_id) AS stores, MIN(first_at) AS first_at, MAX(last_at) AS last_at FROM error_events WHERE bucket >= ? AND last_at >= ? GROUP BY area, code, route ORDER BY n DESC, last_at DESC LIMIT 100",
    [from, new Date(now - DAY)],
  );
  // tenancy: platform health the busiest hour per area and code in 24 h (error_spike), counts only
  const peaks = await q("SELECT area, code, MAX(n) AS peak FROM (SELECT area, code, bucket, SUM(count) AS n FROM error_events WHERE bucket >= ? GROUP BY area, code, bucket) x GROUP BY area, code ORDER BY peak DESC LIMIT 20", [from]);
  return {
    rows: rows.map((r) => ({ area: String(r.area), code: String(r.code), route: r.route === null ? null : String(r.route), count: num(r.n), stores: num(r.stores), firstAt: iso(r.first_at)!, lastAt: iso(r.last_at)! })),
    peaks: peaks.map((p) => ({ area: String(p.area), code: String(p.code), peakHour: num(p.peak) })),
  };
}

async function readRuntime(): Promise<HealthSections["runtime"]> {
  const [{ platformConfigLines }, { authConfigWarnings }, build] = await Promise.all([import("@/lib/db/boot-config"), import("@/lib/auth/config"), buildIdOf()]);
  const lines = (await platformConfigLines()).filter((l): l is { level: "error" | "warn"; text: string } => l.level !== "info");
  const m = process.memoryUsage();
  return {
    buildId: build.id,
    builtAt: build.at,
    node: process.version,
    memory: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal },
    uptimeSec: Math.round(process.uptime()),
    bootWarnings: [...lines.map((l) => ({ level: l.level, text: l.text })), ...authConfigWarnings().map((text) => ({ level: "warn" as const, text }))],
  };
}

async function readBuild(): Promise<HealthSections["build"]> {
  const [build, gateRaw, shaRaw] = await Promise.all([buildIdOf(), readText(["qa", ".gate-ok"]), readText(["qa", ".build-sha"])]);
  let gateSha: string | null = null;
  let gateAt: string | null = null;
  if (gateRaw) {
    const g = parseJson(gateRaw);
    gateSha = typeof g?.sha === "string" && /^[0-9a-f]{40}$/.test(g.sha) ? g.sha : (/\b[0-9a-f]{40}\b/.exec(gateRaw)?.[0] ?? null);
    gateAt = typeof g?.at === "string" ? iso(g.at) : null;
  }
  const sha = shaRaw?.trim() ?? "";
  const commit = /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  return { id: build.id, gateSha, gateAt, commit, gateMismatch: gateSha && commit ? gateSha !== commit : null };
}

async function readEdge(now: number): Promise<HealthSections["edge"]> {
  const [{ edgeTally }, env, ET, { errorBucket }] = await Promise.all([import("@/lib/edge/proxy-log"), import("@/lib/edge/env"), import("@/lib/jobs/edge-tally"), import("@/lib/jobs/errors")]);
  const tally = edgeTally();
  // tenancy: platform health the edge rows of the error ring in 24 h (area edge, store_id NULL), counts per code
  const rows = await q("SELECT code, SUM(count) AS n FROM error_events WHERE area = 'edge' AND bucket >= ? AND last_at >= ? AND code IN ('bad_key', 'prev_key', 'foreign_host') GROUP BY code", [errorBucket(now - DAY), new Date(now - DAY)]);
  const by = new Map(rows.map((r) => [String(r.code), num(r.n)]));
  const foreignMeasured = ET.tallyForeignHosts(tally) !== null;
  return {
    sMode: env.subdomainMode(),
    workerVersion: ET.tallyWorkerVersion(tally),
    lastEdgeAt: tally.verifiedAt === null ? null : new Date(tally.verifiedAt).toISOString(),
    prevKeyRequests24h: by.get("prev_key") ?? 0,
    badKey24h: by.get("bad_key") ?? 0,
    foreignHosts24h: foreignMeasured ? (by.get("foreign_host") ?? 0) : null,
    badKeyMinute: now - tally.minuteStart < 60_000 ? tally.badKeyMinute : 0,
    rotationPending: env.usableEdgeKey("EDGE_KEY_PREV") !== null,
  };
}

async function readCommerce(now: number): Promise<HealthSections["commerce"]> {
  const end = new Date(now);
  const from = new Date(now - DAY);
  // tenancy: platform health the commerce heartbeat: the newest non-test order platform-wide, a time only
  const [last] = await q("SELECT created_at FROM orders WHERE is_test = 0 ORDER BY created_at DESC LIMIT 1");
  // tenancy: platform health non-test orders per hour for 24 h platform-wide (orders_created_idx), counts only
  const rows = await q("SELECT 23 - FLOOR(TIMESTAMPDIFF(SECOND, created_at, ?) / 3600) AS b, COUNT(*) AS n FROM orders WHERE created_at > ? AND created_at <= ? AND is_test = 0 GROUP BY b", [end, from, end]);
  const buckets = Array.from({ length: 24 }, () => 0);
  for (const r of rows) {
    const b = Number(r.b);
    if (Number.isInteger(b) && b >= 0 && b < 24) buckets[b]! += num(r.n);
  }
  return { lastOrderAt: iso(last?.created_at), ordersPerHour24: buckets, from: from.toISOString() };
}

async function readDesign(): Promise<HealthSections["design"]> {
  // tenancy: platform health the design tables' sizes (information_schema: two names, sizes and row estimates)
  const rows = await q("SELECT table_name AS name, COALESCE(data_length, 0) + COALESCE(index_length, 0) AS bytes, COALESCE(table_rows, 0) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('design_genomes', 'headline_shingles')");
  const of = (name: string) => rows.find((r) => String(r.name) === name);
  return { genomesBytes: num(of("design_genomes")?.bytes), shinglesBytes: num(of("headline_shingles")?.bytes), genomesRows: num(of("design_genomes")?.n), shinglesRows: num(of("headline_shingles")?.n) };
}

async function readHealthEngine(now: number): Promise<HealthSections["health"]> {
  const { getPlatformSetting } = await import("@/lib/settings");
  const staleAlarm = await getPlatformSetting("platform").then(
    (p) => p.health.staleAlarmMinutes,
    () => 60, // the key's default when the settings row cannot be read
  );
  // tenancy: platform health the last platform.health run (store_id NULL): its measured cycle, a number
  const [run] = await q("SELECT summary FROM job_runs WHERE job = 'platform.health' AND store_id IS NULL ORDER BY started_at DESC, id DESC LIMIT 1");
  const cycle = parseJson(run?.summary)?.cycleMin;
  const staleAfterMin = Math.max(staleAlarm, typeof cycle === "number" && Number.isFinite(cycle) && cycle > 0 ? Math.ceil(1.5 * cycle) : 0);
  // tenancy: platform health active stores and those whose snapshot (or, without one, the store itself) is older than the stale mark: counts
  const [stale] = await q("SELECT COUNT(*) AS active, COALESCE(SUM(COALESCE(h.computed_at, s.created_at) < ?), 0) AS stale FROM stores s LEFT JOIN store_health h ON h.store_id = s.id WHERE s.status = 'active'", [new Date(now - staleAfterMin * 60_000)]);
  // tenancy: platform health store_health rows waiting for a priority recompute, a count
  const [dirty] = await q("SELECT COUNT(*) AS n FROM store_health WHERE dirty_at IS NOT NULL");
  return { staleSnapshots: num(stale?.stale), dirtyRows: num(dirty?.n), staleAfterMin, activeStores: num(stale?.active) };
}

async function readJobs(): Promise<HealthSections["jobs"]> {
  // tenancy: platform health export jobs queued or running platform-wide, counts by state
  const exportsRows = await q("SELECT state, COUNT(*) AS n FROM export_jobs WHERE state IN ('pending', 'running') GROUP BY state");
  // tenancy: platform health backup runs in progress (backup_runs, no store column), a count
  const [backups] = await q("SELECT COUNT(*) AS n FROM backup_runs WHERE state = 'running'");
  // tenancy: platform health purges under way: cron_cursors rows purge:<storeId> (no store column), a count
  const [purges] = await q("SELECT COUNT(*) AS n FROM cron_cursors WHERE job LIKE 'purge:%'");
  const ex = new Map(exportsRows.map((r) => [String(r.state), num(r.n)]));
  return { exportsRunning: ex.get("running") ?? 0, exportsPending: ex.get("pending") ?? 0, purgesRunning: num(purges?.n), backupsRunning: num(backups?.n) };
}

function readers(now: number): SectionReaders {
  return {
    tick: () => readTick(now),
    outbox: async () => (await import("@/lib/jobs/outbox")).platformOutboxSummary(),
    renders: async () => (await import("@/lib/jobs/renders")).platformRenderSummary(),
    sheetsTop: () => readSheets(now),
    db: readDb,
    dataDir: readDataDir,
    errors: () => readErrors(now),
    runtime: readRuntime,
    build: readBuild,
    edge: () => readEdge(now),
    commerce: () => readCommerce(now),
    ai: async () => (await import("@/lib/ai/summary.server")).aiHealth(),
    design: readDesign,
    health: () => readHealthEngine(now),
    jobs: readJobs,
  };
}

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

async function assertHealthRead(ctx: PlatformCtx): Promise<void> {
  if (ctx.can("health.read")) return;
  const { SeamError } = await import("@/lib/tenancy/seam");
  throw new SeamError("forbidden");
}

/**
 * The honest report (P8 step 11): every section, or only `sections` (P1's `platform.alarms` passes CHEAP_SECTIONS);
 * a section not requested or not readable is null, the latter named in `sectionErrors`.
 */
export async function getHealthReport(ctx: PlatformCtx, opts: { sections?: readonly HealthSection[] } = {}): Promise<HealthReport> {
  await assertHealthRead(ctx);
  const [{ recordEdgeDeltas }, E] = await Promise.all([import("@/lib/jobs/edge-tally"), import("@/lib/jobs/errors")]);
  recordEdgeDeltas();
  await E.flushErrors().catch(() => undefined);
  const now = Date.now();
  return collectSections(readers(now), {
    sections: opts.sections,
    now: () => now,
    onError: (section, err, code) => E.recordError("health", err, { code, route: section }),
  });
}

export async function getHealth(ctx: PlatformCtx): Promise<PlatformHealth> {
  return toPlatformHealth(await getHealthReport(ctx));
}
