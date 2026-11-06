/**
 * The generation pipeline of the wizard and the onboarding reveal (P6 DESIGN; design.md DES-§14.2 steps 1-9,
 * DES-§14.1, DES-§14.6, DES-§7.4, DES-§9.8, DS26; core D59). Pure TypeScript with the server round trips passed in, so
 * the wizard, P2's welcome step (through `buildRevealDirections`) and test:design run the same code:
 *
 *   1. `inputHash` = sha256(sorted asset ids, product name, category, locale) with WebCrypto;
 *   2-3. the direction draw and every direction's attempts (`directionCandidates`: sample, compile, plan, build, the
 *      budget estimate, pairwise d ≥ 0.25), seeded by the brand seed and the input hash (never Math.random);
 *   4. one `checkNovelty` batch (≤ 16 candidates' packed views, bands back); slower than 3 s or failed = no words;
 *   5. the keep rule: a pick with every band `ok` stays; otherwise one re-sample round (the pick refused, the explore
 *      attempts) and the best worst band that is not `too_close`; a `too_close` candidate is never shown, and when the
 *      niche alone stays `too_close` the exhaustion path shows the candidate that clears the platform band with the
 *      niche note and the three differentiators;
 *   7. the headline check of the composed titles and leads (≤ 60 lines): a `close` line is recomposed with another
 *      skeleton (≤ 3), then the name-led neutral skeleton, then the library line;
 *   6. `repairDoc` (3 rounds) per document and the budget estimate again (after the copy is final, so the gates read
 *      the lines that ship);
 *   then each direction's view: chips, the why line, the novelty bands, Q, the gate summary and its GenomeCard.
 *
 * Nothing here downloads a model or waits for Cloud AI (D59): the Director's hints (GH-1) arrive as an input of a
 * second run. Failures degrade and never block.
 */
import type { MessageKey } from "@/lib/tenancy/types";
import { budgetBreach } from "@/lib/design/budget-estimate";
import { applyCopyGenes, copyGeneTagsOf, originsOf, validCopyGenes, type CopyGeneTags } from "@/lib/design/copy-genes";
import { genomeOf } from "@/lib/design/derive";
import { genomeCard, type GenomeCard } from "@/lib/design/digest";
import { distanceView, genomeDistance, packView, type DistanceView } from "@/lib/design/distance";
import { explainGenome, type GenomeChip } from "@/lib/design/explain";
import { gateInputFor } from "@/lib/design/gate-input";
import { repairDoc } from "@/lib/design/gates/repair";
import { runGates, summarize } from "@/lib/design/gates/run";
import type { AssetMeta, GateReport } from "@/lib/design/gates/types";
import type { GeneHints } from "@/lib/design/hints";
import type { BoldGene, DesignGenome } from "@/lib/design/genome";
import type { NoveltyVerdict } from "@/lib/design/novelty.server";
import type { GateSummary, NoveltyBands } from "@/lib/design/types";
import {
  buildDirectionWithGenome,
  directionCandidates,
  directionOf,
  DIRECTION_MIN_D,
  inputHashOf,
  type CandidateOpts,
  type Direction,
  type DirectionCandidate,
  type DirectionEntry,
  type GenerateInput,
} from "@/lib/generator/directions";
import type { Locale, PageDoc } from "@/lib/page/schema";
import { buildTheme } from "@/lib/theme";

/** The progress line's real step (DES-§14.3 states): photos, type, uniqueness. */
export type PipelineStep = "photos" | "type" | "unique";

