/**
 * The store's promises (P3 LANDING; landing.md LD29, LAN-§3.3, LAN-§6.3; docs/STORE-SAAS.md §M.3, D73): `policies`
 * is the single source of every promise a page, a message or a generated line may make. Two pure, isomorphic helpers,
 * kept stable for their readers (P3's honesty gate and legal pages, P7's prompt and guard `src/lib/ai/guard-policies.ts`):
 *
 *   policyLines(facts, "fr")              → ≤ 6 lines, ≤ 300 tokens, for the AI prompt (ai.md AI-§F.2 "Store policies")
 *   policyAllows(facts, claim)            → "allowed" | "unset" | "contradicted" (the gate's soft / hard split)
 *   policyClaims(text, "fr")              → the claims of a text (./claims.ts, re-exported here)
 *
 * An unset answer (`"unset"`, `null`) never becomes a sentence and never backs a claim: `policyLines` leaves its line
 * out and `policyAllows` answers "unset", which the gate lists as a note for owner-typed text ("Set it in Policies")
 * and refuses for generated text. "contradicted" means the store said the opposite (returns not accepted and "retour
 * sous 7 jours", a 29 DH fee and "livraison gratuite", no confirmation call and "on vous appelle"): always a refusal.
 *
 * `facts` is the `policies` setting alone (`StorePolicyFacts`) or `PromiseFacts`, which adds what only the page or
 * other settings know: the page's real delivery fee, the zones, `checkout.confirmationCall`,
 * `store.confirmation.withinHours` and the calling window as a shopper may be told it. A fact left out is unknown,
 * so the claim it would back answers "unset", never "allowed".
 */
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { PolicyClaim, PolicyClaimKind } from "./claims";

export { POLICY_CLAIM_KINDS, policyClaims, type ClaimQualifier, type PolicyClaim, type PolicyClaimKind } from "./claims";

export type PolicyVerdict = "allowed" | "unset" | "contradicted";

/** Everything a promise may rest on. Only `policies` is required; an absent field is unknown here. */
export interface PromiseFacts {
  policies: StorePolicyFacts;
  /** `checkout.confirmationCall`: the store confirms every order by phone */
  confirmationCall?: boolean;
  /** `store.confirmation.withinHours`: "we call within N hours"; null = no such promise */
  withinHours?: number | null;
  /**
   * The calling window (P4's `EffectiveWindow`, read through src/lib/landing/hours.ts by the caller): `configured` =
   * `shopperPromiseAllowed(w)`, `empty` = `windowIsEmpty(w, now)`, `ranges` = the distinct ranges of the next seven
   * store days ("09:30"-"13:00"). A call-time claim is a fact only while `configured && !empty` (`!noShopperHours`).
   */
  callWindow?: { configured: boolean; empty: boolean; ranges: readonly { from: string; to: string }[] };
  /** the page's real delivery charge: `offers.shippingFee` (currency units, 0 = free) and whether one offer has `freeShipping` */
  page?: { shippingFee: number; freeOffer: boolean };
  /** `checkout.zonesEnabled` and the [etaMinDays, etaMaxDays] of every zone that has days */
  zones?: { enabled: boolean; days: readonly (readonly [number, number])[] };
}

const isPromiseFacts = (f: StorePolicyFacts | PromiseFacts): f is PromiseFacts => "policies" in f && !!(f as PromiseFacts).policies;

/** A claim with no stated quantity (the kind alone: "the page promises a free delivery"). */
const bare = (kind: PolicyClaimKind): PolicyClaim => ({ kind, text: "", start: 0, end: 0, min: null, max: null, qualifier: null, times: [] });

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** A stated clock time falls inside one of the window's ranges (a range that crosses midnight wraps). */
function inWindow(time: string, ranges: readonly { from: string; to: string }[]): boolean {
  const t = minutes(time);
  return ranges.some((r) => {
    const from = minutes(r.from);
    const to = minutes(r.to);
    return from <= to ? t >= from && t <= to : t >= from || t <= to;
  });
}

