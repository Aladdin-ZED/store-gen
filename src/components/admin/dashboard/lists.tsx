import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import type { LatestOrder } from "@/lib/admin-data/dashboard";
import { appHref } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { EmptyState } from "../common/empty-state";
import { StatusChip, TONE_CLASSES } from "../common/status-chip";
import { RelativeTime } from "../common/time";
import { money } from "../lib/format";
import { orderStatusMeta, riskLevel } from "../lib/status";

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

/** The latest real orders (bots and test orders excluded), newest first; totals in cents (D41). */
export function RecentOrders({ handle, orders, className }: { handle: string; orders: readonly LatestOrder[]; className?: string }) {
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
                    <span className="text-sm font-semibold tabular-nums">{money(o.totalCents / 100, o.currency)}</span>
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
