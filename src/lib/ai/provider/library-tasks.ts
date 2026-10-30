/**
 * The library rung's outputs, task by task (P7 AI; ai.md AI-§A.5; the pure core the library provider of step 7 wraps).
 * Deterministic for a given input and seed, free, and honest: every text comes from the hand-written copy library,
 * the page's own sections or a fixed template, and never states a figure, a claim or a promise the input does not
 * carry. They are also the first frozen baseline of every prompt family (src/lib/ai/eval/baseline.ts): the eval set
 * then measures each prompt version against what a seller gets with Cloud AI off.
 *
 * Tasks without a library rung answer what the product does without them: `analyze` has none (null: nothing is read
 * from a photo), `design.critique` answers the engine's instant picks without a judgement, `eval.judge` only knows
 * the known negatives (empty, "I don't know").
 */
import { libraryCopy, fitText, type LibraryInput } from "../copy-library";
import type { AiCopy, PageCopy } from "../copy-schema";
import { hardFailsOf } from "../director/budgets";
import { cardDistance } from "../director/validate";
import type { Candidate, Critique, CritiqueInput, DirectionBrief, DirectorPlan, DirectorPlanInput } from "../director/types";
import { rankDirections } from "@/lib/generator/directions";
import type { ProductCategory } from "@/lib/page/schema";
import type { CopyLocale } from "../prompts";
import { scanInjection } from "../safety/injection";
import { ADDRESS_STEP, type CallScriptInput, type ScriptStep } from "../schema/tasks/callcenter-script";
import type { AdBriefAngle, AdBriefInput, AdBriefOut } from "../schema/tasks/ad-brief";
import type { CopyPageInput, CopyPageOut } from "../schema/tasks/copy-page";
import type { FieldRewriteInput, FieldRewriteOut } from "../schema/tasks/copy-field";
import type { HeroPackInput, HeroPackOut } from "../schema/tasks/copy-hero";
import type { InjectionScreenInput, InjectionScreenOut } from "../schema/tasks/injection-screen";
import type { JudgeInput, JudgeOut } from "../schema/tasks/eval-judge";
import type { ScriptDoc } from "@/lib/callcenter/script";

