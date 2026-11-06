import type { Metadata } from "next";
import { SearchIcon } from "lucide-react";
import { Suspense } from "react";
import { PanelBoundary } from "@/components/admin/common/panel-boundary";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { LookupOrderCard } from "@/components/console/lookup/order-card";
import { PhoneLookup } from "@/components/console/lookup/phone-lookup";
import { PanelError, PanelSkeleton, PanelUnavailable } from "@/components/console/panel";
import { t as message, translator } from "@/lib/i18n/admin";
import { lookupOrderById } from "@/lib/platform/order-lookup";
import { panel } from "@/lib/platform/panel";
import { requirePlatform } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";

/*
 * `/admin/orders` (platform.md PLA-§11.3, PD14): the order lookup. By order id for every console role (`?id=`, a
 * plain GET form; the id is not personal data) → one masked card or "No order with this id". By phone only for
 * `orders.lookup` (admin+): the field is absent for support and analyst, and the number travels in the action's body,
 * never in the URL (src/components/console/lookup/phone-lookup.tsx).
 */
export const metadata: Metadata = { title: message("console.lookup.meta") };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const tr = translator(CONSOLE_LOCALE);
const card = "rounded-[var(--r-card)] bg-card shadow-[inset_0_0_0_1px_var(--c-hairline)]";

async function Found({ ctx, id }: { ctx: PlatformCtx; id: string }) {
  const p = await panel("lookup.order", () => lookupOrderById(ctx, id));
  if (p.state !== "ok") return <section className={card}>{p.state === "error" ? <PanelError reference={p.ref} /> : <PanelUnavailable />}</section>;
  if (!p.data) {
    return (
      <section className={`${card} grid justify-items-start gap-1 px-5 py-8`}>
        <p className="text-[13px] font-medium">{tr("console.lookup.not_found")}</p>
        <p className="text-[12.5px] text-muted-foreground">{tr("console.lookup.not_found_lead")}</p>
      </section>
    );
  }
  return <LookupOrderCard order={p.data} />;
}

export default async function OrdersLookupPage({ searchParams }: Props) {
  const ctx = await requirePlatform({ permission: "console.read" });
  const sp = await searchParams;
  const raw = Array.isArray(sp.id) ? sp.id[0] : sp.id;
  const id = typeof raw === "string" ? raw.trim().slice(0, 64) : "";
  const byPhone = ctx.can("orders.lookup");
  return (
    <div className="mx-auto grid w-full max-w-[960px] grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <header className="grid gap-1">
        <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.lookup.title")}</h1>
        <p className="text-[13px] text-muted-foreground">{tr(byPhone ? "console.lookup.lead_phone" : "console.lookup.lead")}</p>
      </header>

      <section aria-labelledby="lookup-id" className={`${card} grid gap-3 px-4 py-4 md:px-5`}>
        <h2 id="lookup-id" className="text-[13px] font-semibold">
          {tr("console.lookup.by_id")}
        </h2>
        <form action="/admin/orders" method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="lookup-order-id" className="sr-only">
            {tr("console.lookup.id_label")}
          </label>
          <div className="relative min-w-0 flex-1 sm:max-w-[360px]">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="lookup-order-id"
              name="id"
              dir="ltr"
              defaultValue={id}
              autoComplete="off"
              spellCheck={false}
              placeholder={tr("console.lookup.id_placeholder")}
              className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background ps-8 pe-3 text-start font-mono text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] max-md:h-11"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-[var(--ctl)] items-center gap-1.5 rounded-[var(--r-control)] bg-card px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--border)] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:h-11"
          >
            {tr("console.lookup.find")}
          </button>
        </form>
      </section>

      {id && (
        <PanelBoundary title={tr("console.lookup.by_id")}>
          <Suspense key={id} fallback={<PanelSkeleton title={tr("console.lookup.by_id")} rows={4} />}>
            <Found ctx={ctx} id={id} />
          </Suspense>
        </PanelBoundary>
      )}

      {byPhone && (
        <section aria-labelledby="lookup-phone" className={`${card} grid gap-3 px-4 py-4 md:px-5`}>
          <div className="grid gap-0.5">
            <h2 id="lookup-phone" className="text-[13px] font-semibold">
              {tr("console.lookup.by_phone")}
            </h2>
            <p className="text-[12px] text-muted-foreground">{tr("console.lookup.by_phone_lead")}</p>
          </div>
          <PhoneLookup />
        </section>
      )}
    </div>
  );
}
