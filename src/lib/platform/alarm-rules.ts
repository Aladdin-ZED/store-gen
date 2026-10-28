/**
 * The alarm rules (docs/STORE-SAAS.md §H.5; platform.md PLA-§15.2, PLA-§5.3, PD57, PD68, PD70, PD78): pure and
 * isomorphic, so `test:platform` checks them without a database. src/lib/platform/alarms.ts reads the sources and
 * runs the job; this file only decides which alarms a snapshot of the platform raises and what a run notifies.
 */
import type { AiHealth } from "@/lib/ai/summary.server";
import type { HealthFlag } from "@/lib/health/types";
import { hourBucket, SLOW_STREAK } from "./health-score";
import type { PlatformHealth } from "./health";

/** the platform's day for the commerce heartbeat (auth/config.ts `PLATFORM_TIMEZONE`, the owner's market) */
const PLATFORM_TZ = "Africa/Casablanca";

/** Every alarm code of PLA-§15.2 (rev 6), in the panel order; `console.attention.<code>` names each (test:platform). */
export const ALARM_CODES = [
  "no_tick",
  "outbox_dead",
  "db_70",
  "db_85",
  "data_dir_70",
  "data_dir_85",
  "inodes_high",
  "error_spike",
  "sheets_backlog",
  "commerce_quiet",
  "render_stuck",
  "render_failed_old",
  "edge_silent",
  "edge_prev_key",
  "edge_bad_key",
  "gate_mismatch",
  "pool_wait",
  "tick_lag",
  "health_stale",
  "health_job_slow",
  "ai_cap_70",
  "ai_cap_85",
  "ai_cap_reached",
  "ai_auth_failed",
  "ai_director_unavailable",
  "ai_refusal_spike",
  "ai_job_orphan",
  "ai_pending_cap",
  "design_tables_large",
  "backup_failed",
  "backup_not_downloaded",
  "breakglass_unreviewed",
  "signup_capped",
  "pending_media_budget",
  "signup_unguarded",
  "abuse_reports_spike",
  "brand_term_live",
] as const;
export type AlarmCode = (typeof ALARM_CODES)[number];

/** The variables each `console.attention.<code>` sentence takes (the catalog test checks them). */
export const ALARM_VARS: Readonly<Record<AlarmCode, readonly string[]>> = {
  no_tick: ["minutes"],
  outbox_dead: ["count"],
  db_70: ["percent"],
  db_85: ["percent"],
  data_dir_70: ["percent", "budget"],
  data_dir_85: ["percent", "budget"],
  inodes_high: ["count"],
  error_spike: ["count", "code"],
  sheets_backlog: ["minutes"],
  commerce_quiet: ["hours"],
  render_stuck: ["pending", "minutes"],
  render_failed_old: ["count"],
  edge_silent: ["minutes"],
  edge_prev_key: ["count"],
  edge_bad_key: ["count"],
  gate_mismatch: [],
  pool_wait: ["ms"],
  tick_lag: ["ms"],
  health_stale: ["count", "minutes"],
  health_job_slow: ["ms"],
  ai_cap_70: ["percent"],
  ai_cap_85: ["percent"],
  ai_cap_reached: [],
  ai_auth_failed: [],
  ai_director_unavailable: [],
  ai_refusal_spike: ["percent"],
  ai_job_orphan: ["count"],
  ai_pending_cap: ["percent"],
  design_tables_large: ["mb"],
  backup_failed: [],
  backup_not_downloaded: ["days"],
  breakglass_unreviewed: ["count"],
  signup_capped: ["cap"],
  pending_media_budget: ["percent", "total"],
  signup_unguarded: [],
  abuse_reports_spike: ["count", "handle"],
  brand_term_live: ["handle", "field", "term"],
};

/** Danger is red, warn yellow (both notify once when raised), info never notifies. */
export type AlarmLevel = "danger" | "warn" | "info";

export interface AlarmState {
  code: AlarmCode;
  level: AlarmLevel;
  /** the identity of the raised state: the code, or `<code>:<storeId>` / `<code>:<storeId>:<termHash>` per store */
  key: string;
  /** the number the notification carries (`staff.alarm.value`) */
  value?: number;
  /** the `console.attention.<code>` variables (counts, codes, a term; never customer data; the console adds `handle` from `storeId`) */
  vars: Record<string, string | number>;
  storeId?: string;
  /** who notifies: this job, another writer with the same dedupe key, or nobody (information) */
  notify: "self" | "elsewhere" | "never";
}

