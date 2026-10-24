import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/common/page-header";
import { Screen } from "@/components/admin/common/screen";
import { ExportsView } from "@/components/admin/exports/exports-view";
import { listExports } from "@/lib/admin-data/exports";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { redirectPastLastPage } from "@/lib/admin-data/paging";
import { revokeExportAction } from "./actions";

export const metadata: Metadata = { title: "Exports" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ExportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await legacyStoreCtx({ permission: "pages.read" });
  const sp = await searchParams;
  const activeOnly = one(sp.active) === "1";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(one(sp.page), 10) || 1));
  const list = await listExports(ctx.scope, { active: activeOnly, page, pageSize: 30 });
  redirectPastLastPage("/admin/exports", sp, list);

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
