import "server-only";
/**
 * `finalizeCtxFor(scope, input)` (P7 AI; ai.md AI-§D.1, AI-§D.2 rule 3; core D73): the store facts every task's
 * finalize reads, loaded once per run on the server. Everything comes from the store's own settings through the scope:
 *  - `callingHours`: `w = await callingWindowFor(scope)` (P4), then `callingHoursFor(w, …)` (./types.ts), the one place
 *    the hours text is built; `withinHours` from `store.confirmation` (absent = no promise);
 *  - `policies` from the `policies` setting; `hasWhatsapp` from the store's WhatsApp numbers; `wordsAvoid` from the
 *    voice (AI-06);
 *  - `storeFacts` through the injected loader (the ai_memory repository arrives with step 6; until then none).
 * The browser never sends any of these: a request cannot forge a policy or an hour.
 */
import { callingWindowFor } from "@/lib/callcenter/window.server";
import type { Locale } from "@/lib/page/schema";
import { getStoreSettings } from "@/lib/settings";
import type { StoreScope } from "@/lib/tenancy/types";
import { callingHoursFor, type FinalizeCtx } from "./types";

/** What the task itself knows: the page's locale, product and numbers. */
export interface FinalizeCtxInput {
  locale: Locale;
  productName: string;
  facts: readonly string[];
  price?: number;
  deliveryText?: string | null;
  freeShipping?: boolean;
  kickers?: ReadonlySet<string>;
  numbers?: ReadonlySet<string>;
  vocab?: Record<string, readonly string[]>;
  origin?: "cloud" | "local";
}

export interface FinalizeCtxDeps {
  /** owner-typed store facts (ai_memory kind "fact"); the repository is injected by the router (step 6) */
  storeFacts?: (scope: StoreScope) => Promise<readonly string[]>;
  now?: () => Date;
}

const noStoreFacts = async (): Promise<readonly string[]> => [];

export async function finalizeCtxFor(scope: StoreScope, input: FinalizeCtxInput, deps: FinalizeCtxDeps = {}): Promise<FinalizeCtx> {
  const [settings, w, storeFacts] = await Promise.all([getStoreSettings(scope, ["store", "policies", "store_ai"]), callingWindowFor(scope), (deps.storeFacts ?? noStoreFacts)(scope)]);
  const store = settings.store;
  const dateLocale = `${input.locale}-${store.country || "MA"}`;
  return {
    ...input,
    origin: input.origin ?? "cloud",
    storeFacts,
    hasWhatsapp: Boolean(store.whatsapp || store.confirmation.whatsapp),
    policies: settings.policies,
    callingHours: callingHoursFor(w, input.locale, dateLocale, deps.now?.() ?? new Date(), store.confirmation.withinHours ?? null),
    wordsAvoid: settings.store_ai.voice.wordsAvoid,
  };
}
