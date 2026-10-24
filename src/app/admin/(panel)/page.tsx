import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import { getDashboard } from "@/lib/admin-data/dashboard";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { homePathFor } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  // store #1's dashboard (the legacy panel, §K.1 T4)
  const ctx = await legacyStoreCtx();
  const { user, store } = ctx;
  // call-center agents only work the order queue
  if (!ctx.can("pages.read")) redirect(homePathFor(user.role));

  const data = await getDashboard(ctx.scope, store, user);
  return (
    <DashboardView
      data={data}
      greeting={greeting(store.timezone)}
      firstName={user.name.trim().split(/\s+/)[0] ?? user.name}
      todayLabel={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: store.timezone }).format(new Date())}
      can={{ orders: ctx.can("orders.read"), write: ctx.can("pages.write"), sync: ctx.can("orders.write") }}
    />
  );
}
