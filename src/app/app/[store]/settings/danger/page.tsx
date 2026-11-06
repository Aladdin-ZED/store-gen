import type { Metadata } from "next";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { isNotImplemented, storeLifecycleDates } from "@/lib/admin-data/dashboard";
import { viewerLocale } from "@/lib/auth/locale";
import { listExportJobs, type ExportJobSummary } from "@/lib/exports-store";
import { t } from "@/lib/i18n/admin";
import { logError } from "@/lib/orders/log";
import { listMembersByScope } from "@/lib/tenancy/invites";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { apiHref } from "@/lib/urls";
import { memberCtx } from "../../member-ctx";
import { closeOwnStoreAction, leaveStoreAction, reopenOwnStoreAction, requestStoreExportAction } from "./actions";
import { DangerZone } from "./_components/danger-zone";

type Props = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return {
    title: t("shell.danger.title", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/settings/danger"))),
  };
}

/** Reopening is possible for 30 days after the store was closed (§A.5.1). */
const REOPEN_DAYS = 30;

/**
 * Settings → Danger zone (P2 SHELL; platform.md PLA-§22.11, PL-09, PL-08 owner side, PD80; docs/STORE-SAAS.md §A.5.1,
 * §B.7, §F.9), `settings.read`; each block shows to whom it applies:
 *
 * - Export your data (`store.export`, step-up always): what is inside, Request export, the progress and the parts of
 *   the newest job (24 h links), the past exports. P8's job list; while it is not there the block says so.
 * - Close the store (owner, `store.close`, step-up always): what happens, the typed handle. Reopen while closed ≤ 30 days.
 * - Leave this store (anyone but the last owner).
 * - Transfer ownership: "Coming later" (PL-21, R3).
 */
export default async function DangerSettingsPage({ params }: Props) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "settings.read",
  });
  const canExport = ctx.can("store.export");
  const [jobs, dates, members] = await Promise.all([canExport ? exportJobs(ctx.scope) : Promise.resolve(null), storeLifecycleDates(ctx.scope), listMembersByScope(ctx.scope)]);
  const activeOwners = members.filter((m) => m.role === "owner" && m.status === "active").length;
  const lastOwner = ctx.membership.role === "owner" && activeOwners <= 1;
  const closedAt = ctx.store.status === "closed" ? dates.closedAt : null;
  const reopenUntil = closedAt ? new Date(new Date(closedAt).getTime() + REOPEN_DAYS * 86_400_000).toISOString() : null;
  return (
    <DangerZone
      handle={ctx.store.handle}
      storeName={ctx.store.name}
      status={ctx.store.status}
      canExport={canExport}
      canClose={ctx.can("store.close") || (ctx.store.status === "closed" && ctx.membership.role === "owner")}
      jobs={jobs}
      partBase={apiHref(ctx.store.handle, "/store-export")}
      reopenUntil={reopenUntil}
      lastOwner={lastOwner}
      support={ctx.scope.kind !== "member"}
      actions={{
        exportData: requestStoreExportAction,
        close: closeOwnStoreAction,
        reopen: reopenOwnStoreAction,
        leave: leaveStoreAction,
      }}
    />
  );
}

/** P8's export jobs; null while the export pipeline is not there (its stub) or the read failed. */
async function exportJobs(scope: Parameters<typeof listExportJobs>[0]): Promise<ExportJobSummary[] | null> {
  try {
    return await listExportJobs(scope);
  } catch (err) {
    if (!isNotImplemented(err)) logError("settings:danger-exports", err);
    return null;
  }
}
