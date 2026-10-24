/**
 * Permission self-test (docs/STORE-SAAS.md §J.1 `test:permissions`):
 *   npm run test:permissions        (tsx src/lib/auth/selftest-permissions.ts; offline, no DB)
 *
 * The matrix invariants of §A.3, checked against an independent transcription of the spec tables (§A.3.1 flags and
 * releases, §A.3.2 store roles, §A.3.3 platform roles and the ↑ column), so a drift in permissions.ts fails here:
 *   - owner has every key; nobody but owner has store.mode / store.close / billing.manage / security.write;
 *   - `invitableRoles` never returns a role ranked at or above the inviter (owner excepted) nor an inactive role;
 *   - the seam's grant rule (`storeGrant`, src/lib/auth/grant.ts): release, mode, state (suspended / closed:
 *     writes only if `readOnlyOk`), a suspended membership, and the impersonation membership, which is refused
 *     every write or sensitive key and granted every other R1 key;
 *   - every key has a release; the platform step-up set ⊇ the ↑ column; the tenant step-up keys are sensitive;
 *   - D71 at the type level (checked by `tsc`, this file is in the project): `WritePermission` equals the keys
 *     marked w or s, `WriteScope` is not assignable from `platformScope()` or an impersonation scope, and the
 *     `storeAction` / `storeGuard` overloads hand `fn` a `WriteCtx` only when every key is a write key.
 * Exits 1 on any failure.
 */
import type { platformScope } from "@/lib/platform/seam";
import type { mintScope, storeAction, storeGuard } from "@/lib/tenancy/seam";
import type { Membership, StoreRow, StoreScope, StoreStatus, WritePermission, WriteScope } from "@/lib/tenancy/types";
import { IMPERSONATION_MEMBERSHIP, PLATFORM_READ_ONLY_OK, STORE_STEP_UP_PERMISSIONS, storeGrant, storeGrantAll } from "./grant";
import {
  ACTIVE_STORE_ROLES,
  PLATFORM_PERMISSION_KEYS,
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  RELEASES,
  ROLE_RANK,
  STEP_UP_PERMISSIONS,
  STORE_PERMISSION_KEYS,
  STORE_ROLES,
  can,
  canManageMember,
  canPlatform,
  invitableRoles,
  isWritePermission,
  ownQueueOnly,
  permissionDef,
  releaseOn,
  type PlatformPermission,
  type PlatformPermissionDef,
  type PlatformRole,
  type StorePermission,
  type StoreRole,
} from "./permissions";

let checks = 0;
let failures = 0;
const check = (ok: boolean, msg: string) => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};
const sameSet = <T>(a: Iterable<T>, b: Iterable<T>) => {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
};
const show = (v: Iterable<unknown>) => [...v].join(", ") || "(none)";

/* ------------------------------------------------------------------ */
/* The spec tables, transcribed (§A.3.1, §A.3.2, §A.3.3)               */
/* ------------------------------------------------------------------ */

type Flags = { w?: true; s?: true; ro?: true; rel: "R1" | "R2" | "R3"; mode?: "landing" | "catalog" | "storefront" };

