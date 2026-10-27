/**
 * The Design Genome types (P6 DESIGN; design.md DES-§4.1, DES-§4.4; docs/STORE-SAAS.md §K.2 P0 design stubs). Pure
 * and isomorphic. Typed at P0 so P7 (Director briefs, cards) and the core build against them before P6 merges; P6
 * adds `packGenome` / `unpackGenome` / `DesignGenomeSchema` here and never renames or re-types a frozen export (CCR).
 * The vocabulary of `ThemeSpec.look` (grammars, strategies, treatments, …) lives in src/lib/page/schema.ts (DES-R1)
 * and is re-exported, so the doc contract and the genome name one list each.
 */
import type { Archetype, ColorStrategy, Depth, EaseFamily, Grammar, Ladder, Locale, Market, Mask, Reveal, Treatment } from "@/lib/page/schema";
import type { MoodReading } from "@/lib/generator/mood";
import type { RankedDirection } from "@/lib/generator/directions";
import type { BrandSetting } from "@/lib/settings/keys/brand";
import type { GeneHints } from "./hints";
import type { NicheShares } from "./novelty.server";
import type { PhotoFacts } from "./photo-facts";

export { COLOR_STRATEGIES, DEPTHS, EASE_FAMILIES, GRAMMARS, LADDERS, MASKS, REVEALS, TREATMENTS } from "@/lib/page/schema";
export type { Archetype, ColorStrategy, Depth, EaseFamily, Grammar, Ladder, Mask, Reveal, Treatment } from "@/lib/page/schema";

export const VOICE_REGISTERS = ["plain", "warm", "precise", "bold", "poetic-restrained"] as const;
export const HEADLINE_STRUCTURES = ["noun-phrase", "imperative", "question", "number-led", "contrast-pair", "quote-led", "word-subline"] as const;
/** copy angle (ai.md CopyRequest v2) */
export const ANGLES = ["benefit", "problem", "ritual", "gift", "value", "proof", "origin"] as const;
/** DES-§5.8 (C5) */
export const OPENERS = ["bare", "caption", "number", "quote", "image", "kicker"] as const;
/** the G19 aspect set (DES-§4.2) */
export const ASPECTS = ["4:5", "3:4", "1:1", "2:3", "16:9", "21:9"] as const;

export type VoiceRegister = (typeof VOICE_REGISTERS)[number];
export type HeadlineStructure = (typeof HEADLINE_STRUCTURES)[number];
export type Angle = (typeof ANGLES)[number];
export type Opener = (typeof OPENERS)[number];
export type Aspect = (typeof ASPECTS)[number];
/** DG-15 (R3): `stack`, `split(r)`, `overlap(dx, dy)`, `hang`, `bleed(edge)`, `index` (DES-§6.1); P6 / D4 narrow it */
export type Arrangement = string;

export type GeneKey = `G${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35}`;
/** rev 3: G23 (its family G23.f) is the seventh bold gene (DS3, UX-6) */
export type BoldGene = "G1" | "G2" | "G4" | "G9" | "G18" | "G23" | "G28";
/** rev 2: solved from the plan, never sampled (DS1) */
export type RhythmGene = "G32" | "G33" | "G34" | "G35";
export type GeneLevel = "brand" | "page" | "section";
/** DES-§5.10 (I1, I2) */
export type PhotoRole = "hero" | "detail" | "context" | "proof" | "offer" | "thumb";
export interface PhotoPlan {
  max: 3;
  uses: Record<string /* assetId */, { role: PhotoRole; aspect: Aspect; crop: "full" | "tight" | "context" | "bleed"; section: string }[]>;
}
export interface CtaPlan {
  /** section ids carrying a primary CTA, ≤ 6 incl. "sticky" */
  primary: string[];
  headerHidesInHero: true;
  floatCollapses: boolean;
}
export interface RevealPlan {
  scope: "heads" | "hero" | "none";
  /** 1-2 */
  kinds: Reveal[];
  /** estimate ≤ 60 */
  nodes: number;
}

