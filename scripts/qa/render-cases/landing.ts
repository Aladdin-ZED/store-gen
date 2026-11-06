// proves: LP-01, LP-03, LP-04, LAN-§3.5, LAN-§3.6, LAN-§3.9, LAN-§6.3, LAN-§7.5, LAN-§8.6
/**
 * render-check cases of the landing track (P3 LANDING, landing.md).
 * Extension file (docs/STORE-SAAS.md §J.1 `render-check`, §K.3; ENGP-12), created empty at P0 and imported by
 * scripts/qa/render-check.ts; import only types from the harness (it runs at load).
 *
 * What wave 1 proves here (LAN-§25.1 render-check bullets):
 *  1. the order form contract on the four variants (OF1-OF13 as markup): one `button[type=submit][data-lp-submit]`,
 *     the WhatsApp alternative a text link, no kicker, at most 4 reveals, 0 glass (markup and the form's CSS), no
 *     trust 3-up, no upsell in the form, the COD line once in the form (`codLineFor`), the phone and city controls,
 *     `enterkeyhint`, the two delivery slots, no one-value picker shown, the bump a row without a picture, no
 *     `[data-countdown]` and no `.lp-trust` inside the form (the page's own count is the doc's: reported as a note);
 *  2. the delivery line: zones empty (no `lp-assist`, both slots empty and hidden), zones on (the chunk and its data
 *     block, the general line as the server fallback), the line's fee equal to the charged fee on every offer of `duo`
 *     and `tshirt` (a free offer included), the `lp-assist.dz.city` key set equal to `MA_CITIES` minus `OTHER_CITY`;
 *  3. the address follows the store's address mode (required: one line; optional: behind the disclosure);
 *  4. the urgency chip only from typed stock or a future end date;
 *  5. the thank-you: the four `confirmationCall × inspection` timelines in ar / fr / en (verbs, never numbers), the
 *     tint (0 aurora, 0 grain, 0 glass), at most 8 reveals, one primary action, the recap a <dl>, the id and the total
 *     in LTR isolates; the add-on slots only when their block is on;
 *  6. the legal pages: the tint, no `var(--lp-aurora` in their CSS;
 *  7. "Report this store": exactly one link on the thank-you, every legal kind and the tracking page (ar, fr), none in
 *     an export, no `?o=`, `s=`, `sg-test` or `#` in any report href; no aggregateRating on the thank-you;
 *  8. the test render: the band, no pixel; byte identity with every add-on off (landing and thank-you).
 * Pending a CCR, not here yet: the `assist` / `assist-ty` budgets and the page caps (r1-p3-9, re-measured by the
 * maintainer), `?sg-test=` unsigned (a route case: test:store), the hero's COD line (after P6 merges).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addonsFor, type AddonInput, type AssistData } from "@/landing/addons/plan";
import type { ShopperFacts } from "@/landing/addons/facts";
import { noAddons, type RenderAddons } from "@/landing/addons/types";
import { createRenderContext, exportLinks, LEGAL_KINDS, type LandingRenderContext } from "@/landing/context";
import { addonChunks, runtimeChunks } from "@/landing/generated/assets";
import { getSection } from "@/landing/registry";
import { fmtCents } from "@/landing/runtime/money";
import type { LandingRuntimeConfig } from "@/landing/runtime/config";
import { codLineFor } from "@/landing/sections/orderForm/cod";
import { uiLabels } from "@/landing/sections/orderForm/copy";
import { ThankYouBody } from "@/landing/thankyou/ThankYou";
import { buildZoneTable } from "@/lib/delivery/table";
import type { DeliveryZoneRow, StoreCalendar } from "@/lib/delivery/types";
import { TRK, TY } from "@/lib/landing/copy";
import { defaultTemplate } from "@/lib/landing/templates";
import { MA_CITIES, OTHER_CITY } from "@/lib/markets/cities-ma";
import { moneyFormat } from "@/lib/markets/info";
import { fixtureAssets, type FixtureName } from "@/lib/page/fixtures";
import { emptySelection, orderTotals } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { renderLandingHtml, renderLegalHtml, renderThankYouHtml } from "@/lib/render/core";
import { CheckoutSetting } from "@/lib/settings/keys/checkout";
import { LandingSetting } from "@/lib/settings/keys/landing";
import { TrackDocument } from "@/lib/tracking/document";
import type { RenderCase, RenderKit } from "../render-check";

const ROOT = join(__dirname, "..", "..", "..");
const VARIANTS = ["card", "split", "minimal", "bold"] as const;
const PLATFORM_REPORT = /href="(https:\/\/platform\.example\/report\/qa-store[^"]*)"/g;
const ENDPOINTS = { order: "/api/public/order", lead: "/api/public/lead", event: "/api/public/event", upsell: "/api/public/upsell" };

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
/** The markup without its <style> and <script> elements (the DOM a shopper gets). */
const bodyOf = (html: string) => html.replace(/<style\b[\s\S]*?<\/style>/g, "").replace(/<script\b[\s\S]*?<\/script>/g, "");
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** The visible words: tags dropped, entities decoded, typographic quotes and no-break spaces folded (RichText sets them). */
const fold = (s: string) => s.replace(/[‘’]/g, "'").replace(/[  ]/g, " ").replace(/⁠/g, "");
const textOf = (html: string) => fold(decode(html.replace(/<[^>]+>/g, "")));
/** One class token in a class attribute (not a BEM child such as `lp-trust__item` or `lp-trust-row`). */
const classToken = (token: string) => new RegExp(`class="(?:[^"]*\\s)?${token}(?:\\s[^"]*)?"`, "g");

