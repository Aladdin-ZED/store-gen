/**
 * The Design Genome types, schema and compact storage form (P6 DESIGN; design.md DES-§4.1, DES-§4.4, DES-§2.1;
 * docs/STORE-SAAS.md §K.2 P0 design stubs). Pure and isomorphic. Typed at P0 so P7 (Director briefs, cards) and the
 * core build against them before P6 merges; the frozen exports keep their names and shapes (src/lib/contracts/r1-p0.ts).
 * The vocabulary of `ThemeSpec.look` (grammars, strategies, treatments, …) lives in src/lib/page/schema.ts (DES-R1)
 * and is re-exported, so the doc contract and the genome name one list each.
 *
 * `DesignGenomeSchema` is strict and takes every value from GENE_VOCAB (ranges are checked against their bounds, not
 * their steps, so a back-derived container of 1,180 px stays a valid reading). `packGenome` / `unpackGenome` are the
 * `design_genomes.genome` column (≤ 1,200 B): short keys (the gene number), numbers rounded to 3 decimals, section
 * variants as their append-only tokens and the photo and CTA plans as section indices, the page meta (priorsV, angle,
 * why, hints) under the page record.
 */
import { z } from "zod";
import {
  ARCHETYPES,
  COLOR_STRATEGIES,
  DEPTHS,
  EASE_FAMILIES,
  GRAMMARS,
  LADDERS,
  MASKS,
  REVEALS,
  TREATMENTS,
  type Archetype,
  type ColorStrategy,
  type Depth,
  type EaseFamily,
  type Grammar,
  type Ladder,
  type Locale,
  type Market,
  type Mask,
  type Reveal,
  type Treatment,
} from "@/lib/page/schema";
import type { MoodReading } from "@/lib/generator/mood";
import type { RankedDirection } from "@/lib/generator/directions";
import type { BrandSetting } from "@/lib/settings/keys/brand";
import type { GenomeCompact } from "@/lib/db/schema";
import { ANGLES, ASPECTS, CROPS, FIXED_TYPES, HEADLINE_STRUCTURES, OPENERS, PHOTO_ROLES, VOICE_REGISTERS } from "./consts";
import type { GeneHints } from "./hints";
import type { NicheShares } from "./novelty.server";
import { catalogueRows } from "./pairings";
import type { PhotoFacts } from "./photo-facts";
import { sectionToken, SECTION_TOKENS } from "./tokens-table";
import { ALIGN_BIASES, BUTTONS, CAPTIONS, DARIJA, DENSITY_LEVELS, DENSITY_PATTERNS, EMPHASES, GLYPHS, LABELS, MARGINS, NUMBERINGS, REVEAL_SCOPES, SPLITS } from "./vocab";

export { COLOR_STRATEGIES, DEPTHS, EASE_FAMILIES, GRAMMARS, LADDERS, MASKS, REVEALS, TREATMENTS } from "@/lib/page/schema";
export type { Archetype, ColorStrategy, Depth, EaseFamily, Grammar, Ladder, Mask, Reveal, Treatment } from "@/lib/page/schema";
export { ANGLES, ASPECTS, HEADLINE_STRUCTURES, OPENERS, VOICE_REGISTERS } from "./consts";
export type { GenomeCompact } from "@/lib/db/schema";

export type VoiceRegister = (typeof VOICE_REGISTERS)[number];
export type HeadlineStructure = (typeof HEADLINE_STRUCTURES)[number];
export type Angle = (typeof ANGLES)[number];
export type Opener = (typeof OPENERS)[number];
export type Aspect = (typeof ASPECTS)[number];
/** DG-15 (R3): `stack`, `split(r)`, `overlap(dx, dy)`, `hang`, `bleed(edge)`, `index` (DES-§6.1); P6 / D4 narrow it */
export type Arrangement = string;

export type GeneKey = `G${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35}`;
/** The 35 gene keys in table order. */
export const GENE_KEYS = Array.from({ length: 35 }, (_, i) => `G${i + 1}`) as GeneKey[];
/** rev 3: G23 (its family G23.f) is the seventh bold gene (DS3, UX-6) */
export type BoldGene = "G1" | "G2" | "G4" | "G9" | "G18" | "G23" | "G28";
export const BOLD_GENES = ["G1", "G2", "G4", "G9", "G18", "G23", "G28"] as const satisfies readonly BoldGene[];
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

