/**
 * test:ai sections of the in-flow layer (P7 AI; ai.md AI-19a, AI-§K.3, AI-§K.5, AI-§L, AI-03 (3), AI-05, AI-19
 * acceptance 3 and 4; step 11 of the P7 plan). Registered by src/lib/ai/selftest.ts. Offline and pure: the stage
 * calls, fetch and sleep are stubs; no React renders.
 *
 *   director-slot        the action row per policy: hidden (flag off, Director off, read-only), the blocked lines
 *                        (needs Cloud AI, credits, pending share, passes used up today, the month's share, busy),
 *                        ready in ask / auto with the pass's cost
 *   director-reducer     the pass state machine: ask → running → done, Undo / Redo, dismiss at every stage, "Use this"
 *                        on an instant direction supersedes, a stale pass id is ignored, a result past 150 s is ignored
 *   director-run         runDirectorPass with stub stages: the order (plan → 3 hero ∥ → candidates → critique →
 *                        translate ∥ repair), the stage line, the set with its why lines in three locales and its
 *                        critic_picks; every failure ends with the instant set (credits, superseded, busy, cancelled)
 *   director-why         joinWhy / splitWhy over translations (Latin and Arabic-Indic markers, a lost marker)
 *   director-client      the stage route call: 200, 410 pass_superseded, a typed failure, the critique-as-job poll
 *   rewrite-menu         the intent chips per locale, the copy.field input, the word-level diff
 *   ai-catalog           every AI-§L key in en, the ◆ keys and the in-flow strings in fr and ar, the voice rules
 */
import { messages as AR } from "@/lib/i18n/admin/ar/ai";
import { messages as EN } from "@/lib/i18n/admin/en/ai";
import { messages as FR } from "@/lib/i18n/admin/fr/ai";
import {
  PASS_CAP_MS,
  PASS_IDLE,
  directorSlot,
  heroInputOf,
  joinWhy,
  newPassId,
  passFailReason,
  passReducer,
  runDirectorPass,
  splitWhy,
  stageStep,
  translateInputOf,
  type DirectorEngineAdapter,
  type DirectorPassDeps,
  type DirectorStage,
  type PassAction,
  type PassState,
} from "./director/pass";
import type { Candidate, Critique, DirectionBrief, DirectorBrief, DirectorPlan } from "./director/types";
import type { AiPolicy } from "./policy";
import type { AiResult } from "./provider/types";
import { directorStageCall } from "./router/director-client";
import { rewriteInputOf, rewriteIntentsFor, wordDiff } from "./router/rewrite";
import type { AiTaskId } from "./tasks";

