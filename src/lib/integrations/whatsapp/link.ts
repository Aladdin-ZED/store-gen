/**
 * WhatsApp click-to-chat links (P5 INTEGRATIONS; operations.md OPE-§22.1, §22.3, OPE-§L "WhatsApp link"; IN-05). Pure
 * and isomorphic (P4's drawer and queue build the link from the rendered template; P3's thank-you text uses the same
 * caps):
 *
 *   waLink("+212612345678", builtin.body, values)   // "https://wa.me/212612345678?text=Bonjour%20Salma%2C%20…"
 *
 * Caps: the text ≤ 1,000 characters and the URL ≤ 2,000 characters [verify client limits]. When the full text does not
 * fit, in this order: (1) every optional block is dropped; (2) `units_text` is shortened with "…"; (3) the other free
 * texts (address, landmark, labels, names) are shortened, longest first; (4) the text is cut at a word with "…". The
 * order id is never shortened and, if the full text carried it, the final text still does. Plain text only: nothing is
 * added to it, no markup and no bidi control characters (Arabic renders right-to-left on its own).
 */
import { compileTemplate, renderCompiled, type CompiledTemplate, type TemplateValues, type TemplateVar } from "../template-lang";

export const WA_TEXT_MAX = 1000;
export const WA_URL_MAX = 2000;

/** What had to give for the link to fit (the editor's preview says it; tests assert the order). */
export type WaTrim = "none" | "optional" | "units" | "values" | "cut";

export interface WaMessage {
  url: string;
  text: string;
  trim: WaTrim;
}

/** Free texts that may be shortened after `units_text`; ids, amounts, numbers and links never are. */
const SHORTENABLE: readonly TemplateVar[] = ["address", "landmark", "offer_label", "product", "upsell_title", "carrier_label", "store_name", "city", "customer_first_name", "agent_first_name", "eta_text", "shipping_text"];

const ELLIPSIS = "…";
const cps = (s: string) => Array.from(s);
const cpLength = (s: string) => cps(s).length;

/** The digits of an E.164 number ("+212 6…" → "2126…"); wa.me takes digits only. */
export function waDigits(e164: string): string {
  return e164.replace(/\D/g, "");
}

export function waUrl(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** `s` cut to `n` code points with "…" (n = 0 → "…"). */
function shorten(s: string, n: number): string {
  const all = cps(s);
  return n >= all.length ? s : `${all.slice(0, n).join("").trimEnd()}${ELLIPSIS}`;
}

/**
 * The longest prefix of `values[name]` (in code points) for which `fits` holds, or null when even "…" does not fit.
 * Binary search: `fits` is monotone in the value's length.
 */
function shrinkValue(values: TemplateValues, name: TemplateVar, fits: (v: TemplateValues) => boolean): TemplateValues | null {
  const full = values[name] ?? "";
  let lo = 0;
  let hi = cpLength(full) - 1;
  let best: TemplateValues | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = { ...values, [name]: shorten(full, mid) };
    if (fits(candidate)) {
      best = candidate;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** Last resort: cut the text at a word so the URL fits, keeping the order id at the end when the cut removed it. */
function cutText(text: string, digits: string, orderId: string): string {
  const keepId = orderId !== "" && text.includes(orderId);
  const finish = (head: string) => {
    const h = head.trimEnd();
    return keepId && !h.includes(orderId) ? `${h}${ELLIPSIS} ${orderId}` : `${h}${ELLIPSIS}`;
  };
  const ok = (s: string) => cpLength(s) <= WA_TEXT_MAX && waUrl(digits, s).length <= WA_URL_MAX;
  const all = cps(text);
  let n = 0;
  for (let lo = 1, hi = all.length - 1; lo <= hi; ) {
    const mid = (lo + hi) >> 1;
    if (ok(finish(all.slice(0, mid).join("")))) {
      n = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const head = all.slice(0, n).join("");
  // prefer the last word boundary when it is close (≤ 24 code points back)
  const space = head.lastIndexOf(" ");
  if (space > 0 && n - cpLength(head.slice(0, space)) <= 24 && ok(finish(head.slice(0, space)))) return finish(head.slice(0, space));
  return finish(head);
}

/** The rendered text and URL within the caps, and what was trimmed to get there. */
export function waMessage(e164: string, src: string | CompiledTemplate, values: TemplateValues): WaMessage {
  const t = typeof src === "string" ? compileTemplate(src) : src;
  const digits = waDigits(e164);
  const fitsText = (text: string) => cpLength(text) <= WA_TEXT_MAX && waUrl(digits, text).length <= WA_URL_MAX;
  const done = (text: string, trim: WaTrim): WaMessage => ({ url: waUrl(digits, text), text, trim });

  const full = renderCompiled(t, values);
  if (fitsText(full)) return done(full, "none");

  const dropped = (v: TemplateValues) => renderCompiled(t, v, { optional: "drop" });
  const fits = (v: TemplateValues) => fitsText(dropped(v));
  if (fits(values)) return done(dropped(values), "optional");

  let v: TemplateValues = values;
  if (v.units_text) {
    const shorter = shrinkValue(v, "units_text", fits);
    if (shorter) return done(dropped(shorter), "units");
    v = { ...v, units_text: ELLIPSIS };
  }
  const order = SHORTENABLE.filter((n) => !!v[n]).sort((a, b) => cpLength(v[b]!) - cpLength(v[a]!));
  for (const name of order) {
    const shorter = shrinkValue(v, name, fits);
    if (shorter) return done(dropped(shorter), "values");
    v = { ...v, [name]: ELLIPSIS };
  }
  return done(cutText(dropped(v), digits, (values.order_id ?? "").trim()), "cut");
}

/** `https://wa.me/<E.164 digits>?text=<encodeURIComponent(text)>` within the caps (OPE-§22.3). */
export function waLink(e164: string, src: string, values: TemplateValues): string {
  return waMessage(e164, src, values).url;
}
