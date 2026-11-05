/**
 * Copy contracts shared by the local AI (browser worker), the fallback copy library and the generator.
 *
 *  - PageCopy  every text the generator places on a page, for ONE locale. The hand-written library
 *              always produces a complete PageCopy; AI output is merged over it field by field.
 *  - AiCopy    the compact JSON the language model writes (one constrained call per locale).
 *              `AI_COPY_JSON_SCHEMA` is the same contract as JSON Schema for constrained decoding —
 *              only keywords the structured-output engine supports (no `pattern`, no `format`).
 *  - AiCopyLoose / AI_COPY_LOOSE_JSON  the same keys without any length, count or range keyword (ai.md AI-§B.4):
 *              the server's structured output and the merge parser of guard v2, whose guard enforces the lengths
 *              itself, so one over-long field never costs the others. Properties in display order, hero first, so a
 *              stream completes the visible fields first.
 *  - Analysis  what the vision model reads from the product photos (`AnalysisLoose` adds the suggested facts and the
 *              photo quality of the server task).
 *
 * Pure & isomorphic (server, browser, worker). Text never contains HTML: only the landing kit's
 * inline markup (*emphasis*, **strong**), which the renderer escapes and interprets.
 */
import { z } from "zod";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/page/schema";
import { ICON_NAMES, type IconName } from "@/landing/primitives/icons";

/* ------------------------------------------------------------------ */
/* Tiny dual builder: one declaration → zod schema + JSON Schema       */
/* ------------------------------------------------------------------ */

type Json = { [k: string]: unknown };
/**
 * One declaration, four projections (AI-§B.4): `zod` / `json` are the strict contract (local constrained decoding,
 * the R1.0 guard input); `loose` / `looseJson` keep the keys and the enums and drop every length, count and range
 * keyword. Every object projection is `additionalProperties: false` with every key required (structured outputs need
 * it).
 */
interface Spec<T extends z.ZodTypeAny, L extends z.ZodTypeAny = z.ZodTypeAny> {
  zod: T;
  json: Json;
  loose: L;
  looseJson: Json;
}

const str = (max: number, min = 1): Spec<z.ZodString, z.ZodString> => ({
  zod: z.string().trim().min(min).max(max),
  json: { type: "string", minLength: min, maxLength: max },
  loose: z.string(),
  looseJson: { type: "string" },
});

const oneOf = <const V extends readonly [string, ...string[]]>(values: V): Spec<z.ZodEnum<{ [K in V[number]]: K }>, z.ZodEnum<{ [K in V[number]]: K }>> => ({
  zod: z.enum(values),
  json: { type: "string", enum: [...values] },
  loose: z.enum(values),
  looseJson: { type: "string", enum: [...values] },
});

const bool = (): Spec<z.ZodBoolean, z.ZodBoolean> => ({ zod: z.boolean(), json: { type: "boolean" }, loose: z.boolean(), looseJson: { type: "boolean" } });

const arr = <T extends z.ZodTypeAny, L extends z.ZodTypeAny>(item: Spec<T, L>, min: number, max: number): Spec<z.ZodArray<T>, z.ZodArray<L>> => ({
  zod: z.array(item.zod).min(min).max(max),
  json: { type: "array", items: item.json, minItems: min, maxItems: max },
  loose: z.array(item.loose),
  looseJson: { type: "array", items: item.looseJson },
});

/** `looseOrder`: the loose projections' property order (the display order), when it differs from the declaration's. */
const obj = <S extends Record<string, Spec<z.ZodTypeAny>>>(
  shape: S,
  looseOrder: readonly (keyof S & string)[] = Object.keys(shape),
): Spec<z.ZodObject<{ [K in keyof S]: S[K]["zod"] }>, z.ZodObject<{ [K in keyof S]: S[K]["loose"] }>> => {
  const keys = Object.keys(shape);
  const order = [...looseOrder, ...keys.filter((k) => !looseOrder.includes(k))];
  const zodShape = Object.fromEntries(keys.map((k) => [k, shape[k]!.zod])) as { [K in keyof S]: S[K]["zod"] };
  const looseShape = Object.fromEntries(order.map((k) => [k, shape[k]!.loose])) as { [K in keyof S]: S[K]["loose"] };
  return {
    zod: z.object(zodShape),
    json: { type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((k) => [k, shape[k]!.json])) },
    loose: z.object(looseShape),
    looseJson: { type: "object", additionalProperties: false, required: order, properties: Object.fromEntries(order.map((k) => [k, shape[k]!.looseJson])) },
  };
};

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

