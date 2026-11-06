import type { Metadata } from "next";
import { headers } from "next/headers";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { SecurityFactsCard, StaffTable } from "@/components/console/security/staff";
import { t as message, translator } from "@/lib/i18n/admin";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { securityFacts } from "@/lib/platform/security-facts";
import { listStaff } from "@/lib/platform/staff";

/*
 * `/admin/security/staff` (platform.md PLA-§14.1, §14.3, SE-01): the security facts, the staff and their invites.
 * `staff.manage` (super_admin); every write asks for a fresh step-up.
 */
export const metadata: Metadata = { title: message("console.staff.meta") };

const tr = translator(CONSOLE_LOCALE);

export default async function StaffPage() {
  const ctx = await requirePlatform({ permission: "staff.manage" });
  const h = await headers();
  const [facts, list] = await Promise.all([panel("security.facts", () => securityFacts(ctx, h)), panel("security.staff", () => listStaff(ctx))]);
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.staff.title")} lead={tr("console.staff.lead")} />
      <PanelBoundary title={tr("console.security.facts")}>{facts.state === "ok" ? <SecurityFactsCard facts={facts.data} /> : facts.state === "error" ? <PanelError reference={facts.ref} /> : <PanelUnavailable />}</PanelBoundary>
      <PanelBoundary title={tr("console.staff.title")}>{list.state === "ok" ? <StaffTable list={list.data} me={ctx.user.id} /> : list.state === "error" ? <PanelError reference={list.ref} /> : <PanelUnavailable />}</PanelBoundary>
    </div>
  );
}
