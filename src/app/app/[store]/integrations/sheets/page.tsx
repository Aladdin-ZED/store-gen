import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { ExportKeyCard } from "@/components/admin/integrations/export-key-card";
import { InlineError, LockedCard, ReadOnlyNote } from "@/components/admin/integrations/hub-states";
import { SheetsRuns } from "@/components/admin/integrations/sheets-runs";
import { SheetsStatusCard } from "@/components/admin/integrations/sheets-status-card";
import { SheetsWorkingCard } from "@/components/admin/integrations/sheets-working-card";
import { WhatToCheck } from "@/components/admin/integrations/what-to-check";
import { SheetsWizard } from "@/components/admin/settings/sheets-wizard";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, translator } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { sheetsScreen } from "@/lib/integrations/sheets-screen.server";
import { requireStoreMember, SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx } from "@/lib/tenancy/types";

/**
 * Who opens the screen: `integrations.manage` (owner, admin), else the neutral 404 (core §I.1). "View as store" holds
 * no sensitive key, so it opens the screen read-only (every write hidden, with its one-line reason) instead of the
 * 404 the key would answer it.
 */
async function sheetsMember(handle: string): Promise<StoreCtx> {
  try {
    return await requireStoreMember({ handle, permission: "integrations.manage", throwOnFail: true });
  } catch (err) {
    if (err instanceof SeamError && err.code === "impersonation_read_only") return requireStoreMember({ handle });
    // the page's own refusal: the sign-in redirect, the 2FA step or the neutral 404
    return requireStoreMember({ handle, permission: "integrations.manage" });
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: translator(await viewerLocale(null))("int.sheets.title") };
}

/**
 * Connect → Google Sheets (operations.md OPE-§19.8, OD54, EXP-03; core §I.8): not connected (the value line, the link
 * field, Connect), the ownership proof, or the connected sheet (status card, Last runs, Working in the sheet), paused
 * and failing included; the export key card below. A pending store sees the locked card. The platform's side (the
 * service account, the cron job) is the console's (ADM-35): members only see whether Sheets is available.
 */
/** The request's instant, for the relative times the client then keeps fresh (a module function: render stays pure). */
const requestTime = () => Date.now();

export default async function SheetsPage({ params }: { params: Promise<{ store: string }> }) {
  const ctx = await sheetsMember((await params).store);
  const locale = await viewerLocale(ctx.user);
  const t = translator(locale);
  const impersonating = ctx.scope.kind === "impersonation";
  const canWrite = ctx.can("integrations.manage") && !impersonating;
  const locked = ctx.store.status === "pending";
  const screen = locked ? null : await sheetsScreen(ctx.scope);
  const now = requestTime();

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen>
          <PageHeader title={t("int.sheets.title")} description={t("int.sheets.lead")} />
          {impersonating && <ReadOnlyNote text={t("int.sheets.impersonation")} />}

          {!screen ? (
            <LockedCard />
          ) : (
            <div className="grid max-w-5xl gap-5">
              {screen.sheet === "error" ? (
                <InlineError />
              ) : screen.sheet ? (
                <>
                  <SheetsStatusCard
                    sheet={screen.sheet}
                    status={screen.status}
                    backlog={screen.backlog}
                    lastPushAt={screen.lastPushAt}
                    lastPullAt={screen.lastPullAt}
                    canWrite={canWrite}
                    now={now}
                  />
                  {screen.checks.length > 0 && <WhatToCheck checks={[{ kind: "sheets", items: screen.checks }]} canOpen={canWrite} />}
                  <SheetsRuns runs={screen.runs} />
                  <SheetsWorkingCard labels={screen.labels} />
                </>
              ) : (
                <SheetsWizard available={screen.available} serviceAccountEmail={screen.serviceAccountEmail} proof={screen.proof} canWrite={canWrite} now={now} />
              )}
              {/* view as store: set / not set only, never the key's account or id */}
              <ExportKeyCard
                initial={impersonating && screen.exportKey ? { ...screen.exportKey, email: null, keyId: null } : screen.exportKey}
                canWrite={canWrite}
                now={now}
              />
            </div>
          )}
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
