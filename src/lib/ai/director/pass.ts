/**
 * The interactive Director pass, pure part (P7 AI; ai.md AI-§A.8.2 stages 0-7, AI-§A.8.8, AI-§K.3 "Director pass",
 * AI-§K.5, AI-19 acceptance 3 and 4; AI-03 (3)). Isomorphic: the hook and the two components of
 * src/components/generate/ai/director-pass.tsx sit on top of it, and test:ai drives it with stub stages.
 *
 *   directorSlot(policy)   what the reveal's action row shows: nothing (flag off, Director off, read-only), a quiet
 *                          blocked line (needs Cloud AI, credits, passes used up today, the month's Director share,
 *                          busy), or the ready control in `ask` (a button with the cost) or `auto` (starts by itself,
 *                          the stage line opens with the same cost).
 *   passReducer            the pass state machine: idle → running (stage by stage) → done (the refined set shown, Undo
 *                          back to the instant set, Redo) or failed (the instant set stays, a quiet chip); "Use this"
 *                          on an instant direction supersedes a running pass; dismissible at every stage; a result
 *                          later than 150 s after the start is ignored (AI-19 (3)).
 *   runDirectorPass        the stages in order: the brief (the wizard's adapter) → `design.plan` → three `copy.hero`
 *                          in parallel → the candidates (the wizard: design's sampler, gates, one `checkNovelty`
 *                          call, the digests) → `design.critique` → the repairs (the wizard: `applyOps` + `runGates`
 *                          judged by `acceptOp`) in parallel with two `copy.field` translations of the why lines →
 *                          the set the wizard presents in place. P7 never samples, gates or applies an op itself.
 *
 * The stage calls are injected (`DirectorPassDeps`), so the browser binds them to the routes
 * (src/lib/ai/router/director-client.ts and `runAiOnce`) and test:ai to stubs. Nothing here blocks the instant
 * directions: they are on screen before a pass starts, and any failure leaves them as they are.
 */
import type { CriticPicks } from "@/lib/db/schema";
import type { Locale } from "@/lib/page/schema";
import type { AiPolicy } from "../policy";
import { COPY_LOCALES, type CopyLocale } from "../prompts";
import type { AiFailCode, AiOutcome } from "../provider/types";
import type { AnalyzeImage } from "../schema/tasks/analyze";
import type { FieldRewriteInput, FieldRewriteOut } from "../schema/tasks/copy-field";
import type { HeroPackInput, HeroPackOut } from "../schema/tasks/copy-hero";
import { criticPicksOf } from "./brief";
import { DIRECTOR_LIMITS, type Candidate, type Critique, type CritiqueInput, type DirectionBrief, type DirectorBrief, type DirectorPlan, type DirectorPlanInput } from "./types";

/* ------------------------------------------------------------------ */
/* Stages and the slot                                                 */
/* ------------------------------------------------------------------ */

/** `progress` stages of a pass (AI-§A.7): `critique_job` = the critique runs as a detached job (< 80 tok/s); verify is R2. */
export const DIRECTOR_STAGES = ["read", "brief", "critique", "critique_job", "repair", "verify", "done"] as const;
export type DirectorStage = (typeof DIRECTOR_STAGES)[number];
/** the steps the stage line counts (R1): Reading the product → Briefing 3 directions → Reviewing 6 candidates → Repairing → Done */
export const STAGE_LINE: readonly DirectorStage[] = ["read", "brief", "critique", "repair", "done"];
/** AI-19 (3): a pass that completes later than this after its start is ignored; the instant set stays */
export const PASS_CAP_MS = 150_000;

/** The step a stage stands at on the stage line (0-based; `critique_job` counts as `critique`). */
export function stageStep(stage: DirectorStage): number {
  const s = stage === "critique_job" ? "critique" : stage === "verify" ? "repair" : stage;
  return Math.max(0, STAGE_LINE.indexOf(s));
}

/** Why the Director slot shows a quiet line instead of the control. */
export type DirectorSlotBlock = "needs_cloud" | "credits" | "pending" | "passes_day" | "quota_director" | "busy";

export type DirectorSlotView = { k: "hidden" } | { k: "blocked"; block: DirectorSlotBlock } | { k: "ready"; mode: "ask" | "auto"; credits: number; passesLeft: number | null };

