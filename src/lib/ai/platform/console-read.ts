import "server-only";
/**
 * Console → AI loaders (P7 AI; ai.md AI-§K.2, AI-§O, AI-§F.6-F.9; docs/STORE-SAAS.md §I.8): one loader per panel, so
 * each panel streams and fails alone. Platform data only: counts, shares, models, prices, versions and eval
 * scorecards; a store appears by id, handle and name (the Stores tab, the injection flags), never with a prompt, an
 * output or customer data. Ranges over 2 days read the rollups (`ai_usage_daily`); the run-level reads (the heat-map,
 * the Director dashboard, the injection flags) are bounded by window and row count. Every cross-store statement is
 * annotated `tenancy: platform` (CCR r1-p7-15 counts them for the folder's pin).
 */
import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiBatchItems, aiBatches, aiEvalRuns, aiRuns, aiUsageDaily, plans, stores } from "@/lib/db/schema";
import { getPlatformSetting } from "@/lib/settings";
import { effectivePrices, SEED_PRICES, TASK_CLASSES, type PlatformAiSetting, type PriceRowValue } from "@/lib/settings/keys/platform_ai";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import { canaryBp, promotion, type Promotion } from "../eval/canary-rules";
import { EVAL_SETS, fixturesHash } from "../eval/fixtures";
import { estimateEvalRun, type EvalEstimate } from "../eval/live";
import type { PairwiseScores } from "../eval/pairwise";
import { R1_FAMILIES, SEED_VERSIONS, type R1Family } from "../prompts/registry";
import { keySource } from "../server/key";
import { AI_TASK_IDS, TASKS, type AiTaskId, type TaskClass } from "../tasks";
import { openBatches, type BatchRow } from "./batches";
import {
  addHist,
  daysBetween,
  emptyHist,
  EVAL_MAX_AGE_DAYS,
  histQuantile,
  kpiCell,
  KPI_IDS,
  KPI_MINIMUM,
  KPI_UNIT,
  lastQuarters,
  monthForecast,
  naturalnessVerdict,
  NATURALNESS_SLICE,
  quantile,
  type KpiId,
  type KpiRow,
} from "./console-view";
import { passingRun, type EvalRunRow } from "./eval-runs";
import { promptVersionRows, type PromptVersionRow } from "./prompt-versions";
import { familyRuns7d, versionCounts } from "./rollups";
import { flagDefault, platformHealth } from "./summary";
import { platformSpend } from "./usage";

const DAY = 86_400_000;
const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const num = (v: unknown): number => Number(v ?? 0) || 0;

