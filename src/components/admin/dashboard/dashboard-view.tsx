import { CalendarDaysIcon, ReceiptTextIcon, ShoppingBagIcon, SparklesIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DashboardPanels } from "@/lib/admin-data/dashboard";
import { appHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common/empty-state";
import { PageHeader } from "../common/page-header";
import { Screen } from "../common/screen";
import { StorageNotice } from "../common/storage-notice";
import { KpiCard } from "./kpi-card";
import { RecentOrders } from "./lists";
import { OrdersChart } from "./orders-chart";
import { SheetHealthCard } from "./sheet-health";

/**
 * The dashboard screen of one store (server-renderable; data from `dashboardPanels()`): each block reads its own
 * panel and is left out when the panel has no data for this viewer, so one missing source never blanks the page. A
 * first-run variant (no page, no order) shows the welcome card. Every link is the store's (`appHref(handle, …)`).
 *
 * The R1.0 layout on the R1 panels until the redesign (p2-09: the Today brief, the Store Health ring that replaces
 * the deleted setup checklist, KPI tiles, the COD funnel): "Revenue" is "Placed", the value of orders placed, not
 * delivered (PLA-§22.17 item 4).
 */
export function DashboardView({
  handle,
  data,
  greeting,
  firstName,
  todayLabel,
  can,
}: {
  handle: string;
  data: DashboardPanels;
  /** "Good morning" etc., computed in the store time zone */
  greeting: string;
  firstName: string;
  todayLabel: string;
  can: { orders: boolean; write: boolean; sync: boolean };
}) {
  const { currency } = data;
  const placed = data.placed.ok ? data.placed.data : null;
  const address = data.address.ok ? data.address.data : null;
  const storage = data.usage.ok ? data.usage.data.storage : null;
  const firstRun = !!placed && placed.count === 0 && placed.previous.count === 0 && !!address && address.livePages === 0 && address.draftPages === 0;
  const range = placed ? placed.series.filter((d) => d.day >= placed.from) : [];
  const yesterday = range.length >= 2 ? range[range.length - 2]! : null;
  const days = range.length;
  const side = data.sheet.ok || data.latestOrders.ok;

  return (
    <Screen wide>
      <PageHeader
        eyebrow={todayLabel}
        title={
          <>
            <span className="text-muted-foreground">{greeting},</span> {firstName}
          </>
        }
        description={firstRun ? "Let's get your first landing page live." : "Here's how your pages are selling."}
        actions={
          <>
            {can.orders && (
              <Button asChild variant="outline" className="h-9 rounded-full px-4">
                <Link href={appHref(handle, "/orders")}>
                  <ReceiptTextIcon />
                  Orders
                </Link>
              </Button>
            )}
            {can.write && (
              <Button asChild variant="brand" className="h-9 rounded-full px-4">
                <Link href={appHref(handle, "/generate")}>
                  <SparklesIcon />
                  Generate a page
                </Link>
              </Button>
            )}
          </>
        }
      >
        {/* from 80 % of the plan's storage on (the §I.4 quota banner): past it uploads stop */}
        {storage && storage.level !== "ok" ? <StorageNotice usage={storage} mediaHref={appHref(handle, "/media")} /> : undefined}
      </PageHeader>

      {firstRun ? (
        <EmptyState
          illustration="sparkles"
          title="Your store is ready"
          description="Drop a few product photos, pick a direction, and the generator art-directs a complete cash-on-delivery page: copy, offers and order form included."
          actions={
            can.write ? (
              <Button asChild variant="brand" className="h-10 rounded-full px-5">
                <Link href={appHref(handle, "/generate")}>
                  <SparklesIcon />
                  Generate your first page
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {placed && (
              <>
                <KpiCard
                  emphasis
                  className="sm:col-span-2"
                  label={`Placed · ${days} days`}
                  icon={<WalletIcon />}
                  kind="money"
                  currency={currency}
                  value={placed.cents / 100}
                  previous={placed.previous.cents / 100}
                  comparedTo={`vs previous ${days} days`}
                  hint="Placed, not delivered"
                  spark={range.map((d) => d.cents / 100)}
                  style={{ ["--i" as string]: 1 }}
                />
                <KpiCard
                  label="Orders today"
                  icon={<CalendarDaysIcon />}
                  kind="int"
                  value={placed.today.count}
                  previous={yesterday?.count ?? null}
                  comparedTo="vs yesterday"
                  style={{ ["--i" as string]: 2 }}
                />
                <KpiCard
                  label={`Orders · ${days} days`}
                  icon={<ShoppingBagIcon />}
                  kind="int"
                  value={placed.count}
                  previous={placed.previous.count}
                  comparedTo={`vs previous ${days} days`}
                  spark={range.map((d) => d.count)}
                  style={{ ["--i" as string]: 3 }}
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {placed && (
              <div className={side ? "lg:col-span-7" : "lg:col-span-12"}>
                <OrdersChart series={placed.series.map((d) => ({ day: d.day, orders: d.count, value: d.cents / 100, uniques: d.visitors }))} currency={currency} />
              </div>
            )}
            {side && (
              <div className={cn("grid content-start gap-5", placed ? "lg:col-span-5" : "lg:col-span-12")}>
                {data.sheet.ok && <SheetHealthCard health={data.sheet.data} canSync={can.sync} />}
                {data.latestOrders.ok && <RecentOrders handle={handle} orders={data.latestOrders.data} />}
              </div>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}
