/**
 * The Director's shapes (P7 AI; ai.md AI-§A.8.2, AI-§A.8.3, AI-§D.3 Director rows, AI-19a; design.md DES-§4.6,
 * DES-§8.6, DES-§8.9). Isomorphic and pure: the wizard (P6) fills the brief and the candidates from design's engine in
 * the browser, the routes validate them, the server's `finalize` turns the model's loose JSON into these shapes.
 *
 * One source for the seams (QUAL-25, QUAL-20, CRIT2-16; DS59): every design shape is IMPORTED from design and
 * re-exported here, never redeclared (`GenomeCard`, `Band`, `RenderDigest`, `FoldReport`, `NicheShares`,
 * `GeneHints`, `HintIntake`, `SampleOpts`, `RepairOp`, `AI_REPAIR_OPS`). `test:ai` greps src/lib/ai/ for a local
 * declaration of any of them. Where ai needs more than design knows, it extends by intersection (`DirectorDigest`).
 *
 * Three families of schemas live beside the types:
 *   - strict (`*Schema`): the finalized shapes with their lengths and counts (AI-D6), and the route inputs, which
 *     come from a browser and are bounded before anything reads them;
 *   - loose (`*Loose`, `*_LOOSE_JSON`): what the model writes through structured outputs (AI-§B.4): the same keys,
 *     closed objects, every key required (an absent value is `null`), the enums kept, no length, count or range
 *     keyword, so one over-long field never costs the others; `finalize` (./validate.ts) enforces the rest;
 *   - the design shapes inside a route input are checked structurally (`z.custom`) on the fields the Director reads:
 *     their field lists stay design's.
 *
 * Slots use design's spelling (`best_fit | contrast | explore`, `GenomeCard["slot"]`, `ai_feedback.direction_slot`)
 * everywhere, also in `DirectionBrief` (ai.md's sketch wrote "best-fit"; one spelling avoids a mapping).
 */
import { z } from "zod";
import {
  AI_REPAIR_OPS,
  ANGLES,
  HEADLINE_STRUCTURES,
  OPENERS,
  type AiRepairOp,
  type Angle,
  type Band,
  type BoldGene,
  type BrandGenes,
  type FoldReport,
  type GeneHints,
  type GeneKey,
  type GenomeCard,
  type HeadlineStructure,
  type HintIntake,
  type RenderDigest,
  type RepairOp,
  type SampleOpts,
} from "@/lib/design";
import type { NicheShares } from "@/lib/design/novelty.server";
import { LOCALES, MARKETS, PRODUCT_CATEGORIES, type Locale, type Market, type ProductCategory } from "@/lib/page/schema";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { AnalysisOut, AnalyzeImage } from "../schema/tasks/analyze";
import type { HeroPack } from "../schema/tasks/copy-hero";

export { AI_REPAIR_OPS };
export type { AiRepairOp, Angle, Band, BoldGene, FoldReport, GeneHints, GenomeCard, HeadlineStructure, HintIntake, NicheShares, RenderDigest, RepairOp, SampleOpts };

/* ------------------------------------------------------------------ */
/* Closed vocabularies of the Director's own fields                    */
/* ------------------------------------------------------------------ */

/** The three direction slots, in the order the plan lists them and the reveal shows them (design's spelling). */
export const DIRECTOR_SLOTS = ["best_fit", "contrast", "explore"] as const satisfies readonly GenomeCard["slot"][];
export type DirectorSlot = GenomeCard["slot"];

/**
 * The seven bold genes (DES-§4.3; rev 3 adds G23), the only genes a direction may pin (QUAL-10). A runtime mirror of
 * design's `BoldGene` union; the assertion below breaks `tsc` when design adds or removes one.
 */
export const BOLD_GENES = ["G1", "G2", "G4", "G9", "G18", "G23", "G28"] as const satisfies readonly BoldGene[];
type MissingBold = Exclude<BoldGene, (typeof BOLD_GENES)[number]>;
const BOLD_GENES_COMPLETE: MissingBold extends never ? true : never = true;
void BOLD_GENES_COMPLETE;
/** The genes a hint may name (`GeneHints` keys): the bold genes plus G10, G16, G20 (DES-§4.6). */
export const HINT_GENES = [...BOLD_GENES, "G10", "G16", "G20"] as const satisfies readonly (keyof GeneHints)[];

