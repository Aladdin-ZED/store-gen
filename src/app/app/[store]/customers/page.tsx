import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { CustomersView } from "@/components/admin/customers/customers-view";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { listBlocked, listCustomers, type CustomerFilter } from "@/lib/orders/customers";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.customers.title", undefined, await viewerLocale(null)) };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").slice(0, 80);
const FILTERS: readonly CustomerFilter[] = ["refused_returned", "blocked", "repeat"];
const READ_ONLY_STATUSES = new Set(["suspended", "closed", "scheduled_deletion", "purged"]);

/**
 * `/app/<h>/customers` (P4 CALL CENTER; operations.md OPE-§9.2, §9.5, §M.1: `customers.read`): the first page of the
 * list for the URL's `q` and `filter` (server-rendered, the next pages through `listCustomersAction`), or the Blocked
 * tab (`?tab=blocked`). Phones are masked for every role; agents get the customers of the orders they can see.
 */
export default async function CustomersPage({ params, searchParams }: { params: Promise<{ store: string }>; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "customers.read" });
  const sp = await searchParams;
  const tab = one(sp.tab) === "blocked" ? "blocked" : "all";
  const q = one(sp.q).trim();
  const f = one(sp.filter) as CustomerFilter;
  const filter = FILTERS.includes(f) ? f : null;
  const [locale, list, blocked] = await Promise.all([
    viewerLocale(ctx.user),
    tab === "all" ? listCustomers(ctx.scope, ctx, { ...(q ? { search: q } : {}), ...(filter ? { filter } : {}) }) : Promise.resolve({ items: [], next: null }),
    tab === "blocked" ? listBlocked(ctx.scope, ctx) : Promise.resolve(null),
  ]);
  const readOnly = ctx.scope.kind === "impersonation" || READ_ONLY_STATUSES.has(ctx.store.status);
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen className="q-root">
          <PageHeader title={t("ops.customers.title", undefined, locale)} description={t("ops.customers.description", undefined, locale)} />
          <CustomersView
            tab={tab}
            q={q}
            filter={filter}
            initial={list}
            blocked={blocked}
            perms={{ block: ctx.can("blocklist.write"), readOnly, seeAll: ctx.can("orders.read_all") }}
            base={appHref(ctx.store.handle, "/customers")}
          />
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
