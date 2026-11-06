import type { Metadata } from "next";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { AuditFilters, AuditTable } from "@/components/console/security/audit";
import { t as message, translator } from "@/lib/i18n/admin";
import { listAuditPage, parseAuditViewFilter } from "@/lib/platform/audit-log";
import { optional, panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { listStaff } from "@/lib/platform/staff";

/*
 * `/admin/security/audit` (platform.md PLA-§14.3, SE-04): the platform audit log with its filters in the URL, keyset
 * pages of 50 (`?before=<id>`), CSV for super_admin (`/api/admin/audit.csv`, ≤ 50,000 rows, redacted). `audit.platform`.
 */
export const metadata: Metadata = { title: message("console.audit_view.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const tr = translator(CONSOLE_LOCALE);

export default async function AuditPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "audit.platform" });
  const sp = await searchParams;
  const filter = parseAuditViewFilter(sp);
  const rawBefore = Array.isArray(sp.before) ? sp.before[0] : sp.before;
  const before = rawBefore && /^\d{1,15}$/.test(rawBefore) ? Number(rawBefore) : null;
  const [page, staff] = await Promise.all([panel("audit.page", () => listAuditPage(ctx, filter, before)), ctx.can("staff.manage") ? optional("audit.staff", () => listStaff(ctx)) : Promise.resolve(null)]);
  const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
  const csvQ = new URLSearchParams(Object.entries({ storeId: filter.storeId, actorKind: filter.actorKind, area: filter.area }).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
  const older = page.state === "ok" && page.data.next !== null ? `/admin/security/audit?${new URLSearchParams([...q, ["before", String(page.data.next)]])}` : null;
  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.audit_view.title")} lead={tr("console.audit_view.lead")} />
      <AuditFilters filter={filter} staff={(staff?.staff ?? []).map((s) => ({ id: s.userId, name: s.name }))} csv={ctx.role === "super_admin" ? `/api/admin/audit.csv${csvQ.size ? `?${csvQ}` : ""}` : null} />
      <PanelBoundary title={tr("console.audit_view.title")}>
        {page.state === "ok" ? <AuditTable page={page.data} olderHref={older} label={tr("console.audit_view.title")} /> : page.state === "error" ? <PanelError reference={page.ref} /> : <PanelUnavailable />}
      </PanelBoundary>
    </div>
  );
}
