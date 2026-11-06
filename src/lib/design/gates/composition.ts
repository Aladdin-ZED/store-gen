/**
 * The composition score (P6 DESIGN; design.md DES-§8.5, rev 3 UX-16, C4, C9): the one positive term of Q, 0-15, so a
 * page with no signature detail, 1:1 grids and framed photos everywhere cannot reach "Excellent" by hygiene alone.
 * Pure: read from the page view (the G24 record, the photo plan, the type tokens, the registry features, the heights).
 *
 *  fullBleedMoment 2 · boundaryCross 2 · quietScreen 2 · heroTypeRatio 2 · asymmetricGrid 2 · distinctCrops 2 ·
 *  heroSignature 3
 *
 * The points live in calibration.json (`composition`); the corpus target is a median ≥ 10 (DS25).
 */
import calibration from "../calibration.json";
import type { CompositionKey } from "./types";
import type { PageView } from "./view";

const POINTS = calibration.composition as Readonly<Record<CompositionKey, number>>;
const MOMENTS: ReadonlySet<string> = new Set(["accent", "dark", "pop"]);
/** the planner's cross slot (choreography.ts: the showcase or the image-text story crosses a panel edge) */
const CROSS: ReadonlySet<string> = new Set(["showcase", "story:image-text"]);
/** a quiet screen: ≤ 35 words and ≤ 1 image over at least half a screen (C4) */
const QUIET_WORDS = 35;
const QUIET_MIN_PX = 422;

export interface CompositionFacts {
  fullBleed: boolean;
  cross: boolean;
  quiet: boolean;
  signature: boolean;
}

/** The composition items and their facts (the facts feed V39 and the C4 note). */
export function composition(v: PageView): { score: number; items: { key: CompositionKey; points: number }[]; facts: CompositionFacts } {
  const total = v.flow.reduce((n, s) => Math.max(n, s.top + s.height), 0) || v.heights.total;
  const darkBase = v.landing?.theme.palette.base === "dark";
  // a full-bleed accent / pop / dark moment in the top half (a dark ground counts on a light or tinted page only)
  const fullBleed = v.flow.some((s) => s.type !== "hero" && s.type !== "orderForm" && MOMENTS.has(s.bg) && !(darkBase && s.bg === "dark") && s.top < total / 2);
  // the cross slot (DES-§5.5): the G24 record, or a hanging / overlapping arrangement
  const cross =
    (v.genome.page.G24?.cross ?? null) !== null ||
    v.genome.sections.some((s) => s.arrange === "hang" || (s.arrange ?? "").startsWith("overlap")) ||
    v.flow.some((s) => CROSS.has(s.type) || CROSS.has(`${s.type}:${s.variant}`));
  const quiet = v.flow.some((s) => s.type !== "hero" && s.type !== "orderForm" && s.allWords > 0 && s.allWords <= QUIET_WORDS && s.images <= 1 && s.height >= QUIET_MIN_PX);
  const ratio = v.type.tt ? v.type.tt.ratio.m : 0;
  const heroTypeRatio = ratio >= 3;
  const g3 = v.look?.grid ?? v.genome.page.G3;
  const splitAsym = v.flow.some((s) => s.family === "split" && (typeof s.data.ratio !== "string" || s.data.ratio !== "1:1"));
  const asymmetricGrid = g3.s !== "1:1" && (g3.m === "offset" || splitAsym);
  const assets = v.photo.assets;
  const distinctCrops = assets >= 2 ? v.photo.crops >= 3 : assets === 1 ? v.photo.crops >= 2 : false;
  const h = v.hero;
  const signature = !!h && h.f.signature >= 1 && (h.variant !== "statement" || ratio >= 3);
  const on: Record<CompositionKey, boolean> = { fullBleedMoment: fullBleed, boundaryCross: cross, quietScreen: quiet, heroTypeRatio, asymmetricGrid, distinctCrops, heroSignature: signature };
  const items = (Object.keys(POINTS) as CompositionKey[]).filter((k) => on[k]).map((key) => ({ key, points: POINTS[key] }));
  return { score: Math.min(15, items.reduce((n, x) => n + x.points, 0)), items, facts: { fullBleed, cross, quiet, signature } };
}