/** §A.3.1: w = write, s = sensitive, ro = readOnlyOk, the release and the mode feature. */
const SPEC_FLAGS = {
  "store.read": { rel: "R1" },
  "reports.read": { rel: "R1" },
  "settings.read": { rel: "R1" },
  "settings.write": { w: true, rel: "R1" },
  "checkout.write": { w: true, rel: "R1" },
  "store.mode": { w: true, rel: "R1" },
  "store.close": { w: true, ro: true, s: true, rel: "R1" },
  "store.export": { s: true, rel: "R1" },
  "members.read": { rel: "R1" },
  "members.invite": { w: true, rel: "R1" },
  "members.manage": { w: true, rel: "R1" },
  "security.write": { w: true, rel: "R1" },
  "audit.read": { rel: "R1" },
  "billing.read": { rel: "R1" },
  "billing.manage": { w: true, rel: "R1" },
  "domains.manage": { w: true, rel: "R1" },
  "pages.read": { rel: "R1" },
  "pages.write": { w: true, rel: "R1" },
  "pages.publish": { w: true, rel: "R1" },
  "media.read": { rel: "R1" },
  "media.write": { w: true, rel: "R1" },
  "export.create": { w: true, rel: "R1", mode: "landing" },
  "brand.write": { w: true, rel: "R1" },
  "pixels.manage": { w: true, rel: "R1" },
  "integrations.manage": { w: true, s: true, rel: "R1" },
  "ai.use": { w: true, rel: "R1" },
  "ai.manage": { w: true, rel: "R1" },
  "ai.assist": { rel: "R3" },
  "campaigns.write": { w: true, rel: "R1", mode: "landing" },
  "health.snooze": { w: true, rel: "R1" },
  "orders.read": { rel: "R1" },
  "orders.read_all": { rel: "R1" },
  "orders.write": { w: true, rel: "R1" },
  "orders.create": { w: true, rel: "R1" },
  "orders.edit": { w: true, rel: "R1" },
  "orders.assign": { w: true, rel: "R1" },
  "orders.force_status": { w: true, rel: "R1" },
  "orders.reveal_phone": { s: true, rel: "R1" },
  "orders.export": { s: true, rel: "R1" },
  "leads.read": { rel: "R1" },
  "leads.write": { w: true, rel: "R1" },
  "customers.read": { rel: "R1" },
  "blocklist.write": { w: true, rel: "R1" },
  "callcenter.configure": { w: true, rel: "R1" },
  "agents.self": { w: true, rel: "R1" },
  "catalog.read": { rel: "R2", mode: "catalog" },
  "catalog.write": { w: true, rel: "R2", mode: "catalog" },
  "storefront.write": { w: true, rel: "R2", mode: "storefront" },
  "shipments.write": { w: true, rel: "R1" },
  "finance.read": { rel: "R1" },
  "finance.write": { w: true, rel: "R1" },
  "commissions.manage": { w: true, rel: "R2" },
  "payouts.approve": { w: true, s: true, rel: "R2" },
  "reviews.moderate": { w: true, rel: "R3" },
  "coupons.manage": { w: true, rel: "R3", mode: "storefront" },
  "experiments.manage": { w: true, rel: "R3" },
  "support.grant": { w: true, s: true, rel: "R3" },
} as const satisfies Record<StorePermission, Flags>;

/** The keys §A.3.1 marks w or s: the set `WritePermission` must equal (D71). */
const SPEC_WRITE = [
  "settings.write",
  "checkout.write",
  "store.mode",
  "store.close",
  "store.export",
  "members.invite",
  "members.manage",
  "security.write",
  "billing.manage",
  "domains.manage",
  "pages.write",
  "pages.publish",
  "media.write",
  "export.create",
  "brand.write",
  "pixels.manage",
  "integrations.manage",
  "ai.use",
  "ai.manage",
  "campaigns.write",
  "health.snooze",
  "orders.write",
  "orders.create",
  "orders.edit",
  "orders.assign",
  "orders.force_status",
  "orders.reveal_phone",
  "orders.export",
  "leads.write",
  "blocklist.write",
  "callcenter.configure",
  "agents.self",
  "catalog.write",
  "storefront.write",
  "shipments.write",
  "finance.write",
  "commissions.manage",
  "payouts.approve",
  "reviews.moderate",
  "coupons.manage",
  "experiments.manage",
  "support.grant",
] as const satisfies readonly StorePermission[];

const OA: readonly StoreRole[] = ["owner", "admin"];
const OAM: readonly StoreRole[] = ["owner", "admin", "manager"];
const OAE: readonly StoreRole[] = ["owner", "admin", "editor"];
const OAMG: readonly StoreRole[] = ["owner", "admin", "manager", "agent"];

