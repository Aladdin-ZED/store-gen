/**
 * City keys and city normalisation (P4 CALL CENTER; operations.md OPE-§10.1; docs/STORE-SAAS.md D68, §K.2 P0).
 *
 * `cityKey()` and `CityKey` are PURE and ISOMORPHIC (no server import), so a chunk MAY bundle them; none is required to
 * (D68, rev 4 CRIT1: every browser zone table is P3's value-keyed `ZoneTable`, built on the server, and no landing
 * add-on imports this file). The slug rule is final at P0 and the shared parity fixture
 * `scripts/qa/fixtures/city-key.json` pins it; `normalizeCity` (exact, alias, fuzzy suggestions) is P4's typed stub.
 *
 * One key everywhere (OD47): `orders.city_key`, `delivery_zones.cities`, `carrier_rates.city_key`, `ops.cityAliases`,
 * the aggregates' `city` dimension. src/lib/db/schema.ts declares the same brand, so the two types are interchangeable.
 */
import { MA_CITIES, OTHER_CITY } from "@/lib/markets/cities-ma";

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

/** Every key of the Moroccan city list except "Autre", derived from src/lib/markets/cities-ma.ts. */
export const CITY_KEYS: readonly CityKey[] = MA_CITIES.filter((c) => c.value !== OTHER_CITY.value).map((c) => slug(c.value) as CityKey);
const KNOWN: ReadonlySet<string> = new Set<string>(CITY_KEYS);

/** The key of a stored city value ("Fès" → "fes"); "Autre", a free-text city or a value of no list → null. */
export function cityKey(value: string): CityKey | null {
  const key = slug(value);
  return KNOWN.has(key) ? (key as CityKey) : null;
}

/**
 * Typed input → a city key: exact (folded fr / en / ar label), alias (`ops.cityAliases` and a short built-in list),
 * else fuzzy suggestions only (Levenshtein, Latin script). Nothing is written without a person (OPE-§10.1).
 */
export function normalizeCity(
  input: string,
  market: string,
  aliases?: Record<string, CityKey>,
): { key: CityKey | null; value: string | null; confidence: "exact" | "alias" | "fuzzy" | "none"; suggestions: { key: CityKey; label: string }[] } {
  void input;
  void market;
  void aliases;
  throw new Error("not implemented: P4 normalizeCity");
}
