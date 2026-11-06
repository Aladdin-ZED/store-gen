/**
 * The opener plan and the kicker budget (P6 DESIGN; design.md DES-§5.8, G32, H29; C5, S15, S18). Pure, isomorphic.
 *
 * One opener per in-flow section after the hero (the order of `G32.openers`, read by compile's kicker set and the
 * distance view). Rules:
 *  - budget: `kicker` on ≤ ⌈n/3⌉ sections, the hero counting as one (it keeps its own kicker), never on two
 *    neighbours (so never right after the hero), never on a section without a head (the order form, the strips);
 *  - variety over the sections with a head: ≥ 5 distinct openers (or as many as the heads allow), no opener on more
 *    than half of them;
 *  - grammar affinities (× 3): editorial-column and quiet-luxe → caption, bare; specimen and catalogue → number, bare;
 *    poster and cinematic → image, bare; split-tension and stage → kicker, quote; gallery-led → image;
 *  - material: `image` only on a section that shows a photo, `quote` only where the head has a lead to pull.
 * A section without a head gets `bare` and is left out of the counts. The emphasis device (G26) is the hero title's
 * only (DES-§5.8); nothing here puts one on a section title.
 */
import { OPENERS } from "./consts";
import { variantFeatures } from "./features";
import type { Grammar, Opener } from "./genome";

export interface OpenerBlock {
  type: string;
  variant: string;
}

const AFFINITY: Readonly<Record<Grammar, readonly Opener[]>> = {
  "editorial-column": ["caption", "bare"],
  "quiet-luxe": ["caption", "bare"],
  specimen: ["number", "bare"],
  catalogue: ["number", "bare"],
  poster: ["image", "bare"],
  cinematic: ["image", "bare"],
  "split-tension": ["kicker", "quote"],
  stage: ["kicker", "quote"],
  "gallery-led": ["image"],
};

/** Sections whose first element is a product photo the `image` opener can lift above the title. */
const PHOTO_TYPES: ReadonlySet<string> = new Set(["showcase", "gallery", "story", "benefits", "beforeAfter", "socialProof"]);
/** Sections whose head carries a lead the `quote` opener pulls (DES-§5.8). */
const LEAD_TYPES: ReadonlySet<string> = new Set(["problem", "story", "benefits", "showcase", "guarantee", "cta", "comparison", "steps", "faq", "offer", "specs"]);

/** The openers a section's head supports and has material for (empty = no head). */
export function openersFor(type: string, variant: string): Opener[] {
  const f = variantFeatures(type, variant, null);
  const list = (f.openers ?? [...OPENERS]) as Opener[];
  return list.filter((o) => (o === "image" ? PHOTO_TYPES.has(type) : o === "quote" ? LEAD_TYPES.has(type) : true));
}

/** H29 on a plan: the reasons it fails (empty = holds). `blocks` are the in-flow sections after the hero. */
export function openerViolations(blocks: readonly OpenerBlock[], openers: readonly Opener[], n = blocks.length + 1): string[] {
  const out: string[] = [];
  const budget = Math.ceil(n / 3) - 1;
  const heads = blocks.map((b, i) => ({ i, allowed: openersFor(b.type, b.variant) })).filter((h) => h.allowed.length > 0);
  const kickers = openers.filter((o, i) => o === "kicker" && heads.some((h) => h.i === i)).length;
  if (kickers > budget) out.push(`${kickers} kickers > ${budget} (⌈${n}/3⌉ with the hero's)`);
  openers.forEach((o, i) => {
    if (o !== "kicker") return;
    if (i === 0) out.push("a kicker right under the hero's");
    if (i > 0 && openers[i - 1] === "kicker") out.push(`kickers on neighbours ${i - 1} and ${i}`);
  });
  for (const h of heads) if (!h.allowed.includes(openers[h.i]!)) out.push(`${blocks[h.i]!.type}:${blocks[h.i]!.variant} cannot open with ${openers[h.i]}`);
  const counts = new Map<Opener, number>();
  for (const h of heads) counts.set(openers[h.i]!, (counts.get(openers[h.i]!) ?? 0) + 1);
  const reachable = new Set(heads.flatMap((h) => h.allowed)).size;
  const want = Math.min(5, heads.length, reachable);
  if (counts.size < want) out.push(`${counts.size} distinct openers < ${want}`);
  if (heads.length >= 3) for (const [o, c] of counts) if (c > heads.length / 2) out.push(`${o} on ${c} of ${heads.length} heads (> 50 %)`);
  return out;
}

/**
 * The openers of the in-flow sections after the hero (G32), seeded. Up to 40 draws from `rng` until H29 holds; the
 * last draw stands otherwise (the gate's C5 reads it).
 */
export function planOpeners(blocks: readonly OpenerBlock[], grammar: Grammar, rng: () => number): { budget: number; openers: Opener[] } {
  const n = blocks.length + 1;
  const budget = Math.ceil(n / 3);
  const allowed = blocks.map((b) => openersFor(b.type, b.variant));
  const favoured = new Set(AFFINITY[grammar]);
  let best: Opener[] = blocks.map(() => "bare");
  let bestFaults = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 40; attempt++) {
    const out: Opener[] = [];
    const used = new Map<Opener, number>();
    let kickers = 0;
    const heads = allowed.filter((a) => a.length > 0).length;
    blocks.forEach((_, i) => {
      const can = allowed[i]!;
      if (!can.length) {
        out.push("bare");
        return;
      }
      const weights = can.map((o) => {
        let w = favoured.has(o) ? 3 : 1;
        // a fresh opener first (variety), then none past half of the heads
        const c = used.get(o) ?? 0;
        if (c === 0) w *= 2;
        if (heads >= 3 && c + 1 > heads / 2) w = 0;
        if (o === "kicker" && (kickers >= budget - 1 || i === 0 || out[i - 1] === "kicker")) w = 0;
        return w;
      });
      const total = weights.reduce((s, w) => s + w, 0);
      let pick: Opener = can.find((o) => o !== "kicker") ?? "bare";
      if (total > 0) {
        let r = rng() * total;
        for (let k = 0; k < can.length; k++) {
          r -= weights[k]!;
          if (r < 0) {
            pick = can[k]!;
            break;
          }
        }
      }
      if (pick === "kicker") kickers++;
      used.set(pick, (used.get(pick) ?? 0) + 1);
      out.push(pick);
    });
    // variety repair: a repeated opener gives its place to an unused one the head allows (kickers keep their budget)
    const want = Math.min(5, heads, new Set(allowed.flat()).size);
    for (let guard = 0; guard < blocks.length && used.size < want; guard++) {
      const i = out.findIndex((o, k) => (used.get(o) ?? 0) > 1 && allowed[k]!.some((x) => !used.has(x) && (x !== "kicker" || (kickers < budget - 1 && k > 0 && out[k - 1] !== "kicker" && out[k + 1] !== "kicker"))));
      if (i < 0) break;
      const next = allowed[i]!.find((x) => !used.has(x) && (x !== "kicker" || (kickers < budget - 1 && i > 0 && out[i - 1] !== "kicker" && out[i + 1] !== "kicker")))!;
      used.set(out[i]!, used.get(out[i]!)! - 1);
      if (next === "kicker") kickers++;
      used.set(next, 1);
      out[i] = next;
    }
    const faults = openerViolations(blocks, out, n).length;
    if (faults < bestFaults) [best, bestFaults] = [out, faults];
    if (faults === 0) break;
  }
  return { budget, openers: best };
}
