/**
 * The explanation of a genome (P6 DESIGN; design.md DES-§4.8, GN-1, rev 3 UX-29; labels DES-§20.2, colour words
 * DES-§20.3). Pure and isomorphic.
 *
 *  - Four chips, one per bold visual gene: G2 grammar, G4 pairing ("Display / Arabic display", the real family names),
 *    G9 strategy, G18 treatment. Separate chips, never one `·`-joined string (budget C07).
 *  - The why line: one sentence from eight templates per locale, each anchored on one concrete input fact the engine
 *    used, named from the photo facts and the render digest, never from adjectives. The template of the strongest
 *    photo fact wins in the order of the DES-§4.8 table (cutout, one photo, background, dark photo, many photos); with
 *    none, the seed chooses among the colour, voice and market templates that hold. A template whose fact is absent is
 *    never used: no line names a fact the digest or the photo facts do not carry.
 *
 * The vars are localised here (the catalog renders `{strategy}`, `{colourName}` and `{voice}` as given), so the caller
 * passes the locale of the reader.
 */
import { messages as AR } from "@/lib/i18n/admin/ar/design";
import { messages as EN } from "@/lib/i18n/admin/en/design";
import { messages as FR } from "@/lib/i18n/admin/fr/design";
import type { MessageKey } from "@/lib/tenancy/types";
import type { Locale } from "@/lib/page/schema";
import { toOklch } from "@/lib/theme/color";
import { fontData } from "@/lib/theme/fonts";
import { rngFor } from "@/lib/generator/rng";
import type { RenderDigest } from "./digest";
import type { DesignGenome, GeneKey } from "./genome";
import { loadCatalogue } from "./pairings";
import type { PhotoFacts } from "./photo-facts";

/** rendered by the admin catalog (core §I.5) */
export interface GenomeChip {
  gene: GeneKey;
  key: MessageKey;
  vars?: Record<string, string>;
}

/** The facts the why line may name (all optional: a template whose fact is missing is skipped). */
export interface ExplainFacts {
  /** the reader's locale (the vars are localised); default en */
  locale?: Locale;
  photos?: PhotoFacts | null;
  digest?: RenderDigest | null;
  /** the page accent (#rrggbb) when no digest is passed */
  accent?: string | null;
  /** the owner chose the voice (store setting), so the voice template may name it */
  voiceSet?: boolean;
}

type Catalog = Partial<Record<keyof typeof EN, string>>;
const CATALOGS: Readonly<Record<"en" | "fr" | "ar", Catalog>> = { en: EN, fr: FR, ar: AR };
const catalogOf = (l: Locale | undefined): Catalog => CATALOGS[l === "fr" || l === "ar" ? l : "en"];
const label = (cat: Catalog, key: string): string => (cat as Record<string, string | undefined>)[key] ?? (EN as Record<string, string>)[key] ?? key;

/** The DES-§20.3 colour family word of an OKLCH colour (no orange-family word exists: the band reads as sand or cocoa). */
function wordOfOklch(o: { l: number; c: number; h: number }): string {
  const h = o.h;
  if (o.c <= 0.03) return o.l >= 0.85 ? "ivory" : o.l <= 0.3 ? "ink" : "stone";
  if (h >= 25 && h < 75) return o.l >= 0.8 ? "cream" : o.l >= 0.5 ? "sand" : "cocoa";
  if (h < 25 || h >= 350) return o.l >= 0.7 ? "rose" : "crimson";
  if (h < 110) return "golden";
  if (h < 150) return o.l < 0.5 ? "olive" : "lime";
  if (h < 185) return "jade";
  if (h < 220) return "teal";
  if (h < 260) return o.l < 0.4 ? "navy" : "blue";
  if (h < 300) return "indigo";
  return o.l < 0.45 ? "plum" : "violet";
}

/** The DES-§20.3 colour family word of a #rrggbb colour. */
export const colourWord = (hex: string): string => wordOfOklch(toOklch(hex));

/** A neutral word from a luminance alone (the photo background, DES-§20.3 first row). */
const neutralWord = (luminance: number) => (luminance >= 0.85 ? "ivory" : luminance <= 0.3 ? "ink" : "stone");
const fromTuple = (o: [number, number, number]) => ({ l: o[0], c: o[1], h: o[2] });

