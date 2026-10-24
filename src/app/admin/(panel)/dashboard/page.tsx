import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import { getDashboard } from "@/lib/admin-data/dashboard";
import { STATS_TZ } from "@/lib/admin-data/time";
import { can, homePathFor, requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  // call-center agents only work the order queue
  if (!can(user.role, "pages.read")) redirect(homePathFor(user.role));

  const data = await getDashboard(user);
  return (
    <DashboardView
      data={data}
      greeting={greeting(STATS_TZ)}
      firstName={user.name.trim().split(/\s+/)[0] ?? user.name}
      todayLabel={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: STATS_TZ }).format(new Date())}
      can={{ orders: can(user.role, "orders.read"), write: can(user.role, "pages.write"), sync: can(user.role, "orders.write") }}
    />
  );
}
