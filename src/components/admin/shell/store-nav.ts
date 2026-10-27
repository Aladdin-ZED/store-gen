/**
 * The store dashboard's navigation as the shell draws it (docs/STORE-SAAS.md §I.3, ADM-28): the tenant registry
 * (`navFor`, ./nav/index.ts) filtered with the member's grants and the store's mode, labels resolved, icons mapped.
 * Isomorphic config: the sidebar, the command palette and the top bar breadcrumbs all read it.
 *
 * The R1.0 items (./nav/t4.ts) are merged in by id until the registry imports them (CCR r1.0-t4-8), so they show
 * exactly once either way.
 */
import {
  CircleIcon,
  HistoryIcon,
  ImagesIcon,
  LayoutGridIcon,
  PackageOpenIcon,
  PanelsTopLeftIcon,
  RadarIcon,
  ReceiptTextIcon,
  Settings2Icon,
  SheetIcon,
  SparklesIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";
import type { StorePermission } from "@/lib/auth/permissions";
import { messageOf, t, type AdminLocale } from "@/lib/i18n/admin";
import type { StoreMode } from "@/lib/tenancy/mode";
import { appHref } from "@/lib/urls";
import { NAV_CONTRIBUTIONS, navFor, type NavContribution, type NavGroupId } from "./nav/index";
import { NAV_FALLBACK_LABELS, NAV_KEYWORDS, nav as dashboardNav } from "./nav/t4";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  LayoutGrid: LayoutGridIcon,
  ReceiptText: ReceiptTextIcon,
  PanelsTopLeft: PanelsTopLeftIcon,
  Sparkles: SparklesIcon,
  Images: ImagesIcon,
  History: HistoryIcon,
  PackageOpen: PackageOpenIcon,
  UsersRound: UsersRoundIcon,
  Sheet: SheetIcon,
  Radar: RadarIcon,
  Settings2: Settings2Icon,
};

/** A message key of the shell in the viewer's locale; the R1.0 English label while no catalog has it. */
export function shellLabel(key: string, locale: AdminLocale = "en"): string {
  return messageOf(key, locale) !== undefined ? t(key, undefined, locale) : (NAV_FALLBACK_LABELS[key] ?? key);
}

export interface ShellNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: string;
  keywords: string[];
}

export interface ShellNavGroup {
  id: NavGroupId;
  label: string;
  items: ShellNavItem[];
}

/** What the nav filter needs to know about the member (the client's view of `StoreCtx`). */
export interface NavViewer {
  handle: string;
  mode: StoreMode;
  can(p: StorePermission): boolean;
}

/** The registry's contributions plus the R1.0 items it doesn't list yet (by id). */
function contributions(): readonly NavContribution[] {
  const ids = new Set(NAV_CONTRIBUTIONS.map((c) => c.item.id));
  return [...NAV_CONTRIBUTIONS, ...dashboardNav.filter((c) => !ids.has(c.item.id))];
}

/** A call agent always lands on Orders (the overview redirects there, src/app/app/[store]/page.tsx): no Overview item. */
const redirectedHome = (viewer: NavViewer) => !viewer.can("pages.read") && viewer.can("orders.read");

export function storeNav(viewer: NavViewer, locale: AdminLocale = "en"): ShellNavGroup[] {
  const home = redirectedHome(viewer);
  return navFor({ store: { mode: viewer.mode }, can: viewer.can }, contributions())
    .map((g) => ({ ...g, items: home ? g.items.filter((i) => i.id !== "overview") : g.items }))
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      id: g.id,
      label: shellLabel(g.label, locale),
      items: g.items.map((i) => ({
        id: i.id,
        label: shellLabel(i.label, locale),
        href: i.href(viewer.handle),
        icon: ICONS[i.icon] ?? CircleIcon,
        ...(i.badge ? { badgeKey: i.badge.countKey } : {}),
        keywords: [...(NAV_KEYWORDS[i.id] ?? [])],
      })),
    }));
}

/** The nav item a pathname belongs to (longest href prefix wins; the overview only matches exactly). */
export function activeNav(pathname: string, groups: readonly ShellNavGroup[], handle: string): ShellNavItem | undefined {
  const home = appHref(handle);
  return groups
    .flatMap((g) => g.items)
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === home ? pathname === home : pathname === i.href || pathname.startsWith(`${i.href}/`)));
}

/* ------------------------------------------------------------------ */
/* Settings sub-navigation                                             */
/* ------------------------------------------------------------------ */

export interface SettingsNavItem {
  id: string;
  label: string;
  /** store-relative ("/settings/general") */
  path: `/${string}`;
  description: string;
  permission: StorePermission;
}

/** Today's settings tabs at their §I.1 homes (members, account security and the integrations have their own screens). */
export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  { id: "general", label: "Store & legal", path: "/settings/general", description: "Name, contacts and legal identity", permission: "settings.read" },
  { id: "market", label: "Market defaults", path: "/settings/market", description: "Currency, language, phone and shipping", permission: "settings.read" },
  { id: "ai", label: "Local AI", path: "/settings/ai", description: "On-device models and background removal", permission: "settings.read" },
  { id: "anti-spam", label: "Anti-spam", path: "/settings/anti-spam", description: "Cloudflare Turnstile keys", permission: "settings.read" },
  { id: "audit", label: "Audit log", path: "/settings/audit", description: "Who changed what, and when", permission: "audit.read" },
];

export function settingsNavFor(can: (p: StorePermission) => boolean): readonly SettingsNavItem[] {
  return SETTINGS_NAV.filter((i) => can(i.permission));
}
