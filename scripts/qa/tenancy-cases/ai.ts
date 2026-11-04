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
 * Routes (step 9), through the real handlers under src/app/api/app/[store]/ai/** (`callRoute`), with the localhost
 * fake provider (src/lib/ai/testing/fake-anthropic.ts through the ai-base-url seam) and Cloud AI on for the case:
 *  - B's owner on B's handle with A's ids: `runs/[id]` (A's finished run, A's live run buffer) and `jobs/[id]` (with and
 *    without advance) answer the same neutral 404 as a missing id, `jobs/[id]/cancel` the same 204, and A's job, run
 *    and buffer are left as they were; A's owner reads them (the check is not blind).
 *  - `ai_cache` through the route: A's copy.hero run is cached for A (A's second call is a hit, no provider call); B's
 *    identical input is a provider call of its own, never A's entry.
 *  - a local-mode store gets `store_local_only` from every provider route ([task] JSON and stream, director/plan,
 *    director/critique, jobs/[id]?advance=1) with 0 fake-provider calls; an auto-mode store reaches the provider.
 *  - `jobs/[id]?advance=1` without `Sec-Fetch-Site: same-origin` (cross-site, none, same-site) answers the read-only
 *    view and leaves the stage unchanged; the same-origin poll runs one stage (the probe's sleep stage, no model).
 *  - an impersonating session gets `impersonation_read_only` from every AI POST and from `jobs/[id]?advance=1`, and
 *    makes no provider call and moves no job stage of A.
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
import { readFileSync } from "node:fs";
import http from "node:http";
import { Readable } from "node:stream";
import path from "node:path";
import { eq } from "drizzle-orm";
import { ALL_FIXTURES } from "@/lib/ai/eval/fixtures";
import { RunBufferSink } from "@/lib/ai/http/transport";
import { probePlan } from "@/lib/ai/jobs/stages";
import { breaker } from "@/lib/ai/server/breaker";
import { resetAnthropic } from "@/lib/ai/server/client";
import { invalidateAiFlags } from "@/lib/ai/server/flags";
import { insertJob } from "@/lib/ai/store/jobs";
import { startFakeAnthropic, type FakeAnthropic } from "@/lib/ai/testing/fake-anthropic";
import { flagOverrides, sessions } from "@/lib/db/schema";
import { getPlatformSetting, setPlatformSetting } from "@/lib/settings";
import type { RouteAnswer, RouteFile, TenancyCase, TenancyKit } from "../tenancy-check";

/** the harness hands out member scopes; the settings write takes the WriteScope it is */
const writable = (s: StoreScope): s is WriteScope => s.kind === "member";

