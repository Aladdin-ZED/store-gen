"use client";
/**
 * The order lookup by phone (platform.md PLA-§11.3, PD14; `orders.lookup`, admin+): the page renders this only for a
 * staff member who holds the permission, so support and analyst never see the field. The number goes to the action
 * in the request body (never in the URL); the answer is one row per store where it ordered: orders, last order,
 * delivered / refused when known, the store's blocklist state, and the masked phone in the header. 30 an hour.
 *
 *   <PhoneLookup />
 */
import { BanIcon, PhoneIcon, SearchIcon } from "lucide-react";
import { useId, useState } from "react";
import { lookupPhoneAction } from "@/app/admin/(console)/orders/actions";
import { useT } from "@/lib/i18n/admin/client";
import type { PhoneLookup as Result } from "@/lib/platform/order-lookup";
import { cn } from "@/lib/utils";
import { Ago } from "../ago";
import { PrefetchLink } from "../prefetch-link";
import { button } from "../queue/decision-dialogs";

export function PhoneLookup() {
  const t = useT();
  const id = useId();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async () => {
    if (!phone.trim()) return setProblem(t("console.lookup.phone_invalid"));
    setBusy(true);
    setProblem(null);
    const r = await lookupPhoneAction({ phone: phone.trim() }).catch(() => ({ ok: false as const, error: "server" as const, message: undefined }));
    setBusy(false);
    if (r.ok) setResult(r.data);
    else setProblem(r.message ? t(r.message) : t(r.error === "rate_limited" ? "console.lookup.rate_limited" : "console.lookup.failed"));
  };

  return (
    <div className="grid gap-3">
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid min-w-0 flex-1 gap-1 sm:max-w-[320px]">
          <label htmlFor={id} className="sr-only">
            {t("console.lookup.phone_label")}
          </label>
          <div className="relative">
            <PhoneIcon aria-hidden="true" className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id={id}
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              placeholder="+212 6 12 34 56 78"
              aria-invalid={!!problem || undefined}
              aria-describedby={`${id}-h`}
              onChange={(e) => setPhone(e.target.value)}
              className="h-[var(--ctl)] w-full rounded-[var(--r-control)] bg-background ps-8 pe-3 text-start font-mono text-[13px] shadow-[inset_0_0_0_1px_var(--input)] outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_color-mix(in_oklch,var(--ring)_22%,transparent)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--c-danger-ink)] max-md:h-11"
            />
          </div>
          <p id={`${id}-h`} className={cn("text-[12px]", problem ? "text-[var(--c-danger-ink)]" : "text-muted-foreground")}>
            {problem ?? t("console.lookup.phone_hint")}
          </p>
        </div>
        <button type="submit" disabled={busy} className={cn(button.base, button.secondary)}>
          <SearchIcon aria-hidden="true" className="size-3.5" />
          {t("console.lookup.find")}
        </button>
      </form>

      {result && (
        <section aria-live="polite" className="grid gap-2">
          <h3 className="flex flex-wrap items-baseline gap-2 text-[13px] font-semibold">
            <bdi dir="ltr" className="font-mono">
              {result.phone}
            </bdi>
            <span className="text-[12px] font-normal text-muted-foreground">{t("console.lookup.stores_n", { count: result.stores.length })}</span>
          </h3>
          {result.stores.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">{t("console.lookup.phone_none")}</p>
          ) : (
            <ul className="divide-y divide-[var(--c-hairline)] overflow-hidden rounded-[var(--r-control)] shadow-[inset_0_0_0_1px_var(--c-hairline)]">
              {result.stores.map((s) => (
                <li key={s.store.id} className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <PrefetchLink href={`/admin/stores/${s.store.id}/orders`} className="truncate rounded-[4px] text-[13px] font-medium text-[var(--c-brand-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
                      {s.store.name}
                    </PrefetchLink>
                    {s.store.handle && (
                      <bdi dir="ltr" className="truncate font-mono text-[11.5px] text-muted-foreground">
                        @{s.store.handle}
                      </bdi>
                    )}
                    {s.blocked && (
                      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[var(--c-danger-soft)] px-2 text-[11px] font-medium text-[var(--c-danger-ink)]">
                        <BanIcon aria-hidden="true" className="size-3" />
                        {t("console.lookup.blocked")}
                      </span>
                    )}
                  </span>
                  <span className="num flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                    <span>{t("console.lookup.orders_n", { count: s.orders })}</span>
                    <span>{t("console.lookup.delivered_refused", { delivered: s.delivered, refused: s.refused })}</span>
                    {s.lastOrderAt && <Ago iso={s.lastOrderAt} template="console.lookup.last_order" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
