import type { Metadata } from "next";
import { MarketForm } from "@/components/admin/settings/market-form";
import { Locale, Market } from "@/lib/page/schema";
import { getStoreSetting } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { saveDefaultsAction } from "../actions";

export const metadata: Metadata = { title: "Market defaults" };

type Params = Promise<{ store: string }>;

/** Settings → Market defaults: the store row's market, currency and page locale (SET-08) and its `defaults` key. */
export default async function MarketSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const d = await getStoreSetting(ctx.scope, "defaults", { fresh: true });
  const market = Market.safeParse(ctx.store.market);
  const locale = Locale.safeParse(d.locales[0] ?? ctx.store.defaultLocale);
  return (
    <MarketForm
      initial={{
        market: market.success ? market.data : undefined,
        locale: locale.success ? locale.data : undefined,
        currency: ctx.store.currency,
        phoneCountry: d.phoneCountry,
        // an unset fee shows as 0, the form's empty value (never saved unless the member saves the form)
        shippingFee: d.shippingFee ?? 0,
        deliveryText: d.deliveryText,
      }}
      canWrite={ctx.can("settings.write")}
      save={saveDefaultsAction}
    />
  );
}
