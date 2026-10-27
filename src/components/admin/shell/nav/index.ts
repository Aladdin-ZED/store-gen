/**
 * The tenant navigation registry (docs/STORE-SAAS.md §I.3). Maintainer-owned (§K.3): the import lines of the track
 * files `./<track>.ts` are pre-written here (P0 for the R1 tracks; an R1.0 track asks through a CCR), so no track
 * edits this file. Groups render in the order of `NAV_GROUPS`; an empty group is dropped.
 */
import { permissionDef, releaseOn } from "@/lib/auth/permissions";
import { modeAllows } from "@/lib/tenancy/mode";
import type { PlatformRole, StorePermission } from "@/lib/auth/permissions";
import type { StoreRow } from "@/lib/tenancy/types";
import { nav as aiNav } from "./ai";
import { nav as consoleNav } from "./console";
import { nav as designNav } from "./design";
import { nav as integrationsNav } from "./integrations";
import { nav as landingNav } from "./landing";
import { nav as opsNav } from "./ops";
import { nav as t4Nav } from "./t4";
import type { NavContribution, NavGroup, NavGroupId, NavItem, StaffNavItem } from "./types";

export type { IconName, NavBadge, NavContribution, NavGroup, NavGroupId, NavItem, StaffNavItem } from "./types";

export const NAV_GROUPS: readonly { id: NavGroupId; label: NavGroup["label"] }[] = [
  { id: "workspace", label: "nav.group.workspace" },
  { id: "sell", label: "nav.group.sell" },
  { id: "landing", label: "nav.group.landing" },
  { id: "catalog", label: "nav.group.catalog" },
  { id: "library", label: "nav.group.library" },
  { id: "team", label: "nav.group.team" },
  { id: "connect", label: "nav.group.connect" },
  { id: "money", label: "nav.group.money" },
  { id: "settings", label: "nav.group.settings" },
];

/**
 * Every contributed sidebar item, in track order: T4's R1.0 dashboard (CCR r1.0-t4-8; P2's file in R1), then P3 … P7
 * (written at P0; `scripts/qa/registries-check.ts` proves no file is left out). P1's `./console.ts` is not a sidebar
 * contribution (PD36): its staff entry is `STAFF_NAV` below.
 */
export const NAV_CONTRIBUTIONS: readonly NavContribution[] = [...t4Nav, ...landingNav, ...opsNav, ...integrationsNav, ...designNav, ...aiNav];

/** The staff entries of the tenant shell (PD36): the store switcher renders them only for `platformRole` not "none". */
export const STAFF_NAV: readonly StaffNavItem[] = consoleNav;

/** `STAFF_NAV` for a viewer: nothing for a member who is not staff. */
export function staffNavFor(platformRole: PlatformRole | "none"): readonly StaffNavItem[] {
  return platformRole === "none" ? [] : STAFF_NAV;
}

/** What the filter reads of a member: the store's mode and the grants (a `StoreCtx`, or the browser's `useStore()`). */
export interface NavCtx {
  store: Pick<StoreRow, "mode">;
  can(p: StorePermission): boolean;
}

/** An item is shown when the member holds its permission and the store's mode and the release allow it. */
export function navItemVisible(ctx: NavCtx, item: NavItem): boolean {
  if (item.release && !releaseOn(item.release)) return false;
  if (item.mode && !modeAllows(ctx.store.mode, item.mode)) return false;
  if (item.permission) {
    const def = permissionDef(item.permission);
    if (!releaseOn(def.release) || (def.mode && !modeAllows(ctx.store.mode, def.mode))) return false;
    if (!ctx.can(item.permission)) return false;
  }
  return true;
}

/** Filters by permission, mode and release. */
export function navFor(ctx: NavCtx, contributions: readonly NavContribution[] = NAV_CONTRIBUTIONS): NavGroup[] {
  const ordered = contributions.map((c, i) => ({ c, i })).sort((a, b) => (a.c.order ?? 100) - (b.c.order ?? 100) || a.i - b.i);
  return NAV_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: ordered.filter(({ c }) => c.group === g.id && navItemVisible(ctx, c.item)).map(({ c }) => c.item),
  })).filter((g) => g.items.length > 0);
}
