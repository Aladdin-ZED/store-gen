import type { Metadata } from "next";
import { DeliveryEditor, type DeliveryEditorData } from "@/components/admin/delivery/delivery-editor";
import { localParts } from "@/lib/delivery/eta";
import { confirmationLeadSuggestion } from "@/lib/delivery/lead.server";
import { citiesOfMarket, listZones } from "@/lib/delivery/zones.server";
import { shopperLocaleOf } from "@/lib/landing/copy";
import { moneySpec } from "@/lib/markets/money";
import { OTHER_CITY } from "@/lib/markets/cities-ma";
import { cityKey } from "@/lib/orders/address";
import { errorSummary } from "@/lib/orders/log";
import { getStoreSettings } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import {
  addFixedHolidaysAction,
  applyLeadSuggestionAction,
  markHolidaysReviewedAction,
  saveCalendarAction,
  saveTypicalDaysAction,
  saveZonesAction,
  setLineOnLandingAction,
  setZonesEnabledAction,
} from "./actions";

export const metadata: Metadata = { title: "Delivery zones" };

type Params = Promise<{ store: string }>;

const DEFAULT_TZ = "Africa/Casablanca";

/**
 * Settings → Delivery zones (landing.md LAN-§7.3; `settings.read`, edits `checkout.write`): the zones, the cities, the
 * calendar and the live line of a shopper's city, all read through the store scope. Markets without a city list get
 * the typical-days field of `policies.delivery` instead of zones.
 */
export default async function DeliverySettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const { scope, store } = ctx;
  const [zones, settings, suggestion] = await Promise.all([
    listZones(scope),
    getStoreSettings(scope, ["checkout", "policies", "defaults", "store"]),
    confirmationLeadSuggestion(scope).catch((err: unknown) => {
      console.error("[delivery] lead suggestion unavailable:", errorSummary(err));
      return null;
    }),
  ]);
  const { checkout, policies, defaults, store: contacts } = settings;
  const tz = store.timezone || DEFAULT_TZ;
  const pageLocale = shopperLocaleOf(defaults.locales[0] ?? store.defaultLocale);
  const list = citiesOfMarket(store.market);
  const cities = (list ?? [])
    .filter((c) => c.value !== OTHER_CITY.value)
    .flatMap((c) => {
      const key = cityKey(c.value);
      return key ? [{ key, value: c.value, fr: c.fr, ar: c.ar, ...(c.en ? { en: c.en } : {}), major: !!c.major }] : [];
    });
  const data: DeliveryEditorData = {
    canWrite: ctx.can("checkout.write"),
    canWritePolicies: ctx.can("settings.write"),
    market: store.market,
    hasCityList: cities.length > 0,
    zones,
    cities,
    checkout: {
      zonesEnabled: checkout.zonesEnabled,
      lineOnLanding: checkout.lineOnLanding,
      confirmationCall: checkout.confirmationCall,
      notServedWhatsapp: checkout.notServed.whatsapp,
      calendar: checkout.calendar,
    },
    tz,
    today: localParts(new Date(), tz)?.ymd ?? new Date().toISOString().slice(0, 10),
    suggestion,
    pageLocale,
    currency: store.currency,
    moneyLocale: moneySpec(store.currency || "MAD", pageLocale).locale,
    pageFee: defaults.shippingFee,
    whatsapp: (contacts.whatsapp ?? "").replace(/\D/g, "") || null,
    typicalDays: policies.delivery.typicalDays,
  };
  return (
    <DeliveryEditor
      data={data}
      actions={{
        saveZones: saveZonesAction,
        saveCalendar: saveCalendarAction,
        addFixedHolidays: addFixedHolidaysAction,
        markHolidaysReviewed: markHolidaysReviewedAction,
        applyLeadSuggestion: applyLeadSuggestionAction,
        setZonesEnabled: setZonesEnabledAction,
        setLineOnLanding: setLineOnLandingAction,
        saveTypicalDays: saveTypicalDaysAction,
      }}
    />
  );
}