/** Icons that make sense next to a product benefit or a step (subset of the landing icon set). */
const BENEFIT_ICON_CANDIDATES = [
  "check",
  "drop",
  "leaf",
  "sun",
  "moon",
  "flame",
  "snowflake",
  "feather",
  "gem",
  "bolt",
  "battery",
  "ruler",
  "heart",
  "hand-heart",
  "star",
  "clock",
  "eye",
  "home",
  "baby",
  "paw",
  "dumbbell",
  "waves",
  "gift",
  "lock",
  "shield-check",
  "medal",
  "box",
  "bag",
  "user",
  "asterisk",
  "thumb-up",
  "map-pin",
] as const;

export const BENEFIT_ICONS = BENEFIT_ICON_CANDIDATES.filter((n): n is (typeof BENEFIT_ICON_CANDIDATES)[number] & IconName =>
  (ICON_NAMES as readonly string[]).includes(n),
) as unknown as readonly [IconName, ...IconName[]];

export type BenefitIcon = (typeof BENEFIT_ICONS)[number];
export const isIconName = (v: unknown): v is IconName => typeof v === "string" && (ICON_NAMES as readonly string[]).includes(v);

/* ------------------------------------------------------------------ */
/* PageCopy — complete copy for one page locale                        */
/* ------------------------------------------------------------------ */

const S = (max: number) => z.string().max(max);
/** A section kicker (eyebrow): optional, the page's plan keeps one on at most ⌈n/3⌉ sections (AI-D26, DES-R20; the hero keeps its own). */
const K = S(60).optional();
const Icon = z.custom<IconName>(isIconName, { error: "Unknown icon" });

export const PageCopy = z.object({
  /** one line under the product name (product.tagline, header) */
  tagline: S(90),
  hero: z.object({ kicker: S(60), headline: S(110), sub: S(220), cta: S(40), bigWord: S(16) }),
  announcement: z.array(S(60)).min(2).max(4),
  trust: z.array(z.object({ icon: Icon, text: S(56) })).min(3).max(4),
  marquee: z.array(S(28)).min(4).max(8),
  benefits: z.object({
    kicker: K,
    title: S(110),
    lead: S(220),
    items: z.array(z.object({ title: S(60), text: S(200), icon: Icon })).min(3).max(6),
  }),
  problem: z.object({
    kicker: K,
    title: S(110),
    lead: S(220),
    points: z.array(z.object({ pain: S(110), fix: S(110) })).min(2).max(5),
    solution: S(190),
  }),
  showcase: z.object({ kicker: K, title: S(110), lead: S(220) }),
  steps: z.object({
    kicker: K,
    title: S(110),
    items: z.array(z.object({ title: S(60), text: S(170), icon: Icon })).min(3).max(4),
  }),
  story: z.object({ kicker: K, title: S(110), text: S(700) }),
  comparison: z.object({
    title: S(110),
    us: S(30),
    them: S(30),
    rows: z.array(z.object({ label: S(70), us: S(60), them: S(60) })).min(3).max(6),
  }),
  reviews: z.object({ kicker: K, title: S(110) }),
  socialProof: z.object({ kicker: K, title: S(110) }),
  gallery: z.object({ kicker: K, title: S(110) }),
  specs: z.object({ kicker: K, title: S(110) }),
  offer: z.object({ kicker: K, title: S(110), lead: S(220), cta: S(40) }),
  guarantee: z.object({ kicker: K, title: S(110), lines: z.array(S(130)).min(2).max(4) }),
  form: z.object({ kicker: K, title: S(110), lead: S(220), submit: S(48), reassurance: S(150) }),
  cta: z.object({ kicker: K, title: S(110), text: S(200), button: S(40) }),
  faq: z.object({ kicker: K, title: S(110), items: z.array(z.object({ q: S(110), a: S(320) })).min(3).max(8) }),
  sticky: z.object({ label: S(36), note: S(56) }),
  whatsapp: z.object({ label: S(56), message: S(180) }),
  bundles: z.array(z.object({ title: S(50), subtitle: S(80) })).length(3),
  seo: z.object({ title: S(70), description: S(165) }),
  thankYou: z.object({ title: S(110), message: S(400) }),
});
export type PageCopy = z.infer<typeof PageCopy>;

