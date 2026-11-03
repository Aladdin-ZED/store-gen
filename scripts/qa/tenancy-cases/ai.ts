/**
 * Two-store attack cases of the ai track (P7 AI, ai.md).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created empty at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty file as not applicable until the track merges.
 *
 * Reads (step 2):
 *  - `finalizeCtxFor(scope, input)` (src/lib/ai/schema/tasks/ctx.server.ts): the store facts every task's finalize
 *    reads (policies, the voice's banned words, WhatsApp, the calling window) come from the scope's store only. A and
 *    B each get a canary in `store_ai.voice.wordsAvoid` and their own policies; B's context carries B's and none of
 *    A's (nor any harness canary of A), A's context carries A's (the check is not blind), and the read leaves A's rows
 *    as they were. The browser never sends these fields, so the scope is the only way in.
 *
 * Reads (step 4):
 *  - `storeBlockCtxFor(scope, store, deps)` and `assembleFor(…)` (src/lib/ai/prompts/assemble.server.ts): block 3 of
 *    a prompt (policies, voice, memory) is read through the scope. B's assembled copy prompt carries B's policy and
 *    banned word and none of A's (nor any harness canary of A), and block 2 is byte-identical for A and B. A memory
 *    repository that hands A's rows to B's scope (a planted bug) makes the assembly throw `cross_store_context`
 *    with no row text in the error, and the refusal is reported with B's store id only.
 *
 * Jobs (step 8):
 *  - `advanceJob`, `claimStage`, `aiJobsForPulse` and the job API's `getAiJob` (src/lib/ai/jobs/**): A's queued
 *    job is invisible to B's scope (null view, no stage claimed, nothing in B's pulse for A's owner) and B's calls
 *    leave it as it was; A's own pulse shows it (the check is not blind).
 *
 * Router (step 7):
 *  - `runAi(scope, task, input, opts)` (src/lib/ai/router/server.ts): an impersonation scope of A is refused with
 *    `state` before any read of counters, cache or provider (no run row, no counter); a run in B's scope (whatever
 *    the harness's AI settings make of it: a server run or the library rung) leaves A's rows and counters as they were.
 *
 * Repositories (step 6):
 *  - `ai_runs`, `ai_cache`, `ai_memory`, `ai_jobs` through their scoped repositories (src/lib/ai/store/**): A writes a
 *    run, a cache entry, a memory item and a job; B's scope reads none of them by id or by list (`getRunMeta`,
 *    `recentRuns`, `cacheLookup` with the identical key, `listMemory`, `activeMemory`, `getAiJob`, `activeJobsFor`),
 *    cannot finish, link, pin or delete them (`finishRun`, `linkAiRuns`, `setMemoryPinned`, `deleteMemory`), and B's
 *    `aiUsageForStore` holds none of A's cost; A's rows are left as they were.
 */
import { randomBytes } from "node:crypto";
import { assembleFor, storeBlockCtxFor } from "@/lib/ai/prompts/assemble.server";
import { AiAssemblyError } from "@/lib/ai/prompts/assemble";
import type { PromptMemoryRow } from "@/lib/ai/prompts/store-block";
import { PROMPTS } from "@/lib/ai/prompts/registry";
import type { AiTaskInput } from "@/lib/ai/provider/types";
import { finalizeCtxFor } from "@/lib/ai/schema/tasks/ctx.server";
import { linkAiRuns } from "@/lib/ai/feedback.server";
import { sha256Hex } from "@/lib/ai/prompts/sha256";
import { cacheExpiry, cacheLookup, cacheWrite } from "@/lib/ai/store/cache";
import { activeJobsFor, getAiJob } from "@/lib/ai/store/jobs";
import { getAiJob as getAiJobApi } from "@/lib/ai/jobs/enqueue";
import { claimStage } from "@/lib/ai/jobs/claim";
import { aiJobsForPulse } from "@/lib/ai/jobs/pulse";
import { advanceJob } from "@/lib/ai/jobs/run";
import { activeMemory, addMemory, deleteMemory, listMemory, setMemoryPinned } from "@/lib/ai/store/memory";
import { finishRun, getRunMeta, insertRun, recentRuns } from "@/lib/ai/store/runs";
import { aiUsageForStore } from "@/lib/ai/summary.server";
import { runAi } from "@/lib/ai/router/server";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { aiJobs } from "@/lib/db/schema";
import { storeValues } from "@/lib/tenancy/sql";
import { setStoreSetting } from "@/lib/settings";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { TenancyCase } from "../tenancy-check";

