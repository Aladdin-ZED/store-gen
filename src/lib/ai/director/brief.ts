/**
 * Brief, candidate and provenance helpers of the Director pass (P7 AI; ai.md AI-§A.8.2 stages 0, 2 and 7, AI-§P,
 * AI-§M.1 `CriticPicks`; AI-19 acceptance 12, 13; design.md DES-§7.4, DES-§8.9). Pure and isomorphic: the wizard
 * (P6) builds the brief and runs stage 2 with design's engine in the browser, and calls these to keep the bounds and
 * the order the spec fixes. P7 never samples, gates or measures a distance itself: those arrive as numbers or
 * callbacks from design.
 *
 *   boundBrief       stage 0's bounds: ≤ 3 photos (`hasCutout: "estimated"` passed through), the store's last 10 genome
 *                    cards, ≤ 20 memory items, ≤ 6 facts; `noOrange` is always true.
 *   nicheAvoid       the niche's crowded 4-section sequences and tell pairs at ≥ 30 % share, as `mustAvoid` entries
 *                    every direction carries (seeded by finalizePlan, listed by the plan prompt).
 *   candidatePlan    stage 2: 4 sampled per brief, the top 2 by the two-signal order (no hard item → distance from the
 *                    store's recent pages and the siblings already kept → Q as the tie-breaker; QUAL-9, QUAL-25).
 *   noveltyBatches   ≤ 12 candidates per `checkNovelty` call (one call per pass; the service takes ≤ 16).
 *   criticPicksOf    `page_versions.critic_picks` / `ai_jobs.result.critique`: ids, scores and op names, ≤ 2 KB,
 *                    never page text.
 */
import type { CriticPicks } from "@/lib/db/schema";
import { DIRECTOR_LIMITS, RUBRIC_KEYS, type Band, type BriefPhoto, type Candidate, type Critique, type DirectorBrief, type NicheShares } from "./types";

/* ------------------------------------------------------------------ */
/* Stage 0                                                             */
/* ------------------------------------------------------------------ */

/** ≤ 3 photos, one per asset; `hasCutout` passes through as the wizard measured it ("estimated" included, UX-39). */
export function briefPhotos(photos: readonly BriefPhoto[]): BriefPhoto[] {
  const seen = new Set<string>();
  return photos.filter((p) => !seen.has(p.assetId) && seen.add(p.assetId)).slice(0, DIRECTOR_LIMITS.photos);
}

/** The brief within its bounds (AI-§A.8.2 stage 0, AI-§P): the caller passes the store's cards newest first. */
export function boundBrief(b: DirectorBrief): DirectorBrief {
  return {
    ...b,
    store: { ...b.store, memory: b.store.memory.slice(0, DIRECTOR_LIMITS.memory) },
    product: { ...b.product, facts: b.product.facts.slice(0, DIRECTOR_LIMITS.facts).map((f) => f.slice(0, 200)) },
    photos: briefPhotos(b.photos),
    constraints: { ...b.constraints, noOrange: true },
    recent: { ...b.recent, storeGenomeCards: b.recent.storeGenomeCards.slice(0, DIRECTOR_LIMITS.recentCards) },
  };
}

/** A niche entry a direction must avoid: what the niche already repeats on ≥ 30 % of its pages. */
export interface NicheAvoid {
  /** `seq4:<t1>.<t2>.<t3>.<t4>` (design's sequence token ids) or `tell:<device>+<device>`, lowercase */
  id: string;
  kind: "seq4" | "tell";
  /** what the plan prompt prints ("hero → proof → offer → faq on 40 % of pages") */
  label: string;
  /** 0-1, rounded to 10 % by design */
  share: number;
}

/** The share from which a niche pattern seeds every brief's `mustAvoid` (AI-19 acceptance 13). */
export const NICHE_AVOID_SHARE = 0.3;

