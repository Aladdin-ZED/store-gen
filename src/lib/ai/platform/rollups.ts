import "server-only";
/**
 * The platform half of `ai.rollups` (P7 AI; ai.md AI-§F.7, AI-§F.8, AI-§O "Alarms"; AI-07 (3), (7); docs/STORE-SAAS.md
 * D64). Hourly, after the per-store usage rows (../store/usage-daily.ts):
 *   - per canary version: its online counts since the canary started and the active version's over the same window
 *     (one grouped read of `ai_runs` across stores), the rollback rules of ../eval/canary-rules.ts (on ≥ 20
 *     generations: guard rejections 2×, invalid + refusal + timeout 2×, regenerate-before-choose + 10 points) → the
 *     canary `retired` with `notes = "auto-rollback: <metric>"`, the audit row `platform.ai.prompt_rolled_back`, the
 *     staff notification `ai.canary_rolled_back`; otherwise the volume-scaled slice `canary_bp` recomputed from the
 *     family's 7-day volume and `canary_runs` written, and the promotion state reported;
 *   - the staff alarms of AI-§O that the hour's runs and the spend show (each deduplicated per window).
 * Every cross-store read here is annotated and counted in the pin (CCR r1-p7-8); `prompt_versions` is a P table.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiRuns, aiUsageDaily, promptVersions } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/platform/notify";
import { getPlatformSetting } from "@/lib/settings";
import { canaryBp, promotion, rollbackReasons, type Promotion, type VersionStats } from "../eval/canary-rules";
import { fixturesHash } from "../eval/fixtures";
import { R1_FAMILIES, type R1Family } from "../prompts/registry";
import { TASKS, type AiTaskId } from "../tasks";
import { passingRun } from "./eval-runs";
import { invalidateCanaries } from "./prompt-versions";
import { platformSpend } from "./usage";

type Counts = Omit<VersionStats, "keptWithoutEdit">;

/** The online counts of each version since `since` (server runs, cache hits excluded). */
export async function versionCounts(versions: readonly string[], since: Date): Promise<Map<string, Counts>> {
  if (!versions.length) return new Map();
  // tenancy: platform ai_runs per prompt version across stores (AI-§F.7 online metrics, AI-§F.8 canary): counts only, no store data leaves
  const rows = await db
    .select({
      version: aiRuns.promptVersion,
      generations: sql<number>`COUNT(*)`,
      invalid: sql<number>`SUM(${aiRuns.status} = 'invalid_output')`,
      refusals: sql<number>`SUM(${aiRuns.status} = 'refused')`,
      timeouts: sql<number>`SUM(${aiRuns.status} = 'timeout')`,
      rejected: sql<number>`SUM(${aiRuns.flags} LIKE '%"guard_partial"%')`,
      distinct: sql<number>`COUNT(DISTINCT ${aiRuns.storeId}, ${aiRuns.inputHash})`,
    })
    .from(aiRuns)
    .where(and(inArray(aiRuns.promptVersion, [...versions]), eq(aiRuns.provider, "server"), sql`${aiRuns.via} <> 'cache'`, gte(aiRuns.createdAt, since)))
    .groupBy(aiRuns.promptVersion);
  const out = new Map<string, Counts>();
  for (const r of rows) {
    const g = Number(r.generations);
    out.set(r.version ?? "", { generations: g, rejectedFields: Number(r.rejected ?? 0), offeredFields: g, invalid: Number(r.invalid ?? 0), refusals: Number(r.refusals ?? 0), timeouts: Number(r.timeouts ?? 0), regeneratedBeforeChoose: Math.max(0, g - Number(r.distinct ?? 0)) });
  }
  return out;
}

/** Server runs per family over the last 7 days, from the rollups (the canary slice's volume). */
export async function familyRuns7d(now: Date): Promise<Map<string, number>> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  // tenancy: platform ai_usage_daily volume per task across stores (AI-§F.8 slice): sums only
  const rows = await db
    .select({ task: aiUsageDaily.task, runs: sql<number>`SUM(${aiUsageDaily.runs})` })
    .from(aiUsageDaily)
    .where(and(eq(aiUsageDaily.provider, "server"), gte(aiUsageDaily.day, since)))
    .groupBy(aiUsageDaily.task);
  const out = new Map<string, number>();
  for (const r of rows) {
    const family = (r.task in TASKS ? TASKS[r.task as AiTaskId].family : undefined) ?? null;
    if (family) out.set(family, (out.get(family) ?? 0) + Number(r.runs ?? 0));
  }
  return out;
}

