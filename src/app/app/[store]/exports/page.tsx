import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { ExportsView } from "@/components/admin/exports/exports-view";
import { listExports } from "@/lib/admin-data/exports";
import { redirectPastLastPage } from "@/lib/admin-data/paging";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import { revokeExportAction } from "./actions";

export const metadata: Metadata = { title: "Exports" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ store: string }>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The store's exports (allowed origins, key hints, file names): `export.create` (§I.1), the members who make them. */
export default async function ExportsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "export.create" });
  const sp = await searchParams;
  const activeOnly = one(sp.active) === "1";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));
  const list = await listExports(ctx.scope, { active: activeOnly, page, pageSize: 30 });
  redirectPastLastPage(appHref(ctx.store.handle, "/exports"), sp, list);

  return (
    <Screen>
      <PageHeader
        title="Exports"
        description="Pages you exported to host on other domains. Each export carries its own key: revoke it to cut an exported site off from this store."
      />
      <ExportsView
        items={list.items}
        total={list.total}
        page={list.page}
        pageSize={list.pageSize}
        activeOnly={activeOnly}
        canExport={ctx.can("export.create")}
        revoke={revokeExportAction}
      />
    </Screen>
  );
}
