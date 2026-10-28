/**
 * The genome sampler and solver (P6 DESIGN; design.md DES-§4.3, DES-§4.4, DES-§4.12, DS3, DS5, DS23, DS49, QUAL-3,
 * QUAL-10, DES N9; docs/STORE-SAAS.md §K.2 P0 design stubs). Pure, deterministic per (seed, inputs, priorsV, hints):
 *
 *  1. the seven bold genes are drawn in the order G1, G2, G9, G4, G18, G23.f, G28, each from its prior × the H33
 *     anti-concentration factor × the Director hints × the learned weights, after `platform_ai.genePins`; the values
 *     a hard rule forbids given the earlier choices (or that would leave a later bold gene, or a locked gene, without
 *     a valid value) are zeroed and the floor 0.02 is re-applied to the valid ones. A lock is the value; a pin is the
 *     value when it passes the hard rules, the photo facts and the locks, else it is dropped with `why: "pin"`;
 *  2. the other genes are solved by forward checking and chronological backtracking (smallest domain first, ties by
 *     the DES-§4.2 order), each value list in the gene's preferred order (the archetype's value, the grammar's and the
 *     strategy's affinities, the soft rules) with a ±1-step jitter from the gene's own rng stream; the brand detail
 *     genes (ladder, depth, mask, detail kit, button) are weighted draws (2^score) instead, so every value they allow
 *     appears under several archetypes (DG-03); ≤ 200 expansions;
 *  3. over budget: the last bold gene (G28) is relaxed to the archetype default and solved once more; failing again,
 *     the archetype's back-derived genome is returned with `why: ["fallback"]` (logged, never shown as a failure).
 *
 * The rhythm genes G32-G35 and G24 are placeholders here; the choreography step solves them after the expansion. The
 * no-orange check (H24) and the pop rule (H25) need the product palette and run in compile.ts. `repel` is the
 * wizard's greedy maximin over a run's candidates (QUAL-3).
 */
import { ARCHETYPES, type Archetype } from "@/lib/page/schema";
import { deriveSeed, hash32, rngFor } from "@/lib/generator/rng";
import { ARCHETYPE_DEFS } from "@/lib/theme/archetypes";
import { accentRole, fontData } from "@/lib/theme/fonts";
import { COLOR_PLANS } from "@/lib/theme/palette";
import type { BaseMood } from "@/lib/theme/archetypes";
import { ANGLES } from "./consts";
import { archetypeGenes, darijaDefault, hasAlpha, labelsOf, ladderOfRadius, depthOf, RHYTHM, tkOf, topRegister } from "./derive";
import { genomeDistance, type DistanceView } from "./distance";
import type {
  Angle,
  BoldGene,
  BrandGenes,
  ColorStrategy,
  DesignGenome,
  EaseFamily,
  GeneKey,
  Grammar,
  HintDropReason,
  PageGenes,
  SampleInput,
  SampleOpts,
  Treatment,
  VoiceRegister,
} from "./genome";
import { applyHints, type GeneHints } from "./hints";
import { italicFace, loadCatalogue, NEVER_DISPLAY_AR, pairingsFor, type Pairing } from "./pairings";
import type { NicheShares } from "./novelty.server";
import { BASE_PRIORS, concentration, learned, normalise, pinsAllow, PRIOR_FLOOR, priorFor } from "./priors";
import {
  ALIGN_BIASES,
  BOLD_ORDER,
  BUTTONS,
  CAPTIONS,
  DENSITY_LEVELS,
  DENSITY_PATTERNS,
  EMPHASES,
  GENE_ORDER,
  GENE_PARTS,
  GLYPHS,
  LABELS,
  MARGINS,
  NUMBERINGS,
  parseGeneValue,
  rangeValues,
  snap,
  SPLITS,
} from "./vocab";
import { DEPTHS, EASE_FAMILIES, GRAMMARS, LADDERS, MASKS, REVEALS, TREATMENTS, VOICE_REGISTERS, COLOR_STRATEGIES } from "./genome";

/** The node budget of one solve (DES-§4.4). */
export const MAX_EXPANSIONS = 200;
/** The adjacent-swap probability of the ±1-step jitter. */
const JITTER = 0.4;

/* ------------------------------------------------------------------ */
/* the motion families (DES-§4.12)                                     */
/* ------------------------------------------------------------------ */

/** Per family: G23.d range (ms), stagger range (ms), the reveal kinds it allows (1-2 of). */
export const MOTION_FAMILIES: Readonly<Record<EaseFamily, { d: readonly [number, number]; st: readonly [number, number]; kinds: readonly (typeof REVEALS)[number][] }>> = {
  expo: { d: [180, 400], st: [30, 45], kinds: ["fade-rise", "mask-wipe"] },
  quint: { d: [300, 700], st: [45, 70], kinds: ["fade-rise", "blur-in", "scale-in"] },
  quart: { d: [240, 600], st: [40, 60], kinds: ["fade-rise", "line-draw"] },
  critical: { d: [300, 600], st: [40, 60], kinds: ["fade-rise", "scale-in"] },
  "soft-spring": { d: [240, 500], st: [30, 50], kinds: ["scale-in", "fade-rise"] },
  mask: { d: [500, 900], st: [60, 80], kinds: ["mask-wipe", "line-draw"] },
};

/* ------------------------------------------------------------------ */
/* facts and the bold hard rules                                       */
/* ------------------------------------------------------------------ */

/** What the hard rules read about the inputs (H01, H13, H27, H36, the brand's locked base). */
export interface Facts {
  calm: boolean;
  ar: boolean;
  alpha: boolean;
  count: number;
  /** H13: the primary asset covers a mobile hero slot (390 × DPR 2 = 780 px) and is sharp; desktop bleeds are declared per variant */
  fullBleedOk: boolean;
  /** H13: the inner-50 % crop covers a 780 px slot */
  tightOk: boolean;
  /** H27 (b): the photo was shot dark */
  darkPhoto: boolean;
  lockedBase: BaseMood | null;
}

export function factsOf(input: Pick<SampleInput, "mood" | "locale" | "photos" | "brand">): Facts {
  const p = input.photos;
  const lockedBase = input.brand?.colors.locks.includes("base") ? (input.brand.colors.base ?? null) : null;
  return {
    calm: input.mood.mood === "calm",
    ar: input.locale === "ar",
    alpha: hasAlpha(p),
    count: Math.max(0, Math.floor(p.count)),
    fullBleedOk: p.sharp && p.maxWidth >= 780,
    tightOk: p.maxWidth * 0.5 >= 780,
    darkPhoto: p.count > 0 && p.background.luminance <= 0.35,
    lockedBase,
  };
}

/** The bold choices made so far (G4 carries its catalogue row). */
export interface Bold {
  G1?: Archetype;
  G2?: Grammar;
  G9?: ColorStrategy;
  G4?: Pairing;
  G18?: Treatment;
  G23?: EaseFamily;
  G28?: VoiceRegister;
}

type Reason = Exclude<HintDropReason, "vocab" | "second_pin" | "pin">;

type ArchPairings = { ids: readonly string[]; byId: ReadonlyMap<string, Pairing> };
/** The pairings each archetype may draw (own and borrowed), built once at load: the forward checks ask per candidate value. */
const PAIRS: ReadonlyMap<Archetype, ArchPairings> = new Map(
  ARCHETYPES.map((a): [Archetype, ArchPairings] => {
    const list = pairingsFor(a);
    return [a, { ids: list.map((x) => x.pairing.id), byId: new Map(list.map((x) => [x.pairing.id, x.pairing])) }];
  }),
);
const archPairings = (a: Archetype): ArchPairings => PAIRS.get(a)!;
const DIDONE = new Set(["bodoni-moda", "instrument-serif"]);

/** H27: a dark base is honest for this treatment (alpha, a dark photo, or a framed object on a panel). */
const darkOk = (t: Treatment, f: Facts) => f.alpha || f.darkPhoto || t === "framed" || t === "framed-stage" || t === "tight-detail";

