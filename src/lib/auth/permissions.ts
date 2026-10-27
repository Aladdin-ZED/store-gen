/**
 * Store roles and permissions, platform roles and permissions (docs/STORE-SAAS.md §A.3). Pure and
 * isomorphic: client components may import it to hide controls, the server always re-checks through
 * the seam (`requireStoreMember` / `storeAction` / `storeGuard`, `requirePlatform` / `platformAction`).
 *
 * The seam grants a store permission when
 *   can(role, p) && modeAllows(store.mode, def.mode) && releaseOn(def.release) && stateAllows(store.status, def)
 * and refuses every write or sensitive key to the impersonation membership (§B.8, D70, D71).
 */
import type { StoreStatus, WritePermission } from "@/lib/tenancy/types";
import type { ModeFeature } from "@/lib/tenancy/mode";

/* ------------------------------------------------------------------ */
/* Releases                                                            */
/* ------------------------------------------------------------------ */

export const RELEASES = ["R1", "R2", "R3"] as const;
export type Release = (typeof RELEASES)[number];

/** The release this build ships. The R2 and R3 contract steps raise it; every release-gated key follows. */
export const CURRENT_RELEASE: Release = "R1";

/** true when `release` has shipped (keys, entitlements, nav items and roles of a later release stay off). */
export function releaseOn(release: Release): boolean {
  return RELEASES.indexOf(release) <= RELEASES.indexOf(CURRENT_RELEASE);
}

/* ------------------------------------------------------------------ */
/* Store roles (§A.3, D4)                                              */
/* ------------------------------------------------------------------ */

export const STORE_ROLES = ["owner", "admin", "manager", "editor", "agent", "logistics", "accountant", "viewer"] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

/** The release each role can first be granted in (logistics and accountant exist in the enum from 0004, granted from R2). */
const ROLE_RELEASE: Record<StoreRole, Release> = {
  owner: "R1",
  admin: "R1",
  manager: "R1",
  editor: "R1",
  agent: "R1",
  logistics: "R2",
  accountant: "R2",
  viewer: "R1",
};

/** roles that can be granted in this release (logistics, accountant: R2) */
export const ACTIVE_STORE_ROLES: readonly StoreRole[] = STORE_ROLES.filter((r) => releaseOn(ROLE_RELEASE[r]));

/** rank for "can't grant or manage a role at or above your own" (owner may grant owner) */
export const ROLE_RANK: Record<StoreRole, number> = { owner: 100, admin: 80, manager: 60, editor: 40, logistics: 40, accountant: 40, agent: 20, viewer: 10 };

