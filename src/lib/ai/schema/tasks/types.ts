/**
 * The finalize contract (P7 AI; ai.md AI-§D.1, AI-§B.4): every output of every provider, before anyone sees it, goes
 * through its task's `finalize(raw, ctx)` (server: `runServerTask` step 8, every cache hit and batch ingest; browser:
 * the local output and the final merge). `null` = `invalid_output`; `rejected` names the fields the guard dropped.
 * A prompt rule is never the only defence.
 *
 * `FinalizeCtx` is guard v2's context with the store facts every task reads, built on the server by `finalizeCtxFor`
 * (./ctx.server.ts). The calling-hours text is built here, by `callingHoursFor`, and nowhere else (rev 5 CRIT2-1, core
 * D73): a window the owner never saved (`configured: false`) gives `null`, so `DEFAULT_WINDOW` never feeds a promise.
 *
 * Isomorphic.
 */
import { hoursText, shopperPromiseAllowed, type EffectiveWindow } from "@/lib/callcenter/window";
import type { Locale } from "@/lib/page/schema";
import type { StorePolicyFacts } from "@/lib/settings/keys/policies";
import type { CallingHours, GuardContext } from "../../guard";

export type { CallingHours } from "../../guard";

export interface FinalizeCtx extends GuardContext {
  /** ai_memory kind "fact" + policy facts: owner-typed, numbers allowed */
  storeFacts: readonly string[];
  /** tasks over aggregates: the only numbers the text may quote (AI-17) */
  numbers?: ReadonlySet<string>;
  /** GEN-09 */
  hasWhatsapp: boolean;
  /** the store's `policies` setting (landing.md) */
  policies: StorePolicyFacts;
  /** the only call-timing words a text may state (rule 3): see `callingHoursFor` */
  callingHours: CallingHours;
  /** closed vocabularies (genes, ops, preset ids) */
  vocab?: Record<string, readonly string[]>;
}

export type FinalizeResult<Out> = { value: Out; rejected: string[] } | null;
export type Finalize<Out> = (raw: unknown, ctx: FinalizeCtx) => FinalizeResult<Out>;

/**
 * The calling-hours text rule 3 compares a promise with: `shopperPromiseAllowed(w) ? hoursText(w, locale, dateLocale,
 * now) : null`, with `w = await callingWindowFor(scope)` (P4's pure window.ts). A source that throws (P4's `hoursText`
 * is a stub until its merge) is unavailable: no text, so no hour is promised (core §K.2 build note item 14).
 */
export function callingHoursFor(w: EffectiveWindow, locale: Locale, dateLocale: string, now: Date, withinHours: number | null): CallingHours {
  let text: string | null;
  try {
    text = shopperPromiseAllowed(w) ? hoursText(w, locale, dateLocale, now) : null;
  } catch {
    text = null;
  }
  return { text: text?.trim() || null, withinHours: withinHours ?? null };
}

/** A JSON object (not an array, not null). */
export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
