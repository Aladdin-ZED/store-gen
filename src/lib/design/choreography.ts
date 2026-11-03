/**
 * The choreography grammar (P6 DESIGN; design.md DES-§5.1, DES-§5.2, DES-§5.5, DES-§5.7 N3; H35, DS53; DG-04). Pure,
 * isomorphic. Replaces the three fixed storylines of src/lib/generator/plan.ts (they stay for the remix of old
 * documents):
 *
 *   Page    → Top Hero Strip? Act1 Form Act2 Close Footer Floating
 *   Strip   → trustBar | marquee | ε          Act1 → Promise | Problem | Proof | Visual | Promise Visual
 *                                                     | Problem Promise | Visual Promise | Objection
 *   Act2    → Block{2..4} (dense +1, airy −1), no type twice, at most one Visual, ordered by `orderAct2`
 *   Close   → cta | guarantee cta | faq cta | cta faq | story cta | ε (ε only after offer:showcase / guarantee:split)
 *
 * Production weights follow DES-§5.1 (vibe, grammar, mood, inputs). Blocks the inputs cannot fill are dropped before
 * the draw (DS42, I6): no owner proof → no reviews / socialProof, < 2 merchant figures → no stats, no video → no
 * video, no before / after material → no beforeAfter, < 3 photos → no gallery, one photo → no showcase (H36), one
 * offer → no offer block, a garment without facts → no specs. Each draw is checked with the height model (I2 the form
 * within 3 screens at 390 × 844, I8 8-14 sections and ≤ 12,000 px, I4 a colour moment in the top half) and the H35
 * ordering rules; up to 50 draws from the same stream, then `null` (the caller takes `choreographyFallback`). The order
 * is re-drawn (≤ 10 times) while it repeats a 4-section run used by ≥ 50 % of the store's own pages or of the niche
 * (`nicheShares(niche).seq4`, tokens only, never another store's text).
 */
import type { Archetype, OfferPicker } from "@/lib/page/schema";
import type { MoodReading } from "@/lib/generator/mood";
import { variantFeatures } from "./features";
import type { Grammar, PageGenes } from "./genome";
import { sectionPxOf, type FormCounts } from "./heights";
import { ROW } from "./sheets";
import { sectionToken } from "./tokens-table";
import type { LayoutFamily } from "./types";

export interface ChoreographyHas {
  /** reviews or customer messages the owner gave (I6) */
  ownerProof: boolean;
  video: boolean;
  /** product photos (the cutout not counted) */
  photos: number;
  /** a merchant end date (the form chip carries it; `urgency` is no section, R3) */
  endDate: boolean;
  whatsapp: boolean;
  storeName: boolean;
  /** merchant figures (`allowedNumbers`, D2): stats need ≥ 2 */
  figures?: number;
  /** a before / after pair the owner gave */
  beforeAfter?: boolean;
  /** the page's offers (an offer block needs ≥ 2) */
  offers?: number;
  /** ≥ 2 merchant facts */
  facts?: boolean;
  /** a garment (without facts it gets no spec sheet) */
  garment?: boolean;
}

export interface ChoreographyCtx {
  vibe: Archetype;
  grammar: Grammar;
  mood: MoodReading;
  density: PageGenes["G20"];
  has: ChoreographyHas;
  picker: OfferPicker;
  /** G21 (section spacing multiplier), default 1 */
  space?: number;
  /** the variant the planner draws for a type (deterministic per type); absent = the type's first registry variant */
  variantOf?: (type: string) => string;
  /** a type the page may carry (registry, reservations); absent = every type */
  exists?: (type: string) => boolean;
  /** the page has an announcement bar (42 px over the header) */
  announcement?: boolean;
  /** the order form's additive terms (offer rows, option groups, bump) */
  form?: FormCounts;
  /** colour moments the page paints (G10 band, ≤ 2 outside color-field) */
  moments?: number;
  /** the store's own pages, as in-flow section tokens after the hero */
  own?: readonly (readonly number[])[];
  /** the niche's top 4-grams (`NicheShares.seq4`) */
  seq4?: readonly { gram: readonly number[]; share: number }[];
}

export interface Choreography {
  /** the in-flow section types, hero first (header, announcement, footer and floating bars around them) */
  inFlow: string[];
  record: PageGenes["G24"];
  /** C4: the one quiet screen (≤ 35 words, ≤ 1 image), an index of `inFlow` */
  quiet: number | null;
  /** C7: the G20.p letters over the Act2 blocks */
  density: string[];
  /** the estimate the checks used */
  estimate: { formTop: number; total: number; count: number };
  /** draws used (1 = the first held) */
  tries: number;
}

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

