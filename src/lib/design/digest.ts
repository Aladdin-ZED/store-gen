/**
 * The Director's inputs (P6 DESIGN; design.md DES-§8.9, DS34, DS59, RD-1; docs/STORE-SAAS.md §K.2 P0 design stubs,
 * CRIT2-6): the render digest (computed from the doc, the features and the heights, no DOM), the genome card the
 * Director sees instead of a genome, and the critique input. Pure and isomorphic. P7 builds its Director pass against
 * these shapes (frozen at P0, src/lib/contracts/r1-p0.ts).
 *
 * The digest reads the gates' own page view (./gates/view.ts) and the gate report, so its counts are the gate inputs
 * by construction: `counts.glass` is what V06 / S02 count, `counts.ctas` what V26 counts, `heights` the report's.
 *
 * `cod` (core §K.2, LAN-§3.7, ra §1.3 R9): the COD invariants, built by P3's `codInvariants(doc, inputs)` (the one
 * implementation the digest, the builder checklist and the honesty gate share) from the report's heights and the store
 * facts the caller passes as `renderDigest`'s fifth argument; `null` when the caller passed none (and while P3's body
 * is its P0 stub, which throws "not implemented"). With `cod: null` R9 is scored from `heights` and `hero.fold` alone,
 * never from guessed store facts (P0 review G1).
 *
 * The card carries bands only, never a distance number (DS7): with no verdict yet the bands are the novelty-off
 * answer of DES-§7.4 (every band `ok`, the store's first page).
 */
import { z } from "zod";
import { codInvariants, type CodInvariantInputs, type CodInvariants } from "@/lib/landing/cod-invariants";
import type { Locale, PageDoc, SectionBg } from "@/lib/page/schema";
import { buildTheme } from "@/lib/theme";
import { contrast, toOklch } from "@/lib/theme/color";
import type { BuiltTheme } from "@/lib/theme/types";
import { copyFieldsOf, merchantNumbers, structureOf } from "./cliche";
import { chipText, explainGenome } from "./explain";
import type { BoldGene, ColorStrategy, DesignGenome, HeadlineStructure, Opener } from "./genome";
import type { GateId, GateReport, OriginClass } from "./gates/types";
import { pageView, type PageView } from "./gates/view";
import { accentArea } from "./gates/visual";
import type { Band, FoldReport, HeightReport, NoveltyBands } from "./types";

/** rethink-ai §1.2 `RenderDigest`: counts only, never customer data */
export interface RenderDigest {
  v: 1;
  sections: {
    id: string;
    type: string;
    variant: string;
    /** layout family for the repetition cap */
    family: string;
    opener: Opener;
    align: "start" | "center";
    bg: SectionBg;
    glass: number;
    kicker: boolean;
    words: number;
    cardGrid: boolean;
    ctas: number;
    reveals: number;
  }[];
  hero: { family: string; headlineLines390: number; subWords: number; textElements: number; ctaWraps: boolean; ctaContrast: number; fitsViewport390: boolean; topPaddingPx: number; fold: FoldReport };
  counts: {
    eyebrows: number;
    eyebrowBudget: number;
    centeredRun: number;
    sameFamilyMax: number;
    zigzagRun: number;
    marquees: number;
    bento: number;
    equalCardTriplets: number;
    glass: number;
    reveals: number;
    ctas: number;
    photoUses: Record<string, number>;
    fullBleedMoments: number;
  };
  type: { pairing: string; displayFamily: string; arDisplay: string | null; heroDisplayPx390: number; ratio: number; weightsPerSectionMax: number };
  colour: { strategy: ColorStrategy; base: "light" | "tinted" | "dark"; accentOklch: [number, number, number]; popOklch: [number, number, number]; accentArea: number; orangeAdvisory: boolean };
  gates: { hard: GateId[]; soft: GateId[]; slop: number; q: number };
  heights: Pick<HeightReport, "total" | "screens" | "formTop" | "inFlow">;
  /** counts only; never customer data */
  honesty: { allowedNumbers: number; numbersInCopy: number; proofSections: string[] };
  /** the COD invariants (LAN-§3.7, R9) from `codInvariants(doc, { heights, ...cod })`; null = no store facts were passed */
  cod: CodInvariants | null;
  /** the P0 stub only: nothing was measured */
  stub?: true;
}

