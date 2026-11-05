import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/admin/dashboard/dashboard-view";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { DASHBOARD_RANGES, dashboardLoaders, welcomePending, type DashboardRange } from "@/lib/admin-data/dashboard";
import { viewerLocale } from "@/lib/auth/locale";
import { t, type MessageKey } from "@/lib/i18n/admin";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import { memberCtx } from "./member-ctx";

type Props = { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The owner's redirect to `/welcome` waits for the flow's page (p2-12 flips it): until `/welcome/page.tsx` exists the
 * redirect would land a new owner on a 404 instead of the dashboard.
 */
const WELCOME_FLOW_LIVE = false;

/**
 * "Overview · <store>" like every other screen, in the viewer's language: Next applies the `[store]` layout's
 * `%s · <name>` template to its child segments only, never to the page of the segment that defines it
 * (generate-metadata.md, `title.template`).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { store, user } = await memberCtx((await params).store);
  const locale = screenLocale(await viewerLocale(user), screenLocalesFor(""));
  return { title: { absolute: `${t("shell.dash.meta", undefined, locale)} · ${store.name}` } };
}

/** The greeting of the store's hour (its time zone, not the server's). */
function greetingKey(timeZone: string): MessageKey {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  if (hour < 5) return "shell.dash.greeting.late";
  if (hour < 12) return "shell.dash.greeting.morning";
  if (hour < 18) return "shell.dash.greeting.afternoon";
  return "shell.dash.greeting.evening";
}

/*
 * /app/<h>: the store's dashboard (docs/STORE-SAAS.md §I.1, store.read; platform.md PLA-§22.17): every block of
 * `dashboardLoaders` started at once and streamed on its own, this store only, in its time zone; `?range=28d` reads the
 * four-week period (7 days otherwise). Owners whose welcome flow is still open are sent to `/welcome` (PLA-§22.2),
 * agents to Orders.
 */
export default async function StoreHomePage({ params, searchParams }: Props) {
  const { store: handle } = await params;
  const ctx = await requireStoreMember({ handle, permission: "store.read" });
  const { user, store } = ctx;
  // call-center agents work the order queue (their own orders), not the store's numbers
  if (!ctx.can("pages.read") && ctx.can("orders.read")) redirect(appHref(store.handle, "/orders"));
  // an owner who hasn't finished (or skipped) the welcome flow resumes it (PLA-§22.2); staff viewing the store never
  if (WELCOME_FLOW_LIVE && ctx.membership.role === "owner" && !ctx.impersonation && (await welcomePending(ctx.scope))) redirect(appHref(store.handle, "/welcome"));

  const asked = (await searchParams).range;
  const range: DashboardRange = DASHBOARD_RANGES.find((r) => r === asked) ?? "7d";
  const locale = screenLocale(await viewerLocale(user), screenLocalesFor(""));
  const todayLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-MA-u-nu-latn" : locale, { weekday: "long", day: "numeric", month: "long", timeZone: store.timezone }).format(new Date());

  return (
    <DashboardView
      load={dashboardLoaders(ctx, range)}
      scope={ctx.scope}
      store={{ id: store.id, handle: store.handle, name: store.name, status: store.status }}
      locale={locale}
      greeting={greetingKey(store.timezone)}
      firstName={user.name.trim().split(/\s+/)[0] ?? user.name}
      todayLabel={todayLabel}
      viewer={{ isOwner: ctx.membership.role === "owner", pagesRead: ctx.can("pages.read"), pagesWrite: ctx.can("pages.write"), ordersWrite: ctx.can("orders.write") }}
    />
  );
}