const EMPTY: Counts = { generations: 0, rejectedFields: 0, offeredFields: 0, invalid: 0, refusals: 0, timeouts: 0, regeneratedBeforeChoose: 0 };

export interface CanaryOutcome {
  family: string;
  version: string;
  generations: number;
  bp: number;
  rolledBack: string | null;
  promotion: Promotion["status"];
}

/** One pass of the canary rules over every server canary. */
export async function canaryRollups(now: Date = new Date()): Promise<CanaryOutcome[]> {
  // prompt_versions is a P table (D64): the canary and active rows
  const rows = await db.select().from(promptVersions).where(and(inArray(promptVersions.status, ["canary", "active"]), eq(promptVersions.provider, "server")));
  const canaries = rows.filter((r) => r.status === "canary");
  if (!canaries.length) return [];
  const settings = await getPlatformSetting("platform_ai");
  const rules = settings.evalGate.canary;
  const volume = await familyRuns7d(now);
  const out: CanaryOutcome[] = [];
  for (const c of canaries) {
    const active = rows.find((r) => r.task === c.task && r.status === "active");
    const since = c.canaryStartedAt ?? c.createdAt;
    const counts = await versionCounts(active ? [c.version, active.version] : [c.version], since);
    const cs: VersionStats = { ...(counts.get(c.version) ?? EMPTY), keptWithoutEdit: null };
    const as: VersionStats = { ...(active ? (counts.get(active.version) ?? EMPTY) : EMPTY), keptWithoutEdit: null };
    const reasons = rollbackReasons(cs, as, rules);
    if (reasons.length) {
      const first = reasons[0]!;
      // prompt_versions is a P table (D64)
      await db
        .update(promptVersions)
        .set({ status: "retired", notes: first.note.slice(0, 300), rolledBackAt: now, rollbackReason: reasons.map((r) => r.metric).join(",").slice(0, 120), canaryRuns: cs.generations, canaryBp: 0 })
        .where(and(eq(promptVersions.task, c.task), eq(promptVersions.version, c.version), eq(promptVersions.status, "canary")));
      invalidateCanaries();
      await audit("platform.ai.prompt_rolled_back", { target: c.version, meta: { family: c.task, metric: first.metric, canary: first.canary, active: first.active, generations: cs.generations }, scope: { storeId: null, actorKind: "system" } });
      await notify({ audience: "platform_staff", minRole: "admin" }, "ai.canary_rolled_back", { version: c.version, metric: first.metric }, { severity: "warn", dedupeKey: `ai.canary_rolled_back:${c.version}`, link: "/admin/ai" });
      out.push({ family: c.task, version: c.version, generations: cs.generations, bp: 0, rolledBack: first.metric, promotion: "waiting" });
      continue;
    }
    const bp = canaryBp(volume.get(c.task) ?? 0, rules);
    // prompt_versions is a P table (D64)
    await db.update(promptVersions).set({ canaryBp: bp, canaryRuns: cs.generations }).where(and(eq(promptVersions.task, c.task), eq(promptVersions.version, c.version), eq(promptVersions.status, "canary")));
    const days = Math.floor((now.getTime() - since.getTime()) / 86_400_000);
    const live = (R1_FAMILIES as readonly string[]).includes(c.task) ? (await passingRun(c.task, c.version, "live", fixturesHash(c.task as R1Family), 14, now)) !== null : false;
    out.push({ family: c.task, version: c.version, generations: cs.generations, bp, rolledBack: null, promotion: promotion({ days, generations: cs.generations, rolledBack: false, liveGatePassed: live }, rules).status });
  }
  invalidateCanaries();
  return out;
}

/* ------------------------------------------------------------------ */
/* Alarms (AI-§O)                                                       */
/* ------------------------------------------------------------------ */

