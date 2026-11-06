/**
 * Pure helpers of the settings screens (platform.md PLA-§3.2 sandbox ceilings card, PD68 / D69; PLA-§13.2), shared by
 * the console components and `test:platform`. No server import: the client cards format with the same functions.
 *
 *   t("console.signup.media_meter", pendingMediaVars({ usedBytes, limitBytes, pendingStores: 31 }))
 *   // "1,240 of 5,000 MiB used by 31 pending stores"
 *   t("console.signup.sandbox_meter", sandboxVars({ used: 12, limit: 50 }))   // "Today: 12 / 50 sandboxes"
 */
import type { SignupThresholds } from "./types";

export const MIB = 1024 * 1024;
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Whole MiB with thousands separators ("1,240"); a few bytes above zero read as "1", never "0". */
export function mibText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0";
  return fmt.format(Math.max(1, Math.round(bytes / MIB)));
}

/** The pending media budget line's variables (`console.signup.media_meter`). */
export function pendingMediaVars(m: { usedBytes: number; limitBytes: number; pendingStores: number }): { used: string; limit: string; stores: number } {
  return { used: mibText(m.usedBytes), limit: mibText(m.limitBytes), stores: Math.max(0, Math.trunc(m.pendingStores)) };
}

/** The sandboxes-per-day line's variables (`console.signup.sandbox_meter`). */
export function sandboxVars(s: { used: number; limit: number }): { used: string; limit: string } {
  return { used: fmt.format(Math.max(0, s.used)), limit: fmt.format(Math.max(0, s.limit)) };
}

/** The meter's tone: ≥ 95 % danger, ≥ 80 % warn (the `pending_media_budget` alarm bands of PLA-§15.2). */
export function meterTone(used: number, limit: number): "ok" | "warn" | "danger" {
  const r = limit > 0 ? used / limit : 0;
  return r >= 0.95 ? "danger" : r >= 0.8 ? "warn" : "ok";
}

export type ThresholdBand = "fast" | "review" | "hold" | "reject_candidate";

/** The four bands drawn on the 0-100 bar (emerald, neutral, yellow, crimson), from the three linked thresholds. */
export function thresholdBands(t: SignupThresholds): { band: ThresholdBand; from: number; to: number }[] {
  return [
    { band: "fast", from: 0, to: t.fastLaneMax },
    { band: "review", from: t.fastLaneMax + 1, to: t.holdMin - 1 },
    { band: "hold", from: t.holdMin, to: t.rejectCandidateMin - 1 },
    { band: "reject_candidate", from: t.rejectCandidateMin, to: 100 },
  ];
}

/** The thresholds are ordered (fast lane < hold < reject candidate), as the `platform` schema refines them. */
export const thresholdsOrdered = (t: SignupThresholds): boolean => t.fastLaneMax >= 0 && t.fastLaneMax < t.holdMin && t.holdMin < t.rejectCandidateMin && t.rejectCandidateMin <= 100;
