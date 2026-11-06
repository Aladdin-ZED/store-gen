/**
 * Which copy goes into which section. Field names are candidates (see overlay.ts): the overlay writes
 * a value only where the section's schema has a compatible field, and validates every write.
 */
import type { PageCopy } from "@/lib/ai/copy-schema";
import type { ProductRef } from "@/lib/ai/copy-library/product-ref";
import type { DesignCopyFacts } from "@/lib/design/cliche";
import type { CopyDirectives } from "@/lib/design/compile";
import { composeLines, SKELETONS, type CopyFamily } from "@/lib/design/copy-gen";
import type { Angle, HeadlineStructure } from "@/lib/design/genome";
import { shingles } from "@/lib/design/text/shingles";
import type { IconName } from "@/landing/primitives/icons";
import type { Locale } from "@/lib/page/schema";
import type { PatchEntry, SemanticItem } from "./overlay";
import { rngFor } from "./rng";

/** What the engine composes over the library copy (DES-§9.12): PageCopy path, section, field, the field's limit. */
const COMPOSED: readonly { path: [keyof PageCopy, string]; section: string; field: "title" | "lead"; max: number }[] = [
  { path: ["hero", "headline"], section: "hero", field: "title", max: 110 },
  { path: ["hero", "sub"], section: "hero", field: "lead", max: 220 },
  { path: ["benefits", "title"], section: "benefits", field: "title", max: 110 },
  { path: ["benefits", "lead"], section: "benefits", field: "lead", max: 220 },
  { path: ["faq", "title"], section: "faq", field: "title", max: 110 },
  { path: ["offer", "title"], section: "offer", field: "title", max: 110 },
  { path: ["offer", "lead"], section: "offer", field: "lead", max: 220 },
  { path: ["guarantee", "title"], section: "guarantee", field: "title", max: 110 },
  { path: ["cta", "title"], section: "cta", field: "title", max: 110 },
  { path: ["cta", "text"], section: "cta", field: "lead", max: 200 },
];

export interface ComposeCopyCtx {
  locale: Locale;
  family: CopyFamily;
  ref: ProductRef;
  facts: DesignCopyFacts;
  directives: CopyDirectives;
  seed: number;
  /** H28 rung 2: the hero title held to 2 lines */
  titleLines?: 2;
  /** skeleton ids the composed lines avoid (the sibling directions, the store's last pages, the headline check's `close` lines) */
  avoid?: ReadonlySet<string>;
  /**
   * DES-§14.2 step 7: a line the headline check still found `close` after three recompositions. "neutral" = the
   * name-led neutral skeleton (hero title only; other fields keep the library line), "library" = the library line.
   */
  fallback?: Readonly<Record<string, "neutral" | "library">>;
}

export interface EngineCopy {
  copy: PageCopy;
  /** the skeleton id per composed PageCopy path ("hero.headline" → "fr.t.np-fact") */
  skeletons: Record<string, string>;
  /** the composed line per path: its text, structure (G29) and angle (the copy-gene tags of the chosen row) */
  lines: Record<string, { t: string; s: HeadlineStructure; angle: Angle }>;
}

/** Every skeleton id: avoiding them all leaves a hero title only the neutral skeleton (DES-§9.12 step 7). */
const ALL_SKELETONS: ReadonlySet<string> = new Set(Object.values(SKELETONS).flatMap((byFamily) => Object.values(byFamily).flatMap((list) => list.map((sk) => sk.id))));

/**
 * The engine-only copy (DES-§9.12): composed hero, section titles and leads over the library copy, the library line
 * kept wherever nothing is fillable (a product with no facts: the wizard asks for one before the reveal). Seeded per
 * field (`copy:<section>:<field>`), so a remix of one field never moves the others.
 */
