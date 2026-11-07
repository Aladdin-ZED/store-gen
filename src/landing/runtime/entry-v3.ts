/**
 * Production entry of LP-16 product pages: the `landing-v3` chunk (core D75, §H.13; landing.md LAN-§5.2, LAN-§20.4),
 * written by the maintainer at the R2 contract step (C2-B2). A fork of ./entry.ts plus ONE zone lookup: the page charges
 * delivery by city, so the shown total (`[data-lp-sum]`, the submit button, payload `st`) adds the zone fee of the
 * chosen city instead of the flat page fee. It replaces the `landing` chunk on `runtime_v = 3` documents only (built
 * from ./addons/landing-v3.ts, the add-on name the asset build knows); ./entry.ts and every module it bundles stay
 * byte-identical (the frozen `landing` chunk and its sha256 pin are untouched).
 *
 *   config   #lp-config v3 = the v2 contract + `zones: ZoneTable` (src/landing/runtime/config.ts LandingRuntimeConfigV3);
 *            the v2 reader refuses it, so it is read here and handed to the shared core as the v2 shape it extends
 *   fee      `landingZoneFee({ zone: zoneFeeOfTable(zones, city), pageFeeCents, subtotalCents })`
 *            (src/lib/catalog/delivery.ts, the one rule the order API runs too): the city's zone fee, 0 above the
 *            zone's free threshold, the page fee for a city without a zone fee (or a not-served city, LD6); offers
 *            with free delivery stay free (`computeTotals` already reads `offer.free`)
 *   when     at boot, on every change of the form's `city` field, on every selection change (`units`, `bundle`):
 *            the fee is written to the instance's own config (`shippingFee`, the field `computeTotals` reads) and a
 *            `units` event re-renders the sums when it moved
 *
 * The payload keeps the v2 shape (`v: 2`, `city` present); the server re-prices with the version's runtime_v = 3
 * (src/lib/orders/create.ts through `landingShippingZone`), so the total shown is the total charged.
 */
import { accordion } from "./accordion";
import { analytics } from "./analytics";
import { bundles } from "./bundles";
import { compare } from "./compare";
import type { LandingRuntimeConfig, LandingRuntimeConfigV3 } from "./config";
import type { Ctx } from "./core";
import { getForm } from "./core";
import { countdown } from "./countdown";
import { form } from "./form";
import { gallery } from "./gallery";
import { start, type Modules } from "./init";
import { lead } from "./lead";
import { marquee } from "./marquee";
import { computeTotals } from "./money";
import { orderScroll } from "./order-scroll";
import { parallax } from "./parallax";
import { reveal } from "./reveal";
import { sticky } from "./sticky";
import { tabs } from "./tabs";
import { units } from "./units";
import { video } from "./video";
import { landingZoneFee, zoneFeeOfTable } from "../../lib/catalog/delivery";

/** The v3 config as the shared core reads it (the v2 fields), with the zone table and the page's own fee kept aside. */
type V3 = LandingRuntimeConfig & { zones: LandingRuntimeConfigV3["zones"]; pageFee: number };

/** #lp-config v3, checked like the v2 reader checks v2 (init.ts readConfig), or null: the page then stays static. */
function readConfigV3(doc: Document): V3 | null {
  try {
    const el = doc.getElementById("lp-config");
    const c = el ? (JSON.parse(el.textContent || "null") as (Omit<LandingRuntimeConfigV3, "v"> & { v: unknown }) | null) : null;
    if (
      !c ||
      c.v !== 3 ||
      !c.zones ||
      !Array.isArray(c.zones.zones) ||
      !c.zones.city ||
      typeof c.pageKey !== "string" ||
      !c.endpoints ||
      typeof c.endpoints.order !== "string" ||
      !Array.isArray(c.bundles) ||
      !Array.isArray(c.items) ||
      !c.money ||
      !c.phone ||
      typeof c.phone.national !== "string"
    )
      return null;
    // no defaults to fill in: v3 exists only from the R2 renderer, which writes every field (buildRuntimeConfig)
    const pageFee = typeof c.shippingFee === "number" ? c.shippingFee : 0;
    return { ...(c as unknown as LandingRuntimeConfig), v: 2, zones: c.zones, pageFee };
  } catch {
    return null;
  }
}

/** The one zone lookup: the delivery fee of the chosen city, written where `computeTotals` reads it. */
function zoneFee(c: Ctx): void {
  const cfg = c.cfg as V3;
  if (!cfg.zones || typeof cfg.pageFee !== "number") return;
  const formEl = getForm(c);
  const cityOf = (): string => {
    const f = formEl ? (formEl.elements.namedItem("city") as HTMLInputElement | HTMLSelectElement | null) : null;
    return f && typeof f.value === "string" ? f.value.trim() : "";
  };
  const apply = () => {
    const t = computeTotals(cfg, c.st.sel());
    const fee = landingZoneFee({ zone: zoneFeeOfTable(cfg.zones, cityOf()), pageFeeCents: cfg.pageFee, subtotalCents: t ? t.subtotal : 0, allLinesFree: false });
    if (fee === cfg.shippingFee) return;
    cfg.shippingFee = fee;
    c.emit("units", null);
  };
  if (formEl) {
    const onCity = (e: Event) => {
      const el = e.target as { name?: string } | null;
      if (el && el.name === "city") apply();
    };
    c.on(formEl, "change", onCity);
    c.on(formEl, "input", onCity);
  }
  c.sub("units", apply);
  c.sub("bundle", apply);
  apply();
}

/** Boot like init.ts `boot`, from the v3 config. */
function bootV3(modules: Modules): void {
  const doc = document;
  const html = doc.documentElement;
  html.classList.add("lp-js");
  const go = () => {
    const config = readConfigV3(doc);
    if (!config) {
      html.classList.remove("lp-js");
      return;
    }
    try {
      start({ doc, win: window, config }, modules);
    } catch {
      html.classList.remove("lp-js");
    }
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
}

// Order matters: the zone fee first (it sets the fee the sums read), then bundles → units → form → lead as entry.ts.
bootV3({
  once: [analytics],
  bind: [zoneFee, reveal, parallax, marquee, video, gallery, compare, tabs, accordion, bundles, units, form, lead, orderScroll, sticky, countdown],
  reveal,
});
