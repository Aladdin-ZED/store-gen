/**
 * The strict input schemas of the R1 server tasks (P7 AI; ai.md AI-§A.4 step 2, AI-§E.1, AI-§E.2, AI-D31). Isomorphic.
 * These are the only shapes a server run accepts (`input_invalid` otherwise): every object is strict (an unknown key
 * is refused, so no customer field can ride along), every string and list is bounded, money is integer minor units.
 * The Director tasks reuse their own schemas (src/lib/ai/director/types.ts). The routes (step 9) parse with the same
 * map before they call the router.
 */
import { z } from "zod";
import { LOCALES, MARKETS, PRODUCT_CATEGORIES } from "@/lib/page/schema";
import { AnalysisSchema } from "../../copy-schema";
import { COPY_LOCALES } from "../../prompts";
import { CritiqueInputSchema, DIRECTOR_LIMITS, DirectorBriefSchema } from "../../director/types";
import { PROMPT_FAMILIES, type AiTaskId } from "../../tasks";
import { REWRITE_INTENTS } from "./copy-field";
import { JUDGE_PROPERTIES } from "./eval-judge";

const text = (max: number) => z.string().max(max);
const Locale3 = z.enum(COPY_LOCALES);
const minor = z.number().int().min(0).max(1_000_000_000);

/** A photo as the browser sends it (AI-§B.3): base64 without the data: prefix, ≤ 400 KB decoded, ≤ 1,568 px a side. */
export const AnalyzeImageZ = z.strictObject({
  mediaType: z.enum(["image/webp", "image/jpeg"]),
  data: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(546_134),
  w: z.number().int().min(1).max(1_568),
  h: z.number().int().min(1).max(1_568),
});

const ProductZ = z.strictObject({
  name: text(120),
  category: z.enum(PRODUCT_CATEGORIES),
  priceMinor: minor,
  currency: z.string().regex(/^[A-Z]{3}$/),
  facts: z.array(text(200)).max(6),
});

const DirectionZ = z.strictObject({
  slot: z.enum(["best_fit", "contrast", "explore"]),
  // design's ids (DES `ANGLES`, `HEADLINE_STRUCTURES`) or the engine's structure tags: bounded, checked by finalize
  angle: z.string().regex(/^[a-z][a-z-]{0,31}$/).nullable(),
  headlineStructure: z.string().regex(/^[a-z][a-z-]{0,31}$/).nullable(),
  mustAvoid: z.array(text(120)).max(12),
});

export const AnalyzeInputZ = z.strictObject({
  images: z.array(AnalyzeImageZ).min(1).max(3),
  adminLocale: Locale3,
  product: z.strictObject({ name: text(120).nullable(), category: z.enum(PRODUCT_CATEGORIES).nullable() }),
});

export const CopyPageInputZ = z.strictObject({
  locale: Locale3,
  market: z.enum(MARKETS),
  product: ProductZ,
  analysis: AnalysisSchema.nullable(),
  deliveryText: text(200).nullable(),
  direction: DirectionZ.nullable(),
  kickers: z.array(text(24)).max(14).nullable(),
});

export const HeroPackInputZ = z.strictObject({
  locale: Locale3,
  market: z.enum(MARKETS),
  product: ProductZ,
  deliveryText: text(200).nullable(),
  direction: DirectionZ,
});

export const FieldRewriteInputZ = z.strictObject({
  locale: Locale3,
  field: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\[\d{1,2}\])?(?:\.[A-Za-z0-9_]+(?:\[\d{1,2}\])?){0,4}$/).max(60),
  text: text(1_200),
  max: z.number().int().min(4).max(1_200),
  intent: z.enum(REWRITE_INTENTS),
  targetLocale: Locale3.nullable(),
  product: z.strictObject({ name: text(120), facts: z.array(text(200)).max(6) }),
  mustAvoid: z.array(text(200)).max(12),
});

export const DirectorPlanInputZ = z.object({ brief: DirectorBriefSchema, images: z.array(AnalyzeImageZ).max(DIRECTOR_LIMITS.photos) });

export const InjectionScreenInputZ = z.strictObject({ text: text(4_000), source: z.enum(["import", "sheet", "note"]) });

export const AdBriefInputZ = z.strictObject({
  basedOnVersionId: z.string().regex(/^[0-9A-Za-z_-]{1,64}$/),
  locales: z.array(Locale3).min(1).max(3),
  product: ProductZ,
  sections: z.array(z.strictObject({ id: text(64), tag: text(40), headline: text(300), lead: text(600) })).max(24),
});

export const CallScriptInputZ = z.strictObject({
  locale: Locale3,
  product: ProductZ,
  packs: z.array(z.strictObject({ label: text(80), qty: z.number().int().min(1).max(99), priceMinor: minor, compareAtMinor: minor.nullable().optional(), gift: text(80).nullable().optional() })).max(8),
  upsell: z.strictObject({ title: text(120), priceMinor: minor }).nullable(),
  darija: z.enum(["none", "cta", "light"]),
  addressMode: z.enum(["required", "optional"]).nullable(),
});

export const JudgeInputZ = z.strictObject({
  family: z.enum(PROMPT_FAMILIES),
  property: z.enum(JUDGE_PROPERTIES),
  locale: z.enum(LOCALES),
  fixture: z.strictObject({ id: text(64), brief: text(4_000) }),
  a: text(40_000),
  b: text(40_000),
});

/** The R1 server tasks' input schemas; a task without one has no server run in R1. */
export const TASK_INPUTS: Partial<Record<AiTaskId, z.ZodType>> = {
  analyze: AnalyzeInputZ,
  "copy.page": CopyPageInputZ,
  "copy.hero": HeroPackInputZ,
  "copy.field": FieldRewriteInputZ,
  "design.plan": DirectorPlanInputZ,
  "design.critique": CritiqueInputSchema,
  "injection.screen": InjectionScreenInputZ,
  "ad.brief": AdBriefInputZ,
  "callcenter.script": CallScriptInputZ,
  "eval.judge": JudgeInputZ,
};

/** The strict parse of a task input (AI-§A.4 step 2): the parsed value, or null (`input_invalid`). */
export function parseTaskInput(task: AiTaskId, input: unknown): { ok: true; value: unknown } | { ok: false } {
  const schema = TASK_INPUTS[task];
  if (!schema) return { ok: false };
  const r = schema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false };
}
