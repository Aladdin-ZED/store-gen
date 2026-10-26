import type { Metadata } from "next";
import { AuditLog } from "@/components/admin/settings/audit-log";
import { auditPage } from "@/lib/admin-data/security";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { loadAuditAction } from "../actions";

export const metadata: Metadata = { title: "Audit log" };

type Params = Promise<{ store: string }>;

/** Settings → Audit log: this store's rows only (ADM-25), in its time zone. */
export default async function AuditSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "audit.read" });
  const initial = await auditPage(ctx.scope, { limit: 50 });
  return <AuditLog initial={initial} timeZone={ctx.store.timezone} load={loadAuditAction} />;
}
