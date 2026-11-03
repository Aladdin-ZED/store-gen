/**
 * The reveal plan (P6 DESIGN; design.md DES-§5.11, G35, H32; R5, T2). Pure, isomorphic.
 *
 * Scope `heads` (the default): `data-reveal` on the hero's title, lead, media and CTA and on each section head's title
 * and lead (plus the first image of an `image` opener); `hero`: the hero only, for airy quiet-luxe pages; `none`: the
 * commerce and transactional registers (DES-§11.1, store pages in R2). Kinds: 1-2 from G23.r. The node estimate is the
 * hero (≤ 6) + each variant's `revealNodes` + the image openers in scope, ≤ 60; a page above it falls back to `hero`.
 * The renderer emits `data-reveal` only inside the scope (`look.mo.scope`, src/landing/sections/reveal-scope.ts).
 */
import { variantFeatures } from "./features";
import type { Grammar, Opener, RevealPlan } from "./genome";
import type { Reveal } from "@/lib/page/schema";

/** The R5 soft line the plan keeps (the gate's hard line is 120). */
export const MAX_REVEAL_NODES = 60;
const HERO_NODES = 6;

export interface RevealBlock {
  type: string;
  variant: string;
}

export function planReveals(
  blocks: readonly RevealBlock[],
  look: { grammar: Grammar; density: "airy" | "balanced" | "dense"; kinds: readonly Reveal[]; register?: "landing" | "commerce" | "transactional" },
  openers: readonly Opener[] = [],
): RevealPlan {
  const kinds = [...new Set(look.kinds)].slice(0, 2) as Reveal[];
  if (look.register === "commerce" || look.register === "transactional") return { scope: "none", kinds, nodes: 0 };
  const heroOnly = look.grammar === "quiet-luxe" && look.density === "airy";
  let nodes = 0;
  const after = blocks.filter((b) => b.type !== "hero");
  for (const b of blocks) nodes += b.type === "hero" ? Math.min(HERO_NODES, variantFeatures(b.type, b.variant, null).revealNodes || HERO_NODES) : 0;
  if (heroOnly) return { scope: "hero", kinds, nodes };
  after.forEach((b, i) => {
    nodes += variantFeatures(b.type, b.variant, null).revealNodes;
    if (openers[i] === "image") nodes += 1;
  });
  if (nodes > MAX_REVEAL_NODES) return { scope: "hero", kinds, nodes: HERO_NODES };
  return { scope: "heads", kinds, nodes };
}

/* ------------------------------------------------------------------ */
/* the hero choreography row per grammar (DES-§4.12, rev 3 UX-6)       */
/* ------------------------------------------------------------------ */

/** A fold slot of the hero row: what moves, at which stagger offset, with which reveal kind. */
export interface HeroSlot {
  slot: "kicker" | "title" | "lead" | "image" | "media" | "ground" | "product" | "contact" | "cells" | "callouts" | "facts" | "band" | "caption" | "price" | "cta" | "cod";
  offset: number;
  kind: Reveal;
}

export interface HeroChoreography {
  /** the grammar whose row the hero follows (a family may serve another grammar's row) */
  row: Grammar;
  slots: HeroSlot[];
  /** ms between offsets (G23.st, held so the row's total stays ≤ 1,400 ms) */
  stagger: number;
  /** the media's duration (`--lp-dur-l`) */
  durL: number;
  /** last offset × stagger + durL */
  total: number;
}

/** The row's ceiling (DES-§4.12: no row's total exceeds 1,400 ms). */
export const HERO_ROW_MAX_MS = 1_400;

