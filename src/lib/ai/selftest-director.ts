/**
 * test:ai sections of the Director's pure layer (P7 AI; ai.md AI-§Q.1 rev 3 / rev 4 additions, AI-§A.8.9, AI-19
 * acceptance 1, 2, 6, 7, 11, 12, 13, 14; step 3 of the P7 plan). Registered by src/lib/ai/selftest.ts, which owns the
 * runner, the budget and `--strict`.
 *
 * Sections:
 *   director-seams     no local redeclaration of design's shapes under src/lib/ai/ (GenomeCard, RenderDigest,
 *                      NicheShares, GeneHints, SampleOpts, Band, RepairOp, FoldReport, HintIntake, AI_REPAIR_OPS,
 *                      GENE_VOCAB); director/types.ts imports them from @/lib/design; the loose JSON carries no length
 *                      keyword; the strict schemas accept the fixtures and refuse tiles in a tile-less round
 *   director-vocab     the rendered vocabulary block equals AI_REPAIR_OPS + GENE_VOCAB (+ openers, angles, patterns)
 *   director-rubric    RUBRIC_V3: version, pinned hash, precedence order, the void orange-family items, the tile-only
 *                      parts, no serif ban, no dash or middle dot
 *   director-budgets   budgetVerdicts at the band edges (18,749 / 18,751; 3,749 / 3,751; fold item 937 / 939 px), the
 *                      stub digest, hardFailsOf
 *   director-plan      finalizePlan: enums, dials, suggested facts, hints through validateHints (drops logged), the pin
 *                      to SampleOpts.pins and the second pin, structures distinct, angles, mustAvoid with the niche's
 *                      seq4 / tells at ≥ 30 %, the rationale guard
 *   director-critique  finalizeCritique: unknown card id, missing section, digest contradiction, no_tiles, ≤ 3 ops,
 *                      ops typed, non-picks slim, hard-fail never picked, over never picked, estimated never excluded
 *                      nor alone repaired, picks distinct, picks_adjusted, whyLines one locale, distinctness recomputed
 *   director-accept    the stage-5 rule: a planted swapHeroFamily leaving Q equal is kept; hard / slop / band refusals
 *   director-brief     boundBrief, candidatePlan (4 per brief, top 2 by gate → distance → Q), ≤ 12 per checkNovelty
 *                      call, CriticPicks ≤ 2 KB and free of page text
 *   director-strict    (--strict, at the R1 integration) the checks that need P6's real vocabulary and validateHints
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AI_REPAIR_OPS, ANGLES, GENE_VOCAB, HEADLINE_STRUCTURES, OPENERS, validateHints, type BoldGene, type GeneKey } from "@/lib/design";
import { PoliciesSetting } from "@/lib/settings/keys/policies";
import { FOLD_BAND, FOLD_LINE_PX, HEIGHT_BAND, LANDING_PROFILE } from "@/lib/render/prepublish/budget-limits";
import { acceptOp, gateSnapshot, type GateSnapshot } from "./director/accept";
import { CANDIDATE_PLAN, CRITIC_PICKS_MAX_BYTES, NICHE_AVOID_SHARE, boundBrief, candidatePlan, criticPicksOf, nicheAvoid, noveltyBatches, type SampledCandidate } from "./director/brief";
import { budgetVerdicts, budgetsOver, directorDigest, hardFailsOf } from "./director/budgets";
import {
  BOLD_GENES,
  CRITIQUE_LOOSE_JSON,
  CandidateSchema,
  CritiqueInputSchema,
  CritiqueSchema,
  DIRECTOR_LIMITS,
  DIRECTOR_PLAN_LOOSE_JSON,
  DIRECTOR_SLOTS,
  DirectorBriefSchema,
  DirectorPlanSchema,
  NAMED_PATTERN_IDS,
  RUBRIC_DIMS,
  TILE_PARTS,
  type Candidate,
  type CritiqueLoose,
  type DirectorBrief,
  type DirectorDigest,
  type DirectorPlanLoose,
  type GenomeCard,
  type RenderDigest,
} from "./director/types";
import { adjustPicks, cardDistance, directorFlags, finalizeCritique, finalizePlan, toSampleOpts } from "./director/validate";
import { VOCABULARY_BLOCK, renderVocabularyBlock, vocabularyOf } from "./director/vocab";
import { RUBRIC_V3, RUBRIC_V3_DIMS } from "./prompts/rubric/v3";
import { filesUnder, jsonKeywords, type SelftestApi } from "./selftest-guard";
import type { FinalizeCtx } from "./schema/tasks/types";

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const POLICIES = PoliciesSetting.parse({});

function fctx(patch: Partial<FinalizeCtx> = {}): FinalizeCtx {
  return {
    locale: "fr",
    productName: "Sérum Argan",
    facts: ["Flacon de 30 ml"],
    price: 199,
    deliveryText: null,
    storeFacts: [],
    hasWhatsapp: true,
    policies: POLICIES,
    callingHours: { text: null, withinHours: null },
    origin: "cloud",
    ...patch,
  };
}

/** The first enumerated value of a gene in the current GENE_VOCAB (the P0 stub or P6's table). */
const firstValue = (g: GeneKey): string => GENE_VOCAB[g]?.values?.[0] ?? "";

const BASE_BOLD: Record<BoldGene, string> = { G1: "a1", G2: "b1", G4: "c1", G9: "d1", G18: "e1", G23: "f1", G28: "g1" };

function card(id: string, slot: GenomeCard["slot"], bold: Partial<Record<BoldGene, string>>, patch: Partial<GenomeCard> = {}): GenomeCard {
  return {
    id,
    slot,
    bold: { ...BASE_BOLD, ...bold },
    derived: { density: "balanced", heroArrangement: "left" },
    q: 80,
    slop: 1,
    composition: 11,
    gateFails: [],
    distance: { own: "ok", niche: "ok", platform: "ok" },
    explanation: ["Editorial column, Fraunces with Readex Pro, ink and one accent"],
    ...patch,
  };
}

type Sections = RenderDigest["sections"];
const SECTION = (id: string, type: string, opener: Sections[number]["opener"], kicker: boolean, align: "start" | "center" = "start"): Sections[number] => ({
  id,
  type,
  variant: `${type}-a`,
  family: "split",
  opener,
  align,
  bg: "base",
  glass: 0,
  kicker,
  words: 30,
  cardGrid: false,
  ctas: type === "hero" ? 1 : 0,
  reveals: 2,
});

