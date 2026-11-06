/**
 * The lifecycle sheet's pure rules (platform.md PLA-§8.0-§8.2; PD44, PD54; core §A.5): which console action an edge
 * is, what it requires, what the store will read and see, and the cooldown. Isomorphic and selftested;
 * src/lib/platform/lifecycle-preview.ts (the read) and src/lib/platform/lifecycle-actions.ts (the write) both decide
 * with these functions, so the preview and the action can never disagree.
 *
 *   lifecycleActionOf("active", "restricted")                 // "restrict"
 *   requirementsOf("suspend")                                 // { permission: "stores.lifecycle", stepUp: true, typedHandle: true, … }
 *   cooldownState(changedAt, now, 10)                         // { inside: true, minutesAgo: 4, until }
 *   storeSeesFor({ status: "restricted", reason: "fake_orders", locale: "fr", … })   // the banner the store renders
 *
 * Copy (PLA-§N.2): the banner and page sentences are P2's `shell.banner.*` / `shell.page.*` keys and the reason
 * sentence is `shell.status_reason.<code>`. Until P2's catalog is on the branch the English texts of PLA-§N.2 (below,
 * `SHELL_FALLBACK_EN`) stand in for the missing keys and the reason reads the store notification's own label
 * (`notify.reason.<code>`, P1's catalog in ar / fr / en); `storeSees.fallback` says so, and the sheet shows it.
 */
import { messageOf, t, type AdminLocale, type MessageVars } from "@/lib/i18n/admin";
import type { AuditAction } from "@/lib/audit";
import type { PlatformPermission } from "@/lib/auth/permissions";
import type { NotificationKind } from "@/lib/notify/registry";
import type { StoreStatus } from "@/lib/tenancy/types";
import { CLOSE_REASONS, DELETION_REASONS, PURGE_REASONS, RESTORE_REASONS, RESTRICT_REASONS, SUSPEND_REASONS, type StoreStatusReason } from "./reasons";

const MIN = 60_000;
const DAY = 86_400_000;
/** core §A.5.1: an owner may reopen within 30 days (lifecycle.ts REOPEN_DAYS) */
export const REOPEN_WINDOW_DAYS = 30;
/** core §A.5.1: scheduled_deletion → purged 24 h later (lifecycle.ts PURGE_DELAY_MS) */
export const DELETION_DELAY_MS = DAY;

/* ------------------------------------------------------------------ */
/* Edges as console actions (PLA-§8.1)                                 */
/* ------------------------------------------------------------------ */

/** The console's lifecycle actions; the queue's edges (approve, reject, reopen an appeal) are not among them. */
export const LIFECYCLE_ACTIONS = ["restrict", "suspend", "restore", "close", "reopen", "schedule_deletion", "cancel_deletion", "purge"] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

const CLOSABLE: readonly StoreStatus[] = ["active", "restricted", "suspended", "pending"];

/**
 * The console action of `from → to`, or null when no console action takes it (not an edge, or a queue edge:
 * pending → active / rejected and rejected → pending belong to the approval queue, PLA-§3.5). `purged` is the
 * request of PLA-§2.2 (only from closed or scheduled_deletion).
 */
export function lifecycleActionOf(from: StoreStatus, to: StoreStatus): LifecycleAction | null {
  if (to === "purged") return from === "closed" || from === "scheduled_deletion" ? "purge" : null;
  if (from === "closed") return to === "scheduled_deletion" ? "schedule_deletion" : CLOSABLE.includes(to) ? "reopen" : null;
  if (to === "closed") return from === "scheduled_deletion" ? "cancel_deletion" : CLOSABLE.includes(from) ? "close" : null;
  if (from === "active" && to === "restricted") return "restrict";
  if ((from === "active" || from === "restricted") && to === "suspended") return "suspend";
  if ((from === "restricted" && to === "active") || (from === "suspended" && (to === "active" || to === "restricted"))) return "restore";
  return null;
}

/** Is `to` the queue's edge from `from` (the sheet points there instead)? */
export function isQueueEdge(from: StoreStatus, to: StoreStatus): boolean {
  return (from === "pending" && (to === "active" || to === "rejected")) || (from === "rejected" && to === "pending");
}

