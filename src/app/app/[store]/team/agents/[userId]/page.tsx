import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { NotAvailable } from "@/components/admin/queue/not-available";
import { AgentPage } from "@/components/admin/agents/agent-page";
import { viewerLocale } from "@/lib/auth/locale";
import { agentDetail } from "@/lib/callcenter/agents.server";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.agents.title", undefined, await viewerLocale(null)) };
}

/**
 * `/app/<h>/team/agents/<userId>` (P4 CALL CENTER; operations.md OPE-§14.2, §M.1: `members.read`). A member of
 * another store, one who doesn't take calls or a missing id render the same "not available" panel (core §E.3 rule 3). An agent
 * reads their own figures at `/queue/me`, never here (`members.read` is not theirs).
 */
export default async function AgentDetailPage({ params }: { params: Promise<{ store: string; userId: string }> }) {
  const { store, userId } = await params;
  const ctx = await requireStoreMember({ handle: store, permission: "members.read" });
  const [locale, a] = await Promise.all([viewerLocale(ctx.user), agentDetail(ctx.scope, userId)]);
  const h = ctx.store.handle;
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen className="q-root">
          {a ? (
            <AgentPage a={a} locale={locale} tz={ctx.store.timezone} hrefs={{ agents: appHref(h, "/team/agents"), orders: appHref(h, "/orders") }} />
          ) : (
            <NotAvailable text={t("ops.agent.notFound", undefined, locale)} back={{ href: appHref(h, "/team/agents"), label: t("ops.agents.title", undefined, locale) }} />
          )}
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