export function composeCopy(library: PageCopy, ctx: ComposeCopyCtx): EngineCopy {
  const copy = structuredClone(library);
  const skeletons: Record<string, string> = {};
  const lines: EngineCopy["lines"] = {};
  const taken = new Set<string>();
  const facts = [...ctx.facts.facts].filter(Boolean).sort((a, b) => b.length - a.length);
  const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** the line's 3-grams with the facts and the name masked, those of skeleton words only */
  const frame = (t: string) =>
    shingles(facts.reduce((acc, f) => acc.replace(new RegExp(escape(f), "giu"), " {x} "), t), ctx.locale, { product: ctx.ref.text }).filter((g) => !/^(§\w+ ?)+$/.test(g) && g.split(" ").filter((w) => !w.startsWith("§")).length >= 2);
  const base = { ref: ctx.ref, facts: ctx.facts, directives: ctx.directives, locale: ctx.locale, family: ctx.family };
  for (const c of COMPOSED) {
    const rng = rngFor(ctx.seed, `copy:${c.section}:${c.field}`);
    const hero = c.section === "hero" && c.field === "title";
    const key = c.path.join(".");
    const fallback = ctx.fallback?.[key];
    // the library line stays (the last fallback, and the neutral skeleton exists for the hero title only)
    if (fallback === "library" || (fallback === "neutral" && !hero)) continue;
    const avoid = fallback === "neutral" ? ALL_SKELETONS : ctx.avoid;
    // the avoid list holds hero skeleton ids and the checked lines' own ids: the other pools never lose a line to it
    const req = { ...base, section: c.section, field: c.field, maxWordChars: ctx.locale === "ar" ? 12 : 14, ...(avoid ? { avoid } : {}) };
    let found = composeLines({ ...req, ...(hero && ctx.titleLines ? { maxLines: ctx.titleLines } : {}) }, rng, 5);
    // the fold's 2-line hold found nothing: the shortest composed title, the fold's ladder sizes the rest
    if (!found.length && hero && ctx.titleLines) found = composeLines(req, rngFor(ctx.seed, "copy:hero:title:any"), 5).sort((a, b) => a.t.length - b.t.length);
    // a line never repeats the skeleton words of a line composed before it on the page (the hero lead under its
    // title: "for one reason" twice); the merchant's facts may come back
    const line = found.find((l) => l.t.length <= c.max && !frame(l.t).some((g) => taken.has(g)));
    if (!line) continue;
    (copy[c.path[0]] as Record<string, unknown>)[c.path[1]] = line.t;
    skeletons[key] = line.skeleton;
    lines[key] = { t: line.t, s: line.s, angle: line.angle };
    for (const g of frame(line.t)) taken.add(g);
  }
  return { copy, skeletons, lines };
}

export interface CopyExtras {
  /** merchant facts (bullets) — used as product callouts */
  facts: readonly string[];
  /**
   * Detail callouts written for this kind of product (garment.ts), used when the merchant gave fewer
   * than two facts — instead of the section's family defaults, which may describe another product.
   */
  details?: readonly SemanticItem[];
  /**
   * false when the store has no WhatsApp number: the short promise lines (top bar, trust bar,
   * guarantee) leave out "we answer on WhatsApp" — a channel the visitor cannot reach.
   */
  whatsapp?: boolean;
  /** the hero's giant background word, when the product's mood calls for another one (garment.ts) */
  bigWord?: string;
}

/** A promise line that sends the visitor to WhatsApp. */
const WHATSAPP_LINE = /whats\s?app|واتساب|واتس اب|واتس آب/i;

const KICKER = ["kicker", "eyebrow", "overline"] as const;
const TITLE = ["title", "headline", "heading"] as const;
const LEAD = ["lead", "subtitle", "intro", "description"] as const;
const CTA_LABEL = ["ctaLabel", "buttonLabel", "button"] as const;

/**
 * Meanings a reassurance line can carry, most specific first, each with its icon and the related
 * icons that still say the same thing when the first one is already taken in the list. The
 * inspection promise is read first: "check before you pay" / "عاين طلبك قبل الدفع" is about looking,
 * not paying; then payment, then delivery ("open it in front of the courier" is no truck).
 */
const LINE_MEANINGS: readonly { re: RegExp; icons: readonly IconName[] }[] = [
  { re: /(vérif|verif|check|inspect|ouvrez|عاين|معاينة|تعاين|تفتح)/, icons: ["eye", "box", "check-hand"] },
  { re: /(paiement|payment|pay\b|pay |payez|payer|cash|espèces|الدفع|تدفع|نقدا|نقداً)/, icons: ["cash-hand", "cash", "lock"] },
  // after payment: "Paiement sécurisé" next to "Paiement à la livraison" takes the lock, not the cash
  { re: /(sécuris|securis|secure|آمن)/, icons: ["lock", "shield-check"] },
  { re: /(livraison|delivery|deliver|livr|توصيل|التوصيل)/, icons: ["truck", "map-pin", "clock"] },
  { re: /(whatsapp|واتساب)/, icons: ["whatsapp", "chat"] },
  { re: /(échange|exchange|retour|return|تبديل|استبدال)/, icons: ["return", "shield-check"] },
  { re: /(appel|call|اتصال|نتصل|يتصل)/, icons: ["phone", "headset"] },
  { re: /(garanti|guarantee|warranty|ضمان|مضمون)/, icons: ["shield-check", "check"] },
];
/** Neutral marks for a line no meaning matched (or whose icons the list already uses). */
const NEUTRAL_ICONS: readonly IconName[] = ["check", "shield-check", "star", "heart"];

