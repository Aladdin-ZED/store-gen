/**
 * The text of a landing message template (P3 LANDING; landing.md LAN-§8.1, §8.3 step 2, §24.2; operations.md OPE-§7.1).
 * Pure and isomorphic: the thank-you's `assist-ty` add-on builds the "Confirm on WhatsApp" text in the shopper's browser
 * and `waConfirmText` (./templates.ts) builds the same text on the server from the stored order, both through
 * `confirmText`, so the two agree by construction (the parity case of `test:landing-addons`).
 *
 * The grammar is operations' template language (OPE-§7.1): "{var}" inserts a variable, "[[ … ]]" is an optional block
 * dropped when any variable inside it is empty, "{{" and "}}" are literal braces; nothing else. One pass over the
 * template: a value is inserted once and never read again as template text (a name typed as "{offer}" stays
 * "{offer}"). An unknown variable is left as written: the editors refuse it at save, so a leftover shows a copy bug
 * instead of hiding a word.
 */

/** "Confirm on WhatsApp": the prefilled text is cut at a word to at most this many characters (LAN-§8.3 step 2). */
export const CONFIRM_TEXT_MAX = 600;

/** The four variables of `customer_confirm` (LAN-§8.2): the order id, the offer line, the total, the first name. */
export interface ConfirmVars {
  order_id: string;
  offer: string;
  total: string;
  name: string;
}

const TOKEN = /\{\{|\}\}|\[\[([\s\S]*?)\]\]|\{(\w+)\}/g;

/** Fills `src` with `values` (OPE-§7.1 grammar, see the header). */
export function fillTemplate(src: string, values: Readonly<Record<string, string>>): string {
  let empty = false;
  const run = (s: string): string =>
    s.replace(TOKEN, (m, block: string | undefined, k: string | undefined) => {
      if (m === "{{") return "{";
      if (m === "}}") return "}";
      if (block !== undefined) {
        const outer = empty;
        empty = false;
        const text = run(block);
        const drop = empty;
        empty = outer;
        return drop ? "" : text;
      }
      const v = Object.prototype.hasOwnProperty.call(values, k!) ? String(values[k!]) : undefined;
      if (!v) empty = true;
      return v === undefined ? m : v;
    });
  return run(src);
}

/** `text` cut at the last space before `max` characters (or at `max` when the text has no space in its second half). */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max / 2 ? cut.slice(0, at) : cut).trimEnd();
}

/** The first word of a name ("Salma Benali" → "Salma"), "" for an empty name. */
export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || "";
}

/** The "Confirm on WhatsApp" text: `customer_confirm` filled, trimmed, cut at a word to `CONFIRM_TEXT_MAX`. */
export function confirmText(tpl: string, v: ConfirmVars): string {
  return cutAtWord(fillTemplate(tpl, { order_id: v.order_id, offer: v.offer, total: v.total, name: v.name }).trim(), CONFIRM_TEXT_MAX);
}
