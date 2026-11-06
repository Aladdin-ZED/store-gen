import { SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/common/page-header";
import { LocaleScope } from "@/components/admin/landing/locale-scope";
import { Screen } from "@/components/admin/common/screen";
import { PagesAddress } from "@/components/admin/pages/pages-address";
import type { RowVitals } from "@/components/admin/pages/pages-table";
import { PagesView } from "@/components/admin/pages/pages-view";
import { Button } from "@/components/ui/button";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { listPages, pageCounts, type PageFilters } from "@/lib/admin-data/pages";
import { storeInfoOf } from "@/lib/admin-data/store-info";
import { viewerLocale } from "@/lib/auth/locale";
import { translator } from "@/lib/i18n/admin";
import { getPageVitals } from "@/lib/landing/vitals";
import { errorSummary } from "@/lib/orders/log";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import {
  archivePageAction,
  deletePageAction,
  duplicatePageAction,
  publishPageAction,
  restorePageAction,
  setHomePageAction,
  unpublishPageAction,
} from "./actions";

export const metadata: Metadata = { title: "Pages" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ store: string }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STATUSES = new Set(["published", "draft", "archived"]);
/** `orders` and `conversion` sort on the shown 7-day vitals in the browser; the list itself comes back by recency */
const SORTS = new Set(["updated", "name"]);

/**
 * Pages (P3 LANDING; landing.md LAN-§15.2, LAN-§4; core §I.1 "pages list + vitals + address card"): the store's
 * pages with their 7-day vitals (`getPageVitals`, one grouped query per metric, cached 60 s per store), the address
 * line, and the actions the member's grants allow. Set as home exists in `landing` mode only.
 */
export default async function PagesPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "pages.read" });
  const sp = await searchParams;
  const status = one(sp.status);
  const sort = one(sp.sort);
  const filters: PageFilters = {
    q: one(sp.q).slice(0, 80) || undefined,
    status: STATUSES.has(status) ? (status as PageFilters["status"]) : "active",
    sort: SORTS.has(sort) ? (sort as PageFilters["sort"]) : "updated",
  };
  const focus = one(sp.focus);

  const [pages, counts, store, locale] = await Promise.all([listPages(ctx.scope, filters), pageCounts(ctx.scope), storeInfoOf(ctx.scope, ctx.store), viewerLocale(ctx.user)]);
  const [assets, vitals] = await Promise.all([
    previewAssetsFor(
      ctx.scope,
      pages.flatMap((p) => (p.doc ? [p.doc] : [])),
      [store.logo],
    ),
    getPageVitals(
      ctx.scope,
      pages.map((p) => p.id),
    ).catch((err: unknown): Record<string, RowVitals> => {
      console.error("[pages] vitals unavailable:", errorSummary(err));
      return {};
    }),
  ]);
  const t = translator(locale);
  const total = counts.draft + counts.published;
  const homeLive = pages.some((p) => p.isHome && p.status === "published");

  return (
    <LocaleScope locale={locale}>
    <Screen wide>
      <PageHeader
        title={t("landing.pages.title")}
        description={total ? t("landing.pages.description", { total, live: counts.published }) : t("landing.pages.descriptionEmpty")}
        actions={
          ctx.can("pages.write") && (
            <Button asChild variant="brand" className="h-9 rounded-full px-4">
              <Link href={appHref(ctx.store.handle, "/pages/new")}>
                <SparklesIcon />
                {t("landing.pages.new")}
              </Link>
            </Button>
          )
        }
      >
        {total > 0 && <PagesAddress live={homeLive} className="mt-4 max-w-xl" />}
      </PageHeader>
      <PagesView
        pages={pages}
        vitals={vitals}
        counts={{ ...counts, active: total }}
        assets={assets}
        store={store}
        focusId={focus || undefined}
        homeAllowed={ctx.store.mode === "landing"}
        can={{
          write: ctx.can("pages.write"),
          publish: ctx.can("pages.publish"),
          export: ctx.can("export.create"),
        }}
        actions={{
          duplicate: duplicatePageAction,
          publish: publishPageAction,
          unpublish: unpublishPageAction,
          setHome: setHomePageAction,
          archive: archivePageAction,
          restore: restorePageAction,
          remove: deletePageAction,
        }}
      />
    </Screen>
    </LocaleScope>
  );
}
