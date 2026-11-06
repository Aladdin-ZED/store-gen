import { ArrowLeftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { ExportPanel } from "@/components/console/profile/export-panel";
import { ProfileHeader } from "@/components/console/profile/header";
import { ProfileTabs } from "@/components/console/profile/profile-tabs";
import { visibleTabs } from "@/components/console/profile/tabs";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { translator } from "@/lib/i18n/admin";
import { listPlatformExports } from "@/lib/platform/exports";
import { optional } from "@/lib/platform/panel";
import { getStoreHeader, viewAsNotice } from "@/lib/platform/profile/header";
import { lifecycleMenu } from "@/lib/platform/profile/menu";
import { requirePlatform } from "@/lib/platform/seam";
import { getPlatformSetting } from "@/lib/settings";

/*
 * The store profile's frame (platform.md PLA-§7.1, PL-07; TN-01, TN-03, PD35, PD45, PD54, PD56): `console.read`. The
 * header reads the store row fresh (not the 15 s cache) with the owners, the plan, the health row, the open requests,
 * the active views and the waiting purge request (src/lib/platform/profile/header.ts); the lifecycle menu is decided
 * here per staff member (hidden without the permission, disabled with the reason when the edge is not allowed); the
 * view-as notice is rendered in the store's own locale; the export jobs show to super_admins (PLA-§7.14). An unknown
 * id is the console's own "No store with this id". The tabs render below (`[[...tab]]/page.tsx`).
 */
export default async function StoreProfileLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const { id } = await params;
  const tr = translator(CONSOLE_LOCALE);
  const header = await getStoreHeader(ctx, id);
  if (!header) {
    return (
      <div className="mx-auto grid w-full max-w-[1440px] gap-4">
        <div className="grid justify-items-start gap-2 rounded-[var(--r-card)] bg-card px-5 py-10 shadow-[inset_0_0_0_1px_var(--c-hairline)]">
          <h1 className="text-[15px] font-semibold">{tr("console.profile.not_found")}</h1>
          <p className="text-[13px] text-muted-foreground">{tr("console.profile.not_found_lead")}</p>
          <PrefetchLink href="/admin/stores" className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            <ArrowLeftIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
            {tr("console.profile.back_to_stores")}
          </PrefetchLink>
        </div>
      </div>
    );
  }

  const s = header.store;
  const exportData = ctx.role === "super_admin" && ctx.can("stores.close");
  const [setting, exports] = await Promise.all([
    getPlatformSetting("platform").catch(() => null),
    exportData ? optional("profile.exports", () => listPlatformExports(ctx, s.id), { storeId: s.id }) : Promise.resolve(null),
  ]);
  const menu = lifecycleMenu(s.status, (p) => ctx.can(p), { closedFrom: header.closedFrom, pendingPurge: !!header.pendingPurge });
  const notice = viewAsNotice({ defaultLocale: s.defaultLocale, timezone: s.timezone });
  const viewAs = ctx.can("stores.impersonate");

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <ProfileHeader
        header={header}
        menu={menu}
        grants={{ viewAs, message: ctx.can("notify.stores"), exportData }}
        armSeconds={setting?.lifecycle.armSeconds ?? 5}
        stepUpUntil={ctx.stepUpFresh && ctx.stepUpUntil ? ctx.stepUpUntil.toISOString() : null}
        notice={{ ...notice, timeZone: s.timezone }}
        ticketRequired={ctx.role === "support"}
      />
      {exports && exports.length > 0 && <ExportPanel jobs={exports} />}
      <ProfileTabs storeId={s.id} tabs={visibleTabs(ctx.can("stores.notes") && ctx.role !== "analyst")} viewAs={viewAs} />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">{children}</div>
    </div>
  );
}
