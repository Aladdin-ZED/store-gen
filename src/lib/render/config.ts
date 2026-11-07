/**
 * LandingRuntimeConfig builder — the public JSON the runtime reads from #lp-config.
 * Isomorphic (server renderer, admin preview). Contains ONLY public values.
 *
 * Offers v2 (docs/OFFERS.md §F.7): config `v: 2` — every amount integer cents; the page's items with
 * their option groups (choice · matrix · field); one entry per offer with its units (one per
 * physical piece, k = array index, `line` = the line it comes from); the page extras, the bump, the
 * resolved fill (§E.1, once per page) and the optional runtime chunks the page embeds (`features`).
 * Pages published before keep their own embedded v1 runtime + config.
 *
 * R2 contract step (C2-B2): `contentIdOf(item, productKey)` (STO-R12 (c), LAN Q25): an attached landing's ad content
 * ids are the catalog's, so the landing, the PDP and the cart report one catalogue (`opts.productKey`, set only for a
 * page with `pages.product_id`); `withZones(cfg, zones)` is runtime config v3 (LP-16, core D75), the v2 config plus
 * the store's value-keyed `ZoneTable`, read by the `landing-v3` chunk only. Without either option the bytes are today's.
 */
import type { LandingRuntimeConfig, LandingRuntimeConfigV3, RuntimeFeature, RuntimeGroup, RuntimeOffer, RuntimeOfferLine } from "@/landing/runtime/config";
import { RUNTIME_EXTRA_KEYS, RUNTIME_UI_KEYS } from "@/landing/runtime/strings";
import { CAPTCHA_STRING } from "@/landing/runtime/turnstile";
import { samePieces } from "@/landing/offers/model";
import { offerNameT } from "@/landing/sections/orderForm/copy";
import type { RenderContext, RenderMode } from "@/landing/types";
import { moneyFormat, phoneSpec } from "@/lib/markets/info";
import { contentIdOf as pageContentIdOf, expandUnits, isLegacyOffer, itemById, itemName, itemShort, leadItem, offerAvailable, offerName, offerShort, offerUnits } from "@/lib/page/catalog";
import { resolveDisplay } from "@/lib/page/display";
import { cellKey, groupCombos } from "@/lib/page/options";
import { defaultOfferId, effectiveFree, offersMath, toCents } from "@/lib/page/pricing";
import { isChoiceGroup, isFieldGroup, isMatrixGroup, type ExtraGroup, type Item, type Locale, type Offer, type OptionGroup, type PageDoc } from "@/lib/page/schema";
import { runtimePixels } from "@/lib/pixels/tracking";
import type { ZoneTable } from "@/lib/delivery/types";

/** The page money format (shared with ctx.money — see moneyFormat() in @/lib/markets/info). */
export { moneyFormat };

export interface RuntimeEndpoints {
  order: string;
  lead?: string;
  event?: string;
  upsell?: string;
}

export interface RuntimeConfigOptions {
  page: "landing" | "thanks";
  /** runtime behavior: "preview" never sends orders/events nor loads pixels */
  mode: RenderMode;
  pageKey: string;
  endpoints: RuntimeEndpoints;
  thankYouUrl: string;
  landingUrl: string;
  /** store-level WhatsApp number used when the form has none (default: ctx.store.whatsapp) */
  storeWhatsapp?: string;
  /** Cloudflare Turnstile site key — only when the runtime renders the widget for this page */
  turnstileSiteKey?: string;
  /** publish version id (`ver`, §G.1); "" in previews and exports */
  ver?: string;
  /** order form variant (resolveDisplay context) */
  formVariant?: string;
  /**
   * R2 (STO-R12 (c), LAN Q25): the public key of the product an attached landing sells (`pages.product_id`): the
   * item content ids become the catalog's (`contentIdOf(item, productKey)`). Absent: the page key, as in R1.
   */
  productKey?: string;
}

/**
 * Ad content id of an item under a key (STO-§16.6, STO-R12 (c)): its SKU, else `<key>` for "main", else
 * `<key>.<itemId>`. The key is the product's public key on an attached landing, the PDP and the cart (one catalogue,
 * LND-11), the page key on every other landing (`@/lib/page/catalog`'s rule, unchanged).
 */
export function contentIdOf(item: Pick<Item, "id" | "sku">, productKey: string): string {
  return pageContentIdOf(null, item, productKey);
}

/** Runtime config v3 (LP-16, core D75): the v2 config and the store's `ZoneTable` (`zonesForCheckout`, LAN-§7.1). */
export function withZones(cfg: LandingRuntimeConfig, zones: ZoneTable): LandingRuntimeConfigV3 {
  return { ...cfg, v: 3, zones };
}