export const PRICE_TIERS = ["entry", "mid", "premium"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];
export const CLUTTER_LEVELS = ["none", "some", "heavy"] as const;
export const SUGGESTED_FROM = ["photo", "name"] as const;
export const SEVERITIES = ["block", "major", "minor"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Rubric v3's eleven dimensions (AI-§A.8.3), scored 0-5. */
export const RUBRIC_DIMS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10", "R11"] as const;
export type RubricDim = (typeof RUBRIC_DIMS)[number];
/**
 * The rubric parts only a tile can show (AI-§A.8.3 "R1 scoring without tiles", QUAL-11): R2's "one idea pushed
 * hard", R6's treatment of these photos, R11's craft as rendered. Scored as their own keys, so a tile-less round can
 * drop exactly them (`critic_contradiction:no_tiles`) while R2, R6 and R11 keep their D parts.
 */
export const TILE_PARTS = ["R2.tiles", "R6.tiles", "R11.tiles"] as const;
export type TilePart = (typeof TILE_PARTS)[number];
export type RubricKey = RubricDim | TilePart;
export const RUBRIC_KEYS = [...RUBRIC_DIMS, ...TILE_PARTS] as const satisfies readonly RubricKey[];
export type RubricScore = 0 | 1 | 2 | 3 | 4 | 5;
export type Dial = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * The named patterns a direction's `mustAvoid` may list (AI-§D.3 `design.plan`: "entries from the named-pattern
 * list"): the 2026 tells and banned items of DESIGN.md v3 §1.2-§1.3 that a direction can steer away from, with the
 * English label the prompt prints. No orange-family colour and no type class is a pattern (owner rule 1; rubric v3's
 * typography text is design's pairing rules, QUAL-21). The niche's crowded sequences and tell pairs join a brief as
 * `seq4:` / `tell:` entries (./brief.ts `nicheAvoid`), never through this list.
 */
export const NAMED_PATTERNS = {
  "centred-dark-hero-glow": "a centred dark hero with a glow",
  "equal-card-triplet": "three equal cards in a row",
  "eyebrow-every-section": "an eyebrow on every section",
  "edition-eyebrow": "edition or section-number eyebrows",
  "identical-section-headers": "the same kicker, title and lead on four or more sections",
  "centred-stack": "every section centred",
  "zigzag-run": "more than two image and text splits in a row",
  "purple-indigo-accent": "a purple or indigo accent",
  "gradient-text": "gradient text",
  "glass-default": "glass as the default surface",
  "one-radius": "one radius everywhere",
  "nested-surfaces": "cards nested in tinted panels",
  "icon-over-heading": "an icon above every heading",
  "aurora-mesh": "an aurora or mesh-gradient field",
  "bounce-easing": "bounce easing",
  "word-reveal": "a headline revealed word by word",
  "same-photo-crop": "the same photo at the same crop in every section",
  "chips-on-photo": "pills laid over product photos",
  "ghost-word": "a giant ghost word",
  "ring-badge": "a rotating-text ring badge",
  "two-strips": "two scrolling strips",
  "status-dots": "decorative status dots",
  "chat-mock": "a chat-bubble problem block",
  "phone-mock-reviews": "phone-mock reviews",
  "big-number-stats": "big-number stats",
  "countdown-outside-form": "a countdown outside the order form",
  "footer-wordmark": "a giant cut-off footer wordmark",
  "discover-frame": "\"discover the world of\" headlines",
  "adjective-triad": "adjective triads",
  "not-just-frame": "\"not just X, Y\" lines",
} as const;
export type NamedPattern = keyof typeof NAMED_PATTERNS;
export const NAMED_PATTERN_IDS = Object.keys(NAMED_PATTERNS) as NamedPattern[];

/** The bounds of every Director field (AI-§P, AI-§D.3); lengths in characters. */
export const DIRECTOR_LIMITS = {
  photos: 3,
  recentCards: 10,
  memory: 20,
  facts: 6,
  candidates: 6,
  readLine: 140,
  audience: 90,
  suggestedFacts: 5,
  suggestedFactChars: 80,
  advice: 120,
  risks: 4,
  riskChars: 120,
  hintValuesPerGene: 3,
  exploreHintWeight: 2,
  headlineStructures: 2,
  mustHave: 4,
  mustHaveChars: 80,
  mustAvoid: 8,
  rationale: 140,
  whyLine: 120,
  quote: 120,
  opsPerPick: 3,
  issuesPerNonPick: 1,
  /** the slim critique's distinctness floor (AI-19 acceptance 5, AI-§P) */
  tau: 0.3,
} as const;

/* ------------------------------------------------------------------ */
/* Stage 0: the brief (built by the wizard from the store's own data)  */
/* ------------------------------------------------------------------ */

/** Integer minor units (centimes) and an ISO 4217 code (core D9). */
export interface Money {
  minor: number;
  currency: string;
}
/** One active `ai_memory` row the store layer may quote (owner-typed: untrusted, AI-§E.3). */
export interface MemoryItem {
  kind: "voice" | "fact" | "avoid" | "prefer" | "policy";
  text: string;
  /** null = every locale */
  locale: Locale | null;
}
/** A sellable item of the page (OFFERS D1), as the brief needs it: no price per option, no SKU. */
export interface ItemSummary {
  id: string;
  name: string;
  /** the option labels the owner declared (≤ 12), never invented */
  options: string[];
}
/** One offer card (OFFERS D2): what the shopper picks, at the payable price the owner set. */
export interface OfferSummary {
  id: string;
  label: string;
  /** Σ line.qty */
  units: number;
  /** integer minor units */
  priceMinor: number;
  freeShipping: boolean;
}
/** Brand locks the sampler honours (design's `SampleOpts.locks`, from the store's `brand.genes`). */
export type BrandLocks = NonNullable<SampleOpts["locks"]>;

export interface BriefPhoto {
  assetId: string;
  w: number;
  h: number;
  /** rev 4 (UX-39): "estimated" = design's model-free alpha estimate before the mask exists; passed through as is */
  hasCutout: boolean | "estimated";
  /** hex colours the palette extractor read */
  palette: string[];
  analysis?: AnalysisOut;
}

/** Stage 0 input (AI-§A.8.2): the store's own data and the niche's shares, never another store's content (R-D36). */
export interface DirectorBrief {
  store: {
    handle: string;
    market: Market;
    /** the first is the store's primary locale: the why lines are written in it */
    locales: Locale[];
    brandGenome?: Partial<BrandGenes>;
    memory: MemoryItem[];
    policies: StorePolicyFacts;
    brandSeed: string;
  };
  product: { name: string; category: ProductCategory; facts: string[]; price: Money; items: ItemSummary[]; offers: OfferSummary[] };
  /** ≤ 3, sent as images */
  photos: BriefPhoto[];
  /** rev 4 (OPS-14): "store" only for the blueprint's critique stage, never the interactive pass */
  mode: "landing" | "store" | "campaign";
  constraints: { noOrange: true; mood: "calm" | "lively" | null; modest: boolean; locks: BrandLocks };
  /** the store's last 10 genome cards; the niche's shares (k ≥ 10, rounded to 10 %) */
  recent: { storeGenomeCards: GenomeCard[]; nicheCrowding: NicheShares };
}

/* ------------------------------------------------------------------ */
/* Stage 1: the plan                                                   */
/* ------------------------------------------------------------------ */

/** Rubric §0.B "Reading this as …" made structured. */
export interface DesignRead {
  readLine: string;
  audience: string;
  priceTier: PriceTier;
  /** shown with a tick box; never used until ticked (AI-04, guard rule 7) */
  suggestedFacts: { text: string; from: "photo" | "name" }[];
  photoQuality: { sharp: boolean; clutter: (typeof CLUTTER_LEVELS)[number]; fullBleedOk: boolean; cutoutViable: boolean; advice: string | null };
  /** rubric §1 dials → gene weights (G2 / G5 / G10, G23, G20) */
  dials: { variance: Dial; motion: Dial; density: Dial };
  risks: string[];
}

export interface DirectionBrief {
  slot: DirectorSlot;
  /** design's closed vocabulary, weights ≤ 3× (≤ 2× on the explore slot), as `validateHints` returned it; carries no pin */
  hints: GeneHints;
  /** ≤ 1 pinned bold gene (QUAL-10, CRIT2-16): travels as `SampleOpts.pins` (`toSampleOpts`, ./validate.ts) */
  pin?: { gene: BoldGene; value: string };
  /** G29, ≤ 2, distinct across the three directions */
  headlineStructures: HeadlineStructure[];
  copyAngle: Angle;
  mustHave: string[];
  /** `NamedPattern` ids, and the brief's `seq4:` / `tell:` niche entries */
  mustAvoid: string[];
  /** one sentence: the owner-facing "why this design" (DG-12, SF-02) */
  rationale: string;
}

export interface DirectorPlan {
  read: DesignRead;
  directions: [DirectionBrief, DirectionBrief, DirectionBrief];
}

/** `design.plan`'s task input: the brief and ≤ 3 photos (≤ 1,024 px, ≤ 400 KB each, AI-§P). */
export interface DirectorPlanInput {
  brief: DirectorBrief;
  images: AnalyzeImage[];
}

/* ------------------------------------------------------------------ */
/* Stages 2-4: candidates and the critique                             */
/* ------------------------------------------------------------------ */

/**
 * "ok" = inside the limit; "estimated" = inside the calibrated band (a soft note at publish, `vars.estimated = 1`);
 * "over" = the hard refusal of core §M.2. Only "over" (and the design hard gates) excludes a candidate from the pick;
 * an "estimated" budget is never a hard fail and never alone a reason to repair (ENGP-6).
 */
export type BudgetVerdict = "ok" | "estimated" | "over";

/**
 * Design's digest plus what design cannot know (rev 4, ENGP-6): the budget verdicts over the core's band constants
 * (./budgets.ts `directorDigest`) and the R2 raster result (`null` in R1).
 */
export type DirectorDigest = RenderDigest & {
  budgets: { C2: BudgetVerdict; C3: BudgetVerdict; F1: BudgetVerdict };
  raster: { fidelity: "full" | "partial"; orangeRegions: { count: number; px: number }; overflow: { sectionIdx: number; kind: "x" | "clip" }[] } | null;
};

/** R2 tiles: never sent in R1. */
export interface CandidateTile {
  label: string;
  w: number;
  h: number;
  jpegBase64: string;
  fidelity: "full" | "partial";
}

export interface Candidate {
  card: GenomeCard;
  digest: DirectorDigest;
  heroCopy: HeroPack;
  tiles?: CandidateTile[];
}

/** rev 3: `tilesPresent` decides which rubric parts may be scored (AI-§A.8.3). */
export interface CritiqueInput {
  brief: DirectorBrief;
  plan: DirectorPlan;
  candidates: Candidate[];
  round: 1 | 2;
  previous?: Critique;
  tilesPresent: boolean;
}

export interface CritiqueEvidence {
  card?: string;
  tile?: string;
  section?: number;
  quote?: string;
}
export interface CritiqueIssue {
  dim: RubricDim;
  severity: Severity;
  evidence: CritiqueEvidence;
}
export interface CandidateCritique {
  id: string;
  picked: boolean;
  /** picks only; a tile-only part is absent in a tile-less round */
  scores: Partial<Record<RubricKey, RubricScore>>;
  /** the engine's: the design hard gates and the budget rows "over" (the model's list is never read) */
  hardFails: string[];
  /** picks: any number; non-picks: ≤ 1 (why it lost) */
  issues: CritiqueIssue[];
  /** ≤ 3 per pick, [] for a non-pick; from `AI_REPAIR_OPS`, targets inside the candidate */
  repairs: AiRepairOp[];
}
/** rev 3 (QUAL-12): the slim round-1 shape. */
export interface Critique {
  perCandidate: CandidateCritique[];
  pick: [string, string, string];
  /** ONE locale (the store's primary); the other two come from `copy.field` translate */
  whyLines: { locale: Locale; lines: [string, string, string] };
  /** pairwise distances of the picks (0-1, 1-2, 0-2), recomputed by the engine; the model's numbers are ignored */
  distinctness: number[];
}

/* ------------------------------------------------------------------ */
/* What finalize reports beside the value                              */
/* ------------------------------------------------------------------ */

/**
 * One thing finalize dropped or changed, kept for `ai_runs.flags` and the console (never shown to the seller).
 * `critic_contradiction` reasons: `no_tiles` (a tile-only part in a tile-less round), `ref` (a card id, section
 * index or tile label that does not exist), `digest` (a D-dimension issue the digest contradicts), `estimated` (an
 * estimated budget as the only reason), `non_pick` (scores, ops or a second issue on a non-pick), `pick` (a pick that
 * does not exist, repeats or has a hard fail).
 */
export interface DirectorNote {
  kind: "critic_contradiction" | "pin_dropped" | "hint_dropped" | "vocab_dropped" | "op_dropped" | "picks_adjusted";
  /** where: "directions.1.pin", "perCandidate.c4.issues.0", … */
  at: string;
  reason?: string;
  /** the dropped value, ≤ 60 chars, never page text */
  value?: string;
}
/** = `FinalizeResult<T>` plus the notes (structurally a `FinalizeResult`, so a Director finalize is a `Finalize<T>`). */
export type DirectorFinalizeResult<T> = { value: T; rejected: string[]; notes: DirectorNote[] } | null;

/* ------------------------------------------------------------------ */
/* Strict schemas: the finalized shapes                                */
/* ------------------------------------------------------------------ */

const text = (max: number) => z.string().trim().min(1).max(max);
const dial = z.number().int().min(1).max(10) as unknown as z.ZodType<Dial>;
const score = z.number().int().min(0).max(5) as unknown as z.ZodType<RubricScore>;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `GeneHints`, checked on its shape only (the vocabulary is design's `validateHints`). */
const GeneHintsShape = z.custom<GeneHints>(
  (v) =>
    isRecord(v) &&
    Object.entries(v).every(
      ([k, list]) =>
        (HINT_GENES as readonly string[]).includes(k) &&
        Array.isArray(list) &&
        list.length <= DIRECTOR_LIMITS.hintValuesPerGene &&
        list.every((e) => isRecord(e) && typeof e.value === "string" && e.value.length <= 48 && (e.weight === 1 || e.weight === 2 || e.weight === 3)),
    ),
  "GeneHints",
);

export const DesignReadSchema = z.object({
  /** "" when the guard refused the model's line */
  readLine: z.string().trim().max(DIRECTOR_LIMITS.readLine),
  audience: z.string().trim().max(DIRECTOR_LIMITS.audience),
  priceTier: z.enum(PRICE_TIERS),
  suggestedFacts: z.array(z.object({ text: text(DIRECTOR_LIMITS.suggestedFactChars), from: z.enum(SUGGESTED_FROM) })).max(DIRECTOR_LIMITS.suggestedFacts),
  photoQuality: z.object({
    sharp: z.boolean(),
    clutter: z.enum(CLUTTER_LEVELS),
    fullBleedOk: z.boolean(),
    cutoutViable: z.boolean(),
    advice: text(DIRECTOR_LIMITS.advice).nullable(),
  }),
  dials: z.object({ variance: dial, motion: dial, density: dial }),
  risks: z.array(text(DIRECTOR_LIMITS.riskChars)).max(DIRECTOR_LIMITS.risks),
}) satisfies z.ZodType<DesignRead>;

export const DirectionBriefSchema = z.object({
  slot: z.enum(DIRECTOR_SLOTS),
  hints: GeneHintsShape,
  pin: z.object({ gene: z.enum(BOLD_GENES), value: text(48) }).optional(),
  headlineStructures: z.array(z.enum(HEADLINE_STRUCTURES)).max(DIRECTOR_LIMITS.headlineStructures),
  copyAngle: z.enum(ANGLES),
  mustHave: z.array(text(DIRECTOR_LIMITS.mustHaveChars)).max(DIRECTOR_LIMITS.mustHave),
  mustAvoid: z.array(text(64)).max(DIRECTOR_LIMITS.mustAvoid),
  rationale: z.string().trim().max(DIRECTOR_LIMITS.rationale),
}) satisfies z.ZodType<DirectionBrief>;

export const DirectorPlanSchema = z
  .object({ read: DesignReadSchema, directions: z.tuple([DirectionBriefSchema, DirectionBriefSchema, DirectionBriefSchema]) })
  .refine((p) => p.directions.map((d) => d.slot).join() === DIRECTOR_SLOTS.join(), "three distinct slots, in order")
  .refine((p) => {
    const all = p.directions.flatMap((d) => d.headlineStructures);
    return new Set(all).size === all.length;
  }, "headline structures distinct across directions") satisfies z.ZodType<DirectorPlan>;

/** A repair op of the closed subset, on its own arguments (design's `RepairOp` member types). */
export const AiRepairOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("swapVariant"), section: text(40), to: text(40) }),
  z.object({ op: z.literal("changeGene"), gene: z.string().regex(/^G(?:[1-9]|[12]\d|3[0-5])$/) as unknown as z.ZodType<GeneKey>, to: text(48) }),
  z.object({ op: z.literal("rewriteLine"), section: text(40), field: text(40), structure: z.enum(HEADLINE_STRUCTURES).optional() }),
  z.object({ op: z.literal("dropKicker"), section: text(40) }),
  z.object({ op: z.literal("setOpener"), section: text(40), to: z.enum(OPENERS) }),
  z.object({ op: z.literal("setAlign"), section: text(40), to: z.enum(["start", "center"]) }),
  z.object({ op: z.literal("moveSection"), section: text(40), to: z.number().int().min(0).max(40) }),
  z.object({ op: z.literal("trimCopy"), section: text(40), field: text(40), maxWords: z.number().int().min(1).max(80) }),
  z.object({ op: z.literal("swapHeroFamily"), to: text(40) }),
]) satisfies z.ZodType<AiRepairOp>;

