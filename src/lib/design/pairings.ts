/**
 * The font pairing catalogue and its validity rules F1-F15 (P6 DESIGN; design.md DES-§10.2-10.4, DS37, DS49, DS60).
 * Pure and isomorphic: the sampler draws G4 from `pairingsFor`, `theme:check` runs `pairingRules` over the catalogue.
 *
 * The catalogue is the 33 legacy pairings of `ARCHETYPE_DEFS[*].fonts` (ids and values kept; the rows that break F11 /
 * F14 are re-pointed here, an old document keeps the fonts in its own ThemeSpec), the DES-§10.3 additions and the
 * DES-§10.4 rows of the DES-R21 faces (src/lib/theme/archetypes.ts). A row whose faces are not all in the font manifest
 * is skipped at load and reported as `pending_font` (the seven DES-R21 faces until the maintainer's sync step ships
 * them); nothing pending is ever sampled.
 */
import { ARCHETYPES, type Archetype, type Locale } from "@/lib/page/schema";
import {
  ARCHETYPE_DEFS,
  CATALOGUE_REPOINTS,
  PAIRING_ADDITIONS,
  PENDING_FONT_IDS,
  R21_PAIRINGS,
  type CataloguePairing,
} from "@/lib/theme/archetypes";
import { FONT_DATA, fontPreloads, type FontData } from "@/lib/theme/fonts";
import { arabicMetrics, typeTokens } from "./typography";

export type PairingSource = "legacy" | "addition" | "r21";
export interface Pairing extends CataloguePairing {
  /** the archetype whose list carries the row */
  archetype: Archetype;
  source: PairingSource;
  /** a legacy row whose Arabic display face the catalogue changed (F11 / F14) */
  repointed: boolean;
}
export interface PendingPairing {
  id: string;
  archetype: Archetype;
  /** faces the manifest does not carry yet */
  missing: string[];
}
export interface Catalogue {
  pairings: readonly Pairing[];
  pending: readonly PendingPairing[];
  byId: ReadonlyMap<string, Pairing>;
}

type Manifest = Readonly<Record<string, FontData>>;

/* ------------------------------------------------------------------ */
/* the roster facts the rules read                                     */
/* ------------------------------------------------------------------ */

/** Arabic structural classes (F11; `arDisplayClass` is a nicheShares key, DES-§7.4). */
export type ArClass = "geometric-sans" | "kufi-geometric" | "humanist-sans" | "condensed" | "calligraphic-leaning" | "playful";
export const AR_DISPLAY_CLASS: Readonly<Record<string, ArClass>> = {
  alexandria: "geometric-sans",
  "readex-pro": "geometric-sans",
  tajawal: "geometric-sans",
  "noto-kufi-arabic": "kufi-geometric",
  kufam: "kufi-geometric",
  cairo: "humanist-sans",
  vazirmatn: "humanist-sans",
  changa: "condensed",
  "el-messiri": "calligraphic-leaning",
  marhey: "playful",
  "baloo-bhaijaan-2": "playful",
  lemonada: "playful",
};
export const arDisplayClass = (id: string): ArClass | null => AR_DISPLAY_CLASS[id] ?? null;
/** Never an Arabic display face (F11, T4): a souk kufi, a text naskh and the admin UI face. */
export const NEVER_DISPLAY_AR = ["reem-kufi", "noto-naskh-arabic", "ibm-plex-sans-arabic"] as const;
/** The Arabic body faces (F5). */
export const AR_BODY_FACES = ["ibm-plex-sans-arabic", "noto-naskh-arabic", "readex-pro", "tajawal", "noto-kufi-arabic", "alexandria"] as const;
export const PLAYFUL_AR = ["marhey", "baloo-bhaijaan-2", "lemonada"] as const;
/** The only archetypes a playful Arabic display may serve (F7). */
export const PLAYFUL_ARCHETYPES: readonly Archetype[] = ["playground", "hearth", "bloom"];
/** Latin serifs whose stroke contrast El Messiri shares (F14). */
export const CONTRAST_SERIFS = ["bodoni-moda", "gloock", "young-serif", "instrument-serif", "cormorant-garamond", "dm-serif-display"] as const;
/** The LLM default serifs of 2025-26 (F12, UX-8): ≤ 8 % each platform-wide, ≤ 10 % per niche. */
export const DEFAULT_SERIFS = ["fraunces", "instrument-serif"] as const;
/** The DES-R21 Arabic faces: the full F11 roster rule applies once all three ship. */
const R21_ARABIC = ["cairo", "kufam", "vazirmatn"] as const;

