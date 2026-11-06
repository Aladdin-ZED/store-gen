import type { Metadata } from "next";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { PageHeader } from "@/components/console/kit";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PanelError, PanelUnavailable } from "@/components/console/panel";
import { Brands } from "@/components/console/settings/brands";
import { t as message, translator } from "@/lib/i18n/admin";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import { listProtectedBrands } from "@/lib/platform/settings-view";

/*
 * `/admin/settings/brands` (platform.md PLA-§13.3, PD70, SEC-18): the protected terms, add / edit / disable, the
 * "Check a name" box and the live-guard explanation. `platform.settings`.
 */
export const metadata: Metadata = { title: message("console.brands.meta") };

const tr = translator(CONSOLE_LOCALE);

export default async function BrandsSettingsPage() {
  const ctx = await requirePlatform({ permission: "platform.settings" });
  const rows = await panel("settings.brands", () => listProtectedBrands(ctx));
  return (
    <div className="mx-auto grid w-full max-w-[1100px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <PageHeader title={tr("console.brands.title")} lead={tr("console.brands.lead")} />
      <PanelBoundary title={tr("console.brands.title")}>{rows.state === "ok" ? <Brands rows={rows.data} /> : rows.state === "error" ? <PanelError reference={rows.ref} /> : <PanelUnavailable />}</PanelBoundary>
    </div>
  );
}