const EvidenceSchema = z.object({
  card: text(64).optional(),
  tile: text(40).optional(),
  section: z.number().int().min(0).max(40).optional(),
  quote: text(DIRECTOR_LIMITS.quote).optional(),
});
const IssueSchema = z.object({ dim: z.enum(RUBRIC_DIMS), severity: z.enum(SEVERITIES), evidence: EvidenceSchema });

export const CritiqueSchema = z
  .object({
    perCandidate: z
      .array(
        z.object({
          id: text(64),
          picked: z.boolean(),
          scores: z.partialRecord(z.enum(RUBRIC_KEYS), score),
          hardFails: z.array(text(40)).max(40),
          issues: z.array(IssueSchema).max(24),
          repairs: z.array(AiRepairOpSchema).max(DIRECTOR_LIMITS.opsPerPick),
        }),
      )
      .min(3)
      .max(12),
    pick: z.tuple([text(64), text(64), text(64)]),
    whyLines: z.object({ locale: z.enum(LOCALES), lines: z.tuple([z.string().max(DIRECTOR_LIMITS.whyLine), z.string().max(DIRECTOR_LIMITS.whyLine), z.string().max(DIRECTOR_LIMITS.whyLine)]) }),
    distinctness: z.array(z.number().min(0).max(1)).max(3),
  })
  .refine((c) => new Set(c.pick).size === 3, "three distinct picks")
  .refine((c) => c.perCandidate.every((p) => p.picked === c.pick.includes(p.id)), "picked flags match the pick")
  .refine((c) => c.perCandidate.every((p) => p.picked || (p.issues.length <= DIRECTOR_LIMITS.issuesPerNonPick && p.repairs.length === 0 && Object.keys(p.scores).length === 0)), "a non-pick carries ≤ 1 issue, no score, no op") satisfies z.ZodType<Critique>;

