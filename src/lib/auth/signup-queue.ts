import "server-only";
/**
 * The console's R1.0 review queue (docs/STORE-SAAS.md §B.2, §A.5.3; PL-04 read side): the stores that signed up and
 * wait in `pending`, oldest first, with the account that created them. Read-only in R1.0: approving and rejecting
 * (`transitionStore`, PLA-§3) arrive with P1's `/admin/queue`, which replaces this list.
 *
 * Platform rows only (`stores`, `users`; neither has a `store_id`): no tenant table is read, so no scope is needed.
 * `signups.decide` (admin and above), the permission of the code form beside it.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users } from "@/lib/db/schema";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { AuthRefusal } from "./errors";

export interface PendingStore {
  id: string;
  name: string;
  handle: string | null;
  createdAt: Date;
  owner: { name: string; email: string } | null;
}

/** At most `limit` (1-200) pending stores, oldest first. */
export async function listPendingStores(ctx: PlatformCtx, limit = 50): Promise<PendingStore[]> {
  if (!ctx.can("signups.decide")) throw new AuthRefusal("forbidden");
  const rows = await db
    .select({ id: stores.id, name: stores.name, handle: stores.handle, createdAt: stores.createdAt, ownerName: users.name, ownerEmail: users.email })
    .from(stores)
    .leftJoin(users, eq(users.id, stores.createdBy))
    .where(eq(stores.status, "pending"))
    .orderBy(asc(stores.createdAt), asc(stores.id))
    .limit(Math.min(200, Math.max(1, Math.floor(limit))));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    handle: r.handle,
    createdAt: r.createdAt,
    owner: r.ownerEmail ? { name: r.ownerName ?? "", email: r.ownerEmail } : null,
  }));
}