/** "x2 · Pack Duo" (or just "x2"): the offer's unit count and title. */
export function bundleLabel(ctx: Pick<RenderContext, "t">, b: Pick<Offer, "lines" | "title">): string {
  const x = ctx.t("bundle.x", { n: offerUnits(b) });
  const title = b.title?.trim();
  return title ? `${x} · ${title}` : x;
}

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

/**
 * International digits for wa.me ("212612345678") from what admins type: "+212 6 12…", "00212…",
 * "212…" or a national number with its trunk zero ("06 12 34 56 78", completed with the country's
 * calling code). Null when it cannot be a WhatsApp number.
 */
export function whatsappDigits(raw: string | undefined | null, country = "MA"): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\s().\- ‎‏]/g, "");
  if (!/^\+?[0-9]{6,17}$/.test(s)) return null;
  const spec = phoneSpec(country);
  const prefix = spec.prefix.replace(/^\+/, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) {
    if (!prefix) return null;
    s = prefix + s.slice(1);
  }
  // "+212 (0)6 12…" → "2126…": the trunk zero kept after the calling code, for countries whose
  // national numbers start with one (national pattern "^0…"; Italy's leading 0 is part of the number)
  if (prefix && spec.national.startsWith("^0") && s.startsWith(`${prefix}0`)) s = prefix + s.slice(prefix.length + 1);
  return /^[1-9][0-9]{7,14}$/.test(s) ? s : null;
}

/** Digits-only WhatsApp number (wa.me format): the form's own number when enabled, else the store's. */
export function whatsappNumber(doc: PageDoc, storeWhatsapp?: string): string | null {
  const fromForm = doc.form.whatsapp?.enabled ? whatsappDigits(doc.form.whatsapp.number, doc.form.phoneCountry) : null;
  return fromForm ?? whatsappDigits(storeWhatsapp, doc.form.phoneCountry);
}

/** Cloudflare Turnstile site keys ("0x4AAAA…", test keys "1x00000000000000000000AA"). */
export const TURNSTILE_SITE_KEY = /^[A-Za-z0-9_-]{10,100}$/;

/** The site key a document embeds: product pages that send orders, with a well-formed key — else null. */
export function turnstileKeyFor(page: "landing" | "thanks", mode: RenderMode, siteKey: string | undefined): string | null {
  return page === "landing" && mode !== "preview" && siteKey && TURNSTILE_SITE_KEY.test(siteKey) ? siteKey : null;
}

/** Shown when Cloudflare asks the shopper to complete the Turnstile check (runtime key CAPTCHA_STRING). */
const CAPTCHA_MESSAGE: Record<Locale, string> = {
  ar: "المرجو إكمال التحقق أعلاه، ثم تأكيد الطلب من جديد.",
  fr: "Merci de compléter la vérification ci-dessus, puis de confirmer à nouveau.",
  en: "Please complete the verification above, then confirm again.",
  es: "Completa la verificación de arriba y vuelve a confirmar.",
  de: "Bitte schließe die Überprüfung oben ab und bestätige erneut.",
  it: "Completa la verifica qui sopra, poi conferma di nuovo.",
  nl: "Voltooi de verificatie hierboven en bevestig opnieuw.",
  pt: "Conclua a verificação acima e confirme novamente.",
};

/* ------------------------------------------------------------------ */
/* Groups, items, offers (cents)                                       */
/* ------------------------------------------------------------------ */

const cents = (m: number | undefined) => (m ? toCents(m) : 0);

/** Matrix display "auto": combined when at most 8 combinations are made (the renderer applies the same rule). */
export function matrixDisplay(g: Extract<OptionGroup, { kind: "matrix" }>, made: number): "linked" | "combined" {
  return g.display === "auto" ? (made <= 8 ? "combined" : "linked") : g.display;
}