/** §A.3.2, one entry per table row (agent* rows include agent; the own-queue limit is checked separately). */
const SPEC_MATRIX: [readonly StorePermission[], readonly StoreRole[]][] = [
  [["store.read", "reports.read"], STORE_ROLES],
  [["settings.read"], ["owner", "admin", "manager", "editor", "logistics", "accountant"]],
  [["settings.write", "checkout.write"], OA],
  [["store.mode", "store.close", "billing.manage", "security.write", "support.grant"], ["owner"]],
  [["store.export"], OA],
  [["members.read"], OAM],
  [["members.invite"], OAM],
  [["members.manage"], OA],
  [["audit.read", "billing.read"], OA],
  [["domains.manage"], OA],
  [["pages.read", "media.read"], ["owner", "admin", "manager", "editor", "viewer"]],
  [["pages.write", "pages.publish", "media.write", "export.create", "brand.write", "ai.use", "campaigns.write"], OAE],
  [["pixels.manage", "integrations.manage", "ai.manage", "health.snooze"], OA],
  [["ai.assist"], ["owner", "admin", "manager", "editor"]],
  [["orders.read"], ["owner", "admin", "manager", "agent", "logistics", "accountant"]],
  [["orders.read_all"], ["owner", "admin", "manager", "logistics", "accountant"]],
  [["orders.write"], ["owner", "admin", "manager", "agent", "logistics"]],
  [["orders.create", "orders.edit"], OAMG],
  [["orders.assign", "orders.force_status", "blocklist.write", "callcenter.configure"], OAM],
  [["orders.reveal_phone"], ["owner", "admin", "manager", "agent", "logistics"]],
  [["orders.export"], OAM],
  [["leads.read", "leads.write"], OAMG],
  [["customers.read"], ["owner", "admin", "manager", "agent", "logistics", "accountant"]],
  [["agents.self"], OAMG],
  [["catalog.read"], STORE_ROLES],
  [["catalog.write", "storefront.write"], OAE],
  [["shipments.write"], ["owner", "admin", "manager", "logistics"]],
  [["finance.read"], ["owner", "admin", "accountant"]],
  [["finance.write"], ["owner", "admin", "accountant"]],
  [["commissions.manage", "payouts.approve"], OA],
  [["reviews.moderate"], OAE],
  [["coupons.manage"], OA],
  [["experiments.manage"], OAE],
];

/** The agent* cells of §A.3.2: an agent holds these for its own queue only. */
const SPEC_OWN_QUEUE: readonly StorePermission[] = ["orders.read", "orders.write", "orders.create", "orders.edit", "orders.reveal_phone", "leads.read", "leads.write", "customers.read"];

const P: Record<"all" | "SA" | "SAA" | "SAAS", readonly PlatformRole[]> = {
  all: PLATFORM_ROLES,
  SA: ["super_admin"],
  SAA: ["super_admin", "admin"],
  SAAS: ["super_admin", "admin", "support"],
};

