/**
 * The role explainer's words (P2 SHELL; platform.md PLA-§22.4.4, TN-08, TN-12; docs/STORE-SAAS.md §A.3). Pure and
 * isomorphic: the invite form, the role select and the members table render what `roleSummary(role)` answers.
 *
 * Derived from `STORE_PERMISSIONS` through `can()` so it never drifts from the matrix: each capability below names the
 * permission keys it stands for, a role "can" when it holds all of them and "can't" when it holds none of the keys the
 * "Can't" sentence is about (a role in between is described by neither, rather than over- or under-promising). One line per role
 * (`team.role.<role>.line`), up to 4 "Can" and 3 "Can't" bullets (`team.role.can.*` / `team.role.cannot.*`). Only
 * the roles of `ACTIVE_STORE_ROLES` are offered (`activeRoleSummaries`); logistics and accountant come with R2.
 */
import { ACTIVE_STORE_ROLES, can, type StorePermission, type StoreRole } from "@/lib/auth/permissions";
import type { MessageKey } from "@/lib/i18n/admin";

export interface RoleSummary {
  role: StoreRole;
  label: MessageKey;
  line: MessageKey;
  can: MessageKey[];
  cannot: MessageKey[];
}

export const ROLE_CAN_MAX = 4;
export const ROLE_CANNOT_MAX = 3;

export interface RoleCapability {
  id: string;
  /** the permission keys the "Can" bullet stands for (all held) */
  keys: readonly StorePermission[];
  /** the keys whose absence the "Can't" bullet states (none held); default `keys` */
  lacks?: readonly StorePermission[];
  /** a capability only meaningful without another one (an agent's own queue is not "every order") */
  unless?: readonly StorePermission[];
}

/**
 * The capabilities in the order a role's "Can" list is read (most telling first). `team.role.can.<id>` and
 * `team.role.cannot.<id>` exist for every id (test:i18n-coverage).
 */
export const ROLE_CAPABILITIES: readonly RoleCapability[] = [
  { id: "orders_all", keys: ["orders.read_all", "orders.write"], lacks: ["orders.read_all"] },
  { id: "orders_own", keys: ["orders.read", "orders.write"], unless: ["orders.read_all"] },
  { id: "pages", keys: ["pages.write", "media.write"] },
  { id: "view_pages", keys: ["pages.read", "media.read"], unless: ["pages.write"] },
  { id: "publish", keys: ["pages.publish"] },
  { id: "team", keys: ["members.invite", "members.manage"] },
  { id: "settings", keys: ["settings.write"] },
  { id: "billing", keys: ["billing.manage"] },
  { id: "security", keys: ["security.write", "store.close"] },
  { id: "callcenter", keys: ["callcenter.configure"] },
  { id: "integrations", keys: ["integrations.manage"] },
  { id: "customers", keys: ["customers.read"] },
  { id: "reports", keys: ["reports.read"] },
  { id: "export", keys: ["store.export"] },
];

/** The order of the "Can't" list: what a member is most likely to ask about first. */
const CANNOT_ORDER: readonly string[] = ["orders_all", "customers", "pages", "publish", "settings", "team", "billing", "security", "integrations", "export", "reports", "callcenter"];

const holdsAll = (role: StoreRole, keys: readonly StorePermission[]) => keys.every((k) => can(role, k));
const holdsNone = (role: StoreRole, keys: readonly StorePermission[]) => keys.every((k) => !can(role, k));

/** Does `role` have capability `cap`? true = all of its keys, false = none of them, null = some (not described). */
export function capabilityOf(role: StoreRole, cap: RoleCapability): boolean | null {
  if (cap.unless && !holdsNone(role, cap.unless)) return null;
  if (holdsAll(role, cap.keys)) return true;
  if (holdsNone(role, cap.lacks ?? cap.keys)) return false;
  return null;
}

export function roleSummary(role: StoreRole): RoleSummary {
  const yes: string[] = [];
  const no = new Set<string>();
  for (const cap of ROLE_CAPABILITIES) {
    const v = capabilityOf(role, cap);
    if (v === true) yes.push(cap.id);
    else if (v === false) no.add(cap.id);
  }
  // "Can't handle orders" already says "can't see every order"
  if (no.has("orders_own")) no.delete("orders_all");
  const cannot = [...(no.has("orders_own") ? ["orders_own"] : []), ...CANNOT_ORDER.filter((id) => no.has(id))];
  return {
    role,
    label: `team.role.${role}`,
    line: `team.role.${role}.line`,
    can: yes.slice(0, ROLE_CAN_MAX).map((id) => `team.role.can.${id}`),
    cannot: cannot.slice(0, ROLE_CANNOT_MAX).map((id) => `team.role.cannot.${id}`),
  };
}

/** The roles a member can be given in this release, each with its summary (TN-12). */
export function activeRoleSummaries(): RoleSummary[] {
  return ACTIVE_STORE_ROLES.map(roleSummary);
}