/** The family name of a font id ("fraunces" → "Fraunces"). */
const familyOf = (id: string) => fontData(id)?.family ?? id.replace(/(^|-)([a-z])/g, (_m, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase());

export function explainGenome(g: DesignGenome, facts: ExplainFacts = {}): { chips: GenomeChip[]; why: { key: MessageKey; vars: Record<string, string> } } {
  const cat = catalogOf(facts.locale);
  const pairing = loadCatalogue().byId.get(g.brand.G4);
  const chips: GenomeChip[] = [
    { gene: "G2", key: `design.chip.grammar.${g.page.G2}` as MessageKey },
    { gene: "G4", key: "design.chip.pairing", vars: { display: familyOf(pairing?.display ?? g.brand.G4), displayAr: familyOf(pairing?.displayAr ?? g.brand.G4) } },
    { gene: "G9", key: `design.chip.strategy.${g.brand.G9}` as MessageKey },
    { gene: "G18", key: `design.chip.treatment.${g.page.G18}` as MessageKey },
  ];
  const p = facts.photos ?? null;
  const d = facts.digest ?? null;
  const base = d?.colour.base ?? null;
  const assetsShown = d ? Object.keys(d.counts.photoUses).length : null;
  const colour = (w: string) => label(cat, `design.colour.${w}`);
  type Why = { key: MessageKey; vars: Record<string, string> };
  // the photo facts, strongest first (DES-§4.8 table order)
  const strong: (Why | null)[] = [
    p && p.hasCutout === true && g.page.G18 === "cutout-stage" ? { key: "design.why.cutout", vars: {} } : null,
    p && p.count === 1 && (assetsShown === null || assetsShown <= 1) ? { key: "design.why.onePhoto", vars: {} } : null,
    p && p.background.uniform && p.background.luminance > 0.35 && (base === null || base !== "dark") ? { key: "design.why.background", vars: { colourName: colour(p.dominant && toOklch(p.dominant).c <= 0.06 ? colourWord(p.dominant) : neutralWord(p.background.luminance)) } } : null,
    p && p.background.luminance <= 0.35 && (base === "dark" || g.brand.G9 === "dark-luxe") && (d || facts.accent) ? { key: "design.why.darkFromPhoto", vars: { colourName: colour(d ? wordOfOklch(fromTuple(d.colour.accentOklch)) : colourWord(facts.accent!)) } } : null,
    p && p.count >= 3 && (g.page.G18 === "grid-contact" || g.page.G2 === "gallery-led") ? { key: "design.why.manyPhotos", vars: { count: String(p.count) } } : null,
  ];
  const first = strong.find((x): x is Why => !!x);
  if (first) return { chips, why: first };
  const accentWord = d ? wordOfOklch(fromTuple(d.colour.accentOklch)) : facts.accent && /^#[0-9a-f]{6}$/i.test(facts.accent) ? colourWord(facts.accent) : null;
  const lower = (s: string) => (facts.locale === "ar" ? s : s.toLowerCase());
  const soft: Why[] = [
    ...(accentWord ? [{ key: "design.why.accent" as MessageKey, vars: { strategy: label(cat, `design.chip.strategy.${g.brand.G9}`), colourName: colour(accentWord) } }] : []),
    ...(facts.voiceSet ? [{ key: "design.why.voice" as MessageKey, vars: { voice: lower(label(cat, `design.chip.voice.${g.brand.G28}`)) } }] : []),
    ...(facts.locale === "ar" && g.brand.G31 !== "none" ? [{ key: "design.why.market" as MessageKey, vars: {} }] : []),
  ];
  if (soft.length) return { chips, why: soft[Math.floor(rngFor(g.seed, "explain:why")() * soft.length)]! };
  // no input fact to anchor on: the strategy, a fact of the genome itself (never a colour the facts do not carry)
  return { chips, why: { key: "design.why.strategy", vars: { strategy: label(cat, `design.chip.strategy.${g.brand.G9}`) } } };
}

/** A chip as plain text in a locale (the GenomeCard's `explanation`, the DNA card's fallback). */
export function chipText(chip: GenomeChip, locale: Locale = "en"): string {
  const t = label(catalogOf(locale), chip.key);
  return t.replace(/\{(\w+)\}/g, (_m, k: string) => chip.vars?.[k] ?? "");
}

/** The why line as plain text in a locale. */
export function whyText(why: { key: MessageKey; vars: Record<string, string> }, locale: Locale = "en"): string {
  return label(catalogOf(locale), why.key).replace(/\{(\w+)\}/g, (_m, k: string) => why.vars[k] ?? "");
}
