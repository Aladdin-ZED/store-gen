/**
 * test:ai sections of the browser layer (P7 AI; ai.md AI-§A.4 "Where the ladder runs", AI-§A.6, AI-§A.7, AI-§H.2,
 * AI-02 (9), AI-03 (3)(4), AI-04 (2), AI-05; step 10 of the P7 plan). Registered by src/lib/ai/selftest.ts. Offline and
 * pure: every fetch, clock and sleep is a stub, no React renders, no worker starts.
 *
 *   client-ladder        the walk with a stub fetch: 403 policy block, 404 flag_off, 429, 503 busy, a stream error
 *                        mid-way → the next rung with a quiet note; a caller's abort stops the walk; not live → flag_off
 *   client-rows          Auto vs local vs server rows on the client (the rung order the walk takes)
 *   client-transport     NDJSON fields and final, 202 { runId } polled at 500 ms visible / 1.5 s hidden, 202 { jobId }
 *                        polled at 2 s / 6 s until a terminal status, stream auto-detection → buffered=1 on the report
 *   client-local         the local adapter: supports() by policy.local, device tier and task; copy.field runs
 *                        copy.field's finalize; a local run reports metadata only
 *   client-device        deviceFrom: a phone or a coarse pointer is mobile; vlmCached only with a tier
 *   suggested-facts      AI-04 (2): suggestions unticked, only ticked facts reach CopyPageInput.facts
 *   novelty-guard        AI-02 (9) through the injected check: share 0.3 → one re-ask (differentiate, structure tag in
 *                        mustAvoid) → still 0.3 → the engine line, origin map updated, ≤ 1 re-ask; past the deadline no
 *                        re-ask; a failed action answer → advisory
 *   copy-request-v2      CopyRequest v1 and v2 shapes parse at the worker boundary
 *   rewrite-job          the worker's rewrite schema: exactly 3 strings ≤ the field's max, FieldRewriteInput validated
 *   cutout-upload        exactly one upload of the mask (derived asset, sourceAssetId) and no AI or render call
 */
import { REWRITE_VARIANTS, rewriteVariantsSpec } from "./copy-schema";
import { CopyRequest } from "./prompts";
import { AI_TASK_IDS, type AiTaskId } from "./tasks";
import type { AiPolicy, DeviceInfo } from "./policy";
import { AiError } from "./protocol";
import { aiFailure } from "./provider/failures";
import { localProvider, type LocalAi, type LocalRunReport } from "./provider/local";
import type { AiOutcome, AiProvider, AiResult } from "./provider/types";
import { MAX_VARIANTS, type FieldRewriteInput } from "./schema/tasks/copy-field";
import { FieldRewriteInputZ } from "./schema/tasks/inputs";
import { ndjsonLine, type AiStreamEvent } from "./stream/events";
import { AiReporter, JOB_POLL_MS, RUN_POLL_MS, StreamDetector, deviceFrom, libraryDraft, pollJob, runOnClient, type ClientRunDeps } from "./router/client";
import { cutoutLater, uploadCutoutMask } from "./router/cutout";
import { guardNovelty, reaskInput, type NoveltyLine, type NoveltyVerdict } from "./router/novelty";
import { factsForCopy, factsReducer, initialFacts, overflowTicked, suggestionId } from "./router/suggested-facts";

