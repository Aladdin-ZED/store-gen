/**
 * The Director families' fixture inputs (P7 AI; ai.md AI-§F.3 Director row: "R1 uses the 24 core fixtures with their
 * 6 engine candidates each"). A case becomes a `DirectorBrief` (the store's own data, the niche's rounded shares) and
 * six candidates of the shapes design's engine returns (`GenomeCard`, the digest, the hero copy).
 *
 * Until P6's sampler is real (`sampleGenome` is a P0 stub), the six candidates are fixed synthetic cards with the
 * planted cases of AI-§F.3 / AI-§A.8.9: two near twins (0.2 apart), an estimated C3 budget (stays eligible), a
 * token-level no-orange hard gate V03 (never picked) and an F1 budget over (never picked). Gene values are fixed
 * strings, not read from `GENE_VOCAB`, so the fixtures (and their hash) do not move when design completes its
 * vocabulary; the engine's real candidates replace them through a new fixtures hash and a new baseline.
 */
import { PoliciesSetting } from "@/lib/settings/keys/policies";
import { sha256Hex } from "../../../prompts/sha256";
import type { BoldGene, Candidate, DirectorBrief, DirectorDigest, DirectorPlan, GenomeCard, RenderDigest } from "../../../director/types";
import type { EvalCase } from "./cases";

const NICHE: DirectorBrief["recent"]["nicheCrowding"] = {
  n: 40,
  grammar: { "editorial-column": 0.4 },
  strategy: {},
  heroFamily: {},
  heroArrangement: {},
  displayFamily: {},
  arDisplay: {},
  arDisplayClass: {},
  motion: {},
  ghost: {},
  seq4: [{ gram: [1, 4, 7, 9], share: 0.4 }],
  tells: [{ pair: ["ghost-word", "eyebrow-set"], share: 0.3 }],
};

/** The brief the wizard would build for the case's store and product. */
export function briefOf(c: EvalCase): DirectorBrief {
  const locales = [c.locale, ...(["fr", "ar", "en"] as const).filter((l) => l !== c.locale)];
  return {
    store: { handle: c.store.id, market: c.store.market, locales, memory: c.store.memory.map((m) => ({ kind: m.kind, text: m.text, locale: m.locale })), policies: PoliciesSetting.parse(c.store.policies), brandSeed: `seed-${c.store.id}` },
    product: {
      name: c.product.name,
      category: c.product.category,
      facts: c.product.facts,
      price: { minor: c.product.priceMinor, currency: c.product.currency },
      items: [{ id: "i1", name: c.product.name, options: [] }],
      offers: [{ id: "o1", label: "1", units: 1, priceMinor: c.product.priceMinor, freeShipping: false }],
    },
    photos: (c.photos ?? []).map((p, i) => ({ assetId: `photo-${i + 1}`, w: p.w, h: p.h, hasCutout: "estimated" as const, palette: [] })),
    mode: "landing",
    constraints: { noOrange: true, mood: c.product.category === "fitness" || c.product.category === "tech" ? "lively" : "calm", modest: c.group === "modest", locks: {} },
    recent: { storeGenomeCards: [], nicheCrowding: NICHE },
  };
}

/** A fixed plan (the critique's input), the same for every case and independent of the engine's ranking. */
export function planOf(): DirectorPlan {
  const dir = (slot: "best_fit" | "contrast" | "explore", structure: "noun-phrase" | "contrast-pair" | "question", angle: "benefit" | "problem" | "value") => ({
    slot,
    hints: {},
    headlineStructures: [structure],
    copyAngle: angle,
    mustHave: [],
    mustAvoid: ["centred-dark-hero-glow"],
    rationale: "",
  });
  return {
    read: { readLine: "", audience: "", priceTier: "mid", suggestedFacts: [], photoQuality: { sharp: true, clutter: "none", fullBleedOk: false, cutoutViable: false, advice: null }, dials: { variance: 5, motion: 4, density: 5 }, risks: [] },
    directions: [dir("best_fit", "noun-phrase", "benefit"), dir("contrast", "contrast-pair", "problem"), dir("explore", "question", "value")],
  };
}

const BASE: Record<BoldGene, string> = { G1: "a1", G2: "b1", G4: "c1", G9: "d1", G18: "e1", G23: "f1", G28: "g1" };

function card(id: string, slot: GenomeCard["slot"], bold: Partial<Record<BoldGene, string>>, q: number, derived: Record<string, string>, gateFails: string[] = []): GenomeCard {
  return { id, slot, bold: { ...BASE, ...bold }, derived, q, slop: 1, composition: 11, gateFails: gateFails as GenomeCard["gateFails"], distance: { own: "first", niche: "ok", platform: "ok" }, explanation: [`Candidate ${id}`] };
}

type Sections = RenderDigest["sections"];
const SECTION = (id: string, type: string, kicker: boolean): Sections[number] => ({ id, type, variant: `${type}-a`, family: "split", opener: kicker ? "kicker" : "bare", align: "start", bg: "base", glass: 0, kicker, words: 30, cardGrid: false, ctas: type === "hero" ? 1 : 0, reveals: 2 });

