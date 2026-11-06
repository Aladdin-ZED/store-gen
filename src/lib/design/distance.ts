/**
 * Genome distance (P6 DESIGN; design.md DES-§7.1, DES-§7.2, DES-§7.9, DS6, DS7, DS57, QUAL-3, QUAL-4, QUAL-28;
 * docs/STORE-SAAS.md §K.2 P0 design stubs). Pure and isomorphic: `genomeDistance(a, b, scope)` in [0, 1], symmetric,
 * d(a, a) = 0, over the views stored in `design_genomes.vec`.
 *
 * `d(a, b) = Σ wᵢ · dᵢ / Σ wᵢ` over the components of the scope (DES-§7.2: full 40 = page 21 + brand 19). The type
 * pairing is locale-aware (QUAL-28): Latin pages compare the pairing and the Latin display family, Arabic pages the
 * Arabic display and body faces, a cross-locale pair both display faces. `bounds` gives the cheap lower and upper
 * bounds (the Levenshtein of the sequence and the two Jaccards of the copy structure and the openers left out, DS57),
 * so the novelty service computes a full distance only for the rows the bounds cannot decide. `tauNiche` is the
 * pool-size niche threshold of DES-§7.9; `crowdView` the synthetic "crowd" reference of the repulsion step, built from
 * the niche shares' modal values (never another store's vector).
 */
import { ALIGN_BIASES, BUTTONS, DENSITY_LEVELS, EMPHASES, GLYPHS } from "./vocab";
import { COLOR_STRATEGIES, DEPTHS, EASE_FAMILIES, GRAMMARS, HEADLINE_STRUCTURES, LADDERS, MASKS, OPENERS, TREATMENTS, type DesignGenome } from "./genome";
import type { Locale, ThemeSpec } from "@/lib/page/schema";
import { hexToOklab } from "@/lib/theme/color";
import { CROPS } from "./consts";
import { FIXED_TYPES } from "./derive";
import type { NicheShares } from "./novelty.server";
import { sharesActive } from "./priors";
import { fontToken, heroToken, pairingToken, sectionToken } from "./tokens-table";
import type { Band } from "./types";

export interface DistanceView {
  v: 2;
  kind: "page" | "brand";
  /** rev 3 (QUAL-28): the rendered script decides which display face counts */
  locale: "ar" | "fr" | "en";
  /** indices into GENE_VOCAB value lists, -1 = n/a */
  cat: {
    grammar: number;
    strategy: number;
    treatment: number;
    pairing: number;
    displayFamily: number;
    arDisplay: number;
    bodyAr: number;
    base: number;
    ladder: number;
    mask: number;
    depth: number;
    button: number;
    emphasis: number;
    glyph: number;
    motion: number;
    density: number;
    align: number;
  };
  /** OKLab of the compiled palette */
  accent: [number, number, number];
  pop: [number, number, number];
  /** normalised 0..1 by the gene ranges (ctas / 6, (nSections − 8) / 6) */
  num: { rd: number; w: number; space: number; area: number; ctas: number; nSections: number };
  /** token id of hero variant + arrangement */
  hero: number;
  /** ≤ 24 token ids of in-flow "type:variant" */
  seq: number[];
  /** 7-bin histogram of G29 over titles, normalised */
  tags: number[];
  /** 6-bin histogram of G32 openers, normalised */
  openers: number[];
  /** bitmask of the crop families used (full / tight / context / bleed) */
  crops: number;
}

type Scope = "full" | "page" | "brand";
const CAT_KEYS = ["grammar", "strategy", "treatment", "pairing", "displayFamily", "arDisplay", "bodyAr", "base", "ladder", "mask", "depth", "button", "emphasis", "glyph", "motion", "density", "align"] as const;
const NUM_KEYS = ["rd", "w", "space", "area", "ctas", "nSections"] as const;
const BASES = ["light", "tinted", "dark"] as const;
const SEQ_MAX = 24;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ------------------------------------------------------------------ */
/* components and weights (DES-§7.2)                                   */
/* ------------------------------------------------------------------ */

