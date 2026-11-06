import type { Metadata } from "next";
import { CallCenterView, CC_TABS, type CcTab } from "@/components/admin/callcenter/callcenter-view";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { viewerLocale } from "@/lib/auth/locale";
import { callCenterView } from "@/lib/callcenter/settings-view.server";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { requireStoreMember } from "@/lib/tenancy/seam";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.cc.title", undefined, await viewerLocale(null)) };
}

const READ_ONLY_STATUSES = new Set(["suspended", "closed", "scheduled_deletion", "purged"]);

/**
 * `/app/<h>/team/callcenter` (P4 CALL CENTER; operations.md OPE-§5.5, §5.6, §6.2, §7.4, §M.1 `callcenter.configure`;
 * core D73, §I.8): calling hours and dated schedules, retries and assignment, scripts and city aliases. A member
 * without the key gets the neutral 404 from the seam; View as store and a read-only store see the fields disabled.
 * `?tab=` picks the tab so a link can open one directly.
 */
export default async function CallCenterPage({ params, searchParams }: { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "callcenter.configure" });
  const sp = await searchParams;
  const tab: CcTab = (CC_TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as CcTab) : "hours";
  const [locale, view] = await Promise.all([viewerLocale(ctx.user), callCenterView(ctx.scope, ctx.store.timezone)]);
  const canEdit = ctx.scope.kind !== "impersonation" && !READ_ONLY_STATUSES.has(ctx.store.status);
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen className="q-root">
          <PageHeader title={t("ops.cc.title", undefined, locale)} description={t("ops.cc.description", undefined, locale)} />
          <CallCenterView view={view} tab={tab} canEdit={canEdit} />
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
