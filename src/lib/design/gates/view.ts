/**
 * The page view the design gates and the render digest read (P6 DESIGN; design.md DES-§8.1, DES-§8.9, RD-1). Pure and
 * isomorphic, no DOM: one pass over the document, the registry `features`, the height model, the type tokens and the
 * built theme. The gates (./visual.ts, ./slop.ts, ./composition.ts) and `renderDigest` (../digest.ts) read the same
 * view, so the digest's counts are the gates' inputs by construction ("renderDigest fields equal the gate inputs").
 *
 * Two flows: `all` is every visible section in document order (fixed layers included), `flow` the DES-§5.1 in-flow
 * list (the hero to the last section before the footer: announcement, header, footer and the fixed layers left out),
 * the list the rhythm rules (I5, V08, V30, V38) and the composition items read. The page-length count of V24 is the
 * height model's `inFlow` (header, announcement and footer included), the number the core's `budget:C3` row reads.
 */
import { getSection } from "@/landing/registry";
import { textFieldsOf } from "@/lib/render/origin";
import { scopedCache } from "@/lib/tenancy/cache";
import type { Locale, PageDoc, SectionBg, SectionInstance, ThemeLook } from "@/lib/page/schema";
import { IMAGE_TEXT, imageTextRun } from "../choreography";
import { MOMENT_BGS } from "../compile";
import { FIXED_TYPES } from "../consts";
import { pairingOf } from "../derive";
import { variantFeatures } from "../features";
import type { DesignGenome, Opener } from "../genome";
import { estimateHeights } from "../heights";
import { loadCatalogue, type Pairing } from "../pairings";
import { wordCount } from "../text/normalize";
import type { HeightReport, VariantFeaturesResolved } from "../types.frozen";
import { typeTokens, type TypeTokens } from "../typography";
import type { GateInput, StorePageDoc } from "./types";

/** One visible section as the gates read it. */
export interface SecView {
  id: string;
  type: string;
  variant: string;
  bg: SectionBg;
  /** index in `doc.sections` */
  idx: number;
  /** position in the DES-§5.1 flow (hero = 0), -1 outside it */
  flow: number;
  f: VariantFeaturesResolved;
  data: Record<string, unknown>;
  /** the header's opener (DES-§5.8): `data.opener`, else "kicker" when a kicker string shows, else "bare" */
  opener: Opener;
  /** a kicker label shows above the title */
  kicker: boolean;
  kickerText: string;
  align: "start" | "center";
  title: string;
  /** lead + body words (V09; list items left out) */
  words: number;
  /** every copy word of the section (C4 quiet screen, the digest) */
  allWords: number;
  /** the longest list of the section's data (V09: 3-6) */
  listItems: number;
  /** distinct merchant assets the section shows (the photo plan, else the asset refs in its data) */
  images: number;
  glass: number;
  ctas: number;
  reveals: number;
  family: VariantFeaturesResolved["family"];
  /** px at 390 from the height model (0 for a fixed layer) */
  top: number;
  height: number;
}

export interface PhotoView {
  /** distinct merchant photos of the product (the cutout excluded) */
  assets: number;
  /** asset id → appearances (the sticky bar and the form thumbnail excluded, I1) */
  uses: Record<string, number>;
  /** distinct crops on the page */
  crops: number;
  /** the hero asset's appearances at the hero's crop */
  heroSameCrop: number;
  /** section id → asset ids it shows, with the crop */
  bySection: Map<string, { asset: string; crop: string }[]>;
}

export interface PageView {
  kind: GateInput["kind"];
  /** the landing document; null for a store template (the landing-only gates skip) */
  landing: PageDoc | null;
  locale: Locale;
  ar: boolean;
  look: ThemeLook | null;
  genome: DesignGenome;
  all: SecView[];
  flow: SecView[];
  hero: SecView | null;
  heights: HeightReport;
  /** copy field path → text (title-, lead- and body-like leaves) */
  fields: ReadonlyMap<string, string>;
  photo: PhotoView;
  type: { pairing: Pairing | null; pairingId: string; tt: TypeTokens | null };
  counts: {
    eyebrows: number;
    eyebrowBudget: number;
    centeredRun: number;
    sameFamilyMax: number;
    zigzagRun: number;
    marquees: number;
    bento: number;
    equalCardTriplets: number;
    glass: number;
    reveals: number;
    ctas: number;
    photoUses: Record<string, number>;
    fullBleedMoments: number;
  };
}

