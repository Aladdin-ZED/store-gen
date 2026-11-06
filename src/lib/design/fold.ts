/**
 * The fold check and the H28 repair ladder (P6 DESIGN; design.md DES-§4.4 H28, DES-§5.12 I7). Pure, isomorphic.
 *
 * The planner targets the four fold items (image, price, primary CTA, COD line) at ≤ 760 px at 390 × 844 (the
 * generation target, 844 × 0.9; the gate's band and refusal are the gates' business). The stack is the hero family's
 * composition sheet (./sheets.ts) laid out by `foldLayout` with the page's type metrics (`foldTypeFor`). On a miss the
 * ladder repairs in this order, the headline last (the baseline's T6 fault was 36 px heroes):
 *   1. drop the hero lead from the fold (it reappears under the image);
 *   2. hold the title to 2 lines (the copy step picks a shorter alternative);
 *   3. cut the image height in 2 vh steps (≥ 36 vh; ≥ 44 vh on cinema);
 *   4. drop the kicker;
 *   5. lower G5.dmax in 8 px steps (≥ 48 px, never 44): a display run larger than dmax at 390 shrinks with it;
 *   6. swap the hero family inside the grammar's pool (the first family whose own ladder holds).
 */
import type { Locale } from "@/lib/page/schema";
import { FOLD_TARGET, foldLayout, sheetOf, type FoldLayout, type FoldStep, type FoldType } from "./sheets";

export type FoldRepair = "lead" | "title2" | "image" | "kicker" | "dmax" | "family";

export interface FoldPlanInput {
  /** the hero variant (family) */
  family: string;
  locale: Locale;
  /** line metrics at 390 (`foldTypeFor(fonts, params, locale)`); the sheet's nominal type otherwise */
  type: FoldType;
  /** G5.dmax */
  dmax: number;
  /** the page has an announcement bar above the header (42 px, counted) */
  announcement: boolean;
  /** unknown before the copy step: the sheet's line caps are used (the worst case) */
  titleChars?: number;
  leadChars?: number;
}

export interface FoldPlan {
  family: string;
  /** every fold item's top ≤ 760 px */
  ok: boolean;
  /** the top of the lowest fold item (image, price, CTA, COD line) */
  bottom: number;
  items: FoldLayout["items"];
  /** the rungs applied, in ladder order */
  repairs: FoldRepair[];
  /** the image's vh cap after rung 3 (absent = the sheet's) */
  imageVh?: number;
  /** G5.dmax after rung 5 */
  dmax: number;
  /** the title held to 2 lines (rung 2) */
  titleLines?: 2;
}

const ITEMS = ["image", "price", "cta", "cod"] as const;
/** rung 3's floor per family (cinema's band needs its photo, DES-§5.12) */
const IMAGE_FLOOR: Readonly<Record<string, number>> = { cinema: 44 };
const IMAGE_FLOOR_DEFAULT = 36;
const DMAX_FLOOR = 48;

/** The top of the lowest fold item of a layout (the items a family lacks do not count). */
export const foldBottom = (lay: Pick<FoldLayout, "items">): number => Math.max(0, ...ITEMS.map((k) => lay.items[k] ?? 0));

interface Knobs {
  lead: boolean;
  title2: boolean;
  vh: number | null;
  kicker: boolean;
  dmax: number;
}

/** The sheet's steps with the ladder's knobs applied (recursive for band / grid steps). */
function adjust(steps: readonly FoldStep[], k: Knobs): FoldStep[] {
  const out: FoldStep[] = [];
  for (const s of steps) {
    if (s.el === "lead" && !k.lead) continue;
    if (s.el === "kicker" && !k.kicker) continue;
    let t: FoldStep = { ...s };
    if (t.inner) t = { ...t, inner: adjust(t.inner, k) };
    if (t.el === "title" && k.title2 && (t.lines ?? 1) > 2) t = { ...t, lines: 2 };
    if (t.el === "title" && t.step === "D" && t.sizePx && t.sizePx > k.dmax) t = { ...t, sizePx: k.dmax };
    if (t.el === "image" && k.vh !== null && t.vh !== undefined) t = { ...t, vh: Math.min(t.vh, k.vh), ...(t.vhAr !== undefined ? { vhAr: Math.min(t.vhAr, k.vh) } : {}) };
    out.push(t);
  }
  return out;
}