/* ------------------------------------------------------------------ */
/* Strict schemas: the route inputs (from a browser; AI-D6 bounds)     */
/* ------------------------------------------------------------------ */

const bandOk = (v: unknown): v is Band => v === "ok" || v === "close" || v === "too_close";
/** design's `GenomeCard`, checked on the fields the Director reads (the field list stays design's). */
export const GenomeCardShape = z.custom<GenomeCard>(
  (v) =>
    isRecord(v) &&
    typeof v.id === "string" &&
    v.id.length > 0 &&
    v.id.length <= 64 &&
    (DIRECTOR_SLOTS as readonly unknown[]).includes(v.slot) &&
    isRecord(v.bold) &&
    Object.values(v.bold).every((x) => typeof x === "string" && x.length <= 48) &&
    isRecord(v.derived) &&
    Object.keys(v.derived).length <= 40 &&
    typeof v.q === "number" &&
    typeof v.slop === "number" &&
    Array.isArray(v.gateFails) &&
    v.gateFails.every((g) => typeof g === "string") &&
    isRecord(v.distance) &&
    (bandOk(v.distance.own) || v.distance.own === "first") &&
    bandOk(v.distance.niche) &&
    bandOk(v.distance.platform) &&
    Array.isArray(v.explanation) &&
    v.explanation.length <= 8 &&
    v.explanation.every((x) => typeof x === "string" && x.length <= 160),
  "GenomeCard",
);
const verdictOk = (v: unknown): v is BudgetVerdict => v === "ok" || v === "estimated" || v === "over";
/** design's `RenderDigest` + the Director's budgets, checked on the fields finalize reads; `raster` is null in R1. */
export const DirectorDigestShape = z.custom<DirectorDigest>((v) => {
  if (!isRecord(v) || v.v !== 1 || !Array.isArray(v.sections) || v.sections.length > 40) return false;
  if (!v.sections.every((s) => isRecord(s) && typeof s.id === "string" && typeof s.type === "string")) return false;
  if (!isRecord(v.hero) || !isRecord(v.hero.fold) || !isRecord(v.counts) || !isRecord(v.gates) || !isRecord(v.heights)) return false;
  if (!Array.isArray(v.gates.hard) || !Array.isArray(v.gates.soft) || typeof v.gates.slop !== "number" || typeof v.gates.q !== "number") return false;
  if (!isRecord(v.budgets) || !verdictOk(v.budgets.C2) || !verdictOk(v.budgets.C3) || !verdictOk(v.budgets.F1)) return false;
  return v.raster === null || isRecord(v.raster);
}, "DirectorDigest");

