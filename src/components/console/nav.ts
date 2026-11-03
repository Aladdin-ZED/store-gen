/**
 * The console's navigation (platform.md PLA-§4.3, PD36): five groups, each item with the platform permission that
 * opens its page, the release it ships in, its chord and the pulse badge it shows. Isomorphic and pure: the layout
 * filters it on the server (`consoleNavFor(ctx, CURRENT_RELEASE)`) and hands the plain groups to the shell; the
 * sidebar, the console ⌘K "Go to" list and the chords all read the same filtered list, so a hidden page is never
 * offered anywhere. `test:platform` checks the filter per role.
 *
 *   const groups = consoleNavFor(ctx, "R1");                 // what this staff member may open in R1
 *   const here = activeConsoleItem(groups, "/admin/stores/01J…"); // { group: "stores", item: "stores" }
 *   const n = consoleBadgeCount("queue", pulse);              // Review + Hold
 *
 * The AI item links to P7's `/admin/ai` (`ai.platform`, P0b P7-10); the R2 / R3 items stay in the table so a release
 * raise shows them without a code change.
 */
import type { PlatformPermission, Release } from "@/lib/auth/permissions";
import type { MessageKey } from "@/lib/i18n/admin";
import type { ConsolePulse } from "@/lib/platform/pulse-rules";
import type { PlatformCtx } from "@/lib/tenancy/types";

/** A lucide-react icon name without the "Icon" suffix; the sidebar maps it to the component. */
export type ConsoleIconName =
  | "Activity"
  | "Inbox"
  | "Bell"
  | "Store"
  | "Users"
  | "ScanSearch"
  | "ShieldAlert"
  | "Layers"
  | "ToggleRight"
  | "Globe"
  | "Sparkles"
  | "HeartPulse"
  | "DatabaseBackup"
  | "Megaphone"
  | "ChartNoAxesCombined"
  | "Settings2"
  | "UserPlus"
  | "Scale"
  | "BadgeCheck"
  | "Mail"
  | "UsersRound"
  | "ScrollText"
  | "Siren"
  | "ListChecks";

export type ConsoleBadge = "queue" | "unread" | "alarms" | "kill" | "requests";
export type ConsoleGroupId = "pulse" | "stores" | "platform" | "settings" | "security";

export interface ConsoleNavItem {
  id: string;
  label: MessageKey;
  href: `/admin${string}`;
  icon: ConsoleIconName;
  permission: PlatformPermission;
  release: Release;
  badge?: ConsoleBadge;
  /** the second key of its `G <key>` chord (PLA-§4.3) */
  chord?: string;
}

export interface ConsoleNavGroup {
  id: ConsoleGroupId;
  label: MessageKey;
  items: ConsoleNavItem[];
}

const RELEASE_RANK: Record<Release, number> = { R1: 1, R2: 2, R3: 3 };