const HIDDEN: DirectorSlotView = { k: "hidden" };

/**
 * What the Director slot shows for a policy (AI-§K.3, AI-§K.5, AI-19 (4)). Hidden when the flag is off (the Director
 * tasks are not live: the wizard is unchanged), when the store turned the pass off, and read-only (impersonation, a
 * suspended store: AI actions hidden). Without Cloud AI it says so, never a spinner that waits for nothing.
 */
export function directorSlot(policy: AiPolicy | null | undefined): DirectorSlotView {
  if (!policy || !policy.live.includes("design.plan") || !policy.live.includes("design.critique")) return HIDDEN;
  const c = policy.cloud;
  if (c.director === "off") return HIDDEN;
  if (!c.available) {
    switch (c.block) {
      case "state":
        return HIDDEN;
      case "quota_store":
      case "quota_day":
      case "quota_platform":
        return { k: "blocked", block: "credits" };
      case "quota_platform_pending":
        return { k: "blocked", block: "pending" };
      case "paused":
        return { k: "blocked", block: "busy" };
      default:
        return { k: "blocked", block: "needs_cloud" };
    }
  }
  if (c.director === "unavailable") {
    if (c.directorBlock === "passes_day") return { k: "blocked", block: "passes_day" };
    if (c.directorBlock === "quota_director") return { k: "blocked", block: "quota_director" };
    if (c.directorBlock === "class_down") return { k: "blocked", block: "busy" };
    return HIDDEN;
  }
  return { k: "ready", mode: c.director, credits: Math.max(0, Math.round(c.directorPassCredits)), passesLeft: c.directorPassesLeft };
}

/* ------------------------------------------------------------------ */
/* The state machine                                                   */
/* ------------------------------------------------------------------ */

/** Why a pass ended without a set (the quiet chip: busy / timeout → "Cloud AI busy · showing the instant set"). */
export type PassFailReason = "busy" | "timeout" | "credits" | "superseded" | "cancelled";

export type PassState =
  | { k: "idle" }
  | { k: "running"; passId: string; stage: DirectorStage; startedAt: number }
  /** `showing`: which set is on screen (Undo / Redo); `quiet`: the owner dismissed the control, the set stays */
  | { k: "done"; passId: string; showing: "director" | "instant"; quiet: boolean }
  | { k: "failed"; passId: string; reason: "busy" | "timeout" | "credits" }
  /** "Use this" on an instant direction (or a newer pass of the session): the pass is over, nothing is shown */
  | { k: "superseded" }
  | { k: "dismissed" };

export type PassAction =
  | { t: "start"; passId: string; at: number }
  | { t: "stage"; passId: string; stage: DirectorStage }
  | { t: "done"; passId: string; at: number }
  | { t: "fail"; passId: string; reason: PassFailReason }
  | { t: "use_instant" }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "dismiss" }
  | { t: "reset" };

export const PASS_IDLE: PassState = { k: "idle" };

const runningAs = (s: PassState, passId: string): s is Extract<PassState, { k: "running" }> => s.k === "running" && s.passId === passId;

export function passReducer(s: PassState, a: PassAction): PassState {
  switch (a.t) {
    case "start":
      return s.k === "idle" || s.k === "failed" ? { k: "running", passId: a.passId, stage: "read", startedAt: a.at } : s;
    case "stage":
      return runningAs(s, a.passId) && s.stage !== a.stage ? { ...s, stage: a.stage } : s;
    case "done":
      if (!runningAs(s, a.passId)) return s;
      // AI-19 (3): a result past the cap is ignored; the instant set stays
      return a.at - s.startedAt > PASS_CAP_MS ? { k: "failed", passId: a.passId, reason: "timeout" } : { k: "done", passId: a.passId, showing: "director", quiet: false };
    case "fail":
      if (!runningAs(s, a.passId)) return s;
      if (a.reason === "superseded") return { k: "superseded" };
      if (a.reason === "cancelled") return { k: "dismissed" };
      return { k: "failed", passId: a.passId, reason: a.reason };
    case "use_instant":
      return s.k === "idle" || s.k === "running" || s.k === "failed" ? { k: "superseded" } : s;
    case "undo":
      return s.k === "done" && s.showing === "director" ? { ...s, showing: "instant" } : s;
    case "redo":
      return s.k === "done" && s.showing === "instant" ? { ...s, showing: "director" } : s;
    case "dismiss":
      if (s.k === "done") return s.quiet ? s : { ...s, quiet: true };
      return s.k === "dismissed" || s.k === "superseded" ? s : { k: "dismissed" };
    case "reset":
      return s.k === "idle" ? s : PASS_IDLE;
  }
}

