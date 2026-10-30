/**
 * WhatsApp click-to-chat for agents (P4 CALL CENTER; operations.md OPE-§22.1-§22.3, §8.2, §L "WhatsApp link", OD24).
 * Pure and isomorphic: the template ids the queue card lists, the built-in texts of the four agent kinds, and the
 * `wa.me` link the reveal answers.
 *
 *   ids          a store's `message_templates` row is its own id (26 characters); a built-in is `builtin:wa:<kind>`
 *   BUILTIN_WA   OPE-§22.2's agent kinds (confirm, missed_call, address, delivery_day), verbatim in fr / ar / en.
 *                ADAPTER: the built-ins are P5's (`src/lib/integrations/whatsapp/builtins.ts`, OD1), which is not in
 *                this base yet; P4 merges after P5, and P4's verify step (after the rebase on P5) swaps this table
 *                for P5's export, so one copy remains
 *   waLink       `https://wa.me/<E.164 digits>?text=<encodeURIComponent(text)>`, text ≤ 1,000 characters, URL ≤ 2,000:
 *                over the limit the optional blocks are dropped first, then `units_text` is shortened with "…", then
 *                (a custom template only) the text is cut with "…"; the order id always stays. Plain text, no bidi
 *                control character added.
 */
import type { RenderTemplate, ScriptLocale, TemplateValues } from "./script";

export const AGENT_WA_KINDS = ["confirm", "missed_call", "address", "delivery_day"] as const;
export type AgentWaKind = (typeof AGENT_WA_KINDS)[number];
const isAgentKind = (v: string): v is AgentWaKind => (AGENT_WA_KINDS as readonly string[]).includes(v);

export const builtinWaId = (kind: AgentWaKind): string => `builtin:wa:${kind}`;
const ROW_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** A template id of the card: a built-in kind, a store row id, or null for anything else. */
export function parseWaTemplateId(id: unknown): { builtin: AgentWaKind } | { rowId: string } | null {
  if (typeof id !== "string") return null;
  if (id.startsWith("builtin:wa:")) {
    const kind = id.slice("builtin:wa:".length);
    return isAgentKind(kind) ? { builtin: kind } : null;
  }
  return ROW_ID.test(id) ? { rowId: id } : null;
}

/** OPE-§22.2, the kinds agents send (see the header: an adapter of P5's built-ins). */
export const BUILTIN_WA: Readonly<Record<AgentWaKind, Readonly<Record<ScriptLocale, string>>>> = {
  confirm: {
    fr: "Bonjour {customer_first_name}, ici {store_name}. Nous avons bien reçu votre commande {order_id} : {offer_label}, total {total}.[[ Livraison prévue {eta_text}.]] Répondez OK pour confirmer, ou dites-nous ce qu'il faut changer.",
    ar: "السلام {customer_first_name}، معاك {store_name}. توصلنا بالطلب ديالك {order_id}: {offer_label}، المجموع {total}.[[ التوصيل متوقع {eta_text}.]] جاوبنا ب OK باش نأكدو، ولا قول لينا شنو نبدلو.",
    en: "Hello {customer_first_name}, this is {store_name}. We received your order {order_id}: {offer_label}, total {total}.[[ Delivery is planned {eta_text}.]] Reply OK to confirm, or tell us what to change.",
  },
  missed_call: {
    fr: "Bonjour {customer_first_name}, nous avons essayé de vous appeler pour votre commande {order_id}. Quand pouvons-nous vous rappeler ?",
    ar: "السلام {customer_first_name}، عيطنا ليك على قبل الطلب ديالك {order_id}. إمتى نقدرو نعاودو نعيطو ليك؟",
    en: "Hello {customer_first_name}, we tried to call you about your order {order_id}. When can we call you back?",
  },
  address: {
    fr: "Pour livrer votre commande {order_id}, pouvez-vous nous envoyer votre adresse exacte à {city} et un repère proche ?",
    ar: "باش نوصلو ليك الطلب {order_id}، صيفط لينا العنوان بالضبط ف {city} وشي علامة قريبة.",
    en: "To deliver your order {order_id}, could you send us your exact address in {city} and a landmark nearby?",
  },
  delivery_day: {
    fr: "Votre commande {order_id} est en route[[ et arrive {eta_text}]]. Merci de rester joignable.",
    ar: "الطلب ديالك {order_id} خرج[[ وغادي يوصل {eta_text}]]. خليك متوفر ف التيليفون عافاك.",
    en: "Your order {order_id} is on its way[[ and arrives {eta_text}]]. Please stay reachable.",
  },
};

