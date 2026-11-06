import type { Metadata } from "next";
import { screenLocale, screenLocalesFor } from "@/components/admin/shell/store-nav";
import { viewerLocale } from "@/lib/auth/locale";
import { t } from "@/lib/i18n/admin";
import { getStoreSetting } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import { saveDefaultsAction } from "../actions";
import { memberCtx } from "../../member-ctx";
import { MarketView } from "./_components/market-view";

type Props = { params: Promise<{ store: string }> };

/** The format preview's sample amount, in cents: a format example only, shown with the "Example" label. */
const SAMPLE_CENTS = 123_450;

/**
 * The formats preview, written once on the server (one instant, one ICU): formatting "now" again in the browser would
 * not match the server's text (hydration) as soon as the minute or the ICU data differ.
 */
function formatsPreview(storeLocale: string, market: string, currency: string, timeZone: string, now: Date) {
  const tag = `${storeLocale}-${market}`;
  const safe = (fn: () => string) => {
    try {
      return fn();
    } catch {
      return "";
    }
  };
  return {
    amount: safe(() => new Intl.NumberFormat(tag, { style: "currency", currency }).format(SAMPLE_CENTS / 100)),
    date: safe(() => new Intl.DateTimeFormat(tag, { dateStyle: "full", timeZone }).format(now)),
    time: safe(() => new Intl.DateTimeFormat(tag, { timeStyle: "short", timeZone }).format(now)),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { user } = await memberCtx((await params).store);
  return {
    title: t("shell.market.title", undefined, screenLocale(await viewerLocale(user), screenLocalesFor("/settings/market"))),
  };
}

/**
 * Settings → Market (P2 SHELL; platform.md PLA-§22.10.5), `settings.read`: the market and currency (Morocco and MAD,
 * fixed in R1, with the note), the number and date formats of the store's language and time zone as a preview, the
 * link to the time zone in General, and the order defaults the pages start from (the phone country, the default
 * delivery fee and line: the `defaults` key, through T4's `saveDefaultsAction`, sent with the store's own market,
 * currency and language so those stay as they are).
 */
export default async function MarketSettingsPage({ params }: Props) {
  const ctx = await requireStoreMember({
    handle: (await params).store,
    permission: "settings.read",
  });
  const d = await getStoreSetting(ctx.scope, "defaults", { fresh: true });
  const locale = ctx.store.defaultLocale === "ar" || ctx.store.defaultLocale === "fr" || ctx.store.defaultLocale === "en" ? ctx.store.defaultLocale : "fr";
  return (
    <MarketView
      market={ctx.store.market}
      currency={ctx.store.currency}
      storeLocale={locale}
      timeZone={ctx.store.timezone}
      preview={formatsPreview(locale, ctx.store.market, ctx.store.currency, ctx.store.timezone, new Date())}
      generalHref={appHref(ctx.store.handle, "/settings/general")}
      defaults={{
        phoneCountry: d.phoneCountry,
        shippingFeeCents: Math.round((d.shippingFee ?? 0) * 100),
        deliveryText: d.deliveryText,
      }}
      canWrite={ctx.can("settings.write")}
      save={saveDefaultsAction}
    />
  );
}
