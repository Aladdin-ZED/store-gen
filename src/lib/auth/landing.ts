import "server-only";
/**
 * Where a user lands after sign-in and what the store switcher lists (docs/STORE-SAAS.md §B.4).
 *
 *   0 usable memberships → "/app/new" (or "/admin" for staff with no store); 1 → "/app/<h>"; several → the last
 *   store if still usable, else "/app" (the picker). Role "agent" → "/app/<h>/queue" (OPE Q.13c).
 *
 * "Usable" = an active membership of a store a member can open: pending, active, restricted, suspended (read-only),
 * and for owners and admins also closed (read-only + export + reopen) and rejected (the "not approved" page with its
 * one appeal, §A.5.3). A suspended membership, scheduled deletion and purged stores never are; `listMemberships`
 * leaves the last two out entirely.
 *
 * Client components import the types only (`import type`); the pure helpers are re-checked on the server anyway.
 */
import { and, asc, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { storeMembers, stores } from "@/lib/db/schema";
import type { PlatformRole, StoreRole } from "./permissions";
import { setSessionLastStore } from "./session";
import type { StoreMode } from "@/lib/tenancy/mode";
import type { StoreStatus, UserCtx } from "@/lib/tenancy/types";

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

const OPEN_TO_MEMBERS: ReadonlySet<StoreStatus> = new Set(["pending", "active", "restricted", "suspended"]);
const OPEN_TO_OWNERS: ReadonlySet<StoreStatus> = new Set(["closed", "rejected"]);

/** Can this membership open its store's dashboard? Pure. */
export function isUsableMembership(m: MembershipSummary): boolean {
  if (m.status !== "active") return false;
  if (OPEN_TO_MEMBERS.has(m.storeStatus)) return true;
  return OPEN_TO_OWNERS.has(m.storeStatus) && (m.role === "owner" || m.role === "admin");
}

/** The dashboard of one membership: agents work from their queue. */
export function storeHomePath(m: Pick<MembershipSummary, "handle" | "role">): string {
  return m.role === "agent" ? `/app/${m.handle}/queue` : `/app/${m.handle}`;
}

/** Pure. */
export function landingPathFor(memberships: readonly MembershipSummary[], lastStoreId: string | null, platformRole: PlatformRole | "none"): string {
  const usable = memberships.filter(isUsableMembership);
  if (usable.length === 0) return platformRole !== "none" ? "/admin" : "/app/new";
  if (usable.length === 1) return storeHomePath(usable[0]!);
  const last = lastStoreId ? usable.find((m) => m.storeId === lastStoreId) : undefined;
  return last ? storeHomePath(last) : "/app";
}

/** The user's memberships; stores in purged / scheduled_deletion excluded. Server only. */
export async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  const rows = await db
    .select({
      storeId: stores.id,
      handle: stores.handle,
      name: stores.name,
      role: storeMembers.role,
      status: storeMembers.status,
      storeStatus: stores.status,
      mode: stores.mode,
    })
    .from(storeMembers) // tenancy: platform a user's memberships (§B.4 switcher, §E.3 rule 6)
    .innerJoin(stores, eq(stores.id, storeMembers.storeId))
    .where(and(eq(storeMembers.userId, userId), notInArray(stores.status, ["purged", "scheduled_deletion"])))
    .orderBy(asc(stores.name), asc(stores.id))
    .limit(200);
  // a purged tombstone has no handle; it is excluded above, the guard only narrows the type
  return rows.flatMap((r) => (r.handle ? [{ ...r, handle: r.handle }] : []));
}

/** What the store switcher shows (§B.4): every listed membership with whether it opens, and the two extra entries. */
export interface SwitcherData {
  stores: (MembershipSummary & { usable: boolean; href: string })[];
  /** "Create a store" → /app/new */
  canCreate: true;
  /** staff also see "Platform console" → /admin */
  console: boolean;
}

export async function switcherData(user: { id: string; platformRole: PlatformRole | "none" }): Promise<SwitcherData> {
  const memberships = await listMemberships(user.id);
  return {
    stores: memberships.map((m) => ({ ...m, usable: isUsableMembership(m), href: storeHomePath(m) })),
    canCreate: true,
    console: user.platformRole !== "none",
  };
}

/**
 * The switcher's choice as the session's picker hint (§B.4; called from a `userAction`). Only a usable membership is
 * remembered; anything else answers false and changes nothing. Never an authorisation: the seam re-checks the
 * membership on every request.
 */
export async function rememberLastStore(ctx: UserCtx, storeId: string): Promise<boolean> {
  if (typeof storeId !== "string" || ctx.user.sessionId.startsWith("ctx:")) return false;
  const m = (await listMemberships(ctx.user.id)).find((x) => x.storeId === storeId);
  if (!m || !isUsableMembership(m)) return false;
  await setSessionLastStore(ctx.user.sessionId, storeId);
  return true;
}
