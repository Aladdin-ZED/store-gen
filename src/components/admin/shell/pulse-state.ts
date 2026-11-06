/**
 * The shell's pulse state, pure (P2 SHELL; platform.md PLA-§22.6, §10.2, §22.8; docs/STORE-SAAS.md §I.4, D57; SF-06,
 * PL-02, PL-10, PL-12). `use-pulse.ts` runs this reducer over the bodies the poller election hands it, and the chrome
 * reads the result; `test:shell` drives it without a browser:
 *
 *   let s = initialPulseState(firstBody, Date.now());
 *   s = reducePulse(s, { t: "body", body, now: Date.now() });   // refreshTick / healthTick / updateAvailable / ready
 *
 * - a change of `store.status`, `store.review`, the kill switches or `reaccept` bumps `refreshTick`: the hook calls
 *   `router.refresh()`, so locked controls unlock (and state pages appear) without a reload (PL-02, PD65);
 * - a `build` other than the one the tab booted with sets `updateAvailable` ("New version available · Reload");
 * - a new `health.computedAt` bumps `healthTick` (the ring's freshness dot and issue list refresh);
 * - `jobs.done` adds each finished job once to `ready` (the job chip's "Ready · Open", 60 s; `dismissJob` removes it).
 *
 * Also here: the ribbon's countdown math (the server offset measured once, PLA-§10.2), the bell's count label, the
 * notification rows' day groups, and the banner list from the pulse (PL-12: a status change reaches the banner with
 * the next body, no reload).
 */
import type { NotificationItem } from "@/lib/platform/notify";
import type { StorePulse } from "@/lib/pulse/types";
import { pickBanners, type Banner, type BannerState } from "./banner-priority";

/** At most this many finished jobs wait as "Ready · Open" at once (the oldest leaves first). */
export const READY_MAX = 5;

export interface ReadyJob {
  id: string;
  /** client ms when the pulse named it */
  at: number;
}

export interface PulseState {
  body: StorePulse | null;
  /** client ms when the last body arrived (polled, heard from the leader tab, or painted by the server) */
  receivedAt: number | null;
  /** the build this tab booted with (the first body's) */
  bootBuild: string | null;
  updateAvailable: boolean;
  ready: ReadyJob[];
  refreshTick: number;
  healthTick: number;
}

export type PulseEvent = { t: "body"; body: StorePulse; now: number } | { t: "dismiss_job"; id: string };

export function initialPulseState(body: StorePulse | null, now: number): PulseState {
  return { body, receivedAt: body ? now : null, bootBuild: body?.build ?? null, updateAvailable: false, ready: [], refreshTick: 0, healthTick: 0 };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Does the change from `prev` to `next` need the server components again (locks, state pages, the legal sheet)? */
export function needsRefresh(prev: StorePulse | null, next: StorePulse): boolean {
  if (!prev) return false;
  return prev.store.status !== next.store.status || prev.store.review !== next.store.review || prev.reaccept !== next.reaccept || !sameList(prev.kill, next.kill);
}

export function reducePulse(s: PulseState, e: PulseEvent): PulseState {
  if (e.t === "dismiss_job") {
    const ready = s.ready.filter((j) => j.id !== e.id);
    return ready.length === s.ready.length ? s : { ...s, ready };
  }
  const prev = s.body;
  const next = e.body;
  const bootBuild = s.bootBuild ?? next.build;
  const known = new Set(s.ready.map((j) => j.id));
  const fresh = (next.jobs?.done ?? []).filter((id) => typeof id === "string" && id && !known.has(id) && !(prev?.jobs.done ?? []).includes(id));
  const ready = [...s.ready, ...fresh.map((id) => ({ id, at: e.now }))].slice(-READY_MAX);
  const healthChanged = !!prev && (prev.health?.computedAt ?? null) !== (next.health?.computedAt ?? null);
  return {
    body: next,
    receivedAt: e.now,
    bootBuild,
    updateAvailable: s.updateAvailable || (!!next.build && next.build !== bootBuild),
    ready,
    refreshTick: s.refreshTick + (needsRefresh(prev, next) ? 1 : 0),
    healthTick: s.healthTick + (healthChanged ? 1 : 0),
  };
}

/** How old the last body is (ms), or null before the first one. */
export function pulseAge(s: Pick<PulseState, "receivedAt">, now: number): number | null {
  return s.receivedAt === null ? null : Math.max(0, now - s.receivedAt);
}

/* ------------------------------------------------------------------ */
/* the impersonation ribbon's countdown (PLA-§10.2, PD56)              */
/* ------------------------------------------------------------------ */

/** Server clock minus client clock (ms), from one server timestamp and the client time it was read at; 0 when unreadable. */
export function clockOffset(serverIso: string | null | undefined, clientNow: number): number {
  const at = serverIso ? Date.parse(serverIso) : Number.NaN;
  return Number.isFinite(at) && Number.isFinite(clientNow) ? at - clientNow : 0;
}

/** What is left of a view ending at `endsAtIso` (ms, never below 0), on the client clock corrected by `offsetMs`. */
export function remainingMs(endsAtIso: string | null | undefined, clientNow: number, offsetMs: number): number {
  const end = endsAtIso ? Date.parse(endsAtIso) : Number.NaN;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - (clientNow + offsetMs));
}

