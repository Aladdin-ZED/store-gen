import type { Metadata } from "next";
import { Screen } from "@/components/admin/common/screen";
import { NotAvailable } from "@/components/admin/queue/not-available";
import { CustomerPage } from "@/components/admin/customers/customer-page";
import { viewerLocale } from "@/lib/auth/locale";
import { dirOf, t } from "@/lib/i18n/admin";
import { AdminI18nProvider } from "@/lib/i18n/admin/client";
import { getCustomer } from "@/lib/orders/customers";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t("ops.customers.title", undefined, await viewerLocale(null)) };
}

const READ_ONLY_STATUSES = new Set(["suspended", "closed", "scheduled_deletion", "purged"]);

/**
 * `/app/<h>/customers/<id>` (P4 CALL CENTER; operations.md OPE-§9.2, §M.1: `customers.read`). A customer of another
 * store, out of an agent's sight or missing renders the same "not available" panel (core §E.3 rule 3). Agents get the
 * counts only.
 */
export default async function CustomerDetailPage({ params }: { params: Promise<{ store: string; id: string }> }) {
  const { store, id } = await params;
  const ctx = await requireStoreMember({ handle: store, permission: "customers.read" });
  const [locale, c] = await Promise.all([viewerLocale(ctx.user), getCustomer(ctx.scope, ctx, id)]);
  const h = ctx.store.handle;
  const readOnly = ctx.scope.kind === "impersonation" || READ_ONLY_STATUSES.has(ctx.store.status);
  return (
    <AdminI18nProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="contents">
        <Screen className="q-root">
          {c ? (
            <CustomerPage
              c={c}
              tz={ctx.store.timezone}
              hrefs={{ customers: appHref(h, "/customers"), orders: appHref(h, "/orders") }}
              perms={{
                reveal: ctx.can("orders.reveal_phone") && ctx.can("orders.read_all"),
                create: ctx.can("orders.create"),
                block: ctx.can("blocklist.write"),
                move: ctx.can("orders.write"),
                note: ctx.can("orders.write"),
                readOnly,
              }}
            />
          ) : (
            <NotAvailable text={t("ops.customer.notFound", undefined, locale)} back={{ href: appHref(h, "/customers"), label: t("ops.customers.title", undefined, locale) }} />
          )}
        </Screen>
      </div>
    </AdminI18nProvider>
  );
}