export interface ClientSelftestApi {
  section(name: string, run: () => void | Promise<void>, opts?: { slow?: boolean; strict?: boolean }): void;
  check(ok: boolean, msg: string): void;
  eq(a: unknown, b: unknown, msg: string): void;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const DEV = {
  off: { tier: "off", mobile: false, saveData: false, vlmCached: false },
  lite: { tier: "lite", mobile: false, saveData: false, vlmCached: true },
  full: { tier: "full", mobile: false, saveData: false, vlmCached: true },
} satisfies Record<string, DeviceInfo>;

function pol(p: { mode?: AiPolicy["mode"]; local?: boolean; live?: AiTaskId[] } = {}): AiPolicy {
  return {
    mode: p.mode ?? "auto",
    cloud: {
      available: true,
      block: null,
      creditsLeft: null,
      dayLeft: null,
      director: "ask",
      directorBlock: null,
      directorPassCredits: 53,
      directorPassesLeft: null,
      deepPass: true,
      deepPassesLeft: null,
      deepTransport: "job",
    },
    local: { enabled: p.local ?? true, tierMax: "full", bgRemoval: true },
    autoPrefersCloud: {},
    live: p.live ?? [...AI_TASK_IDS],
    transport: "stream",
    promptVersions: {},
    voiceLocal: "",
    workerName: "Store Gen AI",
  };
}

const FIELD_INPUT: FieldRewriteInput = {
  locale: "fr",
  field: "hero.headline",
  text: "Une huile légère pour un visage lumineux",
  max: 84,
  intent: "shorter",
  targetLocale: null,
  product: { name: "Huile d'argan", facts: ["Flacon de 50 ml"] },
  mustAvoid: [],
};

function ok<T>(provider: AiResult<T>["provider"], value: T): AiResult<T> {
  return { ok: true, value, provider, class: null, model: null, effort: null, promptVersion: provider, rubricVersion: null, runId: null, jobId: null, usage: null, ms: 0, ttftMs: null, rejected: [], flags: [], notes: [] };
}

/** A rung stub that records its calls and answers `answer`. */
function stubRung(id: "local" | "library", calls: string[], answer: () => AiOutcome<unknown> = () => ok(id, { from: id })): AiProvider {
  return {
    id,
    supports: () => ({ ok: true }),
    run: async () => {
      calls.push(id);
      return answer() as never;
    },
  };
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** An NDJSON response whose chunks are sent one read at a time; `breakAfter` errors the body after that many chunks. */
function ndjson(chunks: readonly string[], breakAfter?: number): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (breakAfter !== undefined && i >= breakAfter) {
        ctrl.error(new Error("network"));
        return;
      }
      if (i >= chunks.length) {
        ctrl.close();
        return;
      }
      ctrl.enqueue(new TextEncoder().encode(chunks[i++]!));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
}

const START: AiStreamEvent = { s: 0, t: "start", runId: "run_1", provider: "server", class: "worker", model: "claude-test", effort: "low" };
const FINAL = (ms: number): AiStreamEvent => ({ s: 3, t: "final", runId: "run_1", value: { variants: ["Huile légère, visage net"] }, rejected: [], credits: 1, ms, flags: [] });

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

function fetchStub(answer: (url: string, init: RequestInit | undefined, n: number) => Response | Promise<Response>): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return answer(url, init, calls.length);
  }) as typeof fetch;
  return { fetch: f, calls };
}