/** I2: the form starts within 3.0 estimated mobile screens (stricter than the core's 3,000 px). */
export const FORM_TOP_MAX = 3 * 844;
/** I8 */
export const SECTIONS_MIN = 8;
export const SECTIONS_MAX = 14;
export const HEIGHT_MAX = 12_000;
/**
 * The planner's own targets, a little inside I2 and I8: the document's estimate reads the final spacing pass
 * (`spacingFor` with the previous section), which the expansion only approximates (±2 %).
 */
const FORM_TOP_TARGET = FORM_TOP_MAX - 50;
const HEIGHT_TARGET = HEIGHT_MAX - 300;
const MAX_TRIES = 50;
const MAX_REDRAWS = 10;

/** Archetype affinity for optional blocks (plan.ts AFFINITY: the same table, kept for the optional blocks). */
const AFFINITY: Readonly<Record<Archetype, Partial<Record<string, number>>>> = {
  maison: { problem: 0.35, story: 0.9, comparison: 0.1, specs: 0.35, gallery: 0.7, socialProof: 0.3 },
  apothecary: { problem: 0.85, story: 0.45, comparison: 0.5, specs: 0.45, gallery: 0.4, socialProof: 0.35 },
  souk: { problem: 0.55, story: 0.85, comparison: 0.2, specs: 0.2, gallery: 0.6, socialProof: 0.75 },
  playground: { problem: 0.8, story: 0.25, comparison: 0.35, specs: 0.15, gallery: 0.5, socialProof: 0.75 },
  kinetic: { problem: 0.75, story: 0.2, comparison: 0.7, specs: 0.45, gallery: 0.45, socialProof: 0.45 },
  circuit: { problem: 0.6, story: 0.2, comparison: 0.75, specs: 0.85, gallery: 0.4, socialProof: 0.3 },
  hearth: { problem: 0.8, story: 0.45, comparison: 0.6, specs: 0.4, gallery: 0.45, socialProof: 0.75 },
  bloom: { problem: 0.6, story: 0.5, comparison: 0.25, specs: 0.15, gallery: 0.65, socialProof: 0.6 },
  field: { problem: 0.55, story: 0.85, comparison: 0.3, specs: 0.3, gallery: 0.55, socialProof: 0.5 },
  editorial: { problem: 0.45, story: 0.6, comparison: 0.25, specs: 0.45, gallery: 0.8, socialProof: 0.25 },
  garage: { problem: 0.7, story: 0.25, comparison: 0.75, specs: 0.8, gallery: 0.35, socialProof: 0.45 },
};

type Slot = "Promise" | "Problem" | "Proof" | "Visual" | "Objection";
const ACT1: readonly { slots: readonly Slot[]; w: number }[] = [
  { slots: ["Promise"], w: 0.26 },
  { slots: ["Problem"], w: 0.14 },
  { slots: ["Proof"], w: 0.12 },
  { slots: ["Visual"], w: 0.14 },
  { slots: ["Promise", "Visual"], w: 0.12 },
  { slots: ["Problem", "Promise"], w: 0.08 },
  { slots: ["Visual", "Promise"], w: 0.08 },
  { slots: ["Objection"], w: 0.06 },
];
const CLOSE: readonly { blocks: readonly string[]; w: number }[] = [
  { blocks: ["cta"], w: 0.35 },
  { blocks: ["guarantee", "cta"], w: 0.2 },
  { blocks: ["faq", "cta"], w: 0.15 },
  { blocks: ["cta", "faq"], w: 0.1 },
  { blocks: ["story", "cta"], w: 0.1 },
  { blocks: [], w: 0.1 },
];
const VISUAL_TYPES: ReadonlySet<string> = new Set(["showcase", "gallery", "video", "beforeAfter"]);
const PROOF_TYPES: ReadonlySet<string> = new Set(["reviews", "socialProof", "stats"]);
/** Content blocks that can carry a full-bleed colour moment (assignBackgrounds' promotion list, I4). */
export const MOMENT_TYPES: ReadonlySet<string> = new Set(["showcase", "problem", "story", "socialProof", "reviews", "stats", "steps", "video", "cta"]);
/** image + text splits (H35 rule 3: ≤ 2 in a row) */
export const IMAGE_TEXT: ReadonlySet<string> = new Set(["benefits:zigzag", "story:image-text", "comparison:split", "mediaText", "showcase:figure"]);
const STRIPS: ReadonlySet<string> = new Set(["trustBar", "marquee"]);
/** Act2 blocks that already ask for the order: the page may close on them (Close → ε). */
export const CTA_LIKE: ReadonlySet<string> = new Set(["offer:showcase", "guarantee:split"]);
/** statement sections that breathe (plan.ts spacingFor: airy) */
const AIRY: ReadonlySet<string> = new Set(["story", "cta", "hero", "problem:quote", "story:manifesto"]);

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