export interface LifecycleRequirements {
  permission: PlatformPermission;
  /** ↑ (the step-up comes before arming, PLA-§8.0 step 2) */
  stepUp: boolean;
  /** the typed handle of the PLA-§8.1 table (the cooldown can add it to any action, `cooldownState`) */
  typedHandle: boolean;
  /** purge only: the typed word "purge" beside the handle */
  typedWord: "purge" | null;
  reasons: readonly StoreStatusReason[];
}

/** PLA-§8.1, row by row (the permission and ↑ agree with lifecycle.ts ALLOWED_TRANSITIONS; the selftest checks it). */
export const REQUIREMENTS: Readonly<Record<LifecycleAction, LifecycleRequirements>> = {
  restrict: { permission: "stores.lifecycle", stepUp: false, typedHandle: false, typedWord: null, reasons: RESTRICT_REASONS },
  suspend: { permission: "stores.lifecycle", stepUp: true, typedHandle: true, typedWord: null, reasons: SUSPEND_REASONS },
  restore: { permission: "stores.lifecycle", stepUp: false, typedHandle: false, typedWord: null, reasons: RESTORE_REASONS },
  close: { permission: "stores.close", stepUp: true, typedHandle: true, typedWord: null, reasons: CLOSE_REASONS },
  reopen: { permission: "stores.close", stepUp: false, typedHandle: false, typedWord: null, reasons: RESTORE_REASONS },
  schedule_deletion: { permission: "stores.close", stepUp: true, typedHandle: true, typedWord: null, reasons: DELETION_REASONS },
  cancel_deletion: { permission: "stores.purge", stepUp: true, typedHandle: false, typedWord: null, reasons: RESTORE_REASONS },
  purge: { permission: "stores.purge", stepUp: true, typedHandle: true, typedWord: "purge", reasons: PURGE_REASONS },
};

export function requirementsOf(action: LifecycleAction): LifecycleRequirements {
  return REQUIREMENTS[action];
}

/** Is `code` one of the reasons `action` offers? */
export function reasonAllowed(action: LifecycleAction, code: unknown): code is StoreStatusReason {
  return typeof code === "string" && (REQUIREMENTS[action].reasons as readonly string[]).includes(code);
}

