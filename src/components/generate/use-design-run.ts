"use client";
/**
 * The wizard's run of the generation pipeline (P6 DESIGN; design.md DES-§14.2, DES-§14.6 GH-1, DES-§4.11, DES-§23.3,
 * DS26). One hook owns what the directions step needs around `runDesignPipeline`:
 *
 * - the niche shares (`nicheSharesAction`), fetched once per niche and hour for H33 and waited for ≤ 1.5 s;
 * - the photo facts pass (`photoFacts` with the model-free alpha estimate) over the product photos, in the browser,
 *   cached per photo set (D59: nothing downloads a model, nothing is uploaded);
 * - the seeds: the store's brand seed with the regeneration count, and the WebCrypto input hash (never Math.random);
 * - the novelty verdicts of this draft kept in `sg:gen:<store>:<member>:v3:novelty`, so a reload asks nothing twice;
 * - `recordCandidatesAction` once the directions show (the server writes them in `after()`);
 * - GH-1: with `ai_director_brief` on and Cloud AI's Director available, `design.plan` runs in parallel with the
 *   draw; a brief that lands within 90 s re-samples directions 1 and 2 with its hints (weight ≤ 2, one pin) and the
 *   step crossfades to the refined set; dropped hints are counted, never shown;
 * - the exhaustion path's one-tap differentiators (the type pairing, the colours) on one direction.
 *
 * Failures degrade: a slow or failed novelty or headline call shows the directions without the words.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { checkNoveltyAction, recordCandidatesAction } from "@/app/app/[store]/generate/actions";
import { checkHeadlinesAction, nicheSharesAction } from "@/lib/design/actions";
import type { NicheShares, NoveltyVerdict } from "@/lib/design/novelty.server";
import { mergePhotoFacts, photoFacts, type PhotoFacts } from "@/lib/design/photo-facts";
import type { AiPolicy } from "@/lib/ai/policy";
import { useAiTask, useDeviceInfo } from "@/lib/ai/router/client";
import type { Direction, GenerateInput } from "@/lib/generator/directions";
import type { Locale } from "@/lib/page/schema";
import type { GeneratorKit } from "./kit-loader";
import type { PipelineDirection, PipelineStep } from "./pipeline";
import { fetchImage } from "./photos";

export interface DesignRunOpts {
  kit: GeneratorKit | null;
  /** null until the directions step has a complete product */
  input: GenerateInput | null;
  /** `<storeId>:<userId>` (the draft keys, GEN-03) */
  owner: string;
  /** `stores.brand_seed` (DS5) and the regeneration count */
  brandSeed: string;
  regen: number;
  niche: string;
  photos: readonly { id: string; url: string; width: number; alpha: boolean }[];
  /** the wizard's products / offers / look on each direction */
  finish?: (d: Direction) => Direction;
  /** the on-device model's lines merged into the copy (origin "local") */
  aiLines?: readonly string[];
  uiLocale: Locale;
  director: { on: boolean; policy: AiPolicy; handle: string };
}

export interface DesignRun {
  status: "idle" | "analysing" | "revealed" | "error";
  step: PipelineStep | null;
  directions: PipelineDirection[] | null;
  novelty: "checked" | "unavailable" | "skipped";
  error: string | null;
  /** the Director's brief re-sampled directions 1 and 2 */
  refined: boolean;
  differentiate(index: number, kind: "pairing" | "colour"): void;
}

const SHARES_WAIT_MS = 1500;
const FACTS_WAIT_MS = 1200;
const DIRECTOR_WAIT_MS = 90_000;
const VERDICTS_MAX = 48;

const verdictKey = (owner: string) => `sg:gen:${owner}:v3:novelty`;
const hourOf = () => new Date().toISOString().slice(0, 13);

function loadVerdicts(owner: string): Map<string, NoveltyVerdict> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(verdictKey(owner)) ?? "null") as { hour?: string; list?: NoveltyVerdict[] } | null;
    // the pool moves: a verdict older than the hour is asked again
    if (!raw || raw.hour !== hourOf() || !Array.isArray(raw.list)) return new Map();
    return new Map(raw.list.filter((v) => v && typeof v.key === "string").map((v) => [v.key, v]));
  } catch {
    return new Map();
  }
}
function saveVerdicts(owner: string, verdicts: ReadonlyMap<string, NoveltyVerdict>) {
  try {
    sessionStorage.setItem(verdictKey(owner), JSON.stringify({ hour: hourOf(), list: [...verdicts.values()].slice(-VERDICTS_MAX) }));
  } catch {
    // storage unavailable: the next run asks again
  }
}

const settle = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

/** The facts pass over the product photos (lead first): each read once, in the browser. */
async function factsOf(photos: DesignRunOpts["photos"]): Promise<PhotoFacts | null> {
  const list: PhotoFacts[] = [];
  for (const p of photos.slice(0, 6)) {
    try {
      const bitmap = await createImageBitmap(await fetchImage(p.url));
      list.push(photoFacts(bitmap, { count: photos.length, width: p.width, alpha: p.alpha }));
      bitmap.close();
    } catch {
      // an unreadable photo adds no facts
    }
  }
  return mergePhotoFacts(list);
}

