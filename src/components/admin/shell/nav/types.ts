/**
 * Tenant dashboard navigation types (docs/STORE-SAAS.md §I.3, ADM-28). Isomorphic and maintainer-owned (§K.3).
 * Items are contributed by the track files `./<track>.ts` (each exports `nav: NavContribution[]`) and filtered by
 * permission, store mode and release in `navFor` (./index.ts); the sidebar, ⌘K and the checklists use the same filter.
 * The shell's view of the registry (labels, icons, the settings tabs) is `../store-nav.ts`.
 */
import type { Release, StorePermission } from "@/lib/auth/permissions";
import type { ModeFeature } from "@/lib/tenancy/mode";
import type { MessageKey } from "@/lib/tenancy/types";

/** A lucide-react icon name without the "Icon" suffix ("ReceiptText"); the shell (P2) maps it to the component. */
export type IconName = string;

/** A count shown on the item, read from the pulse (`StorePulse.counts[countKey]`, §I.4). */
export interface NavBadge {
  countKey: string;
  tone?: "info" | "warn" | "danger";
}

export interface NavItem {
  id: string;
  label: MessageKey;
  href: (handle: string) => string; // appHref(handle, "/orders")
  icon: IconName;
  permission?: StorePermission;
  mode?: ModeFeature;
  release?: Release;
  badge?: NavBadge;
}

export type NavGroupId = "workspace" | "sell" | "landing" | "catalog" | "library" | "team" | "connect" | "money" | "settings";

export interface NavGroup {
  id: NavGroupId;
  label: MessageKey;
  items: NavItem[];
}

/** One item of a track file, placed in a group; `order` sorts inside the group (default 100, then file order). */
export interface NavContribution {
  group: NavGroupId;
  item: NavItem;
  order?: number;
}
