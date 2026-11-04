/**
 * The store dashboard's navigation as the shell draws it (docs/STORE-SAAS.md §I.3, §A.2, ADM-28): the tenant registry
 * (`navFor`, ./nav/index.ts) filtered with the member's grants, the store's mode and the release, labels resolved from
 * the catalogs, icons mapped. Isomorphic config: the sidebar, the settings sub-navigation, ⌘K, the topbar's breadcrumb,
 * the Help sheet and the search provider all read it, so a mode switch hides an item everywhere at once and deletes
 * nothing (its data stays; the item comes back when the mode allows it again).
 *
 * - `storeNav`: every visible item by group, the settings tabs included (⌘K's jump list, the breadcrumb).
 * - `sidebarNav`: the same groups with the settings group folded into one "Settings" entry (the sidebar).
 * - `settingsTabs`: the registry's `settings` group (the sub-navigation): P3's, P5's and P7's tabs appear with their
 *   order, without a P2 edit.
 *
 * The R1.0 screens whose owners have not contributed their item yet (`INTERIM_NAV`, ./nav/t4.ts) are added while no
 * registry item has the same id or link, so each shows exactly once before and after its owner's merge.
 */
import {
  BellIcon,
  CircleIcon,
  ContactRoundIcon,
  CpuIcon,
  FileTextIcon,
  GaugeIcon,
  GlobeIcon,
  HeadsetIcon,
  HistoryIcon,
  ImagesIcon,
  InboxIcon,
  LayoutGridIcon,
  Link2Icon,
  LinkIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  PackageIcon,
  PackageOpenIcon,
  PaletteIcon,
  PanelsTopLeftIcon,
  PhoneCallIcon,
  RadarIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  SendIcon,
  Settings2Icon,
  SheetIcon,
  ShieldBanIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  StoreIcon,
  TriangleAlertIcon,
  TruckIcon,
  UsersRoundIcon,
  WalletIcon,
  WebhookIcon,
  type LucideIcon,
} from "lucide-react";
import type { StorePermission } from "@/lib/auth/permissions";
import { ADMIN_LOCALES, messageOf, t, type AdminLocale } from "@/lib/i18n/admin";
import type { StoreMode } from "@/lib/tenancy/mode";
import { appHref } from "@/lib/urls";
import { NAV_CONTRIBUTIONS, navFor, type NavContribution, type NavGroupId } from "./nav/index";
import { INTERIM_NAV, NAV_KEYWORDS } from "./nav/t4";

/** The registry's icon names (lucide without the "Icon" suffix) the shell draws; an unknown name draws a circle. */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  Bell: BellIcon,
  ContactRound: ContactRoundIcon,
  Cpu: CpuIcon,
  FileText: FileTextIcon,
  Gauge: GaugeIcon,
  Globe: GlobeIcon,
  Headset: HeadsetIcon,
  History: HistoryIcon,
  Images: ImagesIcon,
  Inbox: InboxIcon,
  LayoutGrid: LayoutGridIcon,
  Link: LinkIcon,
  Link2: Link2Icon,
  ListChecks: ListChecksIcon,
  Megaphone: MegaphoneIcon,
  MessageCircle: MessageCircleIcon,
  Package: PackageIcon,
  PackageOpen: PackageOpenIcon,
  Palette: PaletteIcon,
  PanelsTopLeft: PanelsTopLeftIcon,
  PhoneCall: PhoneCallIcon,
  Radar: RadarIcon,
  ReceiptText: ReceiptTextIcon,
  ScrollText: ScrollTextIcon,
  Send: SendIcon,
  Settings2: Settings2Icon,
  Sheet: SheetIcon,
  ShieldBan: ShieldBanIcon,
  ShieldCheck: ShieldCheckIcon,
  SlidersHorizontal: SlidersHorizontalIcon,
  Sparkles: SparklesIcon,
  Store: StoreIcon,
  TriangleAlert: TriangleAlertIcon,
  Truck: TruckIcon,
  UsersRound: UsersRoundIcon,
  Wallet: WalletIcon,
  Webhook: WebhookIcon,
};

/** The component of a registry icon name (a circle for a name the map lacks). */
export function navIcon(name: string): LucideIcon {
  return ICONS[name] ?? CircleIcon;
}

/** A message key of the shell in the viewer's locale (English when the locale lacks it, the key when no catalog has it). */
export function shellLabel(key: string, locale: AdminLocale = "en"): string {
  return t(key, undefined, locale);
}

