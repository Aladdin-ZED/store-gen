import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { HistoryView } from "@/components/admin/history/history-view";
import { previewAssetsFor } from "@/lib/admin-data/assets";
import { listVersions, VERSION_KINDS, versionKindCounts, type VersionKind } from "@/lib/admin-data/history";
import { pageOptions } from "@/lib/admin-data/pages";
import { redirectPastLastPage } from "@/lib/admin-data/paging";
import { storeInfoOf } from "@/lib/admin-data/store-info";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import { duplicateVersionAction, restoreVersionAction, starVersionAction } from "./actions";

export const metadata: Metadata = { title: "History" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ store: string }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const PAGE_SIZE = 24;
/** "now" for day grouping, read once per request and passed to the client so both sides agree */
const requestTime = () => Date.now();

export default async function HistoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "pages.read" });
  const sp = await searchParams;
  const kindParam = one(sp.kind);
  const kind = (VERSION_KINDS as readonly string[]).includes(kindParam) ? (kindParam as VersionKind) : undefined;
  const pageId = ULID.test(one(sp.page_id)) ? one(sp.page_id) : undefined;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));

  const [list, counts, pages, store] = await Promise.all([
    listVersions(ctx.scope, { kind, pageId, starred: one(sp.starred) === "1", page, pageSize: PAGE_SIZE }),
    versionKindCounts(ctx.scope, pageId),
    pageOptions(ctx.scope, { includeArchived: true }),
    storeInfoOf(ctx.scope, ctx.store),
  ]);
  redirectPastLastPage(appHref(ctx.store.handle, "/history"), sp, list);
  const assets = await previewAssetsFor(
    ctx.scope,
    list.items.flatMap((v) => (v.doc ? [v.doc] : [])),
    [store.logo],
  );

  return (
    <Screen wide>
      <PageHeader
        title="History"
        description="Every generation, save and publish across your pages. Restore any of them, or start a new page from one."
      />
      <HistoryView
        items={list.items}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        counts={counts}
        pages={pages.map((p) => ({ id: p.id, name: p.name }))}
        assets={assets}
        store={store}
        canWrite={ctx.can("pages.write")}
        actions={{ star: starVersionAction, restore: restoreVersionAction, duplicate: duplicateVersionAction }}
        now={requestTime()}
        timeZone={ctx.store.timezone}
      />
    </Screen>
  );
}
