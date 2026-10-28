/**
 * City keys and city normalisation (P4 CALL CENTER; operations.md OPE-§10.1, OD47; docs/STORE-SAAS.md D68, §K.2 P0).
 *
 * `cityKey()` and `CityKey` are PURE and ISOMORPHIC (no server import), so a chunk MAY bundle them; none is required to
 * (D68, rev 4 CRIT1: every browser zone table is P3's value-keyed `ZoneTable`, built on the server, and no landing
 * add-on imports this file). The slug rule is final at P0 and the shared parity fixture
 * `scripts/qa/fixtures/city-key.json` pins it. `normalizeCity` turns what a person typed into a key: exact (the folded
 * fr / en / ar label), alias (the store's `ops.cityAliases` and a short built-in list), else fuzzy suggestions only
 * (Levenshtein, Latin script). Nothing is ever written from a suggestion without a person (OPE-§10.1).
 *
 * One key everywhere (OD47): `orders.city_key`, `delivery_zones.cities`, `carrier_rates.city_key`, `ops.cityAliases`,
 * the aggregates' `city` dimension. src/lib/db/schema.ts declares the same brand, so the two types are interchangeable.
 */
import { MA_CITIES, OTHER_CITY } from "@/lib/markets/cities-ma";
import type { City } from "@/lib/markets/types";

/** "casablanca", "fes", "ksar-el-kebir": the ONE city key of the platform (OD47) */
export type CityKey = string & { readonly __city: true };

/** The slug of a stored French city value: NFKD, diacritics removed, lowercase, spaces and apostrophes → "-". */
function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[\s'’ʼ`]+/g, "-");
}

const LISTED: readonly City[] = MA_CITIES.filter((c) => c.value !== OTHER_CITY.value);

/** the key set, in list order (a Set keeps insertion order, and a city listed twice counts once) */
const KNOWN: ReadonlySet<string> = new Set(LISTED.map((c) => slug(c.value)));
/** Every key of the Moroccan city list except "Autre", derived from src/lib/markets/cities-ma.ts (each once). */
export const CITY_KEYS: readonly CityKey[] = [...KNOWN] as CityKey[];

/** The key of a stored city value ("Fès" → "fes"); "Autre", a free-text city or a value of no list → null. */
export function cityKey(value: string): CityKey | null {
  const key = slug(value);
  return KNOWN.has(key) ? (key as CityKey) : null;
}

/** The display label of a key: fr = the stored value ("Fès"), en its English spelling when it has one, ar the Arabic name. */
export function cityLabel(key: CityKey, locale: "ar" | "fr" | "en"): string {
  const c = tables().byKey.get(key);
  if (!c) return key;
  return locale === "ar" ? c.ar : locale === "en" ? (c.en ?? c.value) : c.value;
}

/* ------------------------------------------------------------------ */
/* normalizeCity (OPE-§10.1)                                           */
/* ------------------------------------------------------------------ */

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * The matching form of a city name. Latin: NFKD, diacritics removed, lowercase, punctuation and spaces removed.
 * Arabic: tashkeel and tatweel removed, أ إ آ → ا, ة → ه, ى → ي, and a leading "ال" ignored (matching only).
 */
export function foldCity(input: string): string {
  let s = input.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  s = s
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآٱ]/g, "ا") // أ إ آ ٱ → ا (NFKD already split most of them)
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ى/g, "ي"); // ى → ي
  s = s.replace(/[^\p{L}\p{N}]+/gu, "");
  return s.startsWith("ال") && s.length > 3 ? s.slice(2) : s;
}

/** The short built-in alias list: only "casa" (the en / fr spellings of the list are exact matches already). */
export const BUILTIN_CITY_ALIASES: Readonly<Record<string, CityKey>> = { casa: "casablanca" as CityKey };