/**
 * The niche's crowded `seq4` and `tells` entries at ≥ 30 % share, most crowded first (DES-§7.4: k ≥ 10 stores, shares
 * only, D64). `tokenName` resolves a sequence token to "type:variant" when the caller has design's token table; without
 * it the label names the token ids.
 */
export function nicheAvoid(shares: NicheShares, opts: { tokenName?: (token: number) => string | null } = {}): NicheAvoid[] {
  const pct = (s: number) => `${Math.round(s * 100)} %`;
  const out: NicheAvoid[] = [];
  for (const e of shares.seq4) {
    if (!(e.share >= NICHE_AVOID_SHARE) || e.gram.length !== 4 || !e.gram.every(Number.isInteger)) continue;
    const names = e.gram.map((t) => opts.tokenName?.(t) ?? `#${t}`);
    out.push({ id: `seq4:${e.gram.join(".")}`, kind: "seq4", label: `the section order ${names.join(" → ")} (niche: ${pct(e.share)} of pages)`, share: e.share });
  }
  for (const e of shares.tells) {
    if (!(e.share >= NICHE_AVOID_SHARE)) continue;
    // ≤ 28 chars a device, so the id fits `DirectionBrief.mustAvoid`'s 64
    const pair = [...e.pair].map((x) => x.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 28)).sort();
    out.push({ id: `tell:${pair.join("+")}`, kind: "tell", label: `${pair.join(" with ")} on one page (niche: ${pct(e.share)} of pages)`, share: e.share });
  }
  return out.sort((a, b) => b.share - a.share || (a.id < b.id ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* Stage 2                                                             */
/* ------------------------------------------------------------------ */

/** Stage 2's numbers (AI-§P, DES-§8.9): 3 briefs × 4 samples = 12 per `checkNovelty` call, 2 kept per brief = 6. */
export const CANDIDATE_PLAN = { briefs: 3, samplesPerBrief: 4, keepPerBrief: 2, noveltyPerCall: 12 } as const;

/** One sampled candidate as the engine scored it: gate state and Q from `runGates`, bands from `checkNovelty`. */
export interface SampledCandidate {
  key: string;
  brief: 0 | 1 | 2;
  /** design hard gate ids and budget rows "over" */
  hard: readonly string[];
  slop: number;
  q: number;
  bands?: { own: Band | "first"; niche: Band; platform: Band };
}

/** ≤ 12 per call (one call covers a pass); a longer list is split, never sent whole. */
export function noveltyBatches<T>(cands: readonly T[], size: number = CANDIDATE_PLAN.noveltyPerCall): T[][] {
  const n = Math.max(1, Math.min(size, CANDIDATE_PLAN.noveltyPerCall));
  const out: T[][] = [];
  for (let i = 0; i < cands.length; i += n) out.push(cands.slice(i, i + n));
  return out;
}

/** The gate state of the first key: clean (no hard item, no band too close, slop under the repair line 3), soft, failing. */
function gateRank(c: SampledCandidate): number {
  const tooClose = c.bands ? [c.bands.own, c.bands.niche, c.bands.platform].includes("too_close") : false;
  if (c.hard.length || tooClose) return 2;
  return c.slop < 3 ? 0 : 1;
}

export interface CandidatePlanOpts {
  /** design's genome distance between two sampled candidates (0-1) */
  distance: (a: string, b: string) => number;
  /** the candidate's distance to the nearest of the store's last 10 genomes; absent = the store's first page */
  recentDistance?: (key: string) => number;
}

/**
 * Stage 2's selection: per brief, ≤ 4 samples, the top 2 by (1) the gate state, (2) the maximin distance from the
 * store's recent genomes and from every candidate already kept (all briefs, in brief order), (3) Q. Q alone saturates
 * near 100 for any compliant page and cannot order candidates (QUAL-9), so it only breaks ties.
 */
export function candidatePlan(sampled: readonly SampledCandidate[], opts: CandidatePlanOpts): { perBrief: string[][]; kept: string[] } {
  const kept: string[] = [];
  const perBrief: string[][] = [];
  for (let b = 0; b < CANDIDATE_PLAN.briefs; b++) {
    const pool = sampled.filter((c) => c.brief === b).slice(0, CANDIDATE_PLAN.samplesPerBrief);
    const mine: string[] = [];
    while (mine.length < CANDIDATE_PLAN.keepPerBrief) {
      const left = pool.filter((c) => !mine.includes(c.key));
      if (!left.length) break;
      const spread = (c: SampledCandidate) => Math.min(opts.recentDistance?.(c.key) ?? 1, ...kept.map((k) => opts.distance(c.key, k)));
      const best = left.reduce((a, c) => {
        const d = gateRank(c) - gateRank(a) || spread(a) - spread(c) || a.q - c.q;
        return d < 0 ? c : a;
      });
      mine.push(best.key);
      kept.push(best.key);
    }
    perBrief.push(mine);
  }
  return { perBrief, kept };
}

/* ------------------------------------------------------------------ */
/* Stage 7: the provenance row                                         */
/* ------------------------------------------------------------------ */

/** `CriticPicks` is ≤ 2 KB (AI-§M.1). */
export const CRITIC_PICKS_MAX_BYTES = 2048;

export interface CriticPicksArgs {
  critique: Critique;
  candidates: readonly Candidate[];
  /** the candidate the owner kept */
  chosen: string;
  source: CriticPicks["source"];
  round: CriticPicks["round"];
  promptVersions: CriticPicks["promptVersions"];
  critiqueRunId: string;
  /** stage 5's verdict per op of the chosen candidate's `repairs`, in order (absent = not applied) */
  applied?: readonly boolean[];
}

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/**
 * The provenance row of a Director pass: candidate ids, the chosen candidate's rubric scores, its ops by name with
 * the section index and stage 5's verdict, the distinctness, the run id. No text from the page or the model reaches
 * it. Bounded at 2 KB: the ops go first, then the scores, if a row would pass it.
 */
export function criticPicksOf(a: CriticPicksArgs): CriticPicks {
  const id = (s: string) => s.slice(0, 64);
  const cand = a.candidates.find((c) => c.card.id === a.chosen);
  const mine = a.critique.perCandidate.find((p) => p.id === a.chosen);
  const sectionIdx = (op: { section?: string }) => {
    const i = op.section === undefined || !cand ? -1 : cand.digest.sections.findIndex((s) => s.id === op.section);
    return i >= 0 ? { section: i } : {};
  };
  const scores: Record<string, number> = {};
  for (const k of RUBRIC_KEYS) if (mine?.scores[k] !== undefined) scores[k] = mine.scores[k]!;
  const row: CriticPicks = {
    v: 1,
    source: a.source,
    promptVersions: {
      plan: a.promptVersions.plan?.slice(0, 32) ?? null,
      critique: a.promptVersions.critique?.slice(0, 32) ?? null,
      verify: a.promptVersions.verify?.slice(0, 32) ?? null,
      hero: a.promptVersions.hero?.slice(0, 32) ?? null,
    },
    rubricVersion: "v3",
    slot: cand?.card.slot ?? "best_fit",
    round: a.round,
    picks: a.critique.pick.map(id),
    chosen: id(a.chosen),
    scores,
    repairs: (mine?.repairs ?? []).map((op, k) => ({ op: op.op, ...sectionIdx(op as { section?: string }), applied: a.applied?.[k] === true })),
    distinctness: a.critique.distinctness.map((d) => Math.round(d * 1000) / 1000),
    critiqueRunId: a.critiqueRunId.slice(0, 40),
  };
  if (bytes(row) > CRITIC_PICKS_MAX_BYTES) row.repairs = [];
  if (bytes(row) > CRITIC_PICKS_MAX_BYTES) row.scores = {};
  return row;
}