/** the harness hands out member scopes; the settings write takes the WriteScope it is */
const writable = (s: StoreScope): s is WriteScope => s.kind === "member";

export const cases: TenancyCase[] = [
  {
    name: "ai: finalizeCtxFor reads its own store's policies, voice and window only",
    async run(kit) {
      const tag = randomBytes(4).toString("hex");
      const avoid = { A: `ai-avoid-a-${tag}`, B: `ai-avoid-b-${tag}` };
      for (const key of ["A", "B"] as const) {
        const scope = kit.scope(key);
        if (!writable(scope)) throw new Error(`ai: the harness scope of ${key} is not a member scope`);
        const actor = { id: kit.fx[key].members.owner, ip: null };
        await setStoreSetting(scope, "store_ai", { voice: { wordsAvoid: [avoid[key]] } }, actor);
        await setStoreSetting(scope, "policies", { returns: { accepted: key === "A", windowDays: key === "A" ? 23 : null } }, actor);
      }
      const input = { locale: "fr" as const, productName: "Sérum", facts: [] };
      const before = await kit.snapshotA();

      const asB = await finalizeCtxFor(kit.scope("B"), input);
      kit.check("ai/finalizeCtxFor(B): B's banned words", asB.wordsAvoid?.includes(avoid.B) === true, asB.wordsAvoid);
      kit.check("ai/finalizeCtxFor(B): none of A's banned words", !JSON.stringify(asB).includes(avoid.A), asB.wordsAvoid);
      kit.check("ai/finalizeCtxFor(B): B's policies, not A's", asB.policies.returns.accepted === false && asB.policies.returns.windowDays === null, asB.policies.returns);
      kit.check("ai/finalizeCtxFor(B): no canary of A", kit.leaks(asB).length === 0, kit.leaks(asB));
      kit.check("ai/finalizeCtxFor(B): no hours from an unsaved window", asB.callingHours.text === null, asB.callingHours);

      const asA = await finalizeCtxFor(kit.scope("A"), input);
      kit.check("ai/finalizeCtxFor(A): A's own banned words and policies (the check is not blind)", asA.wordsAvoid?.includes(avoid.A) === true && asA.policies.returns.windowDays === 23, { wordsAvoid: asA.wordsAvoid, returns: asA.policies.returns });
      kit.check("ai/finalizeCtxFor: the read leaves A's rows as they were", (await kit.snapshotA()) === before);
    },
  },
  {
    name: "ai: the prompt's store layer is read through the scope; another store's rows are refused",
    async run(kit) {
      const tag = randomBytes(4).toString("hex");
      const avoid = { A: `ai-block-a-${tag}`, B: `ai-block-b-${tag}` };
      for (const key of ["A", "B"] as const) {
        const scope = kit.scope(key);
        if (!writable(scope)) throw new Error(`ai: the harness scope of ${key} is not a member scope`);
        const actor = { id: kit.fx[key].members.owner, ip: null };
        await setStoreSetting(scope, "store_ai", { voice: { wordsAvoid: [avoid[key]] } }, actor);
        await setStoreSetting(scope, "policies", { warranty: { months: key === "A" ? 17 : 5 } }, actor);
      }
      const store = { market: "MA" as const, currency: "MAD", primaryLocale: "fr" as const };
      const row = (storeId: string, text: string): PromptMemoryRow => ({ id: `mem-${tag}`, storeId, kind: "prefer", text, locale: null, source: "explicit", active: true, pinned: false, evidence: null });
      const memoryOf = (scope: { storeId: string }) => [row(scope.storeId, `note ${scope.storeId === kit.scope("A").storeId ? avoid.A : avoid.B}`)];
      const before = await kit.snapshotA();
      const input: AiTaskInput<"copy.page"> = { locale: "fr", market: "MA", product: { name: "Sérum", category: "skincare", priceMinor: 19_900, currency: "MAD", facts: [] }, analysis: null, deliveryText: null, direction: null, kickers: null };
      const p = PROMPTS["copy.page@s1"]!;

      const ctxB = await storeBlockCtxFor(kit.scope("B"), store, { memory: async (s) => memoryOf(s) });
      kit.check("ai/storeBlockCtxFor(B): B's banned word and warranty", ctxB.voice.wordsAvoid.includes(avoid.B) && ctxB.policies.warranty.months === 5, { words: ctxB.voice.wordsAvoid, warranty: ctxB.policies.warranty });
      kit.check("ai/storeBlockCtxFor(B): none of A's", !JSON.stringify(ctxB).includes(avoid.A) && kit.leaks(ctxB).length === 0, kit.leaks(ctxB));

      const asB = await assembleFor(kit.scope("B"), p, input, store, {}, { memory: async (s) => memoryOf(s) });
      const asA = await assembleFor(kit.scope("A"), p, input, store, {}, { memory: async (s) => memoryOf(s) });
      if (asB.blocked || asA.blocked) throw new Error("ai: a clean input was blocked by the PII gate");
      const bodyB = JSON.stringify(asB.prompt);
      kit.check("ai/assembleFor(B): B's prompt carries B's policy and words", bodyB.includes("Warranty: 5 months.") && bodyB.includes(avoid.B), bodyB.length);
      kit.check("ai/assembleFor(B): no A data, no canary of A", !bodyB.includes(avoid.A) && !bodyB.includes("Warranty: 17 months.") && kit.leaks(asB.prompt).length === 0, kit.leaks(asB.prompt));
      kit.check("ai/assembleFor(A): A's own (the check is not blind)", JSON.stringify(asA.prompt).includes(avoid.A) && JSON.stringify(asA.prompt).includes("Warranty: 17 months."));
      kit.check("ai/assembleFor: block 2 is byte-identical for A and B", asA.prompt.system[0]!.text === asB.prompt.system[0]!.text);
      kit.check("ai/assembleFor: block 3 differs between A and B", asA.prompt.system[1]!.text !== asB.prompt.system[1]!.text && asA.prompt.voiceVersion !== asB.prompt.voiceVersion);

      // a planted repository bug: A's memory rows handed to B's scope
      const reported: string[] = [];
      let refused: unknown = null;
      try {
        await assembleFor(kit.scope("B"), p, input, store, {}, { memory: async () => memoryOf(kit.scope("A")), recordError: (_area, _err, meta) => reported.push(meta.storeId) });
      } catch (err) {
        refused = err;
      }
      kit.check("ai/assembleFor(B) with A's memory rows: cross_store_context", refused instanceof AiAssemblyError && refused.code === "cross_store_context" && refused.area === "ai", String(refused));
      kit.check("ai/assembleFor: the refusal carries no row text", !(refused instanceof Error && refused.message.includes(avoid.A)));
      kit.check("ai/assembleFor: the refusal is reported with B's store id only", reported.length === 1 && reported[0] === kit.scope("B").storeId, reported);
      kit.check("ai/assembleFor: the reads leave A's rows as they were", (await kit.snapshotA()) === before);
    },
  },
  {
    name: "ai: B's scope reads and changes none of A's runs, cache, memory or jobs",
    async run(kit) {
      const a = kit.scope("A");
      const b = kit.scope("B");
      if (!writable(a) || !writable(b)) throw new Error("ai: the harness scopes are not member scopes");
      const tag = randomBytes(4).toString("hex");
      const owner = kit.fx.A.members.owner;
      const hash = sha256Hex(`ai-repo-${tag}`);
      const runId = await insertRun(a, { userId: owner, task: "copy.page", provider: "server", via: "stream", inputHash: hash, finished: { status: "ok", ms: 10, costMicros: 777, credits: 1, output: { headline: `ai-run-${tag}` } } });
      const key = { task: "copy.page" as const, inputHash: hash, promptVersion: "copy.page@s1", model: "claude-sonnet-5-5" };
      await cacheWrite(a, key, { headline: `ai-cache-${tag}` }, cacheExpiry(7));
      const memId = await addMemory(a, { kind: "prefer", text: `ai-mem-${tag} parler du terroir` }, owner);
      const jobId = newId();
      await db.insert(aiJobs).values(storeValues(a, { id: jobId, kind: "director_deep" as const, task: "design.critique", status: "running" as const, active: "1", inputHash: hash, createdBy: owner }));
      const before = await kit.snapshotA();

      kit.check("ai/getRunMeta(B, A's run): null", (await getRunMeta(b, runId)) === null);
      kit.check("ai/recentRuns(B): none of A's", !(await recentRuns(b)).some((r) => r.id === runId));
      kit.check("ai/cacheLookup(B, A's identical key): miss", (await cacheLookup(b, key)) === null);
      kit.check("ai/listMemory(B) and activeMemory(B): none of A's", ![...(await listMemory(b)), ...(await activeMemory(b))].some((m) => m.id === memId || m.text.includes(tag)));
      kit.check("ai/getAiJob(B, A's job): null", (await getAiJob(b, jobId)) === null);
      kit.check("ai/activeJobsFor(B, A's owner): none", (await activeJobsFor(b, { userId: owner })).length === 0);
      kit.check("ai/finishRun(B, A's run): no row changed", !(await finishRun(b, runId, { status: "error", ms: 1 })));
      await linkAiRuns(b, [runId], { kind: "page", id: `forged-${tag}` });
      const pin = await setMemoryPinned(b, memId, true).then(() => "pinned", (e: unknown) => (e as { code?: string }).code ?? "error");
      const del = await deleteMemory(b, memId).then(() => "deleted", (e: unknown) => (e as { code?: string }).code ?? "error");
      kit.check("ai/setMemoryPinned and deleteMemory(B, A's item): not_found", pin === "not_found" && del === "not_found", { pin, del });
      const month = new Date().toISOString().slice(0, 7);
      kit.check("ai/aiUsageForStore(B): none of A's cost", (await aiUsageForStore(b, month)).costMicros === 0);
      kit.check("ai: B's calls left A's rows as they were (no link, pin or tombstone)", (await kit.snapshotA()) === before);
      kit.check("ai/getRunMeta(A): A's own run (the check is not blind)", (await getRunMeta(a, runId))?.id === runId && (await getAiJob(a, jobId))?.id === jobId);
    },
  },
  {
    name: "ai: B's scope cannot read, drive, claim or cancel A's detached job, nor see it in its pulse",
    async run(kit) {
      const a = kit.scope("A");
      const b = kit.scope("B");
      if (!writable(a) || !writable(b)) throw new Error("ai: the harness scopes are not member scopes");
      const owner = kit.fx.A.members.owner;
      const jobId = newId();
      const hash = sha256Hex(`ai-job-${randomBytes(4).toString("hex")}`);
      const now = new Date();
      await db.insert(aiJobs).values(
        storeValues(a, { id: jobId, kind: "director_deep" as const, task: "design.critique", status: "queued" as const, active: "1", inputHash: hash, progress: { done: 0, total: 1, stages: {}, plan: ["critique"] }, result: { runIds: [] }, createdBy: owner, createdAt: now, updatedAt: now }),
      );
      const before = await kit.snapshotA();
      kit.check("ai/advanceJob(B, A's job): null, nothing run", (await advanceJob(b, jobId, "poll", 90_000)) === null);
      const claim = await claimStage(b, jobId, "poll");
      kit.check("ai/claimStage(B, A's job): no stage (terminal: not B's)", "none" in claim && claim.none === "terminal", claim);
      const pulse = await aiJobsForPulse(b, { userId: owner }, new Date(Date.now() - 60_000));
      kit.check("ai/aiJobsForPulse(B, A's owner): nothing of A's", pulse.running === 0 && pulse.done.length === 0, pulse);
      kit.check("ai/getAiJob(B, A's job) through the job API: null", (await getAiJobApi(b, jobId)) === null);
      kit.check("ai: B's calls left A's job as it was", (await kit.snapshotA()) === before && (await getAiJob(a, jobId))?.status === "queued");
      kit.check("ai/aiJobsForPulse(A): A's owner sees A's job (the check is not blind)", (await aiJobsForPulse(a, { userId: owner }, new Date(Date.now() - 60_000))).running >= 1);
    },
  },
  {
    name: "ai: runAi under impersonation is refused before anything moves; B's run writes nothing of A's",
    async run(kit) {
      const before = await kit.snapshotA();
      const owner = kit.fx.A.members.owner;
      const input: AiTaskInput<"injection.screen"> = { text: `ai-run-${randomBytes(4).toString("hex")}`, source: "note" };
      const actor = { kind: "impersonation" as const, userId: owner, impersonatorId: owner, ip: null };
      const imp = await runAi(kit.scope("A", "impersonation"), "injection.screen", input, { actor, surface: "settings", ladder: "server-only" });
      kit.check("ai/runAi(A as impersonation): state, no provider rung", !imp.ok && imp.code === "state" && imp.runId === null, imp.ok ? "ok" : imp.code);
      const b = await runAi(kit.scope("B"), "injection.screen", input, { actor: { kind: "user", userId: kit.fx.B.members.owner, impersonatorId: null, ip: null }, surface: "settings" });
      kit.check("ai/runAi(B): answered for B only (a server run or the library heuristic)", b.ok ? b.provider === "server" || b.provider === "library" : b.runId === null || typeof b.runId === "string");
      kit.check("ai: neither run moved A's counters or rows", (await kit.snapshotA()) === before);
    },
  },
];
