import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { ExportKeyCard } from "@/components/admin/settings/export-key-card";
import { SheetsWizard } from "@/components/admin/settings/sheets-wizard";
import { getSheetHealth } from "@/lib/admin-data/dashboard";
import { exportKeyInfo } from "@/lib/export/service-account";
import { explain, getSheetsConfig, pendingProof, serviceAccountEmail, sheetsConfigProblem } from "@/lib/sheets";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const metadata: Metadata = { title: "Google Sheets" };

type Params = Promise<{ store: string }>;

/**
 * Connect → Google Sheets of the store: its sheet, the queue's health and the store's PHP-export key, under
 * `integrations.manage` (§I.1). The platform's side (the service account, the cron job) is the console's: members
 * only see whether Sheets is available (ADM-35). The queue's health also shows on the dashboard and the Orders screen.
 */
export default async function SheetsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "integrations.manage" });
  const [sheet, proof, health, exportKey] = await Promise.all([getSheetsConfig(ctx.scope), pendingProof(ctx.scope), getSheetHealth(ctx.scope), exportKeyInfo(ctx.scope)]);
  const problem = sheetsConfigProblem();
  const email = serviceAccountEmail();

  return (
    <Screen>
      <PageHeader title="Google Sheets" description="Send every order to your call center's sheet; the statuses your agents set come back here." />
      <div className="grid grid-cols-1 content-start gap-5">
        <SheetsWizard
          canWrite
          canSync={ctx.can("orders.write")}
          state={{
            configured: !problem,
            envPresent: false,
            problem: problem ? explain(problem, email) : null,
            serviceAccountEmail: email,
            sheet: sheet && { url: sheet.url, sheetTitle: sheet.sheetTitle, connectedAt: sheet.connectedAt, enabled: sheet.enabled },
            pendingProof: proof && { expiresAt: proof.expiresAt },
            health,
            cron: null,
          }}
        />
        <ExportKeyCard initial={exportKey} />
      </div>
    </Screen>
  );
}