export interface BrandGenes {
  G1: Archetype;
  G4: string;
  G5: { rm: number; rd: number; dmax: number };
  G6: { w: number; wAr: number; tk: number };
  G7: { dc: "none" | "uppercase"; lb: "mono" | "smallcaps" | "plain" };
  G8: "lining" | "oldstyle";
  G9: ColorStrategy;
  G11: "standard" | "high";
  G12: Ladder;
  G13: "circle" | "squircle";
  G14: { w: 0 | 1 | 1.5; s: number };
  G15: Depth;
  G17: Mask;
  /** f is sampled (bold, prior conditioned on G2, DES-§4.12); d, r, st, sc are solved */
  G23: { f: EaseFamily; d: number; r: Reveal[]; st: number; sc: boolean };
  G25: { gl: "dot" | "spark" | "diamond" | "none"; nb: "none" | "plain" | "padded"; cap: "mono" | "smallcaps" | "italic-serif" | "plain" };
  G26: "none" | "swoosh" | "highlight" | "color" | "italic";
  G27: "solid" | "pill" | "soft" | "outline" | "underline" | "glow";
  G28: VoiceRegister;
  /** mean words per sentence, exclamations allowed */
  G30: { mw: number; ex: 0 | 1 };
  /** Darija ratio */
  G31: "none" | "cta" | "light";
}

export interface PageGenes {
  G2: Grammar;
  G3: { c: 4 | 8 | 12; s: "1:1" | "5:7" | "4:8" | "3:9" | "golden"; m: "narrow" | "wide" | "offset"; w: number; u: 4 | 8 };
  /** accent area 0.03-0.35 */
  G10: number;
  /** glass budget */
  G16: 0 | 1 | 2;
  G18: Treatment;
  G20: { l: "airy" | "balanced" | "dense"; p: "ABAC" | "AAB" | "ABAB" };
  /** section spacing multiplier 0.75-1.6 */
  G21: number;
  G22: "start" | "mixed" | "center-statement";
  /** DES-§5 expansion record */
  G24: { seq: string[]; moments: number[]; cross: number | null; signature: number };
  /** kicker budget ⌈n/3⌉ and the opener per in-flow section (DES-§5.8) */
  G32: { budget: number; openers: Opener[] };
  G33: PhotoPlan;
  G34: CtaPlan;
  G35: RevealPlan;
  angle: Angle;
}

export interface SectionGene {
  id: string;
  type: string;
  variant: string;
  G19?: { a: Aspect; f: "thirds" | "center" | "bleed" };
  G29?: HeadlineStructure;
  arrange?: Arrangement;
}

/** `why` of a dropped Director hint or pin (DES-§4.6; core §K.2 P0: a pin that failed the H-rules / photo facts / locks is "pin") */
export type HintDropReason = "vocab" | "hard_rule" | "locked" | "photo" | "pin" | "second_pin";

export interface DesignGenome {
  v: 1;
  /** sampling seed (deriveSeed(brandSeed, inputHash, …), DS5) */
  seed: number;
  /** the priors snapshot the sample used; stored in design_genomes.priors_v (QUAL-26) */
  priorsV: string;
  brand: BrandGenes;
  page: PageGenes;
  /** ≤ 40 */
  sections: SectionGene[];
  /** explanation chip keys (DES-§4.8), ≤ 6 */
  why: string[];
  /** rev 4: = HintIntake (DES-§4.6) */
  hints?: { from: "director"; accepted: GeneKey[]; pinned: GeneKey[]; dropped: { gene: string; value: string; why: HintDropReason }[] };
}

/** The bold-gene prior weights a sample used (DES-§4.3; R3 adds the learned snapshot). P6 owns the shape. */
export type PriorsSnapshot = { v: string; weights: Partial<Record<BoldGene, Record<string, number>>> };

/** rev 4 (core §K.2 P0 stub shape): the options of sampleGenome; pins are an option of their own, not part of GeneHints. */
export interface SampleOpts {
  hints?: GeneHints;
  /** ≤ 1 key: one pinned bold gene per direction (QUAL-10, DES N9) */
  pins?: Partial<Record<BoldGene, string>>;
  priors?: PriorsSnapshot;
  locks?: Partial<Record<GeneKey, string>>;
}

/** DES-§4.4: what one direction's sample reads (`seed = deriveSeed(hash32(brandSeed + "|" + inputHash), "direction:" + i + ":" + attempt)`). */
export interface SampleInput {
  archetype?: Archetype;
  brandSeed: string;
  inputHash: string;
  directionIndex: 0 | 1 | 2;
  attempt: number;
  mood: MoodReading;
  locale: Locale;
  market: Market;
  photos: PhotoFacts;
  niche: string;
  brand: BrandSetting | null;
  ranked: RankedDirection[];
  shares: NicheShares | null;
  priorsV: string;
}
