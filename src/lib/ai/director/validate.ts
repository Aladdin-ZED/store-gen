/**
 * The Director's finalize (P7 AI; ai.md AI-§D.1, AI-§D.3 `design.plan` and `design.critique` rows, AI-§A.8.2,
 * AI-§A.8.3, AI-§A.8.9; AI-19 acceptance 1, 2, 5, 6, 7, 11, 12, 13, 14; design.md DES-§4.6, DES-§8.6, DES-§8.9).
 * Pure and isomorphic: every model answer of the plan and critique stages passes here before anyone sees it, and a
 * prompt rule is never the only defence. What the model wrote that breaks a rule is dropped and named (a note for
 * `ai_runs.flags` and the console, or a `rejected` path); the run itself fails only when nothing usable is left
 * (`null` = `invalid_output`, the instant set stays).
 *
 *   finalizePlan       DesignRead enums and texts, dials 1-10, suggested facts (guard rule 7: unticked, ≤ 5 × 80);
 *                      three distinct slots; every hint through design's `validateHints` (its drops become notes),
 *                      explore weights ≤ 2; ≤ 1 pin, a bold gene with a `GENE_VOCAB` value, else `pin_dropped`, a
 *                      second pin `second_pin`; headline structures ≤ 2, distinct across directions; the copy angle
 *                      from design's list; `mustAvoid` from the named patterns, seeded with the niche's crowded
 *                      sequences and tell pairs; the rationale through the guard (≤ 140, no number, no dash).
 *   toSampleOpts       a direction as design's `SampleOpts`: the hints, and the pin as `pins` (hints carry none).
 *   finalizeCritique   the slim shape: scores 0-5 on the rubric keys for the three picks only, a tile-only part
 *                      dropped in a tile-less round (`no_tiles`); every issue cites a card id, section index or tile
 *                      label of the input, and an issue on a D-dimension the digest contradicts is dropped; ≤ 1 issue
 *                      and 0 ops for a non-pick; ≤ 3 ops per pick from `AI_REPAIR_OPS`, typed, targets inside the
 *                      candidate; picks = 3 distinct ids, none with a hard fail (a design hard gate or a budget
 *                      "over"; "estimated" never excludes and is never alone a repair reason), then `adjustPicks`;
 *                      why lines in the primary locale through the guard (≤ 120; lines the model declared in another
 *                      locale are all dropped); distinctness recomputed. A stub digest (`stub: true`) measured nothing
 *                      and contradicts no issue; scores or ops on a candidate the engine (not the critic) left out of
 *                      the pick are dropped without a `non_pick` contradiction.
 *   adjustPicks        picks closer than τ = 0.30: the closer pair's second member is swapped for the best explore
 *                      candidate (`picks_adjusted`).
 *
 * The digest and the cards are the ground truth (AI-§A.8.3): the model's hard-fail list, distances and picked flags
 * are never trusted.
 */
import { GENE_VOCAB, HEADLINE_STRUCTURES, ANGLES, OPENERS, validateHints, type Angle, type GeneKey } from "@/lib/design";
import { allowedNumbersFor, guardText, inVocab } from "../guard";
import { AllowedNumbers, numbersIn } from "../guard-numbers";
import { isRecord, type FinalizeCtx } from "../schema/tasks/types";
import { hardFailsOf } from "./budgets";
import { nicheAvoid } from "./brief";
import {
  BOLD_GENES,
  CritiqueLoose,
  DIRECTOR_LIMITS,
  DIRECTOR_SLOTS,
  DirectorPlanLoose,
  NAMED_PATTERNS,
  NAMED_PATTERN_IDS,
  RUBRIC_KEYS,
  TILE_PARTS,
  type AiRepairOp,
  type BrandLocks,
  type Candidate,
  type CandidateCritique,
  type Critique,
  type CritiqueInput,
  type CritiqueIssue,
  type DesignRead,
  type Dial,
  type DirectionBrief,
  type DirectorBrief,
  type DirectorFinalizeResult,
  type DirectorNote,
  type DirectorPlan,
  type DirectorSlot,
  type GeneHints,
  type GenomeCard,
  type OpLoose,
  type RubricDim,
  type RubricKey,
  type RubricScore,
  type SampleOpts,
} from "./types";

const L = DIRECTOR_LIMITS;
/** a dropped value as a note shows it: ≤ 60 chars, never an object dump */
const shown = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v).slice(0, 60) : "");

/* ================================================================== */
/* The plan                                                            */
/* ================================================================== */

function dialOf(n: number, at: string, rejected: string[]): Dial {
  const d = Math.round(n);
  if (!Number.isFinite(n) || d < 1 || d > 10) rejected.push(at);
  return (Number.isFinite(d) ? Math.min(10, Math.max(1, d)) : 5) as Dial;
}

