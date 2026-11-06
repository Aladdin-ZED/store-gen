import "server-only";
/**
 * The server part of the prompt assembly (P7 AI; ai.md AI-§B.5, AI-§E.5, AI-§G.2): the store layer's context read
 * through the scope, so a request can never carry another store's policies, voice or memory, and a browser can never
 * forge them.
 *  - `storeBlockCtxFor(scope, store, deps)`: the `store`, `policies` and `store_ai` settings of the scope's store, the
 *    calling window (`callingWindowFor(scope)`, P4; the hours only through `callingHoursFor`, so a window the owner
 *    never saved gives none), and the memory and exemplar rows through injected repositories (the scoped `ai_memory`
 *    repository arrives with step 6; R1 has no exemplar rows);
 *  - `assembleFor(scope, version, input, store, opts, deps)`: that context, the PII gate and `assemble()`; an
 *    `AiAssemblyError` is reported to `deps.recordError` (the core's `recordError("ai", …)` once P8's
 *    src/lib/jobs/errors.ts exists; a server log line without values until then) and thrown again.
 */
import { callingWindowFor } from "@/lib/callcenter/window.server";
import type { Locale, Market } from "@/lib/page/schema";
import { getStoreSettings } from "@/lib/settings";
import type { StoreScope } from "@/lib/tenancy/types";
import type { AiTaskInput } from "../provider/types";
import { callingHoursFor } from "../schema/tasks/types";
import type { AiTaskId } from "../tasks";
import { AiAssemblyError, buildRequest, type AssembleOpts } from "./assemble";
import { storeBlockCtxOf, type PromptExemplarRow, type PromptMemoryRow, type StoreBlockCtx } from "./store-block";
import type { PromptVersion } from "./types";

/** What the caller knows of the store (the run's StoreRow): never read from the request. */
export interface StoreFacts {
  market: Market;
  currency: string;
  primaryLocale: Locale;
}

export interface StoreBlockDeps {
  /** the store's active explicit memory rows (`ai_memory`), scoped */
  memory?: (scope: StoreScope) => Promise<readonly PromptMemoryRow[]>;
  /** R3 exemplar rows (`ai_exemplars`), scoped; none in R1 */
  exemplars?: (scope: StoreScope) => Promise<readonly PromptExemplarRow[]>;
  now?: () => Date;
  /** the core's recordError("ai", err, { storeId }) */
  recordError?: (area: "ai", err: unknown, meta: { storeId: string }) => void;
}

const none = async (): Promise<readonly never[]> => [];

export async function storeBlockCtxFor(scope: StoreScope, store: StoreFacts, deps: StoreBlockDeps = {}): Promise<StoreBlockCtx> {
  const [settings, w, memory, exemplars] = await Promise.all([
    getStoreSettings(scope, ["store", "policies", "store_ai"]),
    callingWindowFor(scope),
    (deps.memory ?? none)(scope),
    (deps.exemplars ?? none)(scope),
  ]);
  const dateLocale = `${store.primaryLocale}-${settings.store.country || "MA"}`;
  return storeBlockCtxOf({
    storeId: scope.storeId,
    market: store.market,
    currency: store.currency,
    primaryLocale: store.primaryLocale,
    store: settings.store,
    policies: settings.policies,
    storeAi: settings.store_ai,
    callingHours: callingHoursFor(w, store.primaryLocale, dateLocale, deps.now?.() ?? new Date(), settings.store.confirmation.withinHours ?? null),
    memory,
    exemplars,
  });
}

/** A refusal reported without values (the error carries only its code and the row id). */
function report(err: unknown, scope: StoreScope, deps: StoreBlockDeps): void {
  if (!(err instanceof AiAssemblyError)) return;
  if (deps.recordError) deps.recordError("ai", err, { storeId: scope.storeId });
  else console.error(`[ai] assembly refused: ${err.code} ${err.at}`);
}

export async function assembleFor<T extends AiTaskId>(scope: StoreScope, p: PromptVersion<T>, input: AiTaskInput<T>, store: StoreFacts, opts: AssembleOpts = {}, deps: StoreBlockDeps = {}) {
  const ctx = await storeBlockCtxFor(scope, store, deps);
  try {
    return buildRequest(scope, p, input, ctx, opts);
  } catch (err) {
    report(err, scope, deps);
    throw err;
  }
}