export interface PipelineDeps {
  /** `checkNoveltyAction` (null = failed) */
  novelty?: (candidates: { key: string; vec: number[] }[]) => Promise<readonly NoveltyVerdict[] | null>;
  /** `checkHeadlinesAction` (null = failed): one verdict per text, in order */
  headlines?: (texts: string[]) => Promise<readonly { verdict: "ok" | "close" }[] | null>;
  onStep?: (step: PipelineStep) => void;
  /** a server call slower than this shows no words (DES-§14.2: 3 s) */
  timeoutMs?: number;
  /** verdicts already known by candidate key (the draft's cache: a reload asks nothing twice) */
  known?: ReadonlyMap<string, NoveltyVerdict>;
  /** GH-1: the Director's validated hints (weight ≤ 2) and at most one pin, for directions 1 and 2 */
  director?: { hints: GeneHints; pins?: Partial<Record<BoldGene, string>> } | null;
  /** the wizard's own products / offers / look, applied to each built document before the repairs */
  finish?: (d: Direction) => Direction;
  /** the copy lines the on-device model wrote (origin "local"), when AI copy is merged */
  aiLines?: readonly string[];
  /** the reader's locale for the chips and the why line (the admin's, not the page's) */
  uiLocale?: Locale;
}

/** DES-§14.1 DirectionView, with the document it shows. */
export interface PipelineDirection extends Direction {
  key: string;
  /** the genome the server reads back from the doc (genomeOf + the copy genes): the row's genome and its view */
  dna: DesignGenome;
  view: DistanceView | null;
  /** the packed view (`packView`), the row's vector */
  vec: number[] | null;
  /** null: the check was unavailable (no words, the quiet line) */
  bands: NoveltyBands | null;
  /** the niche is full for this product (DES-§7.9 step 4): the niche note and the three differentiators */
  exhausted: boolean;
  report: GateReport;
  summary: GateSummary;
  q: number;
  chips: GenomeChip[];
  why: { key: MessageKey; vars: Record<string, string> };
  /** re-sampled with the Director's hints */
  hinted: boolean;
  card: GenomeCard;
  /** the copy-gene tags of the composed titles (validated again on the server) */
  copyGenes: CopyGeneTags;
  /** the composed lines as shown (the origins of `report.gen`) */
  engineLines: string[];
}

export interface PipelineResult {
  directions: PipelineDirection[];
  novelty: "checked" | "unavailable" | "skipped";
  verdicts: Map<string, NoveltyVerdict>;
  inputHash: string;
  /** candidates checked (≤ 16 per call) */
  candidates: number;
  ms: { candidates: number; novelty: number; headlines: number; repair: number; total: number };
}

