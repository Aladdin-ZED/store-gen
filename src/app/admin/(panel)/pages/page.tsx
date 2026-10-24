import { SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { PagesView } from "@/components/admin/pages/pages-view";
import { Button } from "@/components/ui/button";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { listPages, pageCounts, type PageFilters } from "@/lib/admin-data/pages";
import { publicOrigin, storeInfo } from "@/lib/render/publish.server";
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
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STATUSES = new Set(["published", "draft", "archived"]);
const SORTS = new Set(["updated", "name", "orders"]);

export default async function PagesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await legacyStoreCtx({ permission: "pages.read" });
  const sp = await searchParams;
  const status = one(sp.status);
  const sort = one(sp.sort);
  const filters: PageFilters = {
    q: one(sp.q).slice(0, 80) || undefined,
    status: STATUSES.has(status) ? (status as PageFilters["status"]) : "active",
    sort: SORTS.has(sort) ? (sort as PageFilters["sort"]) : "updated",
  };
  const focus = one(sp.focus);

  const [pages, counts, store] = await Promise.all([listPages(ctx.scope, filters), pageCounts(ctx.scope), storeInfo()]);
  const assets = await previewAssetsFor(
    ctx.scope,
    pages.flatMap((p) => (p.doc ? [p.doc] : [])),
    [store.logo],
  );
  const total = counts.draft + counts.published;

  return (
    <Screen wide>
      <PageHeader
        title="Pages"
        description={
          total
            ? `${total} page${total === 1 ? "" : "s"} · ${counts.published} live. Thumbnails show each draft as it would render now.`
            : "Every landing page you generate lives here: drafts, live pages and the archive."
        }
        actions={
          ctx.can("pages.write") && (
            <Button asChild variant="brand" className="h-9 rounded-full px-4">
              <Link href="/admin/generate">
                <SparklesIcon />
                New page
              </Link>
            </Button>
          )
        }
      />
      <PagesView
        pages={pages}
        counts={{ ...counts, active: total }}
        assets={assets}
        store={store}
        origin={publicOrigin() ?? null}
        focusId={focus || undefined}
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
  );
}
