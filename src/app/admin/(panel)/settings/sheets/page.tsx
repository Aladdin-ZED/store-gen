import type { Metadata } from "next";
import { ExportKeyCard } from "@/components/admin/settings/export-key-card";
import { SheetsWizard } from "@/components/admin/settings/sheets-wizard";
import { getSheetHealth } from "@/lib/admin-data/dashboard";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { cronKeySecret } from "@/lib/auth/config";
import { exportKeyInfo } from "@/lib/export/service-account";
import { publicOrigin } from "@/lib/render/publish.server";
import { explain, getSheetsConfig, pendingProof, serviceAccountEmail, sheetsConfigProblem } from "@/lib/sheets";

export const metadata: Metadata = { title: "Google Sheets" };

export default async function SheetsSettingsPage() {
  const ctx = await legacyStoreCtx({ permission: "settings.read" });
  const canManage = ctx.can("integrations.manage");
  const [sheet, proof, health, exportKey] = await Promise.all([
    getSheetsConfig(ctx.scope),
    pendingProof(ctx.scope),
    getSheetHealth(ctx.scope),
    canManage ? exportKeyInfo(ctx.scope) : Promise.resolve(null),
  ]);
  const problem = sheetsConfigProblem();
  const email = serviceAccountEmail();
  const origin = publicOrigin() ?? "https://your-domain.ma";

  return (
    <>
      <SheetsWizard
        canWrite={canManage}
        canSync={ctx.can("orders.write")}
        state={{
          configured: !problem,
          envPresent: !!process.env.GOOGLE_SA_JSON_B64?.trim(),
          problem: problem ? explain(problem, email) : null,
          serviceAccountEmail: email,
          sheet: sheet && { url: sheet.url, sheetTitle: sheet.sheetTitle, connectedAt: sheet.connectedAt, enabled: sheet.enabled },
          pendingProof: proof && { expiresAt: proof.expiresAt },
          health,
          cron: { configured: cronKeySecret() !== null, url: `${origin}/api/cron/tick?key=YOUR_CRON_KEY`, endpoint: `${origin}/api/cron/tick` },
        }}
      />
      {exportKey && <ExportKeyCard initial={exportKey} />}
    </>
  );
}
