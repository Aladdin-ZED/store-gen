/**
 * Landing's message templates (P3 LANDING; landing.md LAN-§2.3, §8.1, §24.2; docs/STORE-SAAS.md §K.2 P0). Pure and
 * isomorphic: the defaults of the four kinds this part defines in operations' `message_templates` table, and
 * `waConfirmText`, the server twin of the thank-you's "Confirm on WhatsApp" text. The owner's own rows are read by
 * `templateFor` (./templates.server.ts), which falls back to these defaults.
 *
 *   customer_confirm   the thank-you prefill        {order_id} {offer} {total} {name}
 *   wa_order           the WhatsApp order (LP-11)   {offer} {total} {delivery} {ref} (+ {units} {options_to_confirm}
 *                                                    {product} {eta_text}, LAN-§11.4 rev 2)
 *   lead_recovery      agent → lead                 {name} {store} {offer} {total} {eta_text} (LAN-§10.3)
 *   track_link         agent → customer             {name} {order_id} {track_url}
 *
 * The defaults carry no dash (DG-07); the Arabic is Moroccan-friendly. Every kind is filled by `fillTemplate`
 * (./template-text.ts, operations' grammar), the same function in the browser and on the server.
 *
 * `waConfirmText` (frozen at P0) fills the default `customer_confirm` of `locale` from the stored order with the
 * values the browser has for the same order (LAN-§8.3 step 2): the offer line is the offer's name plus the order bump
 * ("Pack Duo + Sérum"), which is what the form hands the thank-you page (`items`), never the warehouse text; the total
 * is formatted the way the page formats it; the name is the first word. The parity case of `test:landing-addons` holds
 * both sides to the same string. Operations' `renderTemplate` / `orderTemplateValues` speak operations' own variable
 * names (`{offer_label}`, `{customer_first_name}`) and are async; these four kinds keep landing's names, so they are
 * filled here and nowhere else.
 */
import type { z } from "zod";
import { formatMoney } from "@/lib/markets/info";
import type { OrderRow } from "@/lib/orders/hooks";
import type { Locale } from "@/lib/page/schema";
import type { StoreConfirmation } from "@/lib/settings/keys/store";
import type { StoreRow } from "@/lib/tenancy/types";
import { shopperLocaleOf, type ShopperLocale } from "./copy";
import { confirmText, firstWord } from "./template-text";

export const LANDING_TEMPLATE_KINDS = ["customer_confirm", "wa_order", "lead_recovery", "track_link"] as const;
export type LandingTemplateKind = (typeof LANDING_TEMPLATE_KINDS)[number];

/** The variables each kind may use (the template editors offer them as chips and refuse any other at save). */
export const TEMPLATE_KIND_VARS: Readonly<Record<LandingTemplateKind, readonly string[]>> = {
  customer_confirm: ["order_id", "offer", "total", "name"],
  wa_order: ["offer", "total", "delivery", "ref", "units", "options_to_confirm", "product", "eta_text"],
  lead_recovery: ["name", "store", "offer", "total", "eta_text"],
  track_link: ["name", "order_id", "track_url"],
};

export const DEFAULT_TEMPLATES: Readonly<Record<LandingTemplateKind, Readonly<Record<ShopperLocale, string>>>> = {
  customer_confirm: {
    ar: "السلام عليكم، كنأكد الطلب ديالي {order_id}: {offer}، المجموع {total}.",
    fr: "Bonjour, je confirme ma commande {order_id} : {offer}, total {total}.",
    en: "Hello, I confirm my order {order_id}: {offer}, total {total}.",
  },
  wa_order: {
    ar: "السلام عليكم، بغيت نطلب {offer} بـ{total} ({delivery}). المرجع {ref}",
    fr: "Bonjour, je souhaite commander {offer} à {total} ({delivery}). Réf. {ref}",
    en: "Hello, I'd like to order {offer} for {total} ({delivery}). Ref. {ref}",
  },
  lead_recovery: {
    ar: "السلام عليكم[[ {name}]]، معاك {store}. بديتي طلب ديال {offer}[[ بـ{total}]] فالصفحة ديالنا.[[ {eta_text}.]] بغيتي نكملوه مع بعض؟",
    fr: "Bonjour[[ {name}]], ici {store}. Vous avez commencé une commande de {offer}[[ à {total}]] sur notre page.[[ {eta_text}.]] Voulez-vous qu'on la termine ensemble ?",
    en: "Hello[[ {name}]], this is {store}. You started an order for {offer}[[ at {total}]] on our page.[[ {eta_text}.]] Shall we finish it together?",
  },
  track_link: {
    ar: "السلام عليكم {name}، تقدر تتبّع الطلب ديالك {order_id} من هنا: {track_url}",
    fr: "Bonjour {name}, suivez votre commande {order_id} ici : {track_url}",
    en: "Hello {name}, follow your order {order_id} here: {track_url}",
  },
};

/**
 * Operations' `wa_order_reply` quick reply (LAN-§11.5): what an agent answers an intent with in the chat the shopper
 * opened. The owner's own row of that kind wins (`ownTemplate(scope, "wa_order_reply", locale)`); these are the defaults.
 */
export const WA_ORDER_REPLY: Readonly<Record<ShopperLocale, string>> = {
  ar: "توصلنا بالطلب ديالك {ref}: {offer} بـ{total}. عافاك صيفط لينا الاسم، المدينة والعنوان باش نأكدو.",
  fr: "Nous avons bien reçu votre demande {ref} : {offer} à {total}. Votre nom, votre ville et votre adresse, s'il vous plaît, et nous confirmons.",
  en: "Received your request {ref}: {offer} at {total}. Your name, city and address, please, and we confirm.",
};

/** The default text of a kind in a page or template locale (every locale other than ar and fr reads the English). */
export function defaultTemplate(kind: LandingTemplateKind, locale: string): string {
  return DEFAULT_TEMPLATES[kind][shopperLocaleOf(locale)];
}

/** " (x2)": the unit count `offerSheetLabel` (src/lib/page/catalog.ts) appends to the offer's name in the stored order. */
const SHEET_COUNT = /\s*\(x\d+\)$/;

/**
 * The `{offer}` line of a stored order, as the thank-you page has it: the offer's name (the stored sheet label without
 * its unit count) and the order bump's title after " + ".
 */
export function confirmOffer(items: OrderRow["items"] | null | undefined): string {
  if (!items) return "";
  const offer = (items.bundleLabel ?? "").replace(SHEET_COUNT, "").trim();
  const bump = items.bump?.title?.trim();
  return bump ? `${offer} + ${bump}` : offer;
}

export function waConfirmText(store: StoreRow & { confirmation: z.output<typeof StoreConfirmation> }, order: OrderRow, locale: Locale): string {
  void store; // the text names the order only; the number it is sent to is the caller's (`store.confirmation.whatsapp`)
  return confirmText(defaultTemplate("customer_confirm", locale), {
    order_id: order.id,
    offer: confirmOffer(order.items),
    total: order.total > 0 ? formatMoney(order.total, order.currency, locale) : "",
    name: firstWord(order.name),
  });
}

/** `{var}` names a template uses that its kind does not offer (the editors refuse the save and name them). */
export function unknownTemplateVars(kind: LandingTemplateKind, body: string): string[] {
  const allowed = new Set(TEMPLATE_KIND_VARS[kind]);
  const out: string[] = [];
  for (const m of body.replace(/\{\{|\}\}/g, "").matchAll(/\{(\w+)\}/g)) {
    const name = m[1]!;
    if (!allowed.has(name) && !out.includes(name)) out.push(name);
  }
  return out;
}