/** Icons that fit a line, best first (its matched meanings' icons, then the neutral marks). */
function lineIconCandidates(text: string): IconName[] {
  const t = text.toLowerCase();
  const matched = LINE_MEANINGS.filter((m) => m.re.test(t));
  // every matched meaning's own icon before any alternate: "Paiement à la livraison" is cash, then truck
  const out: IconName[] = [...matched.map((m) => m.icons[0]!), ...matched.flatMap((m) => m.icons.slice(1)), ...NEUTRAL_ICONS];
  return [...new Set(out)];
}

/** Icon for one reassurance line, from its meaning (lines come from AI or the library in any locale). */
export function iconForLine(text: string): IconName {
  return lineIconCandidates(text)[0]!;
}

/**
 * Icons for the lines of one list (announcement, guarantee): each line its best icon that no earlier
 * line uses — "الدفع عند الاستلام" and "عاين طلبك قبل الدفع" never show two cash icons side by side.
 * A list longer than the icons that fit repeats the line's own best icon rather than a random one.
 */
export function iconsForLines(texts: readonly string[]): IconName[] {
  const used = new Set<IconName>();
  return texts.map((text) => {
    const candidates = lineIconCandidates(text);
    const icon = candidates.find((c) => !used.has(c)) ?? candidates[0]!;
    used.add(icon);
    return icon;
  });
}

/** Lines with their icons, distinct within the list. */
const iconLines = (texts: readonly string[]) => {
  const icons = iconsForLines(texts);
  return texts.map((text, i) => ({ text, icon: icons[i]! }));
};

/**
 * Textile ornament words: lace and embroidery are a motif, not a jewel. Latin words start a word
 * ("a sa place", "necklace" and "lacet" are no lace).
 */
export const TEXTILE_ORNAMENT = /(?<!\p{L})(?:dentelle|lace(?:s|d)?(?!\p{L})|broderie|brod[ée]|embroider)|دانتيل|تطريز|مطرز|طرز/iu;

/**
 * A benefit's icon checked against its own words: a gem on a lace or embroidery line reads as
 * jewelry on a garment page, so it becomes the six-point motif mark the section uses for lace.
 */
export function fitBenefitIcon(icon: string | undefined, title: string, text: string): string | undefined {
  if (icon === "gem" && TEXTILE_ORNAMENT.test(`${title} ${text}`)) return "asterisk";
  return icon;
}

const items = (list: readonly SemanticItem[]) => list;

