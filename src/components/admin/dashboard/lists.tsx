import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import type { DashboardData } from "@/lib/admin-data/dashboard";
import { appHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common/empty-state";
import { StatusChip, TONE_CLASSES } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { int, money, percent } from "../lib/format";
import { orderStatusMeta, PAGE_STATUS_META, riskLevel } from "../lib/status";

function CardHead({ title, description, href, cta }: { title: string; description?: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
      <div className="grid gap-1">
        <h2 className="text-[0.95rem] font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {href && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 text-[0.8rem] font-medium text-muted-foreground transition-colors hover:text-foreground">
          {cta}
          <ArrowRightIcon className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

/** Pages ranked by orders over 7 days, with a conversion bar. */
export function TopPages({ handle, pages, currency, className }: { handle: string; pages: DashboardData["topPages"]; currency: string; className?: string }) {
  const best = Math.max(...pages.map((p) => p.conversion), 0.0001);
  return (
    <section className={cn("adm-surface adm-rise flex flex-col gap-4 pb-3", className)} style={{ ["--i" as string]: 6 }} aria-label="Top pages">
      <CardHead title="Top pages" description="Last 7 days, by orders" href={appHref(handle, "/pages")} cta="All pages" />
      {pages.length === 0 ? (
        <div className="px-5 pb-3 sm:px-6">
          <EmptyState compact illustration="pages" title="No visits this week" description="Once a published page gets traffic, it shows up here with its conversion." />
        </div>
      ) : (
        <div className="overflow-x-auto px-2 sm:px-3">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-start text-[0.75rem] text-muted-foreground">
                <th className="w-[38%] px-3 py-2 text-start font-medium">Page</th>
                <th className="px-3 py-2 text-end font-medium">Visitors</th>
                <th className="px-3 py-2 text-end font-medium">Orders</th>
                <th className="px-3 py-2 text-end font-medium">Revenue</th>
                <th className="w-36 px-3 py-2 text-start font-medium">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p, i) => {
                const meta = PAGE_STATUS_META[p.status] ?? PAGE_STATUS_META.draft!;
                return (
                  <tr key={p.pageId} className="adm-fade group border-t border-border/60 transition-colors hover:bg-foreground/[0.025]" style={{ ["--i" as string]: i + 6 }}>
                    <td className="max-w-0 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={cn("size-2 shrink-0 rounded-full", TONE_CLASSES[meta.tone].dot)} title={meta.label} />
                        <span className="grid min-w-0">
                          <span className="truncate font-medium">{p.name}</span>
                          {p.slug && <span className="truncate font-mono text-[0.72rem] text-muted-foreground">/{p.slug}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums">{int(p.uniques)}</td>
                    <td className="px-3 py-3 text-end font-medium tabular-nums">{int(p.orders)}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{money(p.revenue, currency)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                          <span className="block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(4, (p.conversion / best) * 100)}%` }} />
                        </span>
                        <span className="w-11 text-end text-xs font-medium tabular-nums">{percent(p.conversion)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The latest real orders (bots excluded), newest first. */
export function RecentOrders({ handle, orders, className }: { handle: string; orders: DashboardData["recentOrders"]; className?: string }) {
  return (
    <section className={cn("adm-surface adm-rise flex flex-col gap-3 pb-3", className)} style={{ ["--i" as string]: 7 }} aria-label="Recent orders">
      <CardHead title="Recent orders" href={appHref(handle, "/orders")} cta="Open orders" />
      {orders.length === 0 ? (
        <div className="px-5 pb-3 sm:px-6">
          <EmptyState compact illustration="orders" title="No orders yet" description="New orders appear here the second they're placed." />
        </div>
      ) : (
        <ul className="grid px-2 sm:px-3">
          {orders.map((o, i) => {
            const meta = orderStatusMeta(o.status);
            const risk = riskLevel(o.riskScore);
            return (
              <li key={o.id} className="adm-fade" style={{ ["--i" as string]: i + 7 }}>
                <Link
                  href={appHref(handle, `/orders?order=${encodeURIComponent(o.id)}`)}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-foreground/[0.035]"
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{o.name}</span>
                      {risk && <span className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASSES[risk.tone].dot)} title={risk.label} />}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[o.city, o.pageName].filter(Boolean).join(" · ") || o.id}
                    </span>
                  </span>
                  <span className="grid justify-items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{money(o.total, o.currency)}</span>
                    <span className="flex items-center gap-2">
                      <RelativeTime iso={o.createdAt} className="text-[0.7rem] text-muted-foreground" />
                      <StatusChip tone={meta.tone} className="h-5 px-2 text-[0.68rem]">
                        {meta.label}
                      </StatusChip>
                    </span>
                  </span>
                  <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Stacked bar of this week's order statuses — the call-center pipeline at a glance. */
export function Pipeline({ pipeline, className }: { pipeline: DashboardData["pipeline"]; className?: string }) {
  const total = pipeline.reduce((a, p) => a + p.n, 0);
  const confirmed = pipeline.filter((p) => ["confirmed", "shipped", "delivered"].includes(p.status)).reduce((a, p) => a + p.n, 0);
  const delivered = pipeline.find((p) => p.status === "delivered")?.n ?? 0;
  return (
    <section className={cn("adm-surface adm-rise flex flex-col gap-4 p-5 sm:p-6", className)} style={{ ["--i" as string]: 5 }} aria-label="Order pipeline">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="text-[0.95rem] font-semibold">Pipeline · 7 days</h2>
          <p className="text-sm text-muted-foreground">{total ? `${int(total)} orders by status` : "No orders this week"}</p>
        </div>
      </div>
      {total > 0 && (
        <>
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Orders by status">
            {pipeline.map((p) => (
              <span key={p.status} className={cn("h-full first:rounded-s-full last:rounded-e-full", TONE_CLASSES[orderStatusMeta(p.status).tone].dot)} style={{ width: `${(p.n / total) * 100}%` }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
            {pipeline.map((p) => {
              const meta = orderStatusMeta(p.status);
              return (
                <li key={p.status} className="flex items-center gap-2 text-sm">
                  <span className={cn("size-2 rounded-full", TONE_CLASSES[meta.tone].dot)} />
                  <span className="flex-1 truncate text-muted-foreground">{meta.label}</span>
                  <span className="font-medium tabular-nums">{int(p.n)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto grid grid-cols-2 gap-2 border-t border-border/60 pt-4">
            <div className="grid gap-0.5">
              <span className="text-xl font-semibold tabular-nums">{percent(confirmed / total)}</span>
              <span className="text-xs text-muted-foreground">confirmation rate</span>
            </div>
            <div className="grid gap-0.5">
              <span className="text-xl font-semibold tabular-nums">{percent(delivered / total)}</span>
              <span className="text-xs text-muted-foreground">delivered so far</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