/** The families whose tasks run on a class (the gate status and the class change rule read them). */
export function familiesOfClass(cls: TaskClass): R1Family[] {
  return R1_FAMILIES.filter((f) => AI_TASK_IDS.some((id) => TASKS[id].family === f && TASKS[id].class === cls));
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export async function loadStatus(now: Date = new Date()) {
  const [health, settings, kills] = await Promise.all([platformHealth(now), getPlatformSetting("platform_ai"), activeKillSwitches()]);
  const tok = settings.probe?.tokPerSec ?? {};
  const totalDrivers = Object.values(health.jobs.drivers).reduce((a, b) => a + (b ?? 0), 0);
  return {
    health,
    killSwitch: kills.includes("ai_generation_enabled"),
    classes: health.classes.map((c) => ({ ...c, tokPerSec: tok[c.class] ?? null, info: c.model ? (settings.modelInfo[c.model] ?? null) : null })),
    drivers: { counts: health.jobs.drivers, n: totalDrivers },
    probeAt: settings.probe?.at ?? null,
  };
}

export async function loadSpend(now: Date = new Date()) {
  const [spend, settings] = await Promise.all([platformSpend(now), getPlatformSetting("platform_ai")]);
  const monthStart = `${spend.month}-01`;
  // tenancy: platform ai_usage_daily cost per day across stores (AI-§O cost dashboard): sums only
  const days = await db
    .select({ day: aiUsageDaily.day, micros: sql<number>`SUM(${aiUsageDaily.costMicros})` })
    .from(aiUsageDaily)
    .where(gte(aiUsageDaily.day, monthStart))
    .groupBy(aiUsageDaily.day)
    .orderBy(aiUsageDaily.day);
  const f = monthForecast(spend.monthMicros, now);
  return {
    ...spend,
    forecastMicros: f.forecastMicros,
    elapsedDays: f.elapsedDays,
    daysInMonth: f.daysInMonth,
    pendingSharePct: settings.caps.pendingSharePct,
    series: days.map((d) => ({ day: String(d.day), micros: num(d.micros) })),
  };
}

/** Refusals, fallbacks, invalid outputs and errors over 7 days from the rollups, with the day series. */
export async function loadReliability(now: Date = new Date()) {
  const since = ymd(new Date(now.getTime() - 6 * DAY));
  // tenancy: platform ai_usage_daily outcomes per day across stores (AI-§O refusals and fallbacks): sums only
  const rows = await db
    .select({
      day: aiUsageDaily.day,
      runs: sql<number>`SUM(${aiUsageDaily.runs})`,
      refused: sql<number>`SUM(${aiUsageDaily.refused})`,
      fallbacks: sql<number>`SUM(${aiUsageDaily.fallbacks})`,
      invalid: sql<number>`SUM(${aiUsageDaily.invalid})`,
      errors: sql<number>`SUM(${aiUsageDaily.errors})`,
      cacheHits: sql<number>`SUM(${aiUsageDaily.cacheHits})`,
    })
    .from(aiUsageDaily)
    .where(and(eq(aiUsageDaily.provider, "server"), gte(aiUsageDaily.day, since)))
    .groupBy(aiUsageDaily.day)
    .orderBy(aiUsageDaily.day);
  const series = rows.map((r) => ({ day: String(r.day), runs: num(r.runs), refused: num(r.refused), fallbacks: num(r.fallbacks), invalid: num(r.invalid), errors: num(r.errors), cacheHits: num(r.cacheHits) }));
  const sum = (k: "runs" | "refused" | "fallbacks" | "invalid" | "errors" | "cacheHits") => series.reduce((a, r) => a + r[k], 0);
  return { series, runs: sum("runs"), refused: sum("refused"), fallbacks: sum("fallbacks"), invalid: sum("invalid"), errors: sum("errors"), cacheHits: sum("cacheHits") };
}

/** The ten KPIs of AI-§F.9, newest quarter first; a cell below its minimum carries no number. */
export async function loadKpis(now: Date = new Date()): Promise<{ quarters: string[]; rows: KpiRow[] }> {
  const qs = lastQuarters(now, 4);
  const from = qs[qs.length - 1]!.start;
  const qIndex = (d: Date) => qs.findIndex((q) => d >= q.start && d < q.end);
  const copyTasks = AI_TASK_IDS.filter((id) => TASKS[id].family?.startsWith("copy.") && TASKS[id].class);
  const [gen, evals, settings] = await Promise.all([
    // tenancy: platform ai_runs generations per quarter across stores (AI-§F.9 #3 and #8): counts and cost only
    db
      .select({
        q: sql<string>`CONCAT(YEAR(${aiRuns.createdAt}), '-Q', QUARTER(${aiRuns.createdAt}))`,
        generations: sql<number>`COUNT(*)`,
        distinct: sql<number>`COUNT(DISTINCT ${aiRuns.storeId}, ${aiRuns.inputHash})`,
        ok: sql<number>`SUM(${aiRuns.status} = 'ok')`,
        cost: sql<number>`SUM(COALESCE(${aiRuns.costMicros}, 0))`,
      })
      .from(aiRuns)
      .where(and(eq(aiRuns.provider, "server"), sql`${aiRuns.via} <> 'cache'`, inArray(aiRuns.task, copyTasks.length ? copyTasks : ["-"]), gte(aiRuns.createdAt, from)))
      .groupBy(sql`1`),
    // ai_eval_runs is a P table: the live, calibration and preference runs of the four quarters
    db
      .select({ kind: aiEvalRuns.kind, createdAt: aiEvalRuns.createdAt, pairwise: aiEvalRuns.pairwise, report: aiEvalRuns.report, status: aiEvalRuns.status })
      .from(aiEvalRuns)
      .where(and(inArray(aiEvalRuns.kind, ["live", "calibration", "preference"]), eq(aiEvalRuns.status, "done"), gte(aiEvalRuns.createdAt, from)))
      .orderBy(desc(aiEvalRuns.createdAt))
      .limit(200),
    getPlatformSetting("platform_ai"),
  ]);
  void settings;
  const cells: Record<KpiId, { value: number | null; n: number }[]> = Object.fromEntries(KPI_IDS.map((k) => [k, qs.map(() => ({ value: null, n: 0 }))])) as Record<KpiId, { value: number | null; n: number }[]>;
  for (const r of gen) {
    const i = qs.findIndex((q) => q.label === r.q);
    if (i < 0) continue;
    const g = num(r.generations);
    const d = num(r.distinct);
    cells.regenerate[i] = { value: g > 0 ? (g - d) / g : null, n: g };
    const ok = num(r.ok);
    cells.cost_per_accepted[i] = { value: ok > 0 ? num(r.cost) / ok / 1_000_000 : null, n: ok };
  }
  const labels: number[][] = qs.map(() => []);
  for (const e of evals) {
    const i = qIndex(e.createdAt);
    if (i < 0) continue;
    if (e.kind === "live" && e.pairwise && cells.win_rate[i]!.n === 0) {
      const p = e.pairwise as unknown as PairwiseScores;
      cells.win_rate[i] = { value: typeof p.overall?.winRate === "number" ? p.overall.winRate : null, n: 1 };
    } else if (e.kind === "live" && e.pairwise) cells.win_rate[i]!.n++;
    const rep = parseReport(e.report);
    if (e.kind === "calibration" && Array.isArray(rep.labels)) labels[i]!.push(...rep.labels.map((l: { score?: unknown }) => Number(l.score)).filter((s: number) => s >= 1 && s <= 5));
    if (e.kind === "preference" && cells.director_lift[i]!.n === 0 && typeof rep.lowerBound === "number") cells.director_lift[i] = { value: rep.lowerBound, n: num(rep.pairs) };
  }
  labels.forEach((l, i) => {
    const v = naturalnessVerdict(l);
    cells.naturalness[i] = { value: v.mean, n: l.length };
  });
  return {
    quarters: qs.map((q) => q.label),
    rows: KPI_IDS.map((id) => ({ id, unit: KPI_UNIT[id], minimum: KPI_MINIMUM[id], cells: cells[id].map((c) => kpiCell(id, c.value, c.n)) })),
  };
}

/** A report column as an object (eval reports are JSON; a bad one reads as empty). */
function parseReport(report: string | null): Record<string, unknown> & { labels?: { score?: unknown; caseId?: string }[]; lowerBound?: number; pairs?: number } {
  if (!report) return {};
  try {
    const v = JSON.parse(report) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function loadDirectorDefault() {
  const settings = await getPlatformSetting("platform_ai");
  return { auto: settings.directorAutoDefault, test: settings.preferenceTest };
}

/* ------------------------------------------------------------------ */
/* Classes & routes                                                    */
/* ------------------------------------------------------------------ */

/** Passing full live runs ≤ 14 days old on the current fixtures hash, per family (the class gate status). */
async function recentLiveRuns(now: Date): Promise<EvalRunRow[]> {
  // ai_eval_runs is a P table
  return db
    .select()
    .from(aiEvalRuns)
    .where(and(eq(aiEvalRuns.kind, "live"), eq(aiEvalRuns.passed, true), gte(aiEvalRuns.createdAt, new Date(now.getTime() - EVAL_MAX_AGE_DAYS * DAY))))
    .orderBy(desc(aiEvalRuns.createdAt))
    .limit(200);
}

/** The newest passing live run for `model` on a family of the class, on that family's current fixtures hash. */
export function gateRunFor(runs: readonly EvalRunRow[], cls: TaskClass, model: string): EvalRunRow | null {
  const fams = new Set<string>(familiesOfClass(cls));
  return runs.find((r) => fams.has(r.task) && r.model === model && r.fixturesHash === fixturesHash(r.task as R1Family)) ?? null;
}

export async function loadClasses(now: Date = new Date()) {
  const [settings, runs] = await Promise.all([getPlatformSetting("platform_ai"), recentLiveRuns(now)]);
  const tok = settings.probe?.tokPerSec ?? {};
  const classes = TASK_CLASSES.map((cls) => {
    const c = settings.classes[cls];
    const gate = gateRunFor(runs, cls, c.model);
    const jury = cls === "worker" ? [settings.evalGate.judgeModel] : [...settings.evalGate.jury[cls]];
    return {
      class: cls,
      ...c,
      info: c.model ? (settings.modelInfo[c.model] ?? null) : null,
      tokPerSec: tok[cls] ?? null,
      gate: gate ? { runId: gate.id, family: gate.task, at: gate.createdAt.toISOString() } : null,
      families: familiesOfClass(cls),
      jury,
    };
  });
  const routes = AI_TASK_IDS.filter((id) => TASKS[id].class && TASKS[id].release === "R1").map((id) => {
    const t = TASKS[id];
    const r = settings.routes[id] ?? {};
    const cls = t.class!;
    return {
      task: id,
      class: cls,
      pattern: t.pattern,
      enabled: r.enabled ?? true,
      effort: r.effort ?? null,
      fast: r.fast ?? false,
      deadlineMs: r.deadlineMs ?? null,
      maxTokens: r.maxTokens ?? null,
      defaults: { effort: t.effort ?? settings.classes[cls].effort, deadlineMs: t.deadlineMs ?? settings.classes[cls].timeoutMs, maxTokens: t.maxTokens ?? settings.classes[cls].maxTokens },
      // fast mode: Opus 5.5 / Opus 5 / Opus 4.8 only, never with Batches (AI-§B.2)
      fastAllowed: /^claude-opus-(5-5|5|4-8)$/.test(settings.classes[cls].model) && t.batch !== "always",
      autoPrefersCloud: settings.autoPrefersCloud[id] === true,
    };
  });
  const caps = settings.caps;
  return {
    classes,
    routes,
    passCaps: { director: caps.directorPassesPerStorePerDay, deep: caps.deepPassesPerStorePerDay },
    concurrency: { director: caps.concurrentDirector, worker: caps.concurrentWorker, fast: caps.concurrentFast, perStoreWorker: caps.perStoreWorker },
  };
}

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

export async function loadPrices(now: Date = new Date()) {
  const settings = await getPlatformSetting("platform_ai");
  const { rows, notes } = effectivePrices(settings.prices);
  const since = ymd(new Date(now.getTime() - 30 * DAY));
  // tenancy: platform ai_usage_daily served model ids across stores (unknown ids flagged "price missing"): ids only
  const served = await db.selectDistinct({ model: aiUsageDaily.model }).from(aiUsageDaily).where(and(eq(aiUsageDaily.provider, "server"), gte(aiUsageDaily.day, since)));
  const inUse = new Set<string>([...TASK_CLASSES.map((c) => settings.classes[c].model), ...served.map((s) => s.model).filter(Boolean)]);
  const probed = settings.probe?.prices ?? {};
  const list: { model: string; row: PriceRowValue | null; stored: boolean; seed: boolean; verify: boolean; notes: Partial<Record<keyof PriceRowValue, "derived" | "verify">>; inUse: boolean }[] = [];
  for (const model of [...new Set([...Object.keys(rows), ...inUse])].sort()) {
    const row = rows[model] ?? null;
    const stored = Object.hasOwn(settings.prices, model);
    list.push({ model, row, stored, seed: Object.hasOwn(SEED_PRICES, model) && !stored, verify: row !== null && !stored && !Object.hasOwn(probed, model), notes: notes[model] ?? {}, inUse: inUse.has(model) });
  }
  return { rows: list, probeAt: settings.probe?.at ?? null };
}

/* ------------------------------------------------------------------ */
/* Prompts & evals                                                     */
/* ------------------------------------------------------------------ */

export interface VersionView {
  version: string;
  provider: "server" | "local";
  /** the frozen launch version (never rolled back to anything) */
  seed: boolean;
  status: PromptVersionRow["status"];
  canaryBp: number;
  canaryStartedAt: string | null;
  canaryRuns: number;
  rolledBackAt: string | null;
  rollbackReason: string | null;
  notes: string | null;
  activatedAt: string | null;
  /** a passing smoke or full run ≤ 14 days on the current fixtures hash (enough to canary) */
  canaryRun: { id: string; kind: string; at: string } | null;
  /** a passing full run (needed to promote) */
  liveRun: { id: string; at: string } | null;
  promotion: Promotion | null;
  days: number | null;
}

export interface EvalRunView {
  id: string;
  kind: EvalRunRow["kind"];
  version: string;
  model: string | null;
  status: EvalRunRow["status"];
  passed: boolean | null;
  at: string;
  costMicros: number;
  judgeCostMicros: number;
  hashCurrent: boolean;
  gate: EvalRunRow["gate"];
  scores: { schemaValid: number | null; refusalRate: number | null; rejectRate: number | null; lengthFit: number | null; diversity: number | null; cliche: number | null } | null;
  pairwise: { winRate: number; lower: number; upper: number; n: number; floor: number; properties: { property: string; winRate: number; lower: number; agreement: number | null; counted: boolean }[] } | null;
}

function scoreView(s: unknown): EvalRunView["scores"] {
  if (!s || typeof s !== "object") return null;
  const v = s as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const div = v.diversity && typeof v.diversity === "object" ? n((v.diversity as Record<string, unknown>).value) : null;
  return { schemaValid: n(v.schemaValid), refusalRate: n(v.refusalRate), rejectRate: n(v.rejectRate), lengthFit: n(v.lengthFit), diversity: div, cliche: n(v.cliche) };
}

function pairView(p: unknown): EvalRunView["pairwise"] {
  if (!p || typeof p !== "object") return null;
  const v = p as PairwiseScores;
  if (!v.overall) return null;
  return {
    winRate: v.overall.winRate,
    lower: v.overall.lower,
    upper: v.overall.upper,
    n: v.overall.n,
    floor: v.floor,
    properties: (v.properties ?? []).map((x) => ({ property: String(x.property), winRate: x.winRate, lower: x.lower, agreement: x.agreement, counted: x.counted })),
  };
}

export function evalRunView(r: EvalRunRow): EvalRunView {
  return {
    id: r.id,
    kind: r.kind,
    version: r.promptVersion,
    model: r.model,
    status: r.status,
    passed: r.passed,
    at: r.createdAt.toISOString(),
    costMicros: r.costMicros,
    judgeCostMicros: r.judgeCostMicros,
    hashCurrent: (R1_FAMILIES as readonly string[]).includes(r.task) && r.fixturesHash === fixturesHash(r.task as R1Family),
    gate: r.gate,
    scores: scoreView(r.scores),
    pairwise: pairView(r.pairwise),
  };
}

/** The canary's whole days, generations and gate, as AI-§F.8 reads them. */
export async function canaryPromotion(row: PromptVersionRow, settings: PlatformAiSetting, now: Date): Promise<{ promotion: Promotion; days: number }> {
  const family = row.task as R1Family;
  const days = row.canaryStartedAt ? daysBetween(row.canaryStartedAt, now) : 0;
  const live = await passingRun(family, row.version, "live", fixturesHash(family), EVAL_MAX_AGE_DAYS, now);
  return { promotion: promotion({ days, generations: row.canaryRuns, rolledBack: row.rolledBackAt !== null, liveGatePassed: live !== null }, settings.evalGate.canary), days };
}

export async function loadPrompts(now: Date = new Date()) {
  const [settings, rows, runs7d] = await Promise.all([getPlatformSetting("platform_ai"), promptVersionRows(), familyRuns7d(now)]);
  // ai_eval_runs is a P table: the latest runs of every family
  const evalRows = await db.select().from(aiEvalRuns).where(gte(aiEvalRuns.createdAt, new Date(now.getTime() - 90 * DAY))).orderBy(desc(aiEvalRuns.createdAt)).limit(300);
  const families = await Promise.all(
    R1_FAMILIES.map(async (family) => {
      const hash = fixturesHash(family);
      const versions = rows.filter((r) => r.task === family);
      const active = settings.promptVersions[family] ?? SEED_VERSIONS[family].server;
      const runs = evalRows.filter((r) => r.task === family);
      const fresh = (r: EvalRunRow) => r.passed === true && r.fixturesHash === hash && now.getTime() - r.createdAt.getTime() <= EVAL_MAX_AGE_DAYS * DAY;
      const views: VersionView[] = await Promise.all(
        versions.map(async (v) => {
          const mine = runs.filter((r) => r.promptVersion === v.version && fresh(r));
          const canaryRun = mine.find((r) => r.kind === "smoke" || r.kind === "live") ?? null;
          const liveRun = mine.find((r) => r.kind === "live") ?? null;
          const promo = v.status === "canary" ? await canaryPromotion(v, settings, now) : null;
          return {
            version: v.version,
            provider: v.provider,
            seed: v.version === SEED_VERSIONS[family].server,
            status: v.version === active && v.provider === "server" && v.status !== "canary" ? "active" : v.status,
            canaryBp: v.canaryBp,
            canaryStartedAt: v.canaryStartedAt?.toISOString() ?? null,
            canaryRuns: v.canaryRuns,
            rolledBackAt: v.rolledBackAt?.toISOString() ?? null,
            rollbackReason: v.rollbackReason,
            notes: v.notes,
            activatedAt: v.activatedAt?.toISOString() ?? null,
            canaryRun: canaryRun ? { id: canaryRun.id, kind: canaryRun.kind, at: canaryRun.createdAt.toISOString() } : null,
            liveRun: liveRun ? { id: liveRun.id, at: liveRun.createdAt.toISOString() } : null,
            promotion: promo?.promotion ?? null,
            days: promo?.days ?? null,
          };
        }),
      );
      const canary = versions.find((v) => v.status === "canary");
      const online = canary ? await versionCounts([canary.version, active], canary.canaryStartedAt ?? new Date(now.getTime() - 7 * DAY)) : null;
      const weekly = runs7d.get(family) ?? 0;
      const estimates: { smoke: EvalEstimate | null; live: EvalEstimate | null } = {
        smoke: estimateEvalRun({ family, kind: "smoke", version: active }, settings),
        live: estimateEvalRun({ family, kind: "live", version: active }, settings),
      };
      return {
        family,
        hash,
        active,
        versions: views,
        runs: runs.slice(0, 8).map(evalRunView),
        weeklyRuns: weekly,
        slice: canaryBp(weekly, settings.evalGate.canary),
        online: online ? Object.fromEntries([...online.entries()].map(([k, v]) => [k, v])) : null,
        estimates,
      };
    }),
  );
  // the calibration queue: properties a judge disagrees on (below the agreement minimum), from the latest live runs
  const queue: { family: string; property: string; agreement: number | null; runId: string }[] = [];
  for (const f of families) {
    const latest = f.runs.find((r) => r.kind === "live" && r.pairwise);
    for (const p of latest?.pairwise?.properties ?? []) if (!p.counted) queue.push({ family: f.family, property: p.property, agreement: p.agreement, runId: latest!.id });
  }
  const calibrations = evalRows.filter((r) => r.kind === "calibration").slice(0, 5).map((r) => ({ id: r.id, at: r.createdAt.toISOString(), passed: r.passed, ...naturalnessVerdict((parseReport(r.report).labels ?? []).map((l) => Number(l.score))) }));
  const preferences = evalRows.filter((r) => r.kind === "preference").slice(0, 5).map((r) => ({ id: r.id, at: r.createdAt.toISOString(), passed: r.passed, lowerBound: Number(parseReport(r.report).lowerBound ?? 0), pairs: Number(parseReport(r.report).pairs ?? 0) }));
  return { families, rubricVersion: settings.rubricVersion, queue, calibrations, preferences, preferenceTest: settings.preferenceTest, directorAutoDefault: settings.directorAutoDefault, minAgreement: settings.evalGate.minJudgeAgreement };
}

/** The 40-case naturalness slice (AI-§F.5, QUAL-30): the copy families' Arabic and French cases, case metadata only. */
export function naturalnessCases(): { id: string; family: string; locale: string; group: string; product: string }[] {
  const out: { id: string; family: string; locale: string; group: string; product: string }[] = [];
  for (const family of ["copy.page", "copy.hero", "copy.field"] as const) {
    for (const f of EVAL_SETS[family].fixtures) {
      if (f.locale !== "ar" && f.locale !== "fr") continue;
      const input = f.input as { product?: { name?: string } };
      out.push({ id: f.id, family, locale: f.locale, group: f.group, product: String(input.product?.name ?? "").slice(0, 60) });
    }
  }
  return out.slice(0, NATURALNESS_SLICE.cases);
}

/* ------------------------------------------------------------------ */
/* Stores                                                              */
/* ------------------------------------------------------------------ */

export async function loadTopStores(opts: { plan?: string | null } = {}, now: Date = new Date()) {
  const monthStart = `${ymd(now).slice(0, 7)}-01`;
  const planCond = opts.plan ? eq(stores.planId, opts.plan) : undefined;
  // tenancy: platform ai_usage_daily per store this month (AI-§O top consumers): sums, the store's name and plan
  const rows = await db
    .select({
      storeId: aiUsageDaily.storeId,
      handle: stores.handle,
      name: stores.name,
      plan: stores.planId,
      status: stores.status,
      credits: sql<number>`SUM(${aiUsageDaily.credits})`,
      cost: sql<number>`SUM(${aiUsageDaily.costMicros})`,
      runs: sql<number>`SUM(${aiUsageDaily.runs})`,
      cacheHits: sql<number>`SUM(${aiUsageDaily.cacheHits})`,
      refused: sql<number>`SUM(${aiUsageDaily.refused})`,
    })
    .from(aiUsageDaily)
    .innerJoin(stores, eq(stores.id, aiUsageDaily.storeId))
    .where(and(gte(aiUsageDaily.day, monthStart), planCond))
    .groupBy(aiUsageDaily.storeId, stores.handle, stores.name, stores.planId, stores.status)
    .orderBy(sql`SUM(${aiUsageDaily.costMicros}) DESC`, sql`SUM(${aiUsageDaily.credits}) DESC`)
    .limit(25);
  // plans is a P table
  const planRows = await db.select({ id: plans.id, name: plans.name }).from(plans).orderBy(plans.sort);
  return {
    plans: planRows,
    rows: rows.map((r) => ({ storeId: r.storeId, handle: r.handle, name: r.name, plan: r.plan, status: r.status, credits: num(r.credits), costMicros: num(r.cost), runs: num(r.runs), cacheHits: num(r.cacheHits), refused: num(r.refused) })),
  };
}

/** The store row the console's store AI page heads with (name, handle, plan, status) by id or handle, or null. */
export async function storeHead(idOrHandle: string) {
  const byId = /^[0-9A-HJKMNP-TV-Z]{26}$/.test(idOrHandle);
  // stores is the tenancy root (no store_id column): one row by id or handle
  const [row] = await db.select({ id: stores.id, handle: stores.handle, name: stores.name, plan: stores.planId, status: stores.status }).from(stores).where(byId ? eq(stores.id, idOrHandle) : eq(stores.handle, idOrHandle)).limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Quality                                                             */
/* ------------------------------------------------------------------ */

const HEAT_ROWS = 5_000;

/** The guard-rejection heat-map, field × locale × provider, over 7 days (field names only). */
export async function loadHeatmap(now: Date = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY);
  // tenancy: platform ai_runs rejected field names across stores (AI-§O quality heat-map): names and counts only
  const rejected = await db
    .select({ locale: aiRuns.locale, provider: aiRuns.provider, fields: aiRuns.rejectedFields })
    .from(aiRuns)
    .where(and(gte(aiRuns.createdAt, since), isNotNull(aiRuns.rejectedFields)))
    .orderBy(desc(aiRuns.createdAt))
    .limit(HEAT_ROWS);
  // tenancy: platform ai_runs per locale and provider across stores (the heat-map's denominators): counts only
  const totals = await db
    .select({ locale: aiRuns.locale, provider: aiRuns.provider, n: sql<number>`COUNT(*)` })
    .from(aiRuns)
    .where(and(gte(aiRuns.createdAt, since), inArray(aiRuns.status, ["ok", "refused", "invalid_output", "max_tokens"])))
    .groupBy(aiRuns.locale, aiRuns.provider);
  const cols = totals.map((t) => ({ key: `${t.locale ?? "-"}|${t.provider}`, locale: t.locale ?? "-", provider: t.provider, n: num(t.n) })).sort((a, b) => b.n - a.n);
  const cells = new Map<string, number>();
  const fields = new Map<string, number>();
  for (const r of rejected) {
    for (const f of r.fields ?? []) {
      const field = String(f).slice(0, 48);
      const k = `${field}§${r.locale ?? "-"}|${r.provider}`;
      cells.set(k, (cells.get(k) ?? 0) + 1);
      fields.set(field, (fields.get(field) ?? 0) + 1);
    }
  }
  const rows = [...fields.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([field, total]) => ({ field, total, cells: cols.map((c) => cells.get(`${field}§${c.key}`) ?? 0) }));
  return { cols, rows };
}

/** Latency p50 / p95 per task and provider over 7 days, from the rollups' histograms. */
export async function loadLatency(now: Date = new Date()) {
  const since = ymd(new Date(now.getTime() - 6 * DAY));
  // tenancy: platform ai_usage_daily histograms per task and provider across stores (AI-§O latency): sums only
  const rows = await db.select({ task: aiUsageDaily.task, provider: aiUsageDaily.provider, runs: aiUsageDaily.runs, hist: aiUsageDaily.msHist }).from(aiUsageDaily).where(gte(aiUsageDaily.day, since)).limit(20_000);
  const m = new Map<string, { task: string; provider: string; n: number; hist: number[] }>();
  for (const r of rows) {
    const k = `${r.task}|${r.provider}`;
    const e = m.get(k) ?? { task: r.task, provider: r.provider, n: 0, hist: emptyHist() };
    e.n += r.runs;
    addHist(e.hist, r.hist);
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).map((e) => ({ task: e.task, provider: e.provider, n: e.n, p50: histQuantile(e.hist, 0.5), p95: histQuantile(e.hist, 0.95) }));
}

/** Outcome counts per task over 7 days: invalid outputs, max_tokens, refusals, PII redactions, injection flags. */
export async function loadOutcomes(now: Date = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY);
  // tenancy: platform ai_runs outcomes per task across stores (AI-§O quality counts): counts only
  const rows = await db
    .select({
      task: aiRuns.task,
      n: sql<number>`COUNT(*)`,
      invalid: sql<number>`SUM(${aiRuns.status} = 'invalid_output')`,
      maxTokens: sql<number>`SUM(${aiRuns.status} = 'max_tokens')`,
      refused: sql<number>`SUM(${aiRuns.status} = 'refused')`,
      pii: sql<number>`SUM(${aiRuns.flags} LIKE '%"pii_redacted"%')`,
      injection: sql<number>`SUM(${aiRuns.flags} LIKE '%"injection_suspected"%')`,
    })
    .from(aiRuns)
    .where(and(gte(aiRuns.createdAt, since), eq(aiRuns.provider, "server")))
    .groupBy(aiRuns.task);
  return rows.map((r) => ({ task: r.task, n: num(r.n), invalid: num(r.invalid), maxTokens: num(r.maxTokens), refused: num(r.refused), pii: num(r.pii), injection: num(r.injection) })).sort((a, b) => b.n - a.n);
}

/** Runs flagged `injection_suspected` in 30 days (metadata only); a screened row can be cleared by staff. */
export async function loadInjectionFlags(now: Date = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  // tenancy: platform ai_runs flagged rows across stores (AI-§E.3 human look): ids, task and store handle only
  const rows = await db
    .select({ id: aiRuns.id, storeId: aiRuns.storeId, handle: stores.handle, task: aiRuns.task, provider: aiRuns.provider, at: aiRuns.createdAt, locale: aiRuns.locale })
    .from(aiRuns)
    .innerJoin(stores, eq(stores.id, aiRuns.storeId))
    .where(and(gte(aiRuns.createdAt, since), sql`${aiRuns.flags} LIKE '%"injection_suspected"%'`))
    .orderBy(desc(aiRuns.createdAt))
    .limit(50);
  return rows.map((r) => ({ id: r.id, storeId: r.storeId, handle: r.handle, task: r.task, provider: r.provider, at: r.at.toISOString(), locale: r.locale, screened: r.task === "injection.screen" }));
}

/** The Director dashboard (AI-§O): plan and critique latency, cost per pass, fallbacks and critic flags, by class. */
export async function loadDirector(now: Date = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const tasks = AI_TASK_IDS.filter((id) => TASKS[id].caps?.passCounter === "director" || TASKS[id].family === "director.plan" || TASKS[id].family === "director.critique");
  // tenancy: platform ai_runs of the Director tasks across stores (AI-§O Director dashboard): timings, cost and flags only
  const rows = await db
    .select({ task: aiRuns.task, class: aiRuns.class, ms: aiRuns.ms, status: aiRuns.status, cost: aiRuns.costMicros, flags: aiRuns.flags, outTok: aiRuns.outTok })
    .from(aiRuns)
    .where(and(gte(aiRuns.createdAt, since), eq(aiRuns.provider, "server"), inArray(aiRuns.task, tasks.length ? tasks : ["-"]), lt(aiRuns.createdAt, now)))
    .orderBy(desc(aiRuns.createdAt))
    .limit(HEAT_ROWS);
  const m = new Map<string, { task: string; class: string; ms: number[]; n: number; cost: number; fallback: number; contradiction: number; repairRejected: number; ok: number }>();
  for (const r of rows) {
    const k = `${r.task}|${r.class ?? "-"}`;
    const e = m.get(k) ?? { task: r.task, class: r.class ?? "-", ms: [], n: 0, cost: 0, fallback: 0, contradiction: 0, repairRejected: 0, ok: 0 };
    e.n++;
    if (r.status !== "running") e.ms.push(r.ms);
    if (r.status === "ok") e.ok++;
    e.cost += r.cost ?? 0;
    const f = r.flags ?? [];
    if (f.includes("director_fallback")) e.fallback++;
    if (f.includes("critic_contradiction")) e.contradiction++;
    if (f.includes("repair_rejected")) e.repairRejected++;
    m.set(k, e);
  }
  const plans = rows.filter((r) => TASKS[r.task as AiTaskId]?.family === "director.plan").length;
  const cost = rows.reduce((a, r) => a + (r.cost ?? 0), 0);
  return {
    rows: [...m.values()].map((e) => ({ task: e.task, class: e.class, n: e.n, ok: e.ok, p50: quantile(e.ms, 0.5), p95: quantile(e.ms, 0.95), cost: e.cost, fallback: e.fallback, contradiction: e.contradiction, repairRejected: e.repairRejected })),
    passes: plans,
    costPerPassMicros: plans > 0 ? Math.round(cost / plans) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Batches                                                             */
/* ------------------------------------------------------------------ */

export async function loadBatches() {
  const open = await openBatches();
  // ai_batches is a P table: the 20 newest
  const recent = await db.select().from(aiBatches).orderBy(desc(aiBatches.createdAt)).limit(20);
  const ids = [...new Set([...open, ...recent].map((b) => b.id))];
  // tenancy: platform ai_batch_items failed per batch across stores (AI-§K.2 retry failed items): counts only
  const failed = ids.length
    ? await db
        .select({ batchId: aiBatchItems.batchId, n: sql<number>`COUNT(*)` })
        .from(aiBatchItems)
        .where(and(inArray(aiBatchItems.batchId, ids), inArray(aiBatchItems.state, ["errored", "expired", "dropped"])))
        .groupBy(aiBatchItems.batchId)
    : [];
  const fails = new Map(failed.map((f) => [f.batchId ?? "", num(f.n)]));
  const view = (b: BatchRow) => ({
    id: b.id,
    kind: b.kind,
    model: b.model,
    status: b.status,
    items: b.items,
    succeeded: b.succeeded,
    errored: b.errored,
    expired: b.expired,
    canceled: b.canceled,
    costMicros: b.costMicros,
    createdAt: b.createdAt.toISOString(),
    endedAt: b.endedAt?.toISOString() ?? null,
    failedItems: fails.get(b.id) ?? 0,
  });
  const openIds = new Set(open.map((b) => b.id));
  return { open: open.map(view), recent: recent.filter((b) => !openIds.has(b.id)).map(view) };
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function loadConsoleSettings() {
  const [settings, source, secret, detached] = await Promise.all([
    getPlatformSetting("platform_ai"),
    keySource(),
    getPlatformSetting("platform_ai_secret").catch(() => ({ apiKey: undefined, setAt: undefined }) as { apiKey?: string; setAt?: string }),
    flagDefault("ai_detached_jobs"),
  ]);
  const c = settings.caps;
  return {
    enabled: settings.enabled,
    keySource: source,
    // never the key: whether one is stored and when
    keySet: typeof secret.apiKey === "string" && secret.apiKey.length > 0,
    keySetAt: secret.setAt ?? null,
    caps: { monthlyUsd: c.monthlyUsd, storeDailyCapPct: c.storeDailyCapPct, directorSharePct: c.directorSharePct, pendingSharePct: c.pendingSharePct, pendingDailyFloor: c.pendingDailyFloor },
    concurrency: { director: c.concurrentDirector, worker: c.concurrentWorker, fast: c.concurrentFast, perStoreWorker: c.perStoreWorker },
    passCaps: { director: c.directorPassesPerStorePerDay, deep: c.deepPassesPerStorePerDay },
    transport: settings.streamTransport,
    cacheTtl: settings.cacheTtl.platform,
    fallbacks: settings.fallbacks,
    patternLibrary: settings.patternLibrary,
    detached: { flag: detached, probedAt: settings.probe?.detachedJob?.at ?? null },
  };
}