export interface ShellNavItem {
  id: string;
  group: NavGroupId;
  label: string;
  labelKey: string;
  href: string;
  /** the path prefix that makes the item active, when it is not `href` (the folded Settings entry) */
  match?: string;
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

const PROBE = "probe";

/** The registry's contributions plus the interim R1.0 items no contribution covers yet (by id or by link). */
export function shellContributions(registry: readonly NavContribution[] = NAV_CONTRIBUTIONS, interim: readonly NavContribution[] = INTERIM_NAV): NavContribution[] {
  const ids = new Set(registry.map((c) => c.item.id));
  const hrefs = new Set(registry.map((c) => c.item.href(PROBE)));
  return [...registry, ...interim.filter((c) => !ids.has(c.item.id) && !hrefs.has(c.item.href(PROBE)))];
}

/** A call agent always lands on Orders (the overview redirects there, src/app/app/[store]/page.tsx): no Overview item. */
const redirectedHome = (viewer: NavViewer) => !viewer.can("pages.read") && viewer.can("orders.read");

/** Every item the member may open in this store, by group, the settings tabs included. */
export function storeNav(viewer: NavViewer, locale: AdminLocale = "en", contributions: readonly NavContribution[] = shellContributions()): ShellNavGroup[] {
  const home = redirectedHome(viewer);
  return navFor({ store: { mode: viewer.mode }, can: viewer.can }, contributions)
    .map((g) => ({ ...g, items: home ? g.items.filter((i) => i.id !== "overview") : g.items }))
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      id: g.id,
      label: shellLabel(g.label, locale),
      items: g.items.map((i) => ({
        id: i.id,
        group: g.id,
        label: shellLabel(i.label, locale),
        labelKey: i.label,
        href: i.href(viewer.handle),
        icon: navIcon(i.icon),
        ...(i.badge ? { badgeKey: i.badge.countKey } : {}),
        keywords: [...(NAV_KEYWORDS[i.id] ?? [])],
      })),
    }));
}

/** The id of the sidebar's one settings entry. */
export const SETTINGS_ENTRY_ID = "settings";

/**
 * The sidebar's groups: `storeNav` with the settings group folded into one "Settings" entry that opens the member's
 * first tab and stays active on every settings path.
 */
export function sidebarNav(groups: readonly ShellNavGroup[], handle: string, locale: AdminLocale = "en"): ShellNavGroup[] {
  return groups.map((g) => {
    if (g.id !== "settings") return g;
    const first = g.items[0]!;
    const entry: ShellNavItem = {
      id: SETTINGS_ENTRY_ID,
      group: "settings",
      label: shellLabel("nav.settings", locale),
      labelKey: "nav.settings",
      href: first.href,
      match: appHref(handle, "/settings"),
      icon: Settings2Icon,
      keywords: g.items.flatMap((i) => [i.label, ...i.keywords]),
    };
    return { ...g, items: [entry] };
  });
}

/** The nav item a pathname belongs to (the longest link or match prefix wins; the overview only matches exactly). */
export function activeNav(pathname: string, groups: readonly ShellNavGroup[], handle: string): ShellNavItem | undefined {
  const home = appHref(handle);
  const at = (i: ShellNavItem) => i.match ?? i.href.replace(/[?#].*$/, "");
  return groups
    .flatMap((g) => g.items)
    .sort((a, b) => at(b).length - at(a).length)
    .find((i) => {
      const p = at(i);
      return p === home ? pathname === home : pathname === p || pathname.startsWith(`${p}/`);
    });
}

/* ------------------------------------------------------------------ */
/* Settings sub-navigation (the registry's `settings` group)           */
/* ------------------------------------------------------------------ */

export interface SettingsTab {
  id: string;
  label: string;
  /** the tab's one-line description (`<label key>_lead`), when a catalog has one */
  description: string | null;
  href: string;
  icon: LucideIcon;
  keywords: string[];
}

/** The description key of a settings tab: its label key with `_lead` (a track adds one to get the line). */
export const tabLeadKey = (labelKey: string) => `${labelKey}_lead`;

/** The settings tabs the member may open, in the registry's order. */
export function settingsTabs(viewer: NavViewer, locale: AdminLocale = "en", contributions?: readonly NavContribution[]): SettingsTab[] {
  const group = storeNav(viewer, locale, contributions).find((g) => g.id === "settings");
  return (group?.items ?? []).map((i) => {
    const lead = tabLeadKey(i.labelKey);
    return { id: i.id, label: i.label, description: messageOf(lead, locale) !== undefined ? t(lead, undefined, locale) : null, href: i.href, icon: i.icon, keywords: i.keywords };
  });
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