/** The largest image vh cap of a stack (the sheet's), null when the stack has no vh image. */
function imageVhOf(steps: readonly FoldStep[], ar: boolean): number | null {
  let best: number | null = null;
  for (const s of steps) {
    if (s.el === "image" && s.vh !== undefined) best = Math.max(best ?? 0, ar && s.vhAr !== undefined ? s.vhAr : s.vh);
    if (s.inner) {
      const inner = imageVhOf(s.inner, ar);
      if (inner !== null) best = Math.max(best ?? 0, inner);
    }
  }
  return best;
}

/** One family's ladder (rungs 1-5); null when the family has no sheet stack. */
function ladder(input: FoldPlanInput): FoldPlan | null {
  const steps = sheetOf("hero", input.family)?.fold;
  if (!steps) return null;
  const ar = input.locale === "ar";
  const k: Knobs = { lead: true, title2: false, vh: null, kicker: true, dmax: input.dmax };
  const repairs: FoldRepair[] = [];
  const lay = () =>
    foldLayout(adjust(steps, k), { ar, type: input.type, announcement: input.announcement, ...(input.titleChars !== undefined ? { titleChars: input.titleChars } : {}), ...(input.leadChars !== undefined ? { leadChars: input.leadChars } : {}) });
  let cur = lay();
  const done = () => foldBottom(cur) <= FOLD_TARGET;
  const plan = (): FoldPlan => ({
    family: input.family,
    ok: done(),
    bottom: foldBottom(cur),
    items: cur.items,
    repairs,
    ...(k.vh !== null ? { imageVh: k.vh } : {}),
    dmax: k.dmax,
    ...(k.title2 ? { titleLines: 2 as const } : {}),
  });
  if (done()) return plan();
  // 1. the lead leaves the fold (an `optional` lead already left inside foldLayout when the stack passed the target)
  if (steps.some((s) => s.el === "lead" || s.inner?.some((i) => i.el === "lead"))) {
    k.lead = false;
    repairs.push("lead");
    cur = lay();
    if (done()) return plan();
  }
  // 2. the title on 2 lines
  k.title2 = true;
  repairs.push("title2");
  cur = lay();
  if (done()) return plan();
  // 3. the image in 2 vh steps
  const vh0 = imageVhOf(steps, ar);
  if (vh0 !== null) {
    const floor = IMAGE_FLOOR[input.family] ?? IMAGE_FLOOR_DEFAULT;
    for (let vh = vh0 - 2; vh >= floor && !done(); vh -= 2) {
      k.vh = vh;
      cur = lay();
    }
    if (k.vh !== null) repairs.push("image");
    if (done()) return plan();
  }
  // 4. the kicker
  if (steps.some((s) => s.el === "kicker")) {
    k.kicker = false;
    repairs.push("kicker");
    cur = lay();
    if (done()) return plan();
  }
  // 5. dmax in 8 px steps (≥ 48)
  const d0 = k.dmax;
  for (let d = d0 - 8; d >= DMAX_FLOOR && !done(); d -= 8) {
    k.dmax = d;
    cur = lay();
  }
  if (k.dmax !== d0) repairs.push("dmax");
  return plan();
}

/**
 * The fold plan of a hero family (DES-§5.12): the ladder's rungs 1-5 on the family, then rung 6 over `pool` (the
 * grammar's other hero families, best first). A pool family is taken with its own ladder only when it holds; when no
 * family holds, the first family's best effort is returned with `ok: false` (the gate's band decides later).
 */
export function planFold(input: FoldPlanInput, pool: readonly string[] = []): FoldPlan {
  const own = ladder(input);
  if (!own) return { family: input.family, ok: true, bottom: 0, items: {}, repairs: [], dmax: input.dmax };
  if (own.ok) return own;
  for (const family of pool) {
    if (family === input.family) continue;
    const alt = ladder({ ...input, family });
    if (alt?.ok) return { ...alt, repairs: [...own.repairs, "family", ...alt.repairs] };
  }
  return own;
}