/** The quiet reason of a stage's failure (never the refusal category; AI-§K.5). */
export function passFailReason(code: AiFailCode | "pass_superseded"): PassFailReason {
  switch (code) {
    case "pass_superseded":
      return "superseded";
    case "cancelled":
      return "cancelled";
    case "timeout":
      return "timeout";
    case "quota_store":
    case "quota_day":
    case "quota_platform":
    case "quota_platform_pending":
    case "quota_director":
      return "credits";
    default:
      return "busy";
  }
}

/* ------------------------------------------------------------------ */
/* The orchestration                                                   */
/* ------------------------------------------------------------------ */

/** A Director stage route's answer (`/ai/director/{plan,critique}`). */
export type StageAnswer<T> = { ok: true; value: T; runId: string | null; credits: number } | { ok: false; code: AiFailCode | "pass_superseded" };

/** What stage 5 returns: the three picks after the accepted ops, in the critique's pick order. */
export interface RepairOutcome {
  picks: readonly [Candidate, Candidate, Candidate];
  /** per pick id: `acceptOp`'s verdict per op of its `repairs`, in order (absent = not applied) */
  applied: Readonly<Record<string, readonly boolean[]>>;
}

/**
 * What the wizard (P6) implements with design's engine (AI-§A.8.2; README.md beside the component). Every method may
 * throw: the pass then ends as `busy` and the instant set stays.
 */
export interface DirectorEngineAdapter {
  /** stage 0: the brief from the wizard state, the store's settings, memory and the niche's shares (< 300 ms) */
  brief(): DirectorBrief | Promise<DirectorBrief>;
  /** ≤ 3 downsized photos for the plan (≤ 1,024 px, ≤ 400 KB each); none = a brief from the facts alone */
  images?(): readonly AnalyzeImage[] | Promise<readonly AnalyzeImage[]>;
  /** the store's delivery line for the hero packs (null: none is promised) */
  deliveryText?(): string | null;
  /**
   * stages 2-3: per brief `sampleGenome(input, toSampleOpts(direction, locks))` × 4, the gates, the top 2 by the
   * two-signal order (`candidatePlan`), ≤ 12 in one `checkNovelty` call, then the six candidates with their hero copy
   * (`heroPacks[i]` is direction i's, null when its run failed: keep the library's), `renderDigest` and
   * `directorDigest` (the budget verdicts)
   */
  candidates(plan: DirectorPlan, heroPacks: readonly (HeroPackOut | null)[], signal: AbortSignal): Promise<Candidate[]>;
  /** stage 5: design's `applyOps` + `runGates` per pick, each op kept or reverted by `acceptOp` (the one rule) */
  repair(picks: readonly [Candidate, Candidate, Candidate], critique: Critique, signal: AbortSignal): Promise<RepairOutcome>;
  /** replace the three directions in place with the refined set (the reveal's own 180 ms crossfade) */
  present(set: DirectorSet): void;
  /** Undo: the instant set back in place */
  restoreInstant(): void;
}

export interface DirectorPick {
  /** the candidate id: the direction id the reveal shows once the set is presented */
  id: string;
  candidate: Candidate;
  /** the "why this design" line per locale (the primary from the critique, the others from the Worker) */
  why: Partial<Record<Locale, string>>;
}

export interface DirectorSet {
  passId: string;
  picks: readonly [DirectorPick, DirectorPick, DirectorPick];
  /** the locale the critique wrote the why lines in (the store's primary) */
  primary: Locale;
  critique: Critique;
  runIds: { plan: string | null; critique: string | null };
  credits: number;
  /** `page_versions.critic_picks` for the direction the owner keeps (null for an id outside the set) */
  criticPicks(chosen: string): CriticPicks | null;
}

