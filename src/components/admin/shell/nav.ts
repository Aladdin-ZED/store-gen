/**
 * Panel navigation (role-aware through the permission matrix). Isomorphic config: the sidebar,
 * the command palette and the top bar breadcrumbs all read it.
 */
import {
  HistoryIcon,
  ImagesIcon,
  LayoutGridIcon,
  PackageOpenIcon,
  PanelsTopLeftIcon,
  ReceiptTextIcon,
  Settings2Icon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react";
import { legacyCan as can, type Permission, type Role } from "@/lib/auth/permissions";

export interface NavItem {
  id: "dashboard" | "pages" | "generate" | "orders" | "media" | "history" | "exports" | "settings";
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  /** keywords for the command palette */
  keywords?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: "/admin/dashboard", icon: LayoutGridIcon, permission: "pages.read", keywords: ["home", "overview", "kpi"] },
  { id: "pages", label: "Pages", href: "/admin/pages", icon: PanelsTopLeftIcon, permission: "pages.read", keywords: ["landing", "site"] },
  { id: "generate", label: "Generate", href: "/admin/generate", icon: SparklesIcon, permission: "pages.write", keywords: ["new", "create", "ai"] },
  { id: "orders", label: "Orders", href: "/admin/orders", icon: ReceiptTextIcon, permission: "orders.read", keywords: ["commandes", "leads", "blocklist"] },
  { id: "media", label: "Media", href: "/admin/media", icon: ImagesIcon, permission: "pages.read", keywords: ["images", "photos", "upload"] },
  { id: "history", label: "History", href: "/admin/history", icon: HistoryIcon, permission: "pages.read", keywords: ["versions", "generations", "restore"] },
  { id: "exports", label: "Exports", href: "/admin/exports", icon: PackageOpenIcon, permission: "export.create", keywords: ["zip", "download", "keys"] },
  { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings2Icon, keywords: ["store", "sheets", "security", "2fa"] },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.permission || can(role, i.permission));
}

/** The nav item a pathname belongs to (longest prefix wins; "/admin" only matches exactly). */
export function activeNav(pathname: string): NavItem | undefined {
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === "/admin" ? pathname === "/admin" : pathname === i.href || pathname.startsWith(`${i.href}/`)));
}

export interface SettingsNavItem {
  id: string;
  label: string;
  href: string;
  description: string;
  /** permission needed to see the tab (Security is for everyone) */
  permission?: Permission;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { id: "store", label: "Store & legal", href: "/admin/settings/store", description: "Name, contacts and legal identity", permission: "settings.read" },
  { id: "market", label: "Market defaults", href: "/admin/settings/market", description: "Currency, language, phone and shipping", permission: "settings.read" },
  { id: "sheets", label: "Google Sheets", href: "/admin/settings/sheets", description: "Send orders to your call center", permission: "settings.read" },
  { id: "pixels", label: "Pixels", href: "/admin/settings/pixels", description: "Meta, TikTok, Snap and Google tags", permission: "settings.read" },
  { id: "ai", label: "Local AI", href: "/admin/settings/ai", description: "On-device models and background removal", permission: "settings.read" },
  { id: "anti-spam", label: "Anti-spam", href: "/admin/settings/anti-spam", description: "Cloudflare Turnstile keys", permission: "settings.read" },
  { id: "security", label: "Security", href: "/admin/settings/security", description: "Password, two-step verification, devices" },
  { id: "team", label: "Team", href: "/admin/settings/team", description: "Users and roles", permission: "users.manage" },
  { id: "audit", label: "Audit log", href: "/admin/settings/audit", description: "Who changed what, and when", permission: "users.manage" },
];

export function settingsNavFor(role: Role): SettingsNavItem[] {
  return SETTINGS_NAV.filter((i) => !i.permission || can(role, i.permission));
}