/** What the library needs beside the task input (the router knows it from the store and the page). */
export interface LibraryOpts {
  seed: number;
  hasWhatsapp: boolean;
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/** The library page in the AiCopy keys, so the same merge path runs (AI-§A.5 "projected to AiCopyLoose"). */
export function pageCopyToAiCopy(pc: PageCopy): AiCopy {
  return {
    tagline: pc.tagline,
    kicker: pc.hero.kicker,
    headline: pc.hero.headline,
    sub: pc.hero.sub,
    cta: pc.hero.cta,
    benefits: pc.benefits.items.map((b) => ({ title: b.title, text: b.text, icon: b.icon as AiCopy["benefits"][number]["icon"] })),
    problem_title: pc.problem.title,
    pains: pc.problem.points.map((p) => ({ pain: p.pain, fix: p.fix })),
    solution: pc.problem.solution,
    steps: pc.steps.items.map((s) => ({ title: s.title, text: s.text })),
    faq: pc.faq.items.map((f) => ({ q: f.q, a: f.a })),
    guarantee: pc.guarantee.lines,
    cta_title: pc.cta.title,
    cta_text: pc.cta.text,
    story_title: pc.story.title,
    story: pc.story.text,
    comparison: pc.comparison.rows.map((r) => ({ label: r.label, us: r.us, them: r.them })),
    announcement: pc.announcement,
    marquee: pc.marquee,
    seo_title: pc.seo.title,
    seo_description: pc.seo.description,
  };
}

function libraryPage(locale: CopyLocale, product: { name: string; category: ProductCategory; facts: readonly string[] }, market: LibraryInput["market"], deliveryText: string | null, opts: LibraryOpts): PageCopy {
  return libraryCopy({
    category: product.category,
    locale,
    market,
    seed: opts.seed,
    productName: product.name,
    keywords: product.facts.join(" "),
    deliveryText,
    hasWhatsapp: opts.hasWhatsapp,
  });
}

export function libraryCopyPage(input: CopyPageInput, opts: LibraryOpts): CopyPageOut {
  return pageCopyToAiCopy(libraryPage(input.locale, input.product, input.market, input.deliveryText, opts));
}

const SLOT_SEED = { best_fit: 0, contrast: 1, explore: 2 } as const;

export function libraryHero(input: HeroPackInput, opts: LibraryOpts): HeroPackOut {
  const pc = libraryPage(input.locale, input.product, input.market, input.deliveryText, { ...opts, seed: opts.seed + SLOT_SEED[input.direction.slot] });
  return { kicker: pc.hero.kicker, headline: pc.hero.headline, sub: pc.hero.sub, cta: pc.hero.cta };
}

/** A value at a PageCopy path: "hero.headline", "benefits[2].text" (= benefits.items.2.text), "faq.items.1.a". */
export function pageCopyAt(pc: PageCopy, path: string): string | null {
  const dotted = path.replace(/\[(\d+)\]/g, ".$1");
  const walk = (parts: string[]): unknown => parts.reduce<unknown>((node, k) => (node && typeof node === "object" ? (node as Record<string, unknown>)[k] : undefined), pc);
  const parts = dotted.split(".");
  let v = walk(parts);
  // "benefits.2.text" names the section's items list
  if (v === undefined && parts.length > 1 && /^\d+$/.test(parts[1]!)) v = walk([parts[0]!, "items", ...parts.slice(1)]);
  return typeof v === "string" ? v : null;
}

/** AI-§A.5: "the same field from 3 other seeds" (until design's structure-tagged library lands). */
export function libraryField(input: FieldRewriteInput, opts: LibraryOpts & { category: ProductCategory }): FieldRewriteOut {
  const locale = input.intent === "translate" && input.targetLocale ? input.targetLocale : input.locale;
  const out: string[] = [];
  for (let k = 1; k <= 8 && out.length < 3; k++) {
    const v = pageCopyAt(libraryPage(locale, { name: input.product.name, category: opts.category, facts: input.product.facts }, "MA", null, { ...opts, seed: opts.seed + k }), input.field);
    if (v && v !== input.text && !out.includes(v)) out.push(fitText(v, input.max));
  }
  return { variants: out };
}

/* ------------------------------------------------------------------ */
/* Director                                                            */
/* ------------------------------------------------------------------ */

const LIBRARY_STRUCTURES = { best_fit: "noun-phrase", contrast: "contrast-pair", explore: "question" } as const;
const LIBRARY_ANGLES = { best_fit: "benefit", contrast: "problem", explore: "value" } as const;

/** AI-§A.5: the engine's archetype ranking as three slot briefs with empty hints; nothing is read from the photos. */
export function libraryPlan(input: DirectorPlanInput): DirectorPlan {
  const b = input.brief;
  const ranked = rankDirections({ product: { name: b.product.name, category: b.product.category }, palette: null, aiVibe: null, facts: b.product.facts });
  const photo = b.photos[0];
  const direction = (slot: DirectionBrief["slot"], i: number): DirectionBrief => ({
    slot,
    hints: {},
    headlineStructures: [LIBRARY_STRUCTURES[slot]],
    copyAngle: LIBRARY_ANGLES[slot],
    mustHave: [],
    mustAvoid: [],
    rationale: ranked[i] ? `Engine archetype ${ranked[i]!.archetype}.` : "",
  });
  return {
    read: {
      readLine: "",
      audience: "",
      priceTier: "mid",
      suggestedFacts: [],
      photoQuality: photo?.analysis?.photoQuality ?? { sharp: true, clutter: "none", fullBleedOk: false, cutoutViable: photo?.hasCutout === true, advice: null },
      dials: { variance: 5, motion: b.constraints.mood === "calm" ? 3 : 5, density: 5 },
      risks: [],
    },
    directions: [direction("best_fit", 0), direction("contrast", 1), direction("explore", 2)],
  };
}

/** A candidate the pick may take: no design hard gate on its card or digest and no budget "over". */
const candidateEligible = (c: Candidate): boolean => c.card.gateFails.length === 0 && hardFailsOf(c.digest).length === 0;

/** The engine's instant set without a judgement: per slot the eligible candidate with the highest Q. */
export function libraryCritique(input: CritiqueInput): Critique {
  const eligible = input.candidates.filter(candidateEligible);
  const picks: string[] = [];
  for (const slot of ["best_fit", "contrast", "explore"] as const) {
    const best = eligible.filter((c) => c.card.slot === slot && !picks.includes(c.card.id)).sort((x, y) => y.card.q - x.card.q || x.card.id.localeCompare(y.card.id))[0];
    if (best) picks.push(best.card.id);
  }
  for (const c of [...eligible].sort((x, y) => y.card.q - x.card.q || x.card.id.localeCompare(y.card.id))) if (picks.length < 3 && !picks.includes(c.card.id)) picks.push(c.card.id);
  while (picks.length < 3) picks.push(picks[picks.length - 1] ?? input.candidates[0]?.card.id ?? "");
  const card = (id: string) => input.candidates.find((c) => c.card.id === id)?.card;
  const pairs = [
    [0, 1],
    [1, 2],
    [0, 2],
  ] as const;
  return {
    perCandidate: input.candidates.map((c) => ({ id: c.card.id, picked: picks.includes(c.card.id), scores: {}, hardFails: [...new Set([...c.card.gateFails, ...hardFailsOf(c.digest)])], issues: [], repairs: [] })),
    pick: [picks[0]!, picks[1]!, picks[2]!],
    whyLines: { locale: input.brief.store.locales[0] ?? "fr", lines: ["", "", ""] },
    distinctness: pairs.map(([a, b]) => {
      const x = card(picks[a]!);
      const y = card(picks[b]!);
      return x && y ? cardDistance(x, y) : 0;
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Call script (the template the OP-05 fallback starts from)           */
/* ------------------------------------------------------------------ */

type Lines = Readonly<Record<CopyLocale, string>>;
const STEP_TEXT: Readonly<Record<"greet" | "product" | "total" | "delivery" | "upsell" | "close", { title: Lines; say: Lines; checks: Readonly<Record<CopyLocale, readonly string[]>> }>> = {
  greet: {
    title: { fr: "Accueil", ar: "الترحيب", en: "Greeting" },
    say: {
      fr: "Bonjour[[ {customer_first_name}]], ici {agent_first_name} de {store_name}. Je vous appelle pour confirmer votre commande.",
      ar: "السلام عليكم[[ {customer_first_name}]]، معاك {agent_first_name} من {store_name}. كنعيط ليك باش نأكد معاك الطلب ديالك.",
      en: "Hello[[ {customer_first_name}]], this is {agent_first_name} from {store_name}. I am calling to confirm your order.",
    },
    checks: { fr: [], ar: [], en: [] },
  },
  product: {
    title: { fr: "Produit", ar: "المنتج", en: "Product" },
    say: {
      fr: "Vous avez commandé {product}, {offer_label} ({units_text}). C'est bien ça ?",
      ar: "طلبتي {product}، {offer_label} ({units_text}). صحيح؟",
      en: "You ordered {product}, {offer_label} ({units_text}). Is that right?",
    },
    checks: { fr: ["Produit confirmé", "Quantité confirmée"], ar: ["المنتج مؤكد", "الكمية مؤكدة"], en: ["Product confirmed", "Quantity confirmed"] },
  },
  total: {
    title: { fr: "Total", ar: "المجموع", en: "Total" },
    say: {
      fr: "Le total est de {total}[[, livraison {shipping_text}]]. Vous payez en espèces au livreur, à la réception du colis.",
      ar: "المجموع هو {total}[[، والتوصيل {shipping_text}]]. كتخلص نقدا للموزع ملي كيوصلك الطرد.",
      en: "The total is {total}[[, delivery {shipping_text}]]. You pay the courier in cash when the parcel arrives.",
    },
    checks: { fr: ["Total confirmé"], ar: ["المجموع مؤكد"], en: ["Total confirmed"] },
  },
  delivery: {
    title: { fr: "Livraison", ar: "التوصيل", en: "Delivery" },
    say: {
      fr: "[[La livraison est prévue {eta_text}. ]]Gardez votre téléphone allumé, s'il vous plaît.",
      ar: "[[التوصيل متوقع {eta_text}. ]]خلي البورطابل ديالك مشعول عافاك.",
      en: "[[Delivery is planned {eta_text}. ]]Please keep your phone on.",
    },
    checks: { fr: [], ar: [], en: [] },
  },
  upsell: {
    title: { fr: "Ajout", ar: "إضافة", en: "Add-on" },
    say: {
      fr: "Vous pouvez ajouter {upsell_title} pour {upsell_price} au même colis. Je l'ajoute ?",
      ar: "تقدر تزيد {upsell_title} ب {upsell_price} فنفس الطرد. نزيدهولك؟",
      en: "You can add {upsell_title} for {upsell_price} to the same parcel. Shall I add it?",
    },
    checks: { fr: [], ar: [], en: [] },
  },
  close: {
    title: { fr: "Fin", ar: "الختام", en: "Closing" },
    say: {
      fr: "Merci, votre commande est confirmée. Bonne journée.",
      ar: "شكرا، الطلب ديالك تأكد. نهارك مبروك.",
      en: "Thank you, your order is confirmed. Have a good day.",
    },
    checks: { fr: [], ar: [], en: [] },
  },
};

const OBJECTION_TEXT: Readonly<Record<ScriptDoc["objections"][number]["id"], Lines>> = {
  price: {
    fr: "Le total {total} comprend le produit[[ et la livraison {shipping_text}]]. Vous ne payez qu'à la réception du colis.",
    ar: "المجموع {total} فيه المنتج[[ والتوصيل {shipping_text}]]. ماكتخلص حتى يوصلك الطرد.",
    en: "The total {total} covers the product[[ and the delivery {shipping_text}]]. You only pay when the parcel arrives.",
  },
  trust: {
    fr: "Avec {store_name}, le colis arrive d'abord : vous payez ensuite au livreur, en espèces. Rien n'est payé en ligne.",
    ar: "مع {store_name} كيوصلك الطرد قبل ما تخلص، ومن بعد كتخلص للموزع نقدا. ماكاين حتى خلاص على الإنترنت.",
    en: "With {store_name}, the parcel comes first: you pay the courier in cash after that. Nothing is paid online.",
  },
  delivery_time: {
    fr: "[[La livraison est prévue {eta_text}. ]]Je confirme votre commande pour qu'elle parte au plus vite.",
    ar: "[[التوصيل متوقع {eta_text}. ]]غادي نأكد الطلب ديالك باش يتسيفط فأقرب وقت.",
    en: "[[Delivery is planned {eta_text}. ]]I am confirming your order so it ships as soon as possible.",
  },
  think: {
    fr: "Bien sûr, prenez votre temps. Vous pouvez nous rappeler au {confirm_number}[[ {confirm_hours}]] pour confirmer.",
    ar: "ماشي مشكل، خود وقتك. تقدر تعيط لينا ف {confirm_number}[[ {confirm_hours}]] باش تأكد.",
    en: "Of course, take your time. You can call us back on {confirm_number}[[ {confirm_hours}]] to confirm.",
  },
  cheaper_elsewhere: {
    fr: "Avec {store_name}, vous payez seulement à la réception, en espèces, sans rien avancer en ligne.",
    ar: "مع {store_name} كتخلص غير ملي كيوصلك الطرد، نقدا، بلا ما تخلص والو على الإنترنت.",
    en: "With {store_name}, you only pay on delivery, in cash, with nothing paid online first.",
  },
  wrong_size: {
    fr: "Je vous confirme le modèle choisi : {offer_label}. Si vous hésitez, dites-moi votre taille et je vérifie avec vous avant l'envoi.",
    ar: "نأكد معاك الموديل اللي ختاريتي: {offer_label}. إلا كنتي متردد، قول ليا المقاس ديالك ونتأكدو مع بعض قبل الإرسال.",
    en: "Let me confirm the model you chose: {offer_label}. If you are unsure, tell me your size and I will check it with you before it ships.",
  },
};

/** The fixed template script for one product (no model): the canonical steps, the address mode's step, the upsell when configured. */
export function libraryScript(input: CallScriptInput): ScriptDoc {
  const l = input.locale;
  const step = (id: keyof typeof STEP_TEXT, extra: Partial<ScriptStep> = {}): ScriptStep => ({ id, title: STEP_TEXT[id].title[l], say: STEP_TEXT[id].say[l], checks: [...STEP_TEXT[id].checks[l]], when: "always", action: "none", ...extra });
  const steps: ScriptStep[] = [step("greet"), step("product"), { ...ADDRESS_STEP[input.addressMode ?? "required"][l] }, step("total"), step("delivery")];
  if (input.upsell) steps.push(step("upsell", { when: "upsell", action: "add_upsell" }));
  steps.push(step("close"));
  return { v: 1, steps, objections: (Object.keys(OBJECTION_TEXT) as (keyof typeof OBJECTION_TEXT)[]).map((id) => ({ id, say: OBJECTION_TEXT[id][l] })) };
}

/* ------------------------------------------------------------------ */
/* Ad brief (the page's own sections, nothing else)                    */
/* ------------------------------------------------------------------ */

const UGC15: Lines = {
  fr: "Le produit en main, en gros plan|Le geste d'utilisation, filmé de près|Le produit dans son cadre de tous les jours|Le détail qui compte, en plan serré|Le colis reçu à la porte|Le produit posé, plan final",
  ar: "المنتج فاليد، لقطة قريبة|طريقة الاستعمال من قريب|المنتج فالحياة اليومية|التفصيل المهم، لقطة قريبة|الطرد ملي كيوصل للباب|المنتج محطوط، لقطة الختام",
  en: "The product in hand, close up|The way it is used, filmed close|The product in an everyday setting|The detail that matters, tight shot|The parcel arriving at the door|The product at rest, final shot",
};
const UGC30_EXTRA: Lines = {
  fr: "Le produit sous un autre angle|Le geste, du début à la fin|Une question qu'un client se pose, à l'écran|La réponse, montrée avec le produit",
  ar: "المنتج من زاوية أخرى|طريقة الاستعمال من البداية للنهاية|سؤال كيطرحو الزبون، مكتوب فالشاشة|الجواب، مع المنتج",
  en: "The product from another angle|The gesture, start to finish|A question a shopper asks, on screen|The answer, shown with the product",
};
const CHECKLIST: Lines = {
  fr: "Le vrai produit, jamais une image de banque|Une lumière naturelle, de face|Des mains qui utilisent le produit|Le colis et son ouverture|Le produit sur un fond simple",
  ar: "المنتج الحقيقي، ماشي صورة من الإنترنت|ضو طبيعي من القدام|يدين كيستعملو المنتج|الطرد وكيفاش كيتحل|المنتج فوق خلفية بسيطة",
  en: "The real product, never stock footage|Natural light, from the front|Hands using the product|The parcel and its opening|The product on a plain background",
};

const isArabic = (s: string) => /[؀-ۿ]/.test(s);
const words = (s: string, n: number) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");

/** The template brief from the page: up to three sections with distinct tags, their own headline and lead. */
export function libraryBrief(input: AdBriefInput): AdBriefOut {
  const primary: CopyLocale = input.locales.includes("fr") ? "fr" : input.locales.includes("ar") ? "ar" : "en";
  const tags = new Set<string>();
  const angles: AdBriefAngle[] = [];
  for (const s of input.sections) {
    if (angles.length >= 3 || tags.has(s.tag) || !s.headline.trim()) continue;
    tags.add(s.tag);
    // ad texts are plain: the page's *emphasis* markup is not an ad platform's
    const headline = s.headline.replace(/\*/g, "");
    const lead = s.lead.replace(/\*/g, "");
    const loc = isArabic(headline) ? "ar" : "fr";
    const pair = (t: string, max: number): { ar?: string; fr?: string } => (loc === "ar" ? { ar: fitText(t, max) } : { fr: fitText(t, max) });
    angles.push({
      sectionId: s.id,
      tag: s.tag,
      name: fitText(headline, 40),
      hook: loc === "ar" ? { ar: words(headline, 12) } : { fr: words(headline, 12) },
      primary: lead.trim() ? { meta: pair(lead, 125), tiktok: pair(lead, 100) } : {},
      headline: { meta: pair(headline, 40), snapchat: pair(headline, 34) },
      ugc15: UGC15[primary].split("|"),
      ugc30: [...UGC15[primary].split("|"), ...UGC30_EXTRA[primary].split("|")],
    });
  }
  return { basedOnVersionId: input.basedOnVersionId, angles, filmChecklist: CHECKLIST[primary].split("|") };
}

/* ------------------------------------------------------------------ */
/* Screen and judge                                                    */
/* ------------------------------------------------------------------ */

/** The keyword heuristic of AI-§E.3 as the screen's library rung. */
export function libraryScreen(input: InjectionScreenInput): InjectionScreenOut {
  const scan = scanInjection(input.text);
  return { suspicious: scan.suspected, reason: scan.suspected ? `keyword heuristic: ${scan.hits.join(", ")}` : "plain product data" };
}

const NEGATIVE = /^(?:|i\s+don'?t\s+know|je\s+ne\s+sais\s+pas|لا\s+أعرف|ما\s+عرفتش|n\/?a|none|null)\.?$/i;
const negative = (s: string) => NEGATIVE.test(s.trim());

/** No judgement beyond the known negatives (AI-§F.5): an empty or "I don't know" output loses; anything else ties. */
export function libraryJudge(input: JudgeInput): JudgeOut {
  const a = negative(input.a);
  const b = negative(input.b);
  if (a && b) return { verdict: "both_bad", reason: "both outputs are empty or decline" };
  if (a) return { verdict: "B", reason: "output A is empty or declines" };
  if (b) return { verdict: "A", reason: "output B is empty or declines" };
  return { verdict: "tie", reason: "library judge: no preference beyond the known negatives" };
}