/** The hard rules between a bold value and the earlier bold choices and the inputs; null = allowed. */
export function boldRule(gene: BoldGene, v: string, B: Bold, f: Facts): Reason | null {
  switch (gene) {
    case "G1":
      return null;
    case "G2":
      if (f.calm && v === "poster") return "hard_rule"; // H01
      if (v === "gallery-led" && f.count < 3) return "photo"; // H08
      if (v === "cinematic" && !f.fullBleedOk && !f.tightOk) return "photo"; // H07 + H13
      return null;
    case "G9":
      if (f.calm && v === "color-field") return "hard_rule"; // H01
      if (B.G2 === "poster" && !["color-field", "duotone", "mono+signal"].includes(v)) return "hard_rule"; // H04
      if (B.G2 === "quiet-luxe" && !["ink+one", "dark-luxe", "tonal", "high-key"].includes(v)) return "hard_rule"; // H05
      if (f.lockedBase && !COLOR_PLANS[v as ColorStrategy].bases.includes(f.lockedBase)) return "locked"; // the brand's locked base
      return null;
    case "G4": {
      const p = B.G1 ? archPairings(B.G1).byId.get(v) : loadCatalogue().byId.get(v);
      if (!p) return "hard_rule";
      if ((NEVER_DISPLAY_AR as readonly string[]).includes(p.displayAr)) return "hard_rule"; // H33 (F11)
      if (B.G2 === "poster" && !(p.displayWeight >= 700 || p.display === "big-shoulders-display")) return "hard_rule"; // H04
      return null;
    }
    case "G18": {
      const t = v as Treatment;
      if (B.G2 === "cinematic" && t !== "full-bleed-crop" && t !== "tight-detail") return "hard_rule"; // H07
      if (B.G2 === "gallery-led" && !["grid-contact", "framed", "full-bleed-crop", "tonal-duotone"].includes(t)) return "hard_rule"; // H08
      if (B.G2 === "stage" && t !== "cutout-stage" && t !== "framed-stage") return "hard_rule"; // H09
      if (t === "cutout-stage" && !f.alpha) return "photo"; // H13
      if (t === "full-bleed-crop" && !f.fullBleedOk) return "photo"; // H13
      if (t === "tight-detail" && !f.tightOk) return "photo"; // H13
      if (t === "grid-contact" && f.count < 3) return "photo"; // H13, H36
      if (t === "tonal-duotone" && f.count < 2) return "photo"; // H36: secondary images need a second photo
      if (B.G9 === "dark-luxe" && !darkOk(t, f)) return "photo"; // H11 + H27
      return null;
    }
    case "G23":
      if (f.calm && v === "soft-spring") return "hard_rule"; // H01
      if (v === "soft-spring" && B.G1 !== undefined && B.G1 !== "playground") return "hard_rule"; // H15
      if (B.G2 === "quiet-luxe" && MOTION_FAMILIES[v as EaseFamily].d[1] < 600) return "hard_rule"; // H05 (d ≥ 600)
      return null;
    case "G28":
      if (f.calm && v === "bold") return "hard_rule"; // H01
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* the solved variables                                                */
/* ------------------------------------------------------------------ */

type Val = string | number | boolean;
/** The solved variables (struct genes are one variable per part). */
const VARS = [
  "G3.c", "G3.s", "G3.m", "G3.w", "G3.u", "G5.rm", "G5.rd", "G5.dmax", "G6.tk", "G7.dc", "G7.lb", "G8", "G10", "G11", "G12", "G13",
  "G14.w", "G14.s", "G15", "G16", "G17", "G20.l", "G20.p", "G21", "G22", "G23.d", "G23.r", "G23.st", "G23.sc", "G25.gl", "G25.nb",
  "G25.cap", "G26", "G27", "G30.mw", "G30.ex", "G31", "angle",
] as const;
type VarKey = (typeof VARS)[number];
const geneOfVar = (k: VarKey): GeneKey | "angle" => (k === "angle" ? "angle" : (k.split(".")[0] as GeneKey));
const VAR_ORDER = (k: VarKey) => (k === "angle" ? 25 : (GENE_ORDER[geneOfVar(k) as GeneKey] ?? 30));

const grid = (gene: GeneKey, part: string) => rangeValues(GENE_PARTS[gene]![part]!.range!);
const G3W = grid("G3", "w");
const G5RM = grid("G5", "rm");
const G5RD = grid("G5", "rd");
const G5DMAX = grid("G5", "dmax");
const G6TK = grid("G6", "tk");
const G14S = grid("G14", "s");
const G23D = grid("G23", "d");
const G23ST = grid("G23", "st");
const G30MW = grid("G30", "mw");
const G10 = rangeValues([0.03, 0.35, 0.01]);
const G21 = rangeValues([0.75, 1.6, 0.05]);

/** The G23.r values of a family: each allowed kind alone, then each pair (written "a+b"). */
function revealSets(f: EaseFamily): string[] {
  const k = MOTION_FAMILIES[f].kinds;
  const out: string[] = [...k];
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) out.push(`${k[i]}+${k[j]}`);
  return out;
}

const serifItalic = (id: string | undefined) => !!id && fontData(id)?.category === "serif" && !!fontData(id)?.italic;

/** The hard rules a solved variable's value must pass given the bold choices (a rule whose bold gene is unset holds). */
function unaryOk(k: VarKey, v: Val, B: Bold, f: Facts, ctx: { register?: VoiceRegister; darija: BrandGenes["G31"] }): boolean {
  const g2 = B.G2;
  const p = B.G4;
  const didone = !!p && DIDONE.has(p.display);
  switch (k) {
    case "G3.s":
      return !((g2 === "split-tension" || g2 === "editorial-column") && v === "1:1"); // H22
    case "G5.rd":
      return !(g2 === "poster" && (v as number) < 1.4); // H04
    case "G5.dmax":
      return !(didone && (v as number) < 56); // H03
    case "G6.tk":
      return !(didone && (v as number) > 0.02); // H03
    case "G7.dc":
      if (v !== "uppercase") return true; // H17
      return !!p && (p.display === "big-shoulders-display" || ((p.display === "archivo" || p.display === "schibsted-grotesk") && p.displayWeight >= 700));
    case "G7.lb":
      return !(g2 === "specimen" && v === "plain"); // H06
    case "G8":
      return v === "lining" || (!!p && fontData(p.body)?.category === "serif"); // G8: old-style figures need a serif body
    case "G10": {
      const n = v as number;
      if (B.G9) {
        const [lo, hi] = COLOR_PLANS[B.G9].area; // H21
        if (n < lo - 1e-9 || n > hi + 1e-9) return false;
      }
      return !(g2 === "quiet-luxe" && n > 0.1 + 1e-9); // H05
    }
    case "G12":
      if (didone && v === "round") return false; // H03
      return !(g2 === "specimen" && v !== "crisp" && v !== "mixed"); // H06
    case "G13":
      return v === "circle"; // squircle is emitted from DG-19 only
    case "G14.w":
      return !(g2 === "specimen" && (v as number) < 1); // H06
    case "G15": {
      const d = v as BrandGenes["G15"];
      if (B.G9 && !COLOR_PLANS[B.G9].cards.includes(d)) return false; // H26 (the strategy's surfaces)
      if ((didone || B.G9 === "dark-luxe") && d !== "flat" && d !== "hairline" && d !== "directional") return false; // H03, H11
      return true;
    }
    case "G16": {
      const n = v as number;
      if ((f.calm || g2 === "quiet-luxe") && n > 1) return false; // H01, H05
      if (n > 0 && B.G9 && B.G18 && !["color-field", "duotone", "dark-luxe"].includes(B.G9) && B.G18 !== "full-bleed-crop" && B.G18 !== "cutout-stage") return false; // H16
      return true;
    }
    case "G20.l":
      if (g2 === "quiet-luxe" && v !== "airy") return false; // H05
      return !(g2 === "catalogue" && v === "airy"); // H10
    case "G22":
      return !(g2 === "catalogue" && v !== "start"); // H10
    case "G23.d": {
      if (!B.G23) return true;
      const [lo, hi] = MOTION_FAMILIES[B.G23].d;
      const n = v as number;
      return n >= lo && n <= hi && !(g2 === "quiet-luxe" && n < 600); // DES-§4.12, H05
    }
    case "G23.r":
      return !B.G23 || revealSets(B.G23).includes(v as string);
    case "G23.st": {
      if (!B.G23) return true;
      const [lo, hi] = MOTION_FAMILIES[B.G23].st;
      const n = v as number;
      return n >= lo && n <= hi && !(g2 === "quiet-luxe" && n < 60);
    }
    case "G23.sc":
      return v === false || (!f.calm && (g2 === "stage" || g2 === "cinematic")); // DES-§4.12 scroll-linked rows
    case "G25.cap":
      return v !== "italic-serif" || (!!p && (serifItalic(p.display) || serifItalic(p.accent))); // H18
    case "G26":
      return v !== "italic" || (!!p && italicFace(p) !== null); // H19
    case "G27":
      if (v === "glow" && B.G9 !== undefined && B.G9 !== "dark-luxe") return false; // H12 (a dark base is certain only with dark-luxe)
      return !(v === "underline" && g2 !== undefined && g2 !== "editorial-column" && g2 !== "quiet-luxe" && g2 !== "catalogue"); // H20
    case "G30.mw": {
      const r = B.G28 ?? ctx.register;
      if (!r) return true;
      const [lo, hi] = RHYTHM[r].mw; // DES-§9.10
      return (v as number) >= lo && (v as number) <= hi;
    }
    case "G30.ex": {
      const r = B.G28 ?? ctx.register;
      return !r || (v as number) <= RHYTHM[r].ex;
    }
    case "G31":
      return v === ctx.darija;
    default:
      return true;
  }
}

/** The value list of a solved variable before the rules. */
function valuesOf(k: VarKey, B: Bold): readonly Val[] {
  switch (k) {
    case "G3.c": return [12, 8, 4];
    case "G3.s": return SPLITS;
    case "G3.m": return MARGINS;
    case "G3.w": return G3W;
    case "G3.u": return [8, 4];
    case "G5.rm": return G5RM;
    case "G5.rd": return G5RD;
    case "G5.dmax": return G5DMAX;
    case "G6.tk": return G6TK;
    case "G7.dc": return ["none", "uppercase"];
    case "G7.lb": return LABELS;
    case "G8": return ["lining", "oldstyle"];
    case "G10": return G10;
    case "G11": return ["standard", "high"];
    case "G12": return LADDERS;
    case "G13": return ["circle", "squircle"];
    case "G14.w": return [0, 1, 1.5];
    case "G14.s": return G14S;
    case "G15": return DEPTHS;
    case "G16": return [0, 1, 2];
    case "G17": return MASKS;
    case "G20.l": return DENSITY_LEVELS;
    case "G20.p": return DENSITY_PATTERNS;
    case "G21": return G21;
    case "G22": return ALIGN_BIASES;
    case "G23.d": return G23D;
    case "G23.r": return B.G23 ? revealSets(B.G23) : [...REVEALS];
    case "G23.st": return G23ST;
    case "G23.sc": return [false, true];
    case "G25.gl": return GLYPHS;
    case "G25.nb": return NUMBERINGS;
    case "G25.cap": return CAPTIONS;
    case "G26": return EMPHASES;
    case "G27": return BUTTONS;
    case "G30.mw": return G30MW;
    case "G30.ex": return [0, 1];
    case "G31": return ["none", "cta", "light"];
    case "angle": return ANGLES;
  }
}

/** The binary hard rules between solved variables: H22 (offset ⇒ 12 columns), H23 (density ↔ spacing), mixed ladder ↔ mask. */
const BINARY: readonly { a: VarKey; b: VarKey; ok(a: Val, b: Val): boolean }[] = [
  { a: "G3.m", b: "G3.c", ok: (m, c) => m !== "offset" || c === 12 },
  { a: "G20.l", b: "G21", ok: (l, s) => (l === "dense" ? (s as number) <= 1.1 + 1e-9 : l === "airy" ? (s as number) >= 1.1 - 1e-9 : true) },
  // the mixed ladder has no media radius: its media take a drawn mask (rect, cut, arch, circle, pill, blob), never `rounded`
  { a: "G12", b: "G17", ok: (l, m) => l !== "mixed" || m !== "rounded" },
];

/** A lock's value per solved variable (G3 "c/s/m", G20 "l[/p]", numbers for G10 / G16 / G21). */
function lockVars(locks: Partial<Record<GeneKey, string>>): Map<VarKey, Val> {
  const out = new Map<VarKey, Val>();
  for (const [gene, raw] of Object.entries(locks) as [GeneKey, string][]) {
    const v = parseGeneValue(gene, raw);
    if (v === null) continue;
    switch (gene) {
      case "G3": {
        const [c, s, m] = v.split("/");
        out.set("G3.c", Number(c)).set("G3.s", s!).set("G3.m", m!);
        break;
      }
      case "G20": {
        const [l, p] = v.split("/");
        out.set("G20.l", l!);
        if (p) out.set("G20.p", p);
        break;
      }
      case "G10":
      case "G16":
      case "G21":
        out.set(gene, Number(v));
        break;
      case "G8":
      case "G11":
      case "G12":
      case "G13":
      case "G15":
      case "G17":
      case "G22":
      case "G26":
      case "G27":
      case "G31":
        out.set(gene, v);
        break;
    }
  }
  return out;
}

interface SolveCtx {
  facts: Facts;
  locks: Map<VarKey, Val>;
  register?: VoiceRegister;
  darija: BrandGenes["G31"];
  hints?: GeneHints;
  rng(key: string): () => number;
  maxHint: 1 | 2 | 3;
}

function domainOf(k: VarKey, B: Bold, c: SolveCtx): Val[] {
  const lock = c.locks.get(k);
  const vals = lock !== undefined ? [lock] : valuesOf(k, B);
  return vals.filter((v) => unaryOk(k, v, B, c.facts, c));
}

/** Every locked solved variable keeps a valid value under these bold choices. */
const lockedFeasible = (B: Bold, c: SolveCtx) => [...c.locks.keys()].every((k) => domainOf(k, B, c).length > 0);

/* ------------------------------------------------------------------ */
/* preferred orders                                                    */
/* ------------------------------------------------------------------ */

type Aff<V extends string> = Readonly<Partial<Record<string, readonly V[]>>>;
const MASK_GRAMMAR: Aff<(typeof MASKS)[number]> = { "editorial-column": ["rect", "arch"], poster: ["cut", "rect"], "gallery-led": ["rect", "rounded"], stage: ["circle", "arch"], specimen: ["rect", "cut"], catalogue: ["rect", "rounded"], "split-tension": ["cut", "rounded"], cinematic: ["rect", "pill"], "quiet-luxe": ["arch", "pill"] };
const MASK_ARCH: Aff<(typeof MASKS)[number]> = { maison: ["arch", "rect"], apothecary: ["rounded", "pill"], souk: ["arch", "blob"], playground: ["blob", "circle"], kinetic: ["cut", "rect"], circuit: ["rounded", "cut"], hearth: ["circle", "blob"], bloom: ["pill", "blob"], field: ["rounded", "blob"], editorial: ["rect", "arch"], garage: ["cut", "rect"] };
const LADDER_GRAMMAR: Aff<(typeof LADDERS)[number]> = { "editorial-column": ["crisp", "soft"], poster: ["round", "crisp"], "gallery-led": ["mixed", "soft"], stage: ["soft", "round"], specimen: ["crisp", "mixed"], catalogue: ["mixed", "crisp"], "split-tension": ["soft", "mixed"], cinematic: ["crisp", "mixed"], "quiet-luxe": ["soft", "crisp"] };
const LADDER_STRATEGY: Aff<(typeof LADDERS)[number]> = { "high-key": ["round", "soft"], "mono+signal": ["crisp", "mixed"], "dark-luxe": ["crisp", "soft"], "color-field": ["round", "mixed"], tonal: ["soft", "round"], duotone: ["soft", "mixed"], "ink+one": ["crisp", "soft"] };
const DEPTH_GRAMMAR: Aff<(typeof DEPTHS)[number]> = { "editorial-column": ["flat", "hairline"], poster: ["directional", "flat"], "gallery-led": ["flat", "tonal"], stage: ["ambient", "tonal"], specimen: ["hairline", "directional"], catalogue: ["hairline", "flat"], "split-tension": ["ambient", "hairline"], cinematic: ["flat", "hairline"], "quiet-luxe": ["flat", "hairline"] };
const DEPTH_ARCH: Aff<(typeof DEPTHS)[number]> = { maison: ["hairline", "flat"], apothecary: ["tonal", "hairline"], souk: ["tonal", "ambient"], playground: ["ambient", "directional"], kinetic: ["directional", "flat"], circuit: ["directional", "hairline"], hearth: ["tonal", "ambient"], bloom: ["ambient", "tonal"], field: ["tonal", "hairline"], editorial: ["flat", "hairline"], garage: ["directional", "hairline"] };
const GLYPH_GRAMMAR: Aff<(typeof GLYPHS)[number]> = { "quiet-luxe": ["none", "diamond"], cinematic: ["none", "dot"], specimen: ["none", "dot"], catalogue: ["dot", "none"], "editorial-column": ["none", "diamond"], poster: ["spark", "diamond"], "gallery-led": ["spark", "dot"], stage: ["dot", "spark"], "split-tension": ["diamond", "dot"] };
const NUMBERING_GRAMMAR: Aff<(typeof NUMBERINGS)[number]> = { specimen: ["padded", "plain"], catalogue: ["plain", "padded"], "editorial-column": ["plain", "none"], poster: ["padded", "none"] };
const CAPTION_GRAMMAR: Aff<(typeof CAPTIONS)[number]> = { specimen: ["mono", "smallcaps"], catalogue: ["smallcaps", "mono"], "editorial-column": ["italic-serif", "smallcaps"], "quiet-luxe": ["italic-serif", "plain"], cinematic: ["smallcaps", "plain"] };
const BUTTON_GRAMMAR: Aff<(typeof BUTTONS)[number]> = { "editorial-column": ["underline", "outline"], "quiet-luxe": ["underline", "solid"], catalogue: ["outline", "underline"], poster: ["solid", "pill"], stage: ["pill", "soft"], specimen: ["outline", "solid"], cinematic: ["solid", "outline"], "split-tension": ["solid", "pill"], "gallery-led": ["soft", "pill"] };
const BUTTON_STRATEGY: Aff<(typeof BUTTONS)[number]> = { "dark-luxe": ["glow", "outline"], "mono+signal": ["outline", "solid"], "high-key": ["soft", "pill"], "color-field": ["solid", "pill"], tonal: ["soft", "outline"], duotone: ["pill", "solid"], "ink+one": ["solid", "underline"] };
const BUTTON_ARCH: Aff<(typeof BUTTONS)[number]> = { maison: ["outline", "underline"], apothecary: ["soft", "outline"], souk: ["soft", "solid"], playground: ["pill", "solid"], kinetic: ["solid", "outline"], circuit: ["outline", "soft"], hearth: ["pill", "solid"], bloom: ["pill", "soft"], field: ["soft", "outline"], editorial: ["outline", "solid"], garage: ["outline", "glow"] };
const SPLIT_GRAMMAR: Aff<(typeof SPLITS)[number]> = { "editorial-column": ["5:7", "golden", "4:8"], poster: ["1:1", "5:7"], "gallery-led": ["1:1", "5:7", "4:8"], stage: ["5:7", "1:1"], specimen: ["5:7", "3:9", "4:8"], catalogue: ["4:8", "5:7", "3:9"], "split-tension": ["golden", "4:8", "5:7"], cinematic: ["1:1", "4:8"], "quiet-luxe": ["4:8", "golden", "1:1"] };
const MARGIN_GRAMMAR: Aff<(typeof MARGINS)[number]> = { "editorial-column": ["offset", "wide"], specimen: ["offset", "wide"], "quiet-luxe": ["narrow", "wide"], catalogue: ["wide", "narrow"], poster: ["wide", "narrow"], "split-tension": ["wide", "offset"] };
const REVEAL_GRAMMAR: Aff<(typeof REVEALS)[number]> = { "editorial-column": ["mask-wipe", "fade-rise"], poster: ["mask-wipe", "scale-in"], "gallery-led": ["fade-rise", "blur-in"], stage: ["scale-in", "fade-rise"], specimen: ["line-draw", "fade-rise"], catalogue: ["fade-rise", "line-draw"], "split-tension": ["fade-rise", "mask-wipe"], cinematic: ["mask-wipe", "fade-rise"], "quiet-luxe": ["fade-rise", "blur-in"] };
const ANGLE_REGISTER: Aff<Angle> = { plain: ["benefit", "value", "proof"], warm: ["ritual", "gift", "benefit"], precise: ["proof", "benefit", "value"], bold: ["benefit", "problem", "value"], "poetic-restrained": ["origin", "ritual", "gift"] };
/** dmax centre per grammar (px): the display sizes of the hero sheets (DES-§5.13). */
const DMAX_GRAMMAR: Readonly<Record<Grammar, number>> = { "editorial-column": 104, poster: 144, "gallery-led": 88, stage: 96, specimen: 88, catalogue: 80, "split-tension": 104, cinematic: 120, "quiet-luxe": 64 };
/** container offset per grammar (px) on the archetype's container. */
const WIDTH_GRAMMAR: Readonly<Partial<Record<Grammar, number>>> = { "quiet-luxe": -80, cinematic: 80, catalogue: 40, poster: 40, "gallery-led": 40 };

const score = (v: string, list: readonly string[] | undefined, w: readonly [number, number]) => (list?.[0] === v ? w[0] : list?.[1] === v ? w[1] : 0);

/** Sorts by score (high first, ties by value order), then the ±1-step jitter of the rng. */
function ranked(values: readonly Val[], scoreOf: (v: Val) => number, rng: () => number): Val[] {
  const out = values.map((v, i) => ({ v, s: scoreOf(v) - i * 1e-6 })).sort((a, b) => b.s - a.s).map((x) => x.v);
  for (let i = 0; i + 1 < out.length; i++) {
    if (rng() < JITTER) {
      [out[i], out[i + 1]] = [out[i + 1]!, out[i]!];
      i++; // a value moves one step at most
    }
  }
  return out;
}
/** A weighted shuffle (each next value drawn by weight from the rest). */
function weightedOrder(values: readonly Val[], weightOf: (v: Val) => number, rng: () => number): Val[] {
  const rest = values.map((v) => ({ v, w: Math.max(1e-6, weightOf(v)) }));
  const out: Val[] = [];
  while (rest.length) {
    const total = rest.reduce((s, x) => s + x.w, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < rest.length - 1; i++) {
      r -= rest[i]!.w;
      if (r < 0) break;
    }
    out.push(rest.splice(i, 1)[0]!.v);
  }
  return out;
}
/**
 * A weighted order with weights 2^score for the brand detail genes (G12, G15, G17, G25, G27): the preferred value
 * leads most often, and every valid value can lead, so no archetype owns a ladder, a mask or a button (DG-03 spread).
 */
const drawn = (values: readonly Val[], scoreOf: (v: Val) => number, rng: () => number) => weightedOrder(values, (v) => 2 ** scoreOf(v), rng);
const near = (target: number, scale: number) => (v: Val) => -Math.abs((v as number) - target) / scale;

/** The preferred value order of a solved variable (DES-§4.4 "derive(gene, bold)" with ±1-step jitter). */
function preferred(k: VarKey, domain: readonly Val[], B: Bold, A: ReadonlyMap<VarKey, Val>, c: SolveCtx): Val[] {
  const a = B.G1 ?? "editorial";
  const d = ARCHETYPE_DEFS[a];
  const g2 = B.G2 ?? "editorial-column";
  const g9 = B.G9 ?? "ink+one";
  const p = B.G4;
  const rng = c.rng(`solve:${k}`);
  const enumScore = (def: string | undefined, arch: readonly string[] | undefined, gram: readonly string[] | undefined, strat?: readonly string[]) => (v: Val) =>
    (v === def ? 3 : 0) + score(v as string, arch, [1.5, 1]) + score(v as string, gram, [2, 1]) + score(v as string, strat, [1.5, 0.75]);
  let out: Val[];
  switch (k) {
    case "G3.c":
      out = ranked(domain, (v) => (v === 12 ? 2 : v === 8 ? 1 : 0), rng);
      break;
    case "G3.s":
      out = ranked(domain, enumScore(undefined, undefined, SPLIT_GRAMMAR[g2]), rng);
      break;
    case "G3.m":
      out = ranked(domain, enumScore("wide", undefined, MARGIN_GRAMMAR[g2]), rng);
      break;
    case "G3.w":
      out = ranked(domain, near(snap(d.container + (WIDTH_GRAMMAR[g2] ?? 0), [1080, 1440, 40]), 40), rng);
      break;
    case "G3.u":
      out = ranked(domain, (v) => (v === (A.get("G20.l") === "dense" || d.density === "dense" ? 4 : 8) ? 1 : 0), rng);
      break;
    case "G5.rm":
      out = ranked(domain, near(d.typeRatio[0], 0.025), rng);
      break;
    case "G5.rd": {
      const loud = g2 === "poster" || g2 === "cinematic";
      const target = Math.min(1.5, Math.max(loud ? 1.4 : 1.2, d.typeRatio[1]));
      // soft rule: rd < 1.25 with a poster or cinematic grammar (−3)
      out = ranked(domain, (v) => near(target, 0.025)(v) - (loud && (v as number) < 1.25 ? 10 : 0), rng);
      break;
    }
    case "G5.dmax": {
      const light = !!p && p.displayWeight < 400;
      // soft rule: a display weight < 400 above 120 px on a light base loses its hairlines (−2)
      out = ranked(domain, (v) => near(DMAX_GRAMMAR[g2], 8)(v) - (light && (v as number) > 120 ? 10 : 0), rng);
      break;
    }
    case "G6.tk":
      out = ranked(domain, near(tkOf(d.display.tracking), 0.005), rng);
      break;
    case "G7.dc":
      out = ranked(domain, (v) => (v === d.display.case ? 2 : 0) + (g2 === "poster" && v === "uppercase" ? 1.5 : 0), rng);
      break;
    case "G7.lb": {
      const def = labelsOf(d, p?.accent);
      out = ranked(domain, (v) => (v === def ? 3 : 0) + (g2 === "specimen" && v === "mono" ? 1 : 0), rng);
      break;
    }
    case "G8":
      out = ranked(domain, (v) => (v === "lining" ? 1 : ["editorial-column", "quiet-luxe"].includes(g2) ? 1.2 : 0), rng);
      break;
    case "G10": {
      const [lo, hi] = COLOR_PLANS[g9].area;
      out = ranked(domain, near(Math.min(g2 === "quiet-luxe" ? 0.1 : 1, (lo + hi) / 2), 0.01), rng);
      break;
    }
    case "G11":
      out = ranked(domain, (v) => (v === "high" ? (["circuit", "garage", "kinetic"].includes(a) || g9 === "mono+signal" ? 2 : 0) : 1), rng);
      break;
    case "G12":
      out = drawn(domain, enumScore(ladderOfRadius(d.radius.kind), undefined, LADDER_GRAMMAR[g2], LADDER_STRATEGY[g9]), rng);
      break;
    case "G14.w":
      out = ranked(domain, (v) => (v === (d.borderWidth >= 1.5 ? 1.5 : d.borderWidth <= 0 ? 0 : 1) ? 2 : 0) + (A.get("G15") === "flat" && v === 0 ? 1 : 0), rng);
      break;
    case "G14.s":
      out = ranked(domain, near(Math.min(0.3, Math.max(0.08, d.lineStrength)), 0.02), rng);
      break;
    case "G15":
      out = drawn(domain, enumScore(depthOf(d.card, d.shadow), DEPTH_ARCH[a], DEPTH_GRAMMAR[g2]), rng);
      break;
    case "G16":
      out = ranked(domain, (v) => (d.card === "glass" ? (v === 1 ? 2 : v === 2 ? 1 : 0) : v === 0 ? 2 : v === 1 ? 1 : 0), rng);
      break;
    case "G17":
      out = drawn(domain, enumScore(d.mask, MASK_ARCH[a], MASK_GRAMMAR[g2]), rng);
      break;
    case "G20.l":
      out = ranked(domain, (v) => (v === d.density ? 2 : 0) + (g2 === "quiet-luxe" && v === "airy" ? 1 : 0), rng);
      break;
    case "G20.p":
      out = ranked(domain, (v) => (v === "ABAC" ? 1 : 0), rng);
      break;
    case "G21": {
      const l = A.get("G20.l") ?? d.density;
      const target = l === "airy" ? 1.25 : l === "dense" ? 0.9 : 1;
      // soft rule: G21 > 1.4 with a balanced density (−1)
      out = ranked(domain, (v) => near(target, 0.05)(v) - (l === "balanced" && (v as number) > 1.4 ? 5 : 0), rng);
      break;
    }
    case "G22":
      out = ranked(domain, (v) => (v === "mixed" ? 2 : v === "center-statement" && (g2 === "quiet-luxe" || g2 === "poster") ? 2.5 : v === "start" && (g2 === "specimen" || g2 === "editorial-column") ? 2.5 : 0), rng);
      break;
    case "G23.d": {
      const f = MOTION_FAMILIES[B.G23 ?? "critical"].d;
      const mid = g2 === "quiet-luxe" ? Math.max(640, (f[0] + f[1]) / 2) : (f[0] + f[1]) / 2;
      out = ranked(domain, near(mid * (c.facts.calm ? 1.15 : 1), 20), rng);
      break;
    }
    case "G23.r": {
      const pref = REVEAL_GRAMMAR[g2] ?? [];
      const kindScore = (s: string) => (pref[0] === s ? 2 : pref[1] === s ? 1 : 0) + (c.facts.calm && s === "fade-rise" ? 1 : 0);
      out = ranked(domain, (v) => {
        const parts = (v as string).split("+");
        return parts.reduce((t, s) => t + kindScore(s), 0) / parts.length - (parts.length - 1) * 0.3;
      }, rng);
      break;
    }
    case "G23.st": {
      const f = MOTION_FAMILIES[B.G23 ?? "critical"].st;
      out = ranked(domain, near(g2 === "quiet-luxe" ? Math.max(60, (f[0] + f[1]) / 2) : (f[0] + f[1]) / 2, 5), rng);
      break;
    }
    case "G23.sc":
      out = ranked(domain, (v) => (v === (g2 === "cinematic") ? 1 : 0), rng);
      break;
    case "G25.gl":
      out = drawn(domain, enumScore(d.glyph, undefined, GLYPH_GRAMMAR[g2]), rng);
      break;
    case "G25.nb":
      out = drawn(domain, enumScore("none", undefined, NUMBERING_GRAMMAR[g2]), rng);
      break;
    case "G25.cap": {
      const mono = !!p?.accent && accentRole(p.accent) === "mono";
      out = drawn(domain, (v) => (v === "plain" ? 2 : 0) + (v === "mono" && mono ? 2.5 : 0) + (v === "smallcaps" && d.labels.case === "uppercase" ? 1 : 0) + score(v as string, CAPTION_GRAMMAR[g2], [2, 1]), rng);
      break;
    }
    case "G26": {
      // DES-§4.2 G26: "none" carries ≥ 0.40 of the prior mass (DS56); the archetype's device next; the rest share the remainder
      const others = domain.filter((v) => v !== "none" && v !== d.emphasis).length || 1;
      out = weightedOrder(domain, (v) => (v === "none" ? 0.42 : v === d.emphasis ? 0.3 : 0.28 / others), rng);
      break;
    }
    case "G27":
      out = drawn(domain, enumScore(d.button, BUTTON_ARCH[a], BUTTON_GRAMMAR[g2], BUTTON_STRATEGY[g9]), rng);
      break;
    case "G30.mw": {
      const r = B.G28 ?? c.register ?? "plain";
      out = ranked(domain, near((RHYTHM[r].mw[0] + RHYTHM[r].mw[1]) / 2, 1), rng);
      break;
    }
    case "G30.ex":
      out = ranked(domain, (v) => (v === 0 ? 1 : 0), rng);
      break;
    case "angle": {
      const r = B.G28 ?? c.register ?? "plain";
      out = ranked(domain, (v) => score(v as string, ANGLE_REGISTER[r], [2, 1]) + (ANGLE_REGISTER[r]?.[2] === v ? 0.5 : 0), rng);
      break;
    }
    default:
      out = [...domain];
  }
  // Director hints on G10 / G16 / G20 lead the order (weight first); never a value outside the domain
  const gene = geneOfVar(k);
  if (gene === "G10" || gene === "G16" || gene === "G20") {
    const list = [...(c.hints?.[gene] ?? [])].sort((x, y) => y.weight - x.weight);
    const lead = list
      .map((h) => (gene === "G20" ? (k === "G20.l" ? h.value.split("/")[0] : h.value.split("/")[1]) : Number(h.value)))
      .filter((v): v is string | number => v !== undefined && out.includes(v));
    if (lead.length) out = [...new Set([...lead, ...out])];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the CSP                                                             */
/* ------------------------------------------------------------------ */

class Budget extends Error {}

/** Forward checking + chronological backtracking over the solved variables (DES-§4.4). */
function solveVars(B: Bold, c: SolveCtx, budget: { left: number; used: number }): Map<VarKey, Val> | null {
  const domains = new Map<VarKey, Val[]>();
  for (const k of VARS) {
    const dom = domainOf(k, B, c);
    if (!dom.length) return null;
    domains.set(k, dom);
  }
  const A = new Map<VarKey, Val>();
  const neighbours = (k: VarKey) => BINARY.filter((r) => r.a === k || r.b === k);

  const step = (): boolean => {
    let best: VarKey | null = null;
    for (const k of VARS) {
      if (A.has(k)) continue;
      if (!best) best = k;
      else {
        const dk = domains.get(k)!.length;
        const db = domains.get(best)!.length;
        if (dk < db || (dk === db && VAR_ORDER(k) < VAR_ORDER(best))) best = k;
      }
    }
    if (!best) return true;
    const k = best;
    for (const v of preferred(k, domains.get(k)!, B, A, c)) {
      if (budget.left-- <= 0) throw new Budget();
      budget.used++;
      A.set(k, v);
      // forward check the binary rules into the unassigned neighbours
      const saved: [VarKey, Val[]][] = [];
      let wipeout = false;
      for (const r of neighbours(k)) {
        const other = r.a === k ? r.b : r.a;
        if (A.has(other)) {
          if (!(r.a === k ? r.ok(v, A.get(other)!) : r.ok(A.get(other)!, v))) wipeout = true;
          continue;
        }
        const dom = domains.get(other)!;
        const kept = dom.filter((w) => (r.a === k ? r.ok(v, w) : r.ok(w, v)));
        if (kept.length !== dom.length) {
          saved.push([other, dom]);
          domains.set(other, kept);
        }
        if (!kept.length) wipeout = true;
      }
      if (!wipeout && step()) return true;
      for (const [o, dom] of saved) domains.set(o, dom);
      A.delete(k);
    }
    return false;
  };
  try {
    return step() ? A : null;
  } catch (e) {
    if (e instanceof Budget) return null;
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* the bold draw                                                       */
/* ------------------------------------------------------------------ */

const BOLD_VALUES = (gene: BoldGene, B: Bold): readonly string[] => {
  switch (gene) {
    case "G1": return ARCHETYPES;
    case "G2": return GRAMMARS;
    case "G9": return COLOR_STRATEGIES;
    case "G4": return archPairings(B.G1 ?? "editorial").ids;
    case "G18": return TREATMENTS;
    case "G23": return EASE_FAMILIES;
    case "G28": return VOICE_REGISTERS;
  }
};

const withBold = (B: Bold, gene: BoldGene, v: string): Bold => {
  if (gene === "G4") return { ...B, G4: archPairings(B.G1 ?? "editorial").byId.get(v) ?? loadCatalogue().byId.get(v) };
  return { ...B, [gene]: v };
};

/**
 * A bold value is valid when its hard rules hold, the locked solved genes keep a value, and every later bold gene
 * (its lock or pin when it has one) still has a valid value (one step of forward checking, DES-§4.4).
 */
function validBold(gene: BoldGene, v: string, B: Bold, c: SolveCtx, fixed: Partial<Record<BoldGene, string>>): Reason | null {
  const r = boldRule(gene, v, B, c.facts);
  if (r) return r;
  const next = withBold(B, gene, v);
  if (gene === "G4" && !next.G4) return "hard_rule";
  if (!lockedFeasible(next, c)) return "locked";
  const later = BOLD_ORDER.slice(BOLD_ORDER.indexOf(gene) + 1);
  for (const g of later) {
    const vals = fixed[g] !== undefined ? [fixed[g]!] : BOLD_VALUES(g, next);
    if (!vals.some((w) => !boldRule(g, w, next, c.facts) && (g !== "G4" || withBold(next, g, w).G4) && lockedFeasible(withBold(next, g, w), c))) return "hard_rule";
  }
  return null;
}

/** The draw weights of a bold gene's valid values: prior × H33 × learned × hints, floored and normalised. */
function boldWeights(gene: BoldGene, valid: readonly string[], B: Bold, input: SampleInput, opts: SampleOpts, maxHint: 1 | 2 | 3): Record<string, number> {
  const a = B.G1 ?? "editorial";
  let prior = priorFor(gene, { archetype: a, grammar: B.G2, alpha: hasAlpha(input.photos), ranked: input.ranked });
  const cat = gene === "G4" ? archPairings(a).byId : null;
  const w: Record<string, number> = {};
  for (const v of Object.keys(prior)) w[v] = prior[v]! * concentration(gene, v, input.shares, { pairing: cat?.get(v), ar: input.locale === "ar" }) * learned(gene, v, opts.priors);
  prior = applyHints(w, gene, opts.hints, maxHint);
  // the hard rules zero what they forbid; the floor is re-applied to the valid values (DES-§4.4)
  const kept: Record<string, number> = {};
  let total = 0;
  for (const v of valid) total += prior[v] ?? 0;
  for (const v of valid) kept[v] = total > 0 ? (prior[v] ?? 0) / total : 1 / valid.length;
  return normalise(valid, kept);
}

/** Weighted pick in value order (the rng is the gene's own stream). */
function pick(rng: () => number, weights: Record<string, number>, order: readonly string[]): string {
  const total = order.reduce((s, v) => s + (weights[v] ?? 0), 0);
  let r = rng() * total;
  for (const v of order) {
    r -= weights[v] ?? 0;
    if (r < 0) return v;
  }
  return order[order.length - 1]!;
}

/**
 * The archetype of direction i (DES-§4.3 G1): direction 1 = the best fit, directions 2 and 3 drawn (seeded, from the
 * run's base seed so every direction agrees on the others) from the next five by score + floor, distinct from each
 * other and from direction 1. Director hints multiply the current direction's weights only (direction 1 takes the
 * highest weighted score); `pool` is the set the direction chose from, so the caller can tell which hints applied.
 */
export function directionArchetype(
  input: Pick<SampleInput, "ranked" | "brandSeed" | "inputHash" | "directionIndex">,
  hints?: readonly { value: string; weight: 1 | 2 | 3 }[],
  maxHint: 1 | 2 | 3 = 3,
): { archetype: Archetype; pool: Archetype[] } {
  const ranked = input.ranked.length ? input.ranked : ARCHETYPES.map((a) => ({ archetype: a, score: 0, reason: "" }));
  const base = hash32(`${input.brandSeed}|${input.inputHash}`);
  const i = input.directionIndex;
  const factor = (a: string, k: number) => (k === i ? Math.min(maxHint, hints?.find((h) => h.value === a)?.weight ?? 1) : 1);
  const weight = (r: { archetype: Archetype; score: number }, k: number) => (Math.max(0, r.score) + PRIOR_FLOOR) * factor(r.archetype, k);
  const first = i === 0 ? [...ranked].sort((x, y) => weight(y, 0) - weight(x, 0))[0]!.archetype : ranked[0]!.archetype;
  if (i === 0) return { archetype: first, pool: ranked.map((r) => r.archetype) };
  const taken: Archetype[] = [first];
  let out: Archetype = first;
  let pool: Archetype[] = [];
  for (let k = 1; k <= i; k++) {
    const cands = ranked.filter((r) => r.archetype !== first).slice(0, 5).filter((r) => !taken.includes(r.archetype));
    if (!cands.length) return { archetype: first, pool: [first] };
    const weights: Record<string, number> = {};
    for (const r of cands) weights[r.archetype] = weight(r, k);
    pool = cands.map((r) => r.archetype);
    out = pick(rngFor(base, `genome:G1:${k}`), weights, pool) as Archetype;
    taken.push(out);
  }
  return { archetype: out, pool };
}

/* ------------------------------------------------------------------ */
/* sampleGenome                                                        */
/* ------------------------------------------------------------------ */

export interface SampleStats {
  expansions: number;
  relaxed: boolean;
  fallback: boolean;
}

/** The brand kit locks (DES-§12.3): the gene locks, a locked pairing, the voice of `brandView` (G28, G31). */
export function brandLocks(brand: SampleInput["brand"]): Partial<Record<GeneKey, string>> {
  const out: Partial<Record<GeneKey, string>> = {};
  if (!brand) return out;
  for (const [g, v] of Object.entries(brand.genes ?? {})) {
    const p = parseGeneValue(g, v);
    if (p !== null) out[g as GeneKey] = p;
  }
  if (brand.fonts?.locked && brand.fonts.pairing) {
    const p = parseGeneValue("G4", brand.fonts.pairing);
    if (p !== null) out.G4 = p;
  }
  const voice = (brand as { voiceSummary?: { register: VoiceRegister | null; darija: BrandGenes["G31"] } }).voiceSummary;
  if (voice?.register) out.G28 = voice.register;
  if (voice?.darija) out.G31 = voice.darija;
  return out;
}

/** The DES-§4.8 "why" keys the inputs support, in the table's order (≤ 6). */
function whyKeys(B: Required<Bold>, f: Facts, input: SampleInput, voiceLocked: boolean, darija: BrandGenes["G31"]): string[] {
  const p = input.photos;
  const out: string[] = [];
  if (p.hasCutout === true && B.G18 === "cutout-stage") out.push("design.why.cutout");
  if (f.count === 1) out.push("design.why.onePhoto");
  if (p.count > 0 && p.background.uniform) out.push("design.why.background");
  if (B.G9 === "dark-luxe" && (f.darkPhoto || darkOk(B.G18, f))) out.push("design.why.darkFromPhoto");
  if (f.count >= 3 && (B.G18 === "grid-contact" || B.G2 === "gallery-led")) out.push("design.why.manyPhotos");
  if (p.dominant) out.push("design.why.accent");
  if (voiceLocked) out.push("design.why.voice");
  if (f.ar && darija !== "none") out.push("design.why.market");
  return out.slice(0, 6);
}

/** sampleGenome with its solver statistics (expansions, relax and fallback paths). */
export function sampleGenomeWithStats(input: SampleInput, opts: SampleOpts = {}): { genome: DesignGenome; stats: SampleStats } {
  const seed = deriveSeed(hash32(`${input.brandSeed}|${input.inputHash}`), `direction:${input.directionIndex}:${input.attempt}`);
  const rng = (k: string) => rngFor(seed, `genome:${k}`);
  const facts = factsOf(input);
  const locks: Partial<Record<GeneKey, string>> = { ...brandLocks(input.brand), ...(opts.locks ?? {}) };
  const voiceLocked = locks.G28 !== undefined && !!(input.brand as { voiceSummary?: { register: unknown } } | null)?.voiceSummary?.register;
  const darija = (locks.G31 as BrandGenes["G31"] | undefined) ?? darijaDefault(input.market, input.locale);
  // the exploration slot (direction 3) takes hints at weight ≤ 2 (DES-§4.6)
  const maxHint: 1 | 2 | 3 = input.directionIndex === 2 ? 2 : 3;
  const c: SolveCtx = { facts, locks: lockVars(locks), darija, hints: opts.hints, rng, maxHint };
  const director = opts.hints !== undefined || opts.pins !== undefined;
  const intake = { accepted: new Set<GeneKey>(), pinned: [] as GeneKey[], dropped: [] as { gene: string; value: string; why: HintDropReason }[] };

  // bold locks (vocabulary-checked) and the one pin (a second is dropped, DES N9)
  const boldLock: Partial<Record<BoldGene, string>> = {};
  for (const g of BOLD_ORDER) if (locks[g] !== undefined) boldLock[g] = locks[g]!;
  let pin: { gene: BoldGene; value: string } | null = null;
  for (const [g, v] of Object.entries(opts.pins ?? {}) as [BoldGene, string][]) {
    const value = (BOLD_ORDER as readonly string[]).includes(g) ? parseGeneValue(g, v) : null;
    if (value === null) intake.dropped.push({ gene: String(g).slice(0, 24), value: String(v).slice(0, 60), why: "vocab" });
    else if (pin) intake.dropped.push({ gene: g, value, why: "second_pin" });
    else if (boldLock[g] !== undefined && boldLock[g] !== value) intake.dropped.push({ gene: g, value, why: "pin" });
    else pin = { gene: g, value };
  }

  const drawBold = (withPin: boolean): Required<Bold> | null => {
    const fixed: Partial<Record<BoldGene, string>> = { ...boldLock };
    if (withPin && pin) fixed[pin.gene] = pin.value;
    let B: Bold = {};
    for (const gene of BOLD_ORDER) {
      if (gene === "G1" && fixed.G1 === undefined) {
        // G1: the forced archetype, else the direction's archetype (best fit for direction 1, drawn for 2 and 3)
        const forced = input.archetype;
        const hinted = opts.hints?.G1;
        const drawn = directionArchetype(input, hinted, maxHint);
        if (!forced) for (const h of hinted ?? []) (drawn.pool.includes(h.value as Archetype) ? intake.accepted.add("G1") : intake.dropped.push({ gene: "G1", value: h.value, why: "hard_rule" }));
        const want = forced ?? drawn.archetype;
        const ok = !validBold("G1", want, B, c, fixed);
        const order = [want, ...(input.ranked.length ? input.ranked.map((r) => r.archetype) : ARCHETYPES)];
        const v = ok ? want : order.find((x) => !validBold("G1", x, B, c, fixed));
        if (!v) return null;
        B = withBold(B, "G1", v);
        continue;
      }
      if (fixed[gene] !== undefined) {
        const v = fixed[gene]!;
        // a lock is the value whatever (the owner's statement); a pin must pass the rules
        if (withPin && pin?.gene === gene && boldLock[gene] === undefined && validBold(gene, v, B, c, fixed)) return null;
        B = withBold(B, gene, v);
        if (gene === "G4" && !B.G4) return null;
        continue;
      }
      const values = pinsAllow(gene, BOLD_VALUES(gene, B), opts.priors);
      const reasons = new Map<string, Reason | null>(values.map((v) => [v, validBold(gene, v, B, c, fixed)]));
      const valid = values.filter((v) => reasons.get(v) === null);
      // a genePins pin list that the hard rules refuse entirely is ignored (AI-§G.5)
      const all = valid.length ? valid : BOLD_VALUES(gene, B).filter((v) => !validBold(gene, v, B, c, fixed) && !opts.priors?.pins?.[gene]?.ban?.includes(v));
      if (!all.length) return null;
      for (const h of opts.hints?.[gene as keyof GeneHints] ?? []) {
        const why = reasons.get(h.value);
        if (why === undefined && !values.includes(h.value)) intake.dropped.push({ gene, value: h.value, why: "hard_rule" });
        else if (why) intake.dropped.push({ gene, value: h.value, why });
        else intake.accepted.add(gene);
      }
      const v = pick(rng(gene), boldWeights(gene, all, B, input, opts, maxHint), all);
      B = withBold(B, gene, v);
    }
    return B as Required<Bold>;
  };

  let B = drawBold(true);
  if (pin) {
    if (B) intake.pinned.push(pin.gene);
    else {
      intake.dropped.push({ gene: pin.gene, value: pin.value, why: "pin" });
      B = drawBold(false);
    }
  }
  // hints on locked bold genes are dropped as locked
  for (const g of BOLD_ORDER) {
    if (boldLock[g] === undefined) continue;
    for (const h of opts.hints?.[g as keyof GeneHints] ?? []) if (h.value !== boldLock[g]) intake.dropped.push({ gene: g, value: h.value, why: "locked" });
  }

  const stats: SampleStats = { expansions: 0, relaxed: false, fallback: false };
  let A: Map<VarKey, Val> | null = null;
  if (B) {
    const budget = { left: MAX_EXPANSIONS, used: 0 };
    A = solveVars(B, { ...c, register: B.G28 }, budget);
    stats.expansions = budget.used;
    if (!A && boldLock.G28 === undefined) {
      // relax the last bold gene to its archetype default and solve once more (DES-§4.4)
      stats.relaxed = true;
      B = { ...B, G28: topRegister(B.G1) };
      const again = { left: MAX_EXPANSIONS, used: 0 };
      A = solveVars(B, { ...c, register: B.G28 }, again);
      stats.expansions += again.used;
    }
  }

  // hints on G10 / G16 / G20 (solved genes): dropped when the rules or a lock leave no room for them
  for (const gene of ["G10", "G16", "G20"] as const) {
    for (const h of opts.hints?.[gene] ?? []) {
      const k: VarKey = gene === "G20" ? "G20.l" : gene;
      const v: Val = gene === "G20" ? h.value.split("/")[0]! : Number(h.value);
      const locked = c.locks.has(k) && c.locks.get(k) !== v;
      const ok = B ? domainOf(k, B, { ...c, register: B.G28 }).includes(v) : false;
      if (locked) intake.dropped.push({ gene, value: h.value, why: "locked" });
      else if (!ok) intake.dropped.push({ gene, value: h.value, why: "hard_rule" });
      else intake.accepted.add(gene);
    }
  }

  let genome: DesignGenome;
  if (!B || !A) {
    stats.fallback = true;
    genome = fallbackGenome(input, seed, locks, B);
  } else {
    const brand: BrandGenes = {
      G1: B.G1,
      G4: B.G4.id,
      G5: { rm: A.get("G5.rm") as number, rd: A.get("G5.rd") as number, dmax: A.get("G5.dmax") as number },
      G6: { w: B.G4.displayWeight, wAr: B.G4.displayWeightAr, tk: A.get("G6.tk") as number },
      G7: { dc: A.get("G7.dc") as BrandGenes["G7"]["dc"], lb: A.get("G7.lb") as BrandGenes["G7"]["lb"] },
      G8: A.get("G8") as BrandGenes["G8"],
      G9: B.G9,
      G11: A.get("G11") as BrandGenes["G11"],
      G12: A.get("G12") as BrandGenes["G12"],
      G13: A.get("G13") as BrandGenes["G13"],
      G14: { w: A.get("G14.w") as BrandGenes["G14"]["w"], s: A.get("G14.s") as number },
      G15: A.get("G15") as BrandGenes["G15"],
      G17: A.get("G17") as BrandGenes["G17"],
      G23: { f: B.G23, d: A.get("G23.d") as number, r: (A.get("G23.r") as string).split("+") as BrandGenes["G23"]["r"], st: A.get("G23.st") as number, sc: A.get("G23.sc") as boolean },
      G25: { gl: A.get("G25.gl") as BrandGenes["G25"]["gl"], nb: A.get("G25.nb") as BrandGenes["G25"]["nb"], cap: A.get("G25.cap") as BrandGenes["G25"]["cap"] },
      G26: A.get("G26") as BrandGenes["G26"],
      G27: A.get("G27") as BrandGenes["G27"],
      G28: B.G28,
      G30: { mw: A.get("G30.mw") as number, ex: A.get("G30.ex") as 0 | 1 },
      G31: A.get("G31") as BrandGenes["G31"],
    };
    const page: PageGenes = {
      G2: B.G2,
      G3: { c: A.get("G3.c") as PageGenes["G3"]["c"], s: A.get("G3.s") as PageGenes["G3"]["s"], m: A.get("G3.m") as PageGenes["G3"]["m"], w: A.get("G3.w") as number, u: A.get("G3.u") as 4 | 8 },
      G10: A.get("G10") as number,
      G16: A.get("G16") as 0 | 1 | 2,
      G18: B.G18,
      G20: { l: A.get("G20.l") as PageGenes["G20"]["l"], p: A.get("G20.p") as PageGenes["G20"]["p"] },
      G21: A.get("G21") as number,
      G22: A.get("G22") as PageGenes["G22"],
      // the rhythm genes and the expansion record are solved by the choreography step (DES-§5.5 step 3)
      G24: { seq: [], moments: [], cross: null, signature: 0 },
      G32: { budget: 0, openers: [] },
      G33: { max: 3, uses: {} },
      G34: { primary: [], headerHidesInHero: true, floatCollapses: true },
      G35: { scope: "heads", kinds: [...brand.G23.r], nodes: 0 },
      angle: A.get("angle") as Angle,
    };
    const why = whyKeys(B, facts, input, voiceLocked, brand.G31);
    if (stats.relaxed) why.splice(5, why.length, "relaxed");
    genome = { v: 1, seed, priorsV: input.priorsV, brand, page, sections: [], why: why.slice(0, 6) };
  }
  if (director) genome.hints = { from: "director", accepted: [...intake.accepted], pinned: intake.pinned, dropped: intake.dropped.slice(0, 40) };
  return { genome, stats };
}

/** The archetype's back-derived genome with the locks applied (the fallback of DES-§4.4; why = ["fallback"]). */
function fallbackGenome(input: SampleInput, seed: number, locks: Partial<Record<GeneKey, string>>, B: Bold | null): DesignGenome {
  const archetype = (locks.G1 as Archetype | undefined) ?? input.archetype ?? B?.G1 ?? directionArchetype(input).archetype;
  const lockedPairing = locks.G4 ? loadCatalogue().byId.get(locks.G4) : undefined;
  const pairing = lockedPairing ?? pairingsFor(archetype).find((x) => !(NEVER_DISPLAY_AR as readonly string[]).includes(x.pairing.displayAr))?.pairing;
  const { brand, page } = archetypeGenes(archetype, {
    market: input.market,
    locale: input.locale,
    pairing: pairing ? { id: pairing.id, displayWeight: pairing.displayWeight, displayWeightAr: pairing.displayWeightAr, accent: pairing.accent } : undefined,
    alpha: hasAlpha(input.photos),
  });
  for (const g of ["G9", "G12", "G17", "G26", "G27", "G28", "G31"] as const) {
    const v = locks[g];
    if (v !== undefined) (brand as unknown as Record<string, string>)[g] = v;
  }
  if (locks.G23) brand.G23 = { ...brand.G23, f: locks.G23 as EaseFamily };
  page.G10 = Math.min(COLOR_PLANS[brand.G9].area[1], Math.max(COLOR_PLANS[brand.G9].area[0], page.G10));
  return { v: 1, seed, priorsV: input.priorsV, brand, page, sections: [], why: ["fallback"] };
}

/* ------------------------------------------------------------------ */
/* the hard-rule audit (tests, the console)                            */
/* ------------------------------------------------------------------ */

/**
 * Every genome-level hard rule a genome breaks for its inputs (H01-H23, H27, H33's display roster, H36, the strategy
 * surfaces of H26, the register rhythm of DES-§9.10); [] when it is clean. H24 / H25 / H34 need the palette (compile.ts).
 */
export function hardViolations(g: DesignGenome, input: Pick<SampleInput, "mood" | "locale" | "photos" | "brand">): string[] {
  const f = factsOf(input);
  const out: string[] = [];
  const pairing = loadCatalogue().byId.get(g.brand.G4);
  const B: Bold = { G1: g.brand.G1, G2: g.page.G2, G9: g.brand.G9, G4: pairing, G18: g.page.G18, G23: g.brand.G23.f, G28: g.brand.G28 };
  for (const gene of BOLD_ORDER) {
    const v = gene === "G4" ? g.brand.G4 : gene === "G23" ? g.brand.G23.f : gene === "G2" || gene === "G18" ? g.page[gene] : g.brand[gene as "G1" | "G9" | "G28"];
    if (gene === "G4" && !pairing) {
      out.push(`G4 ${v}: not a loaded catalogue pairing`);
      continue;
    }
    // each rule against the full set of bold choices
    const r = boldRule(gene, v, gene === "G1" ? {} : B, f);
    if (r) out.push(`${gene} ${v}: ${r}`);
  }
  const c: SolveCtx = { facts: f, locks: new Map(), register: g.brand.G28, darija: g.brand.G31, rng: () => () => 0, maxHint: 3 };
  const A = new Map<VarKey, Val>([
    ["G3.c", g.page.G3.c], ["G3.s", g.page.G3.s], ["G3.m", g.page.G3.m], ["G3.w", g.page.G3.w], ["G3.u", g.page.G3.u],
    ["G5.rm", g.brand.G5.rm], ["G5.rd", g.brand.G5.rd], ["G5.dmax", g.brand.G5.dmax], ["G6.tk", g.brand.G6.tk],
    ["G7.dc", g.brand.G7.dc], ["G7.lb", g.brand.G7.lb], ["G8", g.brand.G8], ["G10", g.page.G10], ["G11", g.brand.G11],
    ["G12", g.brand.G12], ["G13", g.brand.G13], ["G14.w", g.brand.G14.w], ["G14.s", g.brand.G14.s], ["G15", g.brand.G15],
    ["G16", g.page.G16], ["G17", g.brand.G17], ["G20.l", g.page.G20.l], ["G20.p", g.page.G20.p], ["G21", g.page.G21],
    ["G22", g.page.G22], ["G23.d", g.brand.G23.d], ["G23.r", g.brand.G23.r.join("+")], ["G23.st", g.brand.G23.st],
    ["G23.sc", g.brand.G23.sc], ["G25.gl", g.brand.G25.gl], ["G25.nb", g.brand.G25.nb], ["G25.cap", g.brand.G25.cap],
    ["G26", g.brand.G26], ["G27", g.brand.G27], ["G30.mw", g.brand.G30.mw], ["G30.ex", g.brand.G30.ex], ["G31", g.brand.G31], ["angle", g.page.angle],
  ]);
  for (const [k, v] of A) {
    if (k === "G31") continue; // the owner's choice (store_ai) or the market default; any value is valid
    if (!unaryOk(k, v, B, f, c)) out.push(`${k} ${String(v)}: hard rule`);
  }
  for (const r of BINARY) if (!r.ok(A.get(r.a)!, A.get(r.b)!)) out.push(`${r.a} ${String(A.get(r.a))} × ${r.b} ${String(A.get(r.b))}: hard rule`);
  if (g.brand.G6.w !== pairing?.displayWeight || g.brand.G6.wAr !== pairing?.displayWeightAr) out.push("G6: weights differ from the pairing's (F15)");
  return out;
}

/* ------------------------------------------------------------------ */
/* repulsion (DES-§4.4, DES-§7.9 step 2)                               */
/* ------------------------------------------------------------------ */

/** One candidate of a run: its sample inputs and options, and the genome they produced. */
export interface RepelCandidate {
  input: SampleInput;
  opts?: SampleOpts;
  genome: DesignGenome;
}

/**
 * Greedy maximin over a run's candidates (QUAL-3), ≤ 6 iterations, before any band is asked for. `refs` are the
 * store's own recent views and the synthetic crowd view of the niche (`crowdView`, never another store's vector);
 * the other candidates of the run are references too. Each iteration finds the (candidate, reference) pair with the
 * smallest distance and re-samples, in that candidate, the one unlocked bold gene whose next-best valid value most
 * increases the candidate's minimum distance (rng stream "genome:repulse:" + k orders the ties); it stops when the
 * minimum reaches τ + 0.05 or no move improves it. `viewOf` compiles a genome to its distance view (the caller's
 * palette and locale).
 */
export function repel(candidates: readonly RepelCandidate[], refs: readonly DistanceView[], tau: number, viewOf: (g: DesignGenome, c: RepelCandidate) => DistanceView): { candidates: RepelCandidate[]; iterations: number; min: number } {
  const cur = candidates.map((c) => ({ ...c }));
  let views = cur.map((c) => viewOf(c.genome, c));
  const minFor = (i: number, v: DistanceView) => {
    let m = 1;
    for (const r of refs) m = Math.min(m, genomeDistance(v, r));
    views.forEach((w, j) => {
      if (j !== i) m = Math.min(m, genomeDistance(v, w));
    });
    return m;
  };
  const overall = () => Math.min(1, ...views.map((v, i) => minFor(i, v)));
  let min = overall();
  let iterations = 0;
  for (; iterations < 6 && min < tau + 0.05; iterations++) {
    // the closest candidate
    let worst = 0;
    let worstD = 2;
    views.forEach((v, i) => {
      const d = minFor(i, v);
      if (d < worstD) [worst, worstD] = [i, d];
    });
    const c = cur[worst]!;
    const rng = rngFor(c.genome.seed, `genome:repulse:${iterations}`);
    let best: { cand: RepelCandidate; view: DistanceView; d: number } | null = null;
    const locked = { ...brandLocks(c.input.brand), ...(c.opts?.locks ?? {}) };
    const genes = (["G2", "G9", "G18", "G4", "G23", "G28"] as const).filter((g) => locked[g] === undefined && c.opts?.pins?.[g] === undefined);
    // Fisher-Yates over the rng stream: the gene order of the ties (a comparator sort with rng() is engine-dependent)
    const order = [...genes];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    for (const gene of order) {
      const current = gene === "G4" ? c.genome.brand.G4 : gene === "G23" ? c.genome.brand.G23.f : gene === "G2" || gene === "G18" ? c.genome.page[gene] : c.genome.brand[gene];
      const facts = factsOf(c.input);
      const B: Bold = { G1: c.genome.brand.G1, G2: c.genome.page.G2, G9: c.genome.brand.G9 };
      // the next-best values under the H-rules, by the gene's prior
      const prior = priorFor(gene, { archetype: c.genome.brand.G1, grammar: c.genome.page.G2, alpha: hasAlpha(c.input.photos), ranked: c.input.ranked });
      const tries = Object.keys(prior)
        .filter((v) => v !== current && !boldRule(gene, v, gene === "G2" ? { G1: B.G1 } : B, facts))
        .sort((x, y) => prior[y]! - prior[x]!)
        .slice(0, 2);
      for (const v of tries) {
        const opts: SampleOpts = { ...c.opts, locks: { ...(c.opts?.locks ?? {}), [gene]: v } };
        const genome = sampleGenome(c.input, opts);
        const view = viewOf(genome, { ...c, genome });
        const d = minFor(worst, view);
        if (!best || d > best.d) best = { cand: { input: c.input, opts, genome }, view, d };
      }
    }
    if (!best || best.d <= worstD + 1e-9) break;
    cur[worst] = best.cand;
    views = views.map((v, i) => (i === worst ? best!.view : v));
    min = overall();
  }
  return { candidates: cur, iterations, min };
}

/** One direction's genome (DES-§4.4), deterministic per (seed, inputs, priorsV, hints). */
export function sampleGenome(input: SampleInput, opts: SampleOpts = {}): DesignGenome {
  return sampleGenomeWithStats(input, { priors: BASE_PRIORS, ...opts }).genome;
}

export type { NicheShares };