function finalizeRead(r: DirectorPlanLoose["read"], ctx: FinalizeCtx, allowed: AllowedNumbers, rejected: string[]): DesignRead {
  const text = (v: string, max: number, at: string): string => {
    if (!v.trim()) return "";
    const t = guardText(v, ctx, allowed, max);
    if (!t.ok) rejected.push(at);
    return t.ok ? t.text : "";
  };
  // rule 7: shown unticked, so a number or a material read from the photo may stand; duplicates and extras dropped
  const suggestedFacts: DesignRead["suggestedFacts"] = [];
  const seen = new Set<string>();
  r.suggestedFacts.forEach((f, i) => {
    const t = guardText(f.text, ctx, allowed, L.suggestedFactChars, { numbers: false, claims: false });
    if (!t.ok) return void rejected.push(`read.suggestedFacts.${i}`);
    const key = t.text.toLowerCase();
    if (!seen.has(key) && suggestedFacts.length < L.suggestedFacts) suggestedFacts.push({ text: t.text, from: f.from });
    seen.add(key);
  });
  const risks: string[] = [];
  r.risks.forEach((v, i) => {
    const t = text(v, L.riskChars, `read.risks.${i}`);
    if (t && risks.length < L.risks) risks.push(t);
  });
  const pq = r.photoQuality;
  const advice = pq.advice ? text(pq.advice, L.advice, "read.photoQuality.advice") : "";
  return {
    readLine: text(r.readLine, L.readLine, "read.readLine"),
    audience: text(r.audience, L.audience, "read.audience"),
    priceTier: r.priceTier,
    suggestedFacts,
    photoQuality: { sharp: pq.sharp, clutter: pq.clutter, fullBleedOk: pq.fullBleedOk, cutoutViable: pq.cutoutViable, advice: advice || null },
    dials: { variance: dialOf(r.dials.variance, "read.dials.variance", rejected), motion: dialOf(r.dials.motion, "read.dials.motion", rejected), density: dialOf(r.dials.density, "read.dials.density", rejected) },
    risks,
  };
}

/** A pin is a bold gene with an enumerated `GENE_VOCAB` value (the H-rules, locks and photo facts are design's sampler's). */
function pinOk(gene: string, value: string): gene is (typeof BOLD_GENES)[number] {
  if (!(BOLD_GENES as readonly string[]).includes(gene)) return false;
  const entry = GENE_VOCAB[gene as GeneKey];
  return Boolean(entry?.bold && entry.kind === "enum" && entry.values?.includes(value));
}

