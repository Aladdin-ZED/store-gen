import { CalendarDaysIcon, MousePointerClickIcon, ReceiptTextIcon, ShoppingBagIcon, SparklesIcon, WalletIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/admin-data/dashboard";
import { appHref } from "@/lib/urls";
import { EmptyState } from "../common/empty-state";
import { PageHeader } from "../common/page-header";
import { Screen } from "../common/screen";
import { StorageNotice } from "../common/storage-notice";
import { KpiCard } from "./kpi-card";
import { Pipeline, RecentOrders, TopPages } from "./lists";
import { OrdersChart } from "./orders-chart";
import { SetupChecklist } from "./setup-checklist";
import { SheetHealthCard } from "./sheet-health";

/**
 * The dashboard screen of one store (server-renderable; data comes from getDashboard()). A first-run variant
 * replaces the KPI grid with a welcome card and the setup checklist until there are pages or orders. Every link is
 * the store's (`appHref(handle, …)`).
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
  data: DashboardData;
  /** "Good morning" etc., computed in the store time zone */
  greeting: string;
  firstName: string;
  todayLabel: string;
  can: { orders: boolean; write: boolean; sync: boolean };
}) {
  const { kpis, currency } = data;
  const checklistDone = data.checklist.every((i) => i.done);
  const last14 = data.series.slice(-14);
  const firstRun = !data.hasPages && kpis.orders7d.value === 0;

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
        {data.storage && data.storage.level !== "ok" ? <StorageNotice usage={data.storage} mediaHref={appHref(handle, "/media")} /> : undefined}
      </PageHeader>

      {firstRun ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <EmptyState
            className="lg:col-span-7"
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
          <SetupChecklist items={data.checklist} className="lg:col-span-5" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              emphasis
              className="sm:col-span-2"
              label="Revenue · 7 days"
              icon={<WalletIcon />}
              kind="money"
              currency={currency}
              value={kpis.revenue7d.value}
              previous={kpis.revenue7d.previous}
              hint="Placed orders, before cancellations"
              spark={last14.map((d) => d.revenue)}
              style={{ ["--i" as string]: 1 }}
            />
            <KpiCard
              label="Orders today"
              icon={<CalendarDaysIcon />}
              kind="int"
              value={kpis.ordersToday.value}
              previous={kpis.ordersToday.previous}
              comparedTo="vs yesterday"
              style={{ ["--i" as string]: 2 }}
            />
            <KpiCard
              label="Orders · 7 days"
              icon={<ShoppingBagIcon />}
              kind="int"
              value={kpis.orders7d.value}
              previous={kpis.orders7d.previous}
              spark={last14.map((d) => d.orders)}
              style={{ ["--i" as string]: 3 }}
            />
            <KpiCard
              label="Conversion · 7 days"
              icon={<MousePointerClickIcon />}
              kind="percent"
              value={kpis.conversion7d.value}
              previous={kpis.conversion7d.previous}
              hint={`${kpis.uniques7d.value.toLocaleString("en-US")} unique visitors`}
              style={{ ["--i" as string]: 3 }}
            />
            <KpiCard
              label="Average order · 7 days"
              icon={<WalletIcon />}
              kind="money"
              currency={currency}
              value={kpis.aov7d.value}
              previous={kpis.aov7d.previous}
              style={{ ["--i" as string]: 4 }}
            />
            <SheetHealthCard health={data.sheet} canSync={can.sync} className="sm:col-span-2" />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <OrdersChart series={data.series} currency={currency} />
            </div>
            {checklistDone ? <Pipeline pipeline={data.pipeline} className="lg:col-span-4" /> : <SetupChecklist items={data.checklist} className="lg:col-span-4" />}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <TopPages handle={handle} pages={data.topPages} currency={currency} className="lg:col-span-7" />
            {can.orders && <RecentOrders handle={handle} orders={data.recentOrders} className="lg:col-span-5" />}
          </div>
        </div>
      )}
    </Screen>
  );
}
