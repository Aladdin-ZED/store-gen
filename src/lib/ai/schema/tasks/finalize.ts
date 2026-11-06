/**
 * Each R1 task's choke point, as the router calls it (P7 AI; ai.md AI-§D.1, AI-§A.4 step 8, AI-§B.4). Isomorphic and
 * pure. `finalizeFor(task, input)` is the task's own `finalize` bound to the run's input (the one choke point per task,
 * the same functions the eval harness scores); `finalizeCtxInputOf(task, input)` is what the task itself knows for
 * `finalizeCtxFor` (the page's locale, the product and its numbers); the store's policies, hours and voice are read by
 * the server, never taken from the request.
 */
import type { Locale } from "@/lib/page/schema";
import { critiqueFinalize, planFinalize } from "../../director/validate";
import type { DirectorNote } from "../../director/types";
import type { AiTaskInput } from "../../provider/types";
import type { AiTaskId } from "../../tasks";
import { adBriefFinalize } from "./ad-brief";
import { analyzeFinalize } from "./analyze";
import { callScriptFinalize } from "./callcenter-script";
import { copyFieldFinalize } from "./copy-field";
import { heroFinalize } from "./copy-hero";
import { copyPageFinalize } from "./copy-page";
import type { FinalizeCtxInput } from "./ctx.server";
import { JudgeLoose } from "./eval-judge";
import { screenFinalize } from "./injection-screen";
import type { FinalizeCtx } from "./types";

export type AnyFinalize = (raw: unknown, ctx: FinalizeCtx) => { value: unknown; rejected: string[]; notes?: DirectorNote[] } | null;

/** The task's finalize for this input; null = the task has no server finalize in R1. */
export function finalizeFor(task: AiTaskId, input: unknown): AnyFinalize | null {
  switch (task) {
    case "copy.page":
      return copyPageFinalize();
    case "copy.hero":
      return heroFinalize(input as AiTaskInput<"copy.hero">);
    case "copy.field":
      return copyFieldFinalize(input as AiTaskInput<"copy.field">);
    case "analyze":
      return analyzeFinalize(input as AiTaskInput<"analyze">);
    case "design.plan":
      return planFinalize((input as AiTaskInput<"design.plan">).brief);
    case "design.critique":
      return critiqueFinalize(input as AiTaskInput<"design.critique">);
    case "callcenter.script":
      return callScriptFinalize(input as AiTaskInput<"callcenter.script">);
    case "ad.brief":
      return adBriefFinalize(input as AiTaskInput<"ad.brief">);
    case "injection.screen":
      return screenFinalize(input as AiTaskInput<"injection.screen">);
    case "eval.judge":
      return (raw) => {
        const p = JudgeLoose.safeParse(raw);
        return p.success ? { value: { verdict: p.data.verdict, reason: p.data.reason.slice(0, 300) }, rejected: [] } : null;
      };
    default:
      return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The locale, product and numbers of a run (AI-§D.2): what `finalizeCtxFor` adds the store's facts to. */
export function finalizeCtxInputOf(task: AiTaskId, input: unknown): FinalizeCtxInput {
  const i = isObj(input) ? input : {};
  const brief = isObj(i.brief) ? i.brief : null;
  const product = (isObj(i.product) ? i.product : brief && isObj(brief.product) ? brief.product : {}) as {
    name?: string | null;
    facts?: string[];
    priceMinor?: number;
    price?: { minor?: number };
  };
  const briefLocales = brief && isObj(brief.store) && Array.isArray(brief.store.locales) ? (brief.store.locales as Locale[]) : [];
  const locale = (typeof i.locale === "string" ? i.locale : typeof i.adminLocale === "string" ? i.adminLocale : Array.isArray(i.locales) ? i.locales[0] : briefLocales[0] ?? "fr") as Locale;
  const priceMinor = typeof product.priceMinor === "number" ? product.priceMinor : typeof product.price?.minor === "number" ? product.price.minor : null;
  const out: FinalizeCtxInput = {
    locale: task === "injection.screen" ? "en" : locale,
    productName: product.name ?? "",
    facts: Array.isArray(product.facts) ? product.facts : [],
  };
  if (priceMinor !== null) out.price = priceMinor / 100;
  if ("deliveryText" in i) out.deliveryText = typeof i.deliveryText === "string" ? i.deliveryText : null;
  if (Array.isArray(i.kickers)) out.kickers = new Set(i.kickers as string[]);
  return out;
}