export interface DirectorPassDeps {
  plan(input: DirectorPlanInput, signal: AbortSignal): Promise<StageAnswer<DirectorPlan>>;
  /** `onJob`: the critique became a detached job (the stage line switches to its background copy) */
  critique(input: CritiqueInput, signal: AbortSignal, onJob: () => void): Promise<StageAnswer<Critique>>;
  hero(input: HeroPackInput, signal: AbortSignal): Promise<AiOutcome<HeroPackOut>>;
  translate(input: FieldRewriteInput, signal: AbortSignal): Promise<AiOutcome<FieldRewriteOut>>;
  onStage(stage: DirectorStage): void;
  promptVersions?: Partial<CriticPicks["promptVersions"]>;
}

export type PassResult = { ok: true; set: DirectorSet } | { ok: false; reason: PassFailReason };

const copyLocale = (l: Locale): CopyLocale | null => ((COPY_LOCALES as readonly string[]).includes(l) ? (l as CopyLocale) : null);

/** The store's primary copy locale (the first of its locales the copy tasks write). */
export function primaryCopyLocale(brief: Pick<DirectorBrief, "store">): CopyLocale {
  for (const l of brief.store.locales) {
    const c = copyLocale(l);
    if (c) return c;
  }
  return "fr";
}

/** Stage 2b's input for one direction: the brief's angle and first headline structure steer the pack (AI-02). */
export function heroInputOf(brief: DirectorBrief, d: DirectionBrief, deliveryText: string | null): HeroPackInput {
  return {
    locale: primaryCopyLocale(brief),
    market: brief.store.market,
    product: {
      name: brief.product.name.slice(0, 120),
      category: brief.product.category,
      priceMinor: brief.product.price.minor,
      currency: brief.product.price.currency,
      facts: brief.product.facts.slice(0, 6).map((f) => f.slice(0, 200)),
    },
    deliveryText: deliveryText ? deliveryText.slice(0, 200) : null,
    direction: { slot: d.slot, angle: d.copyAngle, headlineStructure: d.headlineStructures[0] ?? null, mustAvoid: d.mustAvoid.slice(0, 12).map((m) => m.slice(0, 120)) },
  };
}

/** The three why lines as one numbered text, so one `copy.field` call translates them (the markers are figures the translate guard keeps). */
export function joinWhy(lines: readonly string[]): string {
  return lines.map((l, i) => `(${i + 1}) ${l.trim()}`).join(" ");
}

const MARKER = /\(\s*([1-3١-٣])\s*\)/gu;
const markerIndex = (d: string) => ("123".includes(d) ? Number(d) : "١٢٣".indexOf(d) + 1);

/** `joinWhy`'s inverse over a translation: the three lines in order, or null when the markers did not survive. */
export function splitWhy(text: string): [string, string, string] | null {
  const marks = [...text.matchAll(MARKER)];
  if (marks.length !== 3 || marks.some((m, i) => markerIndex(m[1]!) !== i + 1)) return null;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const from = marks[i]!.index! + marks[i]![0].length;
    const to = i < 2 ? marks[i + 1]!.index! : text.length;
    const line = text.slice(from, to).trim();
    if (!line || line.length > DIRECTOR_LIMITS.whyLine) return null;
    out.push(line);
  }
  return out as [string, string, string];
}

/** Stage 4b's input: the three lines of the primary locale into `target` (Worker `low`, guarded, AI-§A.8.2). */
export function translateInputOf(brief: DirectorBrief, from: CopyLocale, target: CopyLocale, lines: readonly string[]): FieldRewriteInput {
  const text = joinWhy(lines);
  return {
    locale: from,
    field: "director.why",
    text,
    max: Math.min(1_200, Math.ceil(text.length * 1.6) + 12),
    intent: "translate",
    targetLocale: target,
    product: { name: brief.product.name.slice(0, 120), facts: brief.product.facts.slice(0, 6).map((f) => f.slice(0, 200)) },
    mustAvoid: [],
  };
}

class PassStop extends Error {
  constructor(readonly reason: PassFailReason) {
    super(reason);
  }
}

/**
 * One interactive pass (AI-§A.8.2 stages 0-5 and 7's set). Resolves `{ ok: false }` on the first stage that fails,
 * on an abort (`cancelled`) and on a superseded stage; the caller's reducer decides what the owner sees.
 */