interface Tables {
  byKey: ReadonlyMap<string, City>;
  /** folded label → key, over fr (= the stored value), en and ar */
  exact: ReadonlyMap<string, CityKey>;
  /** "Autre" in any of its labels */
  other: ReadonlySet<string>;
  /** Latin labels (fr, en) with their folded form, in list order (major cities first): the fuzzy candidates */
  latin: readonly { key: CityKey; label: string; folded: string }[];
}
let built: Tables | null = null;
/** built on first use, so a chunk that bundles only `cityKey` carries none of them (≤ 400 B, OPE-§10.1) */
function tables(): Tables {
  if (built) return built;
  const exact = new Map<string, CityKey>();
  const latin: { key: CityKey; label: string; folded: string }[] = [];
  for (const c of LISTED) {
    const key = slug(c.value) as CityKey;
    for (const label of [c.value, c.fr, c.en, c.ar]) if (label && !exact.has(foldCity(label))) exact.set(foldCity(label), key);
    for (const folded of new Set([c.value, c.en].filter((x): x is string => !!x).map(foldCity))) latin.push({ key, label: c.value, folded });
  }
  built = {
    byKey: new Map(LISTED.map((c) => [slug(c.value), c] as const)),
    exact,
    other: new Set([OTHER_CITY.value, OTHER_CITY.fr, OTHER_CITY.en, OTHER_CITY.ar].filter((x): x is string => !!x).map(foldCity)),
    latin,
  };
  return built;
}

/** Levenshtein distance, stopping early once it exceeds `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export interface CityMatch {
  key: CityKey | null;
  /** the stored French value ("Fès"), "Autre" for the other-city entry, null when nothing matched */
  value: string | null;
  confidence: "exact" | "alias" | "fuzzy" | "none";
  /** fuzzy only: at most 3, closest first, never applied without a person */
  suggestions: { key: CityKey; label: string }[];
}

const NONE: CityMatch = { key: null, value: null, confidence: "none", suggestions: [] };

/**
 * Typed input → a city key: exact (folded fr / en / ar label), alias (`ops.cityAliases` and a short built-in list),
 * else fuzzy suggestions only (Levenshtein ≤ 1 for 4-6 letters, ≤ 2 for 7+, Latin script). Markets without a city list
 * answer "none" (city_key stays NULL, OPE-§10.1). Nothing is written without a person (OPE-§10.1).
 */
export function normalizeCity(input: string, market: string, aliases?: Record<string, CityKey>): CityMatch {
  if (market.trim().toUpperCase() !== "MA") return NONE;
  const folded = foldCity(String(input ?? ""));
  if (!folded) return NONE;
  const t = tables();
  const exact = t.exact.get(folded);
  if (exact) return { key: exact, value: t.byKey.get(exact)!.value, confidence: "exact", suggestions: [] };
  if (t.other.has(folded)) return { key: null, value: OTHER_CITY.value, confidence: "exact", suggestions: [] };
  for (const list of [aliases ?? {}, BUILTIN_CITY_ALIASES]) {
    for (const [typed, key] of Object.entries(list)) {
      if (foldCity(typed) === folded && KNOWN.has(key)) return { key, value: t.byKey.get(key)!.value, confidence: "alias", suggestions: [] };
    }
  }
  if (ARABIC.test(folded) || folded.length < 4) return NONE;
  const max = folded.length >= 7 ? 2 : 1;
  const best = new Map<CityKey, { label: string; d: number; order: number }>();
  t.latin.forEach((c, order) => {
    const d = distance(folded, c.folded, max);
    if (d > max) return;
    const prev = best.get(c.key);
    if (!prev || d < prev.d) best.set(c.key, { label: c.label, d, order: prev?.order ?? order });
  });
  const suggestions = [...best.entries()]
    .sort((a, b) => a[1].d - b[1].d || a[1].order - b[1].order)
    .slice(0, 3)
    .map(([key, v]) => ({ key, label: v.label }));
  return suggestions.length ? { key: null, value: null, confidence: "fuzzy", suggestions } : NONE;
}
