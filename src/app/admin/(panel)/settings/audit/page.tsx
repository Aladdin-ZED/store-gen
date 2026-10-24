import type { Metadata } from "next";
import { AuditLog } from "@/components/admin/settings/audit-log";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { auditPage } from "@/lib/admin-data/security";
import { loadAuditAction } from "../actions";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditSettingsPage() {
  const ctx = await legacyStoreCtx({ permission: "audit.read" });
  const initial = await auditPage(ctx.scope, { limit: 50 });
  return <AuditLog initial={initial} timeZone={ctx.store.timezone} load={loadAuditAction} />;
}
