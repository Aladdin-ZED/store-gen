import "server-only";
/**
 * The System health page's data glue (platform.md PLA-§15.1, §15.2, OS-09; PD57, PD68, D69): `/admin/health` reads
 * one panel per source, each failing alone.
 *
 *   const s = await systemHealthView(ctx);
 *   // s.machine (P8 getHealth: cron, queues, Sheets, storage, errors, runtime, edge, renders, AI, design tables),
 *   // s.engine (the health engine), s.alarms (the PLA-§15.2 evaluation with each raised alarm's since),
 *   // s.sandboxes and s.pendingMedia (the D69 ceilings), s.commerce (the last order platform-wide, from P8)
 *
 * The machinery is P8's (`getHealth`, "unavailable" until P8 merges); the engine, the alarms and the ceilings are P1's.
 * Nothing here sends a notification: the `platform.alarms` job does (src/lib/platform/alarms.ts).
 */
import { AuthRefusal } from "@/lib/auth/errors";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { ALARM_STATE_KEY, type AlarmJobState, type AlarmState } from "./alarms";
import { getHealth, type PlatformHealth } from "./health";
import { readJobState } from "./job-state";
import { cachedAlarms, healthEngineSummary, type HealthEngineSummary } from "./overview";
import { optional, panel, type Panel } from "./panel";
import { pendingMediaBudget, todaysSandboxes, type PendingMediaMeter, type SandboxMeter } from "./signup-admin";

export interface SystemHealthView {
  machine: Panel<PlatformHealth>;
  engine: Panel<HealthEngineSummary>;
  alarms: Panel<(AlarmState & { since: string | null })[]>;
  /** recovered alarms (key → when), the newest 50: the panel's "Recovered 14:20" */
  recovered: Record<string, string>;
  sandboxes: Panel<SandboxMeter>;
  pendingMedia: Panel<PendingMediaMeter>;
  checkedAt: string;
}

/** PLA-§15.1 (`console.read`). */
export async function systemHealthView(ctx: PlatformCtx, now: Date = new Date()): Promise<SystemHealthView> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  const [machine, engine, alarms, state, sandboxes, pendingMedia] = await Promise.all([
    panel("system.machine", () => getHealth(ctx)),
    panel("system.engine", () => healthEngineSummary(now)),
    panel("system.alarms", () => cachedAlarms(now)),
    optional("system.alarm_state", () => readJobState<AlarmJobState>(ALARM_STATE_KEY)),
    panel("system.sandboxes", () => todaysSandboxes(now)),
    panel("system.pending_media", () => pendingMediaBudget()),
  ]);
  return {
    machine,
    engine,
    alarms: alarms.state === "ok" ? { ...alarms, data: alarms.data.map((a) => ({ ...a, since: state?.raised?.[a.key] ?? null })) } : alarms,
    recovered: state?.recovered ?? {},
    sandboxes,
    pendingMedia,
    checkedAt: now.toISOString(),
  };
}
