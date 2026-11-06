/**
 * Priors for the bold genes (P6 DESIGN; design.md DES-§4.3, DES-§4.12, DS3, DS25, DS49, QUAL-26; ai.md AI-§G.5). Pure
 * and isomorphic: designer-set starting values per archetype (G2, G9, G28), per grammar (G18, G23.f), the catalogue's
 * pairings (G4) and the ranked archetypes (G1).
 *
 * A value a table leaves blank gets the **floor 0.02** (so every value a hard rule allows can appear, DS25); rows are
 * normalised after the floor. The factors that multiply a row, in the sampler's order (DES-§4.4): the H33
 * anti-concentration step factors (`concentration`), the Director hints (≤ 3×, hints.ts), the learned weights of the
 * snapshot (R3) and `platform_ai.genePins` (a ban sets 0, a pin list is the only allowed values unless the hard rules
 * refuse every one of them). `priorsV` names what produced a sample: the table version, the learned-prior date and the
 * niche-shares hour.
 */
import { ARCHETYPES, COLOR_STRATEGIES, EASE_FAMILIES, GRAMMARS, TREATMENTS, type Archetype, type ColorStrategy, type EaseFamily, type Grammar, type Treatment } from "@/lib/page/schema";
import { VOICE_REGISTERS } from "./consts";
import type { BoldGene, PriorsSnapshot, VoiceRegister } from "./genome";
import type { NicheShares } from "./novelty.server";
import { arDisplayClass, DEFAULT_SERIFS, pairingsFor, type Pairing } from "./pairings";

/** The version of these tables (the first part of every `priorsV`). */
export const PRIORS_VERSION = "p1";
/** The weight a valid value never goes below (DS25). */
export const PRIOR_FLOOR = 0.02;

/** value → weight (normalised to Σ 1 by `normalise`) */
export type GenePrior = Record<string, number>;

/**
 * The priors id a sample stores (`design_genomes.priors_v`, ≤ 24 chars): "p1", "p1-261028" with the learned-prior
 * snapshot date, "p1-261028-26102814" with the niche-shares watermark hour too.
 */
export function priorsV(opts: { learned?: Date | null; sharesHour?: Date | null } = {}): string {
  const ymd = (d: Date) => d.toISOString().slice(2, 10).replace(/-/g, "");
  const ymdh = (d: Date) => `${ymd(d)}${d.toISOString().slice(11, 13)}`;
  let out = PRIORS_VERSION;
  if (opts.learned || opts.sharesHour) out += `-${opts.learned ? ymd(opts.learned) : "0"}`;
  if (opts.sharesHour) out += `-${ymdh(opts.sharesHour)}`;
  return out;
}

/** The empty snapshot (no learned weights, no pins). */
export const BASE_PRIORS: PriorsSnapshot = { v: PRIORS_VERSION, weights: {} };

/* ------------------------------------------------------------------ */
/* the tables (DES-§4.3, DES-§4.12)                                    */
/* ------------------------------------------------------------------ */

const row = <K extends string>(keys: readonly K[], cells: readonly (number | null)[]): Partial<Record<K, number>> => {
  const out: Partial<Record<K, number>> = {};
  keys.forEach((k, i) => {
    const v = cells[i];
    if (typeof v === "number") out[k] = v;
  });
  return out;
};
const _ = null;

/** G2 grammar per archetype (editorial-column, poster, gallery-led, stage, specimen, catalogue, split-tension, cinematic, quiet-luxe). */
export const G2_PRIORS: Readonly<Record<Archetype, Partial<Record<Grammar, number>>>> = {
  maison: row(GRAMMARS, [0.18, _, 0.12, 0.08, _, _, 0.1, 0.22, 0.3]),
  apothecary: row(GRAMMARS, [0.18, _, _, 0.14, 0.3, 0.08, 0.2, _, 0.1]),
  souk: row(GRAMMARS, [0.18, 0.1, 0.24, 0.12, _, _, 0.16, 0.2, _]),
  playground: row(GRAMMARS, [_, 0.3, 0.18, 0.22, _, 0.14, 0.16, _, _]),
  kinetic: row(GRAMMARS, [_, 0.32, _, 0.14, 0.1, _, 0.18, 0.26, _]),
  circuit: row(GRAMMARS, [_, _, _, 0.26, 0.34, 0.14, 0.16, 0.1, _]),
  hearth: row(GRAMMARS, [0.18, _, 0.2, 0.22, _, 0.16, 0.24, _, _]),
  bloom: row(GRAMMARS, [0.2, _, 0.26, 0.16, _, _, 0.18, _, 0.2]),
  field: row(GRAMMARS, [0.26, _, 0.2, _, 0.14, _, 0.18, 0.22, _]),
  editorial: row(GRAMMARS, [0.32, _, 0.22, _, _, _, 0.14, 0.18, 0.14]),
  garage: row(GRAMMARS, [_, 0.24, _, 0.2, 0.28, _, 0.16, 0.12, _]),
};