/** A choice / matrix / field group as the runtime reads it (deltas in cents, only when > 0). */
export function runtimeGroup(g: OptionGroup): RuntimeGroup {
  if (isChoiceGroup(g))
    return {
      id: g.id,
      name: g.name,
      kind: g.kind,
      perUnit: g.perUnit,
      options: g.options.map((o) => ({ id: o.id, label: o.label, soldOut: o.soldOut, ...(o.delta ? { delta: cents(o.delta) } : {}) })),
    };
  if (isMatrixGroup(g)) {
    const made = groupCombos(g).filter((x) => x.state !== "none").length;
    return {
      id: g.id,
      name: g.name,
      kind: "matrix",
      perUnit: g.perUnit,
      display: matrixDisplay(g, made),
      dims: g.dims.map((d) => ({
        id: d.id,
        name: d.name,
        values: d.values.map((v) => ({ id: v.id, label: v.label, soldOut: v.soldOut, ...(v.delta ? { delta: cents(v.delta) } : {}) })),
      })),
      // exceptions only: state ≠ in, or a delta of their own (image / sku cells are markup / server only)
      cells: g.cells
        .filter((x) => x.state !== "in" || x.delta !== undefined)
        .map((x) => ({
          v: cellKey(x.v),
          ...(x.state === "out" ? { s: "o" as const } : x.state === "none" ? { s: "n" as const } : {}),
          ...(x.delta !== undefined ? { d: cents(x.delta) } : {}),
        })),
    };
  }
  const f = g as Extract<OptionGroup, { kind: "field" }>;
  return {
    id: f.id,
    name: f.name,
    kind: "field",
    perUnit: f.perUnit,
    input: f.input,
    required: f.required,
    maxLength: f.maxLength,
    ...(f.min !== undefined ? { min: f.min } : {}),
    ...(f.max !== undefined ? { max: f.max } : {}),
    charset: f.charset,
    ...(!f.required && f.delta ? { delta: cents(f.delta) } : {}),
  };
}

/** Units of an offer, one per physical piece (k = array index), each with the line it comes from. */
function runtimeUnits(offer: Offer, items: readonly Item[]): RuntimeOfferLine[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  return expandUnits(offer, items).map((s) => {
    const u: RuntimeOfferLine = { line: s.line };
    if (s.item) u.item = s.item;
    if (s.choices) {
      u.choices = s.choices;
      u.available = s.available ?? [];
      if (s.distinct) u.distinct = true;
      if (s.surcharge === "difference") u.surcharge = true;
      u.base = s.choices
        .map((id) => byId.get(id))
        .filter((it): it is Item => !!it)
        .map((it) => toCents(it.price))
        .sort((a, b) => a - b);
    }
    if (s.free) u.free = true;
    if (s.rules) {
      const rules: NonNullable<RuntimeOfferLine["rules"]> = {};
      for (const [key, r] of Object.entries(s.rules)) {
        if ("lock" in r) rules[key] = { lock: r.lock };
        else if ("allow" in r) rules[key] = { allow: r.allow, ...(r.preset ? { preset: r.preset } : {}) };
        else rules[key] = { preset: r.preset };
      }
      u.rules = rules;
    }
    return u;
  });
}

/** The offer's label in summaries, the thank-you page and the order record: v1 "x2 · Pack Duo" for v1-shaped offers. */
export function offerLabel(ctx: Pick<RenderContext, "t"> & { doc: PageDoc }, b: Offer): string {
  if (isLegacyOffer(ctx.doc, b)) return bundleLabel(ctx, b);
  return offerName({ doc: ctx.doc, t: offerNameT(ctx.doc.locale as Locale) }, b);
}

/** Which optional runtime chunks the page needs (§F.9): matrix / fields in an available offer's units, extras or the bump item; steps / box fills. */
export function runtimeFeatures(doc: PageDoc, fill: string): RuntimeFeature[] {
  const used = new Set<string>();
  for (const o of doc.offers.bundles) {
    if (!offerAvailable(o, doc.items)) continue;
    for (const l of o.lines) {
      if ("item" in l.pick) used.add(l.pick.item);
      else for (const id of l.pick.choice) used.add(id);
    }
  }
  const bumpItem = doc.offers.orderBump?.enabled ? doc.offers.orderBump.item : undefined;
  if (bumpItem) used.add(bumpItem);
  const groups: OptionGroup[] = [];
  for (const it of doc.items) if (used.has(it.id)) groups.push(...it.groups);
  const out: RuntimeFeature[] = [];
  if (groups.some(isMatrixGroup)) out.push("matrix");
  if (groups.some(isFieldGroup) || doc.offers.extras.some((x: ExtraGroup) => x.kind === "field")) out.push("fields");
  if (fill === "steps" || fill === "box") out.push("steps-box");
  return out;
}