export function isStoreRole(value: unknown): value is StoreRole {
  return typeof value === "string" && (STORE_ROLES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Store permission keys (§A.3.1)                                      */
/* ------------------------------------------------------------------ */

/**
 * `write`: refused during read-only impersonation and in read-only states (suspended, closed) unless
 * `readOnlyOk`; `sensitive`: refused to impersonation even as a read, and every use writes an audit row or
 * an `order_events` row; `release`: the key is off until that release ships; `mode`: the store mode
 * feature the key needs (`modeAllows`).
 */
export interface PermissionDef {
  write: boolean;
  sensitive?: true;
  readOnlyOk?: true /* allowed in suspended/closed */;
  release: Release;
  mode?: ModeFeature;
}

export const STORE_PERMISSIONS = {
  "store.read": { write: false, release: "R1" }, // open the dashboard of the store
  "reports.read": { write: false, release: "R1" }, // KPI dashboards and aggregates (no customer data)
  "settings.read": { write: false, release: "R1" }, // store settings (secrets always masked)
  "settings.write": { write: true, release: "R1" }, // profile, market, policies, anti-spam, AI settings, notifications
  "checkout.write": { write: true, release: "R1" }, // delivery zones, checkout field model
  "store.mode": { write: true, release: "R1" },
  "store.close": { write: true, sensitive: true, readOnlyOk: true, release: "R1" }, // close (owner self-service), reopen within 30 days
  "store.export": { write: false, sensitive: true, release: "R1" }, // full data export ZIP (a read: allowed in read-only states)
  "members.read": { write: false, release: "R1" },
  "members.invite": { write: true, release: "R1" }, // within invitableRoles
  "members.manage": { write: true, release: "R1" }, // roles, suspend, remove (rank rule)
  "security.write": { write: true, release: "R1" }, // "require 2FA for members", support grants (R3)
  "audit.read": { write: false, release: "R1" },
  "billing.read": { write: false, release: "R1" }, // plan, usage meters
  "billing.manage": { write: true, release: "R1" }, // request a plan change
  "domains.manage": { write: true, release: "R1" }, // address card, handle rename (R1), custom domains (R3)
  "pages.read": { write: false, release: "R1" }, // pages list, builder (read), previews, history
  "pages.write": { write: true, release: "R1" },
  "pages.publish": { write: true, release: "R1" }, // publish, unpublish, set home page
  "media.read": { write: false, release: "R1" },
  "media.write": { write: true, release: "R1" },
  "export.create": { write: true, release: "R1", mode: "landing" }, // website ZIP, connected, PHP, WhatsApp exports
  "brand.write": { write: true, release: "R1" },
  "pixels.manage": { write: true, release: "R1" }, // pixel ids in the library (Offers D6: only owners add ids)
  "integrations.manage": { write: true, sensitive: true, release: "R1" }, // Sheets, CAPI, Telegram, export key, outbox replay
  "ai.use": { write: true, release: "R1" },
  "ai.manage": { write: true, release: "R1" },
  "ai.assist": { write: false, release: "R3" }, // copilot read tools; never generation
  "campaigns.write": { write: true, release: "R1", mode: "landing" }, // Campaign Kits and short links (SF-01, LP-12)
  "health.snooze": { write: true, release: "R1" },
  "orders.read": { write: false, release: "R1" }, // agents: their queue only
  "orders.read_all": { write: false, release: "R1" },
  "orders.write": { write: true, release: "R1" }, // status moves, attempts, notes on visible orders
  "orders.create": { write: true, release: "R1" }, // manual / phone / DM orders (OP-08)
  "orders.edit": { write: true, release: "R1" }, // lines, quantities, address after creation (re-priced, audited)
  "orders.assign": { write: true, release: "R1" },
  "orders.force_status": { write: true, release: "R1" }, // illegal-transition override with a reason (OP-01)
  "orders.reveal_phone": { write: false, sensitive: true, release: "R1" }, // writes `phone_revealed` (OP-07)
  "orders.export": { write: false, sensitive: true, release: "R1" }, // CSV of orders and leads (rev 3: + manager)
  "leads.read": { write: false, release: "R1" },
  "leads.write": { write: true, release: "R1" },
  "customers.read": { write: false, release: "R1" }, // phones masked unless orders.reveal_phone
  "blocklist.write": { write: true, release: "R1" },
  "callcenter.configure": { write: true, release: "R1" }, // calling window, retry ladder, scripts, quick replies, assignment
  "agents.self": { write: true, release: "R1" }, // own presence, "Next order", own KPIs
  "catalog.read": { write: false, release: "R2", mode: "catalog" },
  "catalog.write": { write: true, release: "R2", mode: "catalog" },
  "storefront.write": { write: true, release: "R2", mode: "storefront" },
  "shipments.write": { write: true, release: "R1" }, // R1: ship-axis moves, slips, Carrier CSV (step-up), tracking columns
  "finance.read": { write: false, release: "R1" }, // R1: Profit lite (flag finance_lite)
  "finance.write": { write: true, release: "R1" }, // R1: item costs, packaging, carrier fee per zone, ad spend
  "commissions.manage": { write: true, release: "R2" },
  "payouts.approve": { write: true, sensitive: true, release: "R2" },
  "reviews.moderate": { write: true, release: "R3" },
  "coupons.manage": { write: true, release: "R3", mode: "storefront" },
  "experiments.manage": { write: true, release: "R3" },
  "support.grant": { write: true, sensitive: true, release: "R3" }, // platform support write access (PL-15)
} as const satisfies Record<string, PermissionDef>;
export type StorePermission = keyof typeof STORE_PERMISSIONS; // a string-literal union, never `string`

export const STORE_PERMISSION_KEYS = Object.keys(STORE_PERMISSIONS) as StorePermission[];

export function isStorePermission(value: unknown): value is StorePermission {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(STORE_PERMISSIONS, value);
}

export function permissionDef(p: StorePermission): PermissionDef {
  return STORE_PERMISSIONS[p];
}

/** Keys refused to impersonation (write or sensitive); the type is `WritePermission` (§E.1). */
export function isWritePermission(p: StorePermission): p is WritePermission {
  const def: PermissionDef = STORE_PERMISSIONS[p];
  return def.write || def.sensitive === true;
}

/**
 * Store state rule of the seam (§A.5.3, §E.2 step 5): pending, active and restricted allow every key
 * (publishing and orders are refused through the entitlement state caps, not here); suspended and closed
 * are read-only (writes refused unless `readOnlyOk`); every other state opens nothing.
 */
export function stateAllows(status: StoreStatus, def: Pick<PermissionDef, "write" | "readOnlyOk">): boolean {
  switch (status) {
    case "pending":
    case "active":
    case "restricted":
      return true;
    case "suspended":
    case "closed":
      return !def.write || def.readOnlyOk === true;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* Store role matrix (§A.3.2)                                          */
/* ------------------------------------------------------------------ */

const ALL: readonly StoreRole[] = STORE_ROLES;
const OA: readonly StoreRole[] = ["owner", "admin"];
const OAM: readonly StoreRole[] = ["owner", "admin", "manager"];
const OAE: readonly StoreRole[] = ["owner", "admin", "editor"];
const CALL: readonly StoreRole[] = ["owner", "admin", "manager", "agent"];

/** Who holds each key; one line per §A.3.2 row. `agent` holds the CALL keys for its own queue only (OWN_QUEUE_KEYS). */
const GRANTS: { readonly [K in StorePermission]: readonly StoreRole[] } = {
  "store.read": ALL,
  "reports.read": ALL, // agent: own KPIs only
  "settings.read": ["owner", "admin", "manager", "editor", "logistics", "accountant"],
  "settings.write": OA,
  "checkout.write": OA,
  "store.mode": ["owner"],
  "store.close": ["owner"],
  "billing.manage": ["owner"],
  "security.write": ["owner"],
  "support.grant": ["owner"],
  "store.export": OA,
  "members.read": OAM,
  "members.invite": OAM, // manager: agents only (invitableRoles)
  "members.manage": OA, // admin: below admin (canManageMember)
  "audit.read": OA,
  "billing.read": OA,
  "domains.manage": OA,
  "pages.read": ["owner", "admin", "manager", "editor", "viewer"],
  "media.read": ["owner", "admin", "manager", "editor", "viewer"],
  "pages.write": OAE,
  "pages.publish": OAE,
  "media.write": OAE,
  "export.create": OAE,
  "brand.write": OAE,
  "ai.use": OAE,
  "campaigns.write": OAE,
  "pixels.manage": OA,
  "integrations.manage": OA,
  "ai.manage": OA,
  "health.snooze": OA,
  "ai.assist": ["owner", "admin", "manager", "editor"],
  "orders.read": ["owner", "admin", "manager", "agent", "logistics", "accountant"], // accountant: masked
  "orders.read_all": ["owner", "admin", "manager", "logistics", "accountant"],
  "orders.write": ["owner", "admin", "manager", "agent", "logistics"], // logistics: ship axis
  "orders.create": CALL,
  "orders.edit": CALL,
  "orders.assign": OAM,
  "orders.force_status": OAM,
  "blocklist.write": OAM,
  "callcenter.configure": OAM,
  "orders.reveal_phone": ["owner", "admin", "manager", "agent", "logistics"],
  "orders.export": OAM, // rev 3, OPS-22: + manager
  "leads.read": CALL,
  "leads.write": CALL,
  "customers.read": ["owner", "admin", "manager", "agent", "logistics", "accountant"], // accountant: no phones
  "agents.self": CALL,
  "catalog.read": ALL,
  "catalog.write": OAE,
  "storefront.write": OAE,
  "shipments.write": ["owner", "admin", "manager", "logistics"],
  "finance.read": ["owner", "admin", "accountant"],
  "finance.write": ["owner", "admin", "accountant"],
  "commissions.manage": OA,
  "payouts.approve": OA,
  "reviews.moderate": OAE,
  "coupons.manage": OA,
  "experiments.manage": OAE,
};

const MATRIX: ReadonlyMap<StoreRole, ReadonlySet<StorePermission>> = new Map(
  STORE_ROLES.map((role) => [role, new Set(STORE_PERMISSION_KEYS.filter((p) => GRANTS[p].includes(role)))] as const),
);

/** The role matrix only (no mode, release, state or impersonation rule: the seam's `ctx.can` adds those). */
export function can(role: StoreRole, p: StorePermission): boolean {
  return MATRIX.get(role)?.has(p) ?? false;
}

export function storePermissionsFor(role: StoreRole): StorePermission[] {
  return STORE_PERMISSION_KEYS.filter((p) => can(role, p));
}

/** `agent*` grants (§A.3.2): an agent holds these for orders in its own queue only (assigned to or claimed by it). */
export const OWN_QUEUE_KEYS: ReadonlySet<StorePermission> = new Set<StorePermission>([
  "orders.read",
  "orders.write",
  "orders.create",
  "orders.edit",
  "orders.reveal_phone",
  "leads.read",
  "leads.write",
  "customers.read",
]);

/**
 * true when the grant of `p` to `role` is limited to the member's own queue (§A.3.2 `agent*`). The predicate is P4's:
 * the queue (assignment and claims, `orders.assignee_id`, `agent_profiles`) arrives with the call center, and its
 * order and lead repositories add `assignee = me` for these keys. **R1.0 interim (T4 review, recorded in §A.3.2):**
 * there is no assignment yet, so an agent works the store's whole order and lead list, as the single-tenant `agent`
 * role did (store #1's agents keep working); it still lacks `orders.read_all`, `orders.export`, `blocklist.write`
 * and every page, settings and integrations key. test:tenancy models it (the agent cases of the T4 review suite).
 */
export function ownQueueOnly(role: StoreRole, p: StorePermission): boolean {
  return role === "agent" && OWN_QUEUE_KEYS.has(p);
}

/**
 * Roles `role` may invite (§B.5): owner = every active role (owner included), admin = active roles ranked
 * below admin, manager = agents only, everyone else none.
 */
export function invitableRoles(role: StoreRole): readonly StoreRole[] {
  switch (role) {
    case "owner":
      return ACTIVE_STORE_ROLES;
    case "admin":
      return ACTIVE_STORE_ROLES.filter((r) => ROLE_RANK[r] < ROLE_RANK.admin);
    case "manager":
      return ["agent"];
    default:
      return [];
  }
}

/**
 * Rank rule for role changes, suspension and removal: an owner manages anyone (the last-owner rule is the
 * caller's), a holder of `members.manage` only roles ranked below its own, everyone else nobody. Changing
 * one's own role is refused by the caller (it needs the member ids).
 */
export function canManageMember(actor: StoreRole, target: StoreRole): boolean {
  if (actor === "owner") return true;
  return can(actor, "members.manage") && ROLE_RANK[target] < ROLE_RANK[actor];
}

/* ------------------------------------------------------------------ */
/* Platform roles and permissions (§A.3.3, D5)                         */
/* ------------------------------------------------------------------ */

export const PLATFORM_ROLES = ["super_admin", "admin", "support", "analyst"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

/**
 * `stepUp`: every use needs TOTP again within 5 minutes (§B.7); `stepUpActions`: the key is step-up only
 * for these actions, which pass `{ stepUp: true }` to `platformAction` (the "↑ (suspend)" cells).
 */
export interface PlatformPermissionDef {
  stepUp: boolean;
  stepUpActions?: readonly string[];
  release?: Release;
}

export const PLATFORM_PERMISSIONS = {
  "console.read": { stepUp: false }, // overview, stores list, store profile with masked PII
  "stores.notes": { stepUp: false },
  "signups.decide": { stepUp: false }, // approve, reject, request info, snooze
  "stores.lifecycle": { stepUp: false, stepUpActions: ["suspend"] }, // restrict, suspend, restore
  "stores.close": { stepUp: true }, // close, schedule deletion
  "stores.purge": { stepUp: true }, // four-eyes or 24 h delay
  "stores.impersonate": { stepUp: false }, // read-only view as store (support: ticket ref required)
  "stores.create": { stepUp: false }, // internal or seeded store from /admin/stores/new
  "orders.lookup": { stepUp: false }, // masked lookup by id or phone; writes platform.order.lookup
  "pii.reveal": { stepUp: true }, // one order
  "abuse.handle": { stepUp: false, release: "R3" },
  "users.manage": { stepUp: true }, // ban, 2FA reset, reset link, force sign-out
  "plans.manage": { stepUp: false },
  "entitlements.override": { stepUp: false }, // overrides and boosts
  "flags.manage": { stepUp: false }, // release / ops flags
  "kill.manage": { stepUp: true }, // kill switches
  "notify.stores": { stepUp: false }, // message one store; broadcasts R3
  "tickets.handle": { stepUp: false, release: "R3" },
  "analytics.read": { stepUp: false }, // k ≥ 5 aggregates
  "health.read": { stepUp: false },
  "domains.manage": { stepUp: false }, // console Domains view, custom domain approvals R3
  "ai.platform": { stepUp: false, stepUpActions: ["cap", "key"] }, // model, caps, prompt versions, eval gate
  "backups.manage": { stepUp: true }, // download, retention
  "legal.manage": { stepUp: false }, // platform documents and store templates
  "staff.manage": { stepUp: true },
  "platform.settings": { stepUp: false },
  "audit.platform": { stepUp: false },
} as const satisfies Record<string, PlatformPermissionDef>;
export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS;

export const PLATFORM_PERMISSION_KEYS = Object.keys(PLATFORM_PERMISSIONS) as PlatformPermission[];

export function isPlatformPermission(value: unknown): value is PlatformPermission {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLATFORM_PERMISSIONS, value);
}

const SA: readonly PlatformRole[] = ["super_admin"];
const SAA: readonly PlatformRole[] = ["super_admin", "admin"];
const SAAS: readonly PlatformRole[] = ["super_admin", "admin", "support"];

const PLATFORM_GRANTS: { readonly [K in PlatformPermission]: readonly PlatformRole[] } = {
  "console.read": PLATFORM_ROLES, // analyst: no notes
  "stores.notes": SAAS,
  "signups.decide": SAA,
  "stores.lifecycle": SAA,
  "stores.close": SAA,
  "stores.purge": SA,
  "stores.impersonate": SAAS,
  "stores.create": SA,
  "orders.lookup": SAA,
  "pii.reveal": SAA,
  "abuse.handle": SAAS,
  "users.manage": SAA,
  "plans.manage": SA,
  "entitlements.override": SAA,
  "flags.manage": SAA,
  "kill.manage": SA,
  "notify.stores": SAAS, // support: one store
  "tickets.handle": SAAS,
  "analytics.read": ["super_admin", "admin", "analyst"],
  "health.read": PLATFORM_ROLES,
  "domains.manage": SAA,
  "ai.platform": SA,
  "backups.manage": SA,
  "legal.manage": SA,
  "staff.manage": SA,
  "platform.settings": SA,
  "audit.platform": SA,
};

/** The platform matrix only (release, 2FA and step-up are the platform seam's). */
export function canPlatform(role: PlatformRole, p: PlatformPermission): boolean {
  return PLATFORM_GRANTS[p]?.includes(role) ?? false;
}

/** Keys whose every use needs a fresh step-up (§B.7); the `stepUpActions` keys opt in per action. */
export const STEP_UP_PERMISSIONS: ReadonlySet<PlatformPermission> = new Set(
  PLATFORM_PERMISSION_KEYS.filter((p) => (PLATFORM_PERMISSIONS[p] as PlatformPermissionDef).stepUp),
);