function digest(patch: { hard?: string[]; soft?: string[]; slop?: number; q?: number; budgets?: Partial<DirectorDigest["budgets"]>; stub?: true; heroFamily?: string } = {}): DirectorDigest {
  const fold = { family: patch.heroFamily ?? "stage", ok: true, items: { image: 120, price: 520, cta: 600, cod: 660 }, limit: 844 as const };
  return {
    v: 1,
    sections: [SECTION("hero", "hero", "bare", true), SECTION("benefits", "benefits", "kicker", true), SECTION("offer", "offer", "bare", false), SECTION("orderForm", "orderForm", "bare", false), SECTION("faq", "faq", "caption", false, "center"), SECTION("footer", "footer", "bare", false)],
    hero: { family: fold.family, headlineLines390: 2, subWords: 18, textElements: 4, ctaWraps: false, ctaContrast: 7.1, fitsViewport390: true, topPaddingPx: 24, fold },
    counts: { eyebrows: 2, eyebrowBudget: 2, centeredRun: 1, sameFamilyMax: 2, zigzagRun: 1, marquees: 0, bento: 0, equalCardTriplets: 0, glass: 0, reveals: 12, ctas: 3, photoUses: { a1: 2 }, fullBleedMoments: 1 },
    type: { pairing: "nocturne", displayFamily: "bodoni-moda", arDisplay: "alexandria", heroDisplayPx390: 48, ratio: 3, weightsPerSectionMax: 2 },
    colour: { strategy: "ink+one", base: "light", accentOklch: [0.5, 0.1, 160], popOklch: [0.6, 0.1, 170], accentArea: 0.08, orangeAdvisory: false },
    gates: { hard: (patch.hard ?? []) as RenderDigest["gates"]["hard"], soft: (patch.soft ?? []) as RenderDigest["gates"]["soft"], slop: patch.slop ?? 1, q: patch.q ?? 84 },
    heights: { total: 9_800, screens: 11.6, formTop: 2_400, inFlow: 9 },
    honesty: { allowedNumbers: 2, numbersInCopy: 1, proofSections: [] },
    cod: null,
    ...(patch.stub ? { stub: true as const } : {}),
    budgets: { C2: "ok", C3: "ok", F1: "ok", ...patch.budgets },
    raster: null,
  };
}

const HERO = { headline: "Une peau souple dès le premier soir", sub: "Un sérum léger qui pénètre vite.", cta: "Je commande" };

/**
 * Six candidates (distances by `cardDistance`): c1 / c2 are 0.2 apart (two bold genes); c3 (estimated C3) and c5
 * (explore) are far from both; c4 carries the token-level no-orange hard gate V03; c6 is over the F1 budget.
 */
const CANDS: Candidate[] = [
  { card: card("c1", "best_fit", {}, { q: 86 }), digest: digest({ q: 86 }), heroCopy: HERO },
  { card: card("c2", "best_fit", { G1: "a2", G2: "b2" }, { q: 88 }), digest: digest({ q: 88 }), heroCopy: HERO },
  { card: card("c3", "contrast", { G1: "a3", G2: "b3", G4: "c3", G9: "d3", G18: "e3" }, { derived: { density: "airy", heroArrangement: "right" } }), digest: digest({ budgets: { C3: "estimated" } }), heroCopy: HERO },
  { card: card("c4", "contrast", { G1: "a4", G2: "b4", G4: "c4", G9: "d4", G18: "e4", G23: "f4" }, { q: 95, gateFails: ["V03"] }), digest: digest({ hard: ["V03"], q: 95 }), heroCopy: HERO },
  { card: card("c5", "explore", { G1: "a5", G2: "b5", G4: "c5", G9: "d5", G18: "e5", G23: "f5" }, { derived: { density: "dense", heroArrangement: "center" } }), digest: digest(), heroCopy: HERO },
  { card: card("c6", "explore", { G1: "a6", G2: "b6", G4: "c6", G9: "d6", G18: "e6", G23: "f6", G28: "g6" }, { q: 97 }), digest: digest({ budgets: { F1: "over" }, q: 97 }), heroCopy: HERO },
];

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
  seq4: [
    { gram: [1, 4, 7, 9], share: 0.4 },
    { gram: [1, 2, 3, 4], share: 0.2 },
  ],
  tells: [
    { pair: ["ghost-word", "eyebrow-set"], share: 0.3 },
    { pair: ["ring", "dots"], share: 0.1 },
  ],
};

function brief(patch: Partial<DirectorBrief> = {}): DirectorBrief {
  return {
    store: { handle: "argan-house", market: "MA", locales: ["fr", "ar", "en"], memory: [], policies: POLICIES, brandSeed: "seed-1" },
    product: { name: "Sérum Argan", category: "skincare", facts: ["Flacon de 30 ml"], price: { minor: 19_900, currency: "MAD" }, items: [{ id: "i1", name: "Sérum Argan", options: [] }], offers: [{ id: "o1", label: "1 flacon", units: 1, priceMinor: 19_900, freeShipping: false }] },
    photos: [{ assetId: "a1", w: 1024, h: 1024, hasCutout: "estimated", palette: ["#2f5d50", "#f4f1ea"] }],
    mode: "landing",
    constraints: { noOrange: true, mood: "calm", modest: false, locks: {} },
    recent: { storeGenomeCards: [], nicheCrowding: NICHE },
    ...patch,
  };
}

function loosePlan(): DirectorPlanLoose {
  const g2 = firstValue("G2");
  return {
    read: {
      readLine: "Une page calme pour un soin léger du quotidien",
      audience: "Des femmes qui veulent un soin simple",
      priceTier: "mid",
      suggestedFacts: [
        { text: "Flacon de 30 ml", from: "photo" },
        { text: "Flacon de 30 ml", from: "photo" },
        { text: "Pipette compte-gouttes", from: "photo" },
        { text: "Bouchon noir", from: "photo" },
        { text: "Étiquette blanche", from: "photo" },
        { text: "Huile claire", from: "photo" },
        { text: "Boîte en carton", from: "name" },
      ],
      photoQuality: { sharp: true, clutter: "none", fullBleedOk: false, cutoutViable: true, advice: "Une photo sur fond uni aide le détourage." },
      dials: { variance: 7, motion: 14, density: 3.4 },
      risks: ["Le produit est clair: le fond doit le porter sans le noyer."],
    },
    directions: [
      {
        slot: "best_fit",
        hints: [
          { gene: "G2", value: g2, weight: 3 },
          { gene: "G99", value: "nowhere", weight: 1 },
          { gene: "G9", value: "not-a-strategy", weight: 2 },
        ],
        pins: [
          { gene: "G2", value: g2 },
          { gene: "G9", value: firstValue("G9") },
        ],
        headlineStructures: ["noun-phrase", "question", "imperative"],
        copyAngle: "benefit",
        mustHave: ["Le flacon en grand", "Le prix près du bouton"],
        mustAvoid: ["equal-card-triplet", "three equal cards in a row", "a made-up pattern"],
        rationale: "Une mise en page calme qui laisse toute la place au produit.",
      },
      {
        slot: "contrast",
        hints: [],
        pins: [{ gene: "G4", value: "not-a-pairing" }],
        headlineStructures: ["question", "contrast-pair"],
        copyAngle: "luxury",
        mustHave: [],
        mustAvoid: ["gradient-text"],
        rationale: "Livré en 24 h partout au Maroc.",
      },
      {
        slot: "explore",
        hints: [{ gene: "G18", value: firstValue("G18"), weight: 3 }],
        pins: [{ gene: "G10", value: "0.2" }],
        headlineStructures: ["word-subline"],
        copyAngle: "ritual",
        mustHave: [],
        mustAvoid: [],
        rationale: "Un geste du soir — posé, net et sans détour.",
      },
    ],
  };
}

