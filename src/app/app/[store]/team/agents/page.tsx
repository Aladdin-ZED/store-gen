import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { AgentsView } from "@/components/admin/agents/agents-view";
import { viewerLocale } from "@/lib/auth/locale";
import { agentsOverview } from "@/lib/callcenter/agents.server";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.agents.title", undefined, await viewerLocale(null)) };
}

/**
 * `/app/<h>/team/agents` (P4 CALL CENTER; operations.md OPE-§14.2, §M.1: `members.read`, edits
 * `callcenter.configure`): the members who take calls with their profile, KPIs and mapped sheet labels.
 */
export default async function AgentsPage({ params }: { params: Promise<{ store: string }> }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "members.read" });
  const [locale, overview] = await Promise.all([viewerLocale(ctx.user), agentsOverview(ctx.scope)]);
  const h = ctx.store.handle;
  const canConfigure = ctx.can("callcenter.configure") && ctx.scope.kind !== "impersonation";
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen className="q-root">
          <PageHeader title={t("ops.agents.title", undefined, locale)} description={t("ops.agents.description", undefined, locale)} />
          <AgentsView agents={overview.agents} gauge={overview.gauge} canConfigure={canConfigure} hrefs={{ agents: appHref(h, "/team/agents"), team: appHref(h, "/team") }} />
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