const catD = (x: number, y: number) => (x === y ? 0 : 1);

/** The locale-aware type pairing component (QUAL-28). */
export function pairingDistance(a: DistanceView, b: DistanceView): number {
  const A = a.cat;
  const B = b.cat;
  const same = (x: number, y: number) => x >= 0 && x === y;
  const arA = a.locale === "ar";
  const arB = b.locale === "ar";
  if (!arA && !arB) {
    if (A.pairing === B.pairing && (A.pairing >= 0 || (A.displayFamily === B.displayFamily && A.arDisplay === B.arDisplay && A.bodyAr === B.bodyAr))) return 0;
    return same(A.displayFamily, B.displayFamily) ? 0.5 : 1;
  }
  if (arA && arB) {
    if (A.arDisplay === B.arDisplay && A.bodyAr === B.bodyAr) return 0;
    return same(A.arDisplay, B.arDisplay) ? 0.5 : 1;
  }
  return same(A.displayFamily, B.displayFamily) && same(A.arDisplay, B.arDisplay) ? 0.5 : 1;
}

const oklabD = (x: readonly number[], y: readonly number[]) => Math.min(1, Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!) / 0.15);

/** Levenshtein distance over token lists, normalised by the longer list (0 when both are empty). */
export function levenshteinNorm(a: readonly number[], b: readonly number[]): number {
  if (!a.length && !b.length) return 0;
  if (!a.length || !b.length) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]! / Math.max(a.length, b.length);
}

/** 1 − the weighted Jaccard of two histograms (Σ min / Σ max); 0 when both are empty. */
export function weightedJaccardD(a: readonly number[], b: readonly number[]): number {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    lo += Math.min(x, y);
    hi += Math.max(x, y);
  }
  return hi <= 0 ? 0 : 1 - lo / hi;
}

const popcount = (n: number) => {
  let c = 0;
  for (let x = n >>> 0; x; x &= x - 1) c++;
  return c;
};
const bitJaccardD = (a: number, b: number) => {
  const u = popcount(a | b);
  return u === 0 ? 0 : 1 - popcount(a & b) / u;
};

interface Component {
  key: string;
  w: number;
  scope: "page" | "brand";
  /** false = one of the three costly components (sequence, copy structure, openers) the bounds leave out */
  cheap: boolean;
  d(a: DistanceView, b: DistanceView): number;
}

/** The DES-§7.2 table (unit-tested: Σ w = 40 / 21 / 19). */
export const COMPONENTS: readonly Component[] = [
  { key: "grammar", w: 3, scope: "page", cheap: true, d: (a, b) => catD(a.cat.grammar, b.cat.grammar) },
  { key: "strategy", w: 3, scope: "brand", cheap: true, d: (a, b) => catD(a.cat.strategy, b.cat.strategy) },
  { key: "treatment", w: 3, scope: "page", cheap: true, d: (a, b) => catD(a.cat.treatment, b.cat.treatment) },
  { key: "pairing", w: 3, scope: "brand", cheap: true, d: pairingDistance },
  { key: "accent", w: 2, scope: "brand", cheap: true, d: (a, b) => oklabD(a.accent, b.accent) },
  { key: "pop", w: 1, scope: "brand", cheap: true, d: (a, b) => oklabD(a.pop, b.pop) },
  ...(["base", "ladder", "mask", "depth", "button", "emphasis", "glyph"] as const).map(
    (k): Component => ({ key: k, w: 1, scope: "brand", cheap: true, d: (a, b) => catD(a.cat[k], b.cat[k]) }),
  ),
  { key: "motion", w: 1, scope: "brand", cheap: true, d: (a, b) => catD(a.cat.motion, b.cat.motion) },
  { key: "rd", w: 1, scope: "brand", cheap: true, d: (a, b) => Math.abs(a.num.rd - b.num.rd) },
  { key: "w", w: 1, scope: "brand", cheap: true, d: (a, b) => Math.abs(a.num.w - b.num.w) },
  { key: "space", w: 1, scope: "page", cheap: true, d: (a, b) => Math.abs(a.num.space - b.num.space) },
  { key: "area", w: 1, scope: "page", cheap: true, d: (a, b) => Math.abs(a.num.area - b.num.area) },
  { key: "density", w: 1, scope: "page", cheap: true, d: (a, b) => catD(a.cat.density, b.cat.density) },
  { key: "align", w: 1, scope: "page", cheap: true, d: (a, b) => catD(a.cat.align, b.cat.align) },
  { key: "seq", w: 3, scope: "page", cheap: false, d: (a, b) => levenshteinNorm(a.seq, b.seq) },
  { key: "hero", w: 2, scope: "page", cheap: true, d: (a, b) => catD(a.hero, b.hero) },
  { key: "tags", w: 2, scope: "page", cheap: false, d: (a, b) => weightedJaccardD(a.tags, b.tags) },
  { key: "openers", w: 1, scope: "page", cheap: false, d: (a, b) => weightedJaccardD(a.openers, b.openers) },
  { key: "crops", w: 1, scope: "page", cheap: true, d: (a, b) => bitJaccardD(a.crops, b.crops) },
  { key: "ctas", w: 1, scope: "page", cheap: true, d: (a, b) => Math.abs(a.num.ctas - b.num.ctas) },
  { key: "nSections", w: 1, scope: "page", cheap: true, d: (a, b) => Math.abs(a.num.nSections - b.num.nSections) },
];