/** §A.3.3: holders, the full-key ↑ and the per-action ↑ ("↑ (suspend)", "↑ (cap and key)"), the release. */
const SPEC_PLATFORM: Record<PlatformPermission, { roles: readonly PlatformRole[]; up?: true; upActions?: readonly string[]; rel?: "R3" }> = {
  "console.read": { roles: P.all },
  "stores.notes": { roles: P.SAAS },
  "signups.decide": { roles: P.SAA },
  "stores.lifecycle": { roles: P.SAA, upActions: ["suspend"] },
  "stores.close": { roles: P.SAA, up: true },
  "stores.purge": { roles: P.SA, up: true },
  "stores.impersonate": { roles: P.SAAS },
  "stores.create": { roles: P.SA },
  "orders.lookup": { roles: P.SAA },
  "pii.reveal": { roles: P.SAA, up: true },
  "abuse.handle": { roles: P.SAAS, rel: "R3" },
  "users.manage": { roles: P.SAA, up: true },
  "plans.manage": { roles: P.SA },
  "entitlements.override": { roles: P.SAA },
  "flags.manage": { roles: P.SAA },
  "kill.manage": { roles: P.SA, up: true },
  "notify.stores": { roles: P.SAAS },
  "tickets.handle": { roles: P.SAAS, rel: "R3" },
  "analytics.read": { roles: ["super_admin", "admin", "analyst"] },
  "health.read": { roles: P.all },
  "domains.manage": { roles: P.SAA },
  "ai.platform": { roles: P.SA, upActions: ["cap", "key"] },
  "backups.manage": { roles: P.SA, up: true },
  "legal.manage": { roles: P.SA },
  "staff.manage": { roles: P.SA, up: true },
  "platform.settings": { roles: P.SA },
  "audit.platform": { roles: P.SA },
};

/* ------------------------------------------------------------------ */
/* Key definitions                                                     */
/* ------------------------------------------------------------------ */

check(sameSet(STORE_PERMISSION_KEYS, Object.keys(SPEC_FLAGS)), `store keys = §A.3.1 keys (code: ${STORE_PERMISSION_KEYS.length}, spec: ${Object.keys(SPEC_FLAGS).length})`);
for (const p of STORE_PERMISSION_KEYS) {
  const def = permissionDef(p);
  const spec: Flags = SPEC_FLAGS[p];
  check((RELEASES as readonly string[]).includes(def.release), `${p}: has a release (${def.release})`);
  check(def.release === spec.rel, `${p}: release ${def.release} = §A.3.1 ${spec.rel}`);
  check(def.write === (spec.w === true), `${p}: write ${def.write} = §A.3.1`);
  check((def.sensitive === true) === (spec.s === true), `${p}: sensitive = §A.3.1`);
  check((def.readOnlyOk === true) === (spec.ro === true), `${p}: readOnlyOk = §A.3.1`);
  check(def.mode === spec.mode, `${p}: mode ${def.mode ?? "-"} = §A.3.1 ${spec.mode ?? "-"}`);
  check(!def.readOnlyOk || def.write, `${p}: readOnlyOk only on a write key`);
}
check(sameSet(STORE_PERMISSION_KEYS.filter(isWritePermission), SPEC_WRITE), `isWritePermission = keys marked w or s: ${show(STORE_PERMISSION_KEYS.filter(isWritePermission))}`);

/* ------------------------------------------------------------------ */
/* Store role matrix                                                   */
/* ------------------------------------------------------------------ */

const covered = SPEC_MATRIX.flatMap(([keys]) => keys);
check(covered.length === new Set(covered).size && sameSet(covered, STORE_PERMISSION_KEYS), "§A.3.2 transcription names every key exactly once");
for (const [keys, holders] of SPEC_MATRIX) {
  for (const p of keys) {
    for (const role of STORE_ROLES) {
      check(can(role, p) === holders.includes(role), `${role} ${can(role, p) ? "holds" : "lacks"} ${p}, §A.3.2 says ${holders.includes(role) ? "holds" : "lacks"}`);
    }
  }
}
for (const p of STORE_PERMISSION_KEYS) check(can("owner", p), `owner holds ${p}`);
for (const p of ["store.mode", "store.close", "billing.manage", "security.write", "support.grant"] as const) {
  check(STORE_ROLES.filter((r) => can(r, p)).join() === "owner", `only owner holds ${p}`);
}
for (const role of STORE_ROLES) {
  check(can(role, "store.read"), `${role} opens the dashboard (store.read)`);
  if (can(role, "campaigns.write")) check(can(role, "pages.write"), `${role}: campaigns.write ⊆ pages.write holders`);
  if (can(role, "orders.read_all")) check(can(role, "orders.read"), `${role}: orders.read_all implies orders.read`);
  if (can(role, "members.invite") || can(role, "members.manage")) check(can(role, "members.read"), `${role}: manages members, so reads them`);
}
check(can("manager", "ai.assist") && !can("manager", "ai.use"), "ai.assist never implies ai.use (manager: assist, no use)");
check(
  sameSet(
    STORE_ROLES.filter((r) => can(r, "shipments.write")),
    ["owner", "admin", "manager", "logistics"],
  ) && !ACTIVE_STORE_ROLES.includes("logistics"),
  "shipments.write in R1: owner, admin, manager (logistics only from R2)",
);
check(
  (["finance.read", "finance.write"] as const).every((p) => sameSet(STORE_ROLES.filter((r) => can(r, p)), ["owner", "admin", "accountant"])) &&
    !ACTIVE_STORE_ROLES.includes("accountant"),
  "finance.* in R1: owner, admin (accountant only from R2)",
);
for (const p of SPEC_OWN_QUEUE) check(can("agent", p), `agent holds ${p} (own queue)`);
for (const role of STORE_ROLES) {
  for (const p of STORE_PERMISSION_KEYS) {
    check(ownQueueOnly(role, p) === (role === "agent" && SPEC_OWN_QUEUE.includes(p)), `${role} ${p}: own-queue rule`);
  }
}

