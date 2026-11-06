/**
 * Policies, not promises (P7 AI; ai.md AI-§D.2 rule 3; rev 4 OPS-11, rev 5 CRIT2-1; core D73, LAN LD29). A generated
 * line that states a delivery time, a return window or refund, an exchange, an inspection before payment, a "free
 * delivery" or WHEN the shop calls is kept only when the store said so:
 *  - delivery time: the page's delivery line (owner-typed) or `policies.delivery.typicalDays`; a same-day / next-day
 *    word only when one of them says it;
 *  - free delivery: the offer's `freeShipping` / a page fee of 0, `policies.delivery.freeFromCents = 0`, or a threshold
 *    line with its amount when `freeFromCents` is set, or the delivery line itself;
 *  - returns, refunds: `policies.returns.accepted`; exchanges: `policies.exchange.accepted`; inspection:
 *    `policies.inspection = "allowed"`;
 *  - call timing: a stated hour must be one of `callingHours.text`'s (null for a window the owner never saved, so every
 *    stated hour is refused), "within N hours" must equal `store.confirmation.withinHours`, and "today" / "right away"
 *    needs one of them; a generic "we call you to confirm" is always allowed.
 * The figures themselves (the 7 of "7 jours") are checked by the number rule (./guard-numbers.ts).
 *
 * Patterns run on the folded text (lower case, no accents, Arabic without vowel marks, one alef, ة → ه): the Arabic
 * patterns below are written folded. Pure and isomorphic.
 */
import type { Locale } from "@/lib/page/schema";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import { foldWithMap } from "./guard-claims";
import { numbersIn } from "./guard-numbers";

export type PolicyKind = "delivery_time" | "free_delivery" | "returns" | "exchange" | "inspection" | "call_timing";
type Lang = "fr" | "en" | "ar";
const langOf = (l: Locale | string): Lang => (l === "ar" ? "ar" : l === "fr" ? "fr" : "en");

export interface PolicyClaim {
  kind: PolicyKind;
  /** the sentence that makes the claim */
  sentence: string;
  /** call_timing: the clock times stated, minutes after midnight */
  clock?: number[];
  /** call_timing: "within N hours" (dans l'heure = 1) */
  within?: number[];
  /** a day / immediacy word: today, tomorrow, right away, اليوم, دابا */
  dayWord?: boolean;
  /** free_delivery: the sentence states an amount (a threshold) */
  amount?: boolean;
}

/** The store's facts rule 3 reads (FinalizeCtx / GuardContext fields). */
export interface PolicyFacts {
  policies?: StorePolicyFacts;
  deliveryText?: string | null;
  /** the page's real delivery fee is 0, or the offer has freeShipping */
  freeShipping?: boolean;
  callingHours?: { text: string | null; withinHours: number | null };
}

/* ------------------------------------------------------------------ */
/* Per-locale patterns (folded text)                                   */
/* ------------------------------------------------------------------ */

