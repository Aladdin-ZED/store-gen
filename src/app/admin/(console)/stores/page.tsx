import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { Suspense } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { ConsolePanel, PanelError, PanelUnavailable } from "@/components/console/panel";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { StoresFilters } from "@/components/console/stores/filters";
import { StoresSkeleton } from "@/components/console/stores/stores-skeleton";
import { StoresTable } from "@/components/console/stores/stores-table";
import { t as message, translator } from "@/lib/i18n/admin";
import { MARKETS } from "@/lib/page/schema";
import { panel } from "@/lib/platform/panel";
import { listPlans } from "@/lib/platform/plans";
import { requirePlatform } from "@/lib/platform/seam";
import { anyStore, listStores, parseStoresFilter, storesQuery, type StoresFilter } from "@/lib/platform/stores-list";
import type { PlatformCtx } from "@/lib/tenancy/types";

/*
 * `/admin/stores` (platform.md PLA-§6.1, PL-06, TN-03; PD26, PD35, PD44): every store, keyset-paged by 50, filtered
 * and sorted from the URL (status, mode, plan, market, band, flag, attention, dormant, q, sort, cursor). `console.read`;
 * the owner e-mail is masked for support and analyst by the read model. The bulk bar messages up to 50 stores
 * (`notify.stores`, support one at a time) and exports the filtered list as CSV (admin+); no lifecycle action exists
 * in bulk. "New store" (`stores.create`) opens the console creation form.
 */
export const metadata: Metadata = { title: message("console.stores.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Stores({ ctx, filter, cursor }: { ctx: PlatformCtx; filter: StoresFilter; cursor: string | null }) {
  const tr = translator(CONSOLE_LOCALE);
  const page = await panel("stores.list", () => listStores(ctx, filter, cursor));
  if (page.state !== "ok") {
    return <ConsolePanel title={tr("console.stores.title")}>{page.state === "error" ? <PanelError reference={page.ref} /> : <PanelUnavailable />}</ConsolePanel>;
  }
  const hasStores = page.data.rows.length > 0 || (await anyStore().catch(() => true));
  const admin = ctx.role === "admin" || ctx.role === "super_admin";
  const qs = storesQuery(page.data.filter);
  return (
    <StoresTable
      page={page.data}
      hasStores={hasStores}
      canMessage={ctx.can("notify.stores")}
      messageOne={!admin}
      csvHref={admin ? `/api/admin/stores.csv${qs ? `?${qs}` : ""}` : null}
      canInvite={ctx.can("platform.settings")}
    />
  );
}

export default async function StoresPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const sp = await searchParams;
  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sp)) params[k] = Array.isArray(v) ? v[0] : v;
  const filter = parseStoresFilter(params);
  const cursor = typeof params.cursor === "string" && params.cursor ? params.cursor : null;
  const tr = translator(CONSOLE_LOCALE);
  const plans = await listPlans(ctx).catch(() => []);
  return (
    <div className="mx-auto grid w-full max-w-[1440px] gap-4 md:gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.stores.title")}</h1>
          <p className="text-[13px] text-muted-foreground">{tr("console.stores.lead")}</p>
        </div>
        {ctx.can("stores.create") && (
          <PrefetchLink
            href="/admin/stores/new"
            className="inline-flex h-[var(--ctl)] items-center gap-1.5 rounded-[var(--r-control)] bg-[var(--brand)] px-3 text-[13px] font-medium text-[var(--brand-foreground)] outline-none transition-colors duration-[var(--dur-1)] hover:bg-[color-mix(in_oklch,var(--brand)_88%,black)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 max-md:h-11"
          >
            <PlusIcon aria-hidden="true" className="size-3.5" />
            {tr("console.stores.new")}
          </PrefetchLink>
        )}
      </header>
      <StoresFilters filter={filter} plans={plans.map((p) => ({ id: p.id, name: p.name }))} markets={MARKETS} />
      <PanelBoundary title={tr("console.stores.title")}>
        {/* not keyed: a filter change keeps the old rows on screen until the new ones stream in */}
        <Suspense fallback={<StoresSkeleton />}>
          <Stores ctx={ctx} filter={filter} cursor={cursor} />
        </Suspense>
      </PanelBoundary>
    </div>
  );
}
