/**
 * What a store document embeds of the runtime add-ons (P3 LANDING; landing.md LAN-§5.1-§5.3, §7.4, §8.1-§8.3;
 * docs/STORE-SAAS.md §H.13, D54, D62, D73). Pure: `addonsFor(input)` reads only its input (the loader,
 * ./load.server.ts, gathers it through the store scope) and answers the `RenderAddons` of one document.
 *
 * The "when" column of LAN-§5.2:
 *   assist     (landing)   the delivery line (zones on, the line on, ≥ 1 zone with days or not served, an order form),
 *                          or the idem capture the thank-you needs (its tracking link or its confirm pill on, live and
 *                          test documents only: the idem is what proves the order to /track and to the intent beacon),
 *                          or Order on WhatsApp (LP-11, `wo`: `landing.waOrder.enabled`, a WhatsApp number and the
 *                          form's WhatsApp link; the intent API on live documents only, the "works on the live page"
 *                          note in the preview, nothing in test documents and exports)
 *   assist-ty  (thanks)    any `landing.thankYou` block on with its data: the confirm pill (a WhatsApp number and the
 *                          template), the expectation (the caller phone), the tracking link (a document with /track)
 * and the mode matrix of LAN-§5.3:
 *   live, test             everything; test adds `banner: "test"` (the WhatsApp order, LP-11, is never offered in test)
 *   preview                the line (offline), the thank-you blocks with the sample order `CMD-PREVIEW`, no beacon
 *   export-static|php|whatsapp   the delivery line only; the confirm pill and the expectation, no tracking link
 *   export-connected       the same plus the tracking link, absolute (`storeUrl(store, "/track")`)
 * A document with every add-on off answers `noAddons()`, so it keeps today's bytes.
 *
 * The calling window (rev 5, CRIT2-1): `expect.win` is baked only when the owner saved it (`shopperPromiseAllowed`)
 * and it opens within 14 store days (`!windowIsEmpty`); it is operations' `EffectiveWindow` unchanged (its own field
 * names, its own `days`), with `openOverrideUntil` null (an "Open calls now" never lives in static HTML), the closed
 * dates of the next 60 days and the overrides not yet ended (≤ 4). The browser evaluates it at the shopper's `now`.
 */
import type { z } from "zod";
import { shopperPromiseAllowed, type EffectiveWindow } from "@/lib/callcenter/window";
import { localParts } from "@/lib/delivery/eta";
import type { ZoneTable } from "@/lib/delivery/types";
import { fmtCents } from "@/landing/runtime/money";
import { DZ, plural, shopperLocaleOf, TY, WA, type DzCopy, type ShopperLocale } from "@/lib/landing/copy";
import { windowIsEmpty, type WhenWords } from "@/lib/landing/hours";
import { OTHER_CITY } from "@/lib/markets/cities-ma";
import { moneyFormat } from "@/lib/markets/info";
import { toCents } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { whatsappDigits, whatsappNumber } from "@/lib/render/config";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import type { LandingSetting } from "@/lib/settings/keys/landing";
import type { StoreConfirmation } from "@/lib/settings/keys/store";
import { WA_API } from "@/lib/wa-order/contract";
import type { AddonMode } from "./load.server";
import { noAddons, type RenderAddons } from "./types";

export type AddonPage = "landing" | "thanks" | "track";

export interface AddonInput {
  page: AddonPage;
  mode: AddonMode;
  doc: PageDoc;
  store: { handle: string; timezone: string };
  settings: {
    checkout: CheckoutSetting;
    landing: LandingSetting;
    confirmation: z.output<typeof StoreConfirmation>;
    /** the store's WhatsApp contact as typed (`store.whatsapp`) */
    whatsapp?: string;
  };
  /** `zonesForCheckout(scope)`, unchanged; null when the line is off (not read) */
  table: ZoneTable | null;
  /** `callingWindowFor(scope)`; null when not read (no expectation) */
  window: EffectiveWindow | null;
  /** the owner's (or the default) `customer_confirm` text in the page language; absent when the pill is off */
  templates: { customer_confirm?: string };
  /** `storePath(store, "/track")`, or the absolute `storeUrl` in a connected export */
  links: { trackBase: string };
  /** the render time: the window is baked only when it opens within 14 days of it */
  now: Date;
}

