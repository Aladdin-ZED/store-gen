import "server-only";
/**
 * Submitting the Batches queue (P7 AI; ai.md AI-§B.8 step 3, AI-§B.13 cases a/b, AI-§F.5; docs/STORE-SAAS.md §H.2
 * slot 4b, §H.8). Per model (one model per batch), a batch is submitted when its queue holds ≥ 20 items, its oldest
 * item waited ≥ 15 min, or an eval run or a job stage waits on it; ≤ 1,000 items per batch (our cap; the API allows
 * 100,000), `custom_id = "i_" + item.id` (≤ 64 chars). Each request is built at submit time like a live call: the
 * store item's prompt is assembled through its store's system scope (its own memory and policies, never another's),
 * the eval item's on its fixture store; Batches never carry betas, fallbacks or `speed`. A Director family's canary
 * token is derived from the item id (never shown anywhere), so the ingest can check it. The kill switch
 * `ai_generation_enabled` stops submission only: open batches are still polled and ingested (core §H.8).
 */
import type { BatchCreateParams } from "@anthropic-ai/sdk/resources/messages/batches";
import { newId } from "@/lib/db/ids";
import type { JobCtx } from "@/lib/jobs/runner";
import { systemScope } from "@/lib/jobs/scope";
import type { Locale, Market } from "@/lib/page/schema";
import { getPlatformSetting } from "@/lib/settings";
import type { PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import { ALL_FIXTURES, fixtureStoreId, storeCtxOf } from "../eval/fixtures";
import { insertBatch, markSubmitted, queuedSummary, setItemState, takeQueued, unmarkSubmitted, updateBatch, type BatchItemRow, type BatchKind } from "../platform/batches";
import { assemble } from "../prompts/assemble";
import { assembleFor } from "../prompts/assemble.server";
import { assembleDepsFor } from "../prompts/deps.server";
import { PROMPTS } from "../prompts/registry";
import type { PromptVersion } from "../prompts/types";
import { anthropic } from "../server/client";
import { batchParams } from "../server/request";
import { TASKS, routeFor, type AiTaskId, type Effort } from "../tasks";
import { payloadOf } from "./queue";
import { MAX_ITEMS_PER_BATCH, batchCanaryOf, customIdOf, shouldSubmit } from "./rules";

/** The batch kind of an item set (`ai_batches.kind`). */
function kindOf(items: readonly BatchItemRow[]): BatchKind {
  const kinds = new Set(items.map((i) => (i.refKind === "eval" || i.refKind === "eval_judge" ? "eval" : i.refKind === "job" ? "deep" : "mixed")));
  return kinds.size === 1 ? ([...kinds][0] as BatchKind) : "mixed";
}

/** The effort and budget of an item's task in a batch (the judge has no class: its own row). */
function routeOf(task: AiTaskId, settings: PlatformAiSetting): { effort: Effort; maxTokens: number } {
  if (!TASKS[task].class) return { effort: TASKS[task].effort ?? "high", maxTokens: TASKS[task].maxTokens ?? 4_000 };
  const r = routeFor(task, settings, { pattern: "C" });
  return { effort: r.effort, maxTokens: r.maxTokens };
}

/** One request of the batch, or null when the item cannot be built any more (its store gone, its prompt retired). */
export async function buildItemRequest(ctx: JobCtx, item: BatchItemRow, settings: PlatformAiSetting): Promise<BatchCreateParams.Request | null> {
  const task = item.task as AiTaskId;
  const p = PROMPTS[item.promptVersion] as PromptVersion | undefined;
  if (!p || p.provider !== "server" || !(task in TASKS)) return null;
  const payload = payloadOf(item.payload);
  const canary = p.canary ? batchCanaryOf(item.id) : null;
  let prompt;
  if (item.storeId) {
    const store = await getStoreById(item.storeId);
    if (!store) return null;
    const primary = (["ar", "fr", "en"].includes(store.defaultLocale) ? store.defaultLocale : "fr") as Locale;
    const out = await assembleFor(systemScope(ctx, item.storeId), p, payload.input as never, { market: store.market as Market, currency: store.currency, primaryLocale: primary }, { canary, platformTtl: settings.cacheTtl.platform }, assembleDepsFor());
    if (out.blocked) return null;
    prompt = out.prompt;
  } else {
    const f = ALL_FIXTURES.find((x) => x.id === payload.fixtureId);
    if (!f) return null;
    prompt = assemble(systemScope(ctx, fixtureStoreId(f.store)), p, payload.input as never, storeCtxOf(f), { canary, platformTtl: settings.cacheTtl.platform });
  }
  const r = routeOf(task, settings);
  return {
    custom_id: customIdOf(item.id),
    params: batchParams({ task, class: TASKS[task].class ?? "worker", model: item.model, effort: r.effort, maxTokens: r.maxTokens, pattern: "C", system: prompt.system, messages: prompt.messages, ...(prompt.format ? { format: prompt.format } : {}) }),
  };
}

export interface SubmitReport {
  batches: number;
  items: number;
  dropped: number;
  skipped?: "kill" | "no_key" | "disabled";
}

/** One pass of the submit rule over every model's queue; at most one batch per model per tick. */
export async function submitQueued(ctx: JobCtx): Promise<SubmitReport> {
  const out: SubmitReport = { batches: 0, items: 0, dropped: 0 };
  if ((await activeKillSwitches()).includes("ai_generation_enabled")) return { ...out, skipped: "kill" };
  const summary = (await queuedSummary()).filter((s) => shouldSubmit(s, Date.now()));
  if (!summary.length) return out;
  const settings = await getPlatformSetting("platform_ai");
  if (!settings.enabled) return { ...out, skipped: "disabled" };
  const client = await anthropic();
  if (!client) return { ...out, skipped: "no_key" };
  for (const s of summary) {
    if (Date.now() >= ctx.deadline) break;
    const items = await takeQueued(s.model, MAX_ITEMS_PER_BATCH);
    const requests: BatchCreateParams.Request[] = [];
    const ids: string[] = [];
    for (let i = 0; i < items.length; i++) {
      if (i % 50 === 0) await ctx.yield();
      const item = items[i]!;
      let req: BatchCreateParams.Request | null = null;
      try {
        req = await buildItemRequest(ctx, item, settings);
      } catch (err) {
        console.error(`[ai] batch item not built: ${err instanceof Error ? err.name : "error"}`);
      }
      if (!req) {
        // the ingest settles a dropped item (release, library, the job); here it only leaves the queue
        if (await setItemState(item.id, "queued", "errored", new Date())) out.dropped++;
        continue;
      }
      requests.push(req);
      ids.push(item.id);
    }
    if (!requests.length) continue;
    const batchId = newId();
    const now = new Date();
    await insertBatch({ id: batchId, kind: kindOf(items.filter((i) => ids.includes(i.id))), model: s.model, items: requests.length, now });
    await markSubmitted(ids, batchId, now);
    try {
      const created = await client.messages.batches.create({ requests });
      await updateBatch(batchId, { providerBatchId: created.id, status: created.processing_status === "ended" ? "ended" : "submitted", submittedAt: new Date() });
      out.batches++;
      out.items += requests.length;
    } catch (err) {
      console.error(`[ai] batch create failed: ${err instanceof Error ? err.name : "error"}`);
      await unmarkSubmitted(batchId, new Date());
      await updateBatch(batchId, { status: "failed", error: "create_failed" });
    }
  }
  return out;
}
