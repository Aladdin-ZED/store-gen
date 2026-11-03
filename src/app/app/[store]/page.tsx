import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import { dashboardPanels, welcomePending } from "@/lib/admin-data/dashboard";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import { memberCtx } from "./member-ctx";

type Props = { params: Promise<{ store: string }> };

/**
 * The owner's redirect to `/welcome` waits for the flow's page (p2-12 flips it): until `/welcome/page.tsx` exists the
 * redirect would land a new owner on a 404 instead of the dashboard.
 */
const WELCOME_FLOW_LIVE = false;

/**
 * "Overview · <store>" like every other screen: Next applies the `[store]` layout's `%s · <name>` template to its child
 * segments only, never to the page of the segment that defines it (generate-metadata.md, `title.template`).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store } = await memberCtx((await params).store);
  return { title: { absolute: `Overview · ${store.name}` } };
}

function greeting(timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/*
 * /app/<h>: the store's dashboard (docs/STORE-SAAS.md §I.1, store.read; platform.md PLA-§22.17): one settled panel per
 * block (`dashboardPanels`), this store only, in its time zone. The Today brief and the Store Health ring arrive with
 * the redesign (p2-09); the R1.0 setup checklist is gone (the ring replaces it, §I.4). Owners whose welcome flow is
 * still open are sent to `/welcome` (PLA-§22.2), agents to Orders.
 */
export default async function StoreHomePage({ params }: Props) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "store.read" });
  const { user, store } = ctx;
  // call-center agents work the order queue (their own orders), not the store's numbers
  if (!ctx.can("pages.read") && ctx.can("orders.read")) redirect(appHref(store.handle, "/orders"));
  // an owner who hasn't finished (or skipped) the welcome flow resumes it (PLA-§22.2); staff viewing the store never
  if (WELCOME_FLOW_LIVE && ctx.membership.role === "owner" && !ctx.impersonation && (await welcomePending(ctx.scope))) redirect(appHref(store.handle, "/welcome"));

  const canOrders = ctx.can("orders.read");
  const data = await dashboardPanels(ctx, "7d");
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
