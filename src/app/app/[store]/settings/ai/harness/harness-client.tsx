"use client";
/**
 * The component harness's client part (P7 AI; see ./page.tsx): every in-flow AI component, live where a scripted
 * adapter can drive it (the streamed reveal, the Director pass inside the real RevealFolds, the rewrite menu) and as a
 * still gallery of every AI-§K.5 state. The section labels are a QA tool's (English, never shown to a seller); the
 * components render in the viewer's language.
 */
import { useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { AiProviderChip } from "@/components/admin/ai/chip";
import { JobProgress } from "@/components/admin/ai/job-progress";
import { ModelConsent } from "@/components/admin/ai/model-consent";
import { FieldRewrite, RewritePanel } from "@/components/builder/ai/field-rewrite";
import { DirectorReview } from "@/components/builder/ai/director-review";
import { CopyReveal, KeptNote, LinesWritten, NoveltyNote } from "@/components/generate/ai/copy-reveal";
import { DirectorPassControl, DirectorPassProvider, DirectorWhy, useDirectorPass, type DirectorPassApi } from "@/components/generate/ai/director-pass";
import { SuggestedFacts } from "@/components/generate/ai/suggested-facts";
import { RevealFolds, type RevealDirections } from "@/components/generate/reveal/RevealFolds";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { directorSlot, joinWhy, type DirectorEngineAdapter, type DirectorPassDeps, type DirectorSet, type DirectorSlotView, type PassState } from "@/lib/ai/director/pass";
import type { Candidate, Critique, DirectorBrief, DirectorPlan } from "@/lib/ai/director/types";
import type { AiPolicy, DeviceInfo } from "@/lib/ai/policy";
import type { AiTaskState, AiJobPoll } from "@/lib/ai/router/client";
import type { RewriteField } from "@/lib/ai/router/rewrite";
import { factsReducer, initialFacts } from "@/lib/ai/router/suggested-facts";
import type { HeroPack, HeroPackOut } from "@/lib/ai/schema/tasks/copy-hero";
import type { Locale, PageDoc } from "@/lib/page/schema";

export interface HarnessFixtures {
  handle: string;
  brief: DirectorBrief;
  plan: DirectorPlan;
  candidates: Candidate[];
  hero: HeroPack;
  library: HeroPackOut;
  facts: string[];
  suggested: string[];
  rewrite: { field: RewriteField; variants: string[] };
  instant: { id: string; doc: PageDoc; label: string }[];
}

/* ------------------------------------------------------------------ */
/* Scripted fixtures                                                   */
/* ------------------------------------------------------------------ */

const T0 = Date.now();
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

const PICKS = ["c1", "c3", "c5"] as const;
const WHY: Record<"fr" | "ar" | "en", [string, string, string]> = {
  fr: [
    "Une colonne claire et un grand visuel du flacon : le produit parle avant le texte.",
    "Un contraste franc et une mise en page à droite qui se démarque des pages de soins.",
    "Une composition dense et rythmée qui montre chaque bienfait en un coup d'œil.",
  ],
  ar: ["عمود واضح وصورة كبيرة للقنينة: المنتج كيهضر قبل النص.", "تباين قوي وتصميم على اليمين كيبان مختلف على صفحات العناية.", "تركيب كثيف ومنظم كيبين كل فائدة من النظرة الأولى."],
  en: [
    "A clear column and a large shot of the bottle: the product speaks before the text.",
    "A bold contrast and an asymmetric layout that stands apart from other skincare pages.",
    "A dense, steady rhythm that shows each benefit at a glance.",
  ],
};

function critiqueOf(candidates: readonly Candidate[]): Critique {
  return {
    perCandidate: candidates.map((c) => {
      const picked = (PICKS as readonly string[]).includes(c.card.id);
      return {
        id: c.card.id,
        picked,
        scores: picked ? { R1: 4, R2: 4, R5: 4, R8: 3 } : {},
        hardFails: [],
        issues: picked ? [] : [{ dim: "R1", severity: "major", evidence: { card: c.card.id } }],
        repairs: [],
      };
    }),
    pick: [...PICKS],
    whyLines: { locale: "fr", lines: WHY.fr },
    distinctness: [0.41, 0.38, 0.45],
  };
}

function policyOf(p: { available?: boolean; block?: AiPolicy["cloud"]["block"]; director?: AiPolicy["cloud"]["director"]; directorBlock?: AiPolicy["cloud"]["directorBlock"] } = {}): AiPolicy {
  return {
    mode: "auto",
    cloud: {
      available: p.available ?? true,
      block: p.block ?? null,
      creditsLeft: 212,
      dayLeft: 40,
      director: p.director ?? "ask",
      directorBlock: p.directorBlock ?? null,
      directorPassCredits: 53,
      directorPassesLeft: 4,
      deepPass: false,
      deepPassesLeft: null,
      deepTransport: "job",
    },
    local: { enabled: true, tierMax: "full", bgRemoval: true },
    autoPrefersCloud: {},
    live: ["analyze", "copy.hero", "copy.page", "copy.field", "design.plan", "design.critique"],
    transport: "stream",
    promptVersions: {},
    voiceLocal: "",
    workerName: "Store Gen AI",
  };
}

const DESKTOP: DeviceInfo = { tier: "full", mobile: false, saveData: false, vlmCached: false };

function doneSet(f: HarnessFixtures): DirectorSet {
  const critique = critiqueOf(f.candidates);
  const byId = new Map(f.candidates.map((c) => [c.card.id, c]));
  const picks = PICKS.map((id, i) => ({ id, candidate: byId.get(id)!, why: { fr: WHY.fr[i], ar: WHY.ar[i], en: WHY.en[i] } }));
  return {
    passId: "dp_harness_still",
    picks: picks as unknown as DirectorSet["picks"],
    primary: "fr",
    critique,
    runIds: { plan: null, critique: null },
    credits: 41,
    criticPicks: () => null,
  };
}

/** A still pass for the gallery: the slot and state given, every action a no-op. */
function stillPass(slot: DirectorSlotView, state: PassState, set: DirectorSet | null = null): DirectorPassApi {
  const noop = () => undefined;
  return {
    slot,
    state,
    set,
    settingsHref: "#",
    start: noop,
    dismiss: noop,
    undo: noop,
    redo: noop,
    reset: noop,
    onUse: () => null,
    whyFor: (id: string, locale: Locale) => (state.k === "done" && state.showing === "director" && set ? (set.picks.find((p) => p.id === id)?.why[locale] ?? null) : null),
  };
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="adm-surface grid min-w-0 gap-4 p-5">
      <header className="grid gap-0.5">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        {note ? <p className="text-[0.8125rem] text-muted-foreground">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5 border-t border-foreground/[0.05] pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <span className="font-mono text-[0.6875rem] text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live parts                                                          */
/* ------------------------------------------------------------------ */

const HERO_FIELDS = ["headline", "sub", "cta"] as const;

function StreamedHero({ f }: { f: HarnessFixtures }) {
  const [arrived, setArrived] = useState(0);
  useEffect(() => {
    const timers = HERO_FIELDS.map((_, i) => setTimeout(() => setArrived((n) => Math.max(n, i + 1)), 600 + i * 500));
    return () => timers.forEach(clearTimeout);
  }, []);
  // the library's *emphasis* markup is the page renderer's; the harness shows the plain words
  const text = (k: (typeof HERO_FIELDS)[number], i: number) => (arrived > i ? f.hero[k] : (f.library[k] ?? "")).replace(/\*/g, "");
  const origin = (i: number) => (arrived > i ? "cloud" : "library");
  const state: Pick<AiTaskState, "status" | "provider" | "notes"> = { status: arrived < HERO_FIELDS.length ? "running" : "done", provider: "server", notes: [] };
  return (
    <div className="grid gap-4">
      <AiProviderChip state={state} />
      {/* the page's copy is French here: its own language and direction, whatever the admin's */}
      <div lang="fr" dir="ltr" className="grid gap-2 rounded-xl bg-background p-4 ring-1 ring-foreground/[0.07]">
        <CopyReveal as="h3" field="hero.headline" text={text("headline", 0)} origin={origin(0)} className="text-[1.25rem] leading-tight font-semibold text-balance" />
        <CopyReveal as="p" field="hero.sub" text={text("sub", 1)} origin={origin(1)} className="text-[0.875rem] text-pretty text-muted-foreground" />
        <CopyReveal as="span" field="hero.cta" text={text("cta", 2)} origin={origin(2)} className="mt-1 inline-flex h-9 w-fit items-center rounded-full bg-primary px-4 text-[0.8125rem] font-medium text-primary-foreground" />
      </div>
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <LinesWritten done={arrived} total={HERO_FIELDS.length} />
        <KeptNote fields={["hero.kicker"]} labels={{ "hero.kicker": "Kicker" }} />
        <NoveltyNote n={1} />
      </footer>
    </div>
  );
}

function LiveDirector({ f }: { f: HarnessFixtures }) {
  const instant = useMemo(() => f.instant.map((d) => ({ ...d, card: null })) as unknown as RevealDirections, [f.instant]);
  const [directions, setDirections] = useState<RevealDirections>(instant);
  const [used, setUsed] = useState<string | null>(null);
  const adapter: DirectorEngineAdapter = {
    brief: () => f.brief,
    candidates: async (_plan, heroes, signal) => {
      await wait(300, signal);
      return f.candidates.map((c, i) => ({ ...c, heroCopy: { ...c.heroCopy, ...(heroes[i % 3] ?? {}) } }));
    },
    repair: async (picks, _critique, signal) => {
      await wait(250, signal);
      return { picks, applied: {} };
    },
    present: (set) => setDirections(set.picks.map((p, i) => ({ id: p.id, doc: f.instant[i]!.doc, card: null, label: f.instant[i]!.label })) as unknown as RevealDirections),
    restoreInstant: () => setDirections(instant),
  };
  const deps = (_passId: string, onStage: DirectorPassDeps["onStage"]): DirectorPassDeps => ({
    plan: async (_input, signal) => {
      await wait(600, signal);
      return { ok: true, value: f.plan, runId: "run_plan", credits: 14 };
    },
    hero: async (_input, signal) => {
      await wait(300, signal);
      return { ok: true, value: f.hero, provider: "server", class: "worker", model: null, effort: null, promptVersion: "copy.hero@s1", rubricVersion: null, runId: null, jobId: null, usage: null, ms: 300, ttftMs: null, rejected: [], flags: [], notes: [] };
    },
    critique: async (_input, signal) => {
      await wait(800, signal);
      return { ok: true, value: critiqueOf(f.candidates), runId: "run_critique", credits: 27 };
    },
    translate: async (input, signal) => {
      await wait(300, signal);
      const lines = WHY[(input.targetLocale ?? "en") as "fr" | "ar" | "en"];
      return { ok: true, value: { variants: [joinWhy(lines)] }, provider: "server", class: "worker", model: null, effort: null, promptVersion: "copy.field@s1", rubricVersion: null, runId: null, jobId: null, usage: null, ms: 300, ttftMs: null, rejected: [], flags: [], notes: [] };
    },
    onStage,
  });
  const pass = useDirectorPass(adapter, { handle: f.handle, policy: policyOf({ director: "auto" }), device: DESKTOP, session: "harness_session_1", revealed: true, settingsHref: null, deps });
  return (
    <DirectorPassProvider value={pass}>
      <RevealFolds
        state="revealed"
        directions={directions}
        dnaSlot={(id) => <DirectorWhy directionId={id} />}
        actionSlot={<DirectorPassControl />}
        onUse={(id) => {
          pass.onUse(id);
          setUsed(id);
        }}
      />
      {used ? <p className="font-mono text-[0.6875rem] text-muted-foreground">used: {used}</p> : null}
    </DirectorPassProvider>
  );
}

/* ------------------------------------------------------------------ */
/* The harness                                                         */
/* ------------------------------------------------------------------ */

export function AiHarness({ fixtures: f }: { fixtures: HarnessFixtures }) {
  const [facts, dispatch] = useReducer(factsReducer, null, () => {
    const s = factsReducer(initialFacts(f.facts), { type: "suggest", facts: f.suggested });
    return s.suggestions[0] ? factsReducer(s, { type: "tick", id: s.suggestions[0].id }) : s;
  });
  const [cta, setCta] = useState(f.rewrite.field.text);
  const set = useMemo(() => doneSet(f), [f]);
  const ready: DirectorSlotView = { k: "ready", mode: "ask", credits: 53, passesLeft: 4 };
  const readyAuto: DirectorSlotView = { k: "ready", mode: "auto", credits: 53, passesLeft: 4 };
  const choice = { intent: "darija", targetLocale: null } as const;
  const busyNote = { from: "server", to: "local", code: "busy" } as const;
  const runningJob: AiJobPoll = { id: "j1", kind: "director_deep", status: "running", stage: "blueprint:1", progress: { done: 1, total: 3 }, heartbeatAt: null, costCredits: 0, createdAt: new Date(T0 - 95_000).toISOString() };

  return (
    <div className="grid min-w-0 gap-5" data-ai-harness="">
      <Section title="Provider chip" note="AI-§K.3: 24 px, hairline while running, a fallback note for 6 s.">
        <Row label="idle · cloud">
          <AiProviderChip state={{ status: "idle", provider: null, notes: [] }} policy={policyOf()} />
        </Row>
        <Row label="running · server">
          <AiProviderChip state={{ status: "running", provider: "server", notes: [] }} />
        </Row>
        <Row label="fallback · busy → local">
          <AiProviderChip state={{ status: "done", provider: "local", notes: [busyNote] }} />
        </Row>
        <Row label="credits out · library">
          <AiProviderChip state={{ status: "done", provider: "library", notes: [{ from: "server", to: "library", code: "quota_store" }] }} />
        </Row>
        <Row label="pending share · library">
          <AiProviderChip state={{ status: "done", provider: "library", notes: [{ from: "server", to: "library", code: "quota_platform_pending" }] }} />
        </Row>
        <Row label="cloud off · library">
          <AiProviderChip state={{ status: "idle", provider: null, notes: [] }} policy={{ ...policyOf({ available: false, block: "platform_off" }), local: { enabled: false, tierMax: "lite", bgRemoval: false } }} />
        </Row>
      </Section>

      <Section title="Streamed reveal" note="Library draft first, then the recorded copy.hero pack field by field; footer count, kept and novelty notes.">
        <StreamedHero f={f} />
      </Section>

      <Section title="Director pass in the reveal" note="RevealFolds with the control in actionSlot and the why line in dnaSlot; scripted stages in auto mode.">
        <LiveDirector f={f} />
      </Section>

      <Section title="Director control states" note="AI-§K.5: every state of the action row.">
        <Row label="ask · idle">
          <DirectorPassControl pass={stillPass(ready, { k: "idle" })} />
        </Row>
        <Row label="auto · idle">
          <DirectorPassControl pass={stillPass(readyAuto, { k: "idle" })} />
        </Row>
        <Row label="running · read">
          <DirectorPassControl pass={stillPass(readyAuto, { k: "running", passId: "p", stage: "read", startedAt: T0 })} />
        </Row>
        <Row label="running · critique">
          <DirectorPassControl pass={stillPass(ready, { k: "running", passId: "p", stage: "critique", startedAt: T0 })} />
        </Row>
        <Row label="running · critique job">
          <DirectorPassControl pass={stillPass(ready, { k: "running", passId: "p", stage: "critique_job", startedAt: T0 })} />
        </Row>
        <Row label="done · refined">
          <DirectorPassControl pass={stillPass(ready, { k: "done", passId: "p", showing: "director", quiet: false }, set)} />
        </Row>
        <Row label="done · undone">
          <DirectorPassControl pass={stillPass(ready, { k: "done", passId: "p", showing: "instant", quiet: false }, set)} />
        </Row>
        <Row label="failed · busy">
          <DirectorPassControl pass={stillPass(ready, { k: "failed", passId: "p", reason: "busy" })} />
        </Row>
        <Row label="failed · credits">
          <DirectorPassControl pass={stillPass(ready, { k: "failed", passId: "p", reason: "credits" })} />
        </Row>
        <Row label="cloud off">
          <DirectorPassControl pass={stillPass(directorSlot(policyOf({ available: false, block: "platform_off", director: "unavailable" })), { k: "idle" })} />
        </Row>
        <Row label="credits out">
          <DirectorPassControl pass={stillPass(directorSlot(policyOf({ available: false, block: "quota_store", director: "unavailable" })), { k: "idle" })} />
        </Row>
        <Row label="passes used up today">
          <DirectorPassControl pass={stillPass(directorSlot(policyOf({ director: "unavailable", directorBlock: "passes_day" })), { k: "idle" })} />
        </Row>
        <Row label="month share spent">
          <DirectorPassControl pass={stillPass(directorSlot(policyOf({ director: "unavailable", directorBlock: "quota_director" })), { k: "idle" })} />
        </Row>
        <Row label="pending store share">
          <DirectorPassControl pass={stillPass(directorSlot(policyOf({ available: false, block: "quota_platform_pending", director: "unavailable" })), { k: "idle" })} />
        </Row>
        <Row label="why line (DNA slot)">
          <div className="max-w-sm rounded-xl bg-background p-3 ring-1 ring-foreground/[0.07]">
            <DirectorWhy directionId="c3" pass={stillPass(ready, { k: "done", passId: "p", showing: "director", quiet: false }, set)} />
          </div>
        </Row>
      </Section>

      <Section title="Suggested facts" note="AI-04: unticked chips from the recorded analyses; one ticked.">
        <SuggestedFacts state={facts} dispatch={dispatch} />
      </Section>

      <Section title="On-device model card" note="AI-03 (1): desktop, tier full, no save-data; never at 390 px.">
        <ModelConsent device={DESKTOP} policy={policyOf()} onDownload={() => undefined} />
      </Section>

      <Section title="Rewrite menu" note="AI-05: the recorded copy.field variants of the darija-serum case.">
        <Row label="live field (focus, Alt+R)">
          <div className="grid max-w-md gap-1.5 pt-8">
            <Label htmlFor="harness-cta">CTA</Label>
            <FieldRewrite
              field={{ ...f.rewrite.field, text: cta }}
              locales={["ar", "fr", "en"]}
              run={async (_input, { signal }) => {
                await wait(500, signal);
                return { ok: true, value: { variants: f.rewrite.variants }, provider: "server", class: "worker", model: null, effort: null, promptVersion: "copy.field@s1", rubricVersion: null, runId: null, jobId: null, usage: null, ms: 500, ttftMs: null, rejected: [], flags: [], notes: [] };
              }}
              onAccept={(text) => setCta(text)}
              onUndo={() => setCta(f.rewrite.field.text)}
            >
              <Textarea id="harness-cta" dir="auto" lang="ar" rows={2} value={cta} onChange={(e) => setCta(e.target.value)} />
            </FieldRewrite>
          </div>
        </Row>
        <Row label="intents">
          <div className="max-w-md rounded-xl p-3.5 ring-1 ring-foreground/[0.08]">
            <RewritePanel phase={{ k: "intents" }} field={f.rewrite.field} locales={["ar", "fr", "en"]} skeleton={false} onPick={() => undefined} onAgain={() => undefined} onBack={() => undefined} onAccept={() => undefined} />
          </div>
        </Row>
        <Row label="writing">
          <div className="max-w-md rounded-xl p-3.5 ring-1 ring-foreground/[0.08]">
            <RewritePanel phase={{ k: "loading", choice }} field={f.rewrite.field} locales={["ar", "fr", "en"]} skeleton onPick={() => undefined} onAgain={() => undefined} onBack={() => undefined} onAccept={() => undefined} />
          </div>
        </Row>
        <Row label="three options">
          <div className="max-w-md rounded-xl p-3.5 ring-1 ring-foreground/[0.08]">
            <RewritePanel phase={{ k: "options", choice, variants: f.rewrite.variants }} field={f.rewrite.field} locales={["ar", "fr", "en"]} skeleton={false} onPick={() => undefined} onAgain={() => undefined} onBack={() => undefined} onAccept={() => undefined} />
          </div>
        </Row>
        <Row label="no honest rewrite">
          <div className="max-w-md rounded-xl p-3.5 ring-1 ring-foreground/[0.08]">
            <RewritePanel phase={{ k: "none", choice }} field={f.rewrite.field} locales={["ar", "fr", "en"]} skeleton={false} onPick={() => undefined} onAgain={() => undefined} onBack={() => undefined} onAccept={() => undefined} />
          </div>
        </Row>
      </Section>

      <Section title="Deep pass job row" note="R2 shell (AI-§K.3): queued, running with its stage plan, batch, failed.">
        <Row label="queued">
          <JobProgress job={{ ...runningJob, status: "queued", stage: null, progress: null }} onCancel={() => undefined} />
        </Row>
        <Row label="running · 1 of 3">
          <JobProgress job={runningJob} onCancel={() => undefined} />
        </Row>
        <Row label="batch">
          <JobProgress job={runningJob} transport="batch" onCancel={() => undefined} />
        </Row>
        <Row label="failed">
          <JobProgress job={{ ...runningJob, status: "failed" }} onCancel={() => undefined} />
        </Row>
      </Section>

      <Section title="Director review" note="R2 shell: renders nothing unless its flag; shown here enabled.">
        <DirectorReview
          enabled
          running={false}
          fixes={[
            { id: "f1", label: "Drop the kicker on Benefits", evidence: "benefits: 3 kickers in 5 sections", noGain: false },
            { id: "f2", label: "Align the offer to the start", evidence: "offer: 3 centred sections in a row", noGain: true },
            { id: "f3", label: "Shorter hero headline", evidence: "hero: 3 lines at 390 px", noGain: false },
          ]}
          onReview={() => undefined}
          onApply={() => undefined}
          onApplyAll={() => undefined}
        />
      </Section>
    </div>
  );
}
