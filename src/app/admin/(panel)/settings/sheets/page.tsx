import type { Metadata } from "next";
import { SheetsWizard } from "@/components/admin/settings/sheets-wizard";
import { getSheetHealth } from "@/lib/admin-data/dashboard";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { cronKeySecret } from "@/lib/auth/config";
import { publicOrigin } from "@/lib/render/publish.server";
import { explain, getSheetsConfig, serviceAccountEmail, sheetsConfigProblem } from "@/lib/sheets";

export const metadata: Metadata = { title: "Google Sheets" };

export default async function SheetsSettingsPage() {
  const ctx = await legacyStoreCtx({ permission: "settings.read" });
  const [sheet, health] = await Promise.all([getSheetsConfig(), getSheetHealth(ctx.scope)]);
  const problem = sheetsConfigProblem();
  const email = serviceAccountEmail();
  const origin = publicOrigin() ?? "https://your-domain.ma";

  return (
    <SheetsWizard
      canWrite={ctx.can("integrations.manage")}
      canSync={ctx.can("orders.write")}
      state={{
        configured: !problem,
        envPresent: !!process.env.GOOGLE_SA_JSON_B64?.trim(),
        problem: problem ? explain(problem, email) : null,
        serviceAccountEmail: email,
        sheet: sheet && { url: sheet.url, sheetTitle: sheet.sheetTitle, connectedAt: sheet.connectedAt, enabled: sheet.enabled },
        health,
        cron: { configured: cronKeySecret() !== null, url: `${origin}/api/cron/tick?key=YOUR_CRON_KEY`, endpoint: `${origin}/api/cron/tick` },
      }}
    />
  );
}
