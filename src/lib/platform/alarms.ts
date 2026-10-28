import "server-only";
/**
 * Platform alarms (docs/STORE-SAAS.md §H.5; platform.md PLA-§15.2, PLA-§5.3, PLA-§6.3.4, PD57, PD68, PD70, PD78).
 *
 *   const states = await evaluateAlarms(now);            // every raised alarm, most severe first (Needs attention)
 *   const run = await runAlarms(systemCtx("platform.alarms"));   // the job: a newly raised alarm → one staff.alarm
 *
 * `alarmsFrom(inputs)` is pure over one snapshot of the platform: the machinery alarms from P8's `getHealth()` (the
 * cheap fields only), the AI alarms relayed from P7's `aiHealth()` (its fields read, never recomputed), and the
 * store-level ones P1 computes from `store_health`, the job's measured window and `platform_usage`. Every source is
 * read on its own: one that throws (a P0 stub before its track merges) leaves its alarms silent.
 *
 * Notification rule (PLA-§15.2): an alarm raised now and not raised at the previous run sends `staff.alarm`
 * `{ alarm, value }` to `platform_staff` with `minRole: "admin"`, deduplicated `alarm:<code>:<YYYY-MM-DDTHH>` (per
 * store: the store id after the code), so a lost state row repeats it at most once an hour; a recovered alarm sends
 * nothing and its time is kept for the panel ("Recovered 14:20"). Three codes are notified by their own writer with the
 * same key: `brand_term_live` (the health job, weekly per store and term), `abuse_reports_spike` (the report action,
 * daily per store), and `signup_capped` is information only (its kind `staff.signup_capped` is the sign-up's).
 *
 * Deviations (CCR r1-p1-4): `getHealth(ctx)` takes a `PlatformCtx` the cron job does not have, so the machinery
 * source is null until P8 accepts the job's `SystemCtx` (those alarms stay silent, never guessed); `gate_mismatch`
 * needs the build's own commit beside `build.gateSha`; `ai_auth_failed` and `ai_refusal_spike` need P7's own verdicts
 * (the frozen `AiHealth` carries no auth state and a 24 h refusal rate, not the hour's 50-run rule).
 */
import type { AiHealth } from "@/lib/ai/summary.server";
import { aiHealth } from "@/lib/ai/summary.server";
import { PLATFORM_TIMEZONE } from "@/lib/auth/config";
import { effectiveSignupMode } from "@/lib/auth/platform-config";
import { listBackupRuns } from "@/lib/backup";
import { scanHealthRows } from "@/lib/health/rows";
import { readHealthJobState } from "@/lib/health/window";
import type { JobResult } from "@/lib/jobs/runner";
import { getPlatformSetting } from "@/lib/settings";
import { periodOf } from "@/lib/tenancy/entitlement-keys";
import { getStoreById } from "@/lib/tenancy/public";
import type { SystemCtx } from "@/lib/tenancy/types";
import { platformUsageValue } from "@/lib/tenancy/usage";
import { alarmDedupeKey, alarmsFrom, diffAlarms, type AlarmInputs, type AlarmJobState, type AlarmState } from "./alarm-rules";
import { hourBucket, staleAfterMin } from "./health-score";
import type { PlatformHealth } from "./health";
import { readJobState, writeJobState } from "./job-state";
import { recordPlatformError } from "./log";
import { notify } from "./notify";

export * from "./alarm-rules";

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

export interface AlarmSources {
  machine(now: Date): Promise<PlatformHealth | null>;
  ai(now: Date): Promise<AiHealth | null>;
  /** the store-level part: the health rows (stale and flagged) and the job's window, one scan */
  stores(now: Date): Promise<Pick<AlarmInputs, "health" | "flagged">>;
  signup(now: Date): Promise<AlarmInputs["signup"]>;
  backup(now: Date): Promise<AlarmInputs["backup"]>;
  breakglass(now: Date): Promise<AlarmInputs["breakglass"]>;
}

const MiB = 1024 * 1024;

