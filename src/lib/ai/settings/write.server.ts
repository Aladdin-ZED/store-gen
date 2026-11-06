import "server-only";
/**
 * Settings → AI, the writes (P7 AI; ai.md AI-§K.1, AI-06, AI-§G.2, AI-§B.13 step 5; docs/STORE-SAAS.md D70, D71).
 * The bodies of the page's server actions (src/app/app/[store]/settings/ai/actions.ts wraps each one in
 * `storeAction("ai.manage", …)`), kept here so test:ai-db drives them with a seam-shaped ctx:
 *   - every write checks `ai.manage` again (a ctx without it is refused `forbidden`, nothing written);
 *   - every input carries an idempotency key: a replay of the same key in the same store answers the first result
 *     without writing again (a double tap, a retried request);
 *   - `store_ai` writes go through `updateStoreSetting` (row lock, `store.settings.updated`) and add the AI audit
 *     (`store.ai.settings_updated` / `voice_updated` with the field names only), then drop the cached policy;
 *   - memory writes go through the scoped repository (`store.ai.memory_added` / `memory_deleted` / `memory_pinned`,
 *     ids and kinds only: the text is store data and stays in its row);
 *   - the probe (D56) is staff only (`enqueueProbeJob` answers `forbidden` to anyone else), audited.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { auditFrom } from "@/lib/audit";
import { updateStoreSetting } from "@/lib/settings";
import { BrandVoice } from "@/lib/settings/keys/store_ai";
import { scopedCache } from "@/lib/tenancy/cache";
import { SeamError } from "@/lib/tenancy/seam";
import type { StoreCtx, WriteCtx } from "@/lib/tenancy/types";
import { enqueueProbeJob } from "../jobs/enqueue";
import { invalidateAiPolicy } from "../router/server";
import { addMemory, deleteMemory, MemoryError, MemoryInput, setMemoryPinned } from "../store/memory";
import { cleanWords } from "./view";

/* ------------------------------------------------------------------ */
/* inputs                                                              */
/* ------------------------------------------------------------------ */

const Key = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, "error.invalid");
const Id = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "error.invalid");

export const ModeInput = z.strictObject({ key: Key, mode: z.enum(["auto", "local", "server"]) });
export const DirectorInput = z.strictObject({ key: Key, director: z.enum(["auto", "ask", "off"]).nullable() });
export const DeepPassInput = z.strictObject({ key: Key, deepPass: z.boolean() });
export const LocalInput = z
  .strictObject({ key: Key, localEnabled: z.boolean().optional(), localTierCeiling: z.enum(["lite", "full"]).optional(), bgRemoval: z.boolean().optional() })
  .refine((v) => v.localEnabled !== undefined || v.localTierCeiling !== undefined || v.bgRemoval !== undefined, "error.invalid");
export const LearningInput = z.strictObject({ key: Key, learning: z.boolean() });
export const ShareInput = z.strictObject({ key: Key, sharePatterns: z.boolean() });

const Words = (max: number) => z.array(z.string().max(80)).max(64).transform((w) => cleanWords(w, max));
const Cta = z
  .partialRecord(z.enum(["ar", "fr", "en"]), z.string().max(64))
  .transform((r) => Object.fromEntries(Object.entries(r).map(([l, s]) => [l, (s ?? "").replace(/\s+/g, " ").trim()]).filter(([, s]) => s.length > 0)));
export const VoiceInput = z.strictObject({
  key: Key,
  voice: z.strictObject({
    formality: z.enum(["vous", "tu"]),
    darija: z.enum(["none", "cta", "light"]),
    ctaByLocale: Cta.pipe(BrandVoice.shape.ctaByLocale),
    wordsUse: Words(12),
    wordsAvoid: Words(24),
  }),
});
export const MemoryAddInput = z.strictObject({ key: Key, item: MemoryInput });
export const MemoryIdInput = z.strictObject({ key: Key, id: Id });
export const MemoryPinInput = z.strictObject({ key: Key, id: Id, pinned: z.boolean() });
export const ProbeInput = z.strictObject({ key: Key });

/* ------------------------------------------------------------------ */
/* idempotency                                                         */
/* ------------------------------------------------------------------ */

/** The first call of a (store, key) runs; a replay within 10 minutes gets the same promise. A failure is not kept. */
const recent = scopedCache<Promise<unknown>>({ name: "ai-settings-idem", maxEntries: 2_000, ttlMs: 10 * 60_000, sizeOf: () => 64 });

function once<T>(storeId: string, key: string, run: () => Promise<T>): Promise<T> {
  const hit = recent.get(storeId, key);
  if (hit) return hit as Promise<T>;
  const result = run();
  recent.set(storeId, key, result);
  result.catch(() => recent.delete(storeId, key));
  return result;
}

/* ------------------------------------------------------------------ */
/* writes                                                              */
/* ------------------------------------------------------------------ */

/** `ai.manage` again, whatever wrapped the call (matrix ∧ mode ∧ state ∧ impersonation, the seam's `can`). */
function assertManage(ctx: StoreCtx): void {
  if (ctx.impersonation || ctx.scope.kind === "impersonation") throw new SeamError("impersonation_read_only");
  if (!ctx.can("ai.manage")) throw new SeamError("forbidden");
}