/** One mustAvoid entry → a named-pattern id (by id or by its label) or one of the brief's niche entries, else null. */
function patternOf(v: string, niche: ReadonlySet<string>): string | null {
  const s = v.trim().toLowerCase();
  if (niche.has(s)) return s;
  if (s in NAMED_PATTERNS) return s;
  return NAMED_PATTERN_IDS.find((id) => NAMED_PATTERNS[id].toLowerCase() === s.replace(/^["']|["']$/g, "")) ?? null;
}

interface DirectionCtx {
  ctx: FinalizeCtx;
  /** the product name's own numbers: the only numbers a rationale may carry */
  nameOnly: AllowedNumbers;
  niche: string[];
  usedStructures: Set<string>;
  rejected: string[];
  notes: DirectorNote[];
}

function finalizeDirection(d: DirectorPlanLoose["directions"][number], i: number, slot: DirectorSlot, dc: DirectionCtx): DirectionBrief {
  const { ctx, rejected, notes } = dc;
  const at = `directions.${i}`;

  // hints: bounded, grouped by gene, then design's validateHints (the vocabulary is design's); its drops become notes
  const grouped: Record<string, { value: string; weight: 1 | 2 | 3 }[]> = {};
  for (const h of d.hints.slice(0, 40)) {
    const gene = h.gene.trim().slice(0, 24);
    const list = (grouped[gene] ??= []);
    if (list.length >= L.hintValuesPerGene) {
      notes.push({ kind: "hint_dropped", at: `${at}.hints.${gene}`, reason: "count", value: shown(h.value) });
      continue;
    }
    const weight = Math.min(slot === "explore" ? L.exploreHintWeight : 3, Math.max(1, Math.round(Number.isFinite(h.weight) ? h.weight : 1))) as 1 | 2 | 3;
    list.push({ value: h.value.trim().slice(0, 48), weight });
  }
  const checked = validateHints(grouped);
  for (const x of checked.intake.dropped) notes.push({ kind: "hint_dropped", at: `${at}.hints.${x.gene}`, reason: x.why, value: shown(x.value) });
  const hints: GeneHints = {};
  for (const [gene, list] of Object.entries(checked.hints) as [keyof GeneHints, { value: string; weight: 1 | 2 | 3 }[]][]) {
    hints[gene] = list.slice(0, L.hintValuesPerGene).map((e) => ({ value: e.value, weight: slot === "explore" ? (Math.min(e.weight, L.exploreHintWeight) as 1 | 2) : e.weight }));
  }

  // ≤ 1 pin: the first is checked, every further one is a second pin
  let pin: DirectionBrief["pin"];
  d.pins.forEach((p, k) => {
    const gene = p.gene.trim();
    const value = p.value.trim();
    if (k > 0) return void notes.push({ kind: "pin_dropped", at: `${at}.pins.${k}`, reason: "second_pin", value: shown(`${gene}=${value}`) });
    if (pinOk(gene, value)) pin = { gene, value };
    else notes.push({ kind: "pin_dropped", at: `${at}.pins.0`, reason: (BOLD_GENES as readonly string[]).includes(gene) ? "vocab" : "not_bold", value: shown(`${gene}=${value}`) });
  });

  // headline structures: design's list, ≤ 2, never one an earlier direction took
  const headlineStructures: DirectionBrief["headlineStructures"] = [];
  for (const s of d.headlineStructures) {
    if (!inVocab(s, HEADLINE_STRUCTURES)) notes.push({ kind: "vocab_dropped", at: `${at}.headlineStructures`, reason: "structure", value: shown(s) });
    else if (dc.usedStructures.has(s)) notes.push({ kind: "vocab_dropped", at: `${at}.headlineStructures`, reason: "repeat", value: s });
    else if (headlineStructures.length < L.headlineStructures) {
      headlineStructures.push(s);
      dc.usedStructures.add(s);
    }
  }

  const angle = d.copyAngle.trim();
  let copyAngle: Angle = "benefit";
  if (inVocab(angle, ANGLES)) copyAngle = angle;
  else {
    notes.push({ kind: "vocab_dropped", at: `${at}.copyAngle`, reason: "angle", value: shown(angle) });
    rejected.push(`${at}.copyAngle`);
  }

  const mustHave: string[] = [];
  d.mustHave.forEach((v, k) => {
    const t = guardText(v, ctx, dc.nameOnly, L.mustHaveChars);
    if (!t.ok) rejected.push(`${at}.mustHave.${k}`);
    else if (mustHave.length < L.mustHave && !mustHave.includes(t.text)) mustHave.push(t.text);
  });

  // the niche's crowded entries are seeded first (AI-19 acceptance 13); the model's named patterns fill the rest
  const nicheSet = new Set(dc.niche);
  const mustAvoid = dc.niche.slice(0, L.mustAvoid);
  for (const v of d.mustAvoid) {
    const id = patternOf(v, nicheSet);
    if (!id) notes.push({ kind: "vocab_dropped", at: `${at}.mustAvoid`, reason: "pattern", value: shown(v) });
    else if (!mustAvoid.includes(id) && mustAvoid.length < L.mustAvoid) mustAvoid.push(id);
  }

  let rationale = "";
  if (d.rationale.trim()) {
    const t = guardText(d.rationale, ctx, dc.nameOnly, L.rationale);
    if (t.ok) rationale = t.text;
    else rejected.push(`${at}.rationale`);
  }

  return { slot, hints, ...(pin ? { pin } : {}), headlineStructures, copyAngle, mustHave, mustAvoid, rationale };
}

/** `design.plan`'s finalize (see the header). `brief` gives the niche entries every direction must avoid. */
export function finalizePlan(raw: unknown, ctx: FinalizeCtx, brief: Pick<DirectorBrief, "recent">): DirectorFinalizeResult<DirectorPlan> {
  if (!isRecord(raw)) return null;
  const parsed = DirectorPlanLoose.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  // three distinct slots, or no plan: a brief cannot be reassigned to a slot the model did not write it for
  const bySlot = new Map(p.directions.map((d, i) => [d.slot, { d, i }]));
  if (p.directions.length !== 3 || bySlot.size !== 3) return null;

  const rejected: string[] = [];
  const notes: DirectorNote[] = [];
  const read = finalizeRead(p.read, ctx, allowedNumbersFor(ctx), rejected);
  const dc: DirectionCtx = {
    ctx,
    nameOnly: new AllowedNumbers().addText(ctx.productName),
    niche: nicheAvoid(brief.recent.nicheCrowding).map((e) => e.id),
    usedStructures: new Set(),
    rejected,
    notes,
  };
  const directions = DIRECTOR_SLOTS.map((slot) => {
    const { d, i } = bySlot.get(slot)!;
    return finalizeDirection(d, i, slot, dc);
  }) as DirectorPlan["directions"];
  return { value: { read, directions }, rejected: [...new Set(rejected)], notes };
}

/** `finalizePlan` as the task registry's `Finalize<DirectorPlan>` for one brief. */
export const planFinalize =
  (brief: Pick<DirectorBrief, "recent">) =>
  (raw: unknown, ctx: FinalizeCtx): DirectorFinalizeResult<DirectorPlan> =>
    finalizePlan(raw, ctx, brief);

/**
 * A direction as design's sampler options (CRIT2-16): `hints` as validated, the pin as `SampleOpts.pins = { [gene]:
 * value }` (never inside the hints), and the store's brand locks.
 */
export function toSampleOpts(d: Pick<DirectionBrief, "hints" | "pin">, locks?: BrandLocks): SampleOpts {
  return {
    hints: d.hints,
    ...(d.pin ? { pins: { [d.pin.gene]: d.pin.value } } : {}),
    ...(locks && Object.keys(locks).length ? { locks } : {}),
  };
}

/* ================================================================== */
/* Distinctness                                                        */
/* ================================================================== */

export type CardDistance = (a: GenomeCard, b: GenomeCard) => number;

/**
 * The R1 distance between two cards: the share of the seven bold genes that differ (weight 0.7) and of the derived
 * values that differ (0.3), in [0, 1], symmetric, 0 for a card and itself. Cards carry no distance numbers (bands
 * only, DS7), so this is the engine's proxy over what a card states; the wizard passes design's `genomeDistance`
 * over the candidates' views instead when it has them (the `distance` option).
 */
export function cardDistance(a: GenomeCard, b: GenomeCard): number {
  const bold = BOLD_GENES.filter((g) => (a.bold[g] ?? "") !== (b.bold[g] ?? "")).length / BOLD_GENES.length;
  const keys = [...new Set([...Object.keys(a.derived), ...Object.keys(b.derived)])];
  const derived = keys.length ? keys.filter((k) => a.derived[k] !== b.derived[k]).length / keys.length : bold;
  return Math.round((0.7 * bold + 0.3 * derived) * 1000) / 1000;
}

/** The pick pairs in the order `Critique.distinctness` lists them. */
const PAIRS = [
  [0, 1],
  [1, 2],
  [0, 2],
] as const;

export interface AdjustOpts {
  /** default 0.30 (AI-19 acceptance 5) */
  tau?: number;
  /** a candidate that may be picked (no hard fail); default every card */
  eligible?: (id: string) => boolean;
  distance?: CardDistance;
}

/**
 * Picks closer than τ (AI-§A.8.9): the closer pair's second member (in pick order) is replaced by the best explore
 * candidate, the eligible explore card farthest from the two that stay (ties: the higher Q); any eligible card when no
 * explore card is left. Repeated while the closest pair is under τ and a replacement widens it (≤ 3 rounds).
 */
export function adjustPicks(cards: readonly GenomeCard[], picks: readonly [string, string, string], opts: AdjustOpts = {}): { picks: [string, string, string]; adjusted: boolean; distinctness: number[] } {
  const tau = opts.tau ?? L.tau;
  const distance = opts.distance ?? cardDistance;
  const eligible = opts.eligible ?? (() => true);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const cur: [string, string, string] = [...picks];
  const pairs = () => PAIRS.map(([i, j]) => {
    const a = byId.get(cur[i]);
    const b = byId.get(cur[j]);
    return a && b ? distance(a, b) : 0;
  });
  let adjusted = false;
  for (let round = 0; round < 3; round++) {
    const d = pairs();
    const min = Math.min(...d);
    if (min >= tau) break;
    const [, j] = PAIRS[d.indexOf(min)];
    const stay = cur.filter((_, k) => k !== j).map((id) => byId.get(id)!);
    const pool = cards.filter((c) => !cur.includes(c.id) && eligible(c.id));
    const explore = pool.filter((c) => c.slot === "explore");
    let best: GenomeCard | null = null;
    let bestD = -1;
    for (const c of explore.length ? explore : pool) {
      const dc = Math.min(...stay.map((s) => distance(c, s)));
      if (dc > bestD || (dc === bestD && best && c.q > best.q)) {
        best = c;
        bestD = dc;
      }
    }
    if (!best || bestD <= min) break;
    cur[j] = best.id;
    adjusted = true;
  }
  return { picks: cur, adjusted, distinctness: pairs().map((x) => Math.round(x * 1000) / 1000) };
}

/* ================================================================== */
/* The critique                                                        */
/* ================================================================== */

/** The section of a candidate an op names: its id, or its index written as a number. */
function sectionOf(c: Candidate, s: string | null): { id: string; index: number } | null {
  if (!s) return null;
  const v = s.trim();
  const byId = c.digest.sections.findIndex((x) => x.id === v);
  if (byId >= 0) return { id: v, index: byId };
  if (/^\d{1,2}$/.test(v) && Number(v) < c.digest.sections.length) return { id: c.digest.sections[Number(v)].id, index: Number(v) };
  return null;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/i;
const FIELD = /^[a-zA-Z][\w.]{0,39}$/;

/** One loose op → a typed op of the closed subset with targets inside the candidate, or why it is dropped. */
function typedOp(o: OpLoose, c: Candidate): { op: AiRepairOp } | { why: string } {
  const sec = sectionOf(c, o.section);
  const n = c.digest.sections.length;
  switch (o.op) {
    case "swapVariant":
      if (!sec) return { why: "target" };
      if (!o.to || !SLUG.test(o.to)) return { why: "args" };
      if (c.digest.sections[sec.index].variant === o.to) return { why: "noop" };
      return { op: { op: "swapVariant", section: sec.id, to: o.to } };
    case "changeGene": {
      const gene = (o.gene ?? "").trim() as GeneKey;
      const entry = GENE_VOCAB[gene];
      const to = (o.to ?? "").trim();
      if (!entry) return { why: "vocab" };
      if (entry.kind === "enum" && !entry.values?.includes(to)) return { why: "vocab" };
      if (entry.kind === "range") {
        const [min, max] = entry.range ?? [0, -1];
        if (!/^-?\d+(?:\.\d+)?$/.test(to) || Number(to) < min || Number(to) > max) return { why: "vocab" };
      }
      if (entry.kind === "struct") return { why: "vocab" };
      return { op: { op: "changeGene", gene, to } };
    }
    case "rewriteLine": {
      if (!sec) return { why: "target" };
      if (!o.field || !FIELD.test(o.field)) return { why: "args" };
      const structure = o.structure === null ? undefined : inVocab(o.structure, HEADLINE_STRUCTURES) ? o.structure : null;
      if (structure === null) return { why: "vocab" };
      return { op: { op: "rewriteLine", section: sec.id, field: o.field, ...(structure ? { structure } : {}) } };
    }
    case "dropKicker":
      if (!sec) return { why: "target" };
      // the digest says the section has no kicker: an op that changes nothing contradicts it
      if (!c.digest.sections[sec.index].kicker) return { why: "digest" };
      return { op: { op: "dropKicker", section: sec.id } };
    case "setOpener":
      if (!sec) return { why: "target" };
      if (!inVocab(o.to, OPENERS)) return { why: "vocab" };
      if (c.digest.sections[sec.index].opener === o.to) return { why: "noop" };
      return { op: { op: "setOpener", section: sec.id, to: o.to } };
    case "setAlign":
      if (!sec) return { why: "target" };
      if (o.to !== "start" && o.to !== "center") return { why: "args" };
      if (c.digest.sections[sec.index].align === o.to) return { why: "noop" };
      return { op: { op: "setAlign", section: sec.id, to: o.to } };
    case "moveSection": {
      if (!sec) return { why: "target" };
      const to = o.toIndex ?? (o.to !== null && /^\d{1,2}$/.test(o.to) ? Number(o.to) : NaN);
      // the hero stays first and a footer stays last (the only fixed positions, DES N3)
      const last = c.digest.sections[n - 1]?.type === "footer" ? n - 2 : n - 1;
      if (c.digest.sections[sec.index].type === "hero" || sec.index === 0) return { why: "target" };
      if (!Number.isInteger(to) || to < 1 || to > last) return { why: "target" };
      if (to === sec.index) return { why: "noop" };
      return { op: { op: "moveSection", section: sec.id, to } };
    }
    case "trimCopy": {
      if (!sec) return { why: "target" };
      if (!o.field || !FIELD.test(o.field)) return { why: "args" };
      const maxWords = o.maxWords === null ? NaN : Math.round(o.maxWords);
      if (!Number.isFinite(maxWords) || maxWords < 1 || maxWords > 80) return { why: "args" };
      return { op: { op: "trimCopy", section: sec.id, field: o.field, maxWords } };
    }
    case "swapHeroFamily":
      if (!o.to || !SLUG.test(o.to)) return { why: "args" };
      if (o.to === c.digest.hero.family) return { why: "noop" };
      return { op: { op: "swapHeroFamily", to: o.to } };
  }
}

/* ------------------------------------------------------------------ */
/* Digest support: may an issue on this dimension stand?               */
/* ------------------------------------------------------------------ */

/**
 * The deterministic signals of each dimension (AI-§A.8.3 "Source"): the gate ids that report it and the digest counts
 * past their DESIGN v3 budget. A pure-D dimension (R4, R5, R7, R9, R10) with no signal has nothing to criticise: an
 * issue on it contradicts the digest. R2, R6 and R11 are D + tiles: without a signal and without tiles, an issue is a
 * guess about what the critic has not seen (`no_tiles`). R1, R3 and R8 are judged from the cards in every round.
 */
const DIM_SIGNALS: Partial<Record<RubricDim, { gates: RegExp; counts: (c: Candidate) => boolean }>> = {
  R2: { gates: /^(?:V08|V38|S04|S05|S08)$/, counts: (c) => c.digest.counts.centeredRun > 2 || c.digest.counts.zigzagRun > 2 || c.card.composition < 10 },
  R4: { gates: /^(?:K\w*|V03|V10|V36|V37|S01)$/, counts: (c) => c.digest.colour.orangeAdvisory },
  R5: { gates: /^(?:V06|V07|V09|V30|S02|S08|S15|S18)$/, counts: (c) => c.digest.counts.eyebrows > c.digest.counts.eyebrowBudget || c.digest.counts.glass > 2 || c.digest.counts.bento > 1 },
  R6: { gates: /^(?:I\w*|V11|V12|V13|V14|S13)$/, counts: (c) => Object.values(c.digest.counts.photoUses).some((n) => n > 3) },
  R7: { gates: /^(?:V23|V28|S09|S19)$/, counts: (c) => c.digest.counts.reveals > 60 },
  R9: {
    gates: /^(?:V22|V25|V26|V27|V31|V32|D\w*)$/,
    counts: (c) => {
      const cod = c.digest.cod;
      const b = c.digest.budgets;
      return b.C2 === "over" || b.C3 === "over" || b.F1 === "over" || (cod !== null && (!cod.ctaTargetsForm || !cod.offerBeforeCta || !cod.foldOk || !cod.urgencyReal || cod.formScreen > 3));
    },
  },
  R10: { gates: /^N\w*$/, counts: (c) => c.card.distance.niche !== "ok" || c.card.distance.platform !== "ok" || (c.card.distance.own !== "ok" && c.card.distance.own !== "first") },
  R11: { gates: /^(?:V05|V29|S03|T1)$/, counts: () => false },
};
const PURE_D = new Set<RubricDim>(["R4", "R5", "R7", "R9", "R10"]);
const TILE_JUDGED = new Set<RubricDim>(["R2", "R6", "R11"]);

/**
 * null = the issue may stand; else the contradiction's reason. A digest of design's P0 stub (`stub: true`) measured
 * nothing, so its zero counts contradict nothing: only a reference or a tile rule can drop an issue on it.
 */
function digestVerdict(dim: RubricDim, c: Candidate, tilesPresent: boolean): "digest" | "no_tiles" | "estimated" | null {
  const sig = DIM_SIGNALS[dim];
  if (!sig) return null;
  if (c.digest.stub) return null;
  const gates = [...c.digest.gates.hard, ...c.digest.gates.soft, ...c.card.gateFails];
  if (gates.some((g) => sig.gates.test(g)) || sig.counts(c)) return null;
  if (dim === "R9" && Object.values(c.digest.budgets).includes("estimated")) return "estimated";
  if (PURE_D.has(dim)) return "digest";
  if (TILE_JUDGED.has(dim) && !tilesPresent) return "no_tiles";
  return null;
}

/** A count a quote states ("four eyebrows") against the digest's count of the same thing. */
const COUNT_NOUNS: { re: string; count: (c: Candidate) => number }[] = [
  { re: "eyebrows?|kickers?", count: (c) => c.digest.counts.eyebrows },
  { re: "glass", count: (c) => c.digest.counts.glass },
  { re: "bentos?", count: (c) => c.digest.counts.bento },
  { re: "ctas?|buttons?", count: (c) => c.digest.counts.ctas },
  { re: "reveals?", count: (c) => c.digest.counts.reveals },
  { re: "marquees?|strips?", count: (c) => c.digest.counts.marquees },
];
const COUNT_RE = new RegExp(`([\\p{L}\\p{N}]+)\\s+(?:[\\p{L}-]+\\s+)?(${COUNT_NOUNS.map((n) => n.re).join("|")})\\b`, "giu");

function quoteContradicts(quote: string, c: Candidate): boolean {
  for (const m of quote.matchAll(COUNT_RE)) {
    const n = numbersIn(m[1], "en")[0];
    if (!n || n.raw.trim() !== m[1]) continue;
    const noun = COUNT_NOUNS.find((x) => new RegExp(`^(?:${x.re})$`, "i").test(m[2]));
    if (noun && noun.count(c) !== n.value) return true;
  }
  return false;
}

const cleanQuote = (q: string | null): string | undefined => {
  const s = (q ?? "").replace(/[\u0000-\u001f\u007f-\u009f<>]/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, L.quote) : undefined;
};

/* ------------------------------------------------------------------ */
/* finalizeCritique                                                    */
/* ------------------------------------------------------------------ */

/** The gate state order of the fill: slop under the repair line (< 3) first, then by Q. */
const fillRank = (c: Candidate) => (c.digest.gates.slop < 3 ? 0 : 1);

/** `design.critique`'s finalize (see the header). `input` is the validated `CritiqueInput` the model saw. */
export function finalizeCritique(raw: unknown, ctx: FinalizeCtx, input: Pick<CritiqueInput, "brief" | "candidates" | "tilesPresent">, opts: Pick<AdjustOpts, "distance" | "tau"> = {}): DirectorFinalizeResult<Critique> {
  if (!isRecord(raw)) return null;
  const parsed = CritiqueLoose.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const rejected: string[] = [];
  const notes: DirectorNote[] = [];
  const contradiction = (at: string, reason: string, value?: unknown) => notes.push({ kind: "critic_contradiction", at, reason, ...(value !== undefined ? { value: shown(value) } : {}) });

  const cands = input.candidates;
  const byId = new Map(cands.map((c) => [c.card.id, c]));
  const hard = new Map(cands.map((c) => [c.card.id, hardFailsOf(c.digest)]));
  const eligible = (id: string) => byId.has(id) && hard.get(id)!.length === 0;

  // the model's entries, one per known candidate (an unknown id cites a card that does not exist)
  const entries = new Map<string, CritiqueLoose["perCandidate"][number]>();
  for (const e of p.perCandidate) {
    if (!byId.has(e.id)) contradiction(`perCandidate.${shown(e.id)}`, "ref", e.id);
    else if (!entries.has(e.id)) entries.set(e.id, e);
  }

  // picks: the model's list, kept only where it names a distinct eligible candidate; filled from its picked flags,
  // then by the gate state and Q; fewer than three eligible candidates leaves nothing to show
  const picks: string[] = [];
  p.pick.forEach((id, k) => {
    if (eligible(id) && !picks.includes(id) && picks.length < 3) picks.push(id);
    else contradiction(`pick.${k}`, "pick", id);
  });
  const fill = cands
    .filter((c) => eligible(c.card.id) && !picks.includes(c.card.id))
    .sort((a, b) => Number(entries.get(b.card.id)?.picked ?? false) - Number(entries.get(a.card.id)?.picked ?? false) || fillRank(a) - fillRank(b) || b.digest.gates.q - a.digest.gates.q);
  while (picks.length < 3 && fill.length) picks.push(fill.shift()!.card.id);
  if (picks.length < 3) return null;
  const adjusted = adjustPicks(
    cands.map((c) => c.card),
    picks as [string, string, string],
    { eligible, ...opts },
  );
  if (adjusted.adjusted) notes.push({ kind: "picks_adjusted", at: "pick", value: adjusted.picks.join(",") });
  const pick = adjusted.picks;

  const perCandidate: CandidateCritique[] = cands.map((c) => {
    const id = c.card.id;
    const e = entries.get(id);
    const picked = pick.includes(id);
    const at = `perCandidate.${id}`;
    const out: CandidateCritique = { id, picked, scores: {}, hardFails: hard.get(id)!, issues: [], repairs: [] };
    if (!e) return out;
    // what the model itself treated as a pick: scores or ops it wrote for a candidate the ENGINE then left out (a hard
    // fail, picks_adjusted) are dropped without blaming the critic; only its own non-picks can break the slim shape
    const modelPicked = e.picked || p.pick.includes(id);

    // scores: picks only; a tile-only part only with tiles; integers 0-5
    let nonPick = false;
    for (const key of RUBRIC_KEYS) {
      const v = e.scores[key];
      if (v === null || v === undefined) continue;
      if (!picked) {
        nonPick = true;
        continue;
      }
      if ((TILE_PARTS as readonly RubricKey[]).includes(key) && !input.tilesPresent) {
        contradiction(`${at}.scores.${key}`, "no_tiles");
        continue;
      }
      if (!Number.isFinite(v)) continue;
      out.scores[key] = Math.min(5, Math.max(0, Math.round(v))) as RubricScore;
    }

    // issues: an existing reference, no contradiction of the digest; a non-pick keeps one (why it lost)
    const tiles = new Set((c.tiles ?? []).map((t) => t.label));
    e.issues.forEach((iss, k) => {
      const where = `${at}.issues.${k}`;
      const ev = iss.evidence;
      const refs = [ev.card, ev.tile, ev.section].filter((x) => x !== null).length;
      if (refs === 0) return void contradiction(where, "ref");
      if (ev.card !== null && !byId.has(ev.card)) return void contradiction(where, "ref", ev.card);
      if (ev.section !== null && !(Number.isInteger(ev.section) && ev.section >= 0 && ev.section < c.digest.sections.length)) return void contradiction(where, "ref", ev.section);
      if (ev.tile !== null && !tiles.has(ev.tile)) return void contradiction(where, input.tilesPresent ? "ref" : "no_tiles", ev.tile);
      const quote = cleanQuote(ev.quote);
      const reason = quote && quoteContradicts(quote, c) ? "digest" : digestVerdict(iss.dim, c, input.tilesPresent);
      if (reason) return void contradiction(where, reason, iss.dim);
      if (!picked && out.issues.length >= L.issuesPerNonPick) return void (nonPick = true);
      const issue: CritiqueIssue = {
        dim: iss.dim,
        severity: iss.severity,
        evidence: { ...(ev.card !== null ? { card: ev.card } : {}), ...(ev.tile !== null ? { tile: ev.tile } : {}), ...(ev.section !== null ? { section: ev.section } : {}), ...(quote ? { quote } : {}) },
      };
      out.issues.push(issue);
    });

    // ops: none for a non-pick; ≤ 3 typed ops for a pick
    if (!picked) {
      if (e.repairs.length) nonPick = true;
    } else {
      e.repairs.forEach((o, k) => {
        const r = typedOp(o, c);
        if ("why" in r) notes.push({ kind: "op_dropped", at: `${at}.repairs.${k}`, reason: r.why, value: o.op });
        else if (out.repairs.length >= L.opsPerPick) notes.push({ kind: "op_dropped", at: `${at}.repairs.${k}`, reason: "count", value: o.op });
        else out.repairs.push(r.op);
      });
      // an estimated budget is never alone a reason to repair (ENGP-6): ops on a pick with nothing else against it go
      if (out.repairs.length && !out.issues.length && Object.values(c.digest.budgets).includes("estimated")) {
        contradiction(`${at}.repairs`, "estimated");
        out.repairs = [];
      }
    }
    if (nonPick && !modelPicked) contradiction(at, "non_pick");
    return out;
  });

  // why lines: ONE locale (the store's primary), line k for pick k; a line written for a pick that was replaced is
  // gone, and lines declared in another locale are all gone (a French line under an English page reads as a bug; the
  // other locales come from copy.field translate)
  const locale = input.brief.store.locales[0] ?? ctx.locale;
  const lctx: FinalizeCtx = { ...ctx, locale };
  const allowed = allowedNumbersFor(lctx);
  const sameLocale = p.whyLines.locale.trim().toLowerCase().slice(0, 2) === locale;
  if (!sameLocale) rejected.push("whyLines.locale");
  const lines = pick.map((id, k) => {
    const from = p.pick.indexOf(id);
    const line = sameLocale && from >= 0 ? p.whyLines.lines[from] : undefined;
    if (!line?.trim()) {
      rejected.push(`whyLines.${k}`);
      return "";
    }
    const t = guardText(line, lctx, allowed, L.whyLine);
    if (!t.ok) rejected.push(`whyLines.${k}`);
    return t.ok ? t.text : "";
  }) as [string, string, string];

  return {
    value: { perCandidate, pick, whyLines: { locale, lines }, distinctness: adjusted.distinctness },
    rejected: [...new Set(rejected)],
    notes,
  };
}

/** `finalizeCritique` as the task registry's `Finalize<Critique>` for one input. */
export const critiqueFinalize =
  (input: Pick<CritiqueInput, "brief" | "candidates" | "tilesPresent">, opts: Pick<AdjustOpts, "distance" | "tau"> = {}) =>
  (raw: unknown, ctx: FinalizeCtx): DirectorFinalizeResult<Critique> =>
    finalizeCritique(raw, ctx, input, opts);

/** The `ai_runs.flags` a finalize's notes raise (AI-§A.3 `AiFlag`): the console counts the rest by kind. */
export function directorFlags(notes: readonly DirectorNote[]): ("critic_contradiction" | "pin_dropped" | "picks_adjusted")[] {
  const flags = new Set<"critic_contradiction" | "pin_dropped" | "picks_adjusted">();
  for (const n of notes) if (n.kind === "critic_contradiction" || n.kind === "pin_dropped" || n.kind === "picks_adjusted") flags.add(n.kind);
  return [...flags];
}
