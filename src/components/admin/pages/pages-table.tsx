"use client";
/**
 * The pages list as rows (P3 LANDING; landing.md LAN-§15.2, LAN-§4; docs/STORE-SAAS.md §I.8): title, status, slug,
 * the 7-day views line (only with 7 points or more), views, orders, conversion (orders / uniques) and the confirmation
 * rate (confirmed / orders), each rate with its n and "Needs more visits" below n = 20. Real numbers only: a page with
 * no vitals reads zeros, never an estimate. The row menu is the page's full menu (Set as home in `landing` mode).
 */
import { HomeIcon } from "lucide-react";
import Link from "next/link";
import type { PageListItem } from "@/lib/admin-data/pages";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { CopyButton } from "../common/copy-button";
import { Monogram } from "../common/monogram";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "../shell/store-context";
import { editHref, PageMenu, type PageAction, type PagePermissions } from "./page-card";
import { PAGE_ROW_GRID } from "./pages-skeleton";
import { Sparkline } from "./sparkline";

/** The vitals of one page as the server sends them (src/lib/landing/vitals.ts `PageVitals`). */
export interface RowVitals {
  views: number;
  uniques: number;
  orders: number;
  confirmed: number;
  conversion: number | null;
  confirmation: number | null;
  daily: number[] | null;
}

export const NO_VITALS: RowVitals = { views: 0, uniques: 0, orders: 0, confirmed: 0, conversion: null, confirmation: null, daily: null };

const STATUS_TONE: Record<string, string> = {
  published: "bg-green-500/10 text-green-700 ring-green-500/20 dark:text-green-300",
  draft: "bg-foreground/[0.05] text-foreground/70 ring-foreground/10",
  archived: "bg-foreground/[0.03] text-muted-foreground ring-foreground/[0.08]",
};

export function PagesTable({
  pages,
  vitals,
  can,
  homeAllowed,
  focusId,
  busyId,
  pending,
  onAction,
}: {
  pages: PageListItem[];
  vitals: Record<string, RowVitals>;
  can: PagePermissions;
  homeAllowed: boolean;
  focusId?: string;
  busyId: string | null;
  pending: boolean;
  onAction: (action: PageAction, page: PageListItem) => void;
}) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { style: "percent", maximumFractionDigits: 1 });

  const rate = (value: number | null, n: number) => (
    <span className="grid gap-0.5 lg:justify-items-end">
      {value === null ? (
        <span className="text-xs leading-tight text-muted-foreground">{t("landing.pages.needsVisits")}</span>
      ) : (
        <span className="text-sm font-semibold tabular-nums">{pct.format(value)}</span>
      )}
      <span className="text-[0.6875rem] leading-none text-muted-foreground tabular-nums">{t("landing.pages.n", { n: num.format(n) })}</span>
    </span>
  );

  return (
    <div className={cn("adm-surface overflow-hidden transition-opacity duration-200", pending && "opacity-60")}>
      <div role="row" className={cn(PAGE_ROW_GRID, "hidden items-center gap-4 border-b border-border/60 px-5 py-2.5 text-xs font-medium text-muted-foreground lg:grid")}>
        <span role="columnheader">{t("landing.pages.col.page")}</span>
        <span role="columnheader" />
        <span role="columnheader">{t("landing.pages.col.trend")}</span>
        <span role="columnheader" className="text-end">{t("landing.pages.col.views")}</span>
        <span role="columnheader" className="text-end">{t("landing.pages.col.orders")}</span>
        <span role="columnheader" className="text-end">{t("landing.pages.col.conversion")}</span>
        <span role="columnheader" className="text-end">{t("landing.pages.col.confirmation")}</span>
        <span role="columnheader" />
      </div>
      <ul role="rowgroup">
        {pages.map((page) => {
          const v = vitals[page.id] ?? NO_VITALS;
          const live = page.status === "published";
          const path = store.livePath(page.slug);
          return (
            <li
              key={page.id}
              id={`page-${page.id}`}
              role="row"
              aria-busy={busyId === page.id || undefined}
              className={cn(
                PAGE_ROW_GRID,
                "group relative items-center gap-x-3 gap-y-3 border-b border-border/50 px-4 py-3.5 transition-colors last:border-b-0 hover:bg-foreground/[0.02] lg:gap-4 lg:px-5",
                page.id === focusId && "bg-brand/[0.04]",
                busyId === page.id && "pointer-events-none opacity-60",
              )}
            >
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <Monogram name={page.name} seed={page.id} size={32} />
                <div className="grid min-w-0 gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {can.write && page.status !== "archived" ? (
                      <Link href={editHref(store, page.id)} className="truncate text-sm font-semibold tracking-[-0.005em] outline-none hover:underline focus-visible:underline" title={page.name}>
                        {page.name}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-semibold" title={page.name}>
                        {page.name}
                      </span>
                    )}
                    {page.isHome && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md bg-brand/10 px-1.5 text-[0.6875rem] font-medium text-brand">
                            <HomeIcon aria-hidden="true" className="size-3" />
                            {t("landing.pages.home")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t("landing.pages.homeHint")}</TooltipContent>
                      </Tooltip>
                    )}
                    {page.unpublishedChanges && live && (
                      <span className="hidden h-5 shrink-0 items-center rounded-md bg-warn/15 px-1.5 text-[0.6875rem] font-medium text-warn-ink sm:inline-flex">{t("landing.pages.unpublishedEdits")}</span>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <bdi dir="ltr" className="truncate font-mono text-[0.75rem]">
                      {path}
                    </bdi>
                    <CopyButton value={store.live(page.slug)} label={t("landing.pages.menu.copyLink")} toastMessage={t("landing.pages.toast.copied")} size="icon-xs" className="-my-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />
                  </div>
                </div>
              </div>

              <div role="cell" className="col-start-2 row-start-1 flex justify-end lg:col-start-8">
                <PageMenu page={page} can={can} onAction={onAction} liveUrl={store.live(page.slug)} homeAllowed={homeAllowed} className="me-0" />
              </div>

              <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 lg:contents">
                <span role="cell">
                  <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset", STATUS_TONE[page.status])}>{t(`landing.pages.status.${page.status}`)}</span>
                </span>
                <span role="cell" className="hidden items-center sm:flex">
                  {v.daily ? (
                    <Sparkline points={v.daily} label={t("landing.pages.col.trend")} />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("landing.pages.noTrend")}</span>
                  )}
                </span>
                <Metric label={t("landing.pages.col.views")} value={num.format(v.views)} />
                <Metric label={t("landing.pages.col.orders")} value={num.format(v.orders)} />
                <span role="cell" className="grid gap-0.5 lg:justify-items-end">
                  <span className="text-[0.6875rem] text-muted-foreground lg:hidden">{t("landing.pages.col.conversion")}</span>
                  {rate(v.conversion, v.uniques)}
                </span>
                <span role="cell" className="grid gap-0.5 lg:justify-items-end">
                  <span className="text-[0.6875rem] text-muted-foreground lg:hidden">{t("landing.pages.col.confirmation")}</span>
                  {rate(v.confirmation, v.orders)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span role="cell" className="grid gap-0.5 lg:justify-items-end">
      <span className="text-[0.6875rem] text-muted-foreground lg:hidden">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </span>
  );
}