const has = (list: readonly string[], v: string) => list.includes(v);

/* ------------------------------------------------------------------ */
/* the catalogue                                                       */
/* ------------------------------------------------------------------ */

/** Every catalogue row, before the manifest filter: legacy (re-pointed), additions, R21 rows. */
export function catalogueRows(): { row: CataloguePairing; archetype: Archetype; source: PairingSource; repointed: boolean }[] {
  const out: { row: CataloguePairing; archetype: Archetype; source: PairingSource; repointed: boolean }[] = [];
  for (const a of ARCHETYPES) {
    for (const p of ARCHETYPE_DEFS[a].fonts) {
      const re = CATALOGUE_REPOINTS[p.id];
      out.push({ row: { ...p, ...(re ?? {}), alsoFits: [] }, archetype: a, source: "legacy", repointed: !!re });
    }
    for (const p of PAIRING_ADDITIONS[a]) out.push({ row: p, archetype: a, source: "addition", repointed: false });
    for (const p of R21_PAIRINGS[a]) out.push({ row: p, archetype: a, source: "r21", repointed: false });
  }
  return out;
}

const facesOf = (p: CataloguePairing) => [p.display, p.body, ...(p.accent ? [p.accent] : []), p.displayAr, p.bodyAr];

let cached: Catalogue | null = null;

/**
 * The loaded catalogue: every row whose faces are all in `manifest` (the shipped FONT_DATA by default); the others are
 * `pending` with the faces they miss.
 */
export function loadCatalogue(manifest: Manifest = FONT_DATA): Catalogue {
  if (manifest === FONT_DATA && cached) return cached;
  const pairings: Pairing[] = [];
  const pending: PendingPairing[] = [];
  for (const { row, archetype, source, repointed } of catalogueRows()) {
    const missing = [...new Set(facesOf(row).filter((f) => !(f in manifest)))];
    if (missing.length) pending.push({ id: row.id, archetype, missing });
    else pairings.push({ ...row, archetype, source, repointed });
  }
  const out: Catalogue = { pairings, pending, byId: new Map(pairings.map((p) => [p.id, p])) };
  if (manifest === FONT_DATA) cached = out;
  return out;
}

/** The archetypes a pairing serves: its own list and "also fits". */
export const pairingArchetypes = (p: Pairing): Archetype[] => [p.archetype, ...p.alsoFits.filter((a) => a !== p.archetype)];

/** The pairings an archetype may draw, with their prior weights (own rows 1, "also fits" rows 0.3; DES-§10.3). */
export function pairingsFor(archetype: Archetype, cat: Catalogue = loadCatalogue()): { pairing: Pairing; weight: number }[] {
  return cat.pairings.filter((p) => pairingArchetypes(p).includes(archetype)).map((p) => ({ pairing: p, weight: p.archetype === archetype ? 1 : 0.3 }));
}

/** The face whose italic carries italic emphasis (F8, H19): the display face's own italic, else a serif accent's. */
export function italicFace(p: Pick<CataloguePairing, "display" | "accent">, manifest: Manifest = FONT_DATA): string | null {
  if (manifest[p.display]?.italic) return p.display;
  if (p.accent && manifest[p.accent]?.italic) return p.accent;
  return null;
}

/** The (display, body, displayAr, bodyAr) tuple F10 counts. */
export const pairingTuple = (p: CataloguePairing) => `${p.display}|${p.body}|${p.displayAr}|${p.bodyAr}`;

/* ------------------------------------------------------------------ */
/* F12: concentration caps (DS49, H33)                                 */
/* ------------------------------------------------------------------ */

export const CAPS = {
  /** one pairing within an archetype */
  pairing: 0.25,
  /** one Latin display family, platform-wide */
  latinDisplay: 0.2,
  /** Fraunces and Instrument Serif, each: platform-wide / per niche */
  defaultSerif: { platform: 0.08, niche: 0.1 },
  /** one Arabic display face, of the Arabic pages of a niche */
  arDisplay: 0.3,
  /** one Arabic structural class */
  arClass: 0.4,
} as const;

export interface ConcentrationShares {
  /** archetype → pairing id → share of that archetype's pages */
  pairing: Partial<Record<Archetype, Record<string, number>>>;
  latinDisplay: Record<string, number>;
  arDisplay: Record<string, number>;
  arClass: Record<string, number>;
}