/** The order form section's markup: from its root to the next section root (or the end of <main>). */
function formSection(html: string): string {
  const body = bodyOf(html);
  const at = body.indexOf('data-section="orderForm"');
  if (at < 0) return "";
  const start = body.lastIndexOf("<", at);
  const next = body.slice(at + 10).search(/<[a-z]+\b[^>]*\sdata-section="/);
  const end = next < 0 ? body.indexOf("</main>", at) : at + 10 + next;
  return body.slice(start, end < 0 ? undefined : end);
}

function docOf(kit: RenderKit, name: FixtureName, locale: "ar" | "fr" | "en", edit?: (d: PageDoc) => PageDoc): PageDoc | null {
  const fx = kit.getFixture(name, { now: kit.now, locale });
  const raw = edit ? edit(JSON.parse(JSON.stringify(fx.doc)) as PageDoc) : fx.doc;
  const { doc, issues } = validateDoc(raw);
  if (!doc) kit.fail(`${name}/${locale}: invalid doc ${JSON.stringify(issues.slice(0, 2))}`);
  return doc;
}

const withVariant = (v: string) => (d: PageDoc): PageDoc => ({ ...d, sections: d.sections.map((s) => (s.type === "orderForm" ? { ...s, variant: v } : s)) });

/** A render context of the live store page, plus the two fields of CCR r1-p3-10 (add-ons, store facts). */
function ctxOf(kit: RenderKit, name: FixtureName, doc: PageDoc, extra: { addons?: RenderAddons; shopper?: ShopperFacts } = {}): LandingRenderContext {
  const fx = kit.getFixture(name, { now: kit.now, locale: doc.locale as "ar" | "fr" | "en" });
  const o = kit.liveOptions(name, fx);
  return { ...createRenderContext(doc, { mode: o.mode, assets: o.assets, base: "/", now: o.now, pageKey: o.pageKey, store: o.store, links: o.links }), ...extra };
}

/** The order form rendered alone over a given context (the section's own render, as the page renders it). */
function renderForm(ctx: LandingRenderContext, doc: PageDoc): string {
  const sec = doc.sections.find((s) => s.type === "orderForm")!;
  const def = getSection("orderForm")!;
  const el = def.render({ id: sec.id, variant: sec.variant, bg: sec.bg, data: def.schema.parse(sec.data), ctx, index: 0 }) as ReactElement | null;
  return el ? renderToStaticMarkup(el) : "";
}

const thanksBody = (doc: PageDoc, ctx: LandingRenderContext) => renderToStaticMarkup(createElement(ThankYouBody, { doc, ctx, landingUrl: "/s/qa-store/x" }));

let seq = 0;
const zone = (name: string, cities: string[], o: Partial<DeliveryZoneRow> = {}): DeliveryZoneRow => ({
  id: `Z${String(++seq).padStart(25, "0")}`,
  name,
  cities: cities as DeliveryZoneRow["cities"],
  feeCents: null,
  freeFromCents: null,
  etaMinDays: null,
  etaMaxDays: null,
  notServed: false,
  note: null,
  position: seq,
  ...o,
});
const CAL: StoreCalendar = { tz: "Africa/Casablanca", workdays: [1, 2, 3, 4, 5, 6], cutoffHour: 14, holidays: [], leadDays: 1 };
const ZONES = [zone("Casablanca", ["casablanca", "mohammedia"], { etaMinDays: 1, etaMaxDays: 2 }), zone("Nord", ["tanger"], { notServed: true }), zone("Reste", ["*"], { etaMinDays: 2, etaMaxDays: 4 })];
const TABLE = buildZoneTable(ZONES, CAL, MA_CITIES);

/** The add-on input of a store whose zones and thank-you blocks are on (the same shape the loader builds). */
function addonInput(doc: PageDoc, page: AddonInput["page"], o: { zones?: boolean; blocks?: boolean } = {}): AddonInput {
  const on = o.blocks ?? true;
  return {
    page,
    mode: "live",
    doc,
    store: { handle: "qa-store", timezone: "Africa/Casablanca" },
    settings: {
      checkout: CheckoutSetting.parse({ zonesEnabled: o.zones ?? true, lineOnLanding: true, confirmationCall: true }),
      landing: LandingSetting.parse({ thankYou: { confirmWhatsapp: on, expectation: on, trackLink: on } }),
      confirmation: { callerPhone: "+212661234567", whatsapp: "212661234567" },
      whatsapp: "+212 6 61 00 00 00",
    },
    table: o.zones === false ? null : TABLE,
    window: null,
    templates: { customer_confirm: defaultTemplate("customer_confirm", doc.locale) },
    links: { trackBase: "/s/qa-store/track" },
    now: new Date("2026-10-07T12:00:00.000Z"),
  };
}

const css = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const formCss = () =>
  readdirSync(join(ROOT, "src/landing/sections/orderForm"))
    .filter((f) => f.endsWith(".css"))
    .map((f) => [f, css(`src/landing/sections/orderForm/${f}`)] as const);

/** Report hrefs of a document; each must name the platform's /report/<h> and carry no order id, proof, token or fragment. */
function reportHrefs(kit: RenderKit, tag: string, html: string, want: number): void {
  const hrefs = [...html.matchAll(PLATFORM_REPORT)].map((m) => decode(m[1]!));
  if (hrefs.length !== want) kit.fail(`${tag}: ${hrefs.length} report links, expected ${want}`);
  for (const h of hrefs) if (/[?&]o=|[?&]s=|sg-test|#/.test(decodeURIComponent(h))) kit.fail(`${tag}: report href carries a query it must not: ${h}`);
  if (want === 0 && /\/report\/|lp-report/.test(bodyOf(html))) kit.fail(`${tag}: an export carries a report link`);
}

/* ------------------------------------------------------------------ */
/* cases                                                               */
/* ------------------------------------------------------------------ */

export const cases: RenderCase[] = [
  {
    name: "order form contract per variant (OF1-OF13 markup, LAN-§3.5)",
    async run(kit) {
      for (const [f, text] of formCss()) if (/backdrop-filter/.test(text)) kit.fail(`orderForm/${f}: backdrop-filter in the form's CSS (OF8)`);
      for (const name of kit.fixtures) {
        for (const locale of ["ar", "fr"] as const) {
          for (const v of VARIANTS) {
            const doc = docOf(kit, name, locale, withVariant(v));
            if (!doc) continue;
            const tag = `${name}/${locale}/${v}`;
            const html = (await renderLandingHtml(doc, kit.liveOptions(name, kit.getFixture(name, { now: kit.now, locale })))).html;
            const sec = formSection(html);
            if (!sec) {
              kit.fail(`${tag}: no order form section`);
              continue;
            }
            const form = /<form\b[^>]*id="order-form"[\s\S]*?<\/form>/.exec(sec)?.[0] ?? "";
            const submits = sec.match(/<button\b[^>]*type="submit"[^>]*>/g) ?? [];
            if (submits.length !== 1 || !submits[0]!.includes("data-lp-submit")) kit.fail(`${tag}: ${submits.length} submit buttons, expected exactly one [data-lp-submit] (OF5)`);
            const alt = /<div class="lp-of__alt">([\s\S]*?)<\/div>/.exec(sec)?.[1];
            if (alt && /lp-btn/.test(alt)) kit.fail(`${tag}: the WhatsApp alternative is a .lp-btn (OF5)`);
            if (/lp-kicker/.test(sec)) kit.fail(`${tag}: a kicker on the form (OF8, LD34)`);
            const reveals = count(sec, /\sdata-reveal="/g);
            if (reveals > 4) kit.fail(`${tag}: ${reveals} reveals in the form, at most 4 (OF8)`);
            if (/\blp-glass\b/.test(sec)) kit.fail(`${tag}: glass in the form (OF8)`);
            if (/lp-of__trust|class="[^"]*\blp-trust\b/.test(sec)) kit.fail(`${tag}: a trust row inside the form (OF10)`);
            if (/lp-upsell/.test(form)) kit.fail(`${tag}: an upsell inside #order-form (OF6)`);
            if (/lp-field--float|lp-form--line/.test(sec)) kit.fail(`${tag}: underline-only or floating fields (OF4, OF13)`);
            if (/<picture\b|lp-bump__pic/.test(/<label class="lp-bump"[\s\S]*?<\/label>/.exec(sec)?.[0] ?? "")) kit.fail(`${tag}: the bump carries a picture (OF6)`);
            const cod = fold(codLineFor(doc));
            const n = textOf(sec).split(cod).length - 1;
            if (n !== 1) kit.fail(`${tag}: the COD line appears ${n} times in the form, expected once (OF7)`);
            const phone = /<input\b[^>]*name="phone"[^>]*>/.exec(sec)?.[0] ?? "";
            for (const a of ['type="tel"', 'inputMode="tel"', 'autoComplete="tel"', 'dir="ltr"'])
              if (!phone.toLowerCase().includes(a.toLowerCase())) kit.fail(`${tag}: the phone input lacks ${a} (OF11)`);
            if (!/class="lp-input-group[^"]*" dir="ltr"/.test(sec)) kit.fail(`${tag}: the phone group is not LTR (OF11)`);
            const city = /<select\b[^>]*name="city"[^>]*>/.exec(sec)?.[0];
            if (city && !/autocomplete="address-level2"/i.test(city)) kit.fail(`${tag}: the city select lacks autocomplete address-level2 (OF11)`);
            if (!/enterkeyhint="send"/i.test(sec)) kit.fail(`${tag}: no control sends with enterkeyhint (OF13)`);
            if (count(sec, /data-lp-dz="offer"/g) !== 1) kit.fail(`${tag}: the offer delivery slot is not there exactly once (LAN-§7.4)`);
            if ((city || /<input\b[^>]*name="city"/.test(sec)) && count(sec, /data-lp-dz="city"/g) !== 1) kit.fail(`${tag}: the city delivery slot is not there exactly once`);
            for (const m of sec.matchAll(/<fieldset class="lp-vg[^"]*"([^>]*)>([\s\S]*?)<\/fieldset>/g)) {
              const radios = count(m[2]!, /type="radio"/g);
              if (radios === 1 && !/data-one=""/.test(m[1]!)) kit.fail(`${tag}: a one-value option group is shown (OF3, F2)`);
            }
            // R3: the form adds no timer and no trust row; the page's own count is the doc's (P6's trustBar, and the
            // honesty gate's `countdown_twice` refuses a second timer at publish), so it is reported, not failed here
            if (count(sec, /\sdata-countdown="/g)) kit.fail(`${tag}: a [data-countdown] inside the order form (R3, LD36)`);
            if (count(sec, classToken("lp-trust"))) kit.fail(`${tag}: a .lp-trust inside the order form (R3)`);
            const page = bodyOf(html);
            const timers = count(page, /\sdata-countdown="/g);
            const trust = count(page, classToken("lp-trust"));
            if (v === "card" && locale === "fr" && (timers > 1 || trust > 1)) console.log(`   note ${name}: the doc renders ${timers} [data-countdown] and ${trust} .lp-trust (doc-level, R3)`);
          }
        }
      }
    },
  },
  {
    name: "the address follows the store's address mode (OF2, UX-31)",
    run(kit) {
      const doc = docOf(kit, "duo", "fr", (d) => ({ ...d, form: { ...d.form, address: "hidden" } }));
      if (!doc) return;
      const base: Omit<ShopperFacts, "addressMode"> = { confirmationCall: true, inspection: "unset" };
      const req = renderForm(ctxOf(kit, "duo", doc, { shopper: { ...base, addressMode: "required" } }), doc);
      const more = (h: string) => /<details class="lp-of__more">[\s\S]*?<\/details>/.exec(h)?.[0] ?? "";
      const line = /<input\b[^>]*name="address"[^>]*>/.exec(req)?.[0] ?? "";
      if (!/required=""/.test(line) || /name="address"/.test(more(req))) kit.fail("required: the address is not one required line in the main flow");
      const opt = renderForm(ctxOf(kit, "duo", doc, { shopper: { ...base, addressMode: "optional" } }), doc);
      if (!/name="address"/.test(more(opt)) || !more(opt).includes(uiLabels("fr").addAddress)) kit.fail("optional: the address is not behind 'Ajouter une adresse'");
      const none = renderForm(ctxOf(kit, "duo", doc), doc);
      if (/name="address"/.test(none)) kit.fail("without store facts the doc's hidden address must stay hidden");
    },
  },
  {
    name: "the urgency chip only from typed stock or a future end (OF10, LD36)",
    run(kit) {
      const noUrgency = (d: PageDoc): PageDoc => ({ ...withVariant("card")(d), sections: d.sections.filter((s) => s.type !== "urgency").map((s) => (s.type === "orderForm" ? { ...s, variant: "card" } : s)) });
      const plain = docOf(kit, "duo", "fr", (d) => {
        const x = noUrgency(d);
        x.offers = { ...x.offers, urgency: { ...x.offers.urgency, stockLeft: undefined, countdownEnd: undefined } };
        return x;
      });
      const stock = docOf(kit, "duo", "fr", (d) => {
        const x = noUrgency(d);
        x.offers = { ...x.offers, urgency: { ...x.offers.urgency, stockLeft: 7, countdownEnd: undefined } };
        return x;
      });
      if (!plain || !stock) return;
      if (/data-lp-urgency/.test(renderForm(ctxOf(kit, "duo", plain), plain))) kit.fail("a chip with nothing typed");
      const s = renderForm(ctxOf(kit, "duo", stock), stock);
      if (count(s, /data-lp-urgency=""/g) !== 1 || !/7/.test(/<span class="lp-of__cod"[\s\S]*?<\/span><\/span>/.exec(s)?.[0] ?? "")) kit.fail("typed stock 7: no single chip naming it");
      if (/lp-glass/.test(s)) kit.fail("the urgency chip is glass");
    },
  },
  {
    name: "delivery line: zones empty and zones on, the server fallback (LAN-§7.4, §7.5)",
    async run(kit) {
      const doc = docOf(kit, "duo", "fr");
      if (!doc) return;
      const opts = kit.liveOptions("duo", kit.getFixture("duo", { now: kit.now, locale: "fr" }));
      const off = (await renderLandingHtml(doc, opts)).html;
      if (/id="lp-assist"/.test(off)) kit.fail("zones empty: an lp-assist block");
      const slots = [...bodyOf(off).matchAll(/<p class="lp-dz" data-lp-dz="(offer|city)"([^>]*)>([\s\S]*?)<\/p>/g)];
      if (slots.length !== 2 || slots.some((m) => !/hidden=""/.test(m[2]!) || m[3] !== "")) kit.fail(`zones empty: the slots are not both empty and hidden (${slots.length})`);
      const addons = addonsFor(addonInput(doc, "landing"));
      if (!addons.body.includes("assist") || !addons.data["lp-assist"]) {
        kit.fail("zones on: addonsFor answers no assist chunk");
        return;
      }
      const on = (await renderLandingHtml(doc, { ...opts, addons })).html;
      if (!/id="lp-assist"/.test(on)) kit.fail("zones on: no lp-assist data block");
      if (addonChunks.assist && !on.includes(addonChunks.assist.slice(0, 120))) kit.fail("zones on: the assist chunk is not embedded");
      const form = renderForm(ctxOf(kit, "duo", doc, { addons }), doc);
      const offer = /<p class="lp-dz" data-lp-dz="offer"([^>]*)>([\s\S]*?)<\/p>/.exec(form);
      if (!offer || /hidden/.test(offer[1]!) || !/selon la ville/.test(decode(offer[2]!))) kit.fail(`zones on: the offer slot does not hold the general line (${offer?.[2] ?? "none"})`);
      const city = /<p class="lp-dz" data-lp-dz="city"([^>]*)>([\s\S]*?)<\/p>/.exec(form);
      if (!city || !/hidden=""/.test(city[1]!) || city[2] !== "") kit.fail("zones on: the city slot is not empty and hidden before a pick");
    },
  },
  {
    name: "delivery line fee equals the charged fee on duo and tshirt, free offers included (LAN-§7.5)",
    async run(kit) {
      for (const name of ["duo", "tshirt"] as const) {
        // the last offer ships free, so the parity covers a free offer on a page with a fee
        const doc = docOf(kit, name, "fr", (d) => ({ ...d, offers: { ...d.offers, shippingFee: d.offers.shippingFee || 35, bundles: d.offers.bundles.map((b, i, all) => (i === all.length - 1 ? { ...b, freeShipping: true } : b)) } }));
        if (!doc) continue;
        const html = (await renderLandingHtml(doc, kit.liveOptions(name, kit.getFixture(name, { now: kit.now, locale: "fr" })))).html;
        const raw = /<script type="application\/json" id="lp-config">([\s\S]*?)<\/script>/.exec(html)?.[1];
        if (!raw) {
          kit.fail(`${name}: no lp-config`);
          continue;
        }
        const cfg = JSON.parse(raw) as LandingRuntimeConfig;
        const a = addonsFor(addonInput(doc, "landing")).data["lp-assist"] as AssistData | undefined;
        let free = 0;
        for (const b of cfg.bundles) {
          const t = orderTotals(doc, emptySelection(b.id));
          if (!t) continue;
          const lineFree = b.free || cfg.shippingFee === 0;
          if (lineFree) free++;
          if (lineFree !== (t.shipping === 0)) kit.fail(`${name}/${b.id}: the line says ${lineFree ? "free" : "a fee"}, the order charges ${t.shipping}`);
          if (!lineFree && (cfg.shippingFee !== t.shipping || a?.f !== fmtCents(t.shipping, moneyFormat(doc.currency, doc.locale)))) kit.fail(`${name}/${b.id}: the line's fee ${a?.f} is not the charged ${t.shipping}`);
        }
        if (!free) kit.fail(`${name}: no free offer was measured`);
      }
    },
  },
  {
    name: "lp-assist city keys equal MA_CITIES minus OTHER_CITY (LAN-§7.5, CRIT1)",
    run(kit) {
      const want = MA_CITIES.filter((c) => c.value !== OTHER_CITY.value)
        .map((c) => c.value)
        .sort();
      const got = Object.keys(TABLE.city).sort();
      if (want.join("|") !== got.join("|")) kit.fail(`the table's city keys differ: ${got.length} keys for ${want.length} cities`);
    },
  },
  {
    name: "thank-you timelines: confirmationCall × inspection in ar / fr / en (LAN-§6.3)",
    run(kit) {
      for (const locale of ["ar", "fr", "en"] as const) {
        const doc = docOf(kit, "argan", locale);
        if (!doc) continue;
        const labels = new Map<string, string>();
        for (const call of [true, false]) {
          for (const inspection of ["allowed", "not_allowed"] as const) {
            const tag = `${locale}/call=${call}/inspection=${inspection}`;
            const html = thanksBody(doc, ctxOf(kit, "argan", doc, { shopper: { confirmationCall: call, inspection, addressMode: "required" } }));
            const steps = [...html.matchAll(/data-step="(\w+)"/g)].map((m) => m[1]);
            const want = call ? "placed,call,ship,pay" : "placed,ship,pay";
            if (steps.join() !== want) kit.fail(`${tag}: steps ${steps.join()} ≠ ${want}`);
            if (/lp-ty__step-num|>0[1-4]</.test(html)) kit.fail(`${tag}: a numbered step`);
            const now = /<li class="lp-ty__step" data-state="now" data-step="(\w+)"/.exec(html)?.[1];
            if (now !== (call ? "call" : "ship")) kit.fail(`${tag}: the current step is ${now}`);
            const pay = /data-step="pay"[\s\S]*?<span class="lp-ty__step-label">([^<]*)<\/span>/.exec(html)?.[1] ?? "";
            labels.set(inspection, pay);
          }
        }
        if (!labels.get("allowed") || labels.get("allowed") === labels.get("not_allowed")) kit.fail(`${locale}: the inspection step does not follow policies.inspection`);
        const unset = thanksBody(doc, ctxOf(kit, "argan", doc));
        const payUnset = /data-step="pay"[\s\S]*?<span class="lp-ty__step-label">([^<]*)<\/span>/.exec(unset)?.[1];
        if (payUnset !== labels.get("not_allowed")) kit.fail(`${locale}: without store facts the page promises an inspection`);
      }
    },
  },
  {
    name: "thank-you and legal pages: tint only, 0 aurora, 0 grain, 0 glass, budgets (LAN-§3.6)",
    async run(kit) {
      const ty = css("src/landing/thankyou/thankyou.css");
      const legal = css("src/landing/legal/legal.css");
      if (/var\(--lp-aurora|url\(#noise\)|backdrop-filter/.test(ty)) kit.fail("thankyou.css: aurora, noise or backdrop-filter");
      if (/var\(--lp-aurora|url\(#noise\)/.test(legal)) kit.fail("legal.css: aurora or noise");
      for (const name of kit.fixtures) {
        for (const locale of ["ar", "fr"] as const) {
          const doc = docOf(kit, name, locale);
          if (!doc) continue;
          const fx = kit.getFixture(name, { now: kit.now, locale });
          const opts = kit.liveOptions(name, fx);
          const tag = `${name}/${locale}`;
          const t = bodyOf((await renderThankYouHtml(doc, opts)).html);
          if (/lp-ty__aurora|adm-aurora|adm-grain|lp-glass/.test(t)) kit.fail(`${tag}/merci: aurora, grain or glass`);
          if (count(t, /class="lp-ty__tint"/g) !== 1) kit.fail(`${tag}/merci: no single .lp-ty__tint`);
          const reveals = count(t, /\sdata-reveal="/g);
          if (reveals > 8) kit.fail(`${tag}/merci: ${reveals} reveals, at most 8`);
          if (count(t, /\blp-btn--primary\b/g) > 1) kit.fail(`${tag}/merci: more than one primary action`);
          if (!/<dl class="lp-ty__rows">/.test(t)) kit.fail(`${tag}/merci: the recap is not a <dl>`);
          if (!/<bdi dir="ltr" class="lp-ty__order-id" data-ty="orderId">/.test(t) || !/<bdi dir="ltr" data-ty="total">/.test(t)) kit.fail(`${tag}/merci: the order id or the total is not an LTR isolate`);
          if (/aggregateRating/i.test(t)) kit.fail(`${tag}/merci: aggregateRating`);
          for (const kind of LEGAL_KINDS) {
            const l = bodyOf((await renderLegalHtml(doc, kind, { mode: "live", assets: opts.assets, store: fx.store, links: opts.links, now: kit.now })).html);
            if (/lp-legal__aurora/.test(l) || count(l, /class="lp-legal__tint"/g) !== 1) kit.fail(`${tag}/${kind}: not one .lp-legal__tint (or an aurora)`);
          }
        }
      }
    },
  },
  {
    name: "thank-you blocks: the slots only when their block is on (LAN-§8.1, §8.6)",
    run(kit) {
      const doc = docOf(kit, "duo", "fr");
      if (!doc) return;
      const on = addonsFor(addonInput(doc, "thanks"));
      const html = thanksBody(doc, ctxOf(kit, "duo", doc, { addons: on }));
      if (!/<div class="lp-ty__ids">[\s\S]*?class="lp-ty__order"[\s\S]*?data-lp-ty="confirm"[^>]*hidden=""/.test(html)) kit.fail("on: the confirm pill is not a hidden slot beside the order chip");
      if (!/data-lp-ty="expect">[^<]*<bdi dir="ltr" class="lp-ty-phone">06 61 23 45 67<\/bdi>/.test(html)) kit.fail("on: the call step does not hold the expectation with the phone in an LTR isolate");
      if (!/<a class="lp-ty__track" data-lp-ty="track"[^>]*hidden=""/.test(html)) kit.fail("on: no hidden track slot in the summary");
      if (!html.includes(TY.fr.track)) kit.fail("on: the track slot has no words");
      const off = thanksBody(doc, ctxOf(kit, "duo", doc, { addons: addonsFor(addonInput(doc, "thanks", { blocks: false })) }));
      if (/data-lp-ty=/.test(off)) kit.fail("off: a thank-you slot without its block");
      if (off !== thanksBody(doc, ctxOf(kit, "duo", doc))) kit.fail("off: the body differs from a render without add-ons");
    },
  },
  {
    name: "report this store: thank-you, legal kinds, tracking; none in exports (LAN-§3.9)",
    async run(kit) {
      for (const name of ["argan", "duo"] as const) {
        for (const locale of ["ar", "fr"] as const) {
          const doc = docOf(kit, name, locale);
          if (!doc) continue;
          const fx = kit.getFixture(name, { now: kit.now, locale });
          const opts = kit.liveOptions(name, fx);
          const tag = `${name}/${locale}`;
          reportHrefs(kit, `${tag}/merci`, (await renderThankYouHtml(doc, opts)).html, 1);
          for (const kind of LEGAL_KINDS) reportHrefs(kit, `${tag}/${kind}`, (await renderLegalHtml(doc, kind, { mode: "live", assets: opts.assets, store: fx.store, links: opts.links, now: kit.now })).html, 1);
          const exp = { mode: "export" as const, assets: fixtureAssets("./"), pageKey: fx.pageKey, store: fx.store, urls: { landing: "./", thankYou: "merci/index.html", endpoints: ENDPOINTS }, links: exportLinks(0), now: kit.now };
          reportHrefs(kit, `${tag}/export-merci`, (await renderThankYouHtml(doc, exp)).html, 0);
          for (const kind of LEGAL_KINDS) reportHrefs(kit, `${tag}/export-${kind}`, (await renderLegalHtml(doc, kind, { mode: "export", assets: fixtureAssets("../"), store: fx.store, links: exportLinks(1), now: kit.now })).html, 0);
          const c = TRK[locale];
          const track = renderToStaticMarkup(
            createElement(TrackDocument, {
              locale,
              dir: locale === "ar" ? "rtl" : "ltr",
              storeName: "QA",
              homeHref: "/s/qa-store/",
              logo: null,
              icon: null,
              themeColor: null,
              colorScheme: "light dark",
              css: "",
              preloads: [],
              state: { kind: "lookup", o: "CMD-1234", notice: null, whatsapp: null },
              data: { ep: "/api/public/track", path: "/s/qa-store/track", msg: { notFound: c.notFound, rateLimited: c.rateLimited, closed: c.closed, error: c.error, sent: c.sent, requested: c.requested } },
              script: null,
              tz: "Africa/Casablanca",
              legal: [],
              report: { href: `https://platform.example/report/qa-store?p=${encodeURIComponent("/s/qa-store/track")}`, label: "Report" },
              trackPath: "/s/qa-store/track",
            }),
          );
          reportHrefs(kit, `${tag}/track`, track, 1);
        }
      }
    },
  },
  {
    name: "test render: the band, no pixel; byte identity with every add-on off (D54, LAN-§5.3)",
    async run(kit) {
      for (const name of ["argan", "duo"] as const) {
        const doc = docOf(kit, name, "fr");
        if (!doc) continue;
        const opts = kit.liveOptions(name, kit.getFixture(name, { now: kit.now, locale: "fr" }));
        const plain = (await renderLandingHtml(doc, opts)).html;
        if (plain !== (await renderLandingHtml(doc, { ...opts, addons: noAddons() })).html) kit.fail(`${name}: landing bytes change with every add-on off`);
        const ty = (await renderThankYouHtml(doc, opts)).html;
        if (ty !== (await renderThankYouHtml(doc, { ...opts, addons: noAddons() })).html) kit.fail(`${name}: thank-you bytes change with every add-on off`);
        const test = (await renderLandingHtml(doc, { ...opts, addons: { ...noAddons(), banner: "test" }, pixels: false })).html;
        if (!/class="lp-test-band"/.test(test)) kit.fail(`${name}: the test render carries no band`);
        const px = runtimeChunks.pixels;
        if (px && test.includes(px.slice(0, 160))) kit.fail(`${name}: the test render carries the pixel chunk`);
      }
    },
  },
];