export async function runDirectorPass(passId: string, adapter: DirectorEngineAdapter, deps: DirectorPassDeps, signal: AbortSignal): Promise<PassResult> {
  const alive = () => {
    if (signal.aborted) throw new PassStop("cancelled");
  };
  const engine = async <T>(f: () => T | Promise<T>): Promise<T> => {
    alive();
    try {
      const v = await f();
      alive();
      return v;
    } catch (e) {
      if (e instanceof PassStop) throw e;
      alive();
      throw new PassStop("busy");
    }
  };
  const stage = async <T>(p: Promise<StageAnswer<T>>): Promise<{ value: T; runId: string | null; credits: number }> => {
    const a = await p;
    alive();
    if (!a.ok) throw new PassStop(passFailReason(a.code));
    return a;
  };
  try {
    deps.onStage("read");
    const brief = await engine(() => adapter.brief());
    const images = await engine(async () => [...((await adapter.images?.()) ?? [])].slice(0, DIRECTOR_LIMITS.photos));
    const plan = await stage(deps.plan({ brief, images }, signal));

    deps.onStage("brief");
    const delivery = adapter.deliveryText?.() ?? null;
    const heroes = await Promise.all(
      plan.value.directions.map((d) =>
        deps.hero(heroInputOf(brief, d, delivery), signal).then(
          (o) => (o.ok ? o.value : null),
          () => null,
        ),
      ),
    );
    alive();
    const candidates = (await engine(() => adapter.candidates(plan.value, heroes, signal))).slice(0, DIRECTOR_LIMITS.candidates);
    if (candidates.length < 3) throw new PassStop("busy");

    deps.onStage("critique");
    const critique = await stage(deps.critique({ brief, plan: plan.value, candidates, round: 1, tilesPresent: false }, signal, () => deps.onStage("critique_job")));
    const byId = new Map(candidates.map((c) => [c.card.id, c]));
    const picked = critique.value.pick.map((id) => byId.get(id));
    if (picked.some((c) => !c)) throw new PassStop("busy");

    deps.onStage("repair");
    const primary = critique.value.whyLines.locale;
    const from = copyLocale(primary) ?? primaryCopyLocale(brief);
    const targets = brief.store.locales.map(copyLocale).filter((l): l is CopyLocale => l !== null && l !== from);
    const uniqueTargets = [...new Set(targets)].slice(0, 2);
    const [repaired, translations] = await Promise.all([
      engine(() => adapter.repair(picked as [Candidate, Candidate, Candidate], critique.value, signal)),
      Promise.all(
        uniqueTargets.map((target) =>
          deps.translate(translateInputOf(brief, from, target, critique.value.whyLines.lines), signal).then(
            (o) => ({ target, lines: o.ok ? (o.value.variants.map(splitWhy).find((v) => v !== null) ?? null) : null }),
            () => ({ target, lines: null }),
          ),
        ),
      ),
    ]);
    alive();
    const repairedById = new Map(repaired.picks.map((c) => [c.card.id, c]));
    const picks = critique.value.pick.map((id, i) => {
      const why: Partial<Record<Locale, string>> = { [primary]: critique.value.whyLines.lines[i] };
      for (const t of translations) if (t.lines) why[t.target] = t.lines[i];
      return { id, candidate: repairedById.get(id) ?? byId.get(id)!, why };
    }) as unknown as [DirectorPick, DirectorPick, DirectorPick];
    const critiqueRunId = critique.runId ?? "";
    const set: DirectorSet = {
      passId,
      picks,
      primary,
      critique: critique.value,
      runIds: { plan: plan.runId, critique: critique.runId },
      credits: plan.credits + critique.credits,
      criticPicks: (chosen) =>
        picks.some((p) => p.id === chosen)
          ? criticPicksOf({
              critique: critique.value,
              candidates,
              chosen,
              source: "director",
              round: 1,
              promptVersions: { plan: null, critique: null, verify: null, hero: null, ...deps.promptVersions },
              critiqueRunId,
              applied: repaired.applied[chosen],
            })
          : null,
    };
    deps.onStage("done");
    return { ok: true, set };
  } catch (e) {
    if (e instanceof PassStop) return { ok: false, reason: e.reason };
    return { ok: false, reason: signal.aborted ? "cancelled" : "busy" };
  }
}

/** A pass id the stage routes accept (`[A-Za-z0-9_-]{8,64}`). */
export function newPassId(random: () => number = Math.random): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "dp_";
  for (let i = 0; i < 14; i++) s += abc[Math.floor(random() * abc.length)];
  return s;
}