const NULL_SCORES = Object.fromEntries([...RUBRIC_DIMS, ...TILE_PARTS].map((k) => [k, null])) as CritiqueLoose["perCandidate"][number]["scores"];
const NULL_OP = { section: null, to: null, toIndex: null, gene: null, field: null, structure: null, maxWords: null };
const ev = (e: Partial<{ card: string; tile: string; section: number; quote: string }>) => ({ card: e.card ?? null, tile: e.tile ?? null, section: e.section ?? null, quote: e.quote ?? null });

function looseCritique(patch: Partial<CritiqueLoose> = {}): CritiqueLoose {
  return {
    perCandidate: [
      {
        id: "c1",
        picked: true,
        scores: { ...NULL_SCORES, R1: 4, R3: 4, R4: 4.6, R8: 3, R9: 5, "R2.tiles": 4, R2: 3 },
        hardFails: [],
        issues: [
          { dim: "R5", severity: "major", evidence: ev({ section: 1, quote: "four eyebrows on the page" }) },
          { dim: "R8", severity: "minor", evidence: ev({ section: 0, quote: "the headline names nothing specific" }) },
          { dim: "R1", severity: "minor", evidence: ev({ card: "c99" }) },
          { dim: "R3", severity: "minor", evidence: ev({ section: 9 }) },
          { dim: "R7", severity: "minor", evidence: ev({ section: 2, quote: "too much motion" }) },
          { dim: "R2", severity: "minor", evidence: ev({ section: 1, quote: "the composition reads flat" }) },
          { dim: "R6", severity: "minor", evidence: ev({ tile: "A mobile hero" }) },
          { dim: "R3", severity: "minor", evidence: ev({}) },
        ],
        repairs: [
          { ...NULL_OP, op: "setOpener", section: "benefits", to: "bare" },
          { ...NULL_OP, op: "changeGene", gene: "G2", to: "not-a-grammar" },
          { ...NULL_OP, op: "dropKicker", section: "offer" },
          { ...NULL_OP, op: "swapHeroFamily", to: "split-media" },
          { ...NULL_OP, op: "trimCopy", section: "1", field: "lead", maxWords: 12 },
          { ...NULL_OP, op: "setAlign", section: "faq", to: "start" },
          { ...NULL_OP, op: "moveSection", section: "hero", toIndex: 3 },
        ],
      },
      {
        id: "c2",
        picked: false,
        scores: { ...NULL_SCORES, R1: 3 },
        hardFails: [],
        issues: [
          { dim: "R8", severity: "minor", evidence: ev({ card: "c2", quote: "the same angle as c1" }) },
          { dim: "R1", severity: "minor", evidence: ev({ card: "c2" }) },
        ],
        repairs: [{ ...NULL_OP, op: "setAlign", section: "faq", to: "start" }],
      },
      { id: "c3", picked: true, scores: { ...NULL_SCORES, R1: 4 }, hardFails: [], issues: [], repairs: [{ ...NULL_OP, op: "setAlign", section: "faq", to: "start" }] },
      { id: "c4", picked: false, scores: NULL_SCORES, hardFails: [], issues: [{ dim: "R4", severity: "block", evidence: ev({ card: "c4", quote: "an orange token" }) }], repairs: [] },
      { id: "c5", picked: true, scores: { ...NULL_SCORES, R10: 5 }, hardFails: [], issues: [], repairs: [] },
      { id: "c7", picked: false, scores: NULL_SCORES, hardFails: [], issues: [], repairs: [] },
    ],
    pick: ["c1", "c3", "c5"],
    whyLines: {
      locale: "fr",
      lines: ["Une page calme qui met le flacon au centre.", "Un contraste net — pour un produit qui se voit.", "Livré en 24 h, une page qui ose."],
    },
    distinctness: [0.99, 0.99, 0.99],
    ...patch,
  };
}

const INPUT = { brief: brief(), candidates: CANDS, tilesPresent: false };
const HERE = join(process.cwd(), "src", "lib", "ai");

/* ------------------------------------------------------------------ */
/* sections                                                            */
/* ------------------------------------------------------------------ */