const HeroPackSchema = z.object({ kicker: z.string().max(56).optional(), headline: z.string().max(84), sub: z.string().max(190), cta: z.string().max(32) }) satisfies z.ZodType<HeroPack>;
const MoneySchema = z.object({ minor: z.number().int().min(0).max(1_000_000_000), currency: z.string().regex(/^[A-Z]{3}$/) });
const NicheSharesShape = z.custom<NicheShares>(
  (v) => isRecord(v) && typeof v.n === "number" && Array.isArray(v.seq4) && v.seq4.length <= 20 && Array.isArray(v.tells) && v.tells.length <= 40,
  "NicheShares",
);

export const DirectorBriefSchema = z.object({
  store: z.object({
    handle: text(40),
    market: z.enum(MARKETS),
    locales: z.array(z.enum(LOCALES)).min(1).max(3),
    brandGenome: z.custom<Partial<BrandGenes>>((v) => isRecord(v) && Object.keys(v).length <= 35).optional(),
    memory: z.array(z.object({ kind: z.enum(["voice", "fact", "avoid", "prefer", "policy"]), text: text(300), locale: z.enum(LOCALES).nullable() })).max(DIRECTOR_LIMITS.memory),
    policies: z.custom<StorePolicyFacts>((v) => isRecord(v), "StorePolicyFacts"),
    brandSeed: text(64),
  }),
  product: z.object({
    name: text(120),
    category: z.enum(PRODUCT_CATEGORIES),
    facts: z.array(text(200)).max(DIRECTOR_LIMITS.facts),
    price: MoneySchema,
    items: z.array(z.object({ id: text(40), name: text(120), options: z.array(text(60)).max(12) })).max(8),
    offers: z.array(z.object({ id: text(40), label: text(80), units: z.number().int().min(1).max(99), priceMinor: z.number().int().min(0).max(1_000_000_000), freeShipping: z.boolean() })).max(8),
  }),
  photos: z
    .array(
      z.object({
        assetId: text(64),
        w: z.number().int().min(1).max(10_000),
        h: z.number().int().min(1).max(10_000),
        hasCutout: z.union([z.boolean(), z.literal("estimated")]),
        palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(8),
        analysis: z.custom<AnalysisOut>((v) => isRecord(v)).optional(),
      }),
    )
    .max(DIRECTOR_LIMITS.photos),
  mode: z.enum(["landing", "store", "campaign"]),
  constraints: z.object({
    noOrange: z.literal(true),
    mood: z.enum(["calm", "lively"]).nullable(),
    modest: z.boolean(),
    locks: z.custom<BrandLocks>((v) => isRecord(v) && Object.values(v).every((x) => typeof x === "string" && x.length <= 48)),
  }),
  recent: z.object({ storeGenomeCards: z.array(GenomeCardShape).max(DIRECTOR_LIMITS.recentCards), nicheCrowding: NicheSharesShape }),
}) satisfies z.ZodType<DirectorBrief>;

