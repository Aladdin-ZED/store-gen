import type { Metadata } from "next";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { HealthPanels } from "@/components/console/health/panels";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { t as message, translator } from "@/lib/i18n/admin";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { systemHealthView } from "@/lib/platform/system";

/*
 * `/admin/health` (platform.md PLA-§15, OS-09; PD57, PD68, PD78): the system health panels, refreshed every 30 s
 * while visible, each failing alone. `health.read`.
 */
export const metadata: Metadata = { title: message("console.health.meta") };

const tr = translator(CONSOLE_LOCALE);

export default async function HealthPage() {
  const ctx = await requirePlatform({ permission: "health.read" });
  const view = await panel("health.view", () => systemHealthView(ctx));
  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.health.title")} lead={tr("console.health.lead")} />
      <PanelBoundary title={tr("console.health.title")}>{view.state === "ok" ? <HealthPanels view={view.data} /> : view.state === "error" ? <PanelError reference={view.ref} /> : <PanelUnavailable />}</PanelBoundary>
    </div>
  );
}