function pickW<T>(rng: () => number, items: readonly { value: T; w: number }[]): T | null {
  const total = items.reduce((s, i) => s + Math.max(0, i.w), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, it.w);
    if (r < 0) return it.value;
  }
  return items[items.length - 1]!.value;
}

const variantOf = (ctx: ChoreographyCtx, type: string) => ctx.variantOf?.(type) ?? "";
const familyOf = (ctx: ChoreographyCtx, type: string): LayoutFamily => variantFeatures(type, variantOf(ctx, type), null).family;
const key = (ctx: ChoreographyCtx, type: string) => `${type}:${variantOf(ctx, type)}`;
/** media-led vs type-led layout families (H35 rule 2); `grid` is neither */
const lead = (f: LayoutFamily): "media" | "type" | null => (f === "media" || f === "split" ? "media" : f === "grid" ? null : "type");
/** the G20.p letter a block wants: A = dense / media, B = a quiet block, C = in between */
function densityLetter(ctx: ChoreographyCtx, type: string): "A" | "B" | "C" {
  const f = familyOf(ctx, type);
  if (f === "statement" || type === "guarantee" || type === "faq") return "B";
  if (f === "grid" || f === "table" || f === "media" || type === "offer") return "A";
  return "C";
}

/** Per-context memo of `px` (the draws and repairs read one type's height many times). */
const PX_MEMO = new WeakMap<ChoreographyCtx, Map<string, number>>();