/** rethink-ai §1.2 `GenomeCard` (≈ 120 tokens): distance as bands only (DS7); the single source ai.md imports (QUAL-25, DS59). */
export interface GenomeCard {
  id: string;
  slot: "best_fit" | "contrast" | "explore";
  bold: Record<BoldGene, string>;
  derived: Record<string, string | number>;
  q: number;
  slop: number;
  composition: number;
  gateFails: GateId[];
  distance: { own: Band | "first"; niche: Band; platform: Band };
  /** the DES-§4.8 chips as text, one string per chip, e.g. ["Editorial column", "Fraunces / Readex Pro", "Ink and one accent", "Close-up details"] */
  explanation: string[];
}

const BandZ = z.enum(["ok", "close", "too_close"]);
const GateIdZ = z.string().regex(/^(V|S|C|N|T|K|I|R|RTL|D)[A-Za-z0-9_.-]{0,23}$/) as z.ZodType<GateId>;

/**
 * The GenomeCard as a strict schema (RD-1, DS7, DS59): what P7 validates a card against before it enters a prompt.
 * The distance is three bands and the first-page marker, never a number; the bold genes are their seven values.
 */
export const GenomeCardSchema: z.ZodType<GenomeCard> = z
  .object({
    id: z.string().min(1).max(40),
    slot: z.enum(["best_fit", "contrast", "explore"]),
    bold: z.object({ G1: z.string().max(48), G2: z.string().max(48), G4: z.string().max(48), G9: z.string().max(48), G18: z.string().max(48), G23: z.string().max(48), G28: z.string().max(48) }).strict(),
    derived: z.record(z.string().max(32), z.union([z.string().max(64), z.number()])),
    q: z.number().min(0).max(100),
    slop: z.number().min(0).max(100),
    composition: z.number().min(0).max(15),
    gateFails: z.array(GateIdZ).max(40),
    distance: z.object({ own: z.union([BandZ, z.literal("first")]), niche: BandZ, platform: BandZ }).strict(),
    explanation: z.array(z.string().max(120)).max(6),
  })
  .strict();

/** What `renderDigest` needs of the store besides the doc to fill `cod` (the heights come from the gate report). */
export type CodDigestInputs = Omit<CodInvariantInputs, "heights">;

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const oklchOf = (hex: string | undefined): [number, number, number] => {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return [0, 0, 0];
  const o = toOklch(hex);
  return [r3(o.l), r3(o.c), Math.round(o.h * 10) / 10];
};
const NUMBER = /\d+(?:[.,]\d+)?/g;
/** "- fact" lines of the product description (the generator's factsToDescription format) */
const factsOfDescription = (d: string | undefined) => (d ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim()).filter(Boolean);
const PROOF_TYPES: ReadonlySet<string> = new Set(["reviews", "socialProof", "stats"]);
const visible = (s: string) => s.replace(/\*+/g, "").trim();