const inScope = (c: Component, scope: Scope) => scope === "full" || c.scope === scope;
/** Σ w per scope: full 40, page 21, brand 19. */
export const weightSum = (scope: Scope) => COMPONENTS.reduce((s, c) => s + (inScope(c, scope) ? c.w : 0), 0);
const W = { full: weightSum("full"), page: weightSum("page"), brand: weightSum("brand") } as const;

/** [0, 1], symmetric, d(a, a) = 0 (DES-§7.2 weights: full 40, page 21, brand 19). */
export function genomeDistance(a: DistanceView, b: DistanceView, scope: "full" | "page" | "brand" = "full"): number {
  let s = 0;
  for (const c of COMPONENTS) if (inScope(c, scope)) s += c.w * c.d(a, b);
  return clamp01(s / W[scope]);
}

/** The cheap bounds (DS57): `lo` with the three costly components at 0, `hi` with them at 1; lo ≤ d ≤ hi. */
export function bounds(a: DistanceView, b: DistanceView, scope: "full" | "page" | "brand" = "full"): { lo: number; hi: number } {
  let s = 0;
  let open = 0;
  for (const c of COMPONENTS) {
    if (!inScope(c, scope)) continue;
    if (c.cheap) s += c.w * c.d(a, b);
    else open += c.w;
  }
  return { lo: s / W[scope], hi: Math.min(1, (s + open) / W[scope]) };
}

/** The band of a distance against a threshold (DES-§7.4): ok ≥ τ + 0.05, close in [τ, τ + 0.05), too_close below. */
export const bandOf = (d: number, tau: number): Band => (d >= tau + 0.05 - 1e-12 ? "ok" : d >= tau - 1e-12 ? "close" : "too_close");

/**
 * The band of a pair, the cheap part first (DS57): the bounds decide when `lo ≥ τ + 0.05` (ok) or `hi < τ`
 * (too_close); only the rows in between compute the sequence Levenshtein and the two Jaccards. Equals
 * `bandOf(genomeDistance(a, b, scope), tau)` on every pair (asserted on 10,000 random pairs).
 */
export function distanceBand(a: DistanceView, b: DistanceView, tau: number, scope: "full" | "page" | "brand" = "full"): { band: Band; full: boolean } {
  const { lo, hi } = bounds(a, b, scope);
  if (lo >= tau + 0.05 - 1e-12) return { band: "ok", full: false };
  if (hi < tau - 1e-12) return { band: "too_close", full: false };
  return { band: bandOf(genomeDistance(a, b, scope), tau), full: true };
}

