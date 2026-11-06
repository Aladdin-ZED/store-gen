import type { Metadata } from "next";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { GeneralForm } from "@/components/console/settings/general-form";
import { t as message, translator } from "@/lib/i18n/admin";
import { MARKETS } from "@/lib/page/schema";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { generalSettingsView } from "@/lib/platform/settings-view";

/*
 * `/admin/settings/general` (platform.md PLA-§13.1, PL-14): brand, new-store defaults, reserved handles, analytics k,
 * the seller colour band (typed `allow orange`), P6's design gates group, the health engine tunables and the
 * lifecycle safety window. `platform.settings`; each card saves its own section.
 */
export const metadata: Metadata = { title: message("console.general.meta") };

const tr = translator(CONSOLE_LOCALE);

export default async function GeneralSettingsPage() {
  const ctx = await requirePlatform({ permission: "platform.settings" });
  const view = await panel("settings.general", () => generalSettingsView(ctx));
  return (
    <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.general.title")} lead={tr("console.general.lead")} />
      <PanelBoundary title={tr("console.general.title")}>{view.state === "ok" ? <GeneralForm view={view.data} markets={MARKETS} /> : view.state === "error" ? <PanelError reference={view.ref} /> : <PanelUnavailable />}</PanelBoundary>
    </div>
  );
}
