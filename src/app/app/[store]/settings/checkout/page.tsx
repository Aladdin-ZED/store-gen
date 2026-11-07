import type { Metadata } from "next";
import { AfterOrderCard, CheckoutOptionsCard, type AfterOrderData } from "@/components/admin/landing/after-order-card";
import { viewerLocale } from "@/lib/auth/locale";
import { shopperPromiseAllowed } from "@/lib/callcenter/window";
import { callingWindowFor } from "@/lib/callcenter/window.server";
import { shopperLocaleOf } from "@/lib/landing/copy";
import { weekHoursText, windowIsEmpty } from "@/lib/landing/hours";
import { DEFAULT_TEMPLATES } from "@/lib/landing/templates";
import { ownTemplates } from "@/lib/landing/templates.server";
import { EU_LEAD_MARKETS } from "@/lib/landing/lead-capture";
import { moneySpec } from "@/lib/markets/money";
import { getStoreSettings } from "@/lib/settings";
import { requireStoreMember } from "@/lib/tenancy/seam";
import { appHref } from "@/lib/urls";
import {
  saveCheckoutOptionsAction,
  saveConfirmationAction,
  saveConfirmTemplateAction,
  saveLandingOptionsAction,
  saveThankYouAction,
} from "./actions";

export const metadata: Metadata = { title: "After the order" };

type Params = Promise<{ store: string }>;

/**
 * Settings → Checkout & delivery → "After the order" (landing.md LAN-§8.4; `settings.read`, edits `settings.write`)
 * and the checkout options (`checkout.write`). The calling window is read through operations' `callingWindowFor`;
 * the phone preview computes `{when}` with the same `nextCallableAt` as the page, and none until the owner confirmed
 * the window (`shopperPromiseAllowed`).
 */
export default async function CheckoutSettingsPage({ params }: { params: Params }) {
  const ctx = await requireStoreMember({ handle: (await params).store, permission: "settings.read" });
  const { scope, store } = ctx;
  const [settings, window, templates, locale] = await Promise.all([
    getStoreSettings(scope, ["landing", "checkout", "store", "defaults"]),
    callingWindowFor(scope),
    ownTemplates(scope, "customer_confirm"),
    viewerLocale(ctx.user),
  ]);
  const { landing, checkout, store: contacts, defaults } = settings;
  const now = new Date();
  const pageLocale = shopperLocaleOf(defaults.locales[0] ?? store.defaultLocale);
  const dateLocale = moneySpec(store.currency || "MAD", locale).locale;
  const data: AfterOrderData = {
    canWrite: ctx.can("settings.write"),
    canWriteCheckout: ctx.can("checkout.write"),
    storeName: store.name,
    market: store.market,
    euMarket: EU_LEAD_MARKETS.includes(store.market.toUpperCase()),
    pageLocale,
    thankYou: landing.thankYou,
    confirmation: {
      callerPhone: contacts.confirmation.callerPhone ?? null,
      whatsapp: contacts.confirmation.whatsapp ?? null,
      withinHours: contacts.confirmation.withinHours ?? null,
    },
    storeWhatsapp: contacts.whatsapp ? contacts.whatsapp.replace(/\D/g, "") : null,
    window,
    windowConfirmed: shopperPromiseAllowed(window),
    windowClosed: windowIsEmpty(window, now),
    hoursLine: weekHoursText(window, locale, dateLocale, now),
    callcenterHref: appHref(store.handle, "/team/callcenter"),
    templates,
    defaults: DEFAULT_TEMPLATES.customer_confirm,
    checkout: {
      addressMode: checkout.addressMode,
      newPageForm: checkout.newPageForm,
      notServedWhatsapp: checkout.notServed.whatsapp,
      confirmationCall: checkout.confirmationCall,
    },
    landing: { leadsCapture: landing.leads.capture, trackingRequests: landing.tracking.requests, waOrder: landing.waOrder.enabled },
  };
  return (
    <>
      <AfterOrderCard data={data} actions={{ saveThankYou: saveThankYouAction, saveConfirmation: saveConfirmationAction, saveTemplate: saveConfirmTemplateAction }} />
      <CheckoutOptionsCard data={data} actions={{ saveCheckout: saveCheckoutOptionsAction, saveLanding: saveLandingOptionsAction }} />
    </>
  );
}