export const CandidateSchema = z.object({
  card: GenomeCardShape,
  digest: DirectorDigestShape,
  heroCopy: HeroPackSchema,
  /** R2 only: refused in R1 by the critique route (tilesPresent = false) */
  tiles: z.array(z.object({ label: text(40), w: z.number().int().positive(), h: z.number().int().positive(), jpegBase64: z.string().max(350_000), fidelity: z.enum(["full", "partial"]) })).max(7).optional(),
}) satisfies z.ZodType<Candidate>;

export const CritiqueInputSchema = z
  .object({
    brief: DirectorBriefSchema,
    plan: DirectorPlanSchema,
    candidates: z.array(CandidateSchema).min(3).max(DIRECTOR_LIMITS.candidates),
    round: z.union([z.literal(1), z.literal(2)]),
    previous: CritiqueSchema.optional(),
    tilesPresent: z.boolean(),
  })
  .refine((i) => new Set(i.candidates.map((c) => c.card.id)).size === i.candidates.length, "candidate ids are distinct")
  .refine((i) => i.tilesPresent || i.candidates.every((c) => !c.tiles?.length), "no tile in a tile-less round") satisfies z.ZodType<CritiqueInput>;

/* ------------------------------------------------------------------ */
/* Loose schemas: what the model writes (AI-§B.4)                      */
/* ------------------------------------------------------------------ */

