import "server-only";
/**
 * The Batches queue (P7 AI; ai.md AI-§B.8 "Queue", AI-§C.2 step 7, AI-§B.13 case a/b; docs/STORE-SAAS.md §H.12
 * pattern C). Every item is one `ai_batch_items` row:
 *   - `dedupe = sha256(task | ref | inputHash | promptVersion)`, unique while the item is not terminal (NULL once
 *     ingested or dropped), so the same work queued twice is one item (`deduped: true`);
 *   - the credits are reserved when the item is queued, at the batch price (0.5×), and reconciled at ingest; a store
 *     item charges its store, a platform item (an eval) the platform month; the reservation rides in the payload;
 *   - a job stage handed to a one-item batch (`ref_kind = 'job'`) reserves nothing: its job reserved every stage.
 * `queueAi` (../router/server.ts, frozen) is `queueStoreOrPlatform` with the task's class model and active version.
 * The kill switch does not stop the queue (only submission, AI-§B.8); a task not live, cloud off, no key or no cap does.
 */
import { newId } from "@/lib/db/ids";
import { aiBatchItems } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { getPlatformSetting } from "@/lib/settings";
import { effectivePrices } from "@/lib/settings/keys/platform_ai";
import type { WriteScope } from "@/lib/tenancy/types";
import { storeValues } from "@/lib/tenancy/sql";
import { insertPlatformItem, itemByDedupe } from "../platform/batches";
import { promptFor } from "../prompts/registry";
import { sha256Hex } from "../prompts/sha256";
import { canonicalJson } from "../prompts/text";
import type { AiTaskInput } from "../provider/types";
import { estimate } from "../quota/cost";
import { AiQuotaError, release, reservationJson, reserve, type ReservationJson } from "../quota/reserve";
import { gateInput } from "../safety/pii";
import { parseTaskInput } from "../schema/tasks/inputs";
import { TASKS, routeFor, type AiTaskId } from "../tasks";
import { batchDedupe } from "./rules";

/** What the payload column holds: the task input and what the ingest needs to settle the item. */
export interface ItemPayload {
  v: 1;
  input: unknown;
  /** null: nothing reserved (a job stage, whose job reserved it) */
  reservation: ReservationJson | null;
  /** an eval item: the fixture it runs, and for a judge item which side the candidate was shown on */
  fixtureId?: string;
  candidateSide?: "A" | "B";
  rep?: number;
  /** the class whose model the item runs (an eval candidate, a job stage) */
  class?: string;
}

export class AiQueueError extends Error {
  constructor(readonly code: string) {
    super(`ai queue: ${code}`);
    this.name = "AiQueueError";
  }
}

export const payloadOf = (raw: string): ItemPayload => JSON.parse(raw) as ItemPayload;

export interface QueueItem {
  task: AiTaskId;
  input: unknown;
  ref: { kind: string; id: string };
  model: string;
  promptVersion: string;
  /** reserve the batch-price estimate (store items, eval items); false for a prepaid job stage */
  reserve: boolean;
  evalRunId?: string | null;
  extra?: Omit<ItemPayload, "v" | "input" | "reservation">;
}