/** The F12 caps a share map breaks (the sweep and the corpus call this on measured shares). */
export function concentrationViolations(s: ConcentrationShares, scope: "platform" | "niche"): string[] {
  const out: string[] = [];
  for (const [a, m] of Object.entries(s.pairing)) for (const [id, v] of Object.entries(m ?? {})) if (v > CAPS.pairing + 1e-9) out.push(`pairing ${id} at ${pct(v)} of ${a} (cap ${pct(CAPS.pairing)})`);
  for (const [f, v] of Object.entries(s.latinDisplay)) {
    const cap = has(DEFAULT_SERIFS, f) ? CAPS.defaultSerif[scope] : CAPS.latinDisplay;
    if (v > cap + 1e-9) out.push(`Latin display ${f} at ${pct(v)} (cap ${pct(cap)})`);
  }
  for (const [f, v] of Object.entries(s.arDisplay)) if (v > CAPS.arDisplay + 1e-9) out.push(`Arabic display ${f} at ${pct(v)} (cap ${pct(CAPS.arDisplay)})`);
  for (const [c, v] of Object.entries(s.arClass)) if (v > CAPS.arClass + 1e-9) out.push(`Arabic class ${c} at ${pct(v)} (cap ${pct(CAPS.arClass)})`);
  return out;
}
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/**
 * Shares of the catalogue under its prior (archetypes equally likely, own rows 1, "also fits" 0.3), after `rounds` of
 * the H33 step factors (a value at ≥ 0.8 × its cap × 0.5, at ≥ its cap × 0.25, floor 0.02 of its prior): the proof
 * that the caps are reachable with this catalogue (F12 over the catalogue; the sweep measures the sampler itself).
 */
