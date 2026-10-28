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
import { ADMIN_LOCALES, messageOf, t, type AdminLocale } from "@/lib/i18n/admin";
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
  /** the English label (the item's fallback while a catalog lacks `labelKey`) */
  label: string;
  labelKey: string;
  /** store-relative ("/settings/general") */
  path: `/${string}`;
  description: string;
  descriptionKey: string;
  permission: StorePermission;
}

/** Today's settings tabs at their §I.1 homes (members, account security and the integrations have their own screens). */
export const SETTINGS_NAV: readonly SettingsNavItem[] = [
  {
    id: "general",
    label: "Store & legal",
    labelKey: "shell.settings.general",
    path: "/settings/general",
    description: "Name, contacts and legal identity",
    descriptionKey: "shell.settings.general_lead",
    permission: "settings.read",
  },
  {
    id: "market",
    label: "Market defaults",
    labelKey: "shell.settings.market",
    path: "/settings/market",
    description: "Currency, language, phone and shipping",
    descriptionKey: "shell.settings.market_lead",
    permission: "settings.read",
  },
  {
    id: "ai",
    label: "Local AI",
    labelKey: "shell.settings.ai",
    path: "/settings/ai",
    description: "On-device models and background removal",
    descriptionKey: "shell.settings.ai_lead",
    permission: "settings.read",
  },
  {
    id: "anti-spam",
    label: "Anti-spam",
    labelKey: "shell.settings.anti_spam",
    path: "/settings/anti-spam",
    description: "Cloudflare Turnstile keys",
    descriptionKey: "shell.settings.anti_spam_lead",
    permission: "settings.read",
  },
  {
    id: "audit",
    label: "Audit log",
    labelKey: "shell.settings.audit",
    path: "/settings/audit",
    description: "Who changed what, and when",
    descriptionKey: "shell.settings.audit_lead",
    permission: "audit.read",
  },
];

export function settingsNavFor(can: (p: StorePermission) => boolean): readonly SettingsNavItem[] {
  return SETTINGS_NAV.filter((i) => can(i.permission));
}

/** A settings tab's label (or its one-line description) in `locale`; the English text while no catalog has the key. */
export function settingsText(item: SettingsNavItem, part: "label" | "description", locale: AdminLocale = "en"): string {
  const key = part === "label" ? item.labelKey : item.descriptionKey;
  return messageOf(key, locale) !== undefined ? t(key, undefined, locale) : item[part];
}

/* ------------------------------------------------------------------ */
/* Which screens render in the viewer's language (§I.5, D36)           */
/* ------------------------------------------------------------------ */

/**
 * P2's trilingual screens (PLA-§22 intro: ar, fr and en in R1), store-relative. The shell chrome always follows the
 * viewer's language; a screen does only when it is listed here, so the dashboard's English screens (D36: fr R2, ar
 * R3) never render mirrored under `dir="rtl"`. `ready` is flipped by the step that ships the screen's translated
 * body; until then the route keeps English (the screen's text is still the R1.0 English one). Other tracks opt their
 * screen in with `<ScreenLocale>` around its root, never through this list.
 */
export const TRILINGUAL_SCREENS: readonly { path: "" | `/${string}`; ready: boolean }[] = [
  { path: "", ready: false }, // the overview: the dashboard redesign (p2-09)
  { path: "/welcome", ready: false }, // onboarding (p2-12)
  { path: "/notifications", ready: false }, // the notification centre (p2-09)
  { path: "/team", ready: true }, // T2's translated team page (members and invites)
  { path: "/settings/general", ready: false },
  { path: "/settings/market", ready: false },
  { path: "/settings/plan", ready: false },
  { path: "/settings/address", ready: false },
  { path: "/settings/security", ready: false },
  { path: "/settings/danger", ready: false },
  { path: "/settings/audit", ready: false }, // the settings pages (p2-10)
];

/** Inside a trilingual subtree but another track's screen (P4's agents and call center: fr R1, ar R3). */
const ENGLISH_UNDER: readonly `/${string}`[] = ["/team/agents", "/team/callcenter"];

const ENGLISH_ONLY: readonly AdminLocale[] = ["en"];

const under = (rel: string, path: string) => rel === path || rel.startsWith(`${path}/`);

/**
 * The locales the screen at `rel` (the path after `/app/<handle>`, "" for the overview) renders in: all three for a
 * ready trilingual screen, English otherwise. Pure.
 */
export function screenLocalesFor(rel: string): readonly AdminLocale[] {
  const path = rel.replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (ENGLISH_UNDER.some((p) => under(path, p))) return ENGLISH_ONLY;
  const screen = TRILINGUAL_SCREENS.find((s) => (s.path === "" ? path === "" : under(path, s.path)));
  return screen?.ready ? ADMIN_LOCALES : ENGLISH_ONLY;
}

/** The locale a screen renders in: the viewer's when the screen supports it, else English. Pure. */
export function screenLocale(viewer: AdminLocale, supported: readonly AdminLocale[]): AdminLocale {
  return supported.includes(viewer) ? viewer : "en";
}

/** The store-relative part of a dashboard pathname ("/app/atlas/team" → "/team"); null outside the store's dashboard. */
export function storeRelativePath(pathname: string, home: string): string | null {
  if (pathname === home) return "";
  return pathname.startsWith(`${home}/`) ? pathname.slice(home.length) : null;
}
