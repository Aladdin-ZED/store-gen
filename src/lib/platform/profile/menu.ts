/**
 * The store profile's lifecycle menu (platform.md PLA-§7.1, §8.1; PD44, PD54): which actions the StatusPill menu and
 * the ⋯ menu list for a store in one status, for one staff member. Pure (`test:platform`).
 *
 * An item is hidden without its permission (`REQUIREMENTS[action].permission`), and disabled with its reason when the
 * edge is not allowed from the current status (`console.lifecycle.from.<action>`), or while a purge request waits.
 * Choosing an item only opens the LifecycleSheet: no lifecycle action exists in ⌘K, a chord or the bulk bar.
 *
 *   lifecycleMenu("active", can, { closedFrom: null, pendingPurge: false })
 *   // [{ action: "restrict", to: "restricted", disabledKey: null }, { action: "suspend", … }, { action: "restore", disabledKey: "console.lifecycle.from.restore" }, …]
 */
import type { PlatformPermission } from "@/lib/auth/permissions";
import type { StoreStatus } from "@/lib/tenancy/types";
import { LIFECYCLE_ACTIONS, lifecycleActionOf, REQUIREMENTS, type LifecycleAction } from "../lifecycle-rules";

export interface LifecycleMenuItem {
  action: LifecycleAction;
  /** the status the sheet previews (restore → active; reopen → the state the store was closed from) */
  to: StoreStatus;
  /** null = allowed; otherwise the `console.lifecycle.*` key saying why not */
  disabledKey: string | null;
  /** the action needs a fresh step-up (the sheet asks before arming) */
  stepUp: boolean;
  danger: boolean;
}

const DANGER: ReadonlySet<LifecycleAction> = new Set(["suspend", "close", "schedule_deletion", "purge"]);

/** The status each action previews from `from` (restore defaults to active; the sheet offers restricted too). */
export function targetOf(action: LifecycleAction, closedFrom: StoreStatus | null): StoreStatus {
  switch (action) {
    case "restrict":
      return "restricted";
    case "suspend":
      return "suspended";
    case "restore":
      return "active";
    case "close":
      return "closed";
    case "reopen":
      return closedFrom ?? "active";
    case "schedule_deletion":
      return "scheduled_deletion";
    case "cancel_deletion":
      return "closed";
    case "purge":
      return "purged";
  }
}

export function lifecycleMenu(status: StoreStatus, can: (p: PlatformPermission) => boolean, opts: { closedFrom: StoreStatus | null; pendingPurge: boolean }): LifecycleMenuItem[] {
  return LIFECYCLE_ACTIONS.filter((action) => can(REQUIREMENTS[action].permission)).map((action) => {
    const to = targetOf(action, opts.closedFrom);
    let disabledKey: string | null = null;
    if (status === "purged") disabledKey = "console.lifecycle.purged";
    else if (lifecycleActionOf(status, to) !== action) disabledKey = `console.lifecycle.from.${action}`;
    else if (opts.pendingPurge && (action === "purge" || action === "reopen" || action === "cancel_deletion")) disabledKey = "console.lifecycle.purge_pending";
    return { action, to, disabledKey, stepUp: REQUIREMENTS[action].stepUp, danger: DANGER.has(action) };
  });
}