/* ------------------------------------------------------------------ */
/* Invites and the rank rule (§A.3.2 hard rules, §B.5)                */
/* ------------------------------------------------------------------ */

check(sameSet(ACTIVE_STORE_ROLES, ["owner", "admin", "manager", "editor", "agent", "viewer"]), `active roles in R1: ${show(ACTIVE_STORE_ROLES)}`);
for (const role of STORE_ROLES) {
  const inv = invitableRoles(role);
  for (const r of inv) {
    check(ACTIVE_STORE_ROLES.includes(r), `${role} invites ${r}: an active role`);
    if (role !== "owner") check(ROLE_RANK[r] < ROLE_RANK[role], `${role} invites ${r}: ranked below the inviter`);
  }
  if (inv.length > 0) check(can(role, "members.invite"), `${role} invites someone, so holds members.invite`);
}
check(sameSet(invitableRoles("owner"), ACTIVE_STORE_ROLES), "owner invites every active role (owner included)");
check(sameSet(invitableRoles("admin"), ["manager", "editor", "agent", "viewer"]), `admin invites below admin: ${show(invitableRoles("admin"))}`);
check(sameSet(invitableRoles("manager"), ["agent"]), "manager invites agents only");
for (const role of ["editor", "agent", "viewer", "logistics", "accountant"] as const) check(invitableRoles(role).length === 0, `${role} invites nobody`);
for (const actor of STORE_ROLES) {
  for (const target of STORE_ROLES) {
    const expected = actor === "owner" || (can(actor, "members.manage") && ROLE_RANK[target] < ROLE_RANK[actor]);
    check(canManageMember(actor, target) === expected, `canManageMember(${actor}, ${target})`);
  }
}
check(!canManageMember("admin", "admin") && !canManageMember("admin", "owner") && canManageMember("admin", "manager"), "admin manages below admin only");

/* ------------------------------------------------------------------ */
/* The seam's grant rule (storeGrant)                                  */
/* ------------------------------------------------------------------ */

const store = (status: StoreStatus, mode: StoreRow["mode"] = "landing") => ({ status, mode });
const member = (role: StoreRole, status: Membership["status"] = "active"): Membership => ({ role, status });
const OPEN: readonly StoreStatus[] = ["pending", "active", "restricted"];
const READ_ONLY: readonly StoreStatus[] = ["suspended", "closed"];
const SHUT: readonly StoreStatus[] = ["scheduled_deletion", "purged", "rejected"];