const TITLE_KEY = /^(title|headline|heading)$/;
const KICKER_KEY = /^(kicker|eyebrow)$/;
/** lead + body fields of a section (V09): top-level only, so list items keep their own budget (3-6 items) */
const BODY_KEY = /^(lead|subtitle|sub|intro|description|body|text|story|paragraph|message)$/;
const COPY_KEY = /(^|\.)(title|headline|heading|kicker|eyebrow|lead|subtitle|sub|intro|description|text|body|story|paragraph|q|a|pain|fix|solution|answer|quote|caption|note|label|reassurance|tagline|bigWord|us|them|message|detail)$/;
const ASSET_ID = /^[a-f0-9]{16,64}$/;
/** the sections whose photos are thumbnails (I1: not counted) */
const PHOTO_EXCLUDED: ReadonlySet<string> = new Set(["stickyCta", "orderForm"]);
/** the nav and the sticky bar are no glass surface of their own (§M.2, R4) */
const NO_GLASS_SURFACE: ReadonlySet<string> = new Set(["header", "stickyCta"]);
const OPENER_SET: ReadonlySet<string> = new Set(["bare", "caption", "number", "quote", "image", "kicker"]);

export const isPageDoc = (d: PageDoc | StorePageDoc): d is PageDoc => "theme" in d && "product" in d;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const visibleWords = (s: string) => wordCount(s.replace(/\*+/g, ""));

/** Distinct asset ids referenced in a section's data (AssetRef-shaped objects at any depth). */
function assetIdsIn(data: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(data)) for (const v of data) assetIdsIn(v, out);
  else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.id === "string" && ASSET_ID.test(o.id)) out.add(o.id);
    for (const v of Object.values(o)) if (v && typeof v === "object") assetIdsIn(v, out);
  }
  return out;
}

/** The section schema accepts a top-level field (unknown keys would be stripped by the section's zod object). */
export function accepts(type: string, field: string): boolean {
  const shape = (getSection(type)?.schema as { shape?: Record<string, unknown> } | undefined)?.shape;
  return !!shape && Object.prototype.hasOwnProperty.call(shape, field);
}

/** The header's opener (DES-§5.8). A variant without a SectionHeader (`openers: []`) is "bare". */
function openerOf(type: string, f: VariantFeaturesResolved, data: Record<string, unknown>): { opener: Opener; kicker: boolean; text: string } {
  const text = str(data.kicker) || str(data.eyebrow);
  if (f.openers && f.openers.length === 0) return { opener: "bare", kicker: false, text };
  const o = typeof data.opener === "string" && OPENER_SET.has(data.opener) ? (data.opener as Opener) : null;
  if (o) return { opener: o, kicker: o === "kicker" && !!text, text };
  void type;
  return { opener: text ? "kicker" : "bare", kicker: !!text, text };
}

/** The type pairing of the page: the genome's catalogue row, else the theme's fonts (a landing page). */
function pairingFor(doc: PageDoc | null, g: DesignGenome): { pairing: Pairing | null; id: string } {
  const cat = loadCatalogue();
  const byGene = cat.byId.get(g.brand.G4);
  if (byGene) return { pairing: byGene, id: byGene.id };
  if (doc) {
    const p = pairingOf(doc.theme);
    return { pairing: p.pairing, id: p.id };
  }
  return { pairing: null, id: g.brand.G4 };
}

/** The type genes as a TypeLook (the look's when present, else the genome's back-derived G5-G8). */
function typeLookOf(look: ThemeLook | null, g: DesignGenome): Pick<ThemeLook, "type"> {
  if (look) return { type: look.type };
  const b = g.brand;
  return { type: { rm: b.G5.rm, rd: b.G5.rd, dmax: Math.round(b.G5.dmax), w: Math.round(b.G6.w), wAr: Math.round(b.G6.wAr), tk: b.G6.tk, dc: b.G7.dc, lb: b.G7.lb, nu: b.G8 } };
}

/** The longest run of consecutive entries that satisfy `is`. */
export function longestRun<T>(list: readonly T[], is: (x: T, prev: T | undefined) => boolean): number {
  let run = 0;
  let best = 0;
  list.forEach((x, i) => {
    run = is(x, list[i - 1]) ? run + 1 : 0;
    best = Math.max(best, run);
  });
  return best;
}