export function registerDirectorSections(t: SelftestApi): void {
  const { section, check, eq } = t;

  section("director-seams", () => {
    // AI-19 acceptance 12 / 13: design's shapes are imported, never redeclared anywhere under src/lib/ai/
    const DESIGN_SHAPES = "GenomeCard|RenderDigest|NicheShares|GeneHints|SampleOpts|Band|RepairOp|AiRepairOp|FoldReport|HintIntake|GeneVocabEntry";
    const decl = new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:declare\\s+)?(?:interface|type)\\s+(?:${DESIGN_SHAPES})\\b\\s*[=<{]|\\bconst\\s+(?:AI_REPAIR_OPS|GENE_VOCAB)\\s*[=:]`);
    const offenders = filesUnder(HERE).filter((f) => decl.test(readFileSync(f, "utf8")));
    eq(offenders, [], "no local declaration of a design shape under src/lib/ai/");
    const types = readFileSync(join(HERE, "director", "types.ts"), "utf8");
    const designImport = /import\s*\{([^}]*)\}\s*from\s*"@\/lib\/design";/.exec(types)?.[1] ?? "";
    for (const name of ["AI_REPAIR_OPS", "GenomeCard", "RepairOp", "RenderDigest", "GeneHints", "SampleOpts", "Band", "FoldReport", "HintIntake"]) check(new RegExp(`\\b${name}\\b`).test(designImport), `director/types.ts imports ${name} from @/lib/design`);
    check(/import type \{ NicheShares \} from "@\/lib\/design\/novelty\.server";/.test(types), "NicheShares is design's (novelty.server), type-only");
    check(!/\bimport\b[^;]*\bfrom\s+"@\/lib\/design\/(?!novelty\.server")[^"]+"/.test(types), "director/types.ts reads design only through its index (and the NicheShares type)");
    // the loose schemas: no length, count or range keyword; closed objects, every key required
    eq(jsonKeywords(DIRECTOR_PLAN_LOOSE_JSON), [], "DIRECTOR_PLAN_LOOSE_JSON: no length keyword, closed, all required");
    eq(jsonKeywords(CRITIQUE_LOOSE_JSON), [], "CRITIQUE_LOOSE_JSON: no length keyword, closed, all required");
    // the route input schemas accept the fixtures; a tile-less round refuses tiles; R1's cards are bounded
    check(DirectorBriefSchema.safeParse(brief()).success, "the brief fixture is a valid DirectorBrief");
    check(!DirectorBriefSchema.safeParse(brief({ constraints: { noOrange: false as unknown as true, mood: null, modest: false, locks: {} } })).success, "noOrange: true is the only accepted value");
    check(!DirectorBriefSchema.safeParse(brief({ photos: [1, 2, 3, 4].map((i) => ({ assetId: `a${i}`, w: 10, h: 10, hasCutout: false, palette: [] })) })).success, "≤ 3 photos in a brief");
    check(CANDS.every((c) => CandidateSchema.safeParse(c).success), "the candidate fixtures are valid Candidates");
    const plan = finalizePlan(loosePlan(), fctx(), brief())!.value;
    const tiles = [{ label: "A mobile hero", w: 390, h: 844, jpegBase64: "AAAA", fidelity: "full" as const }];
    check(CritiqueInputSchema.safeParse({ ...INPUT, plan, round: 1 }).success, "a tile-less critique input is valid");
    check(!CritiqueInputSchema.safeParse({ ...INPUT, plan, round: 1, candidates: [{ ...CANDS[0], tiles }, ...CANDS.slice(1)] }).success, "a tile in a tile-less round is refused");
    check(!CritiqueInputSchema.safeParse({ ...INPUT, plan, round: 1, candidates: [CANDS[0], CANDS[0], CANDS[1]] }).success, "candidate ids are distinct");
  });

  section("director-vocab", () => {
    // AI-19 acceptance 12 (QUAL-25): the block is rendered from the constants, and equals them
    eq(renderVocabularyBlock(), VOCABULARY_BLOCK, "the block is rendered at module load from the constants");
    const back = vocabularyOf(VOCABULARY_BLOCK);
    eq(back.ops, [...AI_REPAIR_OPS], "the block names exactly AI_REPAIR_OPS, in order");
    const want: Record<string, string[]> = {};
    for (const [g, e] of Object.entries(GENE_VOCAB)) if (e) want[g] = e.kind === "enum" ? [...(e.values ?? [])] : [];
    eq(back.genes, want, "the block names exactly GENE_VOCAB's genes and enum values");
    eq(back.openers, [...OPENERS], "openers from design");
    eq(back.angles, [...ANGLES], "copy angles from design");
    eq(back.patterns, NAMED_PATTERN_IDS, "the named patterns");
    check(!/[—–·]/.test(VOCABULARY_BLOCK), "no dash or middle dot in the block");
    check(!/\b(?:reorderSection|setAlignment|setImageTreatment)\b/.test(VOCABULARY_BLOCK), "no withdrawn op name");
  });

  section("director-rubric", () => {
    const text = RUBRIC_V3.text;
    eq(RUBRIC_V3.version, "v3", "rubric version v3 (= TASKS[*].rubric, CriticPicks.rubricVersion)");
    // pinned: an edit made in place fails here; an edit is a new rubric version (v4.ts) and a new Director prompt version
    eq(RUBRIC_V3.hash, "13a5eec58cce0630", "rubric v3 text unchanged");
    const order = ["## 1. Owner rules", "## 2. DESIGN v3 budgets", "## 3. Design gates", "## 4. Compatible anti-slop items", "## Void", "## Typography", "## Dimensions", "## Scoring"].map((h) => text.indexOf(h));
    check(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), "precedence: owner rules, DESIGN v3 budgets, design gates, anti-slop items; then void, typography, dimensions, scoring");
    eq(Object.keys(RUBRIC_V3_DIMS), [...RUBRIC_DIMS], "eleven dimensions R1-R11");
    eq(RUBRIC_V3.tileParts, [...TILE_PARTS], "the tile-only parts flagged: R2.tiles, R6.tiles, R11.tiles");
    for (const p of TILE_PARTS) check(text.includes(`${p} (tiles only)`), `${p} is marked tiles only`);
    // owner rule 1: every orange-family palette item is void; "orange" only states the ban, the void or the photo case
    check(!/\b(?:amber|terracotta|burnt|copper|apricot|peach|tangerine|rust|ochre|saffron|coral|cinnamon|caramel)\b/i.test(text), "no orange-family colour named");
    check(text.split("\n").filter((l) => /orange/i.test(l)).every((l) => /no orange|orange family|orange product/i.test(l)), "orange appears only as the ban");
    check(/No orange anywhere: no colour of OKLCH hue 25 to 75 degrees with chroma above 0\.06/.test(text), "the hard no-orange rule, with its numbers");
    // QUAL-21: the typography text is design's pairing rules, without any serif ban or default
    check(!/no serif|avoid serif|serifs? because|beige\s*(?:\+|and)\s*brass|grotesk(?:s)? (?:is|are) safer/i.test(text.replace("a grotesk is not safer", "")), "no serif ban, no type-class default");
    check(text.includes("no type class is a default or a tell"), "the type-class sentence");
    check(text.includes("capped by the engine, not banned"), "the default serifs are capped, not banned");
    check(!/[—–·]/.test(text), "no em dash, en dash or middle dot in the rubric");
    check(/estimated sits inside the height model's error band: it is not a hard fail/.test(text), "estimated is not a hard fail (ENGP-6)");
  });

  section("director-budgets", () => {
    const fold = (top: number) => ({ family: "stage", ok: true, items: { image: 100, cta: top }, limit: 844 as const });
    const h = (total: number, formTop: number | null = 2_000, inFlow = 9) => ({ total, screens: total / 844, formTop, inFlow });
    // the band edges of core §M.2 (ENGP-6): over = estimate × band past the line; estimated = past the line inside the band
    eq(budgetVerdicts(h(18_749), fold(600)).C3, "estimated", "C3 18,749 px → estimated (× 0.8 = 14,999)");
    eq(budgetVerdicts(h(18_751), fold(600)).C3, "over", "C3 18,751 px → over (× 0.8 = 15,001)");
    eq(budgetVerdicts(h(14_999), fold(600)).C3, "ok", "C3 under 15,000 px → ok");
    eq(budgetVerdicts(h(9_000, 3_749), fold(600)).F1, "estimated", "F1 3,749 px → estimated");
    eq(budgetVerdicts(h(9_000, 3_751), fold(600)).F1, "over", "F1 3,751 px → over");
    eq(budgetVerdicts(h(9_000, 2_999), fold(600)).F1, "ok", "F1 under 3,000 px → ok");
    eq(budgetVerdicts(h(9_000, null), fold(600)).F1, "ok", "F1 without a form top → not this row's to judge");
    eq(budgetVerdicts(h(9_000), fold(937)).C2, "estimated", "C2 fold item 937 px → estimated (× 0.9 = 843)");
    eq(budgetVerdicts(h(9_000), fold(939)).C2, "over", "C2 fold item 939 px → over (× 0.9 = 845)");
    eq(budgetVerdicts(h(9_000), fold(759)).C2, "ok", "C2 lowest item under 760 px → ok");
    eq(budgetVerdicts(h(9_000, 2_000, 17), fold(600)).C3, "over", "C3 more than 16 in-flow sections → over (exact)");
    // the constants are the core's (one arithmetic with the publish gate)
    check(HEIGHT_BAND === 0.8 && FOLD_BAND === 0.9 && FOLD_LINE_PX === 844 && LANDING_PROFILE.heightPx.hard === 15_000 && LANDING_PROFILE.formTopPx?.hard === 3_000, "core band constants");
    // a stub digest measured nothing: no candidate is excluded on a stub number
    const { budgets: _b, raster: _r, ...design } = digest();
    void _b;
    void _r;
    const stub = directorDigest({ ...design, stub: true, heights: { total: 99_999, screens: 99, formTop: 9_999, inFlow: 9 } });
    eq(stub.budgets, { C2: "ok", C3: "ok", F1: "ok" }, "a stub digest's height rows are ok");
    eq(directorDigest({ ...design, stub: true, heights: { ...design.heights, inFlow: 20 } }).budgets.C3, "estimated", "a stub digest: an exact section count over the line is only estimated");
    eq(directorDigest({ ...design, heights: { ...design.heights, total: 18_751 } }).budgets.C3, "over", "a measured digest is judged");
    eq(directorDigest(design).raster, null, "raster is null in R1");
    // what excludes: the design hard gates and "over"; "estimated" never
    eq(hardFailsOf(digest({ hard: ["V03"], budgets: { C3: "estimated" } })), ["V03"], "estimated is never a hard fail");
    eq(hardFailsOf(digest({ budgets: { F1: "over", C2: "estimated" } })), ["budget:F1"], "over is a hard fail");
    eq(budgetsOver({ C2: "over", C3: "ok", F1: "over" }), ["budget:C2", "budget:F1"], "budget rows over, gate-style ids");
  });

  section("director-plan", () => {
    const r = finalizePlan(loosePlan(), fctx(), brief());
    check(r !== null, "a loose plan finalizes");
    if (!r) return;
    const p = r.value;
    eq(p.directions.map((d) => d.slot), [...DIRECTOR_SLOTS], "three slots, in order");
    check(DirectorPlanSchema.safeParse(p).success, "the finalized plan is a valid strict DirectorPlan");
    // read: enums, dials 1-10, suggested facts (rule 7: ≤ 5 × 80, deduplicated, numbers kept unticked)
    eq(p.read.dials, { variance: 7, motion: 10, density: 3 }, "dials rounded and clamped to 1-10");
    check(r.rejected.includes("read.dials.motion"), "an out-of-range dial is reported");
    check(p.read.suggestedFacts.length === DIRECTOR_LIMITS.suggestedFacts && p.read.suggestedFacts.every((f) => f.text.length <= 80), "≤ 5 suggested facts of ≤ 80 chars");
    eq(p.read.suggestedFacts.filter((f) => f.text === "Flacon de 30 ml").length, 1, "duplicate suggested facts dropped");
    // AI-19 acceptance 1: every hint goes through design's validateHints and its drops are logged, never the run
    const hintNotes = r.notes.filter((n) => n.kind === "hint_dropped");
    check(hintNotes.some((n) => n.at === "directions.0.hints.G99"), "an unknown gene's hint is dropped and logged");
    check(hintNotes.some((n) => n.at === "directions.0.hints.G9" && n.value === "not-a-strategy"), "an unknown gene value is dropped and logged");
    const checked = validateHints({ G2: [{ value: firstValue("G2"), weight: 3 }] });
    eq(Object.keys(p.directions[0].hints), Object.keys(checked.hints), "a direction keeps exactly the hints validateHints accepted");
    check(p.directions.every((d) => Object.values(d.hints).every((list) => (list ?? []).length <= 3 && (list ?? []).every((e) => e.weight <= (d.slot === "explore" ? 2 : 3)))), "≤ 3 values per gene, weight ≤ 3 (≤ 2 explore)");
    // the pin: ≤ 1, a bold gene with a GENE_VOCAB value; a second pin is dropped; it travels as SampleOpts.pins only
    eq(p.directions[0].pin, { gene: "G2", value: firstValue("G2") }, "a pin that passes stays on the direction");
    const opts = toSampleOpts(p.directions[0], { G28: "plain" });
    eq(opts.pins, { G2: firstValue("G2") }, "the pin reaches SampleOpts.pins");
    check(!("pins" in (opts.hints ?? {})) && Object.keys(opts.hints ?? {}).every((g) => g !== "pin" && /^G\d+$/.test(g)), "GeneHints carries no pin");
    eq(opts.locks, { G28: "plain" }, "the brand locks travel too");
    check(r.notes.some((n) => n.kind === "pin_dropped" && n.at === "directions.0.pins.1" && n.reason === "second_pin"), "a second pin is dropped (second_pin)");
    check(p.directions[1].pin === undefined && r.notes.some((n) => n.kind === "pin_dropped" && n.at === "directions.1.pins.0" && n.reason === "vocab"), "a pin outside GENE_VOCAB is dropped (pin_dropped)");
    check(p.directions[2].pin === undefined && r.notes.some((n) => n.kind === "pin_dropped" && n.at === "directions.2.pins.0" && n.reason === "not_bold"), "a pin on a non-bold gene is dropped");
    eq(toSampleOpts(p.directions[1]), { hints: p.directions[1].hints }, "no pin, no pins key");
    eq(directorFlags(r.notes), ["pin_dropped"], "pin_dropped raises its ai_runs flag");
    // headline structures: ≤ 2, design's list, distinct across directions
    eq(p.directions[0].headlineStructures, ["noun-phrase", "question"], "≤ 2 headline structures");
    eq(p.directions[1].headlineStructures, ["contrast-pair"], "a structure an earlier direction took is dropped");
    const all = p.directions.flatMap((d) => d.headlineStructures);
    check(new Set(all).size === all.length && all.every((s) => (HEADLINE_STRUCTURES as readonly string[]).includes(s)), "structures distinct and from design's list");
    // copy angle from design's list
    eq(p.directions[1].copyAngle, "benefit", "an unknown copy angle falls back to benefit");
    check(r.rejected.includes("directions.1.copyAngle"), "and is reported");
    // mustAvoid: the niche's seq4 / tells at ≥ 30 % first (AI-19 acceptance 13), then named patterns; unknown dropped
    const niche = nicheAvoid(NICHE).map((e) => e.id);
    eq(niche, ["seq4:1.4.7.9", "tell:eyebrow-set+ghost-word"], "niche entries at ≥ 30 % share, most crowded first");
    check(NICHE_AVOID_SHARE === 0.3, "the share line is 30 %");
    check(p.directions.every((d) => niche.every((id, k) => d.mustAvoid[k] === id)), "every direction's mustAvoid starts with the niche entries");
    eq(p.directions[0].mustAvoid.slice(niche.length), ["equal-card-triplet"], "a pattern named by id or by label, once; an unknown one dropped");
    check(r.notes.some((n) => n.kind === "vocab_dropped" && n.at === "directions.0.mustAvoid" && n.value === "a made-up pattern"), "the unknown pattern is logged");
    // the rationale: through the guard, ≤ 140, no invented number, no dash
    eq(p.directions[0].rationale, "Une mise en page calme qui laisse toute la place au produit.", "a clean rationale stays");
    eq(p.directions[1].rationale, "", "a rationale with an invented number is dropped");
    check(r.rejected.includes("directions.1.rationale"), "and reported");
    check(!/[—–]/.test(p.directions[2].rationale) && p.directions[2].rationale.length > 0, "a dash is rewritten, the line kept");
    // whole-plan refusals: two directions on one slot, or not three
    const dup = loosePlan();
    dup.directions[1].slot = "best_fit";
    eq(finalizePlan(dup, fctx(), brief()), null, "two directions on one slot → no plan (invalid_output)");
    eq(finalizePlan({ ...loosePlan(), directions: loosePlan().directions.slice(0, 2) }, fctx(), brief()), null, "two directions → no plan");
    eq(finalizePlan("not json", fctx(), brief()), null, "a non-object → null");
  });

  section("director-critique", () => {
    const r = finalizeCritique(looseCritique(), fctx(), INPUT);
    check(r !== null, "a loose critique finalizes");
    if (!r) return;
    const c = r.value;
    check(CritiqueSchema.safeParse(c).success, "the finalized critique is a valid strict Critique");
    const of = (id: string) => c.perCandidate.find((x) => x.id === id)!;
    const notes = (at: string, reason?: string) => r.notes.filter((n) => n.at.startsWith(at) && (reason === undefined || n.reason === reason));
    // picks: three distinct, eligible ids; estimated is eligible
    eq(c.pick, ["c1", "c3", "c5"], "the model's three eligible picks are kept");
    check(of("c3").picked, "an estimated budget never excludes a candidate (AI-19 acceptance 14)");
    // an unknown candidate id in the model's list is a contradiction, not a row
    check(!c.perCandidate.some((x) => x.id === "c7") && notes("perCandidate.c7", "ref").length === 1, "an entry for a card that does not exist is dropped (ref)");
    // issues: references must exist; the digest is the ground truth; tile-only judgments need tiles
    eq(of("c1").issues.map((i) => i.dim), ["R8"], "only the issue with a real reference and no contradiction stays");
    check(notes("perCandidate.c1.issues.0", "digest").length === 1, "\"four eyebrows\" when counts.eyebrows = 2 is dropped (digest)");
    check(notes("perCandidate.c1.issues.2", "ref").length === 1, "a missing card id is dropped (ref)");
    check(notes("perCandidate.c1.issues.3", "ref").length === 1, "a section index that does not exist is dropped (ref)");
    check(notes("perCandidate.c1.issues.4", "digest").length === 1, "a pure-D issue with no digest signal is dropped (digest)");
    check(notes("perCandidate.c1.issues.5", "no_tiles").length === 1, "a composition judgment without a signal or tiles is dropped (no_tiles)");
    check(notes("perCandidate.c1.issues.6", "no_tiles").length === 1, "a tile label in a tile-less round is dropped (no_tiles)");
    check(notes("perCandidate.c1.issues.7", "ref").length === 1, "an issue without any evidence is dropped (ref)");
    // scores: picks only, integers 0-5, a tile-only part dropped in a tile-less round
    eq(of("c1").scores, { R1: 4, R2: 3, R3: 4, R4: 5, R8: 3, R9: 5 }, "pick scores kept, rounded into 0-5");
    check(of("c1").scores["R2.tiles"] === undefined && notes("perCandidate.c1.scores.R2.tiles", "no_tiles").length === 1, "a tile-only score in a tile-less round is dropped (critic_contradiction:no_tiles)");
    // ops: ≤ 3 per pick from AI_REPAIR_OPS, typed, targets inside the candidate
    eq(of("c1").repairs, [
      { op: "setOpener", section: "benefits", to: "bare" },
      { op: "swapHeroFamily", to: "split-media" },
      { op: "trimCopy", section: "benefits", field: "lead", maxWords: 12 },
    ], "≤ 3 typed ops, a section index resolved to its id");
    const dropped = r.notes.filter((n) => n.kind === "op_dropped" && n.at.startsWith("perCandidate.c1.repairs"));
    eq(dropped.map((n) => `${n.value}:${n.reason}`), ["changeGene:vocab", "dropKicker:digest", "setAlign:count", "moveSection:target"], "an unknown gene value, a kicker the digest says is absent, a fourth op and the hero's position are dropped");
    check(c.perCandidate.every((x) => x.repairs.length <= DIRECTOR_LIMITS.opsPerPick && x.repairs.every((o) => (AI_REPAIR_OPS as readonly string[]).includes(o.op))), "every op is from AI_REPAIR_OPS, ≤ 3 per candidate");
    // a non-pick: ≤ 1 issue, no score, no op (the slim shape, QUAL-12)
    eq(of("c2").issues.length, 1, "a non-pick keeps one issue (why it lost)");
    eq(of("c2").scores, {}, "a non-pick carries no score");
    eq(of("c2").repairs, [], "a non-pick carries no op");
    check(notes("perCandidate.c2", "non_pick").length === 1, "the non-pick's extras are logged");
    // an estimated budget is never alone a repair reason
    eq(of("c3").repairs, [], "ops on a pick whose only fault is an estimated budget are dropped");
    check(notes("perCandidate.c3.repairs", "estimated").length === 1, "and logged (estimated)");
    // an R9 issue whose only basis is an estimated budget contradicts the digest: estimated is not a fail (ENGP-6)
    const r9 = looseCritique();
    r9.perCandidate[2].issues = [{ dim: "R9", severity: "block", evidence: ev({ section: 3, quote: "the form sits low" }) }];
    const r9r = finalizeCritique(r9, fctx(), INPUT)!;
    const c3r9 = r9r.value.perCandidate.find((x) => x.id === "c3")!;
    eq(c3r9.issues, [], "an R9 issue whose only basis is an estimated budget is dropped");
    check(r9r.notes.some((n) => n.at === "perCandidate.c3.issues.0" && n.reason === "estimated"), "and logged (critic_contradiction:estimated)");
    eq(c3r9.repairs, [], "so its op is not kept either");
    // hard fails: the engine's, never the model's list
    eq(of("c4").hardFails, ["V03"], "the token-level no-orange gate is a hard fail");
    eq(of("c6").hardFails, ["budget:F1"], "a budget over is a hard fail");
    // why lines: ONE locale, the store's primary, through the guard
    eq(c.whyLines.locale, "fr", "why lines in the store's primary locale");
    eq(c.whyLines.lines.length, 3, "one line per pick");
    eq(c.whyLines.lines[0], "Une page calme qui met le flacon au centre.", "a clean line stays");
    check(!/[—–]/.test(c.whyLines.lines[1]) && c.whyLines.lines[1].length > 0, "a dash is rewritten");
    eq(c.whyLines.lines[2], "", "a line with an invented number is dropped");
    check(r.rejected.includes("whyLines.2"), "and reported");
    // distinctness: recomputed from the cards, the model's numbers ignored
    eq(c.distinctness, [cardDistance(CANDS[0].card, CANDS[2].card), cardDistance(CANDS[2].card, CANDS[4].card), cardDistance(CANDS[0].card, CANDS[4].card)], "distinctness recomputed from the cards");
    check(!c.distinctness.includes(0.99), "the model's distances are ignored");
    check(directorFlags(r.notes).includes("critic_contradiction"), "contradictions raise the critic_contradiction flag");

    // a hard-fail or over candidate is never picked, whatever the model says (AI-19 acceptance 6, 14)
    const bad = finalizeCritique(looseCritique({ pick: ["c4", "c6", "c1"] }), fctx(), INPUT)!;
    check(!bad.value.pick.includes("c4") && !bad.value.pick.includes("c6"), "a hard-fail (V03) and an over candidate are never picked");
    eq(new Set(bad.value.pick).size, 3, "the pick is filled to three distinct eligible ids");
    check(bad.notes.filter((n) => n.kind === "critic_contradiction" && n.reason === "pick").length === 2, "the two refused picks are logged");
    const twice = finalizeCritique(looseCritique({ pick: ["c1", "c1", "c3"] }), fctx(), INPUT)!;
    eq(new Set(twice.value.pick).size, 3, "a repeated pick is replaced: picks distinct");
    // fewer than three eligible candidates: nothing to show (the instant set stays)
    const few = { ...INPUT, candidates: [CANDS[0], CANDS[3], CANDS[5]] };
    eq(finalizeCritique(looseCritique(), fctx(), few), null, "fewer than three eligible candidates → null");

    // picks closer than τ = 0.30: the closer pair's second member is swapped for the best explore candidate
    const close = finalizeCritique(looseCritique({ pick: ["c1", "c2", "c3"], whyLines: { locale: "fr", lines: ["Une page calme.", "Une autre page calme.", "Un contraste net."] } }), fctx(), INPUT)!;
    eq(close.value.pick, ["c1", "c5", "c3"], "c2 (0.2 from c1) is replaced by the explore candidate c5");
    check(close.notes.some((n) => n.kind === "picks_adjusted"), "picks_adjusted logged");
    check(close.value.distinctness.every((d) => d >= DIRECTOR_LIMITS.tau), "the adjusted picks differ pairwise ≥ 0.30");
    eq(close.value.whyLines.lines, ["Une page calme.", "", "Un contraste net."], "the replaced pick's why line is gone");
    check(!close.notes.some((n) => n.at === "perCandidate.c2" && n.reason === "non_pick"), "the engine's swap is not blamed on the critic");
    const adj = adjustPicks(CANDS.map((x) => x.card), ["c1", "c2", "c3"], { eligible: (id) => !["c4", "c6"].includes(id) });
    check(adj.adjusted && !adj.picks.includes("c4") && !adj.picks.includes("c6"), "adjustPicks never brings in a hard-fail candidate");
    eq(adjustPicks(CANDS.map((x) => x.card), ["c1", "c3", "c5"]).adjusted, false, "picks already ≥ τ apart are kept");
    eq(cardDistance(CANDS[0].card, CANDS[0].card), 0, "a card is at distance 0 from itself");
    eq(cardDistance(CANDS[0].card, CANDS[2].card), cardDistance(CANDS[2].card, CANDS[0].card), "the distance is symmetric");

    // why lines in another locale are all dropped; one locale only
    const en = finalizeCritique(looseCritique({ whyLines: { locale: "en", lines: ["A calm page.", "A sharp contrast.", "A bold page."] } }), fctx(), INPUT)!;
    eq(en.value.whyLines, { locale: "fr", lines: ["", "", ""] }, "why lines declared in another locale are dropped");
    check(en.rejected.includes("whyLines.locale"), "and reported");
    const ar = finalizeCritique(looseCritique({ whyLines: { locale: "ar", lines: ["صفحة هادئة تبرز المنتج.", "تباين واضح.", "صفحة جريئة."] } }), fctx({ locale: "ar" }), { ...INPUT, brief: brief({ store: { ...brief().store, locales: ["ar", "fr"] } }) })!;
    eq(ar.value.whyLines.locale, "ar", "the primary locale decides (ar)");
    check(ar.value.whyLines.lines[0].length > 0, "an Arabic line in an Arabic store stays");

    // a tile-less round with every score on the tile parts: all dropped (AI-19 acceptance 7)
    const tileScores = looseCritique();
    for (const e of tileScores.perCandidate) for (const k of TILE_PARTS) e.scores[k] = 5;
    const ts = finalizeCritique(tileScores, fctx(), INPUT)!;
    check(ts.value.perCandidate.every((x) => TILE_PARTS.every((k) => x.scores[k] === undefined)), "every tile-part score is dropped in a tile-less round");
    // with tiles (R2): the same scores stand
    const withTiles = { ...INPUT, tilesPresent: true, candidates: CANDS.map((x) => ({ ...x, tiles: [{ label: "A mobile hero", w: 390, h: 844, jpegBase64: "AAAA", fidelity: "full" as const }] })) };
    const tr = finalizeCritique(tileScores, fctx(), withTiles)!;
    eq(tr.value.perCandidate.find((x) => x.id === "c1")!.scores["R2.tiles"], 5, "with tiles, a tile-part score stands");
    // a stub digest measured nothing: its zero counts contradict no issue
    const stubCands = CANDS.map((x) => ({ ...x, digest: { ...x.digest, stub: true as const } }));
    const st = finalizeCritique(looseCritique(), fctx(), { ...INPUT, candidates: stubCands })!;
    check(st.value.perCandidate.find((x) => x.id === "c1")!.issues.some((i) => i.dim === "R7"), "a stub digest contradicts no issue");
    eq(finalizeCritique({ perCandidate: "x" }, fctx(), INPUT), null, "a schema-breaking answer → null (invalid_output)");
  });

  section("director-accept", () => {
    const snap = (p: Partial<GateSnapshot> = {}): GateSnapshot => ({ hard: [], slop: 2, q: 84, bands: { own: "ok", niche: "ok", platform: "ok" }, ...p });
    // AI-19 acceptance 2: a planted swapHeroFamily that changes no gate item and leaves Q equal is KEPT
    const before = gateSnapshot(CANDS[0].card, CANDS[0].digest);
    const swapped = { ...CANDS[0].digest, hero: { ...CANDS[0].digest.hero, family: "split-media" } };
    const after = gateSnapshot(CANDS[0].card, swapped);
    eq(acceptOp(before, after), { kept: true, q: { before: 86, after: 86 } }, "a judgment op with Q equal is kept (Q reported, never the key)");
    eq(acceptOp(snap({ q: 90 }), snap({ q: 70 })).kept, true, "Q may fall: still kept");
    eq(acceptOp(snap(), snap({ hard: ["V22"] })), { kept: false, reason: "hard", q: { before: 84, after: 84 } }, "a new hard item → rejected (hard)");
    eq(acceptOp(snap({ hard: ["V03"] }), snap({ hard: ["V03", "V03"] })).kept, false, "a second instance of a hard id is new");
    eq(acceptOp(snap({ hard: ["V22"] }), snap()).kept, true, "removing a hard item is kept");
    eq(acceptOp(snap(), snap({ hard: ["budget:C2"] })).kept, false, "a budget row going over is a new hard item");
    eq(acceptOp(snap({ slop: 2 }), snap({ slop: 3 })), { kept: false, reason: "slop", q: { before: 84, after: 84 } }, "slop up → rejected (slop)");
    eq(acceptOp(snap({ slop: 3 }), snap({ slop: 3 })).kept, true, "slop equal → kept");
    eq(acceptOp(snap(), snap({ bands: { own: "ok", niche: "close", platform: "ok" } })).kept, false, "a band off ok → rejected (band)");
    eq((acceptOp(snap(), snap({ bands: { own: "ok", niche: "close", platform: "ok" } })) as { reason: string }).reason, "band", "the reason is band");
    eq(acceptOp(snap({ bands: { own: "first", niche: "ok", platform: "ok" } }), snap()).kept, true, "first counts as ok");
    eq((acceptOp(snap(), snap({ hard: ["V22"], slop: 5, bands: { own: "too_close", niche: "ok", platform: "ok" } })) as { reason: string }).reason, "hard", "the first broken rule is named (hard, slop, band)");
    // an estimated budget appearing is not a hard item
    const est = gateSnapshot(CANDS[0].card, { ...CANDS[0].digest, budgets: { C2: "ok", C3: "estimated", F1: "ok" } });
    eq(acceptOp(before, est).kept, true, "a budget moving to estimated is not a new hard item");
  });

  section("director-brief", () => {
    // stage 0 bounds: ≤ 3 photos (estimated cutout passed through), ≤ 10 recent cards, noOrange always true
    const photos = ["a1", "a1", "a2", "a3", "a4"].map((assetId, i) => ({ assetId, w: 800, h: 800, hasCutout: (i === 0 ? "estimated" : false) as boolean | "estimated", palette: [] }));
    const cards = Array.from({ length: 14 }, (_, i) => card(`r${i}`, "best_fit", {}));
    const b = boundBrief(brief({ photos, recent: { storeGenomeCards: cards, nicheCrowding: NICHE } }));
    eq(b.photos.map((p) => p.assetId), ["a1", "a2", "a3"], "≤ 3 photos, one per asset");
    eq(b.photos[0].hasCutout, "estimated", "hasCutout \"estimated\" passed through");
    eq(b.recent.storeGenomeCards.map((x) => x.id), cards.slice(0, 10).map((x) => x.id), "the store's last 10 genome cards");
    check(b.constraints.noOrange === true && DirectorBriefSchema.safeParse(b).success, "a bounded brief is a valid DirectorBrief");
    // stage 2: 4 sampled per brief, top 2 by (1) gate state, (2) distance, (3) Q; 12 per checkNovelty call
    const sampled: SampledCandidate[] = [];
    for (const br of [0, 1, 2] as const) for (let k = 0; k < 5; k++) sampled.push({ key: `b${br}k${k}`, brief: br, hard: br === 0 && k === 0 ? ["V03"] : [], slop: br === 1 && k === 1 ? 4 : 1, q: 90 - k });
    const spread: Record<string, number> = { b0k1: 0.1, b0k2: 0.9, b0k3: 0.5, b1k0: 0.6, b1k1: 0.95, b1k2: 0.2, b1k3: 0.7, b2k0: 0.5, b2k1: 0.5, b2k2: 0.5, b2k3: 0.5 };
    const plan = candidatePlan(sampled, { distance: (a, x) => Math.abs((spread[a] ?? 0) - (spread[x] ?? 0)) || 0.01, recentDistance: (k) => spread[k] ?? 0.5 });
    eq(plan.perBrief.map((l) => l.length), [2, 2, 2], "two kept per brief, six in all");
    check(!plan.kept.includes("b0k0"), "a hard-fail sample is ranked last");
    check(!plan.kept.includes("b0k4") && !plan.kept.includes("b1k4"), "only the first 4 samples of a brief are considered");
    check(!plan.kept.includes("b1k1") || plan.perBrief[1].indexOf("b1k1") > 0, "slop at the repair line ranks after the clean samples");
    eq(plan.perBrief[0][0], "b0k2", "among clean samples the most distant wins (distance before Q)");
    const tie = candidatePlan(
      [0, 1, 2, 3].map((k) => ({ key: `t${k}`, brief: 0 as const, hard: [], slop: 1, q: 80 + k })),
      { distance: () => 0.5 },
    );
    eq(tie.perBrief[0][0], "t3", "Q only breaks ties");
    eq(CANDIDATE_PLAN.briefs * CANDIDATE_PLAN.samplesPerBrief, 12, "12 sampled per pass");
    const batches = noveltyBatches(Array.from({ length: 30 }, (_, i) => i));
    check(batches.every((x) => x.length <= 12) && batches.flat().length === 30, "≤ 12 candidates per checkNovelty call");
    eq(noveltyBatches(sampled.slice(0, 12)).length, 1, "one call covers a pass");
    eq(noveltyBatches([1, 2, 3], 40)[0].length, 3, "a larger batch size is capped at 12");
    // stage 7: CriticPicks ≤ 2 KB, ids, scores and op names only, never page text
    const crit = finalizeCritique(looseCritique(), fctx(), INPUT)!.value;
    const row = criticPicksOf({ critique: crit, candidates: CANDS, chosen: "c1", source: "director", round: 1, promptVersions: { plan: "director.plan@s1", critique: "director.critique@s1", verify: null, hero: "copy.hero@s1" }, critiqueRunId: "run_1", applied: [true, false, true] });
    const bytes = new TextEncoder().encode(JSON.stringify(row)).length;
    check(bytes <= CRITIC_PICKS_MAX_BYTES, `CriticPicks ≤ 2 KB (${bytes} B)`);
    eq(row.repairs, [{ op: "setOpener", section: 1, applied: true }, { op: "swapHeroFamily", applied: false }, { op: "trimCopy", section: 1, applied: true }], "ops by name with the section index and stage 5's verdict");
    eq(row.rubricVersion, "v3", "the rubric version");
    eq(row.picks, crit.pick, "the picks");
    const s = JSON.stringify(row);
    check(!s.includes("flacon") && !s.includes("Une page") && !s.includes(HERO.headline), "no page or model text in CriticPicks");
    const huge = criticPicksOf({ critique: crit, candidates: CANDS, chosen: "c1", source: "deep", round: 2, promptVersions: { plan: "p".repeat(40), critique: null, verify: null, hero: null }, critiqueRunId: "r".repeat(400) });
    check(new TextEncoder().encode(JSON.stringify(huge)).length <= CRITIC_PICKS_MAX_BYTES, "a long run id or version stays ≤ 2 KB");
  });

  section(
    "director-strict",
    () => {
      // P6's real vocabulary (the R1 integration): every bold gene enumerable, a valid hint accepted, a value it
      // does not know dropped with why "vocab"
      for (const g of BOLD_GENES) check((GENE_VOCAB[g]?.values?.length ?? 0) > 0, `GENE_VOCAB enumerates ${g}`);
      const ok = validateHints({ G2: [{ value: firstValue("G2"), weight: 3 }], G9: [{ value: "not-a-strategy", weight: 1 }] });
      check((ok.hints.G2 ?? []).length === 1, "validateHints accepts a GENE_VOCAB value");
      check(ok.intake.dropped.some((d) => d.gene === "G9" && d.why === "vocab"), "validateHints drops an unknown value (vocab)");
      const r = finalizePlan(loosePlan(), fctx(), brief())!;
      check((r.value.directions[0].hints.G2 ?? []).length === 1, "a valid hint reaches the direction");
      // the full gene table (35 genes, DES-§4.2) reaches the vocabulary block
      check(Object.keys(GENE_VOCAB).length === 35 && Object.keys(vocabularyOf(VOCABULARY_BLOCK).genes).length === 35, "the vocabulary block lists all 35 genes");
    },
    { strict: true },
  );
}