for (const p of STORE_PERMISSION_KEYS) {
  const def = permissionDef(p);
  const on = releaseOn(def.release);
  for (const role of STORE_ROLES) {
    const held = can(role, p) && on;
    for (const st of OPEN) check(storeGrant(store(st), member(role), p) === (held ? "ok" : "forbidden"), `${role} ${p} in ${st}`);
    for (const st of READ_ONLY) {
      const want = !held ? "forbidden" : !def.write || def.readOnlyOk ? "ok" : "read_only";
      check(storeGrant(store(st), member(role), p) === want, `${role} ${p} in ${st}: ${want}`);
    }
    for (const st of SHUT) check(storeGrant(store(st), member(role), p) !== "ok", `${role} ${p} in ${st}: nothing opens`);
    check(storeGrant(store("active"), member(role, "suspended"), p) === "forbidden", `${role} ${p}: a suspended membership holds nothing`);
  }
  // the impersonation membership (§B.8, D70): every write or sensitive key refused, every other released key granted
  const imp = storeGrant(store("active"), IMPERSONATION_MEMBERSHIP, p);
  const want = !on ? "forbidden" : isWritePermission(p) ? "impersonation_read_only" : "ok";
  check(imp === want, `impersonation ${p}: ${imp}, want ${want}`);
  for (const st of READ_ONLY) {
    const ro = storeGrant(store(st), IMPERSONATION_MEMBERSHIP, p);
    check(ro === (!on ? "forbidden" : isWritePermission(p) ? "impersonation_read_only" : "ok"), `impersonation ${p} in ${st}: ${ro}`);
  }
}
check(IMPERSONATION_MEMBERSHIP.synthetic === "impersonation" && Object.isFrozen(IMPERSONATION_MEMBERSHIP), "the impersonation membership is synthetic and frozen");
check(storeGrant(store("active"), member("owner"), "no.such.key" as StorePermission) === "forbidden", "an unknown key → forbidden");
check(storeGrant(store("active", "store"), member("owner"), "export.create") === (releaseOn("R2") ? "forbidden" : "ok"), "landing keys in a store-mode shop: open until R2");
check(storeGrantAll(store("suspended"), member("owner"), ["orders.read", "pages.write"]) === "read_only", "storeGrantAll: first refusal");
check(storeGrantAll(store("active"), member("agent"), ["orders.read", "pages.write"]) === "forbidden", "storeGrantAll: forbidden key");
check(storeGrantAll(store("active"), member("owner"), []) === "ok", "storeGrantAll: no keys → ok");
check(storeGrantAll(store("active"), IMPERSONATION_MEMBERSHIP, ["orders.read", "orders.reveal_phone"]) === "impersonation_read_only", "storeGrantAll: impersonation sensitive read");

/* ------------------------------------------------------------------ */
/* Step-up and the kill switch                                         */
/* ------------------------------------------------------------------ */

for (const p of ["store.export", "orders.export", "store.close"] as const) check(STORE_STEP_UP_PERMISSIONS.has(p), `tenant step-up: ${p} (§B.7)`);
for (const p of STORE_STEP_UP_PERMISSIONS) check(permissionDef(p).sensitive === true, `tenant step-up key ${p} is sensitive (never reached under impersonation)`);
check(sameSet(PLATFORM_PERMISSION_KEYS, Object.keys(SPEC_PLATFORM)), "platform keys = §A.3.3 keys");
for (const p of PLATFORM_PERMISSION_KEYS) {
  const spec = SPEC_PLATFORM[p];
  const def: PlatformPermissionDef = PLATFORM_PERMISSIONS[p];
  for (const role of PLATFORM_ROLES) check(canPlatform(role, p) === spec.roles.includes(role), `${role} ${canPlatform(role, p) ? "holds" : "lacks"} ${p}, §A.3.3 says ${spec.roles.includes(role) ? "holds" : "lacks"}`);
  if (spec.up) check(STEP_UP_PERMISSIONS.has(p), `platform step-up set has ${p} (↑)`);
  check(STEP_UP_PERMISSIONS.has(p) === def.stepUp, `${p}: STEP_UP_PERMISSIONS follows stepUp`);
  check(sameSet(def.stepUpActions ?? [], spec.upActions ?? []), `${p}: per-action ↑ ${show(def.stepUpActions ?? [])}`);
  check(def.release === spec.rel, `${p}: release ${def.release ?? "R1"}`);
}
check(PLATFORM_READ_ONLY_OK.has("kill.manage"), "platform_read_only keeps kill.manage usable (§H.8)");
for (const p of ["stores.lifecycle", "stores.close", "stores.purge", "users.manage", "plans.manage", "entitlements.override", "flags.manage", "staff.manage", "platform.settings", "signups.decide", "stores.notes"] as const) {
  check(!PLATFORM_READ_ONLY_OK.has(p), `platform_read_only refuses ${p}`);
}