function deps(p: { fetch: typeof fetch; policy?: AiPolicy; device?: DeviceInfo; local?: AiProvider | null; library?: AiProvider | null; visible?: boolean; slept?: number[]; detector?: StreamDetector }): ClientRunDeps {
  return {
    handle: "storea",
    policy: p.policy ?? pol(),
    device: p.device ?? DEV.off,
    fetch: p.fetch,
    local: p.local ?? null,
    library: p.library ?? null,
    visible: () => p.visible ?? true,
    sleep: async (ms) => void p.slept?.push(ms),
    now: () => 0,
    detector: p.detector ?? new StreamDetector(),
  };
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export function registerClientSections(t: ClientSelftestApi): void {
  const { section, check, eq } = t;

  section("client-ladder", async () => {
    const cases: { name: string; res: () => Response; code: string }[] = [
      { name: "403 policy block", res: () => json(403, { ok: false, error: "no_cap" }), code: "no_cap" },
      { name: "404 flag_off (neutral body)", res: () => new Response("Not found", { status: 404 }), code: "flag_off" },
      { name: "429", res: () => json(429, { ok: false, error: "rate_limited", retryAfterSec: 30 }), code: "rate_limited" },
      { name: "503 busy", res: () => json(503, { ok: false, error: "busy" }), code: "busy" },
      { name: "a stream error event mid-way", res: () => ndjson([ndjsonLine(START), ndjsonLine({ s: 1, t: "error", code: "provider_error", retryable: true })]), code: "provider_error" },
      { name: "a stream that breaks off mid-way", res: () => ndjson([ndjsonLine(START), ndjsonLine({ s: 1, t: "field", path: "variants.0", value: "x" })], 2), code: "provider_error" },
    ];
    for (const c of cases) {
      const calls: string[] = [];
      const { fetch, calls: fc } = fetchStub(() => c.res());
      const out = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch, library: stubRung("library", calls) }));
      eq([out.ok, out.provider, out.ok ? out.notes : null, calls, fc.length], [true, "library", [{ from: "server", to: "library", code: c.code }], ["library"], 1], `${c.name} → the library rung with a quiet note`);
    }
    const all = fetchStub(() => json(429, { ok: false, error: "rate_limited", retryAfterSec: 30 }));
    const last = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: all.fetch, library: stubRung("library", [], () => aiFailure("provider_error", "library")) }));
    eq([last.ok, !last.ok && last.code, last.provider], [false, "provider_error", "library"], "every rung failed: the last typed failure is answered");
    const retry = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: all.fetch, policy: pol({ mode: "server" }), library: stubRung("library", [], () => aiFailure("cancelled", "library")) }));
    check(!retry.ok, "a failure that does not advance ends the walk");

    const ctrl = new AbortController();
    const calls: string[] = [];
    const aborting = fetchStub(() => {
      ctrl.abort();
      return json(503, { ok: false, error: "busy" });
    });
    const cancelled = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard", signal: ctrl.signal }, deps({ fetch: aborting.fetch, library: stubRung("library", calls) }));
    eq([cancelled.ok, !cancelled.ok && cancelled.code, calls], [false, "cancelled", []], "the caller's abort stops the walk (no library run after it)");

    const hidden = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: fetchStub(() => json(200, {})).fetch, policy: pol({ live: ["copy.page"] }) }));
    eq([hidden.ok, !hidden.ok && hidden.code], [false, "flag_off"], "a task that is not live answers flag_off (invisible)");

    const draft = libraryDraft("copy.field", FIELD_INPUT);
    check(draft !== null && Array.isArray(draft.variants), "the library draft is synchronous (paints before the run)");
    eq(libraryDraft("copy.field", FIELD_INPUT), draft, "the library draft is stable for the same input");
    eq(libraryDraft("analyze", { adminLocale: "fr" } as never), null, "no library draft for a task without a library rung");
  });

  section("client-rows", async () => {
    const order = async (mode: AiPolicy["mode"], device: DeviceInfo, task: AiTaskId = "copy.page") => {
      const calls: string[] = [];
      const fail = () => aiFailure("busy", "local");
      const { fetch, calls: fc } = fetchStub(() => {
        calls.push("server");
        return json(503, { ok: false, error: "busy" });
      });
      const out = await runOnClient(task, {} as never, { surface: "wizard" }, deps({ fetch, policy: pol({ mode }), device, local: stubRung("local", calls, fail), library: stubRung("library", calls) }));
      void fc;
      return { calls, notes: out.ok ? out.notes.map((n) => `${n.from}>${n.to}:${n.code}`) : [] };
    };
    eq((await order("auto", DEV.full)).calls, ["local", "server", "library"], "Auto on a full desktop: local first for copy.page, then server, then library");
    eq((await order("auto", DEV.lite)).calls, ["server", "local", "library"], "Auto on a lite device: server first");
    eq((await order("server", DEV.full)).calls, ["server", "local", "library"], "Prefer cloud: server first");
    eq((await order("local", DEV.full)).calls, ["local", "library"], "Local only: the server is never called");
    eq((await order("auto", DEV.off)).calls, ["server", "library"], "no local tier: the local rung is not in the row");
    eq((await order("auto", DEV.lite)).notes, ["server>local:busy", "local>library:busy"], "each fallback is one quiet note");

    const calls: string[] = [];
    const { fetch } = fetchStub(() => json(200, {}));
    const unsupported: AiProvider = { id: "local", supports: () => ({ ok: false, code: "device_unsupported" }), run: async () => aiFailure("unknown", "local") as never };
    const out = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch, policy: pol({ mode: "local" }), device: DEV.full, local: unsupported, library: stubRung("library", calls) }));
    eq([out.ok && out.provider, out.ok && out.notes, calls], ["library", [{ from: "local", to: "library", code: "device_unsupported" }], ["library"]], "a rung whose supports() fails is skipped with a note");
  });

  section("client-transport", async () => {
    const fields: string[] = [];
    const stream = fetchStub(() => ndjson([ndjsonLine(START) + ndjsonLine({ s: 1, t: "field", path: "variants.0", value: "Huile légère" }), ndjsonLine({ s: 2, t: "progress", stage: "wait" }), ndjsonLine(FINAL(1_800))]));
    const s = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard", onField: (p) => fields.push(p) }, deps({ fetch: stream.fetch }));
    eq([s.ok && s.provider, s.ok && s.runId, s.ok && s.usage?.credits, s.ok && s.model, fields], ["server", "run_1", 1, "claude-test", ["variants.0"]], "NDJSON: fields as they arrive, then final");
    const sent = JSON.parse(String(stream.calls[0]!.init?.body)) as { input: unknown; surface: string };
    eq([stream.calls[0]!.url, stream.calls[0]!.init?.method, sent.surface], ["/api/app/storea/ai/copy.field", "POST", "wizard"], "the server rung is one POST to /api/app/<h>/ai/<task>");

    for (const visible of [true, false]) {
      const slept: number[] = [];
      const poll = fetchStub((url, _i, n) => {
        if (n === 1) return json(202, { ok: true, runId: "run_9" });
        if (n === 2) return json(200, { events: [START], done: false });
        return json(200, { events: [{ ...FINAL(900), runId: "run_9" }], done: true });
      });
      const p = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: poll.fetch, visible, slept }));
      eq([p.ok && p.runId, slept, poll.calls[2]!.url], ["run_9", [visible ? RUN_POLL_MS.visible : RUN_POLL_MS.hidden], "/api/app/storea/ai/runs/run_9?after=0"], `202 { runId }: runs/[id] polled every ${visible ? "500 ms visible" : "1.5 s hidden"}, after the last seq`);
    }

    for (const visible of [true, false]) {
      const slept: number[] = [];
      const statuses = ["queued", "running", "done"];
      const job = fetchStub((url, _i, n) => {
        if (n === 1) return json(202, { ok: true, jobId: "job_1" });
        return json(200, { id: "job_1", kind: "x", status: statuses[n - 2], stage: null, heartbeatAt: null, result: { variants: ["a"] }, costCredits: 4 });
      });
      const j = await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: job.fetch, visible, slept }));
      eq([j.ok && j.jobId, j.ok && j.usage?.credits, slept, job.calls.length], ["job_1", 4, [2, 2].map(() => (visible ? JOB_POLL_MS.visible : JOB_POLL_MS.hidden)), 4], `202 { jobId }: polled every ${visible ? "2 s visible" : "6 s hidden"} until a terminal status`);
    }
    const failed = await pollJob("storea", "job_2", { fetch: fetchStub(() => json(200, { id: "job_2", kind: "x", status: "failed", stage: null, heartbeatAt: null, error: { code: "timeout" }, costCredits: 0 })).fetch, visible: () => true, sleep: async () => undefined }, new AbortController().signal);
    eq(failed?.status, "failed", "a failed job is terminal: the poll stops");
    const foreign = await pollJob("storea", "job_3", { fetch: fetchStub(() => new Response("", { status: 404 })).fetch, visible: () => true, sleep: async () => undefined }, new AbortController().signal);
    eq(foreign, null, "another store's job (404): nothing, the poll stops");

    // stream auto-detection: start and final in the same read after ≥ 1 s of model time, 3 runs in a row
    const detector = new StreamDetector();
    const buffered = () => fetchStub(() => ndjson([ndjsonLine(START) + ndjsonLine(FINAL(2_400))])).fetch;
    for (let i = 0; i < 2; i++) await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: buffered(), detector }));
    check(!detector.isPending, "two buffered runs: not yet");
    await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: fetchStub(() => ndjson([ndjsonLine(START) + ndjsonLine(FINAL(40))])).fetch, detector }));
    check(!detector.isPending, "a fast run (a cache hit) arriving at once does not count");
    await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: stream.fetch, detector }));
    for (let i = 0; i < 3; i++) await runOnClient("copy.field", FIELD_INPUT, { surface: "wizard" }, deps({ fetch: buffered(), detector }));
    check(detector.isPending, "3 buffered runs in a row (a streamed run resets the count)");
    const rep = fetchStub(() => json(204, {}));
    const reporter = new AiReporter("storea", { fetch: rep.fetch, detector, delayMs: 60_000 });
    reporter.add({ task: "copy.field", provider: "local", model: null, promptVersion: "copy.field@l1", ms: 10, status: "ok", rejected: [], locale: "fr", surface: "wizard" });
    await reporter.flush();
    reporter.add({ task: "copy.field", provider: "local", model: null, promptVersion: "copy.field@l1", ms: 10, status: "ok", rejected: [], locale: "fr", surface: "wizard" });
    await reporter.flush();
    eq(rep.calls.map((c) => c.url), ["/api/app/storea/ai/report?buffered=1", "/api/app/storea/ai/report"], "the next /ai/report carries buffered=1, once");
  });

  section("client-local", async () => {
    const lp = localProvider({ ai: {} as LocalAi });
    const ctx = (policy: AiPolicy, device: DeviceInfo | null) => ({ storeId: "s", policy, device });
    eq(lp.supports("copy.page", ctx(pol({ local: false }), DEV.full)), { ok: false, code: "disabled" }, "policy.local off: disabled");
    eq(lp.supports("copy.page", ctx(pol(), DEV.off)), { ok: false, code: "device_unsupported" }, "no local tier: the language-model tasks are unsupported");
    eq(lp.supports("classify", ctx(pol(), DEV.off)), { ok: true }, "classify runs without WebGPU");
    eq(lp.supports("design.plan", ctx(pol(), DEV.full)), { ok: false, code: "device_unsupported" }, "a task the worker does not run is unsupported");
    eq(lp.supports("copy.field", ctx(pol(), DEV.lite)), { ok: true }, "copy.field runs on a lite device (AI-05 offline from the cloud)");

    const reports: LocalRunReport[] = [];
    const ai = {
      rewrite: async () => ({ variants: ["Huile légère, visage net", "Une huile légère pour un visage lumineux", "Livraison gratuite 100 % garantie"] }),
    } as unknown as LocalAi;
    const out = await localProvider({ ai, report: (r) => reports.push(r) }).run("copy.field", FIELD_INPUT, ctx(pol(), DEV.lite), { surface: "wizard" });
    eq([out.ok && out.provider, out.ok && out.value.variants], ["local", ["Huile légère, visage net"]], "the local rewrite runs copy.field's finalize (the same text and the invented promise dropped)");
    eq([reports.length, reports[0]?.status, reports[0]?.promptVersion, Object.keys(reports[0] ?? {}).sort()], [1, "ok", "copy.field@l1", ["locale", "model", "ms", "promptVersion", "provider", "rejected", "status", "surface", "task"]], "one metadata report per local run, no text");

    const broken = { rewrite: async () => Promise.reject(new AiError("OOM", "x")) } as unknown as LocalAi;
    const bad = await localProvider({ ai: broken, report: (r) => reports.push(r) }).run("copy.field", FIELD_INPUT, ctx(pol(), DEV.lite), { surface: "wizard" });
    eq([bad.ok, reports.at(-1)?.status], [false, "error"], "a worker failure is a typed failure (the ladder moves on) and is reported");
  });

  section("client-device", () => {
    eq(deviceFrom({ tier: "full", uaMobile: undefined, coarse: false, saveData: false, vlmCached: true }), DEV.full, "a desktop with WebGPU");
    eq(deviceFrom({ tier: "full", uaMobile: true, coarse: false, saveData: false, vlmCached: true }).mobile, true, "userAgentData.mobile → mobile");
    eq(deviceFrom({ tier: "lite", uaMobile: false, coarse: true, saveData: false, vlmCached: false }).mobile, true, "a coarse pointer → mobile (no model download)");
    eq(deviceFrom({ tier: "off", uaMobile: false, coarse: false, saveData: true, vlmCached: true }), { tier: "off", mobile: false, saveData: true, vlmCached: false }, "no tier: never vlmCached; saveData carried");
  });

  section("suggested-facts", () => {
    let s = initialFacts(["Flacon de 50 ml"]);
    s = factsReducer(s, { type: "suggest", facts: ["Contenance : 100 ml", "flacon de 50 ML", "Bouchon doseur"] });
    eq(s.suggestions.map((x) => [x.text, x.ticked]), [["Contenance : 100 ml", false], ["Bouchon doseur", false]], "suggestions arrive unticked; one the owner typed is not shown");
    eq(factsForCopy(s), ["Flacon de 50 ml"], "an unticked suggestion never reaches CopyPageInput.facts (its number is not allowed)");
    const id = suggestionId("Contenance : 100 ml");
    s = factsReducer(s, { type: "toggle", id });
    eq(factsForCopy(s), ["Flacon de 50 ml", "Contenance : 100 ml"], "the ticked suggestion enters the facts after the owner's lines");
    s = factsReducer(s, { type: "suggest", facts: ["Bouchon pipette"] });
    eq(s.suggestions.map((x) => [x.text, x.ticked]), [["Contenance : 100 ml", true], ["Bouchon pipette", false]], "a new analysis replaces the unticked chips and keeps the ticked one");
    eq(factsReducer(s, { type: "tick", id }), s, "ticking a ticked chip changes nothing (same state)");
    s = factsReducer(s, { type: "dismiss", id });
    eq(factsForCopy(s), ["Flacon de 50 ml"], "a dismissed chip leaves the facts");
    let many = initialFacts(["a1", "a2", "a3", "a4", "a5"]);
    many = factsReducer(many, { type: "suggest", facts: ["b1", "b2"] });
    for (const x of many.suggestions) many = factsReducer(many, { type: "tick", id: x.id });
    eq([factsForCopy(many).length, overflowTicked(many).map((x) => x.text)], [6, ["b2"]], "≤ 6 facts; the ticked one that does not fit is told apart");
    eq(factsReducer(initialFacts(), { type: "typed", facts: ["  x  y  "] }).typed, ["x y"], "typed lines are cleaned");
  });

  section("novelty-guard", async () => {
    const high: NoveltyVerdict = { verdict: "ok", band: "high" };
    const low: NoveltyVerdict = { verdict: "ok", band: "low" };
    const lines: NoveltyLine[] = [
      { path: "hero.headline", text: "Une huile légère pour un visage lumineux", origin: "cloud" },
      { path: "hero.sub", text: "Quelques gouttes le soir.", origin: "local" },
    ];
    const reasks: FieldRewriteInput[] = [];
    let actions = 0;
    const r = await guardNovelty(lines, { "hero.headline": "cloud", "hero.sub": "local", "faq.title": "library" }, {
      check: async (niche, texts) => {
        actions++;
        check(niche === "beauty", "the niche is passed to design's action");
        return { ok: true, data: texts.map((x) => (/huile/i.test(x) ? high : low)) };
      },
      engineLine: () => "Flacon de 50 ml, près du miroir",
      niche: "beauty",
      locale: "fr",
      product: { name: "Huile d'argan", facts: ["Flacon de 50 ml"] },
      rewrite: async (input) => {
        reasks.push(input);
        return { ...ok("server", { variants: ["Une huile plus légère pour le soir"] }) };
      },
      deadlineAt: 60_000,
      now: () => 0,
    });
    eq([reasks.length, actions], [1, 2], "share 0.3 → one re-ask, checked again (≤ 1 re-ask per line)");
    eq([reasks[0]?.intent, reasks[0]?.field, reasks[0]?.mustAvoid.length, reasks[0]?.mustAvoid[1]], ["differentiate", "hero.headline", 2, lines[0]!.text], "the re-ask is copy.field differentiate with the structure tag and the colliding line in mustAvoid");
    eq(r.lines["hero.headline"], { text: "Flacon de 50 ml, près du miroir", origin: "engine" }, "still 0.3 → the engine line");
    eq(r.origin, { "hero.headline": "engine", "hero.sub": "local", "faq.title": "library" }, "the CopyOrigin map is updated (other paths kept)");
    eq(r.flags, ["novelty_reasked", "novelty_replaced"], "novelty_reasked and novelty_replaced flags");
    check(FieldRewriteInputZ.safeParse(reaskInput(lines[0]!, { locale: "fr", product: { name: "Huile d'argan", facts: [] } })).success, "the re-ask input passes copy.field's input schema");

    let late = 0;
    const past = await guardNovelty([lines[0]!], {}, {
      check: async (_n, texts) => texts.map(() => high),
      engineLine: () => null,
      libraryLine: () => "Huile d'argan, flacon de 50 ml",
      niche: "beauty",
      locale: "fr",
      product: { name: "Huile d'argan", facts: [] },
      rewrite: async () => {
        late++;
        return aiFailure("timeout", "server");
      },
      deadlineAt: 1_000,
      now: () => 2_000,
    });
    eq([late, past.lines["hero.headline"]!.origin], [0, "library"], "past the run's deadline: no re-ask, no engine line → the library line");

    const adv = await guardNovelty([lines[0]!], { "hero.headline": "cloud" }, {
      check: async () => ({ ok: false }),
      engineLine: () => null,
      niche: "beauty",
      locale: "fr",
      product: { name: "x", facts: [] },
      rewrite: async () => aiFailure("busy", "server"),
    });
    eq([adv.advisory, adv.origin["hero.headline"], adv.flags], [true, "cloud", []], "the action answers ok: false → advisory, the line ships, nothing blocks");
  });

  section("copy-request-v2", () => {
    const v1 = { locale: "fr", product: { name: "Huile d'argan", category: "beauty", price: 199 } };
    const p1 = CopyRequest.safeParse(v1);
    eq([p1.success, p1.success && p1.data.market, p1.success && p1.data.voice], [true, "MA", undefined], "an old (v1) request parses with today's defaults");
    const v2 = { ...v1, voice: "Chaleureux, direct", policies: ["Paiement à la livraison"], hasWhatsapp: false, style: "Phrase courte.", angle: null, headlineStructure: null, promptVersion: "copy.page@l1" };
    const p2 = CopyRequest.safeParse(v2);
    eq([p2.success, p2.success && p2.data.hasWhatsapp, p2.success && p2.data.policies], [true, false, ["Paiement à la livraison"]], "a v2 request parses with its new fields");
    check(!CopyRequest.safeParse({ ...v2, policies: Array.from({ length: 7 }, () => "x") }).success, "a v2 field over its limit is refused at the boundary");
  });

  section("rewrite-job", () => {
    eq(REWRITE_VARIANTS, MAX_VARIANTS, "the worker's variant count is copy.field's MAX_VARIANTS");
    const spec = rewriteVariantsSpec(20);
    check(spec.zod.safeParse({ variants: ["a", "b", "c"] }).success, "exactly 3 strings pass");
    check(!spec.zod.safeParse({ variants: ["a", "b"] }).success, "2 strings are refused");
    check(!spec.zod.safeParse({ variants: ["a", "b", "x".repeat(21)] }).success, "a string over the field's max is refused");
    const js = JSON.stringify(spec.json);
    check(js.includes('"minItems":3') && js.includes('"maxItems":3') && js.includes('"maxLength":20'), "the decoding schema carries the count and the max");
    check(FieldRewriteInputZ.safeParse(FIELD_INPUT).success, "a FieldRewriteInput passes the worker's boundary");
    check(!FieldRewriteInputZ.safeParse({ ...FIELD_INPUT, extra: 1 }).success && !FieldRewriteInputZ.safeParse({ ...FIELD_INPUT, max: 0 }).success, "an unknown key or a bad max is refused");
  });

  section("cutout-upload", async () => {
    const mask = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
    const spy = fetchStub(() => json(200, { ok: true, asset: { id: "b".repeat(32) }, deduped: false }));
    let removals = 0;
    const r = await cutoutLater(
      {
        handle: "storea",
        sourceAssetId: "a".repeat(32),
        photo: new Blob([new Uint8Array([9])], { type: "image/jpeg" }),
        name: "flacon.jpg",
        removeBackground: async () => {
          removals++;
          return mask;
        },
      },
      { fetch: spy.fetch },
    );
    eq([r, removals, spy.calls.length], [{ ok: true, assetId: "b".repeat(32), deduped: false }, 1, 1], "one local matting run, exactly one upload");
    const call = spy.calls[0]!;
    const form = call.init?.body as FormData;
    eq([call.url, call.init?.method, form.get("cutout"), form.get("sourceAssetId"), (form.get("file") as File).name], ["/api/app/storea/media", "POST", "1", "a".repeat(32), "flacon-cutout.webp"], "the derived-asset upload through the media route (cutout=1, sourceAssetId)");
    check(spy.calls.every((c) => !/\/ai\/|render/.test(c.url)), "no AI call and no render request");
    const none = fetchStub(() => json(200, {}));
    eq(await uploadCutoutMask({ handle: "storea", sourceAssetId: "../x", mask }, { fetch: none.fetch }), { ok: false, reason: "invalid_source" }, "a bad source id uploads nothing");
    eq(await uploadCutoutMask({ handle: "storea", sourceAssetId: "a".repeat(32), mask: new Blob([]) }, { fetch: none.fetch }), { ok: false, reason: "no_mask" }, "an empty mask uploads nothing");
    eq(none.calls.length, 0, "no fetch for a refused upload");
    const failed = await uploadCutoutMask({ handle: "storea", sourceAssetId: "a".repeat(32), mask }, { fetch: fetchStub(() => json(403, { ok: false })).fetch });
    eq(failed, { ok: false, reason: "upload_failed", status: 403 }, "a refused upload (no media.write) is a quiet failure");
  });
}