export function cappedShares(cat: Catalogue = loadCatalogue(), rounds = 40): { prior: ConcentrationShares; capped: ConcentrationShares } {
  const prior = new Map<string, number>(); // `${archetype}|${id}` → weight
  for (const a of ARCHETYPES) {
    const rows = pairingsFor(a, cat);
    const sum = rows.reduce((s, r) => s + r.weight, 0);
    for (const r of rows) prior.set(`${a}|${r.pairing.id}`, r.weight / sum / ARCHETYPES.length);
  }
  const w = new Map(prior);
  const shares = (): ConcentrationShares => {
    const total = [...w.values()].reduce((s, v) => s + v, 0);
    const out: ConcentrationShares = { pairing: {}, latinDisplay: {}, arDisplay: {}, arClass: {} };
    const perArch = new Map<string, number>();
    for (const [k, v] of w) perArch.set(k.split("|")[0]!, (perArch.get(k.split("|")[0]!) ?? 0) + v);
    for (const [k, v] of w) {
      const [a, id] = k.split("|") as [Archetype, string];
      const p = cat.byId.get(id)!;
      (out.pairing[a] ??= {})[id] = v / perArch.get(a)!;
      out.latinDisplay[p.display] = (out.latinDisplay[p.display] ?? 0) + v / total;
      out.arDisplay[p.displayAr] = (out.arDisplay[p.displayAr] ?? 0) + v / total;
      const c = arDisplayClass(p.displayAr) ?? "other";
      out.arClass[c] = (out.arClass[c] ?? 0) + v / total;
    }
    return out;
  };
  const priorShares = shares();
  for (let r = 0; r < rounds; r++) {
    const s = shares();
    let moved = false;
    for (const [k, v] of w) {
      const [a, id] = k.split("|") as [Archetype, string];
      const p = cat.byId.get(id)!;
      const lat = has(DEFAULT_SERIFS, p.display) ? CAPS.defaultSerif.platform : CAPS.latinDisplay;
      const levels = [
        [s.pairing[a]![id]!, CAPS.pairing],
        [s.latinDisplay[p.display]!, lat],
        [s.arDisplay[p.displayAr]!, CAPS.arDisplay],
        [s.arClass[arDisplayClass(p.displayAr) ?? "other"]!, CAPS.arClass],
      ] as const;
      let f = 1;
      for (const [share, cap] of levels) f = Math.min(f, share >= cap ? 0.25 : share >= 0.8 * cap ? 0.5 : 1);
      if (f < 1) {
        const floor = 0.02 * prior.get(k)!;
        const next = Math.max(floor, v * f);
        if (next < v) {
          w.set(k, next);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return { prior: priorShares, capped: shares() };
}

/* ------------------------------------------------------------------ */
/* the rules                                                           */
/* ------------------------------------------------------------------ */

export interface RuleHit {
  rule: `F${number}` | "size";
  id: string;
  message: string;
  /** warn: reported, never a failure (metrics_missing, the F11 fallback roster while DES-R21 is pending) */
  level: "fail" | "warn";
}

export interface InkHook {
  /** the F15 ratio of a pairing, or null when one of its faces has no shipped file */
  (p: Pairing): { ratio: number; ok: boolean } | null;
}

const LOCALES: readonly Locale[] = ["ar", "fr", "en"];

/** F1-F15 over a loaded catalogue (DES-§10.2), plus the catalogue size rules of DES-§10.3. */
export function pairingRules(cat: Catalogue = loadCatalogue(), opts: { ink?: InkHook; manifest?: Manifest } = {}): RuleHit[] {
  const manifest: Manifest = opts.manifest ?? FONT_DATA;
  const hits: RuleHit[] = [];
  const hit = (rule: RuleHit["rule"], id: string, message: string, level: RuleHit["level"] = "fail") => hits.push({ rule, id, message, level });
  const face = (id: string) => manifest[id];
  const isMono = (id: string) => face(id)?.category === "monospace";
  const isSerif = (id: string) => face(id)?.category === "serif";

  // size: ids, ≥ 8 per archetype, ≥ 88 entries, ≥ 60 unique tuples, the legacy ids kept, notes
  const ids = new Set<string>();
  for (const { row } of catalogueRows()) {
    if (ids.has(row.id)) hit("size", row.id, "duplicate pairing id");
    ids.add(row.id);
  }
  for (const a of ARCHETYPES) {
    const own = cat.pairings.filter((p) => p.archetype === a).length;
    if (own < 8) hit("size", a, `${own} pairings (≥ 8 per archetype)`);
    for (const p of ARCHETYPE_DEFS[a].fonts) if (!cat.byId.has(p.id)) hit("size", p.id, "a legacy pairing left the catalogue");
  }
  if (cat.pairings.length < 88) hit("size", "catalogue", `${cat.pairings.length} entries (≥ 88)`);
  const tuples = new Set(cat.pairings.map(pairingTuple));
  if (tuples.size < 60) hit("F10", "catalogue", `${tuples.size} unique (display, body, displayAr, bodyAr) tuples (≥ 60)`);
  for (const p of cat.pairings) {
    if (!p.note.trim()) hit("size", p.id, "no designer note");
    if (p.source !== "legacy" && /[–—]/.test(p.note)) hit("size", p.id, "an em or en dash in the designer note (DS13)");
  }

  for (const p of cat.pairings) {
    const arch = pairingArchetypes(p);
    // F1
    if (p.display === p.body && p.displayWeight - 400 < 200 && !(p.accent && isMono(p.accent))) hit("F1", p.id, `display = body (${p.display}) at ${p.displayWeight} without a mono accent`);
    // F2
    for (const [slot, id] of [["display", p.display], ["body", p.body], ["displayAr", p.displayAr], ["bodyAr", p.bodyAr]] as const) if (isMono(id)) hit("F2", p.id, `mono face ${id} as ${slot}`);
    // F3
    if (isSerif(p.display) && isSerif(p.body)) hit("F3", p.id, `serif display ${p.display} over a serif body ${p.body}`);
    // F4
    if (p.displayAr === p.bodyAr && p.displayWeightAr - 400 < 200) hit("F4", p.id, `Arabic display = body (${p.displayAr}) at ${p.displayWeightAr}`);
    // F5
    if (!has(AR_BODY_FACES, p.bodyAr) || has(PLAYFUL_AR, p.bodyAr)) hit("F5", p.id, `${p.bodyAr} is not an Arabic body face`);
    // F6
    for (const [id, w] of [[p.display, p.displayWeight], [p.displayAr, p.displayWeightAr]] as const) {
      const f = face(id);
      if (!f) continue;
      if (f.variable ? w < f.weightRange[0] || w > f.weightRange[1] : !f.weights.includes(w)) hit("F6", p.id, `${id} at ${w} (ships ${f.variable ? f.weightRange.join("-") : f.weights.join(", ")})`);
    }
    // F7
    if (has(PLAYFUL_AR, p.displayAr) && arch.some((a) => !PLAYFUL_ARCHETYPES.includes(a))) hit("F7", p.id, `playful ${p.displayAr} serves ${arch.filter((a) => !PLAYFUL_ARCHETYPES.includes(a)).join(", ")}`);
    // F8: a serif accent is there for its italic emphasis, so it must ship italics
    if (p.accent && isSerif(p.accent) && !face(p.accent)?.italic) hit("F8", p.id, `serif accent ${p.accent} ships no italic`);
    // F9
    for (const locale of LOCALES) {
      const ids = locale === "ar" ? [p.displayAr, p.bodyAr] : [p.display, p.body];
      const n = fontPreloads([...new Set(ids)], locale, "/", [p.displayWeight, 400]).length;
      if (n > 2) hit("F9", p.id, `${n} preloads in ${locale}`);
    }
    // F11
    if (has(NEVER_DISPLAY_AR, p.displayAr)) hit("F11", p.id, `${p.displayAr} is never an Arabic display face`);
    if (!arDisplayClass(p.displayAr)) hit("F11", p.id, `${p.displayAr} has no structural class`);
    // F13: the Arabic display line-height and padding from the face's Arabic metrics
    const m = arabicMetrics(p.displayAr);
    if (!m) hit("F13", p.id, `${p.displayAr} has neither metrics.ar nor a fallback row`);
    else {
      const tt = typeTokens(p, { type: { rm: 1.2, rd: 1.33, dmax: 96, w: p.displayWeight, wAr: p.displayWeightAr, tk: 0.01, dc: "none", lb: "plain", nu: "lining" } }, "ar");
      if (tt.displayLh < 1.25 || tt.displayPad < 0.12) hit("F13", p.id, `Arabic display lh ${tt.displayLh.toFixed(3)} / pad ${tt.displayPad} (≥ 1.25 / ≥ 0.12 em)`);
      if (p.displayAr === "el-messiri" && tt.displayLh < 1.32) hit("F13", p.id, `tall-mark face ${p.displayAr} at lh ${tt.displayLh.toFixed(3)} (≥ 1.32)`);
    }
    // F14
    if (p.displayAr === "el-messiri" && !has(CONTRAST_SERIFS, p.display)) hit("F14", p.id, `El Messiri beside ${p.display}, not a contrast serif`);
    // F15
    if (opts.ink) {
      const r = opts.ink(p);
      if (r && !r.ok) hit("F15", p.id, `ink-density ratio ${r.ratio.toFixed(3)} outside 0.85-1.15`);
    }
  }

  // F10: every Arabic display face in ≥ 3 archetypes (playful ≥ 2)
  const served = new Map<string, Set<Archetype>>();
  for (const p of cat.pairings) for (const a of pairingArchetypes(p)) (served.get(p.displayAr) ?? served.set(p.displayAr, new Set()).get(p.displayAr)!).add(a);
  for (const [f, s] of served) {
    const need = has(PLAYFUL_AR, f) ? 2 : 3;
    if (s.size < need) hit("F10", f, `Arabic display face in ${s.size} archetype(s) (≥ ${need})`);
  }

  // F11: the roster. Full rule once the DES-R21 Arabic faces ship; the documented fallback roster until then
  const roster = [...served.keys()].filter((f) => !has(PLAYFUL_AR, f));
  const classes = new Map<ArClass, string[]>();
  for (const f of roster) {
    const c = arDisplayClass(f);
    if (c) classes.set(c, [...(classes.get(c) ?? []), f]);
  }
  if (R21_ARABIC.every((f) => f in manifest)) {
    const full = [...classes.values()].filter((v) => v.length >= 2).length;
    if (full < 3) hit("F11", "roster", `${full} structural classes with ≥ 2 faces (≥ 3)`);
    if (roster.length < 8 || classes.size < 4) hit("F11", "roster", `${roster.length} modern display faces in ${classes.size} classes (≥ 8 in ≥ 4)`);
  } else {
    if (roster.length < 6 || classes.size < 3) hit("F11", "roster", `fallback roster: ${roster.length} modern display faces in ${classes.size} classes (≥ 6 in ≥ 3)`);
    hit("F11", "roster", `fallback roster while DES-R21 is pending (${R21_ARABIC.filter((f) => !(f in manifest)).join(", ")} not shipped): ${roster.length} faces in ${classes.size} classes`, "warn");
  }

  // F12: the caps are reachable by the H33 damping with this catalogue
  const { capped } = cappedShares(cat);
  for (const v of concentrationViolations(capped, "platform")) hit("F12", "catalogue", `after the H33 damping: ${v}`);

  // F13 (warn): faces whose Arabic values come from the hand-tuned table
  for (const f of served.keys()) if (arabicMetrics(f)?.source === "fallback") hit("F13", f, `metrics_missing: ${f} uses the tuned fallback (metrics.ar not measured)`, "warn");
  return hits;
}

/** The DES-R21 faces the manifest does not carry yet. */
export const pendingFaces = (manifest: Manifest = FONT_DATA): string[] => PENDING_FONT_IDS.filter((f) => !(f in manifest));
