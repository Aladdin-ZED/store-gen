/**
 * The store dashboard's R1.0 navigation (docs/STORE-SAAS.md §I.1, §I.3; T4's dashboard move): today's screens at
 * their `/app/<handle>` homes, contributed to the tenant registry (./index.ts) like every track's items. Isomorphic.
 *
 * Labels are message keys. Until the catalogs carry them (the R1 tracks' `src/lib/i18n/admin/<locale>/<track>.ts`
 * files, P0), `NAV_FALLBACK_LABELS` gives the English text, so the shell never shows a raw key; P2 takes these items
 * over with the shell (R1 product).
 */
import { appHref } from "@/lib/urls";
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [
  { group: "workspace", order: 10, item: { id: "overview", label: "nav.overview", href: (h) => appHref(h), icon: "LayoutGrid", permission: "store.read" } },
  { group: "sell", order: 10, item: { id: "orders", label: "nav.orders", href: (h) => appHref(h, "/orders"), icon: "ReceiptText", permission: "orders.read", badge: { countKey: "newOrders" } } },
  { group: "landing", order: 10, item: { id: "pages", label: "nav.pages", href: (h) => appHref(h, "/pages"), icon: "PanelsTopLeft", permission: "pages.read", mode: "landing" } },
  { group: "landing", order: 20, item: { id: "generate", label: "nav.generate", href: (h) => appHref(h, "/generate"), icon: "Sparkles", permission: "pages.write", mode: "landing" } },
  { group: "library", order: 10, item: { id: "media", label: "nav.media", href: (h) => appHref(h, "/media"), icon: "Images", permission: "media.read" } },
  { group: "library", order: 20, item: { id: "history", label: "nav.history", href: (h) => appHref(h, "/history"), icon: "History", permission: "pages.read" } },
  { group: "library", order: 30, item: { id: "exports", label: "nav.exports", href: (h) => appHref(h, "/exports"), icon: "PackageOpen", permission: "pages.read", mode: "landing" } },
  { group: "team", order: 10, item: { id: "team", label: "nav.team", href: (h) => appHref(h, "/team"), icon: "UsersRound", permission: "members.read" } },
  { group: "connect", order: 10, item: { id: "sheets", label: "nav.sheets", href: (h) => appHref(h, "/integrations/sheets"), icon: "Sheet", permission: "settings.read" } },
  { group: "connect", order: 20, item: { id: "pixels", label: "nav.pixels", href: (h) => appHref(h, "/integrations/pixels"), icon: "Radar", permission: "settings.read" } },
  { group: "settings", order: 10, item: { id: "settings", label: "nav.settings", href: (h) => appHref(h, "/settings"), icon: "Settings2", permission: "settings.read" } },
];

/** English labels of the R1.0 keys and of the registry's group keys (until the catalogs carry them). */
export const NAV_FALLBACK_LABELS: Readonly<Record<string, string>> = {
  "nav.overview": "Overview",
  "nav.orders": "Orders",
  "nav.pages": "Pages",
  "nav.generate": "Generate",
  "nav.media": "Media",
  "nav.history": "History",
  "nav.exports": "Exports",
  "nav.team": "Members & invites",
  "nav.sheets": "Google Sheets",
  "nav.pixels": "Pixels",
  "nav.settings": "Settings",
  "nav.group.workspace": "Workspace",
  "nav.group.sell": "Sell",
  "nav.group.landing": "Landing pages",
  "nav.group.catalog": "Catalog",
  "nav.group.library": "Library",
  "nav.group.team": "Team",
  "nav.group.connect": "Connect",
  "nav.group.money": "Money",
  "nav.group.settings": "Settings",
};

/** ⌘K keywords of the R1.0 items. */
export const NAV_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  overview: ["home", "dashboard", "kpi"],
  orders: ["commandes", "leads", "blocklist"],
  pages: ["landing", "site"],
  generate: ["new", "create", "ai"],
  media: ["images", "photos", "upload"],
  history: ["versions", "generations", "restore"],
  exports: ["zip", "download", "keys"],
  team: ["members", "invites", "roles"],
  sheets: ["google", "sync", "call center"],
  pixels: ["meta", "tiktok", "tracking", "capi"],
  settings: ["store", "market", "anti-spam", "audit"],
};