/**
 * The loose plan. Hints are a flat list (`{ gene, value, weight }`) and pins a list, so a model that pins twice
 * writes something finalize can name (`second_pin`); every free text is unbounded here and bounded by the guard.
 */
export const DirectorPlanLoose = z.object({
  read: z.object({
    readLine: z.string(),
    audience: z.string(),
    priceTier: z.enum(PRICE_TIERS),
    suggestedFacts: z.array(z.object({ text: z.string(), from: z.enum(SUGGESTED_FROM) })),
    photoQuality: z.object({ sharp: z.boolean(), clutter: z.enum(CLUTTER_LEVELS), fullBleedOk: z.boolean(), cutoutViable: z.boolean(), advice: z.string().nullable() }),
    dials: z.object({ variance: z.number(), motion: z.number(), density: z.number() }),
    risks: z.array(z.string()),
  }),
  directions: z.array(
    z.object({
      slot: z.enum(DIRECTOR_SLOTS),
      hints: z.array(z.object({ gene: z.string(), value: z.string(), weight: z.number() })),
      pins: z.array(z.object({ gene: z.string(), value: z.string() })),
      headlineStructures: z.array(z.string()),
      copyAngle: z.string(),
      mustHave: z.array(z.string()),
      mustAvoid: z.array(z.string()),
      rationale: z.string(),
    }),
  ),
});
export type DirectorPlanLoose = z.infer<typeof DirectorPlanLoose>;

