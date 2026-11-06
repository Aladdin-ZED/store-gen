import type { Metadata } from "next";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { AuditTable, BreakGlassReview, PendingRequests } from "@/components/console/security/audit";
import { t as message, translator } from "@/lib/i18n/admin";
import { breakGlassReview, listBreakGlassPage } from "@/lib/platform/audit-log";
import { panel } from "@/lib/platform/panel";
import { listOpenPlatformRequests } from "@/lib/platform/platform-requests";
import { requirePlatform } from "@/lib/platform/seam";

/*
 * `/admin/security/break-glass` (platform.md PLA-§14.3, SE-04, PD7): the pending platform requests on top (Confirm by
 * a different staff member ↑, Cancel), the weekly review ("Mark this week reviewed"), then the audit log pre-filtered
 * to the break-glass actions; every row links its target and its actor. `audit.platform`.
 */
export const metadata: Metadata = { title: message("console.breakglass.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const tr = translator(CONSOLE_LOCALE);

export default async function BreakGlassPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "audit.platform" });
  const sp = await searchParams;
  const rawBefore = Array.isArray(sp.before) ? sp.before[0] : sp.before;
  const before = rawBefore && /^\d{1,15}$/.test(rawBefore) ? Number(rawBefore) : null;
  const [requests, review, page] = await Promise.all([panel("breakglass.requests", () => listOpenPlatformRequests(ctx)), panel("breakglass.review", () => breakGlassReview(ctx)), panel("breakglass.page", () => listBreakGlassPage(ctx, before))]);
  const older = page.state === "ok" && page.data.next !== null ? `/admin/security/break-glass?before=${page.data.next}` : null;
  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.breakglass.title")} lead={tr("console.breakglass.lead")} />
      <PanelBoundary title={tr("console.breakglass.requests")}>{requests.state === "ok" ? <PendingRequests rows={requests.data} /> : requests.state === "error" ? <PanelError reference={requests.ref} /> : <PanelUnavailable />}</PanelBoundary>
      <PanelBoundary title={tr("console.breakglass.review")}>{review.state === "ok" ? <BreakGlassReview {...review.data} /> : review.state === "error" ? <PanelError reference={review.ref} /> : <PanelUnavailable />}</PanelBoundary>
      <PanelBoundary title={tr("console.breakglass.log")}>{page.state === "ok" ? <AuditTable page={page.data} olderHref={older} label={tr("console.breakglass.log")} empty={tr("console.breakglass.log_empty")} /> : page.state === "error" ? <PanelError reference={page.ref} /> : <PanelUnavailable />}</PanelBoundary>
    </div>
  );
}