/** A stated "within N" bound against the store's own: a claim may promise less than the policy, never more. */
const within = (stated: number | null, policy: number | null, faster: boolean): PolicyVerdict => {
  if (stated === null) return "allowed";
  if (policy === null) return "unset";
  // faster = the claim promises a shorter time than the policy (delivery, refund, call); else a longer one (returns, warranty)
  return faster ? (stated < policy ? "contradicted" : "allowed") : stated > policy ? "contradicted" : "allowed";
};

/**
 * Whether the store's facts back a claim. `claim` is a claim from `policyClaims` (its numbers count) or a kind alone.
 *
 *   delivery_time      the zones' days when zones are on, else `delivery.typicalDays`; contradicted when no zone (or
 *                      the typical range) can be as fast as stated
 *   free_delivery      the page's fee (0, or an offer with free delivery) when the page is known, else
 *                      `delivery.freeFromCents` (a threshold must equal it)
 *   return_window      `returns.accepted` (false contradicts), the stated days ≤ `returns.windowDays`; "free" needs
 *                      `whoPays = "store"`
 *   exchange           `exchange.accepted`, the stated days ≤ `exchange.windowDays`
 *   inspection         `inspection` allowed / not_allowed / unset
 *   warranty           `warranty.months`, the stated months ≤ it; "lifetime" is never backed by a number of months
 *   refund             a method or a delay, `returns.accepted = false` contradicts "satisfait ou remboursé"; a stated
 *                      delay ≥ `refund.withinDays`
 *   confirmation_call  `checkout.confirmationCall` (false contradicts every call claim); "within N h" ≥
 *                      `store.confirmation.withinHours`; a clock time or "today" needs a configured, non-empty window
 *                      (not configured = unset, a time outside its ranges = contradicted)
 */
export function policyAllows(facts: StorePolicyFacts | PromiseFacts, claim: PolicyClaim | PolicyClaimKind): PolicyVerdict {
  const f: PromiseFacts = isPromiseFacts(facts) ? facts : { policies: facts };
  const c = typeof claim === "string" ? bare(claim) : claim;
  const p = f.policies;
  switch (c.kind) {
    case "delivery_time": {
      const stated = c.qualifier === "same_day" || c.qualifier === "today" ? 0 : c.qualifier === "next_day" ? 1 : c.max;
      const spans = f.zones?.enabled ? f.zones.days : p.delivery.typicalDays ? [p.delivery.typicalDays] : [];
      if (!spans.length) return "unset";
      if (stated === null) return "allowed";
      // some zone (or the typical range) can deliver as fast as stated
      return spans.some(([min]) => min <= stated) ? "allowed" : "contradicted";
    }
    case "free_delivery": {
      if (f.page) return f.page.shippingFee === 0 || f.page.freeOffer ? "allowed" : "contradicted";
      const from = p.delivery.freeFromCents;
      if (from === null) return "unset";
      return c.max === null || Math.round(c.max * 100) === from ? "allowed" : "contradicted";
    }
    case "return_window": {
      if (p.returns.accepted === null) return "unset";
      if (!p.returns.accepted) return "contradicted";
      if (c.qualifier === "free") return p.returns.whoPays === "store" ? "allowed" : p.returns.whoPays === "customer" ? "contradicted" : "unset";
      return within(c.max, p.returns.windowDays, false);
    }
    case "exchange": {
      if (p.exchange.accepted === null) return "unset";
      if (!p.exchange.accepted) return "contradicted";
      if (c.qualifier === "free") return "unset"; // the policies say nothing about who pays an exchange
      return within(c.max, p.exchange.windowDays, false);
    }
    case "inspection":
      return p.inspection === "allowed" ? "allowed" : p.inspection === "not_allowed" ? "contradicted" : "unset";
    case "warranty": {
      if (p.warranty.months === null) return "unset";
      if (c.qualifier === "lifetime") return "contradicted";
      return within(c.max, p.warranty.months, false);
    }
    case "refund": {
      if (c.qualifier === "money_back" && p.returns.accepted === false) return "contradicted";
      const set = p.refund.method !== "unset" || p.refund.withinDays !== null;
      if (!set) return "unset";
      return within(c.max, p.refund.withinDays, true);
    }
    case "confirmation_call": {
      if (f.confirmationCall === undefined) return "unset";
      if (!f.confirmationCall) return "contradicted";
      let verdict: PolicyVerdict = "allowed";
      if (c.max !== null || c.qualifier === "within_hour") {
        const hours = c.max ?? 1;
        const promised = f.withinHours ?? null;
        verdict = promised === null ? "unset" : hours < promised ? "contradicted" : "allowed";
      }
      if (c.times.length || c.qualifier === "today") {
        const w = f.callWindow;
        const byWindow: PolicyVerdict = !w || !w.configured ? "unset" : w.empty ? "contradicted" : c.times.every((t) => inWindow(t, w.ranges)) ? "allowed" : "contradicted";
        verdict = worst(verdict, byWindow);
      }
      return verdict;
    }
  }
}