/** The PageCopy sections whose kicker the page's plan may drop (`GuardContext.kickers` names a subset; the hero keeps its own). */
export const KICKER_SECTIONS = ["benefits", "problem", "showcase", "steps", "story", "reviews", "socialProof", "gallery", "specs", "offer", "guarantee", "form", "cta", "faq"] as const;
export type KickerSection = (typeof KICKER_SECTIONS)[number];

/* ------------------------------------------------------------------ */
/* AiCopy — what the language model writes (compact keys)              */
/* ------------------------------------------------------------------ */

/** The display order of the loose projections (hero first; = COPY_PAGE_FIELD_ORDER in tasks.ts, asserted by test:ai). */
const AI_COPY_DISPLAY_ORDER = [
  "kicker", "headline", "sub", "cta", "benefits", "tagline", "announcement", "problem_title", "pains", "solution", "steps", "faq", "guarantee",
  "cta_title", "cta_text", "story_title", "story", "comparison", "marquee", "seo_title", "seo_description",
] as const;

const AI_COPY = obj({
  tagline: str(90),
  kicker: str(56),
  headline: str(84, 8),
  sub: str(190, 20),
  cta: str(32, 3),
  benefits: arr(obj({ title: str(52, 3), text: str(170, 12), icon: oneOf(BENEFIT_ICONS) }), 4, 5),
  problem_title: str(90, 6),
  pains: arr(obj({ pain: str(100, 6), fix: str(100, 6) }), 3, 4),
  solution: str(170, 10),
  steps: arr(obj({ title: str(52, 3), text: str(150, 10) }), 3, 3),
  faq: arr(obj({ q: str(100, 8), a: str(280, 12) }), 5, 5),
  guarantee: arr(str(120, 8), 3, 3),
  cta_title: str(90, 6),
  cta_text: str(170, 10),
  story_title: str(80, 4),
  story: str(560, 60),
  comparison: arr(obj({ label: str(60, 3), us: str(50, 2), them: str(50, 2) }), 4, 4),
  announcement: arr(str(56, 4), 3, 3),
  marquee: arr(str(24, 2), 5, 6),
  seo_title: str(60, 10),
  seo_description: str(155, 40),
}, AI_COPY_DISPLAY_ORDER);

export const AiCopy = AI_COPY.zod;
export type AiCopy = z.infer<typeof AiCopy>;
/** JSON Schema of AiCopy for StructuredOutputProcessor (no pattern/format keywords). */
export const AI_COPY_JSON_SCHEMA: Json = AI_COPY.json;
/** The loose AiCopy (AI-§B.4): the server's structured output and guard v2's merge parser (strict ⊂ loose). */
export const AiCopyLoose = AI_COPY.loose;
export type AiCopyLoose = z.infer<typeof AiCopyLoose>;
/** JSON Schema of the loose AiCopy: no length, count or range keyword; properties in display order. */
export const AI_COPY_LOOSE_JSON: Json = AI_COPY.looseJson;

/** The rewrite job's count (= `MAX_VARIANTS` of copy.field, asserted by test:ai; not imported, the guard imports this file). */
export const REWRITE_VARIANTS = 3;

/**
 * copy.field's local answer (AI-05; the worker's `rewrite` job, AI-§A.6): exactly three strings within the field's real
 * maximum, as the zod contract the worker validates with and the JSON Schema it constrains decoding with.
 */