/** The typed handle as the server compares it: trimmed, case-folded, an optional leading "@". */
export function typedHandleMatches(typed: unknown, handle: string | null): boolean {
  if (!handle || typeof typed !== "string") return false;
  const v = typed.trim().toLowerCase().replace(/^@/, "");
  return v.length > 0 && v === handle.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Cooldown (PD54)                                                     */
/* ------------------------------------------------------------------ */

export interface CooldownState {
  /** a lifecycle change on this store inside the last `cooldownMinutes` */
  inside: boolean;
  /** whole minutes since the last change, null when the store never changed */
  minutesAgo: number | null;
  /** when the cooldown ends, null outside it */
  until: Date | null;
}

/** PLA-§8.0 step 3: inside the window the typed handle is required even where the edge needs none. 0 minutes = off. */
export function cooldownState(lastChangeAt: Date | null, now: Date, cooldownMinutes: number): CooldownState {
  if (!lastChangeAt) return { inside: false, minutesAgo: null, until: null };
  const ago = Math.max(0, now.getTime() - lastChangeAt.getTime());
  const end = lastChangeAt.getTime() + Math.max(0, cooldownMinutes) * MIN;
  const inside = cooldownMinutes > 0 && now.getTime() < end;
  return { inside, minutesAgo: Math.floor(ago / MIN), until: inside ? new Date(end) : null };
}

/** The typed handle is required: the action's own rule, or the cooldown. */
export function typedHandleRequired(action: LifecycleAction, cooldown: Pick<CooldownState, "inside">): boolean {
  return REQUIREMENTS[action].typedHandle || cooldown.inside;
}

/* ------------------------------------------------------------------ */
/* What the transition writes (core §A.5.1)                            */
/* ------------------------------------------------------------------ */

/** The staff audit action and the store notification of each edge (lifecycle.ts ALLOWED_TRANSITIONS, PLA Q.27). */
export function writesOf(from: StoreStatus, to: StoreStatus): { audit: AuditAction; notification: NotificationKind | null } | null {
  const action = lifecycleActionOf(from, to);
  if (!action) return null;
  switch (action) {
    case "restrict":
      return { audit: "platform.store.restricted", notification: "store.restricted" };
    case "suspend":
      return { audit: "platform.store.suspended", notification: "store.suspended" };
    case "restore":
      return { audit: "platform.store.restored", notification: "store.restored" };
    case "close":
      return { audit: "platform.store.closed", notification: "store.closed" };
    case "reopen":
      return { audit: "store.reopened", notification: "store.reopened" };
    case "schedule_deletion":
      return { audit: "store.deletion_scheduled", notification: "store.deletion_scheduled" };
    case "cancel_deletion":
      return { audit: "platform.store.deletion_cancelled", notification: "store.deletion_cancelled" };
    case "purge":
      // the request is audited; the store hears nothing until the purge executes (PLA-§8.1)
      return { audit: "platform.store.purge_requested", notification: null };
  }
}

/** core §A.5.1: agent leases are released for restricted, suspended and closed (P4 `releaseAllLeases`, OPE Q.8). */
export const releasesLeases = (to: StoreStatus): boolean => to === "restricted" || to === "suspended" || to === "closed";

/** The store row's lifecycle columns after `from → to` at `now` (the dates lifecycle.ts `transitionColumns` writes). */
export function predictedDates(
  from: StoreStatus,
  to: StoreStatus,
  now: Date,
  row: { closedAt: Date | null; purgeAfter: Date | null },
): { closedAt: Date | null; purgeAfter: Date | null } {
  const at = now.getTime();
  if (to === "closed" && from === "scheduled_deletion") return { closedAt: row.closedAt, purgeAfter: new Date(at + REOPEN_WINDOW_DAYS * DAY) };
  if (to === "closed") return { closedAt: now, purgeAfter: new Date(at + REOPEN_WINDOW_DAYS * DAY) };
  if (from === "closed" && to !== "scheduled_deletion") return { closedAt: null, purgeAfter: null };
  if (to === "scheduled_deletion") return { closedAt: row.closedAt, purgeAfter: new Date(at + DELETION_DELAY_MS) };
  return { closedAt: row.closedAt, purgeAfter: row.purgeAfter };
}

/* ------------------------------------------------------------------ */
/* What the store sees (core §A.5.3, PLA-§22.8)                         */
/* ------------------------------------------------------------------ */

export type PublicPages = "live" | "neutral_404" | "neutral_503" | "unchanged";
export type PublicOrders = "open" | "unavailable" | "refused";

/** core §A.5.3: what a public page answers in `status`. */
export function pagesOf(status: StoreStatus, suspendNotice: boolean): Exclude<PublicPages, "unchanged"> {
  if (status === "active" || status === "restricted") return "live";
  if (status === "suspended" && suspendNotice) return "neutral_503";
  return "neutral_404";
}

/** core §A.5.3: what the public order API answers in `status`. */
export function ordersOf(status: StoreStatus): PublicOrders {
  if (status === "active") return "open";
  if (status === "pending" || status === "restricted") return "unavailable";
  return "refused";
}

/** PLA-§N.2's English texts of P2's keys, used while the shell catalog is not on the branch. */
export const SHELL_FALLBACK_EN: Readonly<Record<string, string>> = {
  "shell.banner.pending": "Your store is in review",
  "shell.banner.restricted": "Orders are paused: {reason}. Your pages stay online.",
  "shell.banner.suspended": "Your store is suspended: {reason}. You can still read and export your data.",
  "shell.banner.closed": "Closed on {date}. You can reopen it until {until}.",
  "shell.page.closed": "This store is closed",
  "shell.page.deletion": "Scheduled for deletion on {date}",
  "shell.page.rejected": "Your application wasn't approved",
};

/** The banner (or state page) key a store shows in `status` (PLA-§22.8; owners and admins of a closed store get the banner). */
export function bannerKeyOf(status: StoreStatus): string | null {
  switch (status) {
    case "pending":
      return "shell.banner.pending";
    case "restricted":
      return "shell.banner.restricted";
    case "suspended":
      return "shell.banner.suspended";
    case "closed":
      return "shell.banner.closed";
    case "scheduled_deletion":
      return "shell.page.deletion";
    case "rejected":
      return "shell.page.rejected";
    default:
      return null;
  }
}

const INTL: Record<AdminLocale, string> = { en: "en-GB", fr: "fr-FR", ar: "ar-MA-u-nu-latn" };

/** A day as the store reads it (its locale, its time zone, Latin digits). */
export function storeDay(at: Date, locale: AdminLocale, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(INTL[locale], { dateStyle: "long", timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(INTL[locale], { dateStyle: "long", timeZone: "UTC" }).format(at);
  }
}

/** The reason sentence the store reads: `shell.status_reason.<code>` (P2), else the notification's label (P1). */
export function reasonSentence(code: string | null, locale: AdminLocale): { text: string; fallback: boolean } {
  if (!code) return { text: "", fallback: false };
  const shell = messageOf(`shell.status_reason.${code}`, locale);
  if (shell !== undefined) return { text: shell, fallback: false };
  return { text: messageOf(`notify.reason.${code}`, locale) ?? code, fallback: true };
}

export interface StoreSeesInput {
  from: StoreStatus;
  /** the status after the change */
  status: StoreStatus;
  reason: string | null;
  closedAt: Date | null;
  purgeAfter: Date | null;
  suspendNotice: boolean;
  locale: AdminLocale;
  timeZone: string;
  /** the notification the change sends (null: nobody is told) and its rendered words */
  notification: { title: string; body: string | null } | null;
}

export interface StoreSees {
  locale: AdminLocale;
  /** the store notification's title and body, rendered from P1's notify catalog in the store's locale */
  title: string | null;
  body: string | null;
  /** the banner or state page the dashboard shows after the change, with the reason sentence and dates */
  banner: string | null;
  publicPages: PublicPages;
  publicOrders: PublicOrders;
  /** a shell key or the reason sentence was missing from the store's locale: English / the notification label stood in */
  fallback: boolean;
}

/** What the store reads and what its visitors meet after the change (pure; the preview and case 11 both call it). */
export function storeSeesFor(i: StoreSeesInput): StoreSees {
  const key = bannerKeyOf(i.status);
  let banner: string | null = null;
  let fallback = false;
  if (key) {
    const template = messageOf(key, i.locale);
    // a missing shell key renders the whole banner in English (never an English sentence around a French reason)
    const locale: AdminLocale = template === undefined ? "en" : i.locale;
    const reason = reasonSentence(i.reason, locale);
    const vars: MessageVars = { reason: reason.text };
    if (i.closedAt) vars.date = storeDay(i.closedAt, locale, i.timeZone);
    if (i.purgeAfter) {
      vars.until = storeDay(i.purgeAfter, locale, i.timeZone);
      if (i.status === "scheduled_deletion") vars.date = vars.until;
    }
    if (template !== undefined) banner = t(key, vars, locale);
    else banner = (SHELL_FALLBACK_EN[key] ?? key).replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
    fallback = template === undefined || (reason.fallback && /\{reason\}/.test(template));
  }
  const before = pagesOf(i.from, i.suspendNotice);
  const after = pagesOf(i.status, i.suspendNotice);
  return {
    locale: i.locale,
    title: i.notification?.title ?? null,
    body: i.notification?.body ?? null,
    banner,
    publicPages: before === after ? "unchanged" : after,
    publicOrders: ordersOf(i.status),
    fallback,
  };
}

/** The store's default locale as an admin locale ("ar" for anything unknown, the platform's default). */
export function storeLocaleOf(value: string | null | undefined): AdminLocale {
  return value === "fr" || value === "en" || value === "ar" ? value : "ar";
}