/**
 * The bold-gene prior weights a sample used (DES-§4.3). `weights` are the learned multipliers (R3, ai.md AI-13: value →
 * factor, absent = 1); `pins` is `platform_ai.genePins` (a ban sets the weight 0, a pin list is the only allowed
 * values unless a hard rule refuses every one of them, AI-§G.5). P6 owns the shape.
 */
export type PriorsSnapshot = {
  v: string;
  weights: Partial<Record<BoldGene, Record<string, number>>>;
  pins?: Partial<Record<string, { pin?: readonly string[]; ban?: readonly string[] }>>;
};

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

/** A genome value outside the vocabulary (unpack, the strict schema). */
export class GenomeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenomeError";
  }
}

/* ------------------------------------------------------------------ */
/* the strict schema                                                   */
/* ------------------------------------------------------------------ */

/** Every catalogue id, the pending DES-R21 rows included (a stored genome stays valid whatever the font manifest), and "custom". */
const PAIRING_IDS: ReadonlySet<string> = new Set([...catalogueRows().map((r) => r.row.id), "custom"]);
export const isPairingValue = (v: string) => PAIRING_IDS.has(v);

const num = (min: number, max: number) => z.number().min(min).max(max);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const GeneKeyZ = z.enum(GENE_KEYS as [GeneKey, ...GeneKey[]]);
const SectionIdZ = z.string().min(1).max(64);

const BrandGenesZ = z
  .object({
    G1: z.enum(ARCHETYPES),
    G4: z.string().max(40).refine(isPairingValue, "unknown pairing"),
    G5: z.object({ rm: num(1.125, 1.25), rd: num(1.2, 1.5), dmax: int(48, 160) }).strict(),
    G6: z.object({ w: int(100, 900), wAr: int(100, 900), tk: num(0, 0.03) }).strict(),
    G7: z.object({ dc: z.enum(["none", "uppercase"]), lb: z.enum(LABELS) }).strict(),
    G8: z.enum(["lining", "oldstyle"]),
    G9: z.enum(COLOR_STRATEGIES),
    G11: z.enum(["standard", "high"]),
    G12: z.enum(LADDERS),
    G13: z.enum(["circle", "squircle"]),
    G14: z.object({ w: z.union([z.literal(0), z.literal(1), z.literal(1.5)]), s: num(0.08, 0.3) }).strict(),
    G15: z.enum(DEPTHS),
    G17: z.enum(MASKS),
    G23: z.object({ f: z.enum(EASE_FAMILIES), d: int(180, 900), r: z.array(z.enum(REVEALS)).min(1).max(2), st: int(30, 80), sc: z.boolean() }).strict(),
    G25: z.object({ gl: z.enum(GLYPHS), nb: z.enum(NUMBERINGS), cap: z.enum(CAPTIONS) }).strict(),
    G26: z.enum(EMPHASES),
    G27: z.enum(BUTTONS),
    G28: z.enum(VOICE_REGISTERS),
    G30: z.object({ mw: int(5, 14), ex: z.union([z.literal(0), z.literal(1)]) }).strict(),
    G31: z.enum(DARIJA),
  })
  .strict();

const PageGenesZ = z
  .object({
    G2: z.enum(GRAMMARS),
    G3: z
      .object({ c: z.union([z.literal(4), z.literal(8), z.literal(12)]), s: z.enum(SPLITS), m: z.enum(MARGINS), w: int(1080, 1440), u: z.union([z.literal(4), z.literal(8)]) })
      .strict(),
    G10: num(0.03, 0.35),
    G16: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    G18: z.enum(TREATMENTS),
    G20: z.object({ l: z.enum(DENSITY_LEVELS), p: z.enum(DENSITY_PATTERNS) }).strict(),
    G21: num(0.75, 1.6),
    G22: z.enum(ALIGN_BIASES),
    G24: z.object({ seq: z.array(z.string().max(82)).max(40), moments: z.array(int(0, 40)).max(40), cross: int(0, 40).nullable(), signature: int(0, 40) }).strict(),
    G32: z.object({ budget: int(0, 14), openers: z.array(z.enum(OPENERS)).max(40) }).strict(),
    G33: z
      .object({
        max: z.literal(3),
        uses: z.record(z.string().max(64), z.array(z.object({ role: z.enum(PHOTO_ROLES), aspect: z.enum(ASPECTS), crop: z.enum(CROPS), section: SectionIdZ }).strict()).max(3)),
      })
      .strict(),
    G34: z.object({ primary: z.array(SectionIdZ).max(6), headerHidesInHero: z.literal(true), floatCollapses: z.boolean() }).strict(),
    G35: z.object({ scope: z.enum(REVEAL_SCOPES), kinds: z.array(z.enum(REVEALS)).min(1).max(2), nodes: int(0, 60) }).strict(),
    angle: z.enum(ANGLES),
  })
  .strict();