/** G9 colour strategy per archetype (ink+one, duotone, color-field, tonal, dark-luxe, high-key, mono+signal). */
export const G9_PRIORS: Readonly<Record<Archetype, Partial<Record<ColorStrategy, number>>>> = {
  maison: row(COLOR_STRATEGIES, [0.28, _, _, 0.2, 0.34, 0.08, 0.1]),
  apothecary: row(COLOR_STRATEGIES, [0.3, 0.08, _, 0.18, _, 0.24, 0.2]),
  souk: row(COLOR_STRATEGIES, [0.16, 0.24, 0.2, 0.26, 0.14, _, _]),
  playground: row(COLOR_STRATEGIES, [_, 0.3, 0.32, 0.16, _, 0.22, _]),
  kinetic: row(COLOR_STRATEGIES, [0.1, 0.22, 0.24, _, 0.16, _, 0.28]),
  circuit: row(COLOR_STRATEGIES, [0.24, 0.12, _, _, 0.26, 0.08, 0.3]),
  hearth: row(COLOR_STRATEGIES, [0.18, 0.2, 0.1, 0.28, _, 0.24, _]),
  bloom: row(COLOR_STRATEGIES, [0.14, 0.2, 0.08, 0.28, _, 0.3, _]),
  field: row(COLOR_STRATEGIES, [0.24, 0.18, 0.14, 0.3, 0.14, _, _]),
  editorial: row(COLOR_STRATEGIES, [0.32, _, 0.16, 0.18, 0.12, _, 0.22]),
  garage: row(COLOR_STRATEGIES, [0.2, 0.12, 0.08, _, 0.3, _, 0.3]),
};

/** G28 voice register per archetype (DES-§4.3). */
export const G28_PRIORS: Readonly<Record<Archetype, Partial<Record<VoiceRegister, number>>>> = {
  maison: { "poetic-restrained": 0.5, plain: 0.3, precise: 0.2 },
  apothecary: { precise: 0.5, plain: 0.35, warm: 0.15 },
  souk: { warm: 0.4, "poetic-restrained": 0.3, plain: 0.3 },
  playground: { warm: 0.45, bold: 0.35, plain: 0.2 },
  kinetic: { bold: 0.5, precise: 0.25, plain: 0.25 },
  circuit: { precise: 0.55, plain: 0.3, bold: 0.15 },
  hearth: { warm: 0.5, plain: 0.35, precise: 0.15 },
  bloom: { warm: 0.4, "poetic-restrained": 0.35, plain: 0.25 },
  field: { plain: 0.4, warm: 0.35, "poetic-restrained": 0.25 },
  editorial: { "poetic-restrained": 0.35, plain: 0.35, precise: 0.3 },
  garage: { precise: 0.4, bold: 0.35, plain: 0.25 },
};

/** G18 image treatment per grammar (cutout-stage, framed-stage, full-bleed-crop, framed, tight-detail, tonal-duotone, grid-contact). */
export const G18_PRIORS: Readonly<Record<Grammar, Partial<Record<Treatment, number>>>> = {
  "editorial-column": row(TREATMENTS, [_, _, 0.2, 0.35, 0.3, 0.15, _]),
  poster: row(TREATMENTS, [0.45, 0.1, 0.3, _, 0.15, _, _]),
  "gallery-led": row(TREATMENTS, [_, _, 0.25, 0.3, _, 0.05, 0.4]),
  stage: row(TREATMENTS, [0.7, 0.3, _, _, _, _, _]),
  specimen: row(TREATMENTS, [0.35, 0.1, _, 0.2, 0.35, _, _]),
  catalogue: row(TREATMENTS, [0.2, _, _, 0.5, _, _, 0.3]),
  "split-tension": row(TREATMENTS, [0.3, _, 0.35, 0.2, 0.15, _, _]),
  cinematic: row(TREATMENTS, [_, _, 0.7, _, 0.3, _, _]),
  "quiet-luxe": row(TREATMENTS, [0.2, _, 0.3, 0.4, 0.1, _, _]),
};