/** The built-ins a card offers per lane (OPE-§22.2 "used by agents"), most useful first. */
export const WA_KINDS_BY_LANE: Readonly<Record<"confirm" | "delivery", readonly AgentWaKind[]>> = {
  confirm: ["confirm", "missed_call", "address"],
  delivery: ["delivery_day", "missed_call", "address"],
};

/** OPE-§L: text ≤ 1,000 characters, URL ≤ 2,000 */
export const WA_TEXT_MAX = 1_000;
export const WA_URL_MAX = 2_000;

/** `https://wa.me/<digits>` (+ `?text=` when there is a text). `e164` with or without "+". */
export function waUrl(e164: string, text?: string): string {
  const digits = e164.replace(/\D/g, "");
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

/** The template without its optional blocks (`[[ … ]]`); escaped braces untouched. */
export function stripOptionalBlocks(src: string): string {
  return src.replace(/\[\[[\s\S]*?\]\]/g, "");
}

const chars = (s: string): string[] => Array.from(s);
const clip = (s: string, max: number): string => {
  const c = chars(s);
  return c.length <= max ? s : `${c.slice(0, max - 1).join("")}…`;
};

/** The longest prefix length k in [lo, hi] with fits(k), assuming fits is monotone (true then false). */
function longest(lo: number, hi: number, fits: (k: number) => boolean): number {
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** The `wa.me` link of a rendered template under OPE-§22.3's limits (see the header). */
export function waLink(e164: string, src: string, values: TemplateValues, render: RenderTemplate, orderId: string): string {
  const fits = (text: string) => waUrl(e164, text).length <= WA_URL_MAX;
  const text0 = clip(render(src, values).trim(), WA_TEXT_MAX);
  if (fits(text0)) return waUrl(e164, text0);
  // 1. the optional blocks go first
  const bare = stripOptionalBlocks(src);
  const text1 = clip(render(bare, values).trim(), WA_TEXT_MAX);
  if (fits(text1)) return waUrl(e164, text1);
  // 2. then the warehouse text, shortened with "…"
  const units = values.units_text ? chars(values.units_text) : [];
  if (units.length) {
    const withUnits = (k: number) => clip(render(bare, { ...values, units_text: `${units.slice(0, k).join("")}…` }).trim(), WA_TEXT_MAX);
    const k = longest(0, units.length - 1, (n) => fits(withUnits(n)));
    if (k >= 0) return waUrl(e164, withUnits(k));
  }
  // 3. a custom template still too long: cut the text, never the order id
  const short = units.length ? clip(render(bare, { ...values, units_text: "…" }).trim(), WA_TEXT_MAX) : text1;
  const all = chars(short);
  const cut = (k: number) => `${all.slice(0, k).join("")}…`;
  const k = longest(0, all.length, (n) => fits(cut(n)));
  const head = k >= 0 ? cut(k) : "";
  if (head.includes(orderId)) return waUrl(e164, head);
  const prefixed = (n: number) => `${orderId} · ${all.slice(0, n).join("")}…`;
  const j = longest(0, all.length, (n) => fits(prefixed(n)));
  return waUrl(e164, j >= 0 ? prefixed(j) : orderId);
}