/** Server runs per task since `since`: refusals, invalid outputs, canary leaks, critic contradictions. */
export async function hourStats(since: Date): Promise<{ task: string; runs: number; refused: number; invalid: number; leaks: number; contradictions: number }[]> {
  // tenancy: platform ai_runs the hour's quality counts per task across stores (AI-§O alarms): counts only
  const rows = await db
    .select({
      task: aiRuns.task,
      runs: sql<number>`COUNT(*)`,
      refused: sql<number>`SUM(${aiRuns.status} = 'refused')`,
      invalid: sql<number>`SUM(${aiRuns.status} = 'invalid_output')`,
      leaks: sql<number>`SUM(${aiRuns.errorCode} = 'canary_leak')`,
      contradictions: sql<number>`SUM(${aiRuns.flags} LIKE '%"critic_contradiction"%')`,
    })
    .from(aiRuns)
    .where(and(eq(aiRuns.provider, "server"), sql`${aiRuns.via} <> 'cache'`, gte(aiRuns.createdAt, since)))
    .groupBy(aiRuns.task);
  return rows.map((r) => ({ task: r.task, runs: Number(r.runs), refused: Number(r.refused ?? 0), invalid: Number(r.invalid ?? 0), leaks: Number(r.leaks ?? 0), contradictions: Number(r.contradictions ?? 0) }));
}

const staff = { audience: "platform_staff" as const, minRole: "admin" as const };

/** Raises the AI-§O alarms the spend and the last hour show; returns the kinds raised (deduplicated per window). */
export async function raiseAlarms(now: Date = new Date()): Promise<string[]> {
  const raised: string[] = [];
  const month = now.toISOString().slice(0, 7);
  const hour = now.toISOString().slice(0, 13);
  const spend = await platformSpend(now);
  if (spend.usedPct !== null) {
    if (spend.usedPct >= 100) raised.push("ai.cap_reached");
    else if (spend.usedPct >= 70) raised.push("ai.cap_80");
    const level = spend.usedPct >= 100 ? 100 : spend.usedPct >= 85 ? 85 : spend.usedPct >= 70 ? 70 : 0;
    if (level === 100) await notify(staff, "ai.cap_reached", { pct: spend.usedPct }, { severity: "danger", dedupeKey: `ai.cap_reached:${month}`, link: "/admin/ai" });
    else if (level) await notify(staff, "ai.cap_80", { pct: level }, { severity: "warn", dedupeKey: `ai.cap_80:${month}:${level}`, link: "/admin/ai" });
  }
  if (spend.pendingUsedPct !== null && spend.pendingUsedPct >= 80) {
    const level = spend.pendingUsedPct >= 100 ? 100 : 80;
    raised.push("ai.pending_share_reached");
    await notify(staff, "ai.pending_share_reached", { pct: level }, { severity: level === 100 ? "warn" : "info", dedupeKey: `ai.pending_share_reached:${month}:${level}`, link: "/admin/ai" });
  }
  const stats = await hourStats(new Date(now.getTime() - 3_600_000));
  // canary leaks count over the UTC day (AI-§O: 3 in a day)
  const leaks = (await hourStats(new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`))).reduce((n, s) => n + s.leaks, 0);
  for (const s of stats) {
    if (s.runs >= 50 && s.refused / s.runs > 0.05) {
      raised.push("ai.refusal_spike");
      await notify(staff, "ai.refusal_spike", { task: s.task, pct: Math.round((s.refused * 100) / s.runs), runs: s.runs }, { severity: "warn", dedupeKey: `ai.refusal_spike:${s.task}:${hour}`, link: "/admin/ai" });
    }
    if (s.runs >= 30 && s.invalid / s.runs > 0.1) {
      raised.push("ai.invalid_output_spike");
      await notify(staff, "ai.invalid_output_spike", { task: s.task, pct: Math.round((s.invalid * 100) / s.runs), runs: s.runs }, { severity: "warn", dedupeKey: `ai.invalid_output_spike:${s.task}:${hour}`, link: "/admin/ai" });
    }
    if (s.task === "design.critique" && s.runs >= 30 && s.contradictions / s.runs > 0.05) {
      raised.push("ai.critic_contradiction");
      await notify(staff, "ai.critic_contradiction", { pct: Math.round((s.contradictions * 100) / s.runs), runs: s.runs }, { severity: "info", dedupeKey: `ai.critic_contradiction:${hour}`, link: "/admin/ai" });
    }
  }
  if (leaks >= 3) {
    raised.push("ai.canary_leak");
    await notify(staff, "ai.canary_leak", { count: leaks }, { severity: "danger", dedupeKey: `ai.canary_leak:${now.toISOString().slice(0, 10)}`, link: "/admin/ai" });
  }
  return raised;
}