/** One store item through its scope (the reservation on the store's counters); a duplicate is released at once. */
export async function queueStoreItem(scope: WriteScope, it: QueueItem): Promise<{ itemId: string; deduped: boolean }> {
  const inputHash = sha256Hex(canonicalJson(it.input));
  const dedupe = batchDedupe(it.task, it.ref, inputHash, it.promptVersion);
  const prev = await itemByDedupe(dedupe);
  if (prev) return { itemId: prev, deduped: true };
  const id = newId();
  const now = new Date();
  let reservation = null;
  if (it.reserve) {
    const settings = await getPlatformSetting("platform_ai");
    const est = estimate(it.task, it.input, { batch: true, fast: false, model: it.model, prices: effectivePrices(settings.prices).rows });
    try {
      reservation = await reserve(scope, est, id, { task: it.task });
    } catch (err) {
      if (err instanceof AiQuotaError) throw new AiQueueError(err.code);
      throw err;
    }
  }
  const payload: ItemPayload = { v: 1, input: it.input, reservation: reservation ? reservationJson(reservation) : null, ...(it.extra ?? {}) };
  try {
    await db.insert(aiBatchItems).values(
      storeValues(scope, {
        id,
        task: it.task,
        refKind: it.ref.kind.slice(0, 24),
        refId: it.ref.id.slice(0, 64),
        dedupe,
        payload: JSON.stringify(payload),
        promptVersion: it.promptVersion,
        model: it.model,
        state: "queued" as const,
        reservedCredits: reservation?.credits ?? 0,
        evalRunId: it.evalRunId ?? null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    return { itemId: id, deduped: false };
  } catch (err) {
    if (reservation) await release(reservation);
    const dup = (err as { errno?: number; cause?: { errno?: number } }).errno === 1062 || (err as { cause?: { errno?: number } }).cause?.errno === 1062;
    const again = dup ? await itemByDedupe(dedupe) : null;
    if (again) return { itemId: again, deduped: true };
    throw err;
  }
}

/** One platform item (an eval candidate or judge item), paid from the platform month. */
export async function queuePlatformItem(it: QueueItem): Promise<{ itemId: string; deduped: boolean }> {
  const inputHash = sha256Hex(canonicalJson(it.input));
  const dedupe = batchDedupe(it.task, it.ref, inputHash, it.promptVersion);
  const prev = await itemByDedupe(dedupe);
  if (prev) return { itemId: prev, deduped: true };
  const id = newId();
  let reservation = null;
  if (it.reserve) {
    const settings = await getPlatformSetting("platform_ai");
    const est = estimate(it.task, it.input, { batch: true, fast: false, model: it.model, prices: effectivePrices(settings.prices).rows });
    try {
      reservation = await reserve("platform", est, id, { task: it.task, payer: "platform" });
    } catch (err) {
      if (err instanceof AiQuotaError) throw new AiQueueError(err.code);
      throw err;
    }
  }
  const payload: ItemPayload = { v: 1, input: it.input, reservation: reservation ? reservationJson(reservation) : null, ...(it.extra ?? {}) };
  const out = await insertPlatformItem({
    id,
    task: it.task,
    refKind: it.ref.kind.slice(0, 24),
    refId: it.ref.id.slice(0, 64),
    dedupe,
    payload: JSON.stringify(payload),
    promptVersion: it.promptVersion,
    model: it.model,
    reservedCredits: reservation?.credits ?? 0,
    evalRunId: it.evalRunId ?? null,
    now: new Date(),
  });
  if (out.deduped && reservation) await release(reservation);
  return { itemId: out.id, deduped: out.deduped };
}

/**
 * `queueAi` (frozen): a store's non-urgent task, or a platform-paid one. The task must have a class and a server
 * prompt; the input is parsed strictly and passes the PII gate like a live call; the model is the class model and the
 * version the active one. Throws `AiQueueError` (`input_invalid`, `pii_blocked`, a quota code, `no_route`).
 */
export async function queueStoreOrPlatform<T extends AiTaskId>(scope: WriteScope | "platform", task: T, input: AiTaskInput<T>, ref: { kind: string; id: string }): Promise<{ itemId: string; deduped: boolean }> {
  const def = TASKS[task];
  const settings = await getPlatformSetting("platform_ai");
  if (!settings.enabled) throw new AiQueueError("disabled");
  if (!def.class || !def.family) throw new AiQueueError("no_route");
  const parsed = parseTaskInput(task, input);
  if (!parsed.ok) throw new AiQueueError("input_invalid");
  const gated = gateInput(task, parsed.value);
  if ("blocked" in gated) throw new AiQueueError("pii_blocked");
  const p = promptFor(def.family, settings, "server");
  if (!p) throw new AiQueueError("no_route");
  const model = routeFor(task, settings, { pattern: "C" }).model;
  const it: QueueItem = { task, input: gated.input, ref, model, promptVersion: p.version, reserve: true };
  return scope === "platform" ? queuePlatformItem(it) : queueStoreItem(scope, it);
}