/** Copy patch for one section type (empty when the generator leaves the section's defaults as is). */
export function copyPatch(type: string, c: PageCopy, extras: CopyExtras): PatchEntry[] {
  const facts = extras.facts.filter(Boolean);
  // without a WhatsApp number the promise lines never point there (a list never empties: the
  // section keeps its minimum from the remaining lines)
  const reachable = <T>(list: readonly T[], text: (t: T) => string, min: number): T[] => {
    if (extras.whatsapp !== false) return list.slice();
    const kept = list.filter((t) => !WHATSAPP_LINE.test(text(t)));
    return kept.length >= min ? kept : list.slice();
  };
  switch (type) {
    case "announcement":
      return [{ keys: ["items", "lines", "messages"], value: items(iconLines(reachable(c.announcement, (t) => t, 1))) }];
    case "header":
      return [{ keys: CTA_LABEL, value: c.sticky.label }];
    case "hero":
      return [
        { keys: KICKER, value: c.hero.kicker },
        { keys: TITLE, value: c.hero.headline },
        { keys: ["subtitle", "sub", "lead", "text"], value: c.hero.sub },
        { keys: CTA_LABEL, value: c.hero.cta },
        { keys: ["bigWord"], value: extras.bigWord ?? c.hero.bigWord },
        {
          keys: ["notes", "callouts", "chips"],
          value: items((facts.length >= 2 ? facts : c.benefits.items.map((b) => b.title)).slice(0, 3).map((title) => ({ title }))),
        },
        { keys: ["trust", "trustItems"], value: items(reachable(c.trust, (t) => t.text, 1).slice(0, 3).map((t) => ({ icon: t.icon, text: t.text }))) },
      ];
    case "trustBar":
      return [{ keys: ["items", "points", "badges"], value: items(reachable(c.trust, (t) => t.text, 2).map((t) => ({ icon: t.icon, title: t.text }))) }];
    case "marquee":
      return [{ keys: ["items", "words", "lines"], value: c.marquee }];
    case "problem":
      return [
        { keys: KICKER, value: c.problem.kicker },
        { keys: TITLE, value: c.problem.title },
        { keys: LEAD, value: c.problem.lead },
        { keys: ["pains", "points", "items"], value: items(c.problem.points.map((p) => ({ pain: p.pain, fix: p.fix }))) },
        { keys: ["solution", "answer"], value: c.problem.solution },
        { keys: CTA_LABEL, value: c.hero.cta },
      ];
    case "benefits":
      return [
        { keys: KICKER, value: c.benefits.kicker },
        { keys: TITLE, value: c.benefits.title },
        { keys: LEAD, value: c.benefits.lead },
        { keys: ["items", "benefits"], value: items(c.benefits.items.map((b) => ({ title: b.title, text: b.text, icon: fitBenefitIcon(b.icon, b.title, b.text) }))) },
        { keys: CTA_LABEL, value: c.hero.cta },
      ];
    case "showcase":
      return [
        { keys: KICKER, value: c.showcase.kicker },
        { keys: TITLE, value: c.showcase.title },
        { keys: LEAD, value: c.showcase.lead },
        ...(facts.length >= 2
          ? [{ keys: ["points", "callouts"], value: items(facts.slice(0, 6).map((f) => ({ label: f }))) }]
          : extras.details?.length
            ? [{ keys: ["points", "callouts"], value: items(extras.details) }]
            : []),
        { keys: CTA_LABEL, value: c.hero.cta },
      ];
    case "steps":
      return [
        { keys: KICKER, value: c.steps.kicker },
        { keys: TITLE, value: c.steps.title },
        { keys: ["steps", "items"], value: items(c.steps.items.map((s) => ({ title: s.title, text: s.text, icon: s.icon }))) },
        { keys: CTA_LABEL, value: c.hero.cta },
      ];
    case "story":
      return [
        { keys: KICKER, value: c.story.kicker },
        { keys: TITLE, value: c.story.title },
        { keys: ["text", "body", "story", "paragraph", "lead"], value: c.story.text },
      ];
    case "gallery":
      return [
        { keys: KICKER, value: c.gallery.kicker },
        { keys: TITLE, value: c.gallery.title },
      ];
    case "comparison":
      return [
        { keys: TITLE, value: c.comparison.title },
        { keys: ["usLabel", "oursLabel", "ourLabel"], value: c.comparison.us },
        { keys: ["themLabel", "othersLabel", "theirLabel"], value: c.comparison.them },
        { keys: ["rows", "items", "lines"], value: items(c.comparison.rows.map((r) => ({ label: r.label, us: r.us, them: r.them }))) },
      ];
    case "specs":
      return [
        { keys: KICKER, value: c.specs.kicker },
        { keys: TITLE, value: c.specs.title },
      ];
    case "reviews":
      return [
        { keys: KICKER, value: c.reviews.kicker },
        { keys: TITLE, value: c.reviews.title },
      ];
    case "socialProof":
      return [
        { keys: KICKER, value: c.socialProof.kicker },
        { keys: TITLE, value: c.socialProof.title },
      ];
    case "offer":
      return [
        { keys: KICKER, value: c.offer.kicker },
        { keys: TITLE, value: c.offer.title },
        { keys: LEAD, value: c.offer.lead },
        { keys: CTA_LABEL, value: c.offer.cta },
      ];
    case "guarantee":
      return [
        { keys: KICKER, value: c.guarantee.kicker },
        { keys: TITLE, value: c.guarantee.title },
        { keys: ["lines", "items", "points", "promises"], value: items(iconLines(reachable(c.guarantee.lines, (t) => t, 2))) },
      ];
    case "orderForm":
      return [
        { keys: KICKER, value: c.form.kicker },
        { keys: TITLE, value: c.form.title },
        { keys: LEAD, value: c.form.lead },
        { keys: ["submitLabel"], value: c.form.submit },
        { keys: ["reassurance"], value: c.form.reassurance },
      ];
    case "cta":
      return [
        { keys: KICKER, value: c.cta.kicker },
        { keys: TITLE, value: c.cta.title },
        { keys: ["text", "lead", "subtitle"], value: c.cta.text },
        { keys: [...CTA_LABEL, "label"], value: c.cta.button },
      ];
    case "faq":
      return [
        { keys: KICKER, value: c.faq.kicker },
        { keys: TITLE, value: c.faq.title },
        { keys: ["items", "faqs", "questions"], value: items(c.faq.items.map((f) => ({ q: f.q, a: f.a }))) },
      ];
    case "stickyCta":
      return [
        { keys: ["label"], value: c.sticky.label },
        { keys: ["note"], value: c.sticky.note },
      ];
    case "whatsappFloat":
      return [
        { keys: ["label"], value: c.whatsapp.label },
        { keys: ["message"], value: c.whatsapp.message },
      ];
    default:
      return [];
  }
}