type StoreAiPatch = Partial<{ mode: "auto" | "local" | "server"; director: "auto" | "ask" | "off" | null; deepPass: boolean; localEnabled: boolean; localTierCeiling: "lite" | "full"; bgRemoval: boolean; learning: boolean; sharePatterns: boolean }>;

async function patchStoreAi(ctx: WriteCtx, patch: StoreAiPatch): Promise<null> {
  await updateStoreSetting(ctx.scope, "store_ai", patch, settingsActor(ctx.actor));
  invalidateAiPolicy(ctx.scope.storeId);
  await auditFrom(ctx, "store.ai.settings_updated", { target: "store_ai", meta: { fields: Object.keys(patch) } });
  return null;
}

/** One `store_ai` field group; `parse` validates before anything is read. */
function settingsWrite<S extends z.ZodType<{ key: string } & StoreAiPatch>>(schema: S) {
  return (ctx: WriteCtx, input: unknown): Promise<null> => {
    assertManage(ctx);
    const { key, ...patch } = schema.parse(input);
    return once(ctx.scope.storeId, key, () => patchStoreAi(ctx, patch as StoreAiPatch));
  };
}

export const saveMode = settingsWrite(ModeInput);
export const saveDirector = settingsWrite(DirectorInput);
export const saveDeepPass = settingsWrite(DeepPassInput);
export const saveLocal = settingsWrite(LocalInput);
export const saveLearning = settingsWrite(LearningInput);
export const saveShare = settingsWrite(ShareInput);

/** The voice (AI-06): the five fields the page edits; the genome's `register` and the two axes are kept as stored. */
export function saveVoice(ctx: WriteCtx, input: unknown): Promise<z.output<typeof VoiceInput>["voice"]> {
  assertManage(ctx);
  const { key, voice } = VoiceInput.parse(input);
  return once(ctx.scope.storeId, key, async () => {
    const saved = await updateStoreSetting(ctx.scope, "store_ai", (cur) => ({ voice: { ...cur.voice, ...voice } }), settingsActor(ctx.actor));
    invalidateAiPolicy(ctx.scope.storeId);
    await auditFrom(ctx, "store.ai.voice_updated", { target: "store_ai", meta: { fields: Object.keys(voice) } });
    const v = saved.voice;
    return { formality: v.formality, darija: v.darija, ctaByLocale: v.ctaByLocale, wordsUse: v.wordsUse, wordsAvoid: v.wordsAvoid };
  });
}

const memoryFail = (err: unknown): never => {
  if (err instanceof MemoryError) fail(err.code === "memory_full" ? "ai.settings.memory.full" : "ai.settings.memory.gone");
  throw err;
};

export function addMemoryItem(ctx: WriteCtx, input: unknown): Promise<{ id: string }> {
  assertManage(ctx);
  const { key, item } = MemoryAddInput.parse(input);
  return once(ctx.scope.storeId, key, async () => {
    const id = await addMemory(ctx.scope, item, ctx.actor.userId).catch(memoryFail);
    invalidateAiPolicy(ctx.scope.storeId);
    await auditFrom(ctx, "store.ai.memory_added", { target: id, meta: { kind: item.kind, source: "explicit" } });
    return { id };
  });
}

export function deleteMemoryItem(ctx: WriteCtx, input: unknown): Promise<null> {
  assertManage(ctx);
  const { key, id } = MemoryIdInput.parse(input);
  return once(ctx.scope.storeId, key, async () => {
    await deleteMemory(ctx.scope, id).catch(memoryFail);
    invalidateAiPolicy(ctx.scope.storeId);
    await auditFrom(ctx, "store.ai.memory_deleted", { target: id });
    return null;
  });
}

export function pinMemoryItem(ctx: WriteCtx, input: unknown): Promise<null> {
  assertManage(ctx);
  const { key, id, pinned } = MemoryPinInput.parse(input);
  return once(ctx.scope.storeId, key, async () => {
    await setMemoryPinned(ctx.scope, id, pinned).catch(memoryFail);
    invalidateAiPolicy(ctx.scope.storeId);
    await auditFrom(ctx, "store.ai.memory_pinned", { target: id, meta: { pinned } });
    return null;
  });
}

/**
 * The detached-job probe (D56, AI-§B.13 step 5): staff of the platform who belong to the store, never "View as store";
 * creates the probe job (no model, no credit) and audits it. The job id is what qa:detached-job-probe watches.
 */
export function startProbe(ctx: StoreCtx, input: unknown): Promise<{ jobId: string }> {
  if (ctx.impersonation || ctx.scope.kind === "impersonation") throw new SeamError("impersonation_read_only");
  // a seller reaches the body through the seam (membership) and gets the staff-only answer, never a job
  if (ctx.user.platformRole !== "admin" && ctx.user.platformRole !== "super_admin") fail("ai.settings.probe.staff_only");
  const { key } = ProbeInput.parse(input);
  return once(ctx.scope.storeId, key, async () => {
    const r = await enqueueProbeJob(ctx);
    if (!r.ok) return fail(r.code === "forbidden" ? "ai.settings.probe.staff_only" : "ai.settings.readonly.impersonation");
    await auditFrom(ctx, "platform.ai.probe_started", { target: r.jobId, meta: { kind: "detached_job" } });
    return { jobId: r.jobId };
  });
}
