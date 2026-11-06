/**
 * One order found by its id (platform.md PLA-§11.3, PD14; server component): store (link), created in the store's
 * time zone, status / confirm state, total + currency, the masked customer and phone, the items summary (names and
 * quantities only), the page (or "Store checkout"), and "Open in the store profile" → `/admin/stores/<id>/orders?o=<id>`
 * where the drawer opens and a reveal is possible (PLA-§7.4). Every customer field arrives masked from the read model.
 *
 *   <LookupOrderCard order={await lookupOrderById(ctx, id)} />
 */
import { ArrowUpRightIcon, PackageIcon, UserRoundIcon } from "lucide-react";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { translator, type MessageKey } from "@/lib/i18n/admin";
import { formatMoney } from "@/lib/markets/money";
import type { OrderCard } from "@/lib/platform/order-lookup";
import { cn } from "@/lib/utils";
import { absoluteTime } from "../format";
import { consoleUrl } from "@/lib/platform/console-url";

const tr = translator(CONSOLE_LOCALE);
const label = (key: MessageKey, raw: string) => {
  const s = tr(key);
  return s === key ? raw : s;
};

function Fact({ term, children, className }: { term: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 gap-0.5", className)}>
      <dt className="text-[11.5px] text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-[13px]">{children}</dd>
    </div>
  );
}

export function LookupOrderCard({ order }: { order: OrderCard }) {
  const qty = order.items.reduce((n, i) => n + i.qty, 0);
  return (
    <article aria-label={tr("console.lookup.card", { id: order.id })} className="grid gap-4 rounded-[var(--r-card)] bg-card px-4 py-4 shadow-[inset_0_0_0_1px_var(--c-hairline)] md:px-5">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <bdi dir="ltr" className="truncate font-mono text-[15px] font-semibold">
              {order.id}
            </bdi>
            {order.isTest && <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-secondary px-2 text-[11px] font-medium text-muted-foreground">{tr("console.lookup.test")}</span>}
          </span>
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[12.5px] text-muted-foreground">
            <PrefetchLink href={consoleUrl(`/stores/${order.store.id}`)} className="truncate rounded-[4px] font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
              {order.store.name}
            </PrefetchLink>
            {order.store.handle && (
              <bdi dir="ltr" className="font-mono text-[11.5px]">
                @{order.store.handle}
              </bdi>
            )}
          </span>
        </div>
        <span className="num text-[20px] font-semibold tracking-[-0.01em]">{formatMoney(order.totalCents / 100, order.currency, "en")}</span>
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
        <Fact term={tr("console.lookup.created")}>
          <span className="num">{absoluteTime(order.createdAt, order.store.timezone)}</span>
          <span className="block text-[11.5px] text-muted-foreground">{tr("console.lookup.store_time", { tz: order.store.timezone })}</span>
        </Fact>
        <Fact term={tr("console.lookup.status")}>
          <span className="block">{label(`console.order_state.${order.confirmState}`, order.confirmState)}</span>
          <span className="block text-[11.5px] text-muted-foreground">{label(`console.order_state.${order.status}`, order.status)}</span>
        </Fact>
        <Fact term={tr("console.lookup.customer")}>
          <span className="flex min-w-0 items-center gap-1.5">
            <UserRoundIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{order.customer}</span>
          </span>
          <bdi dir="ltr" className="block font-mono text-[12px] text-muted-foreground">
            {order.phone}
          </bdi>
          {order.city && <span className="block truncate text-[11.5px] text-muted-foreground">{order.city}</span>}
        </Fact>
        <Fact term={tr("console.lookup.page")}>{order.page ? <span className="block truncate">{order.page.name}</span> : <span className="text-muted-foreground">{tr(order.storeCheckout ? "console.lookup.store_checkout" : "console.lookup.no_page")}</span>}</Fact>
      </dl>

      <section aria-label={tr("console.lookup.items")} className="grid gap-1.5 border-t border-[var(--c-hairline)] pt-3">
        <h3 className="text-[11.5px] text-muted-foreground">{tr("console.lookup.items_n", { count: qty })}</h3>
        {order.items.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">{tr("console.lookup.no_items")}</p>
        ) : (
          <ul className="grid gap-1">
            {order.items.map((i, n) => (
              <li key={n} className="flex min-w-0 items-center gap-2 text-[13px]">
                <PackageIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{i.name}</span>
                <span className="num shrink-0 text-muted-foreground">× {i.qty}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--c-hairline)] pt-3">
        <p className="text-[12px] text-muted-foreground">{tr("console.lookup.masked_note")}</p>
        <PrefetchLink
          href={order.profileHref}
          className="inline-flex h-[var(--ctl)] items-center gap-1.5 rounded-[var(--r-control)] bg-[var(--brand)] px-3 text-[13px] font-medium text-[var(--brand-foreground)] outline-none transition-colors duration-[var(--dur-1)] hover:bg-[color-mix(in_oklch,var(--brand)_88%,black)] focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 max-md:h-11"
        >
          {tr("console.lookup.open_profile")}
          <ArrowUpRightIcon aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        </PrefetchLink>
      </footer>
    </article>
  );
}
