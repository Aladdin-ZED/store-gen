import "server-only";
/**
 * Polling and ingesting Message Batches (P7 AI; ai.md AI-§B.8 steps 1-2 and "Ingest", AI-§C.2 step 7, AI-§B.13 case
 * a; docs/STORE-SAAS.md §H.2 slot 4b). Every open batch is retrieved; an ended one is streamed by `custom_id` (results
 * come in any order) and each result ingested once:
 *   - succeeded → `stop_reason` first (a refusal is not retried: library or dropped), the loose parse, the canary,
 *     the task's finalize (the guard), then an `ai_runs` row `via = 'batch'` for a store item with the reservation
 *     reconciled at the batch price, and the result handed on (./handlers.ts): the job stage it belongs to, the eval
 *     run it scores, or the task's registered handler;
 *   - errored / expired / canceled → queued again once, then dropped: the reservation released, the library rung when
 *     the task has one.
 * Each item moves by a compare-and-set on its state, so a batch cut by the tick budget is simply streamed again on
 * the next tick and the items already terminal are skipped; `ingested_at` is set when every item is. The loop
 * yields every 50 items. The stages of jobs riding in a batch get their heartbeat refreshed on every poll.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { MessageBatchResult } from "@anthropic-ai/sdk/resources/messages/batches";
import type { JobCtx } from "@/lib/jobs/runner";
import { systemScope } from "@/lib/jobs/scope";
import { notify } from "@/lib/platform/notify";
import { getPlatformSetting } from "@/lib/settings";
import { effectivePrices, type PlatformAiSetting } from "@/lib/settings/keys/platform_ai";
import type { WriteScope } from "@/lib/tenancy/types";
import { finishPlatformItem, ITEM_TERMINAL, itemById, itemsLeft, jobItemsInFlight, openBatches, setItemState, storesOfBatch, unbuiltItems, updateBatch, type BatchItemRow, type BatchRow } from "../platform/batches";
import { PROMPTS } from "../prompts/registry";
import { sha256Hex } from "../prompts/sha256";
import { canonicalJson } from "../prompts/text";
import type { PromptVersion } from "../prompts/types";
import { aiFailure } from "../provider/failures";
import { LIBRARY_TASKS, libraryResult, seedOf } from "../provider/library";
import type { AiFailCode, AiFlag, AiOutcome, AiResult } from "../provider/types";
import { costMicros, creditsFor } from "../quota/cost";
import { reconcile, release, reservationFrom } from "../quota/reserve";
import { containsCanary } from "../safety/canary";
import { finalizeCtxFor } from "../schema/tasks/ctx.server";
import { finalizeCtxInputOf, finalizeFor } from "../schema/tasks/finalize";
import { anthropic } from "../server/client";
import { iterationsOf, parseLoose, servedModelOf, stopOf, textOf } from "../server/request";
import { activeMemory } from "../store/memory";
import { heartbeatBatchStage } from "../jobs/claim";
import { insertRun, type RunStage } from "../store/runs";
import { TASKS, type AiTaskId } from "../tasks";
import { deliverOutcome, deliverRecorded } from "./handlers";
import { payloadOf, type ItemPayload } from "./queue";
import { INGEST_YIELD_EVERY, MAX_ITEM_ATTEMPTS, batchCanaryOf, itemIdOf, jobRefOf } from "./rules";

export interface IngestReport {
  polled: number;
  ingested: number;
  retried: number;
  dropped: number;
  /** a batch was cut by the budget: it is streamed again next tick */
  resumable: boolean;
}

const STAGE_OF: Partial<Record<AiTaskId, RunStage>> = { "copy.page": "copy", "copy.hero": "copy", "copy.field": "copy", "design.plan": "plan", "design.critique": "critique", "eval.judge": "judge" };

const scopeOf = (ctx: JobCtx, item: BatchItemRow): WriteScope | null => (item.storeId ? systemScope(ctx, item.storeId) : null);

/** The item's reservation, settled once: reconciled at what the provider billed, released when it billed nothing. */
async function settleReservation(scope: WriteScope | null, p: ItemPayload, micros: number): Promise<void> {
  if (!p.reservation || p.reservation.state !== "open") return;
  const r = reservationFrom(p.reservation, scope);
  if (micros > 0) await reconcile(r, { micros, credits: creditsFor(micros) });
  else await release(r);
}