/** One op of the loose critique: every argument key present, `null` where the op takes none (finalize types it). */
const OpLoose = z.object({
  op: z.enum(AI_REPAIR_OPS),
  section: z.string().nullable(),
  to: z.string().nullable(),
  toIndex: z.number().nullable(),
  gene: z.string().nullable(),
  field: z.string().nullable(),
  structure: z.string().nullable(),
  maxWords: z.number().nullable(),
});
export type OpLoose = z.infer<typeof OpLoose>;

export const CritiqueLoose = z.object({
  perCandidate: z.array(
    z.object({
      id: z.string(),
      picked: z.boolean(),
      scores: z.object(Object.fromEntries(RUBRIC_KEYS.map((k) => [k, z.number().nullable()])) as Record<RubricKey, z.ZodNullable<z.ZodNumber>>),
      hardFails: z.array(z.string()),
      issues: z.array(
        z.object({
          dim: z.enum(RUBRIC_DIMS),
          severity: z.enum(SEVERITIES),
          evidence: z.object({ card: z.string().nullable(), tile: z.string().nullable(), section: z.number().nullable(), quote: z.string().nullable() }),
        }),
      ),
      repairs: z.array(OpLoose),
    }),
  ),
  pick: z.array(z.string()),
  whyLines: z.object({ locale: z.string(), lines: z.array(z.string()) }),
  distinctness: z.array(z.number()),
});
export type CritiqueLoose = z.infer<typeof CritiqueLoose>;

/** The loose schemas as JSON Schema for `output_config.format` (byte-stable per prompt version, so the compile cache hits). */
export const DIRECTOR_PLAN_LOOSE_JSON = z.toJSONSchema(DirectorPlanLoose) as Record<string, unknown>;
export const CRITIQUE_LOOSE_JSON = z.toJSONSchema(CritiqueLoose) as Record<string, unknown>;