const SectionGeneZ = z
  .object({
    id: SectionIdZ,
    type: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{1,40}$/),
    variant: z.string().regex(/^[a-z0-9-]{1,40}$/),
    G19: z.object({ a: z.enum(ASPECTS), f: z.enum(["thirds", "center", "bleed"]) }).strict().optional(),
    G29: z.enum(HEADLINE_STRUCTURES).optional(),
    arrange: z.string().regex(/^[a-z0-9:(),.-]{1,32}$/).optional(),
  })
  .strict();

const DropReasonZ = z.enum(["vocab", "hard_rule", "locked", "photo", "pin", "second_pin"]);

/** strict; every value from GENE_VOCAB (DES-§4.1) */
export const DesignGenomeSchema: z.ZodType<DesignGenome> = z
  .object({
    v: z.literal(1),
    seed: int(0, 2_147_483_647),
    priorsV: z.string().min(1).max(24),
    brand: BrandGenesZ,
    page: PageGenesZ,
    sections: z.array(SectionGeneZ).max(40),
    why: z.array(z.string().regex(/^[a-z][a-zA-Z0-9.]{1,47}$/)).max(6),
    hints: z
      .object({
        from: z.literal("director"),
        accepted: z.array(GeneKeyZ).max(10),
        pinned: z.array(GeneKeyZ).max(1),
        dropped: z.array(z.object({ gene: z.string().max(24), value: z.string().max(60), why: DropReasonZ }).strict()).max(40),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Validates a genome; throws GenomeError naming the first value outside the vocabulary. */
export function assertGenome(g: unknown): DesignGenome {
  const r = DesignGenomeSchema.safeParse(g);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new GenomeError(`genome: ${i ? `${i.path.join(".")}: ${i.message}` : "invalid"}`);
  }
  return r.data;
}

/* ------------------------------------------------------------------ */
/* the compact storage form (design_genomes.genome, ≤ 1,200 B)         */
/* ------------------------------------------------------------------ */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const idx = <T extends string>(list: readonly T[], v: T) => list.indexOf(v);
const at = <T>(list: readonly T[], i: unknown, what: string): T => {
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= list.length) throw new GenomeError(`genome: unknown ${what} index ${String(i)}`);
  return list[i]!;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string") throw new GenomeError(`genome: ${what} is not a string`);
  return v;
};
const arr = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v)) throw new GenomeError(`genome: ${what} is not a list`);
  return v;
};

/** The `design_genomes.genome` budget (DES-§4.1). */
export const PACK_MAX_BYTES = 1200;
const FOCI = ["thirds", "center", "bleed"] as const;
const DROP_REASONS = ["vocab", "hard_rule", "locked", "photo", "pin", "second_pin"] as const satisfies readonly HintDropReason[];
/** Brand genes (by number) and page genes left out of the compact form when they hold this value (nearly every genome does). */
const BRAND_DEFAULTS: Readonly<Record<string, unknown>> = { 8: "lining", 11: "standard", 13: "circle", 31: "none" };
const PAGE_DEFAULTS: Readonly<Record<string, unknown>> = { 16: 0 };
/** The chip-key namespace of `why` (DES-§4.8), stored as a leading "." (a why key never starts with one). */
const WHY_NS = "design.why.";
/** Reveal kinds as one digit each (REVEALS is a frozen list of src/lib/page/schema.ts). */
const revealCode = (list: readonly Reveal[]) => list.map((r) => idx(REVEALS, r)).join("");
const revealsOf = (code: unknown, what: string): Reveal[] => [...str(code, what)].map((ch) => at(REVEALS, Number(ch), what));
/** A section's "type:variant" as its append-only token (tokens-table.ts), else the text. */
const tvCode = (type: string, variant: string) => {
  const t = sectionToken(type, variant);
  return t >= 0 ? String(t) : `${type}:${variant}`;
};
/** The inverse of tvCode; throws on an unknown token. */
function tvOf(code: string, what: string): [string, string] {
  if (/^\d+$/.test(code)) {
    const tv = SECTION_TOKENS[Number(code)];
    if (!tv) throw new GenomeError(`genome: unknown section token ${code} (${what})`);
    const cut = tv.indexOf(":");
    return [tv.slice(0, cut), tv.slice(cut + 1)];
  }
  const cut = code.indexOf(":");
  if (cut < 1) throw new GenomeError(`genome: ${what} "${code}"`);
  return [code.slice(0, cut), code.slice(cut + 1)];
}
const SECTION_IDX_OF = (tv: string): number | null => {
  const cut = tv.indexOf(":");
  const t = cut > 0 ? sectionToken(tv.slice(0, cut), tv.slice(cut + 1)) : -1;
  return t >= 0 ? t : null;
};
/** The in-flow "type:variant" list of a genome's sections (what G24.seq records when the expansion wrote the sections). */
const flowSeq = (sections: readonly SectionGene[]) => sections.filter((s) => !FIXED_TYPES.has(s.type)).map((s) => `${s.type}:${s.variant}`);