type Row = readonly (readonly [HeroSlot["slot"], number, "mask" | "text" | "media" | "line" | "scale"])[];
/** First → last with offsets (DES-§4.12 table). `mask` = mask-wipe under a mask family, else fade-rise. */
const ROWS: Readonly<Record<Grammar, Row>> = {
  "editorial-column": [["kicker", 0, "text"], ["title", 1, "mask"], ["lead", 2, "text"], ["image", 3, "media"], ["price", 4, "text"], ["cta", 4, "text"], ["cod", 5, "text"]],
  poster: [["title", 0, "mask"], ["image", 1, "mask"], ["price", 2, "text"], ["cta", 2, "text"], ["cod", 3, "text"]],
  "gallery-led": [["cells", 0, "media"], ["title", 3, "text"], ["price", 4, "text"], ["cta", 4, "text"], ["cod", 5, "text"]],
  stage: [["ground", 0, "media"], ["product", 1, "scale"], ["contact", 1, "media"], ["title", 2, "text"], ["price", 3, "text"], ["cta", 3, "text"], ["cod", 4, "text"]],
  specimen: [["image", 0, "media"], ["callouts", 1, "line"], ["title", 3, "text"], ["price", 4, "text"], ["cod", 5, "text"]],
  catalogue: [["image", 0, "media"], ["title", 1, "text"], ["facts", 2, "line"], ["price", 5, "text"], ["cod", 6, "text"]],
  "split-tension": [["media", 0, "mask"], ["title", 1, "text"], ["lead", 2, "text"], ["price", 3, "text"], ["cta", 3, "text"], ["cod", 4, "text"]],
  cinematic: [["image", 0, "mask"], ["band", 2, "text"], ["caption", 3, "text"]],
  "quiet-luxe": [["image", 0, "media"], ["title", 2, "text"], ["price", 3, "text"], ["cta", 3, "text"], ["cod", 4, "text"]],
};

/** The row a hero family follows (DES-§4.12): index → catalogue, contact → gallery-led, statement by its structure. */
export function heroRowOf(grammar: Grammar, family: string, structure?: string): Grammar {
  if (family === "index") return "catalogue";
  if (family === "contact") return "gallery-led";
  if (family === "statement") return structure === "contrast-pair" ? "poster" : "quiet-luxe";
  return grammar;
}

/**
 * The hero's choreography (what moves first, DES-§4.12): the row of the grammar the family serves, its reveal kinds
 * from the motion family (G23.f: `mask` → mask-wipe on the masked slots, `critical` → scale-in on the poster title, a
 * quint title blurs in on the quiet-luxe and gallery-led rows), the stagger G23.st (≥ 60 on quiet-luxe) held so the
 * total stays ≤ 1,400 ms. Pure; the compile emits `--lp-reveal-i` per slot from it.
 */
export function heroChoreography(grammar: Grammar, family: string, mo: { f: string; d: number; st: number; calm?: boolean }, structure?: string): HeroChoreography {
  const row = heroRowOf(grammar, family, structure);
  const masked = mo.f === "mask" || mo.f === "expo";
  const kindOf = (k: Row[number][2], slot: HeroSlot["slot"]): Reveal => {
    if (k === "line") return "line-draw";
    if (k === "scale") return "scale-in";
    if (k === "mask") return row === "poster" && mo.f === "critical" ? "scale-in" : masked || row === "cinematic" ? "mask-wipe" : "fade-rise";
    if (slot === "title" && mo.f === "quint" && (row === "quiet-luxe" || row === "gallery-led")) return "blur-in";
    return "fade-rise";
  };
  const slots = ROWS[row].map(([slot, offset, k]) => ({ slot, offset, kind: kindOf(k, slot) }));
  const durL = Math.min(1_000, Math.max(160, Math.round(mo.d * 1.15 * (mo.calm ? 1.25 : 1))));
  const last = Math.max(0, ...slots.map((s) => s.offset));
  let stagger = row === "quiet-luxe" ? Math.max(60, mo.st) : mo.st;
  if (last > 0 && last * stagger + durL > HERO_ROW_MAX_MS) stagger = Math.max(0, Math.floor((HERO_ROW_MAX_MS - durL) / last));
  return { row, slots, stagger, durL, total: last * stagger + durL };
}