/** The store states the alarm scan reads (pending and restricted for their flags; staleness counts `active` only). */
const SCAN_STATES = ["pending", "active", "restricted"] as const;
const SCAN_LIMIT = 5_000;

/** The health rows the alarms read: stale `active` snapshots and the rows at attention ≥ 2 (one statement, rows.ts). */
async function storesSource(now: Date): Promise<Pick<AlarmInputs, "health" | "flagged">> {
  const [setting, state] = await Promise.all([getPlatformSetting("platform").then((p) => p.health), readHealthJobState()]);
  const staleAfter = staleAfterMin(setting.staleAlarmMinutes, state.cycleMin);
  const bound = new Date(now.getTime() - staleAfter * 60_000);
  const rows = await scanHealthRows({ states: SCAN_STATES, computedBefore: bound, attentionMin: 2, limit: SCAN_LIMIT });
  const staleActive = rows.filter((r) => r.status === "active" && (r.computed ? (r.computedAt?.getTime() ?? 0) < bound.getTime() : r.createdAt.getTime() < bound.getTime())).length;
  const flagged = rows.filter((r) => r.flags?.some((f) => f.code === "brand_term_live" || (f.code === "abuse_reports_new" && f.severity >= 2))).map((r) => ({ storeId: r.storeId, flags: r.flags ?? [] }));
  return {
    health: { activeStores: state.rotation, staleActive, staleAfterMin: staleAfter, slowStreak: state.slowStreak, lastP50Ms: state.lastP50Ms },
    flagged,
  };
}

async function signupSource(now: Date): Promise<AlarmInputs["signup"]> {
  const [setting, mode] = await Promise.all([getPlatformSetting("platform"), effectiveSignupMode()]);
  const [pendingToday, pendingMediaBytes] = await Promise.all([platformUsageValue("pending_stores", periodOf("day", now, PLATFORM_TIMEZONE)), platformUsageValue("pending_media_bytes", "total")]);
  return { unguarded: mode.unguarded, pendingToday, cap: setting.signup.pendingStoresPerDay, pendingMediaBytes, pendingMediaBudgetBytes: setting.signup.pendingMediaTotalMiB * MiB };
}

async function backupSource(): Promise<AlarmInputs["backup"]> {
  const [setting, runs] = await Promise.all([getPlatformSetting("platform").then((p) => p.backup), listBackupRuns()]);
  const sorted = [...runs].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return { lastDownloadAt: setting.lastDownloadAt, remindAfterDays: setting.remindAfterDays, latestDoneDay: sorted.find((r) => r.state === "done")?.day ?? null, latestFailed: sorted[0]?.state === "failed" };
}

/**
 * The default sources. Two answer null on `r1/p1`, so their alarms stay silent (never guessed): the machinery one waits
 * for P8 (CCR r1-p1-4 item 1), and the break-glass review read (`breakglass_unreviewed`, PLA-§14.3) is one more
 * cross-store `audit_log` statement in `src/lib/platform/**`, whose pin (5) is re-counted at the P1 merge: its SQL and
 * the pin raise are CCR r1-p1-4 item 5.
 */
export const DEFAULT_ALARM_SOURCES: AlarmSources = {
  machine: async () => null,
  ai: async () => aiHealth(),
  stores: storesSource,
  signup: signupSource,
  backup: backupSource,
  breakglass: async () => null,
};

const notImplemented = (err: unknown) => err instanceof Error && err.message.startsWith("not implemented");