/** G23.f motion family per grammar (expo, quint, quart, critical, soft-spring, mask; DES-§4.12); soft-spring is added for playground. */
export const G23_PRIORS: Readonly<Record<Grammar, Partial<Record<EaseFamily, number>>>> = {
  "editorial-column": row(EASE_FAMILIES, [_, 0.15, 0.35, 0.15, _, 0.35]),
  poster: row(EASE_FAMILIES, [0.45, _, _, 0.2, _, 0.35]),
  "gallery-led": row(EASE_FAMILIES, [0.2, 0.25, 0.2, 0.15, _, 0.2]),
  stage: row(EASE_FAMILIES, [0.25, 0.35, 0.15, 0.25, _, _]),
  specimen: row(EASE_FAMILIES, [0.3, _, 0.3, 0.25, _, 0.15]),
  catalogue: row(EASE_FAMILIES, [0.2, _, 0.35, 0.35, _, 0.1]),
  "split-tension": row(EASE_FAMILIES, [0.25, 0.2, 0.2, 0.2, _, 0.15]),
  cinematic: row(EASE_FAMILIES, [0.2, 0.3, _, _, _, 0.5]),
  "quiet-luxe": row(EASE_FAMILIES, [_, 0.45, _, 0.35, _, 0.2]),
};
/** The playground soft-spring weights of DES-§4.12 (poster +.20, stage +.25); other grammars give it the floor. */
const SOFT_SPRING_PLAYGROUND: Partial<Record<Grammar, number>> = { poster: 0.2, stage: 0.25 };

/** The borrowed-pairing weight of the catalogue's "also fits" column (DES-§4.3, DES-§10.3). */
export const BORROWED_PAIRING = 0.3;

/* ------------------------------------------------------------------ */
/* priorFor                                                            */
/* ------------------------------------------------------------------ */

/** What a bold gene's prior is conditioned on (the earlier bold choices, DES-§4.4). */
export interface PriorCtx {
  archetype: Archetype;
  grammar?: Grammar;
  /** the primary photo has alpha (real or estimated): `cutout-stage` keeps its weight, else it moves to `framed-stage` */
  alpha?: boolean;
  /** G1: the archetypes `rankDirections` ranked, best first, with their scores */
  ranked?: readonly { archetype: Archetype; score: number }[];
}

/** Applies the floor to every listed value and normalises the row to Σ 1 (DES-§4.3). */
export function normalise(values: readonly string[], weights: Partial<Record<string, number>>): GenePrior {
  const out: GenePrior = {};
  let total = 0;
  for (const v of values) {
    const w = Math.max(PRIOR_FLOOR, weights[v] ?? 0);
    out[v] = w;
    total += w;
  }
  for (const v of values) out[v] = out[v]! / total;
  return out;
}

/** The value list of a bold gene for an archetype (G4: the archetype's pairings, own and borrowed). */
export function boldValues(gene: BoldGene, ctx: Pick<PriorCtx, "archetype">): readonly string[] {
  switch (gene) {
    case "G1":
      return ARCHETYPES;
    case "G2":
      return GRAMMARS;
    case "G9":
      return COLOR_STRATEGIES;
    case "G4":
      return pairingsFor(ctx.archetype).map((p) => p.pairing.id);
    case "G18":
      return TREATMENTS;
    case "G23":
      return EASE_FAMILIES;
    case "G28":
      return VOICE_REGISTERS;
  }
}

/**
 * The designer prior of a bold gene in its context, floored and normalised (DES-§4.3). The hard rules (solve.ts) zero
 * the values they forbid afterwards and re-apply the floor to the valid ones.
 */
export function priorFor(gene: BoldGene, ctx: PriorCtx): GenePrior {
  const values = boldValues(gene, ctx);
  switch (gene) {
    case "G1": {
      // the ranked archetypes with weights score + floor (directions 2 and 3, DES-§4.3); unranked ones keep the floor
      const w: Partial<Record<string, number>> = {};
      for (const r of ctx.ranked ?? []) w[r.archetype] = Math.max(0, r.score) + PRIOR_FLOOR;
      return normalise(values, w);
    }
    case "G2":
      return normalise(values, G2_PRIORS[ctx.archetype]);
    case "G9":
      return normalise(values, G9_PRIORS[ctx.archetype]);
    case "G28":
      return normalise(values, G28_PRIORS[ctx.archetype]);
    case "G4": {
      const w: Partial<Record<string, number>> = {};
      for (const { pairing, weight } of pairingsFor(ctx.archetype)) w[pairing.id] = weight;
      return normalise(values, w);
    }
    case "G18": {
      const w = { ...G18_PRIORS[ctx.grammar ?? "editorial-column"] };
      // without alpha (and without an estimated cutout) the cutout-stage weight moves to framed-stage (rev 3, UX-25)
      if (!ctx.alpha && w["cutout-stage"]) {
        w["framed-stage"] = (w["framed-stage"] ?? 0) + w["cutout-stage"];
        delete w["cutout-stage"];
      }
      return normalise(values, w);
    }
    case "G23": {
      const g = ctx.grammar ?? "editorial-column";
      const w: Partial<Record<string, number>> = { ...G23_PRIORS[g] };
      if (ctx.archetype === "playground") w["soft-spring"] = SOFT_SPRING_PLAYGROUND[g] ?? PRIOR_FLOOR;
      return normalise(values, w);
    }
  }
}

