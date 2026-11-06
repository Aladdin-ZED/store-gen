/**
 * The shell's navigation items (P2 SHELL; docs/STORE-SAAS.md §I.3; platform.md PLA-§22.13): the file the tenant
 * registry (./index.ts) imports as `./t4` (T4's R1.0 dashboard move, CCR r1.0-t4-8; P2's file in R1). Isomorphic.
 *
 * - `nav`: what the shell owns. Workspace: Overview, Notifications. Library: Media, History, Exports. Team: Members &
 *   invites. Settings (group `settings`, the settings sub-navigation): General, Market, Security, Address, Plan &
 *   usage, Audit, Danger zone, ordered so the other tracks' tabs (Checkout & delivery, Policies, Brand, Anti-spam, AI)
 *   slot between them by their `order` (§I.3's row).
 * - `INTERIM_NAV`: R1.0 screens whose R1 owner has not contributed its item yet (Orders: P4; Pages, Generate: P3;
 *   Sheets, Pixels, Anti-spam: P5; Local AI: P7). `../store-nav.ts` shows one only while no registry item has its id
 *   or its link, so the dashboard keeps every screen between merges and the owner's item replaces it without a P2 edit.
 *
 * Labels are catalog keys (the base catalogs' `nav.*`, P2's `shell.nav.*` and `shell.settings.*`); a settings tab's
 * one-line description is the key `<label>_lead` when a catalog has it (`settingsTabs`).
 */
import { appHref } from "@/lib/urls";
import type { NavContribution } from "./types";

export const nav: NavContribution[] = [
  { group: "workspace", order: 10, item: { id: "overview", label: "nav.overview", href: (h) => appHref(h), icon: "LayoutGrid", permission: "store.read" } },
  { group: "workspace", order: 20, item: { id: "notifications", label: "shell.nav.notifications", href: (h) => appHref(h, "/notifications"), icon: "Bell", permission: "store.read" } },
  { group: "library", order: 10, item: { id: "media", label: "nav.media", href: (h) => appHref(h, "/media"), icon: "Images", permission: "media.read" } },
  { group: "library", order: 20, item: { id: "history", label: "nav.history", href: (h) => appHref(h, "/history"), icon: "History", permission: "pages.read" } },
  { group: "library", order: 30, item: { id: "exports", label: "nav.exports", href: (h) => appHref(h, "/exports"), icon: "PackageOpen", permission: "export.create", mode: "landing" } },
  { group: "team", order: 10, item: { id: "team", label: "nav.team", href: (h) => appHref(h, "/team"), icon: "UsersRound", permission: "members.read" } },
  { group: "settings", order: 10, item: { id: "general", label: "shell.settings.general", href: (h) => appHref(h, "/settings/general"), icon: "SlidersHorizontal", permission: "settings.read" } },
  { group: "settings", order: 20, item: { id: "market", label: "shell.settings.market", href: (h) => appHref(h, "/settings/market"), icon: "Globe", permission: "settings.read" } },
  { group: "settings", order: 80, item: { id: "security", label: "shell.settings.security", href: (h) => appHref(h, "/settings/security"), icon: "ShieldCheck", permission: "settings.read" } },
  { group: "settings", order: 90, item: { id: "address", label: "shell.settings.address", href: (h) => appHref(h, "/settings/address"), icon: "Link", permission: "settings.read" } },
  { group: "settings", order: 100, item: { id: "plan", label: "shell.settings.plan", href: (h) => appHref(h, "/settings/plan"), icon: "Gauge", permission: "billing.read" } },
  { group: "settings", order: 110, item: { id: "audit", label: "shell.settings.audit", href: (h) => appHref(h, "/settings/audit"), icon: "ScrollText", permission: "audit.read" } },
  { group: "settings", order: 120, item: { id: "danger", label: "shell.settings.danger", href: (h) => appHref(h, "/settings/danger"), icon: "TriangleAlert", permission: "settings.read" } },
];

/** R1.0 screens kept until their R1 owner contributes the item (see the header); never part of the registry. */
export const INTERIM_NAV: readonly NavContribution[] = [
  { group: "sell", order: 10, item: { id: "orders", label: "nav.orders", href: (h) => appHref(h, "/orders"), icon: "ReceiptText", permission: "orders.read", badge: { countKey: "newOrders" } } },
  { group: "landing", order: 10, item: { id: "pages", label: "nav.pages", href: (h) => appHref(h, "/pages"), icon: "PanelsTopLeft", permission: "pages.read", mode: "landing" } },
  { group: "landing", order: 20, item: { id: "generate", label: "nav.generate", href: (h) => appHref(h, "/generate"), icon: "Sparkles", permission: "pages.write", mode: "landing" } },
  { group: "connect", order: 10, item: { id: "sheets", label: "nav.sheets", href: (h) => appHref(h, "/integrations/sheets"), icon: "Sheet", permission: "integrations.manage" } },
  { group: "connect", order: 20, item: { id: "pixels", label: "nav.pixels", href: (h) => appHref(h, "/integrations/pixels"), icon: "Radar", permission: "pixels.manage" } },
  { group: "settings", order: 60, item: { id: "anti-spam", label: "shell.settings.anti_spam", href: (h) => appHref(h, "/settings/anti-spam"), icon: "ShieldBan", permission: "settings.read" } },
  { group: "settings", order: 70, item: { id: "ai", label: "shell.settings.ai", href: (h) => appHref(h, "/settings/ai"), icon: "Cpu", permission: "settings.read" } },
];

/** ⌘K keywords per item id (any language the seller types; the label itself always matches). */
export const NAV_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  overview: ["home", "dashboard", "kpi", "accueil", "الرئيسية"],
  notifications: ["bell", "alerts", "inbox", "alertes", "إشعارات"],
  orders: ["commandes", "leads", "blocklist", "طلبات"],
  pages: ["landing", "site", "صفحات"],
  generate: ["new", "create", "ai", "créer", "إنشاء"],
  media: ["images", "photos", "upload", "صور"],
  history: ["versions", "generations", "restore", "historique"],
  exports: ["zip", "download", "keys", "télécharger"],
  team: ["members", "invites", "roles", "équipe", "فريق"],
  sheets: ["google", "sync", "call center"],
  pixels: ["meta", "tiktok", "tracking", "capi"],
  general: ["store", "name", "category", "language", "timezone", "mode", "boutique", "اسم المتجر"],
  market: ["currency", "mad", "formats", "devise", "عملة"],
  security: ["2fa", "two-step", "password", "sécurité", "أمان"],
  address: ["handle", "url", "link", "qr", "domain", "adresse", "رابط"],
  plan: ["usage", "limits", "quota", "boost", "billing", "forfait", "باقة"],
  audit: ["log", "activity", "history", "journal", "سجل"],
  danger: ["close", "delete", "export", "leave", "fermer", "إغلاق"],
  "anti-spam": ["turnstile", "cloudflare", "captcha", "spam"],
  ai: ["model", "background", "on-device", "local", "ذكاء"],
};