export function useDesignRun(opts: DesignRunOpts): DesignRun {
  const { kit, input, owner, brandSeed, regen, niche, photos, finish, aiLines, uiLocale, director } = opts;
  const [run, setRun] = useState<Omit<DesignRun, "differentiate">>({ status: "idle", step: null, directions: null, novelty: "checked", error: null, refined: false });
  const shares = useRef<{ key: string; p: Promise<NicheShares | null> } | null>(null);
  const facts = useRef<{ key: string; p: Promise<PhotoFacts | null> } | null>(null);
  const token = useRef(0);
  const device = useDeviceInfo();
  const planTask = useAiTask("design.plan", { handle: director.handle, policy: director.policy, device });
  const directorOn = director.on && director.policy.cloud.available && director.policy.cloud.director !== "off" && director.policy.cloud.director !== "unavailable";

  // the niche shares: once per niche and hour, as soon as the wizard opens
  useEffect(() => {
    const key = `${niche}|${hourOf()}`;
    if (shares.current?.key === key) return;
    shares.current = { key, p: nicheSharesAction(niche).then((r) => (r.ok ? r.data : null), () => null) };
  }, [niche]);

  const photoKey = photos.map((p) => p.id).join(",");
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => {
    if (!photoKey || facts.current?.key === photoKey) return;
    facts.current = { key: photoKey, p: factsOf(photosRef.current) };
  }, [photoKey]);

  const finishRef = useRef(finish);
  finishRef.current = finish;
  const aiLinesRef = useRef(aiLines);
  aiLinesRef.current = aiLines;

  useEffect(() => {
    if (!kit || !input) return;
    const mine = ++token.current;
    const alive = () => token.current === mine;
    setRun((r) => ({ ...r, status: "analysing", step: "photos", error: null, refined: false }));
    const verdicts = loadVerdicts(owner);
    const deps = {
      onStep: (step: PipelineStep) => alive() && setRun((r) => ({ ...r, step })),
      novelty: async (candidates: { key: string; vec: number[] }[]) => {
        const r = await checkNoveltyAction({ niche, candidates });
        return r.ok ? r.data : null;
      },
      headlines: async (texts: string[]) => {
        const r = await checkHeadlinesAction(niche, texts);
        return r.ok ? r.data : null;
      },
      known: verdicts,
      finish: (d: Direction) => (finishRef.current ? finishRef.current(d) : d),
      aiLines: aiLinesRef.current ?? [],
      uiLocale,
    };
    // GH-1: the Director plans in parallel with the draw; nothing waits for it (D59)
    const brief = directorOn
      ? settle(
          planTask.run({ niche, locale: input.locale, market: input.market, product: input.product, facts: input.facts ?? [] }, { surface: "wizard" }).then((o) => (o.ok ? o.value : null)),
          DIRECTOR_WAIT_MS,
          null,
        )
      : null;
    void (async () => {
      try {
        const [nicheShares, photoFacts] = await Promise.all([
          shares.current ? settle(shares.current.p, SHARES_WAIT_MS, null) : null,
          facts.current ? settle(facts.current.p, FACTS_WAIT_MS, null) : null,
        ]);
        const base: GenerateInput = { ...input, brandSeed: regen ? `${brandSeed}:r${regen}` : brandSeed, niche, shares: nicheShares, ...(photoFacts ? { photoFacts } : {}) };
        const result = await kit.runDesignPipeline(base, deps);
        if (!alive()) return;
        for (const [k, v] of result.verdicts) verdicts.set(k, v);
        saveVerdicts(owner, verdicts);
        setRun({ status: "revealed", step: null, directions: result.directions, novelty: result.novelty, error: null, refined: false });
        record(niche, result.directions);
        if (!brief) return;
        const raw = await brief;
        if (!raw || !alive()) return;
        const { hints, pins, intake } = kit.validateHints(raw);
        if (intake.dropped.length) console.debug(`[generate] director hints dropped: ${intake.dropped.length}`);
        if (!Object.keys(hints).length && !Object.keys(pins ?? {}).length) return;
        const refined = await kit.runDesignPipeline({ ...base, inputHash: result.inputHash }, { ...deps, known: verdicts, director: { hints, ...(pins ? { pins } : {}) } });
        if (!alive()) return;
        setRun({ status: "revealed", step: null, directions: refined.directions, novelty: refined.novelty, error: null, refined: true });
        record(niche, refined.directions);
      } catch (err) {
        if (!alive()) return;
        console.warn("[generate] the directions could not be built", err);
        setRun((r) => ({ ...r, status: "error", step: null, directions: null, error: err instanceof Error ? err.message : "Unknown error." }));
      }
    })();
    // a new input or a new kit restarts the run; the old one finishes into nothing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit, input]);

  const differentiate = useCallback(
    (index: number, kind: "pairing" | "colour") => {
      if (!kit) return;
      setRun((r) => {
        const d = r.directions?.[index];
        if (!r.directions || !d) return r;
        const gene = kind === "pairing" ? "G4" : "G9";
        const variant = kit.differentiateVariants(d.doc, d.seed, { max: 6 }).find((v) => v.gene === gene);
        if (!variant) return r;
        const doc = { ...d.doc, theme: variant.theme };
        const { chips, why } = kit.explainGenome(kit.genomeOf(doc), { locale: uiLocale, accent: doc.theme.palette.accent });
        // the publish check judges the new look again; the reveal no longer claims the old bands
        const next: PipelineDirection = { ...d, doc, chips: chips.slice(0, 4), why, bands: null, exhausted: false };
        return { ...r, directions: r.directions.map((x, i) => (i === index ? next : x)) };
      });
    },
    [kit, uiLocale],
  );

  return { ...run, differentiate };
}

/** DES-§14.2 step 9: the directions shown, as `generated` rows (fire and forget). */
function record(niche: string, directions: readonly PipelineDirection[]) {
  const rows = directions.flatMap((d) =>
    d.vec ? [{ genome: d.dna, vec: d.vec, q: Math.round(d.q), slop: Math.min(127, Math.round(d.report.slop.score)), novelty: d.bands ? { platform: d.bands.platform, niche: d.bands.niche, own: d.bands.own, clone: false } : null }] : [],
  );
  if (!rows.length) return;
  void recordCandidatesAction({ niche, rows }).catch(() => undefined);
}