/** What one succeeded message gives: the raw parsed output, its cost, its stop, or the failure it is. */
interface Read {
  ok: boolean;
  code: AiFailCode | null;
  raw: unknown;
  micros: number;
  stop: string | null;
  model: string;
  usage: { inTok: number; outTok: number; cacheReadTok: number; cacheWriteTok: number };
  flags: AiFlag[];
}

function readMessage(item: BatchItemRow, p: PromptVersion, message: Extract<MessageBatchResult, { type: "succeeded" }>["message"], settings: PlatformAiSetting): Read {
  const msg = message as unknown as Parameters<typeof iterationsOf>[0] & Parameters<typeof stopOf>[0] & Parameters<typeof textOf>[0];
  const its = iterationsOf(msg);
  const micros = costMicros(its, effectivePrices(settings.prices).rows, { batch: true, fast: false, writeTtl: settings.cacheTtl.platform }).micros;
  const usage = { inTok: its.reduce((n, i) => n + i.inTok, 0), outTok: its.reduce((n, i) => n + i.outTok, 0), cacheReadTok: its.reduce((n, i) => n + i.cacheReadTok, 0), cacheWriteTok: its.reduce((n, i) => n + i.cacheWriteTok, 0) };
  const model = servedModelOf(msg, item.model).servedModel;
  const stop = stopOf(msg);
  const stopText = stop.reason === "refusal" ? `refusal:${stop.category ?? "null"}` : stop.reason;
  const base = { micros, stop: stopText, model, usage, flags: [] as AiFlag[] };
  if (stop.reason === "refusal") return { ...base, ok: false, code: "refused", raw: null };
  if (stop.reason === "max_tokens") return { ...base, ok: false, code: "max_tokens", raw: null };
  const text = textOf(msg);
  const parsed = p.format ? parseLoose(text, p.format) : ({ ok: true, value: text } as const);
  if (!parsed.ok) return { ...base, ok: false, code: "invalid_output", raw: null };
  if (p.canary && (containsCanary(parsed.value, batchCanaryOf(item.id)) || containsCanary(text, batchCanaryOf(item.id)))) return { ...base, ok: false, code: "invalid_output", raw: null, flags: ["canary_leak"] };
  return { ...base, ok: true, code: null, raw: parsed.value };
}

/** A store item's library answer when its task has one (the job stages never: their job fails instead). */
async function libraryOutcome(scope: WriteScope, item: BatchItemRow, input: unknown, code: AiFailCode): Promise<AiOutcome<unknown> | null> {
  const task = item.task as AiTaskId;
  if (item.refKind === "job" || !LIBRARY_TASKS.has(task)) return null;
  const hash = sha256Hex(canonicalJson(input));
  void scope;
  return libraryResult(task, input as never, { seed: seedOf(hash), hasWhatsapp: false, notes: [{ from: "server", to: "library", code }] });
}

/** A failed item, settled: the run row (a refusal or an invalid output is counted), the reservation, the hand-off. */
async function settleFailure(ctx: JobCtx, item: BatchItemRow, from: BatchItemRow["state"], code: AiFailCode, read: Read | null, now: Date): Promise<boolean> {
  const p = payloadOf(item.payload);
  const to = code === "refused" ? "refused" : "dropped";
  const scope = scopeOf(ctx, item);
  if (!scope) {
    const ok = await finishPlatformItem(item.id, from, to, JSON.stringify({ ...p, output: null, error: code, costMicros: read?.micros ?? 0 }), now);
    if (!ok) return false;
    await settleReservation(null, p, read?.micros ?? 0);
    await deliverRecorded(item);
    return true;
  }
  if (!(await setItemState(item.id, from, to, now))) return false;
  const task = item.task as AiTaskId;
  let runId: string | null = null;
  if (read) {
    runId = await insertRun(scope, {
      userId: null,
      task,
      provider: "server",
      via: "batch",
      class: TASKS[task].class ?? null,
      stage: STAGE_OF[task] ?? null,
      jobId: item.refKind === "job" ? (jobRefOf(item.refId)?.jobId ?? null) : null,
      requestedModel: item.model,
      promptVersion: item.promptVersion,
      rubricVersion: (PROMPTS[item.promptVersion] as PromptVersion | undefined)?.rubricVersion ?? null,
      inputHash: sha256Hex(canonicalJson(p.input)),
      reservedCredits: item.reservedCredits,
      batchItemId: item.id,
      finished: { status: code === "refused" ? "refused" : code === "max_tokens" ? "max_tokens" : code === "invalid_output" ? "invalid_output" : "error", errorCode: read.flags.includes("canary_leak") ? "canary_leak" : code, model: read.model, stopReason: read.stop, usage: read.usage, costMicros: read.micros, credits: creditsFor(read.micros), flags: read.flags, ms: 0, reconciled: true },
    });
  }
  await settleReservation(scope, p, read?.micros ?? 0);
  const lib = await libraryOutcome(scope, item, p.input, code);
  await deliverOutcome(ctx, scope, item, lib ?? aiFailure(code, "server", runId));
  return true;
}