/** The hero rows of the digest from the view (DES-§8.9; the rubric's "hero fits with ≤ 2 headline lines and ≤ 4 text elements"). */
function heroOf(v: PageView, theme: BuiltTheme, report: GateReport): RenderDigest["hero"] {
  const h = v.hero;
  const fold = report.heights.fold;
  if (!h) return { family: "", headlineLines390: 0, subWords: 0, textElements: 0, ctaWraps: false, ctaContrast: 0, fitsViewport390: fold.ok, topPaddingPx: 0, fold };
  const str = (k: string) => (typeof h.data[k] === "string" ? visible(h.data[k] as string) : "");
  const title = str("title") || v.landing?.product.name || "";
  const px = v.type.tt?.heroAt390 ?? 44;
  const advance = v.ar ? 0.55 : 0.5;
  const perLine = Math.max(6, Math.floor(350 / (px * advance)));
  const cta = str("ctaLabel");
  const elements = [str("kicker"), title, str("subtitle"), cta || "cta", Array.isArray(h.data.notes) && (h.data.notes as unknown[]).length ? "notes" : "", Array.isArray(h.data.trust) && (h.data.trust as unknown[]).length ? "trust" : ""].filter(Boolean).length;
  const ink = theme.tokens["lp-accent-ink"];
  const bg = theme.tokens["lp-accent"];
  const items = Object.values(fold.items);
  return {
    family: h.variant,
    headlineLines390: title ? Math.ceil([...title].length / perLine) : 0,
    subWords: str("subtitle").split(/\s+/).filter(Boolean).length,
    textElements: elements,
    ctaWraps: [...cta].length * 16 * 0.55 > 358 - 48,
    ctaContrast: ink && bg && /^#/.test(ink) && /^#/.test(bg) ? Math.round(contrast(ink, bg) * 100) / 100 : 0,
    fitsViewport390: fold.ok && items.every((px2) => px2 <= 844),
    topPaddingPx: Math.round(h.top),
    fold,
  };
}

/** ≤ 2 ms */
export function renderDigest(doc: PageDoc, theme: BuiltTheme, genome: DesignGenome, report: GateReport, cod?: CodDigestInputs): RenderDigest {
  const v = pageView({ doc, kind: "landing", genome, locale: doc.locale, heights: report.heights });
  const t = theme.tokens;
  const weights = new Set(["lp-display-weight", "lp-body-weight", "lp-strong-weight"].map((n) => t[n]).filter(Boolean)).size;
  const advisory = Object.entries(t).some(([n, hex]) => n.startsWith("lp-") && n !== "lp-accent" && n !== "lp-pop" && !/^lp-[an]-[0-9]/.test(n) && /^#[0-9a-f]{6}$/i.test(hex) && (() => {
    const o = toOklch(hex);
    return o.c > 0.1 && o.h >= 75 && o.h <= 95;
  })());
  let codOut: CodInvariants | null = null;
  if (cod) {
    try {
      codOut = codInvariants(doc, { heights: report.heights, ...cod });
    } catch {
      codOut = null;
    }
  }
  let numbersInCopy = 0;
  for (const text of v.fields.values()) numbersInCopy += (text.match(NUMBER) ?? []).length;
  const allowed = merchantNumbers({ facts: factsOfDescription(doc.product.description), productName: doc.product.name, price: doc.items[0]?.price ?? null });
  return {
    v: 1,
    sections: v.all.map((s) => ({ id: s.id, type: s.type, variant: s.variant, family: s.family, opener: s.opener, align: s.align, bg: s.bg, glass: s.glass, kicker: s.kicker, words: s.allWords, cardGrid: s.f.cardGrid, ctas: s.ctas, reveals: s.reveals })),
    hero: heroOf(v, theme, report),
    counts: { ...v.counts, photoUses: { ...v.counts.photoUses } },
    type: {
      pairing: v.type.pairingId,
      displayFamily: v.type.pairing?.display ?? doc.theme.fonts.display,
      arDisplay: v.type.pairing?.displayAr ?? doc.theme.fonts.displayAr ?? null,
      heroDisplayPx390: Math.round(v.type.tt?.heroAt390 ?? 0),
      ratio: Math.round((v.type.tt?.ratio.m ?? 0) * 100) / 100,
      weightsPerSectionMax: weights,
    },
    colour: {
      strategy: doc.theme.look?.cs ?? genome.brand.G9,
      base: doc.theme.palette.base,
      accentOklch: oklchOf(t["lp-accent"]),
      popOklch: oklchOf(t["lp-pop"]),
      accentArea: Math.round(accentArea(v, theme.scheme === "dark") * 100) / 100,
      orangeAdvisory: advisory,
    },
    gates: { hard: [...new Set(report.hard.map((i) => i.id))], soft: [...new Set(report.soft.map((i) => i.id))], slop: report.slop.score, q: report.q },
    heights: { total: report.heights.total, screens: report.heights.screens, formTop: report.heights.formTop, inFlow: report.heights.inFlow },
    honesty: { allowedNumbers: allowed.size, numbersInCopy, proofSections: v.flow.filter((s) => PROOF_TYPES.has(s.type)).map((s) => s.id) },
    cod: codOut,
  };
}

