/**
 * The console pulse's shape and ETag (platform.md PLA-§4.6, PD38, PD56, PD57): pure, so `test:platform` checks the
 * ETag without a database. src/lib/platform/pulse.ts reads the sources.
 *
 * The ETag is sha256 of the body without its `at` (the time the answer was made changes every poll; everything else
 * the console renders is in the hash), so an unchanged pulse answers 304 and any changed field gives a new tag.
 */
import { createHash } from "node:crypto";

export interface ConsolePulse {
  v: 1;
  at: string;
  queue: { review: number; hold: number; requests: number; needsInfoAnswered: number; oldestMinutes: number | null; overSla: number };
  /** staff notifications of this user */
  unread: number;
  alarms: { red: number; yellow: number };
  /** kill-switch keys currently stopping something */
  kill: string[];
  /** PLA-§2.2 rows waiting for a second person or for their delay */
  pendingPlatformRequests: number;
  /** newest audit id, drives the Activity feed */
  auditHead: number;
  /** this session's active view-as (the topbar chip) */
  impersonation: { storeId: string; handle: string; endsAt: string } | null;
  /** the health engine's own pulse */
  health: { staleSnapshots: number; dirtyRows: number; lastRunAt: string | null };
  /** P8's `renderSummary()` platform-wide; null while P8's summary is unavailable (never a made-up 0) */
  renders: { pending: number; failed: number; oldestMin: number | null } | null;
  /** a change shows "New version available · Reload" */
  build: string;
}

/** A stable JSON of a value: object keys sorted at every level (the hash never depends on insertion order). */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
    .join(",")}}`;
}

/** The pulse's ETag: `"<sha256 hex of the body without at>"` (a strong validator, quoted). */
export function pulseEtag(pulse: ConsolePulse): string {
  const { at, ...rest } = pulse;
  void at;
  return `"${createHash("sha256").update(stableJson(rest), "utf8").digest("hex")}"`;
}

/** Does the request's `If-None-Match` name this ETag (a list, or `*`)? Weak tags compare by their opaque part. */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const want = etag.replace(/^W\//, "");
  return ifNoneMatch
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .some((t) => t === "*" || t === want);
}

/** The alarm counts of the pulse: danger is red, warn yellow; info never counts. */
export function alarmCounts(levels: readonly ("danger" | "warn" | "info")[]): { red: number; yellow: number } {
  return { red: levels.filter((l) => l === "danger").length, yellow: levels.filter((l) => l === "warn").length };
}