/** One result, ingested once (a compare-and-set on the item's state); true when this call moved the item. */
export async function ingestResult(ctx: JobCtx, item: BatchItemRow, result: MessageBatchResult, settings: PlatformAiSetting, now: Date = new Date()): Promise<"ingested" | "retried" | "dropped" | "skipped"> {
  if (ITEM_TERMINAL.includes(item.state) || item.state === "queued") return "skipped";
  const from = item.state;
  if (result.type !== "succeeded") {
    if (item.attempts < MAX_ITEM_ATTEMPTS) return (await setItemState(item.id, from, "queued", now, { batchId: null })) ? "retried" : "skipped";
    return (await settleFailure(ctx, item, from, result.type === "expired" ? "timeout" : "provider_error", null, now)) ? "dropped" : "skipped";
  }
  const p = PROMPTS[item.promptVersion] as PromptVersion | undefined;
  if (!p) return (await settleFailure(ctx, item, from, "bad_request", null, now)) ? "dropped" : "skipped";
  const read = readMessage(item, p, result.message, settings);
  if (!read.ok) return (await settleFailure(ctx, item, from, read.code ?? "invalid_output", read, now)) ? "dropped" : "skipped";
  const payload = payloadOf(item.payload);
  const scope = scopeOf(ctx, item);
  if (!scope) {
    // a platform eval item: the raw output is scored with the whole run (the scorers finalize it themselves)
    const recorded = { ...payload, output: read.raw, usage: { model: read.model, ...read.usage }, stop: read.stop, model: read.model, costMicros: read.micros };
    if (!(await finishPlatformItem(item.id, from, "ingested", JSON.stringify(recorded), now))) return "skipped";
    await settleReservation(null, payload, read.micros);
    await deliverRecorded(item);
    return "ingested";
  }
  const task = item.task as AiTaskId;
  const finalize = finalizeFor(task, payload.input);
  const fctx = await finalizeCtxFor(scope, finalizeCtxInputOf(task, payload.input), { storeFacts: async (s) => (await activeMemory(s)).filter((m) => m.kind === "fact").map((m) => m.text) });
  const fin = finalize ? finalize(read.raw, fctx) : null;
  if (!fin) return (await settleFailure(ctx, item, from, "invalid_output", read, now)) ? "dropped" : "skipped";
  // claim the item before any side effect: a second ingest of the same result writes nothing
  if (!(await setItemState(item.id, from, "succeeded", now))) return "skipped";
  const job = item.refKind === "job" ? jobRefOf(item.refId) : null;
  const flags: AiFlag[] = [...(fin.rejected.length ? (["guard_partial"] as const) : []), ...(job ? (["job_degraded_to_batch", "stage_resumed"] as const) : [])];
  const runId = await insertRun(scope, {
    userId: null,
    task,
    provider: "server",
    via: "batch",
    class: TASKS[task].class ?? null,
    stage: STAGE_OF[task] ?? null,
    jobId: job?.jobId ?? null,
    requestedModel: item.model,
    promptVersion: item.promptVersion,
    rubricVersion: p.rubricVersion,
    inputHash: sha256Hex(canonicalJson(payload.input)),
    locale: fctx.locale,
    reservedCredits: item.reservedCredits,
    batchItemId: item.id,
    finished: { status: "ok", model: read.model, stopReason: read.stop, usage: read.usage, costMicros: read.micros, credits: creditsFor(read.micros), flags, rejectedFields: fin.rejected, ms: 0, output: fin.value, reconciled: true },
  });
  await settleReservation(scope, payload, read.micros);
  await setItemState(item.id, "succeeded", "ingested", new Date(), { runId });
  const out: AiResult<unknown> = {
    ok: true,
    value: fin.value,
    provider: "server",
    class: TASKS[task].class ?? "worker",
    model: read.model,
    effort: TASKS[task].effort ?? "low",
    promptVersion: item.promptVersion,
    rubricVersion: p.rubricVersion,
    runId,
    jobId: job?.jobId ?? null,
    usage: { ...read.usage, costMicros: read.micros, credits: creditsFor(read.micros) },
    ms: 0,
    ttftMs: null,
    rejected: fin.rejected,
    flags,
    notes: [],
  };
  await deliverOutcome(ctx, scope, item, out);
  return "ingested";
}