/** The `lp-assist` data block (LAN-§7.4): the value-keyed zone table and the page's words; `k` = capture the idem. */
export interface AssistData {
  v: 1;
  /** `zonesForCheckout`'s `ZoneTable` unchanged (the line is on) */
  dz?: ZoneTable;
  /** the page language's delivery words (the chunk bundles no copy of its own) */
  s?: Partial<DzCopy>;
  /** the language of the month and weekday names */
  l?: ShopperLocale;
  /** the "Autre" option's posted value */
  o?: string;
  /** the store confirms by phone: dated lines add "après confirmation par téléphone" */
  c?: 1;
  /** the page's delivery fee formatted with its money format, as `#lp-config` would print it (absent when 0) */
  f?: string;
  /** wa.me digits of the not-served button (`checkout.notServed.whatsapp` and a number) */
  wa?: string;
  /** write the attempt's idem on `lp:order` (sessionStorage `lp:<h>:idem:<pageKey>`) */
  k?: 1;
  /** Order on WhatsApp (LAN-§11): live, the intent API and the `wa.ready` line; preview, the `wa.liveOnly` note */
  wo?: { e: string; r: string } | { n: string };
}

/** `lp-assist-ty.expect.win`: operations' window as JSON, never with a live "Open calls now" (LAN-§8.2). */
export type SerializedWindow = Omit<EffectiveWindow, "openOverrideUntil"> & { openOverrideUntil: null };

/** The `lp-assist-ty` data block (LAN-§8.2). */
export interface AssistTyData {
  v: 1;
  /** the store handle and time zone */
  h: string;
  tz: string;
  /** wa.me digits and the `customer_confirm` template of the page language ({order_id} {offer} {total} {name}) */
  confirm?: { wa: string; tpl: string };
  expect?: {
    /** the caller phone in display format (rendered in an LTR isolate) */
    phone: string;
    win?: SerializedWindow;
    /** `line` (with `{when}`) and the `{when}` words come with `win` only */
    s: { plain: string; save: string; line?: string } & Partial<WhenWords>;
  };
  track?: { base: string };
  /** the intent beacon's API (live and test documents on a store host) */
  ep?: string;
}

/** The public tracking API (relative: every host a store owns serves it). */
export const TRACK_API = "/api/public/track";

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** A Moroccan E.164 as people write it ("+212661234567" → "06 61 23 45 67"); any other number as stored. */
export function displayPhone(e164: string): string {
  const m = /^\+212(\d{9})$/.exec(e164);
  return m ? `0${m[1]}`.replace(/(\d{2})(?=\d)/g, "$1 ") : e164;
}

/**
 * The window baked into a thank-you page (LAN-§8.2 rev 4): unchanged but for `openOverrideUntil` (null), the closed
 * dates of the next 60 store days and the overrides that have not ended (at most 4).
 */
export function serializeWindow(w: EffectiveWindow, now: Date): SerializedWindow {
  const today = localParts(now, w.tz)?.ymd ?? "0000-00-00";
  const end = today === "0000-00-00" ? "9999-12-31" : addDays(today, 60);
  return {
    tz: w.tz,
    days: w.days,
    closedDates: w.closedDates.filter((d) => d >= today && d < end).slice(0, 60),
    overrides: w.overrides.filter((o) => o.to >= today).slice(0, 4),
    openOverrideUntil: null,
    configured: w.configured,
  };
}

const live = (mode: AddonMode) => mode === "live" || mode === "test";

/** The confirm pill's number: the confirmation WhatsApp, else the store's WhatsApp (LAN-§8.4). */
function confirmNumber(i: AddonInput): string | null {
  return i.settings.confirmation.whatsapp ?? whatsappDigits(i.settings.whatsapp, i.doc.form.phoneCountry);
}

