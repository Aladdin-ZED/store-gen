/**
 * The eval's view of each family (P7 AI; ai.md AI-§F.4, AI-§D.3). Isomorphic and pure. For a fixture it gives the
 * `FinalizeCtx` the real router would build for the fixture's store (`evalCtxOf`, the same settings parse as
 * `finalizeCtxFor`), the task's own `finalize`, the loose schema `schemaValid` reads, and the texts the scorers check,
 * raw and guarded, each with its locale.
 *
 * The texts are what a seller or a shopper reads. Left out on purpose: the analyze chips (`suggestedFacts`,
 * `materials`: shown unticked, they ARE the claims, AI-04), the critique's evidence quotes (they quote the candidate's
 * own hero copy), and the staff-facing reasons of `screen` and `judge`.
 */
import type { z } from "zod";
import { libraryCopy } from "../copy-library";
import { AiCopy, AiCopyLoose, AnalysisLoose, type PageCopy } from "../copy-schema";
import { critiqueFinalize, planFinalize } from "../director/validate";
import { CritiqueLoose, DirectorPlanLoose, type DirectorNote } from "../director/types";
import { mergeAiCopy, type MergeResult } from "../guard";
import { AD_LIMITS, AdBriefLoose, HOOK_MAX_WORDS, adBriefFinalize } from "../schema/tasks/ad-brief";
import { analyzeFinalize } from "../schema/tasks/analyze";
import { CallScriptLoose, callScriptFinalize } from "../schema/tasks/callcenter-script";
import { FieldRewriteLoose, copyFieldFinalize } from "../schema/tasks/copy-field";
import { HERO_MAX, HeroPackLoose, heroFinalize } from "../schema/tasks/copy-hero";
import { copyPageFinalize } from "../schema/tasks/copy-page";
import { JudgeLoose } from "../schema/tasks/eval-judge";
import { ScreenLoose, screenFinalize } from "../schema/tasks/injection-screen";
import type { FinalizeCtx } from "../schema/tasks/types";
import type { AiTaskInput } from "../provider/types";
import type { Locale, ProductCategory } from "@/lib/page/schema";
import type { R1Family } from "../prompts/registry";
import { storeCtxOf } from "./fixtures";
import type { EvalFixture } from "./types";

/** One text a reader sees, at a path, in its locale. */
export interface EvalText {
  path: string;
  text: string;
  locale: Locale;
}

/** A finalize's answer as the scorers read it (the Director's notes included). */
export type Finalized = { value: unknown; rejected: string[]; notes?: DirectorNote[] } | null;

/** The product a fixture's task is about, whatever the task's input shape. */
export function productOf(f: EvalFixture): { name: string; facts: string[]; priceMinor: number | null; category: ProductCategory | null } {
  const input = f.input as Record<string, unknown>;
  const p = (input.product ?? (input.brief as Record<string, unknown> | undefined)?.product) as
    | { name?: string | null; facts?: string[]; priceMinor?: number; price?: { minor: number }; category?: ProductCategory | null }
    | undefined;
  return { name: p?.name ?? "", facts: p?.facts ?? [], priceMinor: p?.priceMinor ?? p?.price?.minor ?? null, category: p?.category ?? null };
}

/** The FinalizeCtx the router builds for this fixture's store and input (finalizeCtxFor, from the fixture's settings). */
export function evalCtxOf(f: EvalFixture): FinalizeCtx {
  const s = storeCtxOf(f);
  const p = productOf(f);
  const input = f.input as { deliveryText?: string | null; kickers?: string[] | null };
  return {
    locale: f.locale,
    productName: p.name,
    facts: p.facts,
    ...(p.priceMinor !== null ? { price: p.priceMinor / 100 } : {}),
    deliveryText: input.deliveryText ?? null,
    ...(Array.isArray(input.kickers) ? { kickers: new Set(input.kickers) } : {}),
    origin: "cloud",
    storeFacts: s.memory.filter((m) => m.kind === "fact").map((m) => m.text),
    hasWhatsapp: s.hasWhatsapp,
    policies: s.policies,
    callingHours: s.callingHours,
    wordsAvoid: s.voice.wordsAvoid,
  };
}