/**
 * The pool-size niche threshold (DES-§7.9): 0.40 (`base`) while n ≤ 20 live stores, linear to base − 0.10 at n ≥ 100,
 * never below the platform band + 0.05.
 */
export function tauNiche(n: number, base = 0.4, platform = 0.25): number {
  return Math.max(platform + 0.05, base - 0.1 * Math.min(1, Math.max(0, (n - 20) / 80)));
}

/**
 * The niche key (DES-§7.3): `market + ":" + family`, the family being the store's category when the owner set it,
 * else the product's copy family (`copyFamily()`; for a store-level genome the modal family of its active products),
 * else "general", which pools only with other "general" stores. Stores in two markets share the platform threshold,
 * never the niche one.
 */
export function nicheKey(market: string, category: string | null | undefined, family?: string | null): string {
  const clean = (v: string | null | undefined) => (typeof v === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(v) ? v : null);
  return `${market}:${clean(category) ?? clean(family) ?? "general"}`;
}

/* ------------------------------------------------------------------ */
/* the view of a genome                                                */
/* ------------------------------------------------------------------ */

/** The script a page renders in (Arabic, or a Latin locale; the Latin locales beyond fr / en read as en). */
export const viewLocale = (l: Locale): DistanceView["locale"] => (l === "ar" ? "ar" : l === "fr" ? "fr" : "en");
const lab = (hex: string): [number, number, number] => {
  const o = hexToOklab(hex);
  return [r3(o.l), r3(o.a), r3(o.b)];
};
const hist = (values: readonly string[], bins: readonly string[]) => {
  const h = bins.map(() => 0);
  for (const v of values) {
    const i = bins.indexOf(v);
    if (i >= 0) h[i]!++;
  }
  const n = values.length;
  return h.map((c) => (n ? r3(c / n) : 0));
};
const at = (list: readonly string[], v: string) => list.indexOf(v);

/** The distance view of a genome and its compiled theme (DES-§7.1, rev 3: the page locale decides the faces). */
export function distanceView(g: DesignGenome, compiled: { theme: ThemeSpec }, locale: Locale, kind: "page" | "brand" = "page"): DistanceView {
  const t = compiled.theme;
  const ar = locale === "ar";
  const flow = g.sections.filter((s) => !FIXED_TYPES.has(s.type));
  const hero = flow.find((s) => s.type === "hero");
  const seq = flow.filter((s) => s !== hero).map((s) => sectionToken(s.type, s.variant)).slice(0, SEQ_MAX);
  let crops = 0;
  for (const uses of Object.values(g.page.G33.uses)) for (const u of uses) crops |= 1 << CROPS.indexOf(u.crop);
  const titles = g.sections.flatMap((s) => (s.G29 ? [s.G29] : []));
  return {
    v: 2,
    kind,
    locale: viewLocale(locale),
    cat: {
      grammar: at(GRAMMARS, g.page.G2),
      strategy: at(COLOR_STRATEGIES, g.brand.G9),
      treatment: at(TREATMENTS, g.page.G18),
      pairing: pairingToken(g.brand.G4),
      displayFamily: fontToken(t.fonts.display),
      arDisplay: fontToken(t.fonts.displayAr),
      bodyAr: fontToken(t.fonts.bodyAr),
      base: at(BASES, t.palette.base),
      ladder: at(LADDERS, g.brand.G12),
      mask: at(MASKS, g.brand.G17),
      depth: at(DEPTHS, g.brand.G15),
      button: at(BUTTONS, g.brand.G27),
      emphasis: at(EMPHASES, g.brand.G26),
      glyph: at(GLYPHS, g.brand.G25.gl),
      motion: at(EASE_FAMILIES, g.brand.G23.f),
      density: at(DENSITY_LEVELS, g.page.G20.l),
      align: at(ALIGN_BIASES, g.page.G22),
    },
    accent: lab(t.palette.accent),
    pop: lab(t.palette.pop),
    num: {
      rd: r3(clamp01((g.brand.G5.rd - 1.2) / 0.3)),
      w: r3(clamp01(((ar ? g.brand.G6.wAr : g.brand.G6.w) - 100) / 800)),
      space: r3(clamp01((g.page.G21 - 0.75) / 0.85)),
      area: r3(clamp01((g.page.G10 - 0.03) / 0.32)),
      ctas: r3(clamp01(g.page.G34.primary.length / 6)),
      nSections: r3(clamp01((flow.length - 8) / 6)),
    },
    hero: hero ? heroToken(hero.variant, hero.arrange) : -1,
    seq,
    tags: hist(titles, HEADLINE_STRUCTURES),
    openers: hist(g.page.G32.openers, OPENERS),
    crops,
  };
}

