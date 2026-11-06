"use client";
/**
 * `/app/<h>/customers` (P4 CALL CENTER; operations.md OPE-§9.2, §9.5, OP-06, OP-12; core §I.8).
 *
 *   Customers   search by name or phone digits (the URL's `q`, results masked), the filters Has refused or returned /
 *               Blocked / Repeat buyers (`filter`), last order first, 50 a page with Show more (keyset); columns name,
 *               masked phone, city, orders, delivered, refused + returned, last order, the blocked chip. Agents get
 *               the customers of the orders they can see (the read decides), with counts only.
 *   Blocked     `?tab=blocked`: the masked phone or the IP hash prefix, reason, who, when, Unblock (blocklist.write).
 *
 * Phones: two-line rows; the table from 768 px.
 */
import "../queue/queue.css";
import { BanIcon, ChevronRightIcon, Loader2Icon, ShieldOffIcon, WifiIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { listCustomersAction, unblockAction } from "@/app/app/[store]/customers/actions";
import { Button } from "@/components/ui/button";
import type { BlockedRow, CustomerFilter, CustomerListRow } from "@/lib/orders/customers";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "../common/confirm-dialog";
import { SearchField } from "../common/search-field";
import { StatusChip } from "../common/status-chip";
import { settle } from "../orders/ops-ui";
import { EmptyTable } from "../queue/empty-table";
import { ago, num } from "../queue/time";

export type CustomersTab = "all" | "blocked";

const FILTERS: { id: CustomerFilter | null; key: "ops.customers.filter.all" | "ops.customers.filter.refused" | "ops.customers.filter.blocked" | "ops.customers.filter.repeat" }[] = [
  { id: null, key: "ops.customers.filter.all" },
  { id: "refused_returned", key: "ops.customers.filter.refused" },
  { id: "repeat", key: "ops.customers.filter.repeat" },
  { id: "blocked", key: "ops.customers.filter.blocked" },
];

export function CustomersView({
  tab,
  q,
  filter,
  initial,
  blocked,
  perms,
  base,
}: {
  tab: CustomersTab;
  q: string;
  filter: CustomerFilter | null;
  initial: { items: CustomerListRow[]; next: string | null };
  blocked: BlockedRow[] | null;
  perms: { block: boolean; readOnly: boolean; seeAll: boolean };
  base: string;
}) {
  const t = useT();
  return (
    <div className="grid gap-5">
      <nav aria-label={t("ops.customers.tabs")} className="flex gap-1 border-b border-border">
        {(["all", "blocked"] as const).map((id) => (
          <Link
            key={id}
            href={id === "all" ? base : `${base}?tab=blocked`}
            aria-current={tab === id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
              tab === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(id === "all" ? "ops.customers.tab.all" : "ops.customers.tab.blocked")}
          </Link>
        ))}
      </nav>
      {tab === "blocked" ? <BlockedList rows={blocked ?? []} canWrite={perms.block && !perms.readOnly} /> : <CustomerList q={q} filter={filter} initial={initial} base={base} seeAll={perms.seeAll} />}
    </div>
  );
}

function CustomerList({ q, filter, initial, base, seeAll }: { q: string; filter: CustomerFilter | null; initial: { items: CustomerListRow[]; next: string | null }; base: string; seeAll: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [extra, setExtra] = useState<{ key: string; items: CustomerListRow[]; next: string | null }>({ key: "", items: [], next: null });
  const [loading, setLoading] = useState(false);
  const key = `${q}|${filter ?? ""}|${initial.items[0]?.id ?? ""}`;
  const more = extra.key === key ? extra : { key, items: [], next: initial.next };
  const items = [...initial.items, ...more.items];
  const [now] = useState(() => Date.now());

  const go = (next: { q?: string; filter?: CustomerFilter | null }) => {
    const sp = new URLSearchParams();
    const nq = next.q ?? q;
    const nf = next.filter === undefined ? filter : next.filter;
    if (nq) sp.set("q", nq);
    if (nf) sp.set("filter", nf);
    start(() => router.push(sp.size ? `${base}?${sp}` : base, { scroll: false }));
  };

  const showMore = async () => {
    if (!more.next) return;
    setLoading(true);
    const res = await settle<{ items: CustomerListRow[]; next: string | null }>(listCustomersAction({ search: q, filter: filter ?? "" }, more.next));
    setLoading(false);
    if (!res.ok) {
      toast.error(t("ops.error.generic"));
      return;
    }
    setExtra({ key, items: [...more.items, ...res.data.items], next: res.data.next });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchField value={q} onCommit={(v) => go({ q: v })} pending={pending} placeholder={t("ops.customers.search")} label={t("ops.customers.search")} />
        <div role="group" aria-label={t("ops.customers.filters")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => go({ filter: f.id })}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-xs font-medium whitespace-nowrap ring-1 transition-colors ring-inset",
                filter === f.id ? "bg-foreground text-background ring-foreground" : "text-foreground/75 ring-border hover:bg-foreground/[0.04] hover:text-foreground",
              )}
            >
              {t(f.key)}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyTable
          cols={7}
          text={q || filter ? t("ops.customers.emptyFiltered") : seeAll ? t("ops.customers.empty") : t("ops.customers.emptyAgent")}
          action={
            q || filter ? (
              <Button variant="outline" size="sm" onClick={() => go({ q: "", filter: null })}>
                {t("ops.customers.clear")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn("overflow-hidden rounded-[18px] border border-border bg-card transition-opacity", pending && "opacity-60")}>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="q-2xs border-b border-border text-muted-foreground [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
                <th>{t("ops.customers.col.name")}</th>
                <th>{t("ops.customers.col.phone")}</th>
                <th>{t("ops.customers.col.city")}</th>
                <th className="!text-end">{t("ops.customers.col.orders")}</th>
                <th className="!text-end">{t("ops.customers.col.delivered")}</th>
                <th className="!text-end">{t("ops.customers.col.refused")}</th>
                <th>{t("ops.customers.col.last")}</th>
              </tr>
            </thead>
            <tbody className="q-num">
              {items.map((c) => (
                <tr key={c.id} className="group relative border-b border-border/70 transition-colors last:border-0 hover:bg-foreground/[0.025] [&>td]:px-3 [&>td]:py-2.5">
                  <td>
                    <Link href={`${base}/${c.id}`} className="flex items-center gap-2 font-medium text-foreground after:absolute after:inset-0">
                      <span className="truncate">{c.name ?? t("ops.customers.noName")}</span>
                      {c.blocked && <BlockedChip />}
                    </Link>
                  </td>
                  <td>
                    <bdi dir="ltr" className="font-mono text-[0.8125rem] text-foreground/80">
                      {c.phoneMasked}
                    </bdi>
                  </td>
                  <td className="text-foreground/80">{c.city ?? "–"}</td>
                  <td className="text-end">{num(c.orders, locale)}</td>
                  <td className="text-end">{num(c.delivered, locale)}</td>
                  <td className={cn("text-end", c.refusedReturned > 0 && "text-rose-700 dark:text-rose-300")}>{num(c.refusedReturned, locale)}</td>
                  <td className="text-muted-foreground">{c.lastOrderAt ? ago(Date.parse(c.lastOrderAt), now, locale) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-border md:hidden">
            {items.map((c) => (
              <li key={c.id}>
                <Link href={`${base}/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-foreground/[0.03]">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{c.name ?? t("ops.customers.noName")}</span>
                      {c.blocked && <BlockedChip />}
                    </span>
                    <span className="q-xs q-num truncate text-muted-foreground">
                      <bdi dir="ltr" className="font-mono">
                        {c.phoneMasked}
                      </bdi>
                      {c.city && (
                        <>
                          {" · "}
                          <bdi>{c.city}</bdi>
                        </>
                      )}
                      {" · "}
                      <bdi>{t("ops.customers.phoneLine", { orders: num(c.orders, locale), delivered: num(c.delivered, locale) })}</bdi>
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {more.next && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void showMore()} disabled={loading} className="min-w-36">
            {loading && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
            {t("ops.customers.more")}
          </Button>
        </div>
      )}
    </div>
  );
}

function BlockedChip() {
  const t = useT();
  return (
    <StatusChip tone="red" className="h-5 shrink-0 px-2 text-[0.6875rem]">
      <BanIcon className="size-3" aria-hidden="true" /> {t("ops.drawer.blocked")}
    </StatusChip>
  );
}

function BlockedList({ rows, canWrite }: { rows: BlockedRow[]; canWrite: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const [confirm, setConfirm] = useState<BlockedRow | null>(null);
  const [now] = useState(() => Date.now());
  if (rows.length === 0) return <EmptyTable cols={5} text={t("ops.customers.blocked.empty")} />;
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-[18px] border border-border bg-card">
        {rows.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              {b.kind === "phone" ? <BanIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <WifiIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="grid min-w-0 gap-0.5">
                <bdi dir="ltr" className="truncate font-mono text-sm text-foreground">
                  {b.kind === "ip" ? `${t("ops.customers.blocked.ip")} ${b.shown}` : b.shown}
                </bdi>
                <span className="q-xs truncate text-muted-foreground">{b.reason ?? t("ops.customers.blocked.noReason")}</span>
              </span>
            </span>
            <span className="q-xs text-muted-foreground">
              {b.by ? t("ops.customers.blocked.byWhen", { who: b.by, when: ago(Date.parse(b.createdAt), now, locale) }) : ago(Date.parse(b.createdAt), now, locale)}
            </span>
            {canWrite && (
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setConfirm(b)}>
                <ShieldOffIcon className="size-3.5" aria-hidden="true" />
                {t("ops.customers.unblock")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("ops.customers.unblock.title")}
        description={confirm ? t("ops.customers.unblock.text", { target: confirm.shown }) : undefined}
        confirmLabel={t("ops.customers.unblock")}
        onConfirm={async () => {
          if (!confirm) return;
          const res = await settle(unblockAction(confirm.id));
          if (!res.ok) {
            toast.error(t("ops.error.generic"));
            return false;
          }
          toast.success(t("ops.customers.unblocked"));
          setConfirm(null);
          router.refresh();
        }}
      />
    </>
  );
}