/** A store template as the height model's document (sections and locale; the landing-only fields empty, R2 interim). */
function storeHeights(doc: StorePageDoc, features: (type: string, variant: string, data: unknown) => VariantFeaturesResolved): HeightReport {
  const sections: HeightReport["sections"] = [];
  let top = 0;
  for (const s of doc.sections) {
    if (s.hidden) continue;
    const f = features(s.type, s.variant, s.data);
    if (f.fixed !== null) continue;
    const screens = typeof f.h === "number" ? f.h : f.h ? f.h.base : 1;
    const height = Math.round(screens * 844);
    sections.push({ id: s.id, type: s.type, variant: s.variant, top, height });
    top += height;
  }
  return { v: 1, viewport: 390, sections, total: top, screens: Math.round((top / 844) * 100) / 100, formTop: null, formHeight: null, fold: { family: "", ok: true, items: {}, limit: 844 }, inFlow: sections.length };
}

/** The photo view from the genome's photo plan (G33), else from the asset refs of the document. */
function photoView(doc: PageDoc | null, g: DesignGenome, all: readonly SecView[]): PhotoView {
  const bySection = new Map<string, { asset: string; crop: string }[]>();
  const uses: Record<string, number> = {};
  const crops = new Set<string>();
  const planned = Object.entries(g.page.G33?.uses ?? {});
  const present = new Set(all.map((s) => s.id));
  let heroAsset: string | null = null;
  let heroCrop: string | null = null;
  if (planned.length) {
    for (const [asset, list] of planned) {
      for (const u of list) {
        if (!present.has(u.section)) continue;
        const type = all.find((s) => s.id === u.section)?.type ?? "";
        if (PHOTO_EXCLUDED.has(type)) continue;
        uses[asset] = (uses[asset] ?? 0) + 1;
        crops.add(u.crop);
        bySection.set(u.section, [...(bySection.get(u.section) ?? []), { asset, crop: u.crop }]);
        if (u.role === "hero" && !heroAsset) {
          heroAsset = asset;
          heroCrop = u.crop;
        }
      }
    }
  } else {
    for (const s of all) {
      if (PHOTO_EXCLUDED.has(s.type)) continue;
      const ids = [...assetIdsIn(s.data)];
      if (s.type === "hero" && !ids.length && doc?.product.images[0]) ids.push(doc.product.images[0].id);
      for (const id of ids) {
        uses[id] = (uses[id] ?? 0) + 1;
        bySection.set(s.id, [...(bySection.get(s.id) ?? []), { asset: id, crop: "full" }]);
        if (s.type === "hero" && !heroAsset) heroAsset = id;
      }
      if (ids.length) crops.add("full");
    }
    heroCrop = "full";
  }
  let heroSameCrop = 0;
  if (heroAsset) for (const list of bySection.values()) for (const u of list) if (u.asset === heroAsset && u.crop === heroCrop) heroSameCrop++;
  const cutout = doc?.product.cutout?.id;
  const assets = doc ? new Set(doc.product.images.map((i) => i.id).filter((id) => id !== cutout)).size : Object.keys(uses).length;
  return { assets, uses, crops: crops.size, heroSameCrop, bySection };
}

/**
 * The type tokens per (pairing, locale, type genes): a pure function of the catalogue, so one platform partition ("p")
 * of a scoped cache serves every store (no store data is keyed or held).
 */
const TT_CACHE = scopedCache<TypeTokens>({ name: "design-type-tokens", maxEntries: 500, ttlMs: 60 * 60_000 });
type ViewKey = Pick<GateInput, "kind" | "genome" | "locale" | "heights" | "features">;
/** The last view of a document object (the digest reads the view the gates just built). */
const VIEWS = new WeakMap<object, { input: ViewKey; view: PageView }>();

/** ≤ 1.5 ms: the view of one gate input (memoised per document object, genome, heights, kind and locale). */
export function pageView(input: Pick<GateInput, "doc" | "kind" | "genome" | "locale" | "heights" | "features">): PageView {
  const hit = VIEWS.get(input.doc);
  const same = (k: ViewKey) => k.genome === input.genome && k.kind === input.kind && k.locale === input.locale && k.features === input.features;
  if (hit && same(hit.input) && (input.heights === undefined ? hit.input.heights === undefined : input.heights === hit.view.heights)) return hit.view;
  const view = buildView(input);
  VIEWS.set(input.doc, { input: { kind: input.kind, genome: input.genome, locale: input.locale, heights: input.heights, features: input.features }, view });
  return view;
}

