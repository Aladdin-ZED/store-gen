import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { Board } from "@/components/admin/queue/board";
import { viewerLocale } from "@/lib/auth/locale";
import { boardState } from "@/lib/callcenter/board.server";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.board.title", undefined, await viewerLocale(null)) };
}

const READ_ONLY_STATUSES = new Set(["suspended", "closed", "scheduled_deletion", "purged"]);

/**
 * `/app/<h>/queue/board` (P4 CALL CENTER; operations.md OPE-§14.1, §M.1: `orders.read_all` + `orders.assign`): the
 * manager board. The first state is server-rendered from the same `boardState` the poll answers, so the screen never
 * flashes empty; a member without both keys gets the neutral 404. View as store and a read-only store keep the figures
 * without the row actions. Copy in the viewer's language (fr / en complete, ar where written, OD58).
 */
export default async function BoardPage({ params }: { params: Promise<{ store: string }> }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: ["orders.read_all", "orders.assign"] });
  const [locale, state] = await Promise.all([viewerLocale(ctx.user), boardState(ctx.scope)]);
  const h = ctx.store.handle;
  const readOnly = ctx.scope.kind === "impersonation" || READ_ONLY_STATUSES.has(ctx.store.status);
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen wide className="q-root">
          <PageHeader title={t("ops.board.title", undefined, locale)} description={t("ops.board.description", undefined, locale)} />
          <Board
            initial={state}
            handle={h}
            tz={ctx.store.timezone}
            members={state.agents.map((a) => ({ userId: a.userId, name: a.name }))}
            perms={{ configure: ctx.can("callcenter.configure"), assign: ctx.can("orders.assign"), readOnly }}
            hrefs={{ toCall: appHref(h, "/orders?view=to_call"), team: appHref(h, "/team"), orders: appHref(h, "/orders") }}
          />
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
