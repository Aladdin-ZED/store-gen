/**
 * The shared primitives' pure logic (P2 SHELL; platform.md PLA-§22.12, §22.8, §22.9, §22.16; design.md DES-§16.8,
 * §16.9, §16.12). Pure and isomorphic: the components of this folder render what these answer, and `test:shell` checks
 * them (the runtime prop guards) without React.
 *
 * - `lockView`: what a `LockedControl` explains and which surface it opens (review card, limit sheet, a state sheet);
 * - `usageView` / `formatUsage`: a quota as a share of the store's own limit (never a platform-wide figure, MED-13);
 * - `waHref`: the wa.me link (digits only, the text encoded);
 * - `middleTruncate`: a long URL keeps its start and its end;
 * - `issueBuckets`: the unsnoozed issues by points (then severity), at most `max`, and the snoozed ones apart;
 * - `pagerHref`: a keyset cursor in the URL, the page's other query parameters kept;
 * - `freshness`: "Updated 2 min ago" as a key, its relative time and whether the dot may show live state;
 * - `qrPixels`: the on-screen pixels per module (≥ 4, the module count decides the box, never a fixed size);
 * - `ringGeometry`, `deltaTone`, `monogramInitials`, and the skeleton's timing (`SKELETON_DELAY_MS`, `SKELETON_MIN_MS`).
 */
import type { HealthIssue } from "@/lib/health/types";
import type { AdminLocale, MessageKey, MessageVars } from "@/lib/i18n/admin";
import type { StoreStatus } from "@/lib/tenancy/types";
import { QR_QUIET_MODULES, QR_SCREEN_PX_PER_MODULE } from "./address-math";
import type { LockReason } from "./locked-control";

/* ---------------------------------------------------------------- locked control */

export interface LockView {
  /** the sentence the control explains itself with */
  key: MessageKey;
  /** where pressing it leads: the review card (pending), the limit sheet (plan), or the sentence alone */
  opens: "review" | "limit" | "sheet";
}

const STATE_KEY: Partial<Record<StoreStatus, MessageKey>> = {
  pending: "shell.locked.after_approval",
  restricted: "shell.locked.restricted",
  suspended: "shell.err.read_only.suspended",
  closed: "shell.err.read_only.closed",
  scheduled_deletion: "shell.err.read_only.scheduled_deletion",
};

export function lockView(reason: LockReason): LockView {
  switch (reason.kind) {
    case "pending":
      return { key: "shell.locked.after_approval", opens: "review" };
    case "state":
      return { key: STATE_KEY[reason.status] ?? "shell.locked.read_only", opens: reason.status === "pending" ? "review" : "sheet" };
    case "plan":
      return { key: "shell.locked.plan", opens: "limit" };
    case "kill":
      return { key: "shell.locked.kill", opens: "sheet" };
    case "role":
      return { key: "shell.locked.role", opens: "sheet" };
    case "release":
      return { key: reason.release === "R2" ? "shell.locked.release" : "shell.locked.later", opens: "sheet" };
    case "impersonation":
      return { key: "shell.impersonation.read_only", opens: "sheet" };
  }
}

/* ---------------------------------------------------------------- usage meter */

export type UsageUnit = "bytes" | "count" | "credits";

export interface UsageView {
  /** 0-1 of the store's own limit, null when unlimited or the limit is 0 with nothing used */
  share: number | null;
  /** whole percent for the text, null without a share */
  pct: number | null;
  tone: "ok" | "warn" | "full";
  unlimited: boolean;
}

/** `warnAt` (0.8 by default) of the limit turns the meter to warn; at or over the limit it is full. */
export function usageView(used: number, limit: number | null, warnAt = 0.8): UsageView {
  const u = Number.isFinite(used) && used > 0 ? used : 0;
  if (limit === null || !Number.isFinite(limit)) return { share: null, pct: null, tone: "ok", unlimited: true };
  if (limit <= 0) return { share: u > 0 ? 1 : null, pct: u > 0 ? 100 : null, tone: u > 0 ? "full" : "ok", unlimited: false };
  const share = Math.min(1, u / limit);
  const warn = Number.isFinite(warnAt) && warnAt > 0 && warnAt <= 1 ? warnAt : 0.8;
  const tone = u >= limit ? "full" : share >= warn ? "warn" : "ok";
  return { share, pct: Math.min(100, Math.floor((u / limit) * 100)), tone, unlimited: false };
}

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/** A quota amount in the viewer's locale: bytes in binary steps (1 MB = 1,048,576 bytes, as the caps are set), else a count. */
export function formatUsage(value: number, unit: UsageUnit, locale: AdminLocale): string {
  const v = Number.isFinite(value) && value > 0 ? value : 0;
  if (unit !== "bytes") return new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale).format(Math.round(v));
  let i = 0;
  let n = v;
  while (n >= 1024 && i < BYTE_UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = i === 0 || n >= 100 ? 0 : 1;
  return new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { style: "unit", unit: BYTE_UNITS[i], unitDisplay: "short", maximumFractionDigits: digits }).format(n);
}

/* ---------------------------------------------------------------- sharing */

