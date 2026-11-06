import type { Metadata } from "next";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { Backups } from "@/components/console/settings/backups";
import { t as message, translator } from "@/lib/i18n/admin";
import { backupsView } from "@/lib/platform/backups";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";

/*
 * `/admin/settings/backups` (platform.md PLA-§17, OS-10): the runs, the retention, Download ↑ with a reason and the
 * off-site reminder. Read by `backups.manage` (super_admin), who also downloads and changes the retention.
 */
export const metadata: Metadata = { title: message("console.backups.meta") };

const tr = translator(CONSOLE_LOCALE);

export default async function BackupsSettingsPage() {
  const ctx = await requirePlatform({ permission: "backups.manage" });
  const view = await panel("settings.backups", () => backupsView(ctx));
  return (
    <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.backups.title")} lead={tr("console.backups.lead")} />
      <PanelBoundary title={tr("console.backups.title")}>{view.state === "ok" ? <Backups view={view.data} canManage={ctx.can("backups.manage")} /> : view.state === "error" ? <PanelError reference={view.ref} /> : <PanelUnavailable />}</PanelBoundary>
    </div>
  );
}