/** The novelty-off bands (DES-§7.4): what a card shows before the first verdict. */
const UNCHECKED = { own: "first", niche: "ok", platform: "ok" } as const;

/** The card the Director sees instead of a genome (bands only, ≈ 120 tokens). */
export function genomeCard(g: DesignGenome, report: GateReport, bands: NoveltyBands | null, slot: GenomeCard["slot"], locale: Locale = "en"): GenomeCard {
  const { chips } = explainGenome(g, { locale });
  return {
    id: `g${(g.seed >>> 0).toString(36)}-${g.brand.G1.slice(0, 4)}-${g.page.G2.slice(0, 4)}`.slice(0, 40),
    slot,
    bold: { G1: g.brand.G1, G2: g.page.G2, G4: g.brand.G4, G9: g.brand.G9, G18: g.page.G18, G23: g.brand.G23.f, G28: g.brand.G28 },
    derived: { G10: g.page.G10, G12: g.brand.G12, G15: g.brand.G15, G16: g.page.G16, G17: g.brand.G17, G20: `${g.page.G20.l}/${g.page.G20.p}`, G22: g.page.G22, G26: g.brand.G26, G27: g.brand.G27 },
    q: report.q,
    slop: Math.min(100, report.slop.score),
    composition: report.composition.score,
    gateFails: [...new Set([...report.hard, ...report.soft].map((i) => i.id))].slice(0, 40),
    distance: bands ? { own: bands.own, niche: bands.niche, platform: bands.platform } : { ...UNCHECKED },
    explanation: chips.map((c) => chipText(c, locale).slice(0, 120)),
  };
}

/** What the Director's critique reads (DES-§8.9): the card, the digest and the generated headlines. */
export interface CritiqueInput {
  card: GenomeCard;
  digest: RenderDigest;
  /** generated title and lead lines only (never owner text, never contact data) */
  headlines: { section: string; field: string; text: string; structure: HeadlineStructure }[];
}

const HEADLINE = /^[^.]+\.(title|headline|heading|lead|subtitle)$/;
const CONTACT_TYPES: ReadonlySet<string> = new Set(["header", "footer", "whatsappFloat", "announcement"]);
const CONTACT = /(\+?\d[\d\s().-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)|(https?:\/\/)/;

/** The critique input of one page (generated text only; `origin` absent = every field `library`, the core's rule). */
export function critiqueSummary(report: GateReport, genome: DesignGenome, doc: PageDoc, origin?: ReadonlyMap<string, OriginClass>): CritiqueInput {
  const theme = buildTheme(doc.theme, doc.locale);
  const types = new Map(doc.sections.map((s) => [s.id, s.type]));
  const headlines: CritiqueInput["headlines"] = [];
  for (const [path, text] of copyFieldsOf(doc)) {
    if (!HEADLINE.test(path)) continue;
    const section = path.split(".")[0]!;
    if (CONTACT_TYPES.has(types.get(section) ?? "") || (origin?.get(path) ?? "library") === "owner" || CONTACT.test(text)) continue;
    headlines.push({ section, field: path, text: visible(text).slice(0, 200), structure: structureOf(text, doc.locale) });
  }
  return { card: genomeCard(genome, report, null, "best_fit"), digest: renderDigest(doc, theme, genome, report), headlines: headlines.slice(0, 24) };
}