/* ------------------------------------------------------------------ */
/* D71 at the type level (tsc checks this file; nothing below runs)    */
/* ------------------------------------------------------------------ */

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assignable<A, B> = [A] extends [B] ? true : false;
type PlatformScope = ReturnType<typeof platformScope>;
type ImpersonationScope = ReturnType<typeof mintScope<"impersonation">>;
type MemberScope = ReturnType<typeof mintScope<"member">>;

const typeFacts: [
  Equal<WritePermission, (typeof SPEC_WRITE)[number]>,
  Equal<Assignable<PlatformScope, WriteScope>, false>,
  Equal<Assignable<ImpersonationScope, WriteScope>, false>,
  Equal<Assignable<StoreScope, WriteScope>, false>,
  Equal<Assignable<MemberScope, WriteScope>, true>,
  Equal<Assignable<ReturnType<typeof mintScope<"system">>, WriteScope>, true>,
  Equal<Assignable<ReturnType<typeof mintScope<"public">>, WriteScope>, true>,
  Equal<Assignable<WriteScope, StoreScope>, true>,
] = [true, true, true, true, true, true, true, true];

/** Compile-only cases: a write repository refuses a read scope, and the overloads pick WriteCtx for write keys only. */
function typeCases(sa: typeof storeAction, sg: typeof storeGuard, p: PlatformScope, i: ImpersonationScope, writeRepo: (scope: WriteScope) => Promise<void>): void {
  // @ts-expect-error a platform scope reaches no write repository (D71, lint L6)
  void writeRepo(p);
  // @ts-expect-error an impersonation scope reaches no write repository (D70, D71)
  void writeRepo(i);
  void sa("pages.write", async (ctx) => writeRepo(ctx.scope));
  void sa(["pages.write", "pages.publish", "orders.export"], async (ctx) => writeRepo(ctx.scope));
  // @ts-expect-error a read key hands fn a StoreCtx: its scope is not a WriteScope
  void sa("pages.read", async (ctx) => writeRepo(ctx.scope));
  // @ts-expect-error one read key in the list is enough to lose the WriteCtx
  void sa(["pages.read", "pages.write"], async (ctx) => writeRepo(ctx.scope));
  // @ts-expect-error no key: a StoreCtx
  void sa(null, async (ctx) => writeRepo(ctx.scope));
  void sa("pages.read", async (ctx) => ctx.scope.storeId);
  const req = new Request("http://localhost/");
  void sg(req, "h", "media.write").then((g) => (g.ok ? writeRepo(g.ctx.scope) : undefined));
  // @ts-expect-error a read-key guard hands a StoreCtx
  void sg(req, "h", "media.read").then((g) => (g.ok ? writeRepo(g.ctx.scope) : undefined));
}
void typeCases;
check(typeFacts.every(Boolean), "type-level facts compiled (WritePermission = w ∪ s; WriteScope ∌ platform / impersonation)");

if (failures > 0) {
  console.error(`✗ permissions selftest: ${failures} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`✓ permissions selftest: all ${checks} checks passed`);