/**
 * Compact storage form (DES-§4.1): short keys (the gene number), numbers rounded to 3 decimals, and the section
 * references packed against the sections list `x`:
 *  - `x[i] = [id or "" when id = type, code, G19, arrange]`: code = the "type:variant" token (tokens-table.ts, else
 *    the text) with ".k" for the G29 index; G19 = aspect and focal indices ("21");
 *  - G24.seq = 1 when it is the in-flow order of `x` (the expansion record of a generated page), else the codes;
 *  - G33 uses = "role aspect crop" indices + the section's index in `x` (":id" when it has none);
 *  - G34.primary = section indices, "sticky" and unknown ids as text;
 *  - reveal kinds (G23.r, G35.kinds) as REVEALS index digits, a dropped hint's reason as its index, the `why` chip
 *    keys without their "design.why." namespace (a leading "."), and G8 / G11 / G13 / G31 / G16 left out at their
 *    usual values (lining, standard, circle, none, 0). Over PACK_MAX_BYTES only the dropped-hint log is cut (its last
 *    entries first), so a stored genome is ≤ 1,200 B whatever the brief.
 */
export function packGenome(g: DesignGenome): GenomeCompact {
  const b = g.brand;
  const p = g.page;
  const brand: Record<string, unknown> = {
    1: b.G1,
    4: b.G4,
    5: [r3(b.G5.rm), r3(b.G5.rd), b.G5.dmax],
    6: [b.G6.w, b.G6.wAr, r3(b.G6.tk)],
    7: [b.G7.dc, b.G7.lb],
    8: b.G8,
    9: b.G9,
    11: b.G11,
    12: b.G12,
    13: b.G13,
    14: [b.G14.w, r3(b.G14.s)],
    15: b.G15,
    17: b.G17,
    23: [b.G23.f, b.G23.d, revealCode(b.G23.r), b.G23.st, b.G23.sc ? 1 : 0],
    25: [b.G25.gl, b.G25.nb, b.G25.cap],
    26: b.G26,
    27: b.G27,
    28: b.G28,
    30: [b.G30.mw, b.G30.ex],
    31: b.G31,
  };
  const sectionAt = new Map<string, number>();
  g.sections.forEach((s, i) => {
    if (!sectionAt.has(s.id)) sectionAt.set(s.id, i);
  });
  const ref = (id: string) => {
    const i = sectionAt.get(id);
    return i === undefined ? `:${id}` : String(i);
  };
  const uses = Object.entries(p.G33.uses).map(([asset, list]) => [
    asset,
    ...list.map((u) => `${idx(PHOTO_ROLES, u.role)}${idx(ASPECTS, u.aspect)}${idx(CROPS, u.crop)}${ref(u.section)}`),
  ]);
  // the expansion record: 1 when it is the sections' in-flow order, else tokens (numbers) and unknown entries as text
  const seq = JSON.stringify(p.G24.seq) === JSON.stringify(flowSeq(g.sections)) ? 1 : p.G24.seq.map((tv) => SECTION_IDX_OF(tv) ?? tv);
  const page: Record<string, unknown> = {
    2: p.G2,
    3: [p.G3.c, p.G3.s, p.G3.m, p.G3.w, p.G3.u],
    10: r3(p.G10),
    16: p.G16,
    18: p.G18,
    20: [p.G20.l, p.G20.p],
    21: r3(p.G21),
    22: p.G22,
    24: [seq, p.G24.moments, p.G24.cross, p.G24.signature],
    32: [p.G32.budget, p.G32.openers.map((o) => idx(OPENERS, o)).join("")],
    33: uses,
    34: [p.G34.primary.map((id) => (id !== "sticky" && sectionAt.has(id) ? sectionAt.get(id)! : id)), p.G34.floatCollapses ? 1 : 0],
    35: [p.G35.scope, revealCode(p.G35.kinds), p.G35.nodes],
    an: p.angle,
    pv: g.priorsV,
    y: g.why.map((w) => (w.startsWith(WHY_NS) ? `.${w.slice(WHY_NS.length)}` : w)),
  };
  for (const [k, v] of Object.entries(BRAND_DEFAULTS)) if (brand[k] === v) delete brand[k];
  for (const [k, v] of Object.entries(PAGE_DEFAULTS)) if (page[k] === v) delete page[k];
  if (g.hints) page.hi = [g.hints.accepted, g.hints.pinned, g.hints.dropped.map((d) => [d.gene, d.value, idx(DROP_REASONS, d.why)])];
  const x = g.sections.map((s): [string, string, string?, string?] => {
    const code = `${tvCode(s.type, s.variant)}${s.G29 ? `.${idx(HEADLINE_STRUCTURES, s.G29)}` : ""}`;
    const g19 = s.G19 ? `${idx(ASPECTS, s.G19.a)}${idx(FOCI, s.G19.f)}` : "";
    const t: [string, string, string?, string?] = [s.id === s.type ? "" : s.id, code];
    if (g19 || s.arrange) t.push(g19);
    if (s.arrange) t.push(s.arrange);
    return t;
  });
  const out: GenomeCompact = { v: 1, s: g.seed, b: brand, p: page, x };
  // the budget: a Director brief can drop many values, and that log is cut from its end first (the render, the
  // distance and the novelty service never read it; the sampled genome the wizard logs keeps every entry)
  const hi = page.hi as [GeneKey[], GeneKey[], unknown[]] | undefined;
  while (hi && hi[2].length && JSON.stringify(out).length > PACK_MAX_BYTES) hi[2].pop();
  return out;
}

