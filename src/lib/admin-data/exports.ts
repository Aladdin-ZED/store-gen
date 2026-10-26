import "server-only";
/**
 * The store's exported sites (zip downloads): list and key revocation. A revoked export's key stops accepting
 * orders, leads and analytics; its CORS allow-list is dropped within a minute (cached per process).
 *
 * Multi-tenant (docs/STORE-SAAS.md §E.3, ADM-21): the store's exports only, their page and version joined inside the
 * same store; revoking another store's export id answers like a missing one; the write takes a `WriteScope`.
 */
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exportsTable, pages, pageVersions, users } from "@/lib/db/schema";
import { invalidateExportOrigins } from "@/lib/orders/export-origins";
import { byId, inStore, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { affected, auditIn, type Actor } from "./store-audit";

export interface ExportItem {
  id: string;
  pageId: string;
  pageName: string | null;
  pageSlug: string | null;
  versionId: string;
  versionKind: string | null;
  versionAt: string | null;
  mode: "connected" | "php" | "whatsapp";
  /** last 6 characters of the public key (enough to recognise it in the exported files) */
  keyHint: string;
  allowedOrigins: string[];
  fileName: string | null;
  bytes: number | null;
  createdAt: string;
  createdBy: string | null;
  revokedAt: string | null;
}

export async function listExports(scope: StoreScope, filters: { pageId?: string; active?: boolean; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(filters.pageSize ?? 50)));
  const where: SQL[] = [];
  if (filters.pageId) where.push(eq(exportsTable.pageId, filters.pageId));
  if (filters.active) where.push(isNull(exportsTable.revokedAt));
  const cond = whereStore(exportsTable, scope, ...where);
  const [rows, [total]] = await Promise.all([
    db
      .select({
        e: exportsTable,
        pageName: pages.name,
        pageSlug: pages.slug,
        versionKind: pageVersions.kind,
        versionAt: pageVersions.createdAt,
        createdBy: users.name,
      })
      .from(exportsTable)
      .leftJoin(pages, and(eq(pages.id, exportsTable.pageId), inStore(pages, scope)))
      .leftJoin(pageVersions, and(eq(pageVersions.id, exportsTable.versionId), inStore(pageVersions, scope)))
      .leftJoin(users, eq(users.id, exportsTable.createdBy))
      .where(cond)
      .orderBy(desc(exportsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(exportsTable).where(cond),
  ]);
  const items = rows.map(
    (r): ExportItem => ({
      id: r.e.id,
      pageId: r.e.pageId,
      pageName: r.pageName ?? null,
      pageSlug: r.pageSlug ?? null,
      versionId: r.e.versionId,
      versionKind: r.versionKind ?? null,
      versionAt: r.versionAt ? r.versionAt.toISOString() : null,
      mode: r.e.mode,
      keyHint: r.e.publicKey.slice(-6),
      allowedOrigins: r.e.allowedOrigins ?? [],
      fileName: r.e.fileName,
      bytes: r.e.bytes,
      createdAt: r.e.createdAt.toISOString(),
      createdBy: r.createdBy ?? null,
      revokedAt: r.e.revokedAt ? r.e.revokedAt.toISOString() : null,
    }),
  );
  return { items, total: Number(total?.n ?? 0), page, pageSize };
}

/** Revoke one of the store's exports (false: already revoked, missing, or another store's). */
export async function revokeExport(scope: WriteScope, id: string, actor: Actor): Promise<boolean> {
  const res = await db
    .update(exportsTable)
    .set({ revokedAt: new Date() })
    .where(and(byId(exportsTable, scope, id), isNull(exportsTable.revokedAt)));
  const ok = affected(res) === 1;
  if (ok) invalidateExportOrigins();
  if (ok) await auditIn(scope, actor, "export.revoked", { target: id });
  return ok;
}