/** "24:13" (mm:ss), "1:00:00" from an hour; seconds are rounded up so "00:00" means it is over. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** The ribbon's end: the pulse's `impersonation.endsAt` first, the first paint's `expiresAt` until a body names one. */
export function ribbonEndsAt(pulse: Pick<StorePulse, "impersonation"> | null, firstPaint: string | null): string | null {
  return pulse?.impersonation?.endsAt ?? firstPaint;
}

/* ------------------------------------------------------------------ */
/* the bell (PLA-§22.6)                                                */
/* ------------------------------------------------------------------ */

/** The bell's badge: nothing at 0, the count up to nine, "9+" above. */
export function bellCount(unread: number | null | undefined): string | null {
  const n = typeof unread === "number" && Number.isFinite(unread) ? Math.floor(unread) : 0;
  if (n <= 0) return null;
  return n > 9 ? "9+" : String(n);
}

export type DayGroup<T> = { day: "today" | "yesterday" | string; items: T[] };

/** The calendar day of `ms` in `timeZone` ("YYYY-MM-DD"). */
function dayOf(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/**
 * Rows grouped by day, newest first, in the viewer's time zone: "today", "yesterday", else the day ("YYYY-MM-DD").
 * Rows with an unreadable time go with today.
 */
export function groupByDay<T extends Pick<NotificationItem, "createdAt">>(items: readonly T[], now: number, timeZone: string): DayGroup<T>[] {
  const today = dayOf(now, timeZone);
  const yesterday = dayOf(now - 86_400_000, timeZone);
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const ms = Date.parse(item.createdAt);
    const d = Number.isFinite(ms) ? dayOf(ms, timeZone) : today;
    const day = d === today ? "today" : d === yesterday ? "yesterday" : d;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/**
 * The PLA-§18.1 link rule (rev 4, SEC-6): a store link `/app/<handle>…` (3-30 characters of `[a-z0-9-]`, then `/`, `?`,
 * `#` or the end) or a user-level `/app/account…` (which the same pattern covers). Anything else renders as plain text.
 */
export const NOTIFICATION_LINK = /^\/app\/[a-z0-9-]{3,30}(?:[/?#]|$)/;

/** A notification's link, only when it matches the link rule (`notify()` already refused anything else at the insert). */
export function notificationHref(link: string | null): string | null {
  return typeof link === "string" && NOTIFICATION_LINK.test(link) && !/[\\\s]/.test(link) ? link : null;
}

/* ------------------------------------------------------------------ */
/* the notification centre (PLA-§22.6, `/app/<h>/notifications`)        */
/* ------------------------------------------------------------------ */

/** The centre's filters, in the spec's order (rows of other groups show under "All"). */
export const CENTRE_GROUPS = ["orders", "team", "store", "plan", "integrations", "security", "platform"] as const;
export type CentreGroup = (typeof CENTRE_GROUPS)[number];
/** Rows per page (P1's `listNotifications` maximum); a phone shows the first 25 and "Show older" for the rest. */
export const CENTRE_PAGE = 50;
export const CENTRE_PAGE_PHONE = 25;
/** How many pages back the cursor remembers (the URL stays short) */
export const CENTRE_CURSOR_DEPTH = 40;

/**
 * The keyset cursor (`?before=`): the stack of the `beforeId`s that led to this page, base 36, "." between them; "-"
 * is the first page. The current page reads before the last id; Previous drops it. Anything malformed is the first page.
 */
export function decodeCentreCursor(raw: unknown): number[] {
  if (typeof raw !== "string" || raw === "" || raw === "-") return [];
  const parts = raw.split(".");
  if (parts.length > CENTRE_CURSOR_DEPTH) return [];
  const ids = parts.map((p) => (/^[0-9a-z]{1,10}$/.test(p) ? parseInt(p, 36) : Number.NaN));
  return ids.every((n) => Number.isSafeInteger(n) && n > 0) ? ids : [];
}

export function encodeCentreCursor(ids: readonly number[]): string {
  return ids.length ? ids.map((n) => n.toString(36)).join(".") : "-";
}

/** Previous / Next for the page read before `stack`'s last id: Next only when an older row exists. */
export function centrePager(stack: readonly number[], lastId: number | null, more: boolean): { next: string | null; prev: string | null } {
  return {
    next: more && lastId !== null && stack.length < CENTRE_CURSOR_DEPTH ? encodeCentreCursor([...stack, lastId]) : null,
    prev: stack.length ? encodeCentreCursor(stack.slice(0, -1)) : null,
  };
}

/* ------------------------------------------------------------------ */
/* banners from the pulse (PLA-§22.8, PL-12)                           */
/* ------------------------------------------------------------------ */

/**
 * The banners now: the pulse's status and kill switches when a body arrived, else the first paint's; the rest of the
 * state (role, dates, the reason sentence, members without 2FA, meters, dismissals) is the caller's.
 */
export function pulseBanners(base: Omit<BannerState, "status" | "kill">, firstPaint: Pick<BannerState, "status" | "kill">, pulse: Pick<StorePulse, "store" | "kill"> | null): Banner[] {
  return pickBanners({ ...base, status: pulse?.store.status ?? firstPaint.status, kill: pulse?.kill ?? firstPaint.kill });
}

/** The status reason as a catalog key (`shell.status_reason.<code>`), or null for none or an unreadable code. */
export function statusReasonKey(code: string | null | undefined): `shell.status_reason.${string}` | null {
  return typeof code === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(code) ? `shell.status_reason.${code}` : null;
}
