/**
 * The seam's grant rule (docs/STORE-SAAS.md §A.3, §E.2 steps 3-6, §B.8, D70, D71), pure and isomorphic so
 * `test:permissions` checks the very function `requireStoreMember` / `storeAction` / `storeGuard` run:
 *
 *   storeGrant(store, membership, p)   matrix ∧ release ∧ mode ∧ state ∧ impersonation → "ok" | a refusal code
 *
 * The impersonation membership (§B.8) is not a role: it holds every key that is neither `write` nor `sensitive`
 * and nothing else, whatever the matrix says, so a staff member viewing a store reads what a member reads and can
 * never write or reveal (`impersonation_read_only`). The two sets below are the seam's policy tables beside it:
 * the store keys that always need a fresh step-up (§B.7) and the platform keys that stay usable while the
 * `platform_read_only` kill switch is on (§H.8).
 */
import { modeAllows } from "@/lib/tenancy/mode";
import type { Membership, StoreRow } from "@/lib/tenancy/types";
import {
  can as roleCan,
  isStorePermission,
  isWritePermission,
  permissionDef,
  releaseOn,
  stateAllows,
  type PlatformPermission,
  type StorePermission,
} from "./permissions";

/** What the seam answers for one key: granted, or the `ActionErrorCode` of the refusal. */
export type GrantVerdict = "ok" | "forbidden" | "read_only" | "impersonation_read_only";

/** The synthetic membership of a staff member viewing a store as support (§B.8): a viewer that is not a viewer. */
export const IMPERSONATION_MEMBERSHIP: Readonly<Membership> = Object.freeze({ role: "viewer", status: "active", synthetic: "impersonation" });

export const isImpersonation = (m: Membership): boolean => m.synthetic === "impersonation";

/**
 * One key for one member of one store. Order: unknown key or a later release → `forbidden`; the impersonation
 * membership refuses every write or sensitive key (`impersonation_read_only`) and skips the role matrix; the
 * matrix and the store mode → `forbidden`; the store state (suspended, closed: writes only if `readOnlyOk`)
 * → `read_only`. A suspended membership holds nothing (the seam answers it `not_found` before this runs).
 */
export function storeGrant(store: Pick<StoreRow, "mode" | "status">, membership: Membership, p: StorePermission): GrantVerdict {
  if (!isStorePermission(p)) return "forbidden";
  const def = permissionDef(p);
  if (!releaseOn(def.release) || membership.status !== "active") return "forbidden";
  if (isImpersonation(membership)) {
    if (isWritePermission(p)) return "impersonation_read_only";
  } else if (!roleCan(membership.role, p)) {
    return "forbidden";
  }
  if (def.mode && !modeAllows(store.mode, def.mode)) return "forbidden";
  return stateAllows(store.status, def) ? "ok" : "read_only";
}

/** The first refusal over several keys (all are required), or "ok". */
export function storeGrantAll(store: Pick<StoreRow, "mode" | "status">, membership: Membership, keys: readonly StorePermission[]): GrantVerdict {
  for (const p of keys) {
    const verdict = storeGrant(store, membership, p);
    if (verdict !== "ok") return verdict;
  }
  return "ok";
}

/**
 * Store keys whose every use needs `sessions.step_up_at` within 5 minutes (§B.7, the tenant ladder: a TOTP code
 * when enrolled, else the password). `storeAction` / `storeGuard` refuse them with `step_up` when stale. The
 * conditional cases of §B.7 (secret writes under `integrations.manage`, `members.manage` changes to admin or owner,
 * the Carrier CSV route under `shipments.write`) call `assertStepUp(ctx)` themselves.
 */
export const STORE_STEP_UP_PERMISSIONS: ReadonlySet<StorePermission> = new Set<StorePermission>(["store.export", "orders.export", "store.close"]);

/**
 * Platform keys a `platformAction` / `platformGuard` write may still use while `platform_read_only` is on (§H.8):
 * `kill.manage` itself (to switch it off again) and the keys whose actions only read (lookups, reveals, analytics,
 * health, the audit log, the read-only "view as store"). Every other platform key answers `read_only`.
 */
export const PLATFORM_READ_ONLY_OK: ReadonlySet<PlatformPermission> = new Set<PlatformPermission>([
  "kill.manage",
  "console.read",
  "orders.lookup",
  "pii.reveal",
  "analytics.read",
  "health.read",
  "audit.platform",
  "stores.impersonate",
]);