/** The family's loose schema (`schemaValid`: the loose parse of the raw output succeeded). */
export const LOOSE: Readonly<Record<R1Family, z.ZodType>> = {
  "copy.page": AiCopyLoose,
  "copy.hero": HeroPackLoose,
  "copy.field": FieldRewriteLoose,
  analyze: AnalysisLoose,
  "director.plan": DirectorPlanLoose,
  "director.critique": CritiqueLoose,
  script: CallScriptLoose,
  brief: AdBriefLoose,
  screen: ScreenLoose,
  judge: JudgeLoose,
};

/** The task's finalize for this fixture (the judge has none: its verdict is an enum and its reason staff-facing). */
export function finalizeFixture(f: EvalFixture, raw: unknown, ctx: FinalizeCtx = evalCtxOf(f)): Finalized {
  switch (f.task) {
    case "copy.page":
      return copyPageFinalize()(raw, ctx);
    case "copy.hero":
      return heroFinalize(f.input as AiTaskInput<"copy.hero">)(raw, ctx);
    case "copy.field":
      return copyFieldFinalize(f.input as AiTaskInput<"copy.field">)(raw, ctx);
    case "analyze":
      return analyzeFinalize(f.input as AiTaskInput<"analyze">)(raw, ctx);
    case "design.plan":
      return planFinalize((f.input as AiTaskInput<"design.plan">).brief)(raw, ctx);
    case "design.critique":
      return critiqueFinalize(f.input as AiTaskInput<"design.critique">)(raw, ctx);
    case "callcenter.script":
      return callScriptFinalize(f.input as AiTaskInput<"callcenter.script">)(raw, ctx);
    case "ad.brief":
      return adBriefFinalize(f.input as AiTaskInput<"ad.brief">)(raw, ctx);
    case "injection.screen":
      return screenFinalize(f.input as AiTaskInput<"injection.screen">)(raw, ctx);
    case "eval.judge": {
      const p = JudgeLoose.safeParse(raw);
      return p.success ? { value: p.data, rejected: [] } : null;
    }
    default:
      return null;
  }
}

/** The library page the browser merges a copy.page answer over (the same call as the library rung). */
export function libraryPageOf(f: EvalFixture<"copy.page">): PageCopy {
  const i = f.input;
  return libraryCopy({ category: i.product.category, locale: i.locale, market: i.market, seed: f.seed, productName: i.product.name, keywords: i.product.facts.join(" "), deliveryText: i.deliveryText, hasWhatsapp: f.store.hasWhatsapp });
}

/** copy.page: the page that ships (the guarded fields merged over the library, the kicker plan applied). */
export function shippedPage(f: EvalFixture<"copy.page">, guarded: unknown, ctx: FinalizeCtx = evalCtxOf(f)): MergeResult {
  return mergeAiCopy(libraryPageOf(f), guarded, ctx);
}

