import type { Metadata } from "next";
import "@/components/admin/queue/queue.css";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { AdSpendTab } from "@/components/admin/finance/ad-spend";
import { BreakEvenTab } from "@/components/admin/finance/breakeven";
import { CostsTab } from "@/components/admin/finance/costs";
import { FIN_TABS, FinanceOff, FinanceTabs, type FinTab } from "@/components/admin/finance/finance-view";
import { viewerLocale } from "@/lib/auth/locale";
import { breakEvenFor } from "@/lib/finance/lite/breakeven.server";
import { costsOverview } from "@/lib/finance/lite/costs.server";
import { financeLiteOn } from "@/lib/finance/lite/flag.server";
import { adSpendGrid, storeCurrencyOf } from "@/lib/finance/lite/spend.server";
import { carrierView, openProfitAlerts } from "@/lib/finance/lite/view.server";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("fin.title", undefined, await viewerLocale(null)) };
}

const READ_ONLY_STATUSES = new Set(["suspended", "closed", "scheduled_deletion", "purged"]);

/**
 * `/app/<h>/finance` (P4 CALL CENTER; operations.md OPE-§16.2, §M.1 `finance.read`, edits `finance.write`; flag
 * `finance_lite`; SF-04, OD25). Owner and admin. `?tab=` picks Break-even (default), Costs or Ad spend, and only that
 * tab's data is read. With the flag off the screen says Profit is not available, with no figure. A member without
 * `finance.write`, View as store or a read-only store sees the values without the fields.
 */
export default async function FinancePage({ params, searchParams }: { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "finance.read" });
  const sp = await searchParams;
  const tab: FinTab = (FIN_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as FinTab) : "breakeven";
  const h = ctx.store.handle;
  const hrefs = { breakeven: appHref(h, "/finance"), costs: appHref(h, "/finance?tab=costs"), ads: appHref(h, "/finance?tab=ads") };
  const canWrite = ctx.can("finance.write") && ctx.scope.kind !== "impersonation" && !READ_ONLY_STATUSES.has(ctx.store.status);
  const [locale, on] = await Promise.all([viewerLocale(ctx.user), financeLiteOn(ctx.scope)]);

  let body: React.ReactNode;
  if (!on) body = <FinanceOff />;
  else if (tab === "costs") {
    const currency = await storeCurrencyOf(ctx.scope);
    const [costs, carrier] = await Promise.all([costsOverview(ctx.scope, currency), carrierView(ctx.scope)]);
    body = <CostsTab costs={costs} carrier={carrier} canWrite={canWrite} />;
  } else if (tab === "ads") {
    body = <AdSpendTab grid={await adSpendGrid(ctx.scope, 14)} canWrite={canWrite} />;
  } else {
    const [card, alerts] = await Promise.all([breakEvenFor(ctx.scope), openProfitAlerts(ctx.scope)]);
    body = <BreakEvenTab card={card} alerts={alerts} tz={ctx.store.timezone} hrefs={{ costs: hrefs.costs, ads: hrefs.ads, zones: appHref(h, "/settings/delivery") }} />;
  }

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen className="q-root">
          <PageHeader title={t("fin.title", undefined, locale)} description={t("fin.description", undefined, locale)} />
          {on ? (
            <FinanceTabs tab={tab} hrefs={hrefs} readOnly={!canWrite}>
              {body}
            </FinanceTabs>
          ) : (
            body
          )}
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