/** The genome of a compact row; throws GenomeError on an unknown value (the strict schema decides). */
export function unpackGenome(c: GenomeCompact): DesignGenome {
  if (!c || c.v !== 1 || !c.b || typeof c.b !== "object" || !c.p || typeof c.p !== "object" || !Array.isArray(c.x)) throw new GenomeError("genome: not a v1 compact genome");
  const b = { ...BRAND_DEFAULTS, ...c.b };
  const p = { ...PAGE_DEFAULTS, ...c.p };
  const tuple = (v: unknown, n: number, what: string) => {
    const a = arr(v, what);
    if (a.length < n) throw new GenomeError(`genome: ${what} has ${a.length} parts`);
    return a;
  };
  const g5 = tuple(b[5], 3, "G5");
  const g6 = tuple(b[6], 3, "G6");
  const g7 = tuple(b[7], 2, "G7");
  const g14 = tuple(b[14], 2, "G14");
  const g23 = tuple(b[23], 5, "G23");
  const g25 = tuple(b[25], 3, "G25");
  const g30 = tuple(b[30], 2, "G30");
  const g3 = tuple(p[3], 5, "G3");
  const g20 = tuple(p[20], 2, "G20");
  const g24 = tuple(p[24], 4, "G24");
  const g32 = tuple(p[32], 2, "G32");
  const g34 = tuple(p[34], 2, "G34");
  const g35 = tuple(p[35], 3, "G35");
  const sections: SectionGene[] = c.x.map((t, i) => {
    const [id, code, g19, arrange] = arr(t, `section ${i}`) as [unknown, unknown, unknown, unknown];
    const m = /^(.+?)(?:\.(\d))?$/.exec(str(code, `section ${i}`));
    const [type, variant] = tvOf(m?.[1] ?? "", `section ${i}`);
    const s: SectionGene = { id: str(id ?? "", `section ${i} id`) || type, type, variant };
    if (m?.[2] !== undefined) s.G29 = at(HEADLINE_STRUCTURES, Number(m[2]), `section ${i} G29`);
    if (g19) {
      const f = /^(\d)(\d)$/.exec(str(g19, `section ${i} G19`));
      if (!f) throw new GenomeError(`genome: section ${i} G19 "${String(g19)}"`);
      s.G19 = { a: at(ASPECTS, Number(f[1]), "G19 aspect"), f: at(FOCI, Number(f[2]), "G19 focal") };
    }
    if (arrange) s.arrange = str(arrange, `section ${i} arrange`);
    return s;
  });
  const idAt = (i: number, what: string) => {
    const s = sections[i];
    if (!s) throw new GenomeError(`genome: ${what} names section ${i} of ${sections.length}`);
    return s.id;
  };
  const uses: PhotoPlan["uses"] = {};
  for (const entry of arr(p[33] ?? [], "G33")) {
    const [asset, ...list] = arr(entry, "G33 asset");
    uses[str(asset, "G33 asset id")] = list.map((u) => {
      const s = str(u, "G33 use");
      const m = /^(\d)(\d)(\d)(?::(.+)|(\d+))$/.exec(s);
      if (!m) throw new GenomeError(`genome: G33 use "${s}"`);
      return { role: at(PHOTO_ROLES, Number(m[1]), "G33 role"), aspect: at(ASPECTS, Number(m[2]), "G33 aspect"), crop: at(CROPS, Number(m[3]), "G33 crop"), section: m[4] ?? idAt(Number(m[5]), "G33") };
    });
  }
  const seqRaw = g24[0];
  const seq = seqRaw === 1 ? flowSeq(sections) : arr(seqRaw, "G24.seq").map((v) => (typeof v === "number" ? (SECTION_TOKENS[v] ?? (() => { throw new GenomeError(`genome: unknown G24 token ${v}`); })()) : str(v, "G24.seq entry")));
  const primary = arr(g34[0], "G34.primary").map((v) => (typeof v === "number" ? idAt(v, "G34") : str(v, "G34.primary entry")));
  const hi = p.hi === undefined ? undefined : tuple(p.hi, 3, "hints");
  const genome = {
    v: 1,
    seed: c.s,
    priorsV: p.pv,
    brand: {
      G1: b[1],
      G4: b[4],
      G5: { rm: g5[0], rd: g5[1], dmax: g5[2] },
      G6: { w: g6[0], wAr: g6[1], tk: g6[2] },
      G7: { dc: g7[0], lb: g7[1] },
      G8: b[8],
      G9: b[9],
      G11: b[11],
      G12: b[12],
      G13: b[13],
      G14: { w: g14[0], s: g14[1] },
      G15: b[15],
      G17: b[17],
      G23: { f: g23[0], d: g23[1], r: revealsOf(g23[2], "G23.r"), st: g23[3], sc: g23[4] === 1 },
      G25: { gl: g25[0], nb: g25[1], cap: g25[2] },
      G26: b[26],
      G27: b[27],
      G28: b[28],
      G30: { mw: g30[0], ex: g30[1] },
      G31: b[31],
    },
    page: {
      G2: p[2],
      G3: { c: g3[0], s: g3[1], m: g3[2], w: g3[3], u: g3[4] },
      G10: p[10],
      G16: p[16],
      G18: p[18],
      G20: { l: g20[0], p: g20[1] },
      G21: p[21],
      G22: p[22],
      G24: { seq, moments: g24[1], cross: g24[2], signature: g24[3] },
      G32: { budget: g32[0], openers: [...str(g32[1], "G32.openers")].map((ch) => at(OPENERS, Number(ch), "G32 opener")) },
      G33: { max: 3, uses },
      G34: { primary, headerHidesInHero: true, floatCollapses: g34[1] === 1 },
      G35: { scope: g35[0], kinds: revealsOf(g35[1], "G35.kinds"), nodes: g35[2] },
      angle: p.an,
    },
    sections,
    why: arr(p.y ?? [], "why").map((w) => {
      const k = str(w, "why key");
      return k.startsWith(".") ? `${WHY_NS}${k.slice(1)}` : k;
    }),
    ...(hi
      ? {
          hints: {
            from: "director",
            accepted: hi[0],
            pinned: hi[1],
            dropped: arr(hi[2], "hints.dropped").map((d) => {
              const [gene, value, why] = arr(d, "hints.dropped entry");
              return { gene, value, why: at(DROP_REASONS, why, "hints.dropped reason") };
            }),
          },
        }
      : {}),
  };
  return assertGenome(genome);
}