/** The section's estimated px at 390 (spacing as spacingFor gives it, without the previous section's density). */
function px(ctx: ChoreographyCtx, type: string): number {
  let memo = PX_MEMO.get(ctx);
  if (!memo) PX_MEMO.set(ctx, (memo = new Map()));
  const hit = memo.get(type);
  if (hit !== undefined) return hit;
  const v = variantOf(ctx, type);
  const f = variantFeatures(type, v, null);
  const spacing = STRIPS.has(type) ? "tight" : AIRY.has(type) || AIRY.has(`${type}:${v}`) ? "airy" : "normal";
  const out = sectionPxOf(f, type, v, spacing, { dens: ctx.density.l, space: ctx.space ?? 1 }, ctx.form ?? { offers: 3, groups: 0, bump: false }, true);
  memo.set(type, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* material (DS42, I6)                                                 */
/* ------------------------------------------------------------------ */

/** Whether the inputs can fill a block type (DS42, I6, H36). */
export function canFill(ctx: ChoreographyCtx, type: string): boolean {
  if (ctx.exists && !ctx.exists(type)) return false;
  const h = ctx.has;
  switch (type) {
    case "reviews":
    case "socialProof":
      return h.ownerProof;
    case "stats":
      return (h.figures ?? 0) >= 2;
    case "video":
      return h.video;
    case "beforeAfter":
      return !!h.beforeAfter;
    case "gallery":
      return h.photos >= 3;
    case "showcase":
      return h.photos >= 2;
    case "offer":
      return (h.offers ?? 0) >= 2;
    case "specs":
      return !(h.garment && !h.facts);
    case "marquee":
      return ctx.mood.mood !== "calm" && ctx.grammar !== "quiet-luxe" && ctx.grammar !== "catalogue";
    default:
      return true;
  }
}

function resolveSlot(ctx: ChoreographyCtx, slot: Slot, used: ReadonlySet<string>, rng: () => number): string | null {
  const ok = (t: string) => !used.has(t) && canFill(ctx, t);
  const aff = AFFINITY[ctx.vibe];
  switch (slot) {
    case "Promise":
      return ok("benefits") ? "benefits" : null;
    case "Problem":
      return ok("problem") ? "problem" : null;
    case "Objection":
      return ok("faq") ? "faq" : null;
    case "Proof":
      return pickW(rng, [
        { value: "reviews", w: ok("reviews") ? 0.45 : 0 },
        { value: "socialProof", w: ok("socialProof") ? 0.35 * (0.5 + (aff.socialProof ?? 0.5)) : 0 },
        { value: "stats", w: ok("stats") ? 0.2 : 0 },
      ]);
    case "Visual":
      return pickW(rng, [
        { value: "showcase", w: ok("showcase") ? 0.45 : 0 },
        { value: "gallery", w: ok("gallery") ? 0.35 * (0.5 + (aff.gallery ?? 0.5)) : 0 },
        { value: "video", w: ok("video") ? 0.15 : 0 },
        { value: "beforeAfter", w: ok("beforeAfter") ? 0.1 : 0 },
      ]);
  }
}

/* ------------------------------------------------------------------ */
/* Act2 ordering (H35, DS53)                                           */
/* ------------------------------------------------------------------ */

export interface OrderOpts {
  familyOf?: (type: string) => LayoutFamily;
  /** the `arrange` of a section (DG-15, R3); absent = none (rule 5 then holds trivially) */
  arrangeOf?: (type: string) => string | undefined;
  imageText?: (type: string) => boolean;
  letterOf?: (type: string) => "A" | "B" | "C";
  /** the sections around Act2 (the form before, the close after): rules 2, 3 and 5 read across the boundaries */
  before?: readonly string[];
  after?: readonly string[];
}

function permutations<T>(list: readonly T[]): T[][] {
  if (list.length <= 1) return [list.slice()];
  const out: T[][] = [];
  list.forEach((x, i) => {
    for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
}

/** The longest run of image + text splits in a sequence (H35 rule 3). */
export function imageTextRun(seq: readonly string[], isIt: (t: string) => boolean): number {
  let run = 0;
  let best = 0;
  for (const t of seq) {
    run = isIt(t) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * The constrained Act2 ordering (DES-§5.1 "Act2 order", H35): (1) the density pattern G20.p (ABAC / AAB / ABAB) is
 * honoured where the blocks allow, (2) media-led and type-led families alternate, (3) ≤ 2 image + text splits in a
 * row, (5) no two neighbours with the same `arrange`. Rules 3 and 5 are hard (when any order satisfies them), 1 and 2
 * are scored; ties are broken by the seed. Rule 4 (≥ 4 families per 8 sections) is a property of the blocks, checked
 * by the expansion.
 */
export function orderAct2(blocks: readonly string[], p: PageGenes["G20"]["p"], rng: () => number, opts: OrderOpts = {}): string[] {
  if (blocks.length <= 1) return [...blocks];
  const fam = opts.familyOf ?? (() => "list" as LayoutFamily);
  const it = opts.imageText ?? (() => false);
  const arr = opts.arrangeOf ?? (() => undefined);
  const letter = opts.letterOf ?? (() => "C" as const);
  const before = opts.before ?? [];
  const after = opts.after ?? [];
  const scored = permutations(blocks).map((perm) => {
    const seq = [...before, ...perm, ...after];
    let hard = 0;
    if (imageTextRun(seq, it) > 2) hard++;
    for (let i = 1; i < seq.length; i++) {
      const a = arr(seq[i - 1]!);
      if (a !== undefined && a === arr(seq[i]!)) hard++;
    }
    let soft = 0;
    // rule 1: a dense block never sits on a B slot of the pattern, a quiet block never on an A slot
    perm.forEach((t, i) => {
      const want = p[i % p.length]!;
      const got = letter(t);
      if ((want === "B" && got === "A") || (want === "A" && got === "B")) soft++;
    });
    // rule 2: two media-led or two type-led neighbours
    for (let i = 1; i < seq.length; i++) {
      const a = lead(fam(seq[i - 1]!));
      if (a !== null && a === lead(fam(seq[i]!))) soft++;
    }
    return { perm, hard, soft };
  });
  const minHard = Math.min(...scored.map((s) => s.hard));
  const pool = scored.filter((s) => s.hard === minHard);
  const minSoft = Math.min(...pool.map((s) => s.soft));
  const best = pool.filter((s) => s.soft === minSoft);
  return best[Math.floor(rng() * best.length)]!.perm;
}

/* ------------------------------------------------------------------ */
/* checks (I2, I3, I4, I8, H35)                                        */
/* ------------------------------------------------------------------ */

export interface ChoreographyEstimate {
  formTop: number;
  total: number;
  count: number;
  /** the top of each in-flow section at 390 */
  tops: number[];
}

/** The height estimate of an in-flow list with the page's top bars and footer. */
export function estimateChoreography(ctx: ChoreographyCtx, inFlow: readonly string[]): ChoreographyEstimate {
  let y = ROW.header + (ctx.announcement ? ROW.announcement : 0);
  const tops: number[] = [];
  let formTop = Number.POSITIVE_INFINITY;
  for (const t of inFlow) {
    tops.push(y);
    if (t === "orderForm" && formTop === Number.POSITIVE_INFINITY) formTop = y;
    y += px(ctx, t);
  }
  y += px(ctx, "footer");
  return { formTop, total: y, count: inFlow.length + 2 + (ctx.announcement ? 1 : 0), tops };
}

/** The invariants an in-flow list breaks (empty = it holds): I2, I3, I4, I8 and the H35 page rules (3, 4). */
export function choreographyViolations(ctx: ChoreographyCtx, inFlow: readonly string[]): string[] {
  const out: string[] = [];
  const e = estimateChoreography(ctx, inFlow);
  if (inFlow[0] !== "hero") out.push("I1: the hero is not first");
  if (!(e.formTop <= FORM_TOP_TARGET)) out.push(`I2: the form starts at ${Math.round(e.formTop)} px > ${FORM_TOP_TARGET} (I2 ${FORM_TOP_MAX} with the planner's margin)`);
  const offerAt = inFlow.indexOf("offer");
  const ctaAt = inFlow.lastIndexOf("cta");
  if (offerAt >= 0 && ctaAt >= 0 && offerAt > ctaAt) out.push("I3: the offer after the final cta");
  const half = e.total / 2;
  // the final cta is the page's last moment, never its top-half one
  if (!inFlow.some((t, i) => i > 0 && MOMENT_TYPES.has(t) && t !== "cta" && e.tops[i]! < half)) out.push("I4: no colour moment can start in the top half");
  if (e.count < SECTIONS_MIN || e.count > SECTIONS_MAX) out.push(`I8: ${e.count} sections (${SECTIONS_MIN}-${SECTIONS_MAX})`);
  if (e.total > HEIGHT_TARGET) out.push(`I8: ${Math.round(e.total)} px > ${HEIGHT_TARGET} (I8 ${HEIGHT_MAX} with the planner's margin)`);
  if (new Set(inFlow).size !== inFlow.length) out.push("a type twice");
  if (imageTextRun(inFlow.map((t) => key(ctx, t)), (k) => IMAGE_TEXT.has(k)) > 2) out.push("H35: 3 image + text splits in a row");
  const families = new Set(inFlow.map((t) => familyOf(ctx, t))).size;
  if (families < (inFlow.length >= 7 ? 4 : 3)) out.push(`H35: ${families} layout families`);
  return out;
}

/* ------------------------------------------------------------------ */
/* 4-grams (DES-§5.1, N3)                                              */
/* ------------------------------------------------------------------ */

const gramKey = (g: readonly number[]) => g.join(",");
function grams(tokens: readonly number[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 4 <= tokens.length; i++) out.add(gramKey(tokens.slice(i, i + 4)));
  return out;
}

/** The 4-grams a new page must not repeat: ≥ 50 % of the store's own pages or of the niche's pool. */
export function bannedGrams(own: readonly (readonly number[])[] | undefined, seq4: ChoreographyCtx["seq4"]): Set<string> {
  const out = new Set<string>();
  for (const g of seq4 ?? []) if (g.share >= 0.5 && g.gram.length === 4) out.add(gramKey(g.gram));
  const pages = own ?? [];
  if (pages.length) {
    const counts = new Map<string, number>();
    for (const p of pages) for (const g of grams(p)) counts.set(g, (counts.get(g) ?? 0) + 1);
    for (const [g, c] of counts) if (c / pages.length >= 0.5) out.add(g);
  }
  return out;
}

/** The in-flow tokens after the hero (the distance view's `seq`). */
export const seqTokens = (ctx: ChoreographyCtx, inFlow: readonly string[]) => inFlow.filter((t) => t !== "hero").map((t) => sectionToken(t, variantOf(ctx, t)));

/* ------------------------------------------------------------------ */
/* expansion (DES-§5.5)                                                */
/* ------------------------------------------------------------------ */

function act2Length(ctx: ChoreographyCtx, rng: () => number): number {
  const l = ctx.density.l;
  const table = l === "dense" ? [[2, 0.15], [3, 0.35], [4, 0.3], [5, 0.2]] : l === "airy" ? [[1, 0.2], [2, 0.45], [3, 0.35]] : [[2, 0.25], [3, 0.45], [4, 0.3]];
  return pickW(rng, table.map(([value, w]) => ({ value: value!, w: w! })))!;
}

/** One draw of the grammar (no checks). */
function draw(ctx: ChoreographyCtx, rng: () => number): { inFlow: string[]; act2: string[] } {
  const used = new Set<string>(["hero", "orderForm"]);
  const g = ctx.grammar;
  const vibe = ctx.vibe;
  // Strip
  const stripPick = pickW(rng, [
    { value: "trustBar", w: canFill(ctx, "trustBar") ? 0.6 : 0 },
    { value: "marquee", w: canFill(ctx, "marquee") ? 0.25 : 0 },
    { value: "", w: 0.15 },
  ]);
  let strip = stripPick ?? "";
  if (strip) used.add(strip);
  // Act1
  const visualUp = g === "gallery-led" || g === "cinematic" ? 1.5 : 1;
  const problemUp = vibe === "apothecary" || vibe === "hearth" || vibe === "kinetic" ? 1.5 : 1;
  const objectionUp = g === "specimen" || g === "catalogue" ? 2 : 1;
  const proofOk = canFill(ctx, "reviews") || canFill(ctx, "socialProof") || canFill(ctx, "stats");
  const visualOk = ["showcase", "gallery", "video", "beforeAfter"].some((t) => canFill(ctx, t));
  const act1Prod = pickW(
    rng,
    ACT1.map((p) => {
      let w = p.w;
      if (p.slots.includes("Visual")) w *= visualOk ? visualUp : 0;
      if (p.slots.includes("Problem")) w *= canFill(ctx, "problem") ? problemUp : 0;
      if (p.slots.includes("Proof")) w *= proofOk ? 1 : 0;
      if (p.slots.includes("Objection")) w *= canFill(ctx, "faq") ? objectionUp : 0;
      if (p.slots.includes("Promise")) w *= canFill(ctx, "benefits") ? 1 : 0;
      return { value: p.slots, w };
    }),
  ) ?? (["Promise"] as const);
  const act1: string[] = [];
  for (const slot of act1Prod) {
    const t = resolveSlot(ctx, slot, used, rng);
    if (t) {
      act1.push(t);
      used.add(t);
    }
  }
  // I2 decides the Act1 length (DES-§5.1 "≤ 2 blocks, I2 decides"): a block that pushes the form past 3 screens leaves
  // Act1 (it may still come back in Act2), then the strip
  const formTop = () => estimateChoreography(ctx, ["hero", ...(strip ? [strip] : []), ...act1, "orderForm"]).formTop;
  while (act1.length && formTop() > FORM_TOP_TARGET) used.delete(act1.pop()!);
  if (strip && formTop() > FORM_TOP_TARGET) {
    used.delete(strip);
    strip = "";
  }
  // Act2: the blocks, drawn without replacement
  const aff = AFFINITY[vibe];
  const n = act2Length(ctx, rng);
  const act2: string[] = [];
  let visualIn = act1.some((t) => VISUAL_TYPES.has(t));
  for (let k = 0; k < n; k++) {
    const cands: { value: string; w: number }[] = [];
    const add = (type: string, w: number) => {
      if (!used.has(type) && canFill(ctx, type) && w > 0) cands.push({ value: type, w });
    };
    for (const t of PROOF_TYPES) add(t, (t === "stats" ? 0.6 : 0.8) * (t === "socialProof" ? 0.5 + (aff.socialProof ?? 0.5) : 1));
    add("story", (aff.story ?? 0.5) * (g === "editorial-column" || g === "quiet-luxe" ? 1.6 : 1));
    add("comparison", (aff.comparison ?? 0.5) * (g === "split-tension" || g === "specimen" ? 1.6 : 1));
    add("specs", (aff.specs ?? 0.5) * (g === "specimen" || g === "catalogue" ? 1.6 : 1) * (ctx.has.facts ? 1 : 0.5));
    add("steps", 0.6);
    if (!visualIn) for (const t of VISUAL_TYPES) add(t, (t === "gallery" ? aff.gallery ?? 0.5 : t === "showcase" ? 0.7 : 0.4) * visualUp);
    add("problem", (aff.problem ?? 0.5) * 0.8);
    add("benefits", 1.2);
    add("offer", (ctx.has.offers ?? 0) >= 2 ? 1.1 : 0);
    add("guarantee", 0.6 * (vibe === "apothecary" || vibe === "hearth" || vibe === "field" ? 1.6 : 1));
    add("faq", 0.6);
    const t = pickW(rng, cands);
    if (!t) break;
    act2.push(t);
    used.add(t);
    if (VISUAL_TYPES.has(t)) visualIn = true;
  }
  // Close: ε only when an Act2 block already asks (offer:showcase, guarantee:split), which then closes the page
  const asks = act2.find((t) => CTA_LIKE.has(key(ctx, t)));
  const close =
    pickW(
      rng,
      CLOSE.map((c) => ({ value: c.blocks, w: c.blocks.length === 0 ? (asks ? c.w : 0) : c.blocks.every((t) => !used.has(t) && canFill(ctx, t)) ? c.w : 0 })),
    ) ?? ["cta"];
  for (const t of close) used.add(t);
  // I8 decides the Act2 length: the heaviest block leaves while the page is over 12,000 px (the closing block stays)
  const pinned = close.length === 0 ? asks : undefined;
  const total = () => estimateChoreography(ctx, ["hero", ...(strip ? [strip] : []), ...act1, "orderForm", ...act2, ...close]).total;
  while (act2.length > 1 && total() > HEIGHT_TARGET) {
    const drop = act2.filter((t) => t !== pinned).sort((a, b) => px(ctx, b) - px(ctx, a))[0];
    if (drop === undefined) break;
    act2.splice(act2.indexOf(drop), 1);
    used.delete(drop);
  }
  const opts: OrderOpts = {
    familyOf: (t) => familyOf(ctx, t),
    imageText: (t) => IMAGE_TEXT.has(key(ctx, t)),
    letterOf: (t) => densityLetter(ctx, t),
    before: ["orderForm"],
    after: pinned ? [pinned] : close,
  };
  const ordered = pinned ? [...orderAct2(act2.filter((t) => t !== pinned), ctx.density.p, rng, opts), pinned] : orderAct2(act2, ctx.density.p, rng, opts);
  return { inFlow: ["hero", ...(strip ? [strip] : []), ...act1, "orderForm", ...ordered, ...close], act2: ordered };
}

/** The slots of an accepted sequence (DES-§5.5 step 4). */
function slotsOf(ctx: ChoreographyCtx, inFlow: readonly string[], e: ChoreographyEstimate): Pick<Choreography, "record" | "quiet"> {
  const half = e.total / 2;
  const budget = Math.max(1, Math.min(ctx.moments ?? 2, 4));
  const moments: number[] = [];
  const first = inFlow.findIndex((t, i) => i > 0 && MOMENT_TYPES.has(t) && t !== "cta" && e.tops[i]! < half);
  if (first >= 0) moments.push(first);
  const finalCta = inFlow.lastIndexOf("cta");
  if (finalCta >= 0 && moments.length < budget && !moments.includes(finalCta)) moments.push(finalCta);
  const cross = inFlow.findIndex((t) => key(ctx, t) === "showcase:figure" || key(ctx, t) === "story:image-text" || t === "showcase");
  const quiet = inFlow.findIndex((t, i) => i > 0 && (familyOf(ctx, t) === "statement" || t === "cta"));
  return {
    record: { seq: inFlow.map((t) => key(ctx, t)).slice(0, 40), moments: moments.sort((a, b) => a - b), cross: cross >= 0 ? cross : null, signature: 0 },
    quiet: quiet >= 0 ? quiet : null,
  };
}

/**
 * The in-flow sequence of a page (DES-§5.5 steps 1, 2 and 4): ≤ 50 draws from `rng` until I2-I4, I8 and the H35 page
 * rules hold, the 4-gram re-draw inside them; null after 50 (the caller uses `choreographyFallback` and records
 * `why += "design.why.fallbackOrder"`). Step 3 (the rhythm planners) and the fold are the planner's (src/lib/generator/plan.ts).
 */
export function expandChoreography(ctx: ChoreographyCtx, rng: () => number): Choreography | null {
  const banned = bannedGrams(ctx.own, ctx.seq4);
  let redraws = 0;
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const { inFlow, act2 } = draw(ctx, rng);
    if (choreographyViolations(ctx, inFlow).length) continue;
    if (banned.size && redraws < MAX_REDRAWS && [...grams(seqTokens(ctx, inFlow))].some((g) => banned.has(g))) {
      redraws++;
      continue;
    }
    const e = estimateChoreography(ctx, inFlow);
    const { record, quiet } = slotsOf(ctx, inFlow, e);
    return { inFlow, record, quiet, density: act2.map((t) => densityLetter(ctx, t)), estimate: { formTop: e.formTop, total: e.total, count: e.count }, tries };
  }
  return null;
}

/** The blocks a fallback may add, lightest kind first (each still needs its material, DS42). */
const FALLBACK_FILL: readonly string[] = ["guarantee", "steps", "faq", "problem", "story", "showcase", "comparison", "specs", "benefits"];

/**
 * The fallback orders (DES-§5.5 step 5): three short orders with the form right after the opening. Each is repaired
 * against the page's own variants until it holds I1-I8 and the H35 page rules: a block the inputs cannot fill leaves,
 * the heaviest optional block leaves while the form starts past 3 screens or the page is over 12,000 px, a light block
 * is added while the page has fewer than 8 sections or too few layout families, and a moment-capable block moves up
 * when no colour moment can start in the top half. The vibe's order is tried first; the first that holds is returned
 * (the one with the fewest violations otherwise).
 */
export function choreographyFallback(ctx: ChoreographyCtx): string[] {
  const visual = canFill(ctx, "showcase") ? "showcase" : "story";
  const orders: readonly (readonly string[])[] = [
    ["hero", "trustBar", "orderForm", "benefits", visual, "steps", "guarantee", "cta"],
    ["hero", "trustBar", "orderForm", "problem", "benefits", "story", "faq", "cta"],
    ["hero", "orderForm", "benefits", visual, "steps", (ctx.has.offers ?? 0) >= 2 ? "offer" : "guarantee", "faq", "cta"],
  ];
  const pref: Readonly<Record<Archetype, number>> = { maison: 1, apothecary: 1, souk: 1, playground: 2, kinetic: 0, circuit: 0, hearth: 0, bloom: 2, field: 1, editorial: 1, garage: 0 };
  const first = pref[ctx.vibe];
  let best: { order: string[]; faults: number } | null = null;
  for (const k of [first, (first + 1) % 3, (first + 2) % 3]) {
    const order = repairOrder(ctx, orders[k]!);
    const faults = choreographyViolations(ctx, order).length;
    if (faults === 0) return order;
    if (!best || faults < best.faults) best = { order, faults };
  }
  return best!.order;
}

const FIXED: ReadonlySet<string> = new Set(["hero", "orderForm", "cta"]);

/** One fallback order repaired against the page's variants and material (≤ 12 rounds). */
function repairOrder(ctx: ChoreographyCtx, base: readonly string[]): string[] {
  let order = base.filter((t, i) => base.indexOf(t) === i && (FIXED.has(t) || canFill(ctx, t)));
  const optional = (list: readonly string[], from = 0) => list.filter((t, i) => i >= from && !FIXED.has(t));
  for (let round = 0; round < 12; round++) {
    const e = estimateChoreography(ctx, order);
    const v = choreographyViolations(ctx, order);
    if (!v.length) break;
    const formAt = order.indexOf("orderForm");
    if (e.formTop > FORM_TOP_TARGET) {
      // the heaviest block above the form leaves
      const above = optional(order.slice(0, formAt));
      const drop = above.sort((a, b) => px(ctx, b) - px(ctx, a))[0];
      if (drop) {
        order = order.filter((t) => t !== drop);
        continue;
      }
    }
    if (e.total > HEIGHT_TARGET && e.count > SECTIONS_MIN) {
      const drop = optional(order, formAt + 1).sort((a, b) => px(ctx, b) - px(ctx, a))[0];
      if (drop) {
        order = order.filter((t) => t !== drop);
        continue;
      }
    }
    const fewFamilies = v.some((x) => x.startsWith("H35:") && x.includes("families"));
    if (e.count < SECTIONS_MIN || fewFamilies || e.total > HEIGHT_TARGET) {
      // a light block of a family the page lacks (or the lightest) goes in before the close; with a page over the
      // height cap the heaviest optional block is swapped for it
      const families = new Set(order.map((t) => familyOf(ctx, t)));
      const cands = FALLBACK_FILL.filter((t) => !order.includes(t) && canFill(ctx, t)).sort((a, b) => px(ctx, a) - px(ctx, b));
      const pick = (fewFamilies ? cands.find((t) => !families.has(familyOf(ctx, t))) : undefined) ?? cands[0];
      if (pick) {
        if (e.total > HEIGHT_TARGET) {
          const heavy = optional(order, formAt + 1).sort((a, b) => px(ctx, b) - px(ctx, a))[0];
          if (heavy && px(ctx, heavy) > px(ctx, pick)) order = order.filter((t) => t !== heavy);
          else break;
        }
        const at = order.lastIndexOf("cta");
        order = [...order.slice(0, at), pick, ...order.slice(at)];
        continue;
      }
    }
    if (v.some((x) => x.startsWith("I4"))) {
      // the first moment-capable block after the form moves right under it
      const m = order.findIndex((t, i) => i > formAt && MOMENT_TYPES.has(t) && t !== "cta");
      if (m > formAt + 1) {
        const t = order[m]!;
        order = order.filter((x) => x !== t);
        order.splice(formAt + 1, 0, t);
        continue;
      }
      const add = ["steps", "story", "problem", "showcase"].find((t) => !order.includes(t) && canFill(ctx, t));
      if (add) {
        order.splice(formAt + 1, 0, add);
        continue;
      }
    }
    if (v.some((x) => x.startsWith("H35: 3 image"))) {
      // break the run: the order form's neighbour goes to the end of Act2
      const t = order[formAt + 1];
      if (t && !FIXED.has(t)) {
        order = order.filter((x) => x !== t);
        order.splice(order.lastIndexOf("cta"), 0, t);
        continue;
      }
    }
    break;
  }
  return order;
}