const L = "\\p{L}*";
const P: Record<Lang, Record<Exclude<PolicyKind, "call_timing" | "delivery_time">, RegExp> & { delivery: RegExp; dayDelivery: RegExp; call: RegExp; within: RegExp; dayCall: RegExp }> = {
  fr: {
    free_delivery: /livraison\s+(?:est\s+)?(?:gratuite|offerte|gratis)|livree?s?\s+gratuitement|frais\s+de\s+(?:port|livraison)\s+(?:offerts|gratuits|inclus)|sans\s+frais\s+de\s+(?:port|livraison)|port\s+(?:offert|gratuit)|livraison\s+a\s+0/u,
    returns: new RegExp(`satisfait\\s+ou\\s+rembours${L}|rembours${L}|droit\\s+de\\s+retour|retours?\\s+(?:gratuits?|offerts?|possibles?|acceptes?|sous|dans|pendant)|(?:retourner|renvoyer)\\s+(?:le|la|les|votre|vos|l')\\s*(?:produit|article|commande|colis)`, "u"),
    exchange: new RegExp(`echang${L}`, "u"),
    inspection: new RegExp(`verifi${L}\\s+(?:avant|le\\s+colis|votre\\s+colis|la\\s+commande|votre\\s+commande|le\\s+produit)|ouvr${L}\\s+(?:le|votre)\\s+colis|inspect${L}|(?:voir|verifier|controler)\\s+(?:le|votre)\\s+(?:colis|produit)\\s+avant|avant\\s+de\\s+payer`, "u"),
    delivery: new RegExp(`livr${L}|recev${L}|recu|expedi${L}|delai`, "u"),
    dayDelivery: /aujourd'?\s?hui|demain|ce\s+soir|le\s+jour\s+meme|express/u,
    call: new RegExp(`(?<!\\p{L})(?:appel${L}|rappel${L}|contact${L}|joindr${L}|telephon${L})`, "u"),
    within: /(?:dans|sous|en\s+moins\s+d'?\s?|d'ici)\s*(?:l'|les?\s+|la\s+|une?\s+)?[^.,;!?]{0,18}?(?:heures?|h|minutes?|min)(?!\p{L})/gu,
    dayCall: /aujourd'?\s?hui|demain|ce\s+soir|dans\s+la\s+journee|le\s+jour\s+meme|immediatement|tout\s+de\s+suite|des\s+(?:reception|que)|sans\s+attendre/u,
  },
  en: {
    free_delivery: /free\s+(?:shipping|delivery)|(?:shipping|delivery)\s+(?:is\s+)?(?:free|on\s+us|included)|ships?\s+(?:for\s+)?free|no\s+(?:delivery|shipping)\s+(?:fees?|charges?|costs?)/u,
    returns: new RegExp(`money[\\s-]?back|refund${L}|free\\s+returns?|easy\\s+returns?|returns?\\s+(?:within|accepted|are\\s+free|policy|for\\s+free)|return\\s+(?:it|them|the\\s+product|your\\s+order)\\s+(?:within|for)`, "u"),
    exchange: new RegExp(`exchang${L}|swap\\s+(?:it|them|your)`, "u"),
    inspection: new RegExp(`check\\s+(?:it|the\\s+(?:parcel|package|product|order)|your\\s+(?:parcel|package|order))\\s+before|inspect${L}|open\\s+(?:the|your)\\s+(?:parcel|package|box)\\s+before|before\\s+(?:you\\s+)?pay(?:ing)?`, "u"),
    delivery: new RegExp(`deliver${L}|ship${L}|arriv${L}|receiv${L}|dispatch${L}`, "u"),
    dayDelivery: /today|tomorrow|tonight|same[\s-]day|next[\s-]day|overnight|express/u,
    call: new RegExp(`(?<!\\p{L})(?:call${L}|phon${L}|contact${L}|reach\\s+(?:you|out))`, "u"),
    within: /(?:within|in\s+under|in\s+less\s+than|in)\s+(?:the\s+|an?\s+|one\s+)?[^.,;!?]{0,18}?(?:hours?|hrs?|h|minutes?|mins?)(?!\p{L})/gu,
    dayCall: /today|tomorrow|tonight|same[\s-]day|right\s+away|immediately|straight\s+away|as\s+soon\s+as/u,
  },
  ar: {
    free_delivery: /(?:ال)?(?:توصيل|شحن)\s+(?:ال)?(?:مجاني|مجانا|مجانيه|فابور|بالمجان|بلاش|علي\s+حسابنا)|بدون\s+(?:مصاريف|رسوم|تكاليف)\s+(?:ال)?(?:توصيل|شحن)|(?:ال)?توصيل\s+(?:ب|ف)?\s*0/u,
    returns: /(?:ال)?ارجاع|(?:ال)?استرجاع|(?:ال)?استرداد|رد\s+المبلغ|ترجع(?:ه|ي|و)?\s+(?:ال)?(?:منتوج|منتج|سلعه|فلوس)|نرجعو\s+ليك\s+(?:ال)?فلوس|ضمان\s+(?:ال)?استرجاع/u,
    exchange: /(?:ال)?استبدال|(?:ال)?تبديل|تبدل(?:و|ي|ه)?(?!\p{L})|نبدلو\p{L}*|بدل(?:ه|و)?\s+ليك/u,
    inspection: /(?:ت|ن|ي)?عاين\p{L}*|(?:ال)?معاينه|تفتح\s+(?:ال)?(?:كولي|طرد|كوليه)|قبل\s+(?:ما\s+)?(?:تخلص|الدفع|تدفع)|تشوف\s+(?:ال)?(?:منتوج|منتج|سلعه|كولي)\s+قبل/u,
    delivery: /(?:ال)?توصيل|(?:ك|غ|ت|ي|ن)?يوصل\p{L}*|توصل\p{L}*|يصلك|سيصلك|تستلم\p{L}*|(?:ال)?شحن|نسيفطو|كنسيفطو/u,
    dayDelivery: /(?:^|\s)(?:ال)?يوم(?:\s|$)|ليوم|غدا|غدوه|نفس\s+(?:ال)?(?:يوم|نهار)|هاد\s+النهار|(?:^|\s)سريع\s+جدا/u,
    call: /نتصل\p{L}*|سنتصل\p{L}*|يتصل\p{L}*|نعيط\p{L}*|كنعيط\p{L}*|غنعيط\p{L}*|يعيط\p{L}*|(?:ال)?اتصال|(?:ال)?مكالمه|نكلم\p{L}*|سنتواصل|نتواصلو|نتاصلو/u,
    within: /(?:خلال|في\s+غضون|فغضون|ف|في|قبل|اقل\s+من)\s+(?:اقل\s+من\s+)?[^.,،؛!؟]{0,15}?(?:ساعه|ساعات|ساعتين|سوايع|دقيقه|دقايق|دقائق)(?!\p{L})/gu,
    dayCall: /(?:^|\s)(?:ال)?يوم(?:\s|$)|ليوم|غدا|غدوه|هاد\s+النهار|نفس\s+(?:ال)?(?:يوم|نهار)|دابا|فورا|دغيا|مباشره/u,
  },
};

/** "9h30", "09:30", "18h", "9 am", "الساعه 10" → minutes after midnight */
const CLOCK = /(?<![\d.,])([01]?\d|2[0-3])\s?(?:h|:|ه)\s?([0-5]\d)?(?![\d%])|(?<![\d.,])(1[0-2]|0?\d)\s?(am|pm)(?!\p{L})/gu;
const AR_HOUR_WORD = /(?:ال)?ساعه\s+(\d{1,2})(?:\s?:\s?([0-5]\d))?/gu;

/** Every clock time stated in `text`, as minutes after midnight (the window's hours text, a generated line). */
export function clockTimesIn(text: string): number[] {
  const { f } = foldWithMap(asciiDigitsLocal(text));
  const out: number[] = [];
  for (const m of f.matchAll(CLOCK)) {
    if (m[3]) out.push(((Number(m[3]) % 12) + (m[4] === "pm" ? 12 : 0)) * 60);
    else out.push(Number(m[1]) * 60 + Number(m[2] ?? 0));
  }
  for (const m of f.matchAll(AR_HOUR_WORD)) out.push(Number(m[1]) * 60 + Number(m[2] ?? 0));
  return [...new Set(out)];
}
const asciiDigitsLocal = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

const SENTENCE = /[^.!?؟;\n]+[.!?؟;\n]*/gu;

/** Every policy promise in `text` (`locale`'s patterns), one entry per kind per sentence. */
export function policyClaimsIn(text: string, locale: Locale | string): PolicyClaim[] {
  const lang = langOf(locale);
  const p = P[lang];
  const out: PolicyClaim[] = [];
  for (const m of text.matchAll(SENTENCE)) {
    const sentence = m[0].trim();
    if (!sentence) continue;
    const { f } = foldWithMap(asciiDigitsLocal(sentence));
    for (const kind of ["free_delivery", "returns", "exchange", "inspection"] as const) {
      if (p[kind].test(f)) out.push({ kind, sentence, ...(kind === "free_delivery" ? { amount: numbersIn(sentence, lang).length > 0 } : {}) });
    }
    if (p.delivery.test(f)) {
      const timed = numbersIn(sentence, lang).some((t) => t.unit === "time");
      const day = p.dayDelivery.test(f);
      if (timed || day) out.push({ kind: "delivery_time", sentence, dayWord: day });
    }
    if (p.call.test(f)) {
      // "within N hours" first: its digits are a duration, not a clock time
      const within: number[] = [];
      let rest = f;
      for (const w of f.matchAll(p.within)) {
        const tok = numbersIn(w[0], lang).find((t) => t.unit === "time");
        within.push(tok ? Math.round((tok.base / 60) * 100) / 100 : 1);
        rest = rest.replace(w[0], " ");
      }
      const clock = clockTimesIn(rest);
      const dayWord = p.dayCall.test(rest);
      if (within.length || clock.length || dayWord) out.push({ kind: "call_timing", sentence, clock, within, dayWord });
    }
  }
  return out;
}

/** Is this promise one the store made? Each kind is checked only when its facts are given (absent = not judged). */
export function policyAllows(claim: PolicyClaim, facts: PolicyFacts): boolean {
  const pol = facts.policies;
  switch (claim.kind) {
    case "call_timing": {
      const ch = facts.callingHours;
      if (!ch) return true;
      if (claim.clock?.length) {
        const allowed = ch.text === null ? [] : clockTimesIn(ch.text);
        if (!claim.clock.every((c) => allowed.includes(c))) return false;
      }
      if (claim.within?.length && !claim.within.every((n) => ch.withinHours !== null && n === ch.withinHours)) return false;
      if (claim.dayWord && ch.text === null && ch.withinHours === null) return false;
      return true;
    }
    case "free_delivery": {
      if (facts.freeShipping) return true;
      if (facts.deliveryText && policyClaimsIn(facts.deliveryText, "fr").concat(policyClaimsIn(facts.deliveryText, "ar"), policyClaimsIn(facts.deliveryText, "en")).some((c) => c.kind === "free_delivery")) return true;
      if (!pol) return true;
      const from = pol.delivery.freeFromCents;
      return from === 0 || (from !== null && claim.amount === true);
    }
    case "delivery_time": {
      if (!pol) return true;
      const days = pol.delivery.typicalDays;
      const line = facts.deliveryText?.trim() ?? "";
      if (claim.dayWord) {
        const lineFast = line !== "" && (["fr", "en", "ar"] as const).some((l) => P[l].dayDelivery.test(foldWithMap(line).f) || numbersIn(line, l).some((t) => t.unit === "time" && t.base <= 1_440));
        return (days !== null && days[0] <= 1) || lineFast;
      }
      return days !== null || line !== "";
    }
    case "returns":
      return !pol || pol.returns.accepted === true;
    case "exchange":
      return !pol || pol.exchange.accepted === true;
    case "inspection":
      return !pol || pol.inspection === "allowed";
  }
}

/** The figures the policies state, for the number rule: delivery days, return and exchange windows, refund days, warranty months, the free-delivery threshold. */
export function policyNumbers(pol: StorePolicyFacts | undefined): { value: number; unit: "time" | "money" | null; factor: number }[] {
  if (!pol) return [];
  const DAY = 1_440;
  const out: { value: number; unit: "time" | "money" | null; factor: number }[] = [];
  for (const d of pol.delivery.typicalDays ?? []) out.push({ value: d, unit: "time", factor: DAY });
  for (const d of [pol.returns.windowDays, pol.exchange.windowDays, pol.refund.withinDays]) if (d !== null) out.push({ value: d, unit: "time", factor: DAY });
  if (pol.warranty.months !== null) out.push({ value: pol.warranty.months, unit: "time", factor: 43_200 });
  if (pol.delivery.freeFromCents !== null) out.push({ value: pol.delivery.freeFromCents / 100, unit: "money", factor: 1 });
  return out;
}