/** PLA-§4.3, in display order. */
export const CONSOLE_NAV: readonly ConsoleNavGroup[] = [
  {
    id: "pulse",
    label: "console.nav.group.pulse",
    items: [
      { id: "overview", label: "console.nav.overview", href: "/admin", icon: "Activity", permission: "console.read", release: "R1", chord: "o" },
      { id: "approvals", label: "console.nav.approvals", href: "/admin/queue", icon: "ListChecks", permission: "console.read", release: "R1", badge: "queue", chord: "a" },
      { id: "notifications", label: "console.nav.notifications", href: "/admin/notifications", icon: "Bell", permission: "console.read", release: "R1", badge: "unread", chord: "n" },
      { id: "inbox", label: "console.nav.inbox", href: "/admin/inbox", icon: "Inbox", permission: "tickets.handle", release: "R3" },
    ],
  },
  {
    id: "stores",
    label: "console.nav.group.stores",
    items: [
      { id: "stores", label: "console.nav.stores", href: "/admin/stores", icon: "Store", permission: "console.read", release: "R1", chord: "s" },
      { id: "people", label: "console.nav.people", href: "/admin/users", icon: "Users", permission: "console.read", release: "R1", chord: "u" },
      { id: "orders", label: "console.nav.orders", href: "/admin/orders", icon: "ScanSearch", permission: "console.read", release: "R1", chord: "r" },
      { id: "abuse", label: "console.nav.abuse", href: "/admin/abuse", icon: "ShieldAlert", permission: "abuse.handle", release: "R3" },
    ],
  },
  {
    id: "platform",
    label: "console.nav.group.platform",
    items: [
      { id: "plans", label: "console.nav.plans", href: "/admin/plans", icon: "Layers", permission: "console.read", release: "R1", chord: "p" },
      { id: "flags", label: "console.nav.flags", href: "/admin/flags", icon: "ToggleRight", permission: "console.read", release: "R1", badge: "kill", chord: "f" },
      { id: "domains", label: "console.nav.domains", href: "/admin/domains", icon: "Globe", permission: "domains.manage", release: "R1", chord: "d" },
      { id: "ai", label: "console.nav.ai", href: "/admin/ai", icon: "Sparkles", permission: "ai.platform", release: "R1" },
      { id: "health", label: "console.nav.health", href: "/admin/health", icon: "HeartPulse", permission: "health.read", release: "R1", badge: "alarms", chord: "h" },
      { id: "backups", label: "console.nav.backups", href: "/admin/settings/backups", icon: "DatabaseBackup", permission: "backups.manage", release: "R1" },
      { id: "broadcasts", label: "console.nav.broadcasts", href: "/admin/broadcasts", icon: "Megaphone", permission: "notify.stores", release: "R3" },
      { id: "analytics", label: "console.nav.analytics", href: "/admin/analytics", icon: "ChartNoAxesCombined", permission: "analytics.read", release: "R3" },
    ],
  },
  {
    id: "settings",
    label: "console.nav.group.settings",
    items: [
      { id: "general", label: "console.nav.general", href: "/admin/settings/general", icon: "Settings2", permission: "platform.settings", release: "R1" },
      { id: "signup", label: "console.nav.signup", href: "/admin/settings/signup", icon: "UserPlus", permission: "platform.settings", release: "R1" },
      { id: "legal", label: "console.nav.legal", href: "/admin/settings/legal", icon: "Scale", permission: "legal.manage", release: "R1" },
      { id: "brands", label: "console.nav.brands", href: "/admin/settings/brands", icon: "BadgeCheck", permission: "platform.settings", release: "R1" },
      { id: "mail", label: "console.nav.mail", href: "/admin/settings/mail", icon: "Mail", permission: "platform.settings", release: "R2" },
    ],
  },
  {
    id: "security",
    label: "console.nav.group.security",
    items: [
      { id: "staff", label: "console.nav.staff", href: "/admin/security/staff", icon: "UsersRound", permission: "staff.manage", release: "R1" },
      { id: "audit", label: "console.nav.audit", href: "/admin/security/audit", icon: "ScrollText", permission: "audit.platform", release: "R1" },
      { id: "breakglass", label: "console.nav.breakglass", href: "/admin/security/break-glass", icon: "Siren", permission: "audit.platform", release: "R1", badge: "requests" },
    ],
  },
];

/** The groups this staff member may open in `release` (permission and release); an empty group is dropped. */
export function consoleNavFor(ctx: Pick<PlatformCtx, "can">, release: Release, nav: readonly ConsoleNavGroup[] = CONSOLE_NAV): ConsoleNavGroup[] {
  return nav
    .map((g) => ({ ...g, items: g.items.filter((i) => RELEASE_RANK[i.release] <= RELEASE_RANK[release] && ctx.can(i.permission)) }))
    .filter((g) => g.items.length > 0);
}

/** The item a path belongs to: the longest href that prefixes it ("/admin" only for the overview itself). */
export function activeConsoleItem(groups: readonly ConsoleNavGroup[], pathname: string): { group: ConsoleNavGroup; item: ConsoleNavItem } | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  let best: { group: ConsoleNavGroup; item: ConsoleNavItem } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const hit = item.href === "/admin" ? path === "/admin" : path === item.href || path.startsWith(`${item.href}/`);
      if (hit && (!best || item.href.length > best.item.href.length)) best = { group, item };
    }
  }
  return best;
}

/** The count a badge shows from the pulse (0 = no badge); `null` pulse = nothing known yet. */
export function consoleBadgeCount(badge: ConsoleBadge, pulse: Pick<ConsolePulse, "queue" | "unread" | "alarms" | "kill" | "pendingPlatformRequests"> | null): number {
  if (!pulse) return 0;
  switch (badge) {
    case "queue":
      return pulse.queue.review + pulse.queue.hold;
    case "unread":
      return pulse.unread;
    case "alarms":
      return pulse.alarms.red;
    case "kill":
      return pulse.kill.length;
    case "requests":
      return pulse.pendingPlatformRequests;
  }
}

/** The chord table: `G <key>` → the item's href, for the items this staff member sees. */
export function consoleChords(groups: readonly ConsoleNavGroup[]): { key: string; item: ConsoleNavItem }[] {
  return groups.flatMap((g) => g.items.filter((i) => i.chord).map((item) => ({ key: item.chord!, item })));
}
