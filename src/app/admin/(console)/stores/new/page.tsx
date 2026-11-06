import type { Metadata } from "next";
import { ChevronLeftIcon } from "lucide-react";
import { CONSOLE_LOCALE } from "@/components/console/locale";
import { PrefetchLink } from "@/components/console/prefetch-link";
import { NewStoreForm } from "@/components/console/stores/new-store-form";
import { platformSetting } from "@/lib/auth/platform-config";
import { t as message, translator } from "@/lib/i18n/admin";
import { MARKET_SPECS } from "@/lib/markets/specs";
import { MARKETS } from "@/lib/page/schema";
import { listPlans } from "@/lib/platform/plans";
import { requirePlatform } from "@/lib/platform/seam";

/*
 * `/admin/stores/new` (platform.md PLA-§6.2, PLA-§Q.5): an internal or partner store made from the console. Only
 * `stores.create` (super admin) reaches it; the action re-checks it, runs the brand check (an exact protected term
 * needs the staff note), creates the store `active` with its owner and an approved review row (`console_created`)
 * and audits `store.created { via: "console" }`. Defaults come from the platform's `newStore` settings.
 */
export const metadata: Metadata = { title: message("console.store_new.meta") };

export default async function NewStorePage() {
  const ctx = await requirePlatform({ permission: "stores.create" });
  const [setting, plans] = await Promise.all([platformSetting(), listPlans(ctx).catch(() => [])]);
  const tr = translator(CONSOLE_LOCALE);
  const currencyOf = Object.fromEntries(MARKETS.map((m) => [m, MARKET_SPECS[m].currency]));
  return (
    <div className="mx-auto grid w-full max-w-[880px] gap-4 md:gap-5">
      <header className="grid gap-2">
        <PrefetchLink href="/admin/stores" className="inline-flex w-fit items-center gap-1 rounded-[4px] text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)] max-md:min-h-11">
          <ChevronLeftIcon aria-hidden="true" className="size-3.5 rtl:rotate-180" />
          {tr("console.stores.title")}
        </PrefetchLink>
        <div className="grid gap-1">
          <h1 className="text-[20px] leading-tight font-semibold tracking-[-0.014em]">{tr("console.store_new.title")}</h1>
          <p className="max-w-[640px] text-[13px] text-muted-foreground">{tr("console.store_new.lead")}</p>
        </div>
      </header>
      <NewStoreForm
        defaults={{ market: setting.newStore.market, currency: setting.newStore.currency, timezone: setting.newStore.timezone }}
        plans={plans.filter((p) => p.status !== "retired").map((p) => ({ id: p.id, name: p.name }))}
        markets={MARKETS}
        currencyOf={currencyOf}
        staffEmail={ctx.user.email}
      />
    </div>
  );
}
