/**
 * Notification kinds of the ai track (P7 AI; ai.md AI-§L, AI-§C.3, AI-§O "Alarms").
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3; PLA-§18.1) imported by src/lib/notify/registry.ts; the texts
 * `notify.<kind>.title` / `.body` live in src/lib/i18n/admin/<locale>/ai.ts (D67), the tenant kinds in ar, fr and en.
 * Vars carry counts, codes, ids and percentages only: never a text the seller typed, never customer data.
 */
import { z } from "zod";
import type { NotificationKindDef } from "../registry";

const pct = z.number().int().min(0).max(100_000);
const id = z.string().max(64);
const code = z.string().max(48);

/** The tenant kinds (shown in the store's notification centre). */
const tenant: NotificationKindDef[] = [
  { kind: "ai.credits_80", group: "ai", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({ pct, month: z.string().max(7) }) },
  { kind: "ai.credits_out", group: "ai", defaultSeverity: "warn", audienceHint: "store_role", tenant: true, vars: z.object({ pct, month: z.string().max(7) }) },
  { kind: "ai.batch_done", group: "ai", defaultSeverity: "success", audienceHint: "store", tenant: true, vars: z.object({ count: z.number().int().min(0) }), batch: { windowMin: 60 } },
  { kind: "ai.job_done", group: "ai", defaultSeverity: "success", audienceHint: "user", tenant: true, vars: z.object({ jobKind: code, jobId: id }) },
  { kind: "ai.job_failed", group: "ai", defaultSeverity: "warn", audienceHint: "user", tenant: true, vars: z.object({ jobKind: code, jobId: id }) },
  // R3 (AI-17, AI-17b): declared now so the texts exist in every locale before the jobs send them
  { kind: "ai.insights_ready", group: "ai", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({ week: z.string().max(10) }) },
  { kind: "ai.health_report_ready", group: "ai", defaultSeverity: "info", audienceHint: "store_role", tenant: true, vars: z.object({ month: z.string().max(7) }) },
];

/** The staff kinds (the console feed; AI-§C.3 caps and AI-§O alarms). */
const staff: NotificationKindDef[] = [
  { kind: "ai.cap_80", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ pct }) },
  { kind: "ai.cap_reached", group: "platform", defaultSeverity: "danger", audienceHint: "platform_staff", tenant: false, vars: z.object({ pct }) },
  { kind: "ai.pending_share_reached", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ pct }) },
  { kind: "ai.auth_failed", group: "platform", defaultSeverity: "danger", audienceHint: "platform_staff", tenant: false, vars: z.object({}) },
  { kind: "ai.director_unavailable", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ class: code }) },
  { kind: "ai.batch_failed", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ batchId: id, errored: z.number().int().min(0), expired: z.number().int().min(0) }) },
  { kind: "ai.refusal_spike", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ task: code, pct, runs: z.number().int().min(0) }) },
  { kind: "ai.invalid_output_spike", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ task: code, pct, runs: z.number().int().min(0) }) },
  { kind: "ai.critic_contradiction", group: "platform", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ pct, runs: z.number().int().min(0) }) },
  { kind: "ai.canary_leak", group: "platform", defaultSeverity: "danger", audienceHint: "platform_staff", tenant: false, vars: z.object({ count: z.number().int().min(0) }) },
  { kind: "ai.canary_rolled_back", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ version: id, metric: code }) },
  { kind: "ai.job_orphaned", group: "platform", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ outcome: z.enum(["reclaimable", "failed"]), stage: z.string().max(24) }) },
  { kind: "ai.after_driver_missing", group: "platform", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ reclaims: z.number().int().min(0) }) },
  { kind: "ai.probe_failed", group: "platform", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ survivedMs: z.number().int().min(0) }) },
  { kind: "ai.throughput_low", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ class: code, tokPerSec: z.number().min(0) }) },
  { kind: "ai.cache_cold", group: "platform", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ task: code }) },
  { kind: "ai.orange_regions", group: "platform", defaultSeverity: "warn", audienceHint: "platform_staff", tenant: false, vars: z.object({ count: z.number().int().min(0) }) },
  { kind: "ai.pick_drift", group: "platform", defaultSeverity: "info", audienceHint: "platform_staff", tenant: false, vars: z.object({ points: z.number() }) },
];

export const kinds: NotificationKindDef[] = [...tenant, ...staff];
