/**
 * The message of an "Order on WhatsApp" intent (P3 LANDING; landing.md LAN-§11.4 step 5, §24.2 `wa.*`). Pure: the
 * route hands it the price (./price.ts), the reference, the owner's `wa_order` template (null when not customised)
 * and the zone line of the picked city.
 *
 *   owner's template   filled with {offer} {units} {total} {delivery} {ref} {options_to_confirm} {product} {eta_text}
 *                      (operations' grammar, `fillTemplate`: an empty variable drops its `[[ … ]]` block)
 *   no template        `composeWaMessage` (src/lib/export/whatsapp.ts, the exports' composer) without the customer
 *                      block, plus the delivery line, the groups to confirm and the zone window
 * `{eta_text}` is the zone line before the call for the picked city: empty without a city or a zone (never a promise
 * without a zone). The reference is always in the text (appended when a template leaves it out). The text stays within
 * 1,000 characters and its `wa.me` link within 2,000: the end of the text is cut first, the reference kept.
 */
import { waCopy as exportWaCopy, composeWaMessage } from "@/lib/export/whatsapp";
import { fill, shopperLocaleOf, WA } from "@/lib/landing/copy";
import { fillTemplate } from "@/lib/landing/template-text";
import { fmtCents } from "@/landing/runtime/money";
import { moneyFormat } from "@/lib/markets/info";
import type { Locale, PageDoc } from "@/lib/page/schema";
import { WA_TEXT_MAX, WA_URL_MAX } from "./contract";
import type { WaPrice } from "./price";
import { waProductName } from "./price";

export interface WaTextInput {
  doc: PageDoc;
  price: WaPrice;
  ref: string;
  /** wa.me digits */
  number: string;
  /** the owner's `wa_order` text in the page language; null: the composed message */
  template: string | null;
  /** the zone window of the picked city in the page language ("" when none) */
  etaText: string;
}

export const waLink = (number: string, text: string) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

/** The template variables of an intent (also the editor's preview values). */
export function waOrderValues(i: Omit<WaTextInput, "template" | "number">): Record<string, string> {
  const l = shopperLocaleOf(i.doc.locale);
  const c = WA[l];
  const money = (cents: number) => fmtCents(cents, moneyFormat(i.doc.currency, i.doc.locale));
  return {
    offer: i.price.offerLabel,
    units: i.price.units,
    total: money(i.price.total),
    delivery: i.price.shipping > 0 ? fill(c.deliveryFee, { fee: money(i.price.shipping) }) : c.deliveryFree,
    ref: i.ref,
    options_to_confirm: i.price.toConfirm.length ? fill(c.toConfirm, { list: i.price.toConfirm.join(", ") }) : "",
    product: waProductName(i.doc),
    eta_text: i.etaText,
  };
}

/** The composed message (no owner template): the exports' order message without its customer block. */
function composed(i: WaTextInput, values: Record<string, string>): string {
  const l = shopperLocaleOf(i.doc.locale);
  const c = WA[l];
  const locale = i.doc.locale as Locale;
  const sep = l === "fr" ? " : " : ": ";
  const money = (cents: number) => fmtCents(cents, moneyFormat(i.doc.currency, i.doc.locale));
  const { text } = composeWaMessage(
    { orderId: i.ref, product: values.product!, pack: values.offer!, units: i.price.units, total: i.price.total, customer: { name: "", phone: "" } },
    exportWaCopy(locale).labels,
    { locale, money },
  );
  const lines = text.trim().split("\n");
  // the delivery line goes just above the total (the last line)
  const free = c.deliveryFree;
  const delivery = i.price.shipping > 0 ? `${c.delivery}${sep}${money(i.price.shipping)}` : free.charAt(0).toLocaleUpperCase(locale) + free.slice(1);
  lines.splice(lines.length - 1, 0, delivery);
  if (values.options_to_confirm) lines.push(values.options_to_confirm);
  if (i.etaText) lines.push(i.etaText);
  return lines.join("\n");
}

const cps = (s: string) => Array.from(s);

/** The text and its link, within the limits, the reference kept. */
export function waOrderText(i: WaTextInput): { text: string; url: string } {
  const values = waOrderValues(i);
  const body = (i.template ? fillTemplate(i.template, values) : composed(i, values)).replace(/\r\n?/g, "\n").trim();
  const fits = (t: string) => cps(t).length <= WA_TEXT_MAX && waLink(i.number, t).length <= WA_URL_MAX;
  let text = body.includes(i.ref) ? body : `${body}\n${i.ref}`;
  if (!fits(text)) {
    // cut the end of the text; the reference stays (appended when the cut took it)
    const chars = cps(body);
    const at = (k: number) => {
      const kept = chars.slice(0, k).join("").trimEnd();
      return `${kept}…${kept.includes(i.ref) ? "" : `\n${i.ref}`}`;
    };
    let n = Math.min(chars.length, WA_TEXT_MAX - i.ref.length - 2);
    // each step drops at least what is over (a URL-encoded character is at most 9 bytes long)
    while (n > 0 && !fits(at(n))) n -= Math.max(1, cps(at(n)).length - WA_TEXT_MAX, Math.ceil((waLink(i.number, at(n)).length - WA_URL_MAX) / 9));
    text = at(Math.max(0, n));
  }
  return { text, url: waLink(i.number, text) };
}