/** Streams one ended batch and ingests what is not terminal yet; false when the budget cut it. */
async function ingestBatch(ctx: JobCtx, client: Anthropic, b: BatchRow, settings: PlatformAiSetting, out: IngestReport): Promise<boolean> {
  const decoder = await client.messages.batches.results(b.providerBatchId!);
  let n = 0;
  for await (const r of decoder) {
    if (++n % INGEST_YIELD_EVERY === 0) {
      await ctx.yield();
      if (Date.now() >= ctx.deadline) {
        out.resumable = true;
        return false;
      }
    }
    const id = itemIdOf(r.custom_id);
    const item = id ? await itemById(id) : null;
    if (!item || item.batchId !== b.id) continue;
    const res = await ingestResult(ctx, item, r.result, settings);
    if (res === "ingested") out.ingested++;
    else if (res === "retried") out.retried++;
    else if (res === "dropped") out.dropped++;
  }
  if ((await itemsLeft(b.id)) === 0) {
    await updateBatch(b.id, { ingestedAt: new Date(), ingestedItems: b.items });
    for (const s of await storesOfBatch(b.id)) await notify({ audience: "store", storeId: s.storeId }, "ai.batch_done", { count: s.n }, { dedupeKey: `ai.batch_done:${b.id}:${s.storeId}` });
  }
  return true;
}

/** Items the submit could not build: settled as dropped (released, library, the job told). */
async function settleUnbuilt(ctx: JobCtx, out: IngestReport): Promise<void> {
  for (const item of await unbuiltItems(50)) {
    if (Date.now() >= ctx.deadline) return;
    if (await settleFailure(ctx, item, "errored", "bad_request", null, new Date())) out.dropped++;
  }
}

/** One pass of slot 4b's poll and ingest (the submission is ./submit.ts); never needs the kill switch off. */
export async function pollAndIngest(ctx: JobCtx): Promise<IngestReport> {
  const out: IngestReport = { polled: 0, ingested: 0, retried: 0, dropped: 0, resumable: false };
  await settleUnbuilt(ctx, out);
  const open = await openBatches();
  if (!open.length) return out;
  const client = await anthropic();
  if (!client) return out;
  const settings = await getPlatformSetting("platform_ai");
  for (const b of open) {
    if (Date.now() >= ctx.deadline) {
      out.resumable = true;
      break;
    }
    if (!b.providerBatchId) continue;
    let status = b.status;
    if (status !== "ended" && status !== "expired") {
      const r = await client.messages.batches.retrieve(b.providerBatchId);
      out.polled++;
      const c = r.request_counts;
      status = r.processing_status === "ended" ? "ended" : r.processing_status === "canceling" ? "canceling" : "in_progress";
      await updateBatch(b.id, { status, succeeded: c.succeeded, errored: c.errored, expired: c.expired, canceled: c.canceled, ...(r.ended_at ? { endedAt: new Date(r.ended_at) } : {}) });
      if (status === "ended" && (c.expired > 0 || (c.errored > 0 && c.succeeded === 0))) {
        await notify({ audience: "platform_staff", minRole: "admin" }, "ai.batch_failed", { batchId: b.id, errored: c.errored, expired: c.expired }, { severity: "warn", dedupeKey: `ai.batch_failed:${b.id}`, link: "/admin/ai" });
      }
    }
    if (status === "ended" || status === "expired") await ingestBatch(ctx, client, { ...b, status }, settings, out);
    await ctx.yield();
  }
  await refreshJobHeartbeats(ctx);
  return out;
}

/** The heartbeat of every job stage riding in a batch (orphan recovery skips `batch:` rows; the console reads it). */
async function refreshJobHeartbeats(ctx: JobCtx): Promise<void> {
  for (const it of await jobItemsInFlight()) {
    const ref = jobRefOf(it.refId);
    if (ref) await heartbeatBatchStage(systemScope(ctx, it.storeId), ref.jobId, ref.stage);
  }
}
