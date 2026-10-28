/**
 * `callcenter.script` (AI-15 R1 slice for SF-01; ai.md AI-§D.3, AI-D31; operations.md OPE-§7.1-7.4): the call script
 * of one product, never of one customer. The output is P4's `ScriptDoc` (src/lib/callcenter/script.ts); the per-order
 * personalisation (name, pack, city) is done by templates in the agent console, so the input has no field a customer
 * datum could travel in, and the model writes `{customer_first_name}`, never a name.
 *
 * `callScriptFinalize(input)` (AI-§D.3 row, AI-15 acceptance 1 and 6):
 *  - every `say` is a template of the OPE-§7.1 language: only its variables (`TEMPLATE_VARS`; the objections only the
 *    store-side ones), "[[ … ]]" optional blocks; its words pass the guard (numbers: the facts, packs, prices and the
 *    upsell; claims; policies, incl. call-back times only from `ctx.callingHours`), and no contact data;
 *  - no discount, gift or delay the store did not configure (a discount needs a pack priced under its compare-at
 *    price, a gift a pack that carries one, a delay is never configured in R1);
 *  - objections only from the six ids, one each;
 *  - the address step follows `checkout.addressMode`: `optional` → it asks for the quartier and a landmark,
 *    `required` → it only confirms the address (the canonical step replaces the model's when it does otherwise);
 *  - the upsell step only when the store configured an upsell;
 *  - the result parses with `ScriptDoc`, else null.
 */
import { ScriptDoc } from "@/lib/callcenter/script";
import { TEMPLATE_VARS } from "@/lib/integrations/templates";
import { allowedNumbersFor, guardText } from "../../guard";
import { foldWithMap } from "../../guard-claims";
import { scanPii } from "../../safety/pii";
import type { CopyLocale, TaskProduct } from "./common";
import { isRecord, type Finalize, type FinalizeCtx } from "./types";

export interface CallScriptInput {
  locale: CopyLocale;
  product: TaskProduct;
  /** the offer's packs as configured (integer minor units); `compareAtMinor` above the price = a configured discount, `gift` = a configured gift */
  packs: { label: string; qty: number; priceMinor: number; compareAtMinor?: number | null; gift?: string | null }[];
  /** the configured thank-you upsell, or null (AI-15: one upsell line from it) */
  upsell: { title: string; priceMinor: number } | null;
  /** the store's voice (`store_ai.voice.darija`) */
  darija: "none" | "cta" | "light";
  /** `checkout.addressMode` (UX-31): optional → quartier + repère checklist line; required → confirm only */
  addressMode: "required" | "optional" | null;
}

export type { ScriptDoc as CallScriptOut } from "@/lib/callcenter/script";

/** the variables an objection answer may use: the store's facts, never the customer's */
export const OBJECTION_VARS: readonly string[] = ["eta_text", "total", "confirm_number", "confirm_hours", "store_name", "offer_label", "shipping_text", "product", "units_text", "qty"];

/* ------------------------------------------------------------------ */
/* Unconfigured offers (per locale, folded text)                       */
/* ------------------------------------------------------------------ */

const DISCOUNT = /(?<!\p{L})(?:remise|reduction|rabais|promo(?:tion)?|soldes?|moins\s+cher|prix\s+special|discount|coupon|promo\s+code|special\s+price|on\s+sale|\d+\s*%\s*(?:off|de\s+reduction)|تخفيض\p{L}*|خصم|روميز|ريميز|بروموسيون|برومو|عرض\s+خاص|ثمن\s+خاص|نقص\s+ف\s+الثمن|نقصو\s+ليك)/u;
const GIFT = /(?<!\p{L})(?:cadeau|offert|offerte|gratuit|gratuite|gift|free|bonus|complimentary|هديه|كادو|فابور|مجانا|مجاني|بلاش)(?!\p{L})/u;
/** a free delivery is rule 3's (policies), not a gift */
const FREE_DELIVERY = /livraison\s+(?:est\s+)?(?:gratuite|offerte)|free\s+(?:shipping|delivery)|(?:ال)?توصيل\s+(?:ال)?(?:مجاني|فابور|بالمجان|مجانا)/gu;
const DELAY = /(?<!\p{L})(?:reporter|decaler|plus\s+tard|livrer\s+la\s+semaine\s+prochaine|on\s+peut\s+attendre|postpone|delay|later\s+date|hold\s+(?:the|your)\s+order|نأجلو|ناجلو|نأخرو|ناخرو|نخليوها\s+حتى|تأجيل|تاجيل)/u;