/** "https://wa.me/<digits>?text=<encoded>"; without a phone, the share picker (`wa.me/?text=`). */
export function waHref(text: string, phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Keeps `max` characters of a long value: its head and tail around an ellipsis (an address stays recognisable). */
export function middleTruncate(value: string, max = 48): string {
  const chars = [...value];
  if (chars.length <= max || max < 5) return value;
  const tail = Math.floor((max - 1) / 3);
  const head = max - 1 - tail;
  return `${chars.slice(0, head).join("")}…${chars.slice(chars.length - tail).join("")}`;
}

/* ---------------------------------------------------------------- issue list */

export interface IssueBuckets {
  shown: HealthIssue[];
  /** unsnoozed issues beyond `max` (never rendered; counted for the dashboard's "n more" link) */
  hidden: number;
  snoozed: { issue: HealthIssue; until: string }[];
}

/** Unsnoozed issues sorted by points, then severity, then id (stable), capped at `max`; the snoozed ones apart. */
export function issueBuckets(issues: readonly HealthIssue[], snoozed: Readonly<Record<string, string>>, max: number): IssueBuckets {
  const open: HealthIssue[] = [];
  const parked: IssueBuckets["snoozed"] = [];
  for (const issue of issues) {
    const until = Object.hasOwn(snoozed, issue.id) ? snoozed[issue.id] : undefined;
    if (until !== undefined) parked.push({ issue, until });
    else open.push(issue);
  }
  open.sort((a, b) => b.points - a.points || b.severity - a.severity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cap = Math.max(0, Math.floor(max));
  return { shown: open.slice(0, cap), hidden: Math.max(0, open.length - cap), snoozed: parked };
}

/* ---------------------------------------------------------------- keyset pager */

/** `?<param>=<cursor>` over the current query, the other parameters kept (filters survive paging). */
export function pagerHref(search: string, param: string, cursor: string): string {
  const q = new URLSearchParams(search);
  q.set(param, cursor);
  return `?${q.toString()}`;
}

/* ---------------------------------------------------------------- freshness */

export interface Freshness {
  key: MessageKey;
  vars: MessageVars;
  /** the dot shows live state only while fresh; stale or never: neutral */
  fresh: boolean;
}

const RELATIVE_STEPS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60],
  ["hour", 60],
  ["day", 24],
  ["week", 7],
];

/** "Updated 2 minutes ago" in the viewer's locale; a time in the future counts as now (clock skew). */
export function freshness(at: string | null, staleAfterMs: number, now: number, locale: AdminLocale): Freshness {
  const ms = at === null ? Number.NaN : Date.parse(at);
  if (!Number.isFinite(ms)) return { key: "shell.fresh.never", vars: {}, fresh: false };
  const age = Math.max(0, now - ms);
  const fresh = age <= Math.max(0, staleAfterMs);
  if (age < 45_000) return { key: "shell.fresh.now", vars: {}, fresh };
  let value = age / 60_000;
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  for (let i = 0; i < RELATIVE_STEPS.length - 1; i++) {
    const [, size] = RELATIVE_STEPS[i + 1]!;
    if (value < size) break;
    value /= size;
    unit = RELATIVE_STEPS[i + 1]![0];
  }
  const rtf = new Intl.RelativeTimeFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { numeric: "auto", style: "long" });
  return { key: "shell.fresh.ago", vars: { time: rtf.format(-Math.max(1, Math.round(value)), unit) }, fresh };
}

/* ---------------------------------------------------------------- QR */

/**
 * The on-screen pixels per module for a code of `modules` modules drawn in at most `size` CSS px (quiet zone
 * included): the largest whole number that fits, never under 4 (DES-§16.12 "≥ 4 px modules", the code then overflows
 * its box rather than shrinking below the rule).
 */
export function qrPixels(modules: number, size: number): number {
  const box = modules + QR_QUIET_MODULES * 2;
  return Math.max(QR_SCREEN_PX_PER_MODULE, Math.floor(size / box));
}

/* ---------------------------------------------------------------- ring, delta, monogram */

export interface RingGeometry {
  size: number;
  stroke: number;
  r: number;
  circumference: number;
}

/** The ring's stroke grows with its size (40: 4 px, 56: 5 px, 96: 7 px), the radius keeps it inside the box. */
export function ringGeometry(size: 40 | 56 | 96): RingGeometry {
  const stroke = size >= 96 ? 7 : size >= 56 ? 5 : 4;
  const r = (size - stroke) / 2;
  return { size, stroke, r, circumference: 2 * Math.PI * r };
}

/** A delta's semantic tone: up = success, down = destructive, none = neutral (a caller flips it for "lower is better"). */
export function deltaTone(value: number): "up" | "down" | "flat" {
  if (!Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/**
 * One or two initials by code point (the first letters of the first two words), upper-cased where the script has case.
 * A joining script (Arabic) keeps one letter: two isolated Arabic letters side by side join into a word fragment.
 */
export function monogramInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = (w: string | undefined) => (w ? (Array.from(w)[0] ?? "") : "");
  const lead = first(words[0]);
  if (/\p{Script=Arabic}/u.test(lead)) return lead;
  const two = words.length > 1 ? lead + first(words[1]) : lead;
  return two.toLocaleUpperCase();
}

/* ---------------------------------------------------------------- skeleton */

/** A skeleton appears only when loading lasts longer than this (DES-§16.8: after 150 ms; 200 sits in 150-300). */
export const SKELETON_DELAY_MS = 200;
/** Once shown, a skeleton stays at least this long, so it never flashes (DES-§16.8: ≥ 300 ms). */
export const SKELETON_MIN_MS = 300;

/* ---------------------------------------------------------------- dates */

/** A date in the viewer's locale (Western digits in Arabic, as the admin uses), or "" for a value that is not one. */
export function formatDay(iso: string | null | undefined, locale: AdminLocale): string {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { dateStyle: "medium" }).format(new Date(ms));
}
