/**
 * Where a user lands after sign-in and what the store switcher lists (docs/STORE-SAAS.md §B.4).
 *
 *   0 usable memberships → "/app/new" (or "/admin" for staff with no store); 1 → "/app/<h>"; several → the last
 *   store if still usable, else "/app" (the picker). Role "agent" → "/app/<h>/queue" (OPE Q.13c).
 *
 * Signatures frozen at C0a; T2 implements the bodies (§K.1).
 */
import type { PlatformRole, StoreRole } from "./permissions";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus } from "@/lib/tenancy/types";

export interface MembershipSummary {
  storeId: string;
  handle: string;
  name: string;
  role: StoreRole;
  status: "active" | "suspended";
  storeStatus: StoreStatus;
  mode: StoreMode;
  logoKey?: string;
}

/** Pure. */
export function landingPathFor(memberships: readonly MembershipSummary[], lastStoreId: string | null, platformRole: PlatformRole | "none"): string {
  void memberships;
  void lastStoreId;
  void platformRole;
  throw new Error("not implemented: T2 (landingPathFor)");
}

/** The user's memberships; stores in purged / scheduled_deletion excluded. Server only. */
export async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  void userId;
  throw new Error("not implemented: T2 (listMemberships)");
}