/* ------------------------------------------------------------------ */
/* Address step (UX-31)                                                */
/* ------------------------------------------------------------------ */

type Step = ScriptDoc["steps"][number];
const ADDRESS_STEP: Record<"optional" | "required", Record<CopyLocale, Step>> = {
  optional: {
    fr: { id: "address", title: "Adresse", say: "Vous êtes bien à {city} ? Quel est votre quartier, et un repère proche pour le livreur ?", checks: ["Quartier noté", "Repère noté"], when: "always", action: "edit_address" },
    ar: { id: "address", title: "العنوان", say: "واش انت ف {city}؟ شنو هو الحي ديالك، وشي علامة قريبة للموزع؟", checks: ["الحي", "العلامة القريبة"], when: "always", action: "edit_address" },
    en: { id: "address", title: "Address", say: "You're in {city}, right? Which district are you in, and is there a landmark near you for the courier?", checks: ["District noted", "Landmark noted"], when: "always", action: "edit_address" },
  },
  required: {
    fr: { id: "address", title: "Adresse", say: "Je confirme l'adresse : {address}, {city}. C'est bien ça ?", checks: ["Adresse confirmée"], when: "always", action: "edit_address" },
    ar: { id: "address", title: "العنوان", say: "نأكد معاك العنوان: {address}، {city}. صحيح؟", checks: ["العنوان مؤكد"], when: "always", action: "edit_address" },
    en: { id: "address", title: "Address", say: "Let me confirm the address: {address}, {city}. Is that right?", checks: ["Address confirmed"], when: "always", action: "edit_address" },
  },
};
const ASKS_DISTRICT = /quartier|district|neighbou?rhood|(?:ال)?حي(?!\p{L})|(?:ال)?حومه/u;
const ASKS_LANDMARK = /repere|landmark|علامه|معلمه/u;
const isAddressStep = (s: { id: string; action: string }) => s.action === "edit_address" || /^(?:address|adresse|addr|adr)/.test(s.id);

/* ------------------------------------------------------------------ */
/* Templates through the guard                                         */
/* ------------------------------------------------------------------ */

const VAR = /\{([a-z_]+)\}/g;
/** private-use sentinels keep the template syntax intact through the guard's markup strip */
const SENT_OPEN = "\uE002";
const SENT_CLOSE = "\uE003";
const sentinel = (i: number) => `\uE000${String.fromCharCode(0xe100 + i)}\uE001`;

/**
 * A template's words through the guard: its variables (only `vars`) and "[[ … ]]" blocks are held aside, the rest is
 * guarded like any model line, then put back. null = an unknown variable, a broken block, contact data or a rule broken.
 */
function guardTemplate(src: unknown, ctx: FinalizeCtx, allowed: ReturnType<typeof allowedNumbersFor>, max: number, vars: readonly string[], offers: { discount: boolean; gift: boolean }): string | null {
  if (typeof src !== "string") return null;
  if (scanPii(src).hits.length) return null;
  const names: string[] = [];
  let unknown = false;
  const held = src
    .replace(/\{\{|\}\}/g, "")
    .replace(VAR, (_, name: string) => {
      if (!vars.includes(name)) unknown = true;
      names.push(name);
      return sentinel(names.length - 1);
    })
    .replace(/\[\[/g, SENT_OPEN)
    .replace(/\]\]/g, SENT_CLOSE);
  if (unknown) return null;
  if ((held.match(/\uE002/g)?.length ?? 0) !== (held.match(/\uE003/g)?.length ?? 0)) return null;
  const r = guardText(held, ctx, allowed, max);
  if (!r.ok) return null;
  const folded = foldWithMap(r.text).f;
  if (DELAY.test(folded)) return null;
  if (!offers.discount && DISCOUNT.test(folded)) return null;
  if (!offers.gift && GIFT.test(folded.replace(FREE_DELIVERY, " "))) return null;
  const out = r.text
    .replace(/\uE000([\uE100-\uE1FF])\uE001/g, (_, c: string) => `{${names[c.charCodeAt(0) - 0xe100]}}`)
    .replace(/\uE002/g, "[[")
    .replace(/\uE003/g, "]]");
  return names.every((n) => out.includes(`{${n}}`)) ? out : null;
}