export function buildRuntimeConfig(doc: PageDoc, ctx: RenderContext, opts: RuntimeConfigOptions): LandingRuntimeConfig {
  const { product, offers, form } = doc;
  const lead = leadItem(doc);
  const phone = phoneSpec(form.phoneCountry);
  const strings: Record<string, string> = {};
  for (const key of [...RUNTIME_UI_KEYS, ...RUNTIME_EXTRA_KEYS]) strings[key] = ctx.t(key);

  const wa = whatsappNumber(doc, opts.storeWhatsapp ?? ctx.store.whatsapp);
  const preview = opts.mode === "preview";
  // the widget only exists on product pages that can send orders (never in previews)
  const turnstile = turnstileKeyFor(opts.page, opts.mode, opts.turnstileSiteKey);
  if (turnstile) strings[CAPTCHA_STRING] = CAPTCHA_MESSAGE[doc.locale];
  // never in previews (the runtime also refuses to load pixels in preview mode)
  const pixels: LandingRuntimeConfig["pixels"] = preview ? {} : runtimePixels(doc.tracking);
  const display = resolveDisplay(doc, { archetype: ctx.archetype, formVariant: opts.formVariant ?? "card" });
  const maths = offersMath(doc);
  const nameCtx = { doc, t: offerNameT(doc.locale) };
  const bump = offers.orderBump?.enabled ? offers.orderBump : undefined;
  const upsell = offers.upsell?.enabled ? offers.upsell : undefined;
  // the key content ids hang off (STO-R12 (c)): an attached landing's product key, else the page key
  const idKey = opts.productKey || opts.pageKey;

  const bundles: RuntimeOffer[] = offers.bundles.map((b, i) => {
    const m = maths[i]!;
    const r: RuntimeOffer = {
      id: b.id,
      label: offerLabel(ctx, b),
      short: offerShort(nameCtx, b),
      price: m.price,
      from: m.from,
      reference: m.displayReference,
      savings: m.savings,
      savingsPct: m.savingsPct,
      free: effectiveFree(doc, b),
      units: runtimeUnits(b, doc.items),
    };
    if (m.variable) r.variable = true;
    if (m.perUnit !== null && samePieces(b)) r.perUnit = m.perUnit;
    if (!offerAvailable(b, doc.items)) r.soldOut = true;
    return r;
  });

  return {
    v: 2,
    ver: preview ? "" : (opts.ver ?? ""),
    page: opts.page,
    pageKey: opts.pageKey,
    mode: opts.mode,
    locale: doc.locale,
    dir: ctx.dir,
    currency: doc.currency,
    endpoints: {
      order: opts.endpoints.order,
      ...(opts.endpoints.lead ? { lead: opts.endpoints.lead } : {}),
      ...(opts.endpoints.event ? { event: opts.endpoints.event } : {}),
      ...(opts.endpoints.upsell ? { upsell: opts.endpoints.upsell } : {}),
    },
    thankYouUrl: opts.thankYouUrl,
    landingUrl: opts.landingUrl,
    ...(upsell
      ? { upsell: { price: toCents(upsell.price), title: upsell.title, windowMinutes: upsell.windowMinutes, ...(upsell.item ? { item: upsell.item } : {}) } }
      : {}),
    phone: { country: phone.country || form.phoneCountry, prefix: phone.prefix, national: phone.national },
    fields: { city: form.city, address: form.address, email: form.email },
    money: { ...moneyFormat(doc.currency, doc.locale), minor: 100 },
    pixels,
    strings,
    ...(wa ? { whatsapp: { number: wa, text: `${ctx.t("form.whatsapp")}: ${product.name}` } } : {}),
    ...(turnstile ? { turnstileSiteKey: turnstile } : {}),
    shippingFee: toCents(offers.shippingFee),
    product: { name: product.name, contentId: contentIdOf(lead, idKey) },
    items: doc.items.map((it) => ({
      id: it.id,
      name: itemName(doc, it),
      short: itemShort(doc, it),
      price: toCents(it.price),
      contentId: contentIdOf(it, idKey),
      groups: it.groups.map(runtimeGroup),
    })),
    bundles,
    extras: offers.extras.map((x) => ({ ...runtimeGroup(x as OptionGroup), scope: x.scope === "all" ? ("all" as const) : [...x.scope] })),
    ...(bump
      ? {
          bump: {
            price: toCents(bump.price),
            ...(bump.item && itemById(doc, bump.item) ? { item: bump.item } : {}),
            ...(bump.offers ? { offers: [...bump.offers] } : {}),
          },
        }
      : {}),
    defaultBundleId: defaultOfferId(offers, doc.items),
    fill: display.fill,
    features: runtimeFeatures(doc, display.fill),
  };
}

/** Σ units of an offer (the v1 helper's name). */
export const unitsOf = offerUnits;

const BACKSLASH = String.fromCharCode(92);
/** Characters that could end a <script> element or break JS-string embedding: < > & LS PS */
const UNSAFE_JSON = new RegExp(`[<>&${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, "g");

/** JSON for an inline data <script>: `<`, `>`, `&` and line separators escaped so it can never close the element. */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE_JSON, (c) => `${BACKSLASH}u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