const NOVELTY_MAX = 16;
/** the photo-led pins, in order: the product stage, a dark page, the specimen sheet */
const PHOTO_PINS: readonly NonNullable<NonNullable<CandidateOpts["photoPin"]>["pins"]>[] = [{ G2: "stage" }, { G9: "dark-luxe" }, { G2: "specimen" }];
const photoLed = (g: DesignGenome | null | undefined) => !!g && (g.page.G2 === "stage" || g.page.G2 === "specimen" || g.brand.G9 === "dark-luxe");
const HEADLINES_MAX = 60;
const SLOTS: readonly GenomeCard["slot"][] = ["best_fit", "contrast", "explore"];

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** A promise's value, or null when it fails or takes longer than `ms`. */
export async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.catch(() => null), new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** DES-§14.2 step 1: sha256(sorted asset ids, name, category, locale), hex (FNV-32 where WebCrypto is unavailable). */
export async function inputHash(input: Pick<GenerateInput, "product" | "locale">): Promise<string> {
  const p = (input.product ?? {}) as { name?: string; category?: string; images?: { id: string }[]; cutout?: { id: string } };
  const ids = [...(p.images ?? []).map((i) => i.id), ...(p.cutout ? [p.cutout.id] : [])].sort();
  const text = [ids.join(","), p.name ?? "", p.category ?? "", input.locale].join("|");
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (!subtle) return inputHashOf(input);
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const bandRank = (b: string) => (b === "ok" || b === "first" ? 0 : b === "close" ? 1 : 2);
/** 0 every band ok, 1 the worst is close, 2 a band is too close or a clone */
export const worstBand = (v: NoveltyVerdict | null | undefined) => (!v ? 0 : v.clone ? 2 : Math.max(bandRank(v.platform), bandRank(v.niche), bandRank(v.own)));
/** the niche alone is too close (the exhaustion path is open) */
const nicheOnly = (v: NoveltyVerdict) => !v.clone && bandRank(v.platform) < 2 && bandRank(v.own) < 2 && v.niche === "too_close";

/** At most one pin and every hint at weight ≤ 2 (DES-§14.6). */
function directorOpts(d: NonNullable<PipelineDeps["director"]>): { hints: GeneHints; pins?: Partial<Record<BoldGene, string>> } {
  const hints: GeneHints = {};
  for (const [gene, list] of Object.entries(d.hints) as [keyof GeneHints, { value: string; weight: 1 | 2 | 3 }[]][]) hints[gene] = list.map((h) => ({ value: h.value, weight: Math.min(2, h.weight) as 1 | 2 }));
  const pin = Object.entries(d.pins ?? {})[0];
  return { hints, ...(pin ? { pins: { [pin[0]]: pin[1] } as Partial<Record<BoldGene, string>> } : {}) };
}

interface Kept {
  entry: DirectionEntry;
  c: DirectionCandidate;
  exhausted: boolean;
}

/**
 * The whole path from "Generate" to three checked, repaired directions (DES-§14.2 steps 1-9). Throws only what the
 * generator throws for an incomplete product (GeneratorError); every server step degrades.
 */
export async function runDesignPipeline(base: GenerateInput, deps: PipelineDeps = {}): Promise<PipelineResult> {
  const t0 = now();
  const timeout = deps.timeoutMs ?? 3000;
  deps.onStep?.("photos");
  const hash = base.inputHash ?? (await inputHash(base));
  const input: GenerateInput = { ...base, inputHash: hash };
  const director = deps.director ? directorOpts(deps.director) : null;
  // GH-1: directions 1 and 2 sample with the hints and the pin, direction 3 keeps exploring
  const sampleWith = director ? { hinted: { ...director, directions: [0, 1] as const } } : {};

  deps.onStep?.("type");
  let photoPin: CandidateOpts["photoPin"];
  const run = (refused: ReadonlySet<string>, explore: boolean) => directionCandidates(input, { refused, explore, budget: true, ...sampleWith, ...(photoPin ? { photoPin } : {}) });
  let first = run(new Set(), false);
  // a cut-out product (real or estimated) gets at least one photo-led direction: the explore slot is pinned to the
  // product stage, then a dark page, then the specimen sheet, until one draws (DES-§14.8 0:50 row)
  const product0 = (input.product ?? {}) as { cutout?: unknown };
  if ((input.photoFacts ? input.photoFacts.hasCutout !== false : !!product0.cutout) && !first.some((e) => photoLed(e.pick.built.genome))) {
    for (const pins of PHOTO_PINS) {
      photoPin = { pins, direction: 2 };
      const next = run(new Set(), false);
      if (photoLed(next[2]?.pick.built.genome ?? null)) {
        first = next;
        break;
      }
      photoPin = undefined;
    }
  }
  const tCand = now();

  // 4. one batched verdict
  const verdicts = new Map<string, NoveltyVerdict>(deps.known ?? []);
  let novelty: PipelineResult["novelty"] = deps.novelty ? "checked" : "skipped";
  let checked = 0;
  const check = async (entries: readonly DirectionEntry[]) => {
    if (!deps.novelty || novelty !== "checked") return;
    const todo = entries.flatMap((e) => e.candidates).filter((c) => c.view && !verdicts.has(c.key)).slice(0, NOVELTY_MAX);
    if (!todo.length) return;
    deps.onStep?.("unique");
    const got = await withTimeout(deps.novelty(todo.map((c) => ({ key: c.key, vec: packView(c.view!) }))), timeout);
    if (!got) {
      novelty = "unavailable";
      return;
    }
    checked += todo.length;
    for (const v of got) verdicts.set(v.key, v);
  };
  await check(first);
  const verdictOf = (c: DirectionCandidate) => (novelty === "checked" ? (verdicts.get(c.key) ?? null) : null);

  // 5. the keep rule: one re-sample round when a pick is not every-band ok
  let kept: Kept[] = first.map((entry) => ({ entry, c: entry.pick, exhausted: false }));
  if (novelty === "checked" && first.some((e) => worstBand(verdictOf(e.pick)) > 0)) {
    const refused = new Set<string>();
    for (const e of first) if (worstBand(verdictOf(e.pick)) > 0) refused.add(e.pick.key);
    for (const [k, v] of verdicts) if (worstBand(v) === 2) refused.add(k);
    const second = run(refused, true);
    await check(second);
    kept = second.map((entry, i) => {
      const a = entry.pick;
      const b = first[i]?.archetype === entry.archetype ? first[i]!.pick : null;
      // the best worst band that is not too close; on a tie the re-sample (it was planned against these siblings)
      const ra = a.view ? worstBand(verdictOf(a)) : 3;
      const rb = b?.view ? worstBand(verdictOf(b)) : 3;
      return { entry, c: b && rb < ra ? b : a, exhausted: false };
    });
    // the earlier pick was planned against other siblings: pairwise d ≥ 0.25 stays hard (DES-§14.2 step 3)
    kept = kept.map((k, i) => {
      if (k.c === k.entry.pick || !k.c.view) return k;
      const others = kept.filter((_, j) => j !== i).map((o) => o.c.view).filter((v): v is DistanceView => !!v);
      return others.every((v) => genomeDistance(v, k.c.view!) >= DIRECTION_MIN_D) ? k : { ...k, c: k.entry.pick };
    });
    // still too close: the exhaustion path (niche only), else the direction never shows the refused candidate
    kept = kept.map((k, i) => {
      const v = verdictOf(k.c);
      if (!v || worstBand(v) < 2) return k;
      const others = kept.filter((_, j) => j !== i).map((o) => o.c.view).filter((x): x is DistanceView => !!x);
      const pool = [...(first[i]?.candidates ?? []), ...k.entry.candidates].filter((c) => c.view && c.archetype === k.entry.archetype && verdictOf(c) && nicheOnly(verdictOf(c)!));
      const dmin = (c: DirectionCandidate) => (others.length ? Math.min(...others.map((o) => genomeDistance(o, c.view!))) : 1);
      const best = pool.filter((c) => dmin(c) >= DIRECTION_MIN_D).sort((x, y) => dmin(y) - dmin(x))[0];
      if (best) return { entry: k.entry, c: best, exhausted: true };
      // platform or clone: the archetype's plan without a look (no candidate of this direction is shown)
      const fallback = k.entry.candidates.find((c) => c.attempt === -1);
      return { entry: k.entry, c: fallback ?? k.c, exhausted: false };
    });
  }
  const tNov = now();

  // 7. the headline check of the composed titles and leads, then the recompositions
  const avoid = kept.map(() => new Set<string>());
  const fallback = kept.map(() => ({}) as Record<string, "neutral" | "library">);
  const rebuild = (i: number) => {
    const k = kept[i]!;
    if (!k.c.design) return;
    const design = { ...k.c.design, copyAvoid: new Set([...(k.c.design.copyAvoid ?? []), ...avoid[i]!]), fallback: fallback[i] };
    kept[i] = { ...k, c: { ...k.c, built: buildDirectionWithGenome(input, k.c.archetype, k.c.seed, k.c.avoid, design) } };
  };
  if (deps.headlines) {
    deps.onStep?.("unique");
    let pending = kept.map((_, i) => i);
    for (let round = 0; round <= 4 && pending.length; round++) {
      const lines = pending.flatMap((i) => Object.entries(kept[i]!.c.built.lines ?? {}).map(([path, l]) => ({ i, path, t: l.t, skeleton: kept[i]!.c.built.skeletons?.[path] }))).slice(0, HEADLINES_MAX);
      if (!lines.length) break;
      const got = await withTimeout(deps.headlines(lines.map((l) => l.t)), timeout);
      if (!got) break;
      const close = lines.filter((_, n) => got[n]?.verdict === "close");
      if (!close.length) break;
      // rounds 0-2: another skeleton; 3: the name-led neutral skeleton; 4: the library line (not re-checked)
      for (const l of close) {
        if (round < 3) {
          if (l.skeleton) avoid[l.i]!.add(l.skeleton);
        } else fallback[l.i]![l.path] = round === 3 ? "neutral" : "library";
      }
      pending = [...new Set(close.map((l) => l.i))];
      for (const i of pending) rebuild(i);
      if (round === 4) break;
    }
  }
  const tHead = now();

  // 6. repairs (3 rounds), the budget estimate again, then each direction's view
  const assets = new Map<string, AssetMeta>((input.photos ?? []).map((p) => [p.id, { id: p.id, width: p.width, height: p.height, alpha: !!p.alpha }]));
  const parsedFacts = (input.facts ?? []).map((f) => f.trim()).filter(Boolean);
  const product = (input.product ?? {}) as { name?: string; price?: number };
  const uiLocale = deps.uiLocale ?? input.locale;
  const directions = kept.map((k, i): PipelineDirection => {
    const raw = directionOf(k.entry, k.c);
    const d = deps.finish ? deps.finish(raw) : raw;
    const engineLines = Object.values(d.lines ?? {}).map((l) => l.t);
    const verdict = verdictOf(k.c);
    const facts = { facts: parsedFacts, productName: product.name ?? d.doc.product.name ?? null, price: d.doc.items[0]?.price ?? product.price ?? null };
    const gateInput = (doc: PageDoc) =>
      gateInputFor(doc, {
        kind: "landing",
        theme: buildTheme(doc.theme, doc.locale),
        look: doc.theme.look ?? null,
        assets,
        locale: doc.locale,
        context: "wizard",
        origin: originsOf(doc, { engine: engineLines, ai: deps.aiLines, owner: parsedFacts }),
        facts,
        ownerProof: false,
        novelty: verdict,
      });
    let doc = d.doc;
    let report: GateReport;
    try {
      const repaired = repairDoc({ ...gateInput(doc), doc }, { rounds: 3 });
      // a repair never trades a gate item for a budget breach
      if (budgetBreach(repaired.doc) && !budgetBreach(doc)) report = runGates(gateInput(doc));
      else ({ doc, report } = repaired);
    } catch {
      report = runGates(gateInput(doc));
    }
    const copyGenes = copyGeneTagsOf(d.lines);
    // the server reads the chosen row the same way (genomeOf + the validated copy genes)
    const genome: DesignGenome = applyCopyGenes(genomeOf(doc), validCopyGenes(copyGenes));
    const view = d.genome ? distanceView(genome, { theme: doc.theme }, doc.locale) : null;
    const bands: NoveltyBands | null = verdict
      ? { v: 1, platform: verdict.platform, niche: k.exhausted ? "close" : verdict.niche, own: verdict.own, at: new Date().toISOString(), ...(k.exhausted ? { fallback: true as const } : {}) }
      : null;
    const { chips, why } = explainGenome(genome, { locale: uiLocale, photos: input.photoFacts ?? null, accent: doc.theme.palette.accent });
    return {
      ...d,
      doc,
      key: k.c.key,
      dna: genome,
      view,
      vec: view ? packView(view) : null,
      bands,
      exhausted: k.exhausted,
      report,
      summary: summarize(report),
      q: report.q,
      chips: chips.slice(0, 4),
      why,
      hinted: !!director && i < 2 && !!d.genome,
      card: genomeCard(genome, report, bands, SLOTS[i] ?? "explore", uiLocale),
      copyGenes,
      engineLines,
    };
  });
  const tEnd = now();
  return {
    directions,
    novelty,
    verdicts,
    inputHash: hash,
    candidates: checked,
    ms: { candidates: Math.round(tCand - t0), novelty: Math.round(tNov - tCand), headlines: Math.round(tHead - tNov), repair: Math.round(tEnd - tHead), total: Math.round(tEnd - t0) },
  };
}