function digest(q: number, patch: { hard?: string[]; budgets?: Partial<DirectorDigest["budgets"]> } = {}): DirectorDigest {
  const fold = { family: "stage", ok: true, items: { image: 120, price: 520, cta: 600, cod: 660 }, limit: 844 as const };
  return {
    v: 1,
    sections: [SECTION("hero", "hero", true), SECTION("benefits", "benefits", true), SECTION("offer", "offer", false), SECTION("orderForm", "orderForm", false), SECTION("faq", "faq", false), SECTION("footer", "footer", false)],
    hero: { family: fold.family, headlineLines390: 2, subWords: 18, textElements: 4, ctaWraps: false, ctaContrast: 7.1, fitsViewport390: true, topPaddingPx: 24, fold },
    counts: { eyebrows: 2, eyebrowBudget: 2, centeredRun: 1, sameFamilyMax: 2, zigzagRun: 1, marquees: 0, bento: 0, equalCardTriplets: 0, glass: 0, reveals: 12, ctas: 3, photoUses: { "photo-1": 2 }, fullBleedMoments: 1 },
    type: { pairing: "p1", displayFamily: "d1", arDisplay: "a1", heroDisplayPx390: 48, ratio: 3, weightsPerSectionMax: 2 },
    colour: { strategy: "ink+one", base: "light", accentOklch: [0.5, 0.1, 160], popOklch: [0.6, 0.1, 170], accentArea: 0.08, orangeAdvisory: false },
    gates: { hard: (patch.hard ?? []) as RenderDigest["gates"]["hard"], soft: [], slop: 1, q },
    heights: { total: 9_800, screens: 11.6, formTop: 2_400, inFlow: 9 },
    honesty: { allowedNumbers: 2, numbersInCopy: 1, proofSections: [] },
    cod: null,
    budgets: { C2: "ok", C3: "ok", F1: "ok", ...patch.budgets },
    raster: null,
  };
}

/** The case's six candidates; Q varies by case so picks differ across the set. */
export function candidatesOf(c: EvalCase): Candidate[] {
  const v = parseInt(sha256Hex(c.id).slice(0, 4), 16) % 7;
  const hero = { headline: c.product.name, sub: c.product.facts.join(". ") || c.product.name, cta: c.locale === "ar" ? "اطلب دابا" : c.locale === "fr" ? "Je commande" : "Order now" };
  return [
    { card: card("c1", "best_fit", {}, 82 + v, { density: "balanced", heroArrangement: "left" }), digest: digest(82 + v), heroCopy: hero },
    { card: card("c2", "best_fit", { G1: "a2", G2: "b2" }, 85 - v, { density: "balanced", heroArrangement: "left" }), digest: digest(85 - v), heroCopy: hero },
    { card: card("c3", "contrast", { G1: "a3", G2: "b3", G4: "c3", G9: "d3", G18: "e3" }, 80, { density: "airy", heroArrangement: "right" }), digest: digest(80, { budgets: { C3: "estimated" } }), heroCopy: hero },
    { card: card("c4", "contrast", { G1: "a4", G2: "b4", G4: "c4", G9: "d4", G18: "e4", G23: "f4" }, 95, { density: "airy", heroArrangement: "center" }, ["V03"]), digest: digest(95, { hard: ["V03"] }), heroCopy: hero },
    { card: card("c5", "explore", { G1: "a5", G2: "b5", G4: "c5", G9: "d5", G18: "e5", G23: "f5" }, 78 + v, { density: "dense", heroArrangement: "center" }), digest: digest(78 + v), heroCopy: hero },
    { card: card("c6", "explore", { G1: "a6", G2: "b6", G4: "c6", G9: "d6", G18: "e6", G23: "f6", G28: "g6" }, 97, { density: "dense", heroArrangement: "right" }), digest: digest(97, { budgets: { F1: "over" } }), heroCopy: hero },
  ];
}

/** The candidates that must never be picked (AI-§F.3 planted hard fails). */
export const PLANTED_NEVER_PICKED = ["c4", "c6"] as const;

/**
 * The JPEG-artefact case (AI-19 (6), QUAL-29): candidate c2 (eligible, tokens clean) carries a raster orange hit,
 * as compression artefacts around a warm photo would give; `orangeAdvisory` is the digest's soft flag. No V03, so
 * no hard fail: the hit must exclude nothing.
 */
export const JPEG_ARTEFACT_ID = "c2";
export function jpegArtefactOf(cands: Candidate[]): Candidate[] {
  return cands.map((c) =>
    c.card.id === JPEG_ARTEFACT_ID
      ? { ...c, digest: { ...c.digest, colour: { ...c.digest.colour, orangeAdvisory: true }, raster: { fidelity: "partial", orangeRegions: { count: 2, px: 380 }, overflow: [] } } }
      : c,
  );
}