export function rewriteVariantsSpec(max: number): { zod: z.ZodObject<{ variants: z.ZodArray<z.ZodString> }>; json: Json } {
  const spec = obj({ variants: arr(str(Math.max(1, Math.floor(max))), REWRITE_VARIANTS, REWRITE_VARIANTS) });
  return { zod: spec.zod, json: spec.json };
}

/* ------------------------------------------------------------------ */
/* Vision analysis                                                     */
/* ------------------------------------------------------------------ */

/** Visual vibes, each a keyword the theme engine's vibe table understands. */
export const VIBES = ["luxury", "playful", "natural", "tech", "sport", "beauty", "home", "heritage", "minimal", "rugged", "clinical"] as const;
export type Vibe = (typeof VIBES)[number];

const ANALYSIS_SHAPE = {
  category: oneOf(PRODUCT_CATEGORIES),
  vibe: oneOf(VIBES),
  secondary_vibe: oneOf([...VIBES, "none"] as const),
  materials: arr(str(28), 0, 4),
  colors: arr(str(24), 1, 4),
  audience: str(90),
  summary: str(170, 10),
};
const ANALYSIS = obj(ANALYSIS_SHAPE);

/** Raw model output (snake_case, as constrained). */
export const AnalysisRaw = ANALYSIS.zod;
export const ANALYSIS_JSON_SCHEMA: Json = ANALYSIS.json;

/** AI-21 vision QA (the server analyze): `advice` is one plain line in the admin locale, "" for none. */
const PHOTO_QUALITY = obj({
  sharp: bool(),
  clutter: oneOf(["none", "some", "heavy"] as const),
  full_bleed_ok: bool(),
  cutout_viable: bool(),
  advice: str(120, 0),
});
/** The server analyze output: the local fields (materials kept for the local worker's output, ignored by the merge) + the suggestions and the photo quality. */
const ANALYSIS_OUT = obj({
  category: ANALYSIS_SHAPE.category,
  vibe: ANALYSIS_SHAPE.vibe,
  secondary_vibe: ANALYSIS_SHAPE.secondary_vibe,
  colors: ANALYSIS_SHAPE.colors,
  summary: ANALYSIS_SHAPE.summary,
  audience: ANALYSIS_SHAPE.audience,
  materials: ANALYSIS_SHAPE.materials,
  suggested_facts: arr(str(80), 0, 5),
  photo_quality: PHOTO_QUALITY,
});
/** The loose server analyze output (AI-§B.4; AI-04, AI-21): finalize("analyze") turns it into AnalysisOut. */
export const AnalysisLoose = ANALYSIS_OUT.loose;
export type AnalysisLoose = z.infer<typeof AnalysisLoose>;
export const ANALYSIS_LOOSE_JSON: Json = ANALYSIS_OUT.looseJson;

export interface Analysis {
  category: ProductCategory;
  vibe: Vibe;
  secondaryVibe: Vibe | null;
  materials: string[];
  colorsDescribed: string[];
  audience: string;
  summary: string;
}

export function toAnalysis(raw: z.infer<typeof AnalysisRaw>): Analysis {
  return {
    category: raw.category,
    vibe: raw.vibe,
    secondaryVibe: raw.secondary_vibe === "none" || raw.secondary_vibe === raw.vibe ? null : raw.secondary_vibe,
    materials: raw.materials,
    colorsDescribed: raw.colors,
    audience: raw.audience,
    summary: raw.summary,
  };
}

/** Analysis shape for values coming back from storage or a worker. */
export const AnalysisSchema = z.object({
  category: z.enum(PRODUCT_CATEGORIES),
  vibe: z.enum(VIBES),
  secondaryVibe: z.enum(VIBES).nullable(),
  materials: z.array(z.string().max(28)).max(4),
  colorsDescribed: z.array(z.string().max(24)).max(4),
  audience: z.string().max(90),
  summary: z.string().max(170),
});

/** The vibe string handed to the theme engine (rankArchetypes / themeFromProduct `aiVibe`). */
export function vibeHint(a: Pick<Analysis, "vibe" | "secondaryVibe"> | null | undefined): string | null {
  if (!a) return null;
  return a.secondaryVibe ? `${a.vibe} ${a.secondaryVibe}` : a.vibe;
}
