/**
 * The `audit_log` statements (docs/STORE-SAAS.md §F.5). `audit_log` is a "P (opt. store)" table: `store_id` NULL is a
 * platform or auth event. The writer and the staff listing are platform code, so they live under the §E.3 rule 6
 * allowlist with their annotations; a store's own listing goes through its StoreScope (`selectStoreAuditRows`).
 * `src/lib/audit.ts` owns the redaction, the actor mapping and the tenant view; this file holds no policy.
 */
import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db } from "./client";
import { auditLog, users } from "./schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";

export type AuditInsert = typeof auditLog.$inferInsert;

const actorUser = alias(users, "audit_actor");
const impersonatorUser = alias(users, "audit_impersonator");

const ROW = { row: auditLog, actorName: actorUser.name, impersonatorName: impersonatorUser.name };

export interface AuditRowJoined {
  row: typeof auditLog.$inferSelect;
  actorName: string | null;
  impersonatorName: string | null;
}

/** One row; `storeId` is the caller's (a seam ctx's store, or NULL for a platform event). */
export async function insertAuditRow(row: AuditInsert): Promise<void> {
  // tenancy: platform audit writer (the store id comes from the caller's seam ctx, NULL for a platform event, §F.5)
  await db.insert(auditLog).values(row);
}

/** A store's own rows, newest first (the tenant listing; `conds` are the keyset and area filters). */
export async function selectStoreAuditRows(scope: StoreScope, conds: readonly (SQL | undefined)[], limit: number): Promise<AuditRowJoined[]> {
  return db
    .select(ROW)
    .from(auditLog)
    .leftJoin(actorUser, eq(actorUser.id, auditLog.userId))
    .leftJoin(impersonatorUser, eq(impersonatorUser.id, auditLog.impersonatorId))
    .where(whereStore(auditLog, scope, ...conds))
    .orderBy(desc(auditLog.id))
    .limit(limit);
}

/** Every row (staff listing, the single-tenant security page), newest first; `storeId` narrows to one store's rows. */
export async function selectPlatformAuditRows(opts: { storeId?: string; conds: readonly SQL[]; limit: number }): Promise<AuditRowJoined[]> {
  // tenancy: platform console audit listing across stores (staff with audit.platform, §F.5)
  return db
    .select(ROW)
    .from(auditLog)
    .leftJoin(actorUser, eq(actorUser.id, auditLog.userId))
    .leftJoin(impersonatorUser, eq(impersonatorUser.id, auditLog.impersonatorId))
    .where(and(opts.storeId !== undefined ? eq(auditLog.storeId, opts.storeId) : undefined, ...opts.conds))
    .orderBy(desc(auditLog.id))
    .limit(opts.limit);
}