/* ------------------------------------------------------------------ */
/* step 9: the route handlers                                          */
/* ------------------------------------------------------------------ */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const AI = "/api/app/[store]/ai";
const route = (rel: string, methods: string[]): RouteFile => ({ file: `src/app${AI}${rel}/route.ts`, template: `${AI}${rel}`, methods });
const R = {
  task: route("/[task]", ["POST"]),
  plan: route("/director/plan", ["POST"]),
  critique: route("/director/critique", ["POST"]),
  verify: route("/director/verify", ["POST"]),
  run: route("/runs/[id]", ["GET"]),
  job: route("/jobs/[id]", ["GET"]),
  cancel: route("/jobs/[id]/cancel", ["POST"]),
  warm: route("/warm", ["POST"]),
  report: route("/report", ["POST"]),
};
type Answer = { ok: boolean; value?: RouteAnswer; error?: unknown };
type Caller = { userId: string; stepUpAt: Date } | { sessionToken: string };
const GHOST = "01J0000000000000000000GH0S";
const user = (userId: string): Caller => ({ userId, stepUpAt: new Date() });
const answer = (o: Answer) => (o.ok ? { status: o.value!.status, body: o.value!.body.slice(0, 400) } : { status: 500, body: String(o.error) });
const bodyOf = (o: Answer): Record<string, unknown> => {
  try {
    return o.ok ? (JSON.parse(o.value!.body) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
const copyHero = ALL_FIXTURES.find((f) => f.task === "copy.hero")!;
const recordedHero = (): unknown =>
  (JSON.parse(readFileSync(path.join(ROOT, "src/lib/ai/eval/sets/copy.hero/recorded/copy.hero@s1.json"), "utf8")) as { runs: Record<string, { output: unknown }[]> }).runs[copyHero.id]![0]!.output;
const passIds = () => ({ session: `sess${randomBytes(6).toString("hex")}`, id: `pass${randomBytes(6).toString("hex")}` });

/** A queued probe job of A (sleep stages of `stageMs`, no model, no credit): what the job routes drive. */
async function probeJobOf(scope: WriteScope, owner: string, stageMs = 1_500): Promise<string> {
  const plan = probePlan(stageMs * 2, stageMs);
  const id = newId();
  await insertJob(scope, {
    id,
    kind: "probe",
    task: "probe.sleep",
    inputHash: sha256Hex(`tenancy-probe|${id}`),
    progress: { done: 0, total: plan.stages.length, stages: {}, plan: plan.stages.map((st) => st.id) },
    class: "director_deep",
    doc: { runIds: [], input: { totalMs: stageMs * 2, stageMs }, plan: [...plan.stages], reservation: null },
    reservedCredits: 0,
    createdBy: owner,
    now: new Date(),
  });
  return id;
}

const jobState = async (id: string): Promise<string> => {
  const [r] = await db.select({ status: aiJobs.status, stage: aiJobs.stage, leaseUntil: aiJobs.leaseUntil, progress: aiJobs.progress, updatedAt: aiJobs.updatedAt }).from(aiJobs).where(eq(aiJobs.id, id)).limit(1);
  return JSON.stringify(r ?? null);
};

/**
 * The harness answers every fetch itself (network disabled in test:tenancy, 503 for an unknown host): the provider
 * client's requests to the localhost fake go over node:http instead, streamed, with the call's signal; every other
 * request still reaches the harness's fetch.
 */
function loopbackFetch(origin: string, inner: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const asReq = input instanceof Request ? input : null;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(origin)) return inner(input, init);
    const method = (init?.method ?? asReq?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? asReq?.headers);
    const raw = init?.body ?? (asReq && method !== "GET" ? await asReq.arrayBuffer() : null);
    const payload = raw === null || raw === undefined ? null : typeof raw === "string" ? Buffer.from(raw) : Buffer.from(await new Response(raw as BodyInit).arrayBuffer());
    const signal = init?.signal ?? asReq?.signal ?? undefined;
    return new Promise<Response>((resolve, reject) => {
      const out = http.request(url, { method, headers: Object.fromEntries(headers.entries()), ...(signal ? { signal } : {}) }, (res) => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) h.set(k, Array.isArray(v) ? v.join(", ") : v);
        resolve(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status: res.statusCode ?? 502, headers: h }));
      });
      out.on("error", reject);
      if (payload) out.write(payload);
      out.end();
    });
  }) as typeof fetch;
}

/**
 * Cloud AI on against the localhost fake for one case (key, cap, the Director flag for A and B); the platform setting,
 * the flags, the variables and the client are put back after.
 */
async function withFakeAi(kit: TenancyKit, fn: (fake: FakeAnthropic) => Promise<void>): Promise<void> {
  const env = process.env as Record<string, string | undefined>;
  const saved = { SG_E2E: env.SG_E2E, SG_AI_BASE_URL: env.SG_AI_BASE_URL, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY };
  const fake = await startFakeAnthropic();
  const before = await getPlatformSetting("platform_ai", { fresh: true });
  const staff = { id: kit.fx.staff.id, kind: "platform" as const };
  const harnessFetch = globalThis.fetch;
  try {
    globalThis.fetch = loopbackFetch(fake.origin, harnessFetch);
    env.SG_E2E = "1";
    env.SG_AI_BASE_URL = fake.origin;
    env.ANTHROPIC_API_KEY = `sk-ant-tenancy-${randomBytes(16).toString("hex")}`;
    resetAnthropic();
    breaker().reset();
    await setPlatformSetting("platform_ai", { ...before, enabled: true, streamTransport: "stream", caps: { ...before.caps, monthlyUsd: 100 } }, staff);
    for (const k of ["A", "B"] as const) {
      await db.insert(flagOverrides).values({ flagKey: "ai_director_brief", scope: "store", scopeId: kit.fx[k].id, value: true }).onDuplicateKeyUpdate({ set: { value: true } });
    }
    invalidateAiFlags();
    await fn(fake);
  } finally {
    globalThis.fetch = harnessFetch;
    await setPlatformSetting("platform_ai", before, staff);
    for (const k of ["A", "B"] as const) await db.delete(flagOverrides).where(eq(flagOverrides.scopeId, kit.fx[k].id));
    invalidateAiFlags();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    resetAnthropic();
    await fake.close();
  }
}