function buildView(input: Pick<GateInput, "doc" | "kind" | "genome" | "locale" | "heights" | "features">): PageView {
  const features = input.features ?? variantFeatures;
  const doc = input.doc;
  const landing = isPageDoc(doc) ? doc : null;
  const look = landing?.theme.look ?? null;
  const heights =
    input.heights ?? (landing ? estimateHeights(landing, { look, locale: input.locale, features }) : storeHeights(doc as StorePageDoc, features));
  const hIndex = new Map(heights.sections.map((s) => [s.id, s]));
  const copy = new Map<string, string>();
  for (const [path, v] of textFieldsOf(doc as PageDoc)) if (COPY_KEY.test(path) && v.trim()) copy.set(path, v);
  const scope = look?.mo.scope ?? null;

  const all: SecView[] = [];
  let flowAt = 0;
  doc.sections.forEach((s: SectionInstance, idx) => {
    if (s.hidden) return;
    const f = features(s.type, s.variant, s.data);
    const data = (s.data ?? {}) as Record<string, unknown>;
    const inFlow = !FIXED_TYPES.has(s.type);
    const op = openerOf(s.type, f, data);
    let words = 0;
    let allWords = 0;
    let listItems = 0;
    let title = "";
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string") {
        if (TITLE_KEY.test(k) && !title) title = v.trim();
        if (BODY_KEY.test(k)) words += visibleWords(v);
      } else if (Array.isArray(v) && v.length && typeof v[0] === "object") listItems = Math.max(listItems, v.length);
    }
    const prefix = `${s.id}.`;
    for (const [path, v] of copy) if (path.startsWith(prefix)) allWords += visibleWords(v);
    const h = hIndex.get(s.id);
    all.push({
      id: s.id,
      type: s.type,
      variant: s.variant,
      bg: s.bg,
      idx,
      flow: inFlow ? flowAt++ : -1,
      f,
      data,
      opener: op.opener,
      kicker: op.kicker,
      kickerText: op.text,
      align: f.centered ? "center" : "start",
      title,
      words,
      allWords,
      listItems,
      images: 0,
      glass: NO_GLASS_SURFACE.has(s.type) ? 0 : f.glass,
      ctas: f.ctas,
      reveals: scope === "none" ? 0 : scope === "hero" ? (s.type === "hero" ? f.revealNodes : 0) : f.revealNodes,
      family: f.family,
      top: h?.top ?? 0,
      height: h?.height ?? 0,
    });
  });
  const flow = all.filter((s) => s.flow >= 0);
  const hero = flow.find((s) => s.type === "hero") ?? null;
  const photo = photoView(landing, input.genome, all);
  for (const s of all) s.images = new Set((photo.bySection.get(s.id) ?? []).map((u) => u.asset)).size;

  const pick = pairingFor(landing, input.genome);
  let tt: TypeTokens | null = null;
  if (pick.pairing) {
    const tl = typeLookOf(look, input.genome);
    const key = `${pick.id}|${input.locale}|${JSON.stringify(tl.type)}`;
    tt = TT_CACHE.get("p", key) ?? null;
    if (!tt) {
      try {
        tt = typeTokens(pick.pairing, tl, input.locale);
        TT_CACHE.set("p", key, tt);
      } catch {
        tt = null;
      }
    }
  }
  const afterHero = flow.filter((s) => s.type !== "hero");
  const strips = all.filter((s) => s.f.scroller && (s.f.textRuns ?? []).includes("marquee")).length;
  const seq = flow.map((s) => `${s.type}:${s.variant}`);
  const strongBase = landing?.theme.palette.base === "dark";
  const moments = flow.filter((s) => (MOMENT_BGS as readonly string[]).includes(s.bg) && !(strongBase && s.bg === "dark")).length;
  return {
    kind: input.kind,
    landing,
    locale: input.locale,
    ar: input.locale === "ar",
    look,
    genome: input.genome,
    all,
    flow,
    hero,
    heights,
    fields: copy,
    photo,
    type: { pairing: pick.pairing, pairingId: pick.id, tt },
    counts: {
      eyebrows: afterHero.filter((s) => s.kicker).length,
      eyebrowBudget: Math.ceil(flow.length / 3),
      centeredRun: longestRun(flow, (s) => s.align === "center" && s.words > 0),
      sameFamilyMax: longestRun(flow, (s, p) => !!p && p.family === s.family) + (flow.length ? 1 : 0),
      zigzagRun: imageTextRun(seq, (t) => IMAGE_TEXT.has(t)),
      marquees: strips,
      bento: all.filter((s) => s.f.bento).length,
      equalCardTriplets: all.filter((s) => s.f.equalCards === 3).length,
      glass: all.reduce((n, s) => n + s.glass, 0),
      reveals: all.reduce((n, s) => n + s.reveals, 0),
      ctas: all.reduce((n, s) => n + s.ctas, 0),
      photoUses: photo.uses,
      fullBleedMoments: moments,
    },
  };
}