const RANK: Record<PolicyVerdict, number> = { allowed: 0, unset: 1, contradicted: 2 };
const worst = (a: PolicyVerdict, b: PolicyVerdict): PolicyVerdict => (RANK[a] >= RANK[b] ? a : b);

/* ------------------------------------------------------------------ */
/* policyLines                                                         */
/* ------------------------------------------------------------------ */

type Lang = "ar" | "fr" | "en";

/** At most this many lines and this many tokens (ai.md AI-§F.2 row "Store policies": ≤ 300 tokens). */
export const POLICY_LINES_MAX = 6;
export const POLICY_TOKENS_MAX = 300;

/** A conservative token estimate: about 4 Latin characters, 2 Arabic characters or 3 other characters per token. */
export function tokenEstimate(s: string): number {
  let latin = 0;
  let arabic = 0;
  let other = 0;
  for (const ch of s) {
    if (/[؀-ۿ]/.test(ch)) arabic++;
    else if (/[A-Za-zÀ-ɏ]/.test(ch)) latin++;
    else if (!/\s/.test(ch)) other++;
  }
  return Math.ceil(latin / 4 + arabic / 2 + other / 3);
}

interface LineWords {
  inspectionYes: string;
  inspectionNo: string;
  delivery: string;
  national: string;
  zones: string;
  days: (a: number, b: number) => string;
  freeFrom: (amount: string) => string;
  returnsYes: string;
  returnsNo: string;
  windowDays: (n: number) => string;
  storePays: string;
  customerPays: string;
  condition: string;
  exchangeYes: string;
  exchangeNo: string;
  refund: string;
  method: Record<"cash" | "transfer" | "store_credit", string>;
  refundDays: (n: number) => string;
  warranty: (months: number) => string;
  extras: string;
  sep: string;
  listSep: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** Arabic counted days: 1 and 11+ take the singular ("15 يوم"), 2 to 10 the plural ("3 أيام") */
const arDays = (n: number) => (n >= 2 && n <= 10 ? "أيام" : "يوم");

const WORDS: Record<Lang, LineWords> = {
  fr: {
    inspectionYes: "Le client peut ouvrir et vérifier le colis avant de payer.",
    inspectionNo: "Le colis se paie avant d'être ouvert.",
    delivery: "Livraison",
    national: "dans tout le pays",
    zones: "dans les villes des zones de la boutique",
    days: (a, b) => (a === b ? `en ${a} ${plural(a, "jour", "jours")} en général` : `en ${a} à ${b} jours en général`),
    freeFrom: (x) => `gratuite dès ${x}`,
    returnsYes: "Retours acceptés",
    returnsNo: "Retours non acceptés.",
    windowDays: (n) => `sous ${n} ${plural(n, "jour", "jours")}`,
    storePays: "frais de retour payés par la boutique",
    customerPays: "frais de retour payés par le client",
    condition: "Condition",
    exchangeYes: "Échanges acceptés",
    exchangeNo: "Échanges non acceptés.",
    refund: "Remboursement",
    method: { cash: "en espèces", transfer: "par virement", store_credit: "en avoir" },
    refundDays: (n) => `sous ${n} ${plural(n, "jour", "jours")}`,
    warranty: (m) => (m % 12 === 0 ? `Garantie de ${m / 12} ${plural(m / 12, "an", "ans")}.` : `Garantie de ${m} mois.`),
    extras: "À savoir",
    sep: " : ",
    listSep: " ; ",
  },
  en: {
    inspectionYes: "Customers may open and check the parcel before paying.",
    inspectionNo: "The parcel is paid for before it is opened.",
    delivery: "Delivery",
    national: "nationwide",
    zones: "to the cities of the store's delivery zones",
    days: (a, b) => (a === b ? `usually in ${a} ${plural(a, "day", "days")}` : `usually in ${a} to ${b} days`),
    freeFrom: (x) => `free from ${x}`,
    returnsYes: "Returns accepted",
    returnsNo: "Returns not accepted.",
    windowDays: (n) => `within ${n} ${plural(n, "day", "days")}`,
    storePays: "return shipping paid by the store",
    customerPays: "return shipping paid by the customer",
    condition: "Condition",
    exchangeYes: "Exchanges accepted",
    exchangeNo: "Exchanges not accepted.",
    refund: "Refund",
    method: { cash: "in cash", transfer: "by bank transfer", store_credit: "as store credit" },
    refundDays: (n) => `within ${n} ${plural(n, "day", "days")}`,
    warranty: (m) => (m % 12 === 0 ? `${m / 12}-year warranty.` : `${m}-month warranty.`),
    extras: "Good to know",
    sep: ": ",
    listSep: "; ",
  },
  ar: {
    inspectionYes: "الزبون يقدر يحل الكولي ويشوفو قبل ما يخلص.",
    inspectionNo: "الكولي كيتخلص قبل ما يتحل.",
    delivery: "التوصيل",
    national: "لجميع مدن البلاد",
    zones: "للمدن اللي فمناطق التوصيل ديال المتجر",
    days: (a, b) => (a === b ? `عادة ف ${a} ${arDays(a)}` : `عادة من ${a} حتى ل ${b} ${arDays(b)}`),
    freeFrom: (x) => `مجاني ابتداء من ${x}`,
    returnsYes: "الإرجاع مقبول",
    returnsNo: "الإرجاع ما مقبولش.",
    windowDays: (n) => `خلال ${n} ${arDays(n)}`,
    storePays: "مصاريف الإرجاع على المتجر",
    customerPays: "مصاريف الإرجاع على الزبون",
    condition: "الشرط",
    exchangeYes: "التبديل مقبول",
    exchangeNo: "التبديل ما مقبولش.",
    refund: "استرجاع الفلوس",
    method: { cash: "كاش", transfer: "بتحويل بنكي", store_credit: "كرصيد فالمتجر" },
    refundDays: (n) => `خلال ${n} ${arDays(n)}`,
    warranty: (m) => (m === 12 ? "ضمان عام." : m === 24 ? "ضمان عامين." : m % 12 === 0 ? `ضمان ${m / 12} ${m / 12 <= 10 ? "سنين" : "سنة"}.` : `ضمان ${m} ${m === 1 || m > 10 ? "شهر" : "شهور"}.`),
    extras: "معلومات مهمة",
    sep: ": ",
    listSep: "، ",
  },
};

const langOf = (locale: string): Lang => (locale === "ar" || locale === "fr" ? locale : "en");

/** A localized owner text in the page's language, else another one the owner typed (the AI prompt reads every language). */
function locText(t: { ar?: string; fr?: string; en?: string } | undefined, lang: Lang): string {
  if (!t) return "";
  const order: Lang[] = lang === "ar" ? ["ar", "fr", "en"] : lang === "fr" ? ["fr", "en", "ar"] : ["en", "fr", "ar"];
  for (const l of order) {
    const s = t[l]?.replace(/\s+/g, " ").trim();
    if (s) return s;
  }
  return "";
}

const sentence = (s: string) => (/[.!?؟]$/.test(s) ? s : `${s}.`);

/**
 * The store's policies as at most six short lines in the page's language, at most 300 tokens; an unset answer gives
 * no line and every card unset gives `[]`. `currency` formats the free-delivery threshold ("300 MAD"); without it the
 * amount is printed alone. The owner's own lines (`extras`) come last and are cut first to fit the budget.
 */
export function policyLines(facts: StorePolicyFacts, locale: string, opts: { currency?: string } = {}): string[] {
  const lang = langOf(locale);
  const w = WORDS[lang];
  const lines: string[] = [];

  if (facts.inspection === "allowed") lines.push(w.inspectionYes);
  else if (facts.inspection === "not_allowed") lines.push(w.inspectionNo);

  const d = facts.delivery;
  const delivery: string[] = [];
  if (d.coverage === "national") delivery.push(w.national);
  else if (d.coverage === "listed_zones") delivery.push(w.zones);
  if (d.typicalDays) {
    const [a, b] = [Math.min(...d.typicalDays), Math.max(...d.typicalDays)];
    delivery.push(w.days(a, b));
  }
  if (d.freeFromCents !== null) {
    const amount = String(Math.round(d.freeFromCents) / 100);
    delivery.push(w.freeFrom(opts.currency ? `${amount} ${opts.currency}` : amount));
  }
  if (delivery.length) lines.push(sentence(`${w.delivery}${w.sep}${delivery.join(lang === "ar" ? "، " : ", ")}`));

  const r = facts.returns;
  const ex = facts.exchange;
  const ret: string[] = [];
  if (r.accepted === true) {
    const parts = [w.returnsYes + (r.windowDays !== null ? ` ${w.windowDays(r.windowDays)}` : "")];
    if (r.whoPays === "store") parts.push(w.storePays);
    else if (r.whoPays === "customer") parts.push(w.customerPays);
    ret.push(sentence(parts.join(lang === "ar" ? "، " : ", ")));
    const cond = locText(r.condition, lang);
    if (cond) ret.push(sentence(`${w.condition}${w.sep}${cond}`));
  } else if (r.accepted === false) ret.push(w.returnsNo);
  if (ex.accepted === true) ret.push(sentence(w.exchangeYes + (ex.windowDays !== null ? ` ${w.windowDays(ex.windowDays)}` : "")));
  else if (ex.accepted === false) ret.push(w.exchangeNo);
  if (ret.length) lines.push(ret.join(" "));

  const f = facts.refund;
  if (f.method !== "unset" || f.withinDays !== null) {
    const parts = [w.refund, ...(f.method !== "unset" ? [w.method[f.method]] : []), ...(f.withinDays !== null ? [w.refundDays(f.withinDays)] : [])];
    lines.push(sentence(parts.join(" ")));
  }

  if (facts.warranty.months !== null) {
    const text = locText(facts.warranty.text, lang);
    lines.push(text ? `${w.warranty(facts.warranty.months)} ${sentence(text)}` : w.warranty(facts.warranty.months));
  }

  const extras = facts.extras.map((e) => locText(e.text, lang)).filter(Boolean);
  const room = POLICY_LINES_MAX - lines.length;
  const used = lines.reduce((n, l) => n + tokenEstimate(l), 0);
  if (extras.length && room > 0) {
    // the owner's lines share one line; the last ones give way first when the budget is short
    for (let k = extras.length; k > 0; k--) {
      const line = sentence(`${w.extras}${w.sep}${extras.slice(0, k).map((s) => s.replace(/[.;،]+$/, "")).join(w.listSep)}`);
      if (used + tokenEstimate(line) <= POLICY_TOKENS_MAX) {
        lines.push(line);
        break;
      }
    }
  }
  // the fixed lines are short by construction (≈ 25 tokens each); this guard only bites on long owner texts
  while (lines.length && lines.reduce((n, l) => n + tokenEstimate(l), 0) > POLICY_TOKENS_MAX) lines.pop();
  return lines.slice(0, POLICY_LINES_MAX);
}