/** One snapshot of the platform the rules read (null = the source failed or does not exist yet). */
export interface AlarmInputs {
  now: Date;
  machine: PlatformHealth | null;
  ai: AiHealth | null;
  health: { activeStores: number; staleActive: number; staleAfterMin: number; slowStreak: number; lastP50Ms: number | null } | null;
  /** stores whose snapshot carries a flag the alarms relay (`brand_term_live`, `abuse_reports_new` severity 2) */
  flagged: { storeId: string; flags: HealthFlag[] }[] | null;
  signup: { unguarded: boolean; pendingToday: number; cap: number; pendingMediaBytes: number; pendingMediaBudgetBytes: number } | null;
  backup: { lastDownloadAt: string | null; remindAfterDays: number; latestDoneDay: string | null; latestFailed: boolean } | null;
  breakglass: { unreviewedWeeks: string[] } | null;
}

/* ------------------------------------------------------------------ */
/* Thresholds (PLA-§15.1, §15.2, core §H.5)                            */
/* ------------------------------------------------------------------ */

export const ALARM_RULES = {
  noTickMin: 10,
  dbWarn: 0.7,
  dbDanger: 0.85,
  dataDirWarn: 0.7,
  dataDirDanger: 0.85,
  inodes: 300_000,
  errorSpike: 50,
  sheetsFloorMin: 15,
  sheetsPerTick: 16,
  commerceQuietHours: 3,
  commerceDayFrom: 9,
  commerceDayTo: 23,
  commerceMinStores: 10,
  renderStuckMin: 60,
  edgeSilentMin: 15,
  edgeBadKeys: 10,
  poolWaitMs: 500,
  tickLagMs: 250,
  designTablesBytes: 300 * 1024 * 1024,
  aiCapWarn: 70,
  aiCapDanger: 85,
  pendingMediaWarn: 80,
  pendingMediaDanger: 95,
  breakglassAfterDays: 14,
  staleRedShare: 0.1,
} as const;

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const minutesSince = (iso: string | null | undefined, now: Date): number | null => {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 60_000)) : null;
};
const pct = (part: number, whole: number) => (whole > 0 ? Math.floor((part * 100) / whole) : 0);

/** The hour of the platform's day (Africa/Casablanca), for the commerce heartbeat. */
function platformHour(now: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: PLATFORM_TZ }).format(now);
  return Number(h) || 0;
}