export interface PassSelftestApi {
  section(name: string, run: () => void | Promise<void>, opts?: { slow?: boolean; strict?: boolean }): void;
  check(ok: boolean, msg: string): void;
  eq(a: unknown, b: unknown, msg: string): void;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function pol(p: { available?: boolean; block?: AiPolicy["cloud"]["block"]; director?: AiPolicy["cloud"]["director"]; directorBlock?: AiPolicy["cloud"]["directorBlock"]; live?: AiTaskId[] } = {}): AiPolicy {
  return {
    mode: "auto",
    cloud: {
      available: p.available ?? true,
      block: p.block ?? null,
      creditsLeft: 100,
      dayLeft: 20,
      director: p.director ?? "ask",
      directorBlock: p.directorBlock ?? null,
      directorPassCredits: 53,
      directorPassesLeft: 3,
      deepPass: false,
      deepPassesLeft: null,
      deepTransport: "job",
    },
    local: { enabled: true, tierMax: "lite", bgRemoval: false },
    autoPrefersCloud: {},
    live: p.live ?? ["copy.hero", "copy.field", "design.plan", "design.critique"],
    transport: "stream",
    promptVersions: {},
    voiceLocal: "",
    workerName: "Store Gen AI",
  };
}

const BRIEF = {
  store: { handle: "atlas", market: "MA", locales: ["fr", "ar", "en"], memory: [], policies: {}, brandSeed: "s" },
  product: { name: "Sérum Argan Éclat", category: "skincare", facts: ["Flacon de 30 ml"], price: { minor: 19_900, currency: "MAD" }, items: [], offers: [] },
  photos: [],
  mode: "landing",
  constraints: { noOrange: true, mood: null, modest: false, locks: {} },
  recent: { storeGenomeCards: [], nicheCrowding: {} },
} as unknown as DirectorBrief;

const dir = (slot: DirectionBrief["slot"], structure: string): DirectionBrief => ({ slot, hints: {}, headlineStructures: [structure] as DirectionBrief["headlineStructures"], copyAngle: "benefit" as DirectionBrief["copyAngle"], mustHave: [], mustAvoid: ["centred-dark-hero-glow"], rationale: "r" });
const PLAN: DirectorPlan = {
  read: { readLine: "r", audience: "a", priceTier: "mid", suggestedFacts: [], photoQuality: { sharp: true, clutter: "none", fullBleedOk: true, cutoutViable: true, advice: null }, dials: { variance: 5, motion: 5, density: 5 }, risks: [] },
  directions: [dir("best_fit", "noun-phrase"), dir("contrast", "contrast-pair"), dir("explore", "question")],
};
const cand = (id: string): Candidate => ({ card: { id, slot: "best_fit" } as unknown as Candidate["card"], digest: { sections: [] } as unknown as Candidate["digest"], heroCopy: { headline: "h", sub: "s", cta: "c" } });
const CANDS = ["c1", "c2", "c3", "c4", "c5", "c6"].map(cand);
const WHY_FR: [string, string, string] = ["Une colonne claire.", "Un contraste franc.", "Un rythme dense."];
const CRITIQUE: Critique = {
  perCandidate: CANDS.map((c) => ({ id: c.card.id, picked: ["c1", "c3", "c5"].includes(c.card.id), scores: {}, hardFails: [], issues: [], repairs: [] })),
  pick: ["c1", "c3", "c5"],
  whyLines: { locale: "fr", lines: WHY_FR },
  distinctness: [0.4, 0.4, 0.4],
};
const ok = <T>(value: T): AiResult<T> => ({ ok: true, value, provider: "server", class: "worker", model: null, effort: null, promptVersion: "x", rubricVersion: null, runId: null, jobId: null, usage: null, ms: 1, ttftMs: null, rejected: [], flags: [], notes: [] });

interface Script {
  plan?: Awaited<ReturnType<DirectorPassDeps["plan"]>>;
  critique?: Awaited<ReturnType<DirectorPassDeps["critique"]>>;
  critiqueAsJob?: boolean;
  heroFails?: number[];
  translate?: (target: string) => Awaited<ReturnType<DirectorPassDeps["translate"]>>;
  candidatesThrow?: boolean;
  abortAt?: DirectorStage;
}

function harness(s: Script = {}) {
  const calls: string[] = [];
  const stages: DirectorStage[] = [];
  const heroesSeen: unknown[][] = [];
  const ctrl = new AbortController();
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const adapter: DirectorEngineAdapter = {
    brief: () => {
      calls.push("brief");
      return BRIEF;
    },
    candidates: async (_plan, heroes) => {
      calls.push("candidates");
      heroesSeen.push([...heroes]);
      if (s.candidatesThrow) throw new Error("engine");
      return CANDS;
    },
    repair: async (picks) => {
      calls.push("repair");
      await tick();
      return { picks, applied: { c1: [true, false] } };
    },
    present: () => calls.push("present"),
    restoreInstant: () => calls.push("restore"),
  };
  const deps: DirectorPassDeps = {
    plan: async () => {
      calls.push("plan");
      await tick();
      return s.plan ?? { ok: true, value: PLAN, runId: "r_plan", credits: 12 };
    },
    hero: async (input) => {
      calls.push(`hero:${input.direction.slot}`);
      await tick();
      const i = ["best_fit", "contrast", "explore"].indexOf(input.direction.slot);
      return s.heroFails?.includes(i) ? { ok: false, code: "busy", retryable: true, provider: "library", runId: null } : ok({ headline: `H${i}` });
    },
    critique: async (_input, _signal, onJob) => {
      calls.push("critique");
      if (s.critiqueAsJob) onJob();
      await tick();
      return s.critique ?? { ok: true, value: CRITIQUE, runId: "r_crit", credits: 30 };
    },
    translate: async (input) => {
      calls.push(`translate:${input.targetLocale}`);
      await tick();
      if (s.translate) return s.translate(input.targetLocale ?? "");
      const lines = input.targetLocale === "ar" ? ["عمود واضح.", "تباين قوي.", "إيقاع كثيف."] : ["A clear column.", "A bold contrast.", "A dense rhythm."];
      return ok({ variants: [joinWhy(lines)] });
    },
    onStage: (st) => {
      stages.push(st);
      if (st === s.abortAt) ctrl.abort();
    },
    promptVersions: { plan: "director.plan@s1" },
  };
  return { calls, stages, heroesSeen, ctrl, adapter, deps };
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

export function registerPassSections(t: PassSelftestApi): void {
  const { section, check, eq } = t;

  section("director-slot", () => {
    eq(directorSlot(null), { k: "hidden" }, "no policy: hidden");
    eq(directorSlot(pol({ live: ["copy.hero"] })), { k: "hidden" }, "flag off (Director tasks not live): hidden, the wizard unchanged (AI-19 (4))");
    eq(directorSlot(pol({ director: "off" })), { k: "hidden" }, "the store turned the pass off: hidden");
    eq(directorSlot(pol({ live: [], available: false, block: "state", director: "unavailable" })), { k: "hidden" }, "impersonation (live empty): hidden");
    eq(directorSlot(pol({ available: false, block: "state", director: "unavailable" })), { k: "hidden" }, "a read-only store: hidden");
    eq(directorSlot(pol({ available: false, block: "platform_off", director: "unavailable" })), { k: "blocked", block: "needs_cloud" }, "Cloud AI off: needs Cloud AI");
    eq(directorSlot(pol({ available: false, block: "store_local_only", director: "unavailable" })), { k: "blocked", block: "needs_cloud" }, "on-device only: needs Cloud AI");
    for (const b of ["quota_store", "quota_day", "quota_platform"] as const) eq(directorSlot(pol({ available: false, block: b, director: "unavailable" })), { k: "blocked", block: "credits" }, `${b}: paused, credits`);
    eq(directorSlot(pol({ available: false, block: "quota_platform_pending", director: "unavailable" })), { k: "blocked", block: "pending" }, "pending share: its own line");
    eq(directorSlot(pol({ available: false, block: "paused", director: "unavailable" })), { k: "blocked", block: "busy" }, "breaker: busy");
    eq(directorSlot(pol({ director: "unavailable", directorBlock: "passes_day" })), { k: "blocked", block: "passes_day" }, "passes used up today: the reset line");
    eq(directorSlot(pol({ director: "unavailable", directorBlock: "quota_director" })), { k: "blocked", block: "quota_director" }, "the month's Director share spent");
    eq(directorSlot(pol({ director: "unavailable", directorBlock: "class_down" })), { k: "blocked", block: "busy" }, "class down: busy");
    eq(directorSlot(pol({ director: "ask" })), { k: "ready", mode: "ask", credits: 53, passesLeft: 3 }, "ask: the button with the cost");
    eq(directorSlot(pol({ director: "auto" })), { k: "ready", mode: "auto", credits: 53, passesLeft: 3 }, "auto: the same cost on the stage line (QUAL-34)");
    check(/^[A-Za-z0-9_-]{8,64}$/.test(newPassId()), "a pass id the stage routes accept");
    eq(["read", "brief", "critique", "critique_job", "repair", "verify", "done"].map((s) => stageStep(s as DirectorStage)), [0, 1, 2, 2, 3, 3, 4], "stage line steps");
  });

  section("director-reducer", () => {
    const run = (s: PassState, ...a: PassAction[]) => a.reduce(passReducer, s);
    const t0 = 1_000_000;
    let s = run(PASS_IDLE, { t: "start", passId: "p1", at: t0 });
    eq(s, { k: "running", passId: "p1", stage: "read", startedAt: t0 }, "start → running at the read stage");
    eq(run(s, { t: "start", passId: "p2", at: t0 }), s, "a second start while running is ignored");
    s = run(s, { t: "stage", passId: "p1", stage: "critique" });
    check(s.k === "running" && s.stage === "critique", "stage moves");
    eq(run(s, { t: "stage", passId: "p0", stage: "repair" }), s, "a stale pass's stage is ignored");
    eq(run(s, { t: "done", passId: "p0", at: t0 + 10 }), s, "a stale pass's result is ignored");
    const done = run(s, { t: "done", passId: "p1", at: t0 + 60_000 });
    eq(done, { k: "done", passId: "p1", showing: "director", quiet: false }, "done within the cap: the refined set shows");
    eq(run(s, { t: "done", passId: "p1", at: t0 + PASS_CAP_MS + 1 }), { k: "failed", passId: "p1", reason: "timeout" }, "done past 150 s: ignored, the instant set stays (AI-19 (3))");
    const undone = run(done, { t: "undo" });
    eq(undone, { k: "done", passId: "p1", showing: "instant", quiet: false }, "Undo: back to the instant set");
    eq(run(undone, { t: "redo" }), done, "Redo: the refined set again");
    eq(run(done, { t: "dismiss" }), { ...done, quiet: true }, "dismiss after done keeps the set, hides the control");
    eq(run(done, { t: "use_instant" }), done, "Use this on a refined direction is not a supersede");
    eq(run(s, { t: "use_instant" }), { k: "superseded" }, "Use this on an instant direction while running: pass_superseded");
    eq(run(PASS_IDLE, { t: "use_instant" }), { k: "superseded" }, "Use this before asking: the button goes");
    eq(run(s, { t: "dismiss" }), { k: "dismissed" }, "dismissible while running");
    eq(run(PASS_IDLE, { t: "dismiss" }), { k: "dismissed" }, "dismissible before it starts");
    eq(run(s, { t: "fail", passId: "p1", reason: "credits" }), { k: "failed", passId: "p1", reason: "credits" }, "credits: the paused chip");
    eq(run(s, { t: "fail", passId: "p1", reason: "busy" }), { k: "failed", passId: "p1", reason: "busy" }, "busy: the instant set stays");
    eq(run(s, { t: "fail", passId: "p1", reason: "superseded" }), { k: "superseded" }, "410 pass_superseded");
    eq(run(s, { t: "fail", passId: "p1", reason: "cancelled" }), { k: "dismissed" }, "cancelled: nothing more shown");
    eq(run(s, { t: "fail", passId: "p9", reason: "busy" }), s, "a stale failure is ignored");
    const failed = run(s, { t: "fail", passId: "p1", reason: "busy" });
    check(run(failed, { t: "start", passId: "p2", at: t0 }).k === "running", "a failed pass may be asked again");
    eq(run(done, { t: "reset" }), PASS_IDLE, "reset: a new instant set starts over");
    eq(["pass_superseded", "cancelled", "timeout", "quota_store", "quota_director", "quota_platform_pending", "refused", "busy", "provider_error"].map((c) => passFailReason(c as never)), ["superseded", "cancelled", "timeout", "credits", "credits", "credits", "busy", "busy", "busy"], "failure codes → the quiet reasons (never the refusal category)");
  });

  section("director-run", async () => {
    // the happy path
    const h = harness();
    const r = await runDirectorPass("dp_test_0001", h.adapter, h.deps, h.ctrl.signal);
    check(r.ok, "the pass completes");
    eq(h.stages, ["read", "brief", "critique", "repair", "done"], "the stage line");
    eq(h.calls.slice(0, 2), ["brief", "plan"], "brief, then the plan");
    eq(h.calls.slice(2, 5).sort(), ["hero:best_fit", "hero:contrast", "hero:explore"], "three copy.hero calls");
    eq(h.calls[5], "candidates", "candidates after the hero packs");
    eq(h.calls[6], "critique", "then the critique");
    eq(h.calls.slice(7, 10).sort(), ["repair", "translate:ar", "translate:en"], "repair in parallel with two translations");
    check(!h.calls.includes("present"), "the pass never presents itself (the hook does)");
    if (r.ok) {
      eq(r.set.picks.map((p) => p.id), ["c1", "c3", "c5"], "the critique's picks, in order");
      eq(r.set.picks[0].why, { fr: WHY_FR[0], ar: "عمود واضح.", en: "A clear column." }, "why lines in the three locales");
      eq(r.set.primary, "fr", "the primary locale");
      eq(r.set.credits, 42, "plan + critique credits");
      const picks = r.set.criticPicks("c1");
      check(!!picks && picks.chosen === "c1" && picks.source === "director" && picks.critiqueRunId === "r_crit" && picks.promptVersions.plan === "director.plan@s1", "critic_picks for the kept direction");
      eq(r.set.criticPicks("c2"), null, "no critic_picks for a direction outside the set");
    }
    eq(h.heroesSeen[0], [{ headline: "H0" }, { headline: "H1" }, { headline: "H2" }], "each direction's hero pack reaches the candidates");
    const input = heroInputOf(BRIEF, PLAN.directions[1], "Livraison en 48 h");
    check(input.locale === "fr" && input.direction.headlineStructure === "contrast-pair" && input.product.priceMinor === 19_900 && input.deliveryText === "Livraison en 48 h", "copy.hero input from the brief and the direction");

    // a hero fails: the pass goes on with the library's pack for it
    const hf = harness({ heroFails: [1] });
    const rf = await runDirectorPass("dp_test_0002", hf.adapter, hf.deps, hf.ctrl.signal);
    check(rf.ok && hf.heroesSeen[0]![1] === null, "a failed hero pack is null (the library's stays), the pass continues");

    // the critique ran as a job
    const hj = harness({ critiqueAsJob: true });
    await runDirectorPass("dp_test_0003", hj.adapter, hj.deps, hj.ctrl.signal);
    eq(hj.stages, ["read", "brief", "critique", "critique_job", "repair", "done"], "critique-as-job: the background stage line");

    // failures: the instant set stays
    const hq = harness({ plan: { ok: false, code: "quota_director" } });
    eq(await runDirectorPass("dp_test_0004", hq.adapter, hq.deps, hq.ctrl.signal), { ok: false, reason: "credits" }, "plan refused for the Director share: credits");
    check(!hq.calls.includes("candidates"), "nothing runs after a failed stage");
    const hs = harness({ critique: { ok: false, code: "pass_superseded" } });
    eq(await runDirectorPass("dp_test_0005", hs.adapter, hs.deps, hs.ctrl.signal), { ok: false, reason: "superseded" }, "410 on the critique: superseded");
    const hc = harness({ candidatesThrow: true });
    eq(await runDirectorPass("dp_test_0006", hc.adapter, hc.deps, hc.ctrl.signal), { ok: false, reason: "busy" }, "the engine threw: busy");
    const ha = harness({ abortAt: "brief" });
    eq(await runDirectorPass("dp_test_0007", ha.adapter, ha.deps, ha.ctrl.signal), { ok: false, reason: "cancelled" }, "aborted mid-pass: cancelled");
    check(!ha.calls.includes("critique"), "an abort stops the next stages");
    const hp = harness({ critique: { ok: true, value: { ...CRITIQUE, pick: ["c1", "c3", "c9"] }, runId: null, credits: 0 } });
    eq(await runDirectorPass("dp_test_0008", hp.adapter, hp.deps, hp.ctrl.signal), { ok: false, reason: "busy" }, "a pick outside the candidates: busy");

    // translations lost: the primary line stands in
    const ht = harness({ translate: () => ok({ variants: ["Une colonne claire. Un contraste franc. Un rythme dense."] }) });
    const rt = await runDirectorPass("dp_test_0009", ht.adapter, ht.deps, ht.ctrl.signal);
    check(rt.ok && Object.keys(rt.set.picks[0].why).join() === "fr", "markers lost in translation: only the primary line");
    const hx = harness({ translate: () => ({ ok: false, code: "busy", retryable: true, provider: "server", runId: null }) });
    check((await runDirectorPass("dp_test_0010", hx.adapter, hx.deps, hx.ctrl.signal)).ok, "a failed translation never fails the pass");
  });

  section("director-why", () => {
    const lines = ["Une colonne claire.", "Un contraste (franc).", "Un rythme dense."];
    eq(splitWhy(joinWhy(lines)), lines, "round trip");
    eq(splitWhy("(١) عمود واضح. (٢) تباين قوي. (٣) إيقاع كثيف."), ["عمود واضح.", "تباين قوي.", "إيقاع كثيف."], "Arabic-Indic markers");
    eq(splitWhy("(1) a (2) b"), null, "a lost line");
    eq(splitWhy("(2) a (1) b (3) c"), null, "markers out of order");
    eq(splitWhy(`(1) ${"x".repeat(121)} (2) b (3) c`), null, "a line over 120 chars");
    const tin = translateInputOf(BRIEF, "fr", "ar", lines);
    check(tin.intent === "translate" && tin.targetLocale === "ar" && tin.field === "director.why" && tin.max >= tin.text.length && tin.max <= 1_200, "the translate input");
  });

  section("director-client", async () => {
    const seen: { url: string; body: unknown }[] = [];
    const io = (answer: (url: string) => Response) => ({
      handle: "atlas",
      fetch: (async (url: string, init?: RequestInit) => {
        seen.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        return answer(url);
      }) as unknown as typeof fetch,
      visible: () => true,
      sleep: async () => undefined,
    });
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const pass = { session: "sess_0001", id: "dp_abcdefgh" };
    const signal = new AbortController().signal;
    const a = await directorStageCall<DirectorPlan>("plan", { brief: 1 }, pass, io(() => json(200, { ok: true, value: PLAN, runId: "r1", credits: 12, stage: "plan" })), signal);
    eq(a, { ok: true, value: PLAN, runId: "r1", credits: 12 }, "200: the plan");
    eq(seen[0], { url: "/api/app/atlas/ai/director/plan", body: { input: { brief: 1 }, pass, surface: "wizard" } }, "the route and the pass envelope");
    eq(await directorStageCall("critique", {}, pass, io(() => json(410, { ok: false, error: "pass_superseded" })), signal), { ok: false, code: "pass_superseded" }, "410: superseded");
    eq(await directorStageCall("plan", {}, pass, io(() => json(429, { ok: false, error: "quota_director", retryable: false })), signal), { ok: false, code: "quota_director" }, "a typed failure");
    eq(await directorStageCall("plan", {}, pass, io(() => new Response("<html>", { status: 503 })), signal), { ok: false, code: "busy" }, "a proxy page: the status's code");
    let jobOnJob = 0;
    const polls: string[] = [];
    const job = await directorStageCall<Critique>(
      "critique",
      {},
      pass,
      io((url) => {
        if (url.endsWith("/ai/director/critique")) return json(202, { ok: true, jobId: "job_1", stage: "critique" });
        polls.push(url);
        return polls.length < 2 ? json(200, { ok: true, id: "job_1", status: "running", stage: "critique", costCredits: 0 }) : json(200, { ok: true, id: "job_1", status: "done", stage: null, outputs: { critique: CRITIQUE }, costCredits: 31 });
      }),
      signal,
      () => jobOnJob++,
    );
    eq(job, { ok: true, value: CRITIQUE, runId: null, credits: 31 }, "202 jobId: polled to done, outputs.critique");
    check(jobOnJob === 1 && polls.every((u) => u === "/api/app/atlas/ai/jobs/job_1"), "onJob once; the job poll route");
    const failedJob = await directorStageCall("critique", {}, pass, io((url) => (url.endsWith("/critique") ? json(202, { ok: true, jobId: "job_2" }) : json(200, { ok: true, id: "job_2", status: "failed", error: { code: "timeout" }, costCredits: 0 }))), signal);
    eq(failedJob, { ok: false, code: "timeout" }, "a failed job: its code");
    const aborted = new AbortController();
    aborted.abort();
    const ab = await directorStageCall("plan", {}, pass, { handle: "atlas", fetch: (async () => { throw new DOMException("aborted", "AbortError"); }) as unknown as typeof fetch, visible: () => true, sleep: async () => undefined }, aborted.signal);
    eq(ab, { ok: false, code: "cancelled" }, "an aborted call: cancelled");
  });

  section("rewrite-menu", () => {
    const ar = rewriteIntentsFor("ar", ["ar", "fr", "en"]);
    check(ar.some((c) => c.intent === "darija") && !ar.some((c) => c.intent === "formal"), "ar: More Darija, no formal");
    eq(ar.filter((c) => c.intent === "translate").map((c) => c.targetLocale), ["fr", "en"], "ar: translate to the other store locales");
    const fr = rewriteIntentsFor("fr", ["fr"]);
    check(fr.some((c) => c.intent === "formal") && !fr.some((c) => c.intent === "darija") && !fr.some((c) => c.intent === "translate"), "fr alone: formal, no darija, no translate");
    check([...ar, ...fr].every((c) => (c.intent as string) !== "differentiate"), "never the novelty re-ask");
    const input = rewriteInputOf({ path: "hero.headline", text: "Un titre", max: 5_000, locale: "fr", product: { name: "Sérum", facts: ["a", "b", "c", "d", "e", "f", "g"] } }, { intent: "translate", targetLocale: "ar" });
    check(input.max === 1_200 && input.product.facts.length === 6 && input.targetLocale === "ar" && input.mustAvoid.length === 0, "the copy.field input is bounded");
    eq(rewriteInputOf({ path: "x", text: "t", max: 40, locale: "fr", product: { name: "n", facts: [] } }, { intent: "shorter", targetLocale: "en" }).targetLocale, null, "targetLocale only for translate");
    eq(wordDiff("Le sérum qui éclaire", "Le sérum qui illumine vite"), [{ k: "same", text: "Le sérum qui" }, { k: "del", text: "éclaire" }, { k: "add", text: "illumine vite" }], "word-level diff");
    eq(wordDiff("Vite.", "vite"), [{ k: "same", text: "vite" }], "case and punctuation insensitive");
    eq(wordDiff("", "Nouveau"), [{ k: "add", text: "Nouveau" }], "empty before");
  });

  section("ai-catalog", () => {
    const en = EN as Record<string, string>;
    const fr = FR as Record<string, string>;
    const ar = AR as Record<string, string>;
    // the ◆ keys of AI-§L, plus every string the in-flow components show in onboarding and the wizard
    const DIAMOND = [
      "ai.chip.cloud", "ai.chip.local", "ai.chip.library", "ai.note.busy", "ai.note.credits", "ai.note.refused", "ai.note.timeout", "ai.note.kept", "ai.progress.lines",
      "ai.facts.suggested", "ai.consent.title", "ai.consent.body", "ai.write_again", "ai.director.stage.read", "ai.director.stage.brief", "ai.director.stage.critique",
      "ai.director.stage.repair", "ai.director.stage.verify", "ai.director.stage.done", "ai.director.refined", "ai.director.undo", "ai.director.ask", "ai.director.needs_cloud",
      "ai.director.paused_credits", "ai.block.quota_director", "ai.block.quota_platform_pending", "ai.director.cost", "ai.director.stage.critique_job", "ai.note.novelty",
    ];
    const IN_FLOW = [
      "ai.chip.writing", "ai.note.busy_library", "ai.note.credits_local", "ai.note.pending", "ai.note.kept_fields", "ai.facts.overflow", "ai.facts.dismiss", "ai.consent.download",
      "ai.consent.later", "ai.director.why", "ai.director.redo", "ai.director.credits_link", "ai.director.busy", "ai.director.dismiss", "ai.block.passes_day",
      "ai.rewrite.button", "ai.rewrite.title", "ai.rewrite.writing", "ai.rewrite.option", "ai.rewrite.use", "ai.rewrite.again", "ai.rewrite.back", "ai.rewrite.none", "ai.rewrite.failed",
      "ai.rewrite.done", "ai.rewrite.undo", "ai.rewrite.undo_action", "ai.rewrite.locale.ar", "ai.rewrite.locale.fr", "ai.rewrite.locale.en",
      ...["shorter", "darija", "warmer", "premium", "gift", "concrete", "formal", "translate"].map((i) => `ai.rewrite.intent.${i}`),
      "ai.job.queued", "ai.job.running", "ai.job.failed", "ai.job.batch", "ai.job.batch_hours", "ai.job.cancel", "ai.job.elapsed", "ai.review.button", "ai.review.apply", "ai.review.apply_all", "ai.review.no_gain",
    ];
    const SPEC_EN = [
      "ai.settings.mode.auto", "ai.settings.mode.local", "ai.settings.mode.server", "ai.settings.credits", "ai.settings.credits_day", "ai.settings.memory.title", "ai.settings.memory.lede",
      "ai.settings.memory.evidence", "ai.settings.share", "ai.settings.privacy", "ai.block.platform_off", "ai.block.entitlement", "ai.block.quota_store", "ai.block.quota_day",
      "ai.block.store_local_only", "ai.block.paused", "ai.director.line", "ai.director.passes_left", "ai.job.done", "ai.settings.director.title", "ai.settings.director.auto",
      "ai.settings.director.ask", "ai.settings.director.off", "ai.settings.deep.title", "ai.settings.deep.body", "ai.settings.retention", "ai.director.share", "ai.block.impersonation",
      "ai.callhint.outside", "ai.console.after_driver", "ai.copilot.placeholder", "ai.copilot.no_cloud", "ai.copilot.proposal.do", "ai.copilot.proposal.cancel",
    ];
    for (const k of [...DIAMOND, ...IN_FLOW, ...SPEC_EN]) check(typeof en[k] === "string" && en[k].length > 0, `en: ${k}`);
    for (const k of [...DIAMOND, ...IN_FLOW]) check(typeof fr[k] === "string" && fr[k].length > 0 && typeof ar[k] === "string" && ar[k].length > 0, `fr and ar: ${k}`);
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    for (const [name, cat] of [["en", en], ["fr", fr], ["ar", ar]] as const) {
      for (const [k, v] of Object.entries(cat)) {
        if (!k.startsWith("ai.")) continue;
        check(!/[–—]/.test(v), `${name} ${k}: no em or en dash`);
        check(!/!/.test(v), `${name} ${k}: no exclamation mark`);
        check(!/\b(step|étape)\s*\d/i.test(v), `${name} ${k}: no "Step n"`);
        if (name !== "en") check(vars(v) === vars(en[k] ?? ""), `${name} ${k}: the English placeholders`);
      }
    }
    eq(EN["ai.director.ask"], "Director pass · about {credits} credits · about a minute", "the ask button's wording (AI-§L)");
    eq(EN["ai.progress.lines"], "{done} of {total} lines written", "the footer count (AI-§K.3)");
  });
}