/* ------------------------------------------------------------------ */
/* the packed vector (design_genomes.vec)                              */
/* ------------------------------------------------------------------ */

const LOCALES_V = ["ar", "fr", "en"] as const;
const K = 1000;
/** Fixed head length: v, kind, locale, 17 cats, 3 + 3 colours, 6 nums, hero, 7 tags, 6 openers, crops, seq length. */
const HEAD = 3 + CAT_KEYS.length + 6 + NUM_KEYS.length + 1 + 7 + 6 + 1 + 1;

/**
 * The offsets of the packed layout (the novelty pool reads the cheap components straight from the packed `Int16Array`,
 * DS57): `cat` + the index of a `CAT_KEYS` name, `num` + the index of a `NUM_KEYS` name.
 */
export const VEC = {
  kind: 1,
  locale: 2,
  cat: 3,
  accent: 3 + CAT_KEYS.length,
  pop: 6 + CAT_KEYS.length,
  num: 9 + CAT_KEYS.length,
  hero: 9 + CAT_KEYS.length + NUM_KEYS.length,
  tags: 10 + CAT_KEYS.length + NUM_KEYS.length,
  openers: 17 + CAT_KEYS.length + NUM_KEYS.length,
  crops: 23 + CAT_KEYS.length + NUM_KEYS.length,
  n: 24 + CAT_KEYS.length + NUM_KEYS.length,
  seq: HEAD,
} as const;
export const VEC_CAT: Readonly<Record<(typeof CAT_KEYS)[number], number>> = Object.fromEntries(CAT_KEYS.map((k, i) => [k, VEC.cat + i])) as Record<(typeof CAT_KEYS)[number], number>;
export const VEC_NUM: Readonly<Record<(typeof NUM_KEYS)[number], number>> = Object.fromEntries(NUM_KEYS.map((k, i) => [k, VEC.num + i])) as Record<(typeof NUM_KEYS)[number], number>;

/**
 * The `design_genomes.vec` layout: integers only (colours and fractions × 1,000), ≤ 400 B as JSON. `devices` (the
 * bitmask of the S26 tell devices on the page, `tellsMask`) is appended after the sequence when given: the niche
 * shares' `ghost` and `tells` maps read it from the pool (it is not part of the view or of any distance).
 */
export function packView(v: DistanceView, devices?: number): number[] {
  const q = (x: number) => Math.round(x * K);
  const tail = devices === undefined ? [] : [Math.max(0, Math.min(0x7fff, Math.trunc(devices)))];
  return [
    v.v,
    v.kind === "page" ? 0 : 1,
    LOCALES_V.indexOf(v.locale),
    ...CAT_KEYS.map((k) => v.cat[k]),
    ...v.accent.map(q),
    ...v.pop.map(q),
    ...NUM_KEYS.map((k) => q(v.num[k])),
    v.hero,
    ...Array.from({ length: 7 }, (_, i) => q(v.tags[i] ?? 0)),
    ...Array.from({ length: 6 }, (_, i) => q(v.openers[i] ?? 0)),
    v.crops,
    Math.min(SEQ_MAX, v.seq.length),
    ...v.seq.slice(0, SEQ_MAX),
    ...tail,
  ];
}