/** Every raised alarm in `inputs` (pure), most severe first, then in `ALARM_CODES` order. */
export function alarmsFrom(inputs: AlarmInputs): AlarmState[] {
  const out: AlarmState[] = [];
  const raise = (code: AlarmCode, level: AlarmLevel, vars: Record<string, string | number> = {}, extra: Partial<Pick<AlarmState, "value" | "storeId" | "key" | "notify">> = {}) =>
    out.push({ code, level, key: extra.key ?? code, vars, notify: extra.notify ?? (level === "info" ? "never" : "self"), ...(extra.value !== undefined ? { value: extra.value } : {}), ...(extra.storeId ? { storeId: extra.storeId } : {}) });
  const { now, machine: m, ai, health } = inputs;
  const R = ALARM_RULES;

  if (m) {
    const tick = minutesSince(m.cron.lastTickAt, now);
    if (tick !== null && tick >= R.noTickMin) raise("no_tick", "danger", { minutes: tick }, { value: tick });
    const dead = m.outbox.byKind.filter((r) => r.state === "dead").reduce((n, r) => n + r.count, 0);
    if (dead > 0) raise("outbox_dead", "warn", { count: dead }, { value: dead });
    const ratio = m.storage.db?.ratio ?? null;
    if (ratio !== null && ratio >= R.dbDanger) raise("db_85", "danger", { percent: Math.floor(ratio * 100) }, { value: Math.floor(ratio * 100) });
    else if (ratio !== null && ratio >= R.dbWarn) raise("db_70", "warn", { percent: Math.floor(ratio * 100) }, { value: Math.floor(ratio * 100) });
    const budget = m.dataDir.budgetBytes;
    if (budget && budget > 0) {
      const share = m.dataDir.bytes / budget;
      const vars = { percent: Math.floor(share * 100), budget: `${Math.round((budget / GiB) * 10) / 10} GB` };
      if (share >= R.dataDirDanger) raise("data_dir_85", "danger", vars, { value: vars.percent });
      else if (share >= R.dataDirWarn) raise("data_dir_70", "warn", vars, { value: vars.percent });
    }
    if (m.dataDir.files > R.inodes) raise("inodes_high", "warn", { count: m.dataDir.files }, { value: m.dataDir.files });
    // > 50 of one code inside one hour: P8's rows are 24 h aggregates, so a code counts when its first and last
    // occurrence are less than an hour apart and the last is in the past hour (CCR r1-p1-4 asks for the hour's figure)
    const spike = m.errors24h
      .filter((e) => e.count > R.errorSpike && (minutesSince(e.lastAt, now) ?? 99) < 60 && Date.parse(e.lastAt) - Date.parse(e.firstAt) <= 3_600_000)
      .sort((a, b) => b.count - a.count)[0];
    if (spike) raise("error_spike", "danger", { count: spike.count, code: spike.code.slice(0, 40) }, { value: spike.count });
    const sheetsThreshold = Math.max(R.sheetsFloorMin, 5 * Math.ceil(m.sheets.length / R.sheetsPerTick));
    const worstSheets = [...m.sheetsTop].sort((a, b) => b.oldestMin - a.oldestMin)[0];
    if (worstSheets && worstSheets.oldestMin > sheetsThreshold) raise("sheets_backlog", "danger", { minutes: worstSheets.oldestMin }, { value: worstSheets.oldestMin });
    const quiet = minutesSince(m.commerce.lastOrderAt, now);
    const hour = platformHour(now);
    if (quiet !== null && quiet >= R.commerceQuietHours * 60 && hour >= R.commerceDayFrom && hour < R.commerceDayTo && (health?.activeStores ?? 0) >= R.commerceMinStores) {
      raise("commerce_quiet", "warn", { hours: Math.floor(quiet / 60) }, { value: Math.floor(quiet / 60) });
    }
    const pending = m.renders.byReason.reduce((n, r) => n + r.pending, 0);
    const oldest = m.renders.oldestPending?.ageMin ?? 0;
    if (pending > 0 && (oldest > R.renderStuckMin || (m.renders.doneLastHour === 0 && oldest > 10))) raise("render_stuck", "warn", { pending, minutes: oldest }, { value: oldest });
    const failedAll = m.renders.byReason.reduce((n, r) => n + r.failed, 0);
    const failed24 = m.renders.failed24h.reduce((n, r) => n + r.count, 0);
    if (failedAll > failed24) raise("render_failed_old", "danger", { count: failedAll - failed24 }, { value: failedAll - failed24 });
    if (m.edge.sMode && (health?.activeStores ?? 0) >= 1) {
      const silent = minutesSince(m.edge.lastEdgeAt, now);
      if (silent === null || silent >= R.edgeSilentMin) raise("edge_silent", "danger", { minutes: silent ?? 0 }, { value: silent ?? 0 });
    }
    if (m.edge.prevKeyRequests24h > 0) raise("edge_prev_key", "warn", { count: m.edge.prevKeyRequests24h }, { value: m.edge.prevKeyRequests24h });
    if (m.edge.badKey24h >= R.edgeBadKeys) raise("edge_bad_key", "danger", { count: m.edge.badKey24h }, { value: m.edge.badKey24h });
    const poolWait = Math.max(m.db.poolWaitP95Ms ?? 0, m.db.lockPoolWaitP95Ms ?? 0);
    if (poolWait > R.poolWaitMs) raise("pool_wait", "danger", { ms: Math.round(poolWait) }, { value: Math.round(poolWait) });
    if ((m.tick.lagP95Ms ?? 0) > R.tickLagMs) raise("tick_lag", "danger", { ms: Math.round(m.tick.lagP95Ms ?? 0) }, { value: Math.round(m.tick.lagP95Ms ?? 0) });
    const designBytes = m.design.genomesBytes + m.design.shinglesBytes;
    if (designBytes > R.designTablesBytes) raise("design_tables_large", "warn", { mb: Math.round(designBytes / MiB) }, { value: Math.round(designBytes / MiB) });
  }

  // P7's verdicts, relayed (AI-§O): the fields of aiHealth(), never recomputed from runs
  if (ai) {
    const used = ai.spend.usedPct;
    if (used !== null && used >= 100) raise("ai_cap_reached", "danger", {}, { value: Math.floor(used) });
    else if (used !== null && used >= R.aiCapDanger) raise("ai_cap_85", "danger", { percent: Math.floor(used) }, { value: Math.floor(used) });
    else if (used !== null && used >= R.aiCapWarn) raise("ai_cap_70", "warn", { percent: Math.floor(used) }, { value: Math.floor(used) });
    if (ai.classes.some((c) => c.class.startsWith("director") && c.state === "unavailable")) raise("ai_director_unavailable", "danger");
    if (ai.jobs.orphaned > 0) raise("ai_job_orphan", "warn", { count: ai.jobs.orphaned }, { value: ai.jobs.orphaned });
    const slice = ai.spend.pendingSliceUsedPct;
    if (slice !== null && slice >= 100) raise("ai_pending_cap", "warn", { percent: Math.floor(slice) }, { value: Math.floor(slice) });
  }

  if (health) {
    if (health.staleActive > 0) {
      const red = health.activeStores > 0 && health.staleActive > health.activeStores * R.staleRedShare;
      raise("health_stale", red ? "danger" : "warn", { count: health.staleActive, minutes: health.staleAfterMin }, { value: health.staleActive });
    }
    if (health.slowStreak >= SLOW_STREAK) raise("health_job_slow", "warn", { ms: health.lastP50Ms ?? 0 }, { value: health.lastP50Ms ?? 0 });
  }

  const s = inputs.signup;
  if (s) {
    if (s.unguarded) raise("signup_unguarded", "danger");
    if (s.pendingToday >= s.cap) raise("signup_capped", "info", { cap: s.cap }, { value: s.pendingToday });
    const share = pct(s.pendingMediaBytes, s.pendingMediaBudgetBytes);
    const vars = { percent: share, total: Math.round(s.pendingMediaBudgetBytes / MiB) };
    if (share >= R.pendingMediaDanger) raise("pending_media_budget", "danger", vars, { value: share });
    else if (share >= R.pendingMediaWarn) raise("pending_media_budget", "warn", vars, { value: share });
  }

  const b = inputs.backup;
  if (b) {
    if (b.latestFailed) raise("backup_failed", "danger");
    if (b.latestDoneDay) {
      const since = b.lastDownloadAt ? Math.floor((now.getTime() - Date.parse(b.lastDownloadAt)) / 86_400_000) : null;
      if (since === null || since >= b.remindAfterDays) raise("backup_not_downloaded", "warn", { days: since ?? b.remindAfterDays }, { value: since ?? b.remindAfterDays });
    }
  }
  if (inputs.breakglass && inputs.breakglass.unreviewedWeeks.length) {
    raise("breakglass_unreviewed", "warn", { count: inputs.breakglass.unreviewedWeeks.length }, { value: inputs.breakglass.unreviewedWeeks.length });
  }

  for (const st of inputs.flagged ?? []) {
    const abuse = st.flags.find((f) => f.code === "abuse_reports_new" && f.severity >= 2);
    if (abuse) raise("abuse_reports_spike", "danger", { count: abuse.value ?? 0 }, { key: `abuse_reports_spike:${st.storeId}`, storeId: st.storeId, value: abuse.value ?? 0, notify: "elsewhere" });
    const brand = st.flags.find((f) => f.code === "brand_term_live");
    if (brand) {
      let detail: { term?: unknown; field?: unknown } = {};
      try {
        detail = JSON.parse(brand.detail ?? "{}") as typeof detail;
      } catch {
        detail = {};
      }
      const term = typeof detail.term === "string" ? detail.term.slice(0, 60) : "";
      const field = typeof detail.field === "string" ? detail.field : "";
      raise("brand_term_live", "danger", { field, term }, { key: `brand_term_live:${st.storeId}:${field}`, storeId: st.storeId, notify: "elsewhere" });
    }
  }

  const rank: Record<AlarmLevel, number> = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || ALARM_CODES.indexOf(a.code) - ALARM_CODES.indexOf(b.code) || (a.key < b.key ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* The run's state                                                     */
/* ------------------------------------------------------------------ */

const STATE_MAX_KEYS = 200;

export interface AlarmJobState {
  /** raised key → ISO since */
  raised: Record<string, string>;
  /** recovered key → ISO at (the panel's "Recovered 14:20"), the newest 50 */
  recovered: Record<string, string>;
  /** the break-glass weeks, read at most once an hour (an audit range scan) */
  breakglass?: { hour: string; weeks: string[] };
}

/** The dedupe key of one raised alarm's notification (PLA-§15.2): per code and hour, per store after the code. */
export function alarmDedupeKey(state: Pick<AlarmState, "code" | "storeId">, at: Date): string {
  return state.storeId ? `alarm:${state.code}:${state.storeId}:${hourBucket(at)}` : `alarm:${state.code}:${hourBucket(at)}`;
}

/** The next job state and the alarms to notify (pure). */
export function diffAlarms(prev: AlarmJobState, states: readonly AlarmState[], now: Date): { next: AlarmJobState; raisedNow: AlarmState[]; recoveredNow: string[] } {
  const at = now.toISOString();
  const raised: Record<string, string> = {};
  const raisedNow: AlarmState[] = [];
  for (const s of states) {
    if (raised[s.key]) continue;
    raised[s.key] = prev.raised[s.key] ?? at;
    if (!prev.raised[s.key]) raisedNow.push(s);
  }
  const recoveredNow = Object.keys(prev.raised).filter((k) => !raised[k]);
  const recovered = Object.fromEntries(
    [...Object.entries(prev.recovered).filter(([k]) => !raised[k]), ...recoveredNow.map((k) => [k, at] as [string, string])]
      .sort((a, b) => (a[1] < b[1] ? 1 : -1))
      .slice(0, 50),
  );
  const capped = Object.fromEntries(Object.entries(raised).slice(0, STATE_MAX_KEYS));
  return { next: { raised: capped, recovered, ...(prev.breakglass ? { breakglass: prev.breakglass } : {}) }, raisedNow, recoveredNow };
}