/* ------------------------------------------------------------------ */
/* the multipliers                                                     */
/* ------------------------------------------------------------------ */

/** H33 caps at niche scale (DS49, DES-§4.4). Motion takes the grammar's cap (a design decision of P6, see r1-p6 report). */
export const CONCENTRATION_CAPS = {
  grammar: 0.25,
  strategy: 0.25,
  heroFamily: 0.2,
  heroArrangement: 0.12,
  displayFamily: 0.2,
  /** Fraunces and Instrument Serif per niche */
  defaultSerif: 0.1,
  arDisplay: 0.3,
  arDisplayClass: 0.4,
  motion: 0.25,
  /**
   * G1 vibe per niche (N5: the top archetype ≤ 45 % of chosen pages). The shares come from the niche's live stores
   * (`vibeShares`, CCR r1-p6-7 asks for `NicheShares.vibe`); the step factor applies to the best-fit slot too.
   */
  vibe: 0.35,
} as const;

/** The H33 step factor of one share against its cap: × 0.25 at or above the cap, × 0.5 from 0.8 × the cap, else 1. */
export const stepFactor = (share: number | undefined, cap: number) => (share === undefined ? 1 : share >= cap ? 0.25 : share >= 0.8 * cap ? 0.5 : 1);

/** Shares count only when the niche pool has ≥ 10 stores (k ≥ 10, DES-§7.4). */
export const sharesActive = (s: NicheShares | null | undefined): s is NicheShares => !!s && s.n >= 10;

/**
 * The H33 anti-concentration factor of a bold-gene value (DS49), applied to the prior before the hard rules and for the
 * best-fit slot too. G4 multiplies the Latin display family, the Arabic display face and its structural class (the
 * Arabic ones on `ar` pages only); G1, G18 and G28 have no niche share and keep 1.
 */
export function concentration(gene: BoldGene, value: string, shares: NicheShares | null | undefined, opts: { pairing?: Pairing; ar?: boolean } = {}): number {
  if (!sharesActive(shares)) return 1;
  switch (gene) {
    case "G2":
      return stepFactor(shares.grammar[value], CONCENTRATION_CAPS.grammar);
    case "G9":
      return stepFactor(shares.strategy[value], CONCENTRATION_CAPS.strategy);
    case "G23":
      return stepFactor(shares.motion[value], CONCENTRATION_CAPS.motion);
    case "G4": {
      const p = opts.pairing;
      if (!p) return 1;
      const cap = (DEFAULT_SERIFS as readonly string[]).includes(p.display) ? CONCENTRATION_CAPS.defaultSerif : CONCENTRATION_CAPS.displayFamily;
      let f = stepFactor(shares.displayFamily[p.display], cap);
      if (opts.ar) {
        f *= stepFactor(shares.arDisplay[p.displayAr], CONCENTRATION_CAPS.arDisplay);
        const cls = arDisplayClass(p.displayAr);
        if (cls) f *= stepFactor(shares.arDisplayClass[cls], CONCENTRATION_CAPS.arDisplayClass);
      }
      return f;
    }
    default:
      return 1;
  }
}

/** The learned multiplier of a value (R3; absent = 1). */
export const learned = (gene: BoldGene, value: string, snap: PriorsSnapshot | undefined) => {
  const w = snap?.weights[gene]?.[value];
  return typeof w === "number" && Number.isFinite(w) && w >= 0 ? w : 1;
};

/**
 * `platform_ai.genePins` on a value list (AI-§G.5): banned values drop out; a pin list keeps only its values (when at
 * least one of them is in `values`, else the pin is ignored). Returns the allowed values in their order.
 */
export function pinsAllow(gene: string, values: readonly string[], snap: PriorsSnapshot | undefined): string[] {
  const rule = snap?.pins?.[gene];
  if (!rule) return [...values];
  const ban = new Set(rule.ban ?? []);
  const kept = values.filter((v) => !ban.has(v));
  const pin = rule.pin?.length ? kept.filter((v) => rule.pin!.includes(v)) : [];
  return pin.length ? pin : kept;
}
