import type { Metadata } from "next";
import { CampaignSlot, TestOrderSlot } from "@/components/admin/landing/address-slots";
import { AddressCard, AddressRenderingProvider } from "@/components/admin/common/address-card";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { addressFacts, storeRowFacts } from "@/lib/admin-data/dashboard";
import { viewerLocale } from "@/lib/auth/locale";
import { t } from "@/lib/i18n/admin";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { memberCtx } from "../../member-ctx";
import { renameHandleAction } from "./actions";
import { addressRenders, renameFacts } from "./data";
import { RenameHandle } from "./_components/rename-handle";

type Props = { params: Promise<{ store: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return {
    title: t("shell.address.title", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/settings/address"))),
  };
}

/**
 * Settings → Address (P2 SHELL; platform.md PLA-§22.10.2, UX-05, PD61; docs/STORE-SAAS.md §C.7, ENGC-30),
 * `settings.read`: the same `AddressCard` as the dashboard and the pages list (P3's two slots inside it, the test order
 * absent without `pages.read`), then Rename handle (`domains.manage`, active stores): live availability, "Old links
 * keep working for 12 months", once per 30 days, store #1's free rename line, then "Updating n pages" while the
 * address re-renders run.
 */
export default async function AddressSettingsPage({ params }: Props) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "settings.read",
  });
  const [address, row, rendering] = await Promise.all([addressFacts(ctx.scope, ctx.store), storeRowFacts(ctx.scope), addressRenders(ctx.scope)]);
  const rename = await renameFacts(ctx.scope, row.createdAt);
  const live = address.livePages > 0 && ctx.store.status !== "pending";
  const pageId = address.page?.id ?? null;
  const canRename = ctx.can("domains.manage") && ctx.store.status === "active" && ctx.scope.kind === "member";
  return (
    <AddressRenderingProvider count={rendering}>
      <div className="w-full max-w-[720px]">
        <AddressCard
          store={{
            id: ctx.store.id,
            handle: ctx.store.handle,
            name: ctx.store.name,
            status: ctx.store.status,
          }}
          live={live}
          pageId={pageId}
          slots={
            ctx.can("pages.read")
              ? {
                  testOrder: <TestOrderSlot pageId={pageId} live={live} />,
                  campaign: ctx.can("pages.write") ? <CampaignSlot /> : undefined,
                }
              : undefined
          }
        />
      </div>
      <RenameHandle
        current={ctx.store.handle}
        canRename={canRename}
        locked={!ctx.can("domains.manage") ? "role" : ctx.store.status !== "active" ? "state" : ctx.scope.kind !== "member" ? "support" : null}
        nextAt={rename.nextAt}
        freeRename={rename.freeRename}
        rename={renameHandleAction}
      />
    </AddressRenderingProvider>
  );
}