/** A read-only "View as store" session of the platform staff on store A (the seam's own impersonation row). */
async function impersonationOf(kit: TenancyKit): Promise<string | null> {
  const { requirePlatform } = await import("@/lib/platform/seam");
  const { startImpersonation } = await import("@/lib/platform/impersonation");
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ id: sha256Hex(token), userId: kit.fx.staff.id, mfaPassed: true, expiresAt: new Date(Date.now() + 3_600_000), stepUpAt: new Date() });
  const r = await kit.call({ sessionToken: token }, "/admin", async () => {
    const ctx = await requirePlatform({ permission: "stores.impersonate", throwOnFail: true });
    return startImpersonation(ctx, { storeId: kit.fx.A.id, reason: "ticket", ticketRef: "TENANCY-AI", minutes: 15 });
  });
  kit.check("ai routes: staff starts a read-only view of A (the seam's own impersonation)", r.ok, r.ok ? "ok" : String(r.error));
  return r.ok ? token : null;
}

const routeCases: TenancyCase[] = [
  {
    name: "ai routes: B cannot read A's run or run buffer, nor poll, drive or cancel A's job",
    async run(kit) {
      const a = kit.scope("A");
      if (!writable(a)) throw new Error("ai: the harness scope of A is not a member scope");
      const tag = randomBytes(4).toString("hex");
      const ownerA = kit.fx.A.members.owner;
      const ownerB = user(kit.fx.B.members.owner);
      const runId = await insertRun(a, { userId: ownerA, task: "copy.hero", provider: "server", via: "interactive", inputHash: sha256Hex(`ai-route-${tag}`), finished: { status: "ok", ms: 12, credits: 1, costMicros: 900, output: { headline: `ai-route-run-${tag}` } } });
      const liveId = newId();
      const sink = new RunBufferSink(kit.fx.A.id);
      sink.open(liveId);
      sink.emit({ t: "start", runId: liveId, provider: "server", class: "worker", model: "claude-sonnet-5-5", effort: "low" });
      sink.emit({ t: "field", path: "headline", value: `ai-route-buffer-${tag}` });
      const jobId = await probeJobOf(a, ownerA);
      const before = { snap: await kit.snapshotA(), job: await jobState(jobId) };
      const onB = (r: RouteFile, method: string, id: string, plan: { query?: Record<string, string> } = {}) => kit.callRoute(ownerB, r, method, { store: kit.fx.B.handle, id }, plan);

      for (const [label, id] of [
        ["A's finished run", runId],
        ["A's live run buffer", liveId],
      ] as const) {
        const real = await onB(R.run, "GET", id, { query: { after: "-1" } });
        const ghost = await onB(R.run, "GET", GHOST, { query: { after: "-1" } });
        kit.check(`ai routes: GET runs/[id] · B's owner · ${label}: the neutral 404 of a missing id`, real.ok && real.value!.status === 404 && real.value!.body === ghost.value?.body, { real: answer(real), ghost: answer(ghost) });
        kit.check(`ai routes: GET runs/[id] · B's owner · ${label}: no text of A`, !(real.value?.body ?? "").includes(tag) && kit.leaks(answer(real)).length === 0);
      }
      for (const advance of ["1", "0"]) {
        const real = await onB(R.job, "GET", jobId, { query: { advance } });
        const ghost = await onB(R.job, "GET", GHOST, { query: { advance } });
        kit.check(`ai routes: GET jobs/[id]?advance=${advance} · B's owner · A's job: the neutral 404 of a missing id`, real.ok && real.value!.status === 404 && real.value!.body === ghost.value?.body, { real: answer(real), ghost: answer(ghost) });
      }
      const cancel = await onB(R.cancel, "POST", jobId);
      const cancelGhost = await onB(R.cancel, "POST", GHOST);
      kit.check("ai routes: POST jobs/[id]/cancel · B's owner · A's job: the same 204 as a missing id", cancel.ok && cancel.value!.status === 204 && cancelGhost.value?.status === 204, { cancel: answer(cancel), ghost: answer(cancelGhost) });
      kit.check("ai routes: B's calls left A's job (status, stage, lease, progress) and rows as they were", (await jobState(jobId)) === before.job && (await kit.snapshotA()) === before.snap, { job: await jobState(jobId) });

      // the check is not blind: A's owner reads all three
      const ownA = user(ownerA);
      const run = await kit.callRoute(ownA, R.run, "GET", { store: kit.fx.A.handle, id: runId }, {});
      const buf = await kit.callRoute(ownA, R.run, "GET", { store: kit.fx.A.handle, id: liveId }, { query: { after: "0" } });
      const job = await kit.callRoute(ownA, R.job, "GET", { store: kit.fx.A.handle, id: jobId }, { query: { advance: "0" } });
      kit.check("ai routes: A's owner reads A's finished run (its final event)", run.ok && run.value!.status === 200 && run.value!.body.includes(`ai-route-run-${tag}`), answer(run));
      kit.check("ai routes: A's owner polls A's live buffer after seq 0 (the field, not done)", buf.ok && buf.value!.status === 200 && buf.value!.body.includes(`ai-route-buffer-${tag}`) && bodyOf(buf).done === false && !buf.value!.body.includes('"t":"start"'), answer(buf));
      kit.check("ai routes: A's owner reads A's job (advance=0: queued, nothing run)", job.ok && job.value!.status === 200 && bodyOf(job).status === "queued" && (await jobState(jobId)) === before.job, answer(job));
    },
  },
  {
    name: "ai routes: the cache, local mode, the same-origin poll rule and impersonation through the handlers",
    async run(kit) {
      const a = kit.scope("A");
      if (!writable(a)) throw new Error("ai: the harness scope of A is not a member scope");
      const ownerA = kit.fx.A.members.owner;
      const ownA = user(ownerA);
      const ownB = user(kit.fx.B.members.owner);
      await withFakeAi(kit, async (fake) => {
        const msgs = () => fake.total("/v1/messages");
        const post = (who: Caller, store: "A" | "B", r: RouteFile, body: unknown, params: Record<string, string> = {}) => kit.callRoute(who, r, "POST", { store: kit.fx[store].handle, ...params }, { body });
        const getJob = (who: Caller, id: string, headers?: Record<string, string>) => kit.callRoute(who, R.job, "GET", { store: kit.fx.A.handle, id }, { query: { advance: "1" } }, headers ? { headers } : {});
        const hero = { input: copyHero.input, surface: "wizard" };

        // ai_cache through the route: A's entry serves A only
        fake.enqueue({ kind: "ok", json: recordedHero() });
        const a1 = await post(ownA, "A", R.task, hero, { task: "copy.hero" });
        const calls1 = msgs();
        const a2 = await post(ownA, "A", R.task, hero, { task: "copy.hero" });
        kit.check(
          "ai routes: A's copy.hero is a server run, then a cache hit for A (no second provider call)",
          bodyOf(a1).ok === true && bodyOf(a1).provider === "server" && calls1 === 1 && msgs() === 1 && JSON.stringify(bodyOf(a2).flags ?? []).includes("cache_hit"),
          { a1: answer(a1), a2: answer(a2), calls: msgs() },
        );
        fake.enqueue({ kind: "ok", json: recordedHero() });
        const b1 = await post(ownB, "B", R.task, hero, { task: "copy.hero" });
        kit.check("ai routes: B's identical input is B's own provider call, never A's cache entry", msgs() === 2 && !JSON.stringify(bodyOf(b1).flags ?? []).includes("cache_hit") && bodyOf(b1).runId !== bodyOf(a2).runId, { b1: answer(b1), calls: msgs() });

        // local mode: store_local_only from every provider route, 0 provider calls; B in auto mode reaches it
        await setStoreSetting(a, "store_ai", { mode: "local" }, { id: ownerA, ip: null });
        const jobId = await probeJobOf(a, ownerA);
        const start = msgs();
        const p = passIds();
        const local: [string, () => Promise<Answer>][] = [
          ["POST [task] copy.hero", () => post(ownA, "A", R.task, { ...hero, nonce: "local1" }, { task: "copy.hero" })],
          ["POST [task] copy.page (stream)", () => post(ownA, "A", R.task, { input: {}, surface: "wizard" }, { task: "copy.page" })],
          ["POST director/plan", () => post(ownA, "A", R.plan, { input: {}, pass: p })],
          ["POST director/critique", () => post(ownA, "A", R.critique, { input: {}, pass: p })],
          ["GET jobs/[id]?advance=1", () => getJob(ownA, jobId)],
        ];
        for (const [label, go] of local) {
          const r = await go();
          kit.check(`ai routes: ${label} · A in local mode: store_local_only`, r.ok && r.value!.status === 403 && bodyOf(r).error === "store_local_only", answer(r));
        }
        kit.check("ai routes: local mode made 0 provider calls and moved no job stage", msgs() === start && (JSON.parse(await jobState(jobId)) as { status: string }).status === "queued", { calls: msgs() - start });
        fake.enqueue({ kind: "ok", json: recordedHero() });
        const auto = await post(ownB, "B", R.task, { ...hero, nonce: "auto1" }, { task: "copy.hero" });
        kit.check("ai routes: B in auto mode reaches the provider (the check is not blind)", msgs() === start + 1 && bodyOf(auto).error !== "store_local_only", answer(auto));
        await setStoreSetting(a, "store_ai", { mode: "auto" }, { id: ownerA, ip: null });

        // advance without Sec-Fetch-Site: same-origin reads only; the same-origin poll runs one stage
        const idle = await jobState(jobId);
        for (const site of ["cross-site", "none", "same-site"]) {
          const r = await getJob(ownA, jobId, { "sec-fetch-site": site });
          kit.check(`ai routes: GET jobs/[id]?advance=1 with Sec-Fetch-Site ${site}: the read-only view, the stage unchanged`, r.ok && r.value!.status === 200 && bodyOf(r).status === "queued" && (await jobState(jobId)) === idle, { r: answer(r), job: await jobState(jobId) });
        }
        const driven = await getJob(ownA, jobId);
        const progress = bodyOf(driven).progress as { done?: number } | undefined;
        kit.check("ai routes: the same-origin poll ran one stage of A's job, without a model (positive control)", driven.ok && driven.value!.status === 200 && progress?.done === 1 && msgs() === start + 1, answer(driven));

        // impersonation: every AI POST and advance=1 refused before anything runs
        const token = await impersonationOf(kit);
        if (!token) return;
        const imp: Caller = { sessionToken: token };
        const jobBefore = await jobState(jobId);
        const callsBefore = msgs();
        const posts: [string, RouteFile, Record<string, string>, unknown][] = [
          ["POST [task] copy.hero", R.task, { task: "copy.hero" }, hero],
          ["POST [task] copy.page", R.task, { task: "copy.page" }, { input: {}, surface: "wizard" }],
          ["POST director/plan", R.plan, {}, { input: {}, pass: passIds() }],
          ["POST director/critique", R.critique, {}, { input: {}, pass: passIds() }],
          ["POST director/verify", R.verify, {}, { input: {}, pass: passIds() }],
          ["POST jobs/[id]/cancel", R.cancel, { id: jobId }, {}],
          ["POST warm", R.warm, {}, { task: "copy.page" }],
          ["POST report", R.report, {}, { task: "copy.page", ms: 10, status: "ok" }],
        ];
        for (const [label, r, params, body] of posts) {
          const out = await post(imp, "A", r, body, params);
          kit.check(`ai routes: ${label} · staff viewing A: impersonation_read_only`, out.ok && out.value!.status === 403 && bodyOf(out).error === "impersonation_read_only", answer(out));
        }
        const adv = await getJob(imp, jobId);
        kit.check("ai routes: GET jobs/[id]?advance=1 · staff viewing A: impersonation_read_only", adv.ok && adv.value!.status === 403 && bodyOf(adv).error === "impersonation_read_only", answer(adv));
        kit.check("ai routes: under impersonation no provider call and no job stage moved", msgs() === callsBefore && (await jobState(jobId)) === jobBefore, { calls: msgs() - callsBefore });
      });
    },
  },
];

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
  ...routeCases,
];