/* ------------------------------------------------------------------ */
/* Texts                                                               */
/* ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every string leaf under `prefix` whose path `keep` accepts. */
function leaves(v: unknown, prefix: string, keep: (path: string) => boolean, locale: (path: string) => Locale, out: EvalText[] = []): EvalText[] {
  if (typeof v === "string") {
    if (v.trim() && keep(prefix)) out.push({ path: prefix, text: v, locale: locale(prefix) });
  } else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${prefix}.${i}`, keep, locale, out));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) leaves(x, prefix ? `${prefix}.${k}` : k, keep, locale, out);
  return out;
}

const ICON = /\.icon$/;
const ENUM_ANALYZE = /^(?:category|vibe|secondary_vibe|secondaryVibe|materials|suggested_facts|suggestedFacts)(?:\.|$)|^photo_quality\.(?!advice)|^photoQuality\.(?!advice)/;
const PLAN_TEXT = /^read\.(?:readLine|audience|risks\.\d+|photoQuality\.advice)$|^directions\.\d+\.rationale$/;
const CRITIQUE_TEXT = /^whyLines\.lines\.\d+$/;
const BRIEF_SKIP = /^(?:basedOnVersionId|angles\.\d+\.(?:sectionId|tag))$/;

/** The texts of an output (raw or guarded) a reader sees, with their locale. */
export function textsOf(f: EvalFixture, value: unknown): EvalText[] {
  const loc = f.locale;
  const same = () => loc;
  switch (f.family) {
    case "copy.page":
    case "copy.hero":
      return leaves(value, "", (p) => !ICON.test(p), same);
    case "copy.field": {
      const input = f.input as AiTaskInput<"copy.field">;
      const target = input.intent === "translate" && input.targetLocale ? input.targetLocale : loc;
      return leaves(isObj(value) ? value.variants : null, "variants", () => true, () => target);
    }
    case "analyze": {
      const admin = (f.input as AiTaskInput<"analyze">).adminLocale;
      return leaves(value, "", (p) => !ENUM_ANALYZE.test(p), (p) => (/advice$/.test(p) ? admin : loc));
    }
    case "director.plan":
      return leaves(value, "", (p) => PLAN_TEXT.test(p), same);
    case "director.critique":
      return leaves(value, "", (p) => CRITIQUE_TEXT.test(p), same);
    case "script":
      return leaves(value, "", (p) => /\.(?:title|say)$|\.checks\.\d+$/.test(p), same);
    case "brief":
      return leaves(value, "", (p) => !BRIEF_SKIP.test(p), (p) => (/\.ar$/.test(p) ? "ar" : /\.fr$/.test(p) ? "fr" : loc));
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ */
/* Field counts and length fit                                         */
/* ------------------------------------------------------------------ */

/** The field a rejection names, without its item index ("faq.2" → "faq", "angles.0.hook.ar" → "angles.hook.ar"). */
export const fieldOf = (rejection: string): string => rejection.replace(/\.\d+(?=\.|$)/g, "").replace(/^angle:\d+$/, "angles");

/** How many fields a raw output offered the guard (the denominator of the reject rate). */
export function fieldCount(f: EvalFixture, raw: unknown): number {
  if (!isObj(raw)) return 1;
  switch (f.family) {
    case "copy.page":
      return Object.keys(AiCopy.shape).length;
    case "copy.hero":
      return 4;
    case "copy.field":
      return Array.isArray(raw.variants) ? Math.max(1, Math.min(5, raw.variants.length)) : 1;
    default:
      return Math.max(1, textsOf(f, raw).length);
  }
}

/** The raw texts inside the field guide's targets (`lengthFit`): ok of n, or null where the family has none. */
export function lengthFitOf(f: EvalFixture, raw: unknown): { ok: number; n: number } | null {
  if (!isObj(raw)) return null;
  const count = (checks: boolean[]) => ({ ok: checks.filter(Boolean).length, n: checks.length });
  switch (f.family) {
    case "copy.page":
      return count((Object.keys(AiCopy.shape) as (keyof typeof AiCopy.shape)[]).filter((k) => k in raw).map((k) => AiCopy.shape[k].safeParse(raw[k]).success));
    case "copy.hero":
      return count((["headline", "sub", "cta", "kicker"] as const).filter((k) => typeof raw[k] === "string" && (k !== "kicker" || (raw[k] as string).trim())).map((k) => (raw[k] as string).trim().length <= HERO_MAX[k]));
    case "copy.field": {
      const max = (f.input as AiTaskInput<"copy.field">).max;
      return count((Array.isArray(raw.variants) ? raw.variants : []).map((v) => typeof v === "string" && v.trim().length <= max));
    }
    case "brief": {
      const checks: boolean[] = [];
      for (const a of Array.isArray(raw.angles) ? raw.angles : []) {
        if (!isObj(a)) continue;
        for (const h of Object.values(isObj(a.hook) ? a.hook : {})) if (typeof h === "string") checks.push(h.trim().split(/\s+/).length <= HOOK_MAX_WORDS);
        for (const field of ["primary", "headline"] as const) {
          const per = isObj(a[field]) ? (a[field] as Record<string, unknown>) : {};
          for (const [platform, texts] of Object.entries(per)) {
            const max = AD_LIMITS[platform as keyof typeof AD_LIMITS]?.[field] ?? null;
            if (max === null || !isObj(texts)) continue;
            for (const t of Object.values(texts)) if (typeof t === "string") checks.push(t.trim().length <= max);
          }
        }
      }
      return count(checks);
    }
    default:
      return null;
  }
}