/** The guard of `callcenter.script` for the input's product, packs, upsell and address mode. */
export function callScriptFinalize(input: CallScriptInput): Finalize<ScriptDoc> {
  return (raw, ctx) => {
    if (!isRecord(raw) || !Array.isArray(raw.steps)) return null;
    const gctx: FinalizeCtx = { ...ctx, locale: input.locale };
    const allowed = allowedNumbersFor(gctx);
    for (const p of input.packs) allowed.addValue(p.qty, "count", 1).addValue(p.priceMinor / 100).addValue(p.compareAtMinor ? p.compareAtMinor / 100 : NaN);
    if (input.upsell) allowed.addValue(input.upsell.priceMinor / 100);
    const offers = { discount: input.packs.some((p) => (p.compareAtMinor ?? 0) > p.priceMinor), gift: input.packs.some((p) => Boolean(p.gift?.trim())) };
    const rejected: string[] = [];
    const steps: Step[] = [];
    const ids = new Set<string>();

    raw.steps.slice(0, 12).forEach((s, i) => {
      const drop = () => rejected.push(`steps.${i}`);
      if (!isRecord(s) || typeof s.id !== "string" || !/^[a-z0-9_]{1,20}$/.test(s.id) || ids.has(s.id)) return drop();
      const when = s.when === "upsell" ? "upsell" : "always";
      const action = s.action === "add_upsell" || s.action === "edit_address" ? s.action : "none";
      if ((when === "upsell" || action === "add_upsell") && !input.upsell) return drop();
      const title = guardText(s.title, gctx, allowed, 40);
      const say = guardTemplate(s.say, gctx, allowed, 400, TEMPLATE_VARS, offers);
      if (!title.ok || say === null) return drop();
      const checks = (Array.isArray(s.checks) ? s.checks : [])
        .slice(0, 4)
        .map((c) => guardText(c, gctx, allowed, 60))
        .filter((c) => c.ok)
        .map((c) => (c as { text: string }).text);
      ids.add(s.id);
      steps.push({ id: s.id, title: title.text, say, checks, when, action });
    });

    // the address step follows the store's address mode (UX-31)
    if (input.addressMode) {
      const canonical = ADDRESS_STEP[input.addressMode][input.locale];
      const at = steps.findIndex(isAddressStep);
      const current = at >= 0 ? steps[at]! : null;
      const text = current ? foldWithMap(`${current.say} ${current.checks.join(" ")}`).f : "";
      const fits = current && (input.addressMode === "optional" ? ASKS_DISTRICT.test(text) && ASKS_LANDMARK.test(text) : current.say.includes("{address}") && !ASKS_LANDMARK.test(text) && !ASKS_DISTRICT.test(text));
      if (!fits) {
        if (current) rejected.push(`steps.address`);
        const step = { ...canonical, id: current?.id ?? (ids.has("address") ? "address_x" : "address") };
        if (at >= 0) steps[at] = step;
        else steps.splice(Math.min(2, steps.length), 0, step);
      }
    }

    const objections: ScriptDoc["objections"] = [];
    const seen = new Set<string>();
    (Array.isArray(raw.objections) ? raw.objections : []).forEach((o, i) => {
      const parsed = isRecord(o) ? ScriptDoc.shape.objections.unwrap().element.safeParse(o) : null;
      if (!parsed?.success || seen.has(parsed.data.id) || objections.length >= 6) return void rejected.push(`objections.${i}`);
      const say = guardTemplate(parsed.data.say, gctx, allowed, 300, OBJECTION_VARS, offers);
      if (say === null) return void rejected.push(`objections.${i}`);
      seen.add(parsed.data.id);
      objections.push({ id: parsed.data.id, say });
    });

    const doc = ScriptDoc.safeParse({ v: 1, steps, objections });
    return doc.success ? { value: doc.data, rejected } : null;
  };
}
