import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import { getDashboard } from "@/lib/admin-data/dashboard";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";

export const metadata: Metadata = { title: "Overview" };

type Props = { params: Promise<{ store: string }> };

function greeting(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/*
 * /app/<h>: the store's dashboard (docs/STORE-SAAS.md §I.1, store.read): KPIs, the sales chart, Sheets health, top
 * pages and the latest orders of this store only, in its time zone. The Today brief and the Store Health ring
 * replace the checklist in R1 product (P2, §I.4, §I.7).
 */
export default async function StoreHomePage({ params }: Props) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "store.read" });
  const { user, store } = ctx;
  // call-center agents work the order queue (their own orders), not the store's numbers
  if (!ctx.can("pages.read") && ctx.can("orders.read")) redirect(appHref(store.handle, "/orders"));

  const canOrders = ctx.can("orders.read");
  const data = await getDashboard(ctx.scope, store, user, { orders: canOrders });
  return (
    <DashboardView
      handle={store.handle}
      data={data}
      greeting={greeting(store.timezone)}
      firstName={user.name.trim().split(/\s+/)[0] ?? user.name}
      todayLabel={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: store.timezone }).format(new Date())}
      can={{ orders: canOrders, write: ctx.can("pages.write"), sync: ctx.can("orders.write") }}
    />
  );
}