/** The tell-device bitmask a packed vector carries after its sequence (0 when it carries none). */
export function devicesOfVec(vec: ArrayLike<number>): number {
  const n = vec[VEC.n] ?? 0;
  return vec.length === HEAD + n + 1 ? (vec[HEAD + n] ?? 0) : 0;
}

/** The view of a packed vector (a trailing device mask is ignored); throws on a malformed one. */
export function unpackView(vec: readonly number[]): DistanceView {
  if (!Array.isArray(vec) || vec.length < HEAD || vec[0] !== 2 || !vec.every((x) => Number.isInteger(x))) throw new Error("distance view: not a v2 vector");
  let i = 3;
  const next = () => vec[i++]!;
  const cat = Object.fromEntries(CAT_KEYS.map((k) => [k, next()])) as DistanceView["cat"];
  const triple = (): [number, number, number] => [next() / K, next() / K, next() / K];
  const accent = triple();
  const pop = triple();
  const num = Object.fromEntries(NUM_KEYS.map((k) => [k, next() / K])) as DistanceView["num"];
  const hero = next();
  const tags = Array.from({ length: 7 }, () => next() / K);
  const openers = Array.from({ length: 6 }, () => next() / K);
  const crops = next();
  const n = next();
  if (n < 0 || n > SEQ_MAX || (vec.length !== HEAD + n && vec.length !== HEAD + n + 1)) throw new Error("distance view: bad sequence length");
  const seq = vec.slice(HEAD, HEAD + n);
  const locale = LOCALES_V[vec[2]!];
  if (!locale || (vec[1] !== 0 && vec[1] !== 1)) throw new Error("distance view: bad kind or locale");
  return { v: 2, kind: vec[1] === 0 ? "page" : "brand", locale, cat, accent, pop, num, hero, seq, tags, openers, crops };
}

/* ------------------------------------------------------------------ */
/* the crowd reference (DES-§4.4 repulsion, DES-§7.9 step 2)           */
/* ------------------------------------------------------------------ */

const modal = (m: Record<string, number>): string | null => {
  let best: string | null = null;
  let share = -1;
  for (const [k, v] of Object.entries(m).sort(([x], [y]) => (x < y ? -1 : 1))) if (v > share) [best, share] = [k, v];
  return best;
};

/**
 * The synthetic crowd view of a niche (k ≥ 10 stores, else null): `like` with the niche's modal grammar, strategy,
 * hero family (and arrangement, "variant/arrangement"), Latin display family, Arabic display face and motion family
 * substituted, so the distance to it measures how much `like` stands out of the crowd on the dimensions the crowd
 * defines. Never another store's vector.
 */
export function crowdView(shares: NicheShares | null | undefined, like: DistanceView): DistanceView | null {
  if (!sharesActive(shares)) return null;
  const v: DistanceView = { ...like, cat: { ...like.cat } };
  const g = modal(shares.grammar);
  if (g && GRAMMARS.includes(g as never)) v.cat.grammar = at(GRAMMARS, g);
  const s = modal(shares.strategy);
  if (s && COLOR_STRATEGIES.includes(s as never)) v.cat.strategy = at(COLOR_STRATEGIES, s);
  const arrangement = modal(shares.heroArrangement);
  const family = modal(shares.heroFamily);
  const hero = arrangement ? heroToken(arrangement.split("/")[0]!, arrangement.split("/")[1]) : family ? heroToken(family) : -1;
  if (hero >= 0) v.hero = hero;
  const d = modal(shares.displayFamily);
  if (d && fontToken(d) >= 0) {
    v.cat.displayFamily = fontToken(d);
    v.cat.pairing = -1;
  }
  const a = modal(shares.arDisplay);
  if (a && fontToken(a) >= 0) v.cat.arDisplay = fontToken(a);
  const m = modal(shares.motion);
  if (m && EASE_FAMILIES.includes(m as never)) v.cat.motion = at(EASE_FAMILIES, m);
  return v;
}

