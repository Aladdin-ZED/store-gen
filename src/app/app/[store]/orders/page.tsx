import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { OrdersView, type ColumnRole, type OrdersTab } from "@/components/admin/orders/orders-view";
import type { ViewTab } from "@/components/admin/orders/view-tabs";
import {
  orderQueryParams,
  ordersBoot,
  parseOrderQuery,
  rangeBounds,
  tabCounts,
  toLeadRow,
  toOrderFilters,
  toSavedQuery,
  fromSavedQuery,
} from "@/lib/admin-data/orders";
import { pageOptions } from "@/lib/admin-data/pages";
import { viewerLocale } from "@/lib/auth/locale";
import { BUILTIN_VIEWS, builtinView, defaultViewFor, type BuiltinViewId, type ViewColumn } from "@/lib/callcenter/views";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { listLeads, listOrders } from "@/lib/orders";
import { listViewerOf } from "@/lib/orders/admin";
import { getSheetsConfig } from "@/lib/sheets";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

/**
 * The orders screen (P4 CALL CENTER; operations.md OPE-§12): the first page server-rendered for the URL's query (a view
 * is a link), the viewer's built-in views and saved views as tabs, the columns of the viewer's role, the drawer and the
 * manual-order sheet on the client. With no query at all the list opens on the role's default view (OPE-§12.1).
 */

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.orders.title", undefined, await viewerLocale(null)) };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ store: string }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PAGE_SIZE = 40;
/** the URL keys that are not filters (the drawer, the section) */
const NOT_FILTERS = new Set(["order", "o", "tab", "page", "after", "new"]);
/** the views agents get (their predicate is added server-side whatever the view says, OD12) */
const AGENT_VIEWS: readonly BuiltinViewId[] = ["mine", "callbacks", "new", "no_answer", "cancelled_fake", "test"];
const READ_ONLY_STATUSES = new Set(["suspended", "closed", "scheduled_deletion", "purged"]);

export default async function OrdersPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "orders.read",
  });
  const { scope } = ctx;
  const tz = ctx.store.timezone;
  const locale = await viewerLocale(ctx.user);
  const sp = await searchParams;
  const base = appHref(ctx.store.handle, "/orders");
  const role = ctx.membership.role;
  const tab: OrdersTab = one(sp.tab) === "leads" && ctx.can("leads.read") ? "leads" : "orders";

  // no filter at all → the role's default view; "view=all" is the explicit All tab
  const bare = !Object.keys(sp).some((k) => !NOT_FILTERS.has(k));
  const parsed = parseOrderQuery(sp);
  let query = {
    ...parsed,
    view: one(sp.view) === "all" ? null : (parsed.view ?? (bare ? defaultViewFor(role) : null)),
    after: null,
  };

  const [counts, pages, sheet, boot, first, leads] = await Promise.all([
    tabCounts(scope),
    pageOptions(scope, { includeArchived: true }),
    getSheetsConfig(scope),
    ordersBoot(ctx),
    tab === "orders"
      ? listOrders(scope, toOrderFilters(query, tz, listViewerOf(ctx)), {
          pageSize: PAGE_SIZE,
        })
      : Promise.resolve(null),
    tab === "leads"
      ? listLeads(
          scope,
          {
            q: query.q || undefined,
            pageId: query.pageId ?? undefined,
            ...rangeBounds(query, tz),
          },
          { page: query.page, pageSize: PAGE_SIZE },
        )
      : Promise.resolve(null),
  ]);

  // an empty default view never greets anyone: a bare URL whose default view has no rows opens on All
  let orders = first;
  if (bare && first && first.total === 0 && query.view) {
    query = { ...query, view: null };
    orders = await listOrders(scope, toOrderFilters(query, tz, listViewerOf(ctx)), { pageSize: PAGE_SIZE });
  }

  // the tabs: All, the role's built-ins (the conditional ones only with rows), then the saved views
  const here = orderQueryParams(query).toString();
  const savedTabs: ViewTab[] = boot.savedViews.map((v) => {
    const qs = orderQueryParams(fromSavedQuery(v.query)).toString();
    return {
      id: v.id,
      label: v.name,
      href: `${base}?${qs || "view=all"}`,
      active: qs === here,
      saved: { shared: v.shared, mine: v.mine },
    };
  });
  const savedActive = savedTabs.some((x) => x.active);
  const viewIds = (role === "agent" ? BUILTIN_VIEWS.filter((v) => AGENT_VIEWS.includes(v.id)) : BUILTIN_VIEWS).filter(
    (v) => !v.whenNonEmpty || boot.nonEmpty[v.id as keyof typeof boot.nonEmpty] || query.view === v.id,
  );
  const tabs: ViewTab[] = [
    {
      id: "all",
      label: t("ops.orders.all", undefined, locale),
      href: `${base}?view=all`,
      active: !query.view && !savedActive,
    },
    ...viewIds.map((v) => ({
      id: v.id,
      label: t(role === "agent" && v.id === "callbacks" ? "ops.view.myCallbacks" : v.labelKey, undefined, locale),
      href: `${base}?view=${v.id}`,
      active: query.view === v.id && !savedActive,
    })),
    ...savedTabs,
  ];

  const columnRole: ColumnRole = role === "owner" || role === "admin" ? "owner" : role === "agent" ? "agent" : "manager";
  const viewColumns: ViewColumn[] = [...(builtinView(query.view)?.columns ?? [])];
  if (query.hold === "active" && !viewColumns.includes("ship_from")) viewColumns.push("ship_from");
  if ((query.tracking || query.carrierLabel) && !viewColumns.includes("tracking")) viewColumns.push("tracking");
  if (query.returnReason.length && !viewColumns.includes("return_reason")) viewColumns.push("return_reason");

  const readOnly = scope.kind === "impersonation" ? "impersonation" : READ_ONLY_STATUSES.has(ctx.store.status) ? "store" : null;

  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen wide>
          <PageHeader title={t("ops.orders.title", undefined, locale)} description={t("ops.orders.description", undefined, locale)} />
          <OrdersView
            tab={tab}
            query={query}
            tabs={tabs}
            savedQuery={toSavedQuery(query)}
            orders={orders}
            leads={leads && { ...leads, items: leads.items.map(toLeadRow) }}
            counts={{ leads: counts.leads }}
            pages={pages.map((p) => ({ id: p.id, name: p.name }))}
            members={boot.members}
            carrierCsv={boot.carrierCsv}
            role={columnRole}
            viewColumns={viewColumns}
            sheetConnected={!!sheet?.enabled}
            base={base}
            perms={{
              write: ctx.can("orders.write"),
              assign: ctx.can("orders.assign"),
              ship: ctx.can("shipments.write"),
              finance: ctx.can("finance.write"),
              force: ctx.can("orders.force_status"),
              reveal: ctx.can("orders.reveal_phone") && readOnly === null,
              edit: ctx.can("orders.edit"),
              block: ctx.can("blocklist.write"),
              owner: role === "owner" || role === "admin",
              agent: ctx.can("agents.self"),
              readOnly,
              export: ctx.can("orders.export"),
              create: ctx.can("orders.create"),
              leads: ctx.can("leads.read"),
              settings: ctx.can("settings.write"),
              seeAll: ctx.can("orders.read_all"),
            }}
          />
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