/** The `lp-assist` block of a landing document, or null (no `assist` chunk). */
export function assistData(i: AddonInput): AssistData | null {
  if (!i.doc.sections.some((s) => s.type === "orderForm")) return null;
  const { checkout, landing } = i.settings;
  const t = i.table;
  const line = !!t && checkout.zonesEnabled && checkout.lineOnLanding && t.zones.some((z) => z.ns || !!z.d);
  const ty = landing.thankYou;
  const k = live(i.mode) && (ty.trackLink || (ty.confirmWhatsapp && !!confirmNumber(i) && !!i.templates.customer_confirm));
  const wo = waOrderData(i);
  if (!line && !k && !wo) return null;
  const out: AssistData = { v: 1 };
  if (line && t) {
    const l = shopperLocaleOf(i.doc.locale);
    const ns = t.zones.some((z) => z.ns);
    const wa = ns && checkout.notServed.whatsapp ? whatsappNumber(i.doc, i.settings.whatsapp) : null;
    const s: Partial<DzCopy> = { ...DZ[l] };
    if (!ns) for (const key of ["notServed", "notServedOther", "notServedCta", "notServedText", "notServedTextOther"] as const) delete s[key];
    if (!checkout.confirmationCall) delete s.afterCall;
    const fee = toCents(i.doc.offers.shippingFee);
    const f = fee > 0 ? fmtCents(fee, moneyFormat(i.doc.currency, i.doc.locale)) : null;
    Object.assign(out, { dz: t, s, l, o: OTHER_CITY.value }, checkout.confirmationCall ? { c: 1 } : {}, f ? { f } : {}, wa ? { wa } : {});
  }
  if (k) out.k = 1;
  if (wo) out.wo = wo;
  return out;
}

/**
 * Order on WhatsApp (LAN-§11.1, §5.3): the form shows its WhatsApp link (`WhatsAppAlt`: not turned off, a number) and
 * the store turned the intent on. Live documents get the API and the ready line; the preview gets the note; test
 * documents and exports keep today's plain link.
 */
function waOrderData(i: AddonInput): AssistData["wo"] | null {
  const fw = i.doc.form.whatsapp;
  if (!i.settings.landing.waOrder.enabled || (fw && !fw.enabled) || !whatsappNumber(i.doc, i.settings.whatsapp)) return null;
  const c = WA[shopperLocaleOf(i.doc.locale)];
  if (i.mode === "live") return { e: WA_API, r: c.ready };
  if (i.mode === "preview") return { n: c.liveOnly };
  return null;
}

/** The `lp-assist-ty` block of a thank-you document, or null (no `assist-ty` chunk). */
export function assistTyData(i: AddonInput): AssistTyData | null {
  const ty = i.settings.landing.thankYou;
  const l = shopperLocaleOf(i.doc.locale);
  const c = TY[l];
  const out: AssistTyData = { v: 1, h: i.store.handle, tz: i.store.timezone };
  const wa = ty.confirmWhatsapp ? confirmNumber(i) : null;
  if (wa && i.templates.customer_confirm) out.confirm = { wa, tpl: i.templates.customer_confirm };
  const phone = ty.expectation ? i.settings.confirmation.callerPhone : undefined;
  if (phone) {
    const w = i.window;
    const bake = !!w && shopperPromiseAllowed(w) && !windowIsEmpty(w, i.now);
    const hours = i.settings.confirmation.withinHours;
    out.expect = {
      phone: displayPhone(phone),
      ...(bake && w ? { win: serializeWindow(w, i.now) } : {}),
      s: {
        plain: c.expectPlain,
        save: c.expectSave,
        ...(bake
          ? { line: c.expect, within: hours ? plural(c.whenWithin, hours, l) : c.whenNow, laterToday: c.whenToday, tomorrow: c.whenTomorrow, nextDay: c.whenDay }
          : {}),
      },
    };
  }
  const trackable = live(i.mode) || i.mode === "preview" || i.mode === "export-connected";
  if (ty.trackLink && trackable && i.links.trackBase) out.track = { base: i.links.trackBase };
  if (out.confirm && live(i.mode)) out.ep = TRACK_API;
  return out.confirm || out.expect || out.track ? out : null;
}

export function addonsFor(input: AddonInput): RenderAddons {
  const out = noAddons();
  if (input.page === "track") return { ...out, body: ["track"], css: ["track"] };
  if (input.page === "landing") {
    const a = assistData(input);
    if (a) {
      out.body.push("assist");
      out.css.push("assist");
      out.data["lp-assist"] = a;
    }
  } else {
    const t = assistTyData(input);
    if (t) {
      out.body.push("assist-ty");
      out.css.push("assist-ty");
      out.data["lp-assist-ty"] = t;
    }
  }
  if (input.mode === "test") out.banner = "test";
  return out;
}