/** Every source on its own; a failing one is null (a P0 stub's `not implemented` is expected and not logged). */
export async function collectAlarmInputs(now: Date, sources: AlarmSources = DEFAULT_ALARM_SOURCES, cached?: { breakglass?: AlarmInputs["breakglass"] }): Promise<AlarmInputs> {
  const safe = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      if (!notImplemented(err)) recordPlatformError(`alarm source ${name}`, err);
      return null;
    }
  };
  const [machine, aiDirect, stores, signup, backup, breakglass] = await Promise.all([
    safe("machine", () => sources.machine(now)),
    safe("ai", () => sources.ai(now)),
    safe("stores", () => sources.stores(now)),
    safe("signup", () => sources.signup(now)),
    safe("backup", () => sources.backup(now)),
    cached?.breakglass !== undefined ? Promise.resolve(cached.breakglass) : safe("breakglass", () => sources.breakglass(now)),
  ]);
  return {
    now,
    machine,
    ai: machine?.ai ?? aiDirect,
    health: stores?.health ?? null,
    flagged: stores?.flagged ?? null,
    signup,
    backup,
    breakglass,
  };
}

/** PLA-§15.2's evaluation at `now` (the console's Needs attention reads it; nothing is sent). */
export async function evaluateAlarms(now: Date = new Date(), sources: AlarmSources = DEFAULT_ALARM_SOURCES): Promise<AlarmState[]> {
  return alarmsFrom(await collectAlarmInputs(now, sources));
}

/* ------------------------------------------------------------------ */
/* The job                                                             */
/* ------------------------------------------------------------------ */

export const ALARM_STATE_KEY = "platform.alarms:state";

async function readAlarmState(): Promise<AlarmJobState> {
  const s = await readJobState<Partial<AlarmJobState>>(ALARM_STATE_KEY).catch(() => null);
  const map = (v: unknown): Record<string, string> =>
    v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
  const bg = s?.breakglass;
  return {
    raised: map(s?.raised),
    recovered: map(s?.recovered),
    ...(bg && typeof bg.hour === "string" && Array.isArray(bg.weeks) ? { breakglass: { hour: bg.hour, weeks: bg.weeks.filter((w): w is string => typeof w === "string").slice(0, 20) } } : {}),
  };
}

export interface AlarmRunReport {
  raised: number;
  notified: number;
  recovered: number;
  codes: string;
}

/**
 * `platform.alarms` (every tick, ≤ 1 s): evaluate, notify each newly raised alarm once (its own writer for the three
 * codes above), keep the raised and recovered times. Never throws on a notification (notify() never does).
 */
export async function runAlarms(ctx: SystemCtx, opts: { now?: Date; sources?: AlarmSources } = {}): Promise<JobResult & { summary: AlarmRunReport }> {
  void ctx;
  const now = opts.now ?? new Date();
  const prev = await readAlarmState();
  const hour = hourBucket(now);
  const cachedBreakglass = prev.breakglass?.hour === hour ? { unreviewedWeeks: prev.breakglass.weeks } : undefined;
  const inputs = await collectAlarmInputs(now, opts.sources ?? DEFAULT_ALARM_SOURCES, cachedBreakglass ? { breakglass: cachedBreakglass } : undefined);
  const states = alarmsFrom(inputs);
  const { next, raisedNow, recoveredNow } = diffAlarms(prev, states, now);
  if (inputs.breakglass) next.breakglass = { hour, weeks: inputs.breakglass.unreviewedWeeks.slice(0, 20) };

  let notified = 0;
  for (const s of raisedNow) {
    if (s.notify !== "self") continue;
    const handle = s.storeId ? ((await getStoreById(s.storeId).catch(() => null))?.handle ?? undefined) : undefined;
    const res = await notify(
      { audience: "platform_staff", minRole: "admin" },
      "staff.alarm",
      { alarm: s.code, ...(s.value !== undefined ? { value: s.value } : {}), ...(handle ? { store: handle, storeId: s.storeId } : {}) },
      { dedupeKey: alarmDedupeKey(s, now), severity: s.level === "danger" ? "danger" : "warn" },
    );
    if ("id" in res) notified++;
  }
  try {
    await writeJobState(ALARM_STATE_KEY, next);
  } catch (err) {
    recordPlatformError("alarm state write", err);
  }
  return { done: true, summary: { raised: states.length, notified, recovered: recoveredNow.length, codes: [...new Set(states.map((s) => s.code))].join(",").slice(0, 300) } };
}

