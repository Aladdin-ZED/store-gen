/**
 * Normalisation helpers of the platform console (platform.md PLA-§3.4.2; CCR r1.0-m-1). Pure, isomorphic and free of
 * app imports, so a client component (the console's "Check a name" box, the thresholds preview) can use them.
 *
 *   normalizeEmailForIdentity("Salma.B+shop@GoogleMail.com")   // "salmab@gmail.com" (the `email_norm` link only)
 *   brandTokens("face-b00k shop")                               // every look-alike reading: tokens + joined form
 *   matchBrandTerm(brandTokens("Paypa1 Maroc"), { term: "paypal", match: "substring" })   // "exact"
 *
 * Brand folding follows the handle check of src/lib/tenancy/handles.ts (`foldBrand`, `brandFoldings`) so a store name
 * and a handle read the same way: NFKC, lower case, combining marks stripped (`\p{M}`), the look-alike map
 * `0→o 1→i 3→e 4→a 5→s 7→t @→a $→s`, then every reading a person could take (`1→l` instead of `1→i`, `vv→w`,
 * `rn→m`; at most 8). handles.ts is not imported here (its rename functions pull the database into a client graph);
 * `test:platform` pins the two foldings to each other. Arabic text keeps its letters: only NFKC, the tatweel (U+0640)
 * and the diacritics (harakat are `\p{M}`) are removed, and the look-alike map never touches an Arabic letter.
 */

const LOOKALIKE: Readonly<Record<string, string>> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };
const LOOKALIKE_RE = /[013457@$]/g;
const TATWEEL_RE = /ـ/g;
/** a token is a run of a-z, 0-9 and Arabic-block characters; Arabic punctuation (، ؛ ؟ ٪ ٫ ٬ ٭ ۔) separates */
const SEPARATOR_RE = /[^a-z0-9؀-ۿ]+|[،؛؟٪-٭۔]+/g;

/**
 * The e-mail as a duplicate signal (PLA-§3.4.2): NFKC, lower case, `googlemail.com` → `gmail.com`, Gmail dots removed
 * from the local part, every `+tag` dropped. Only for the `email_norm` identity link and `dup_email_norm`: sign-in and
 * uniqueness keep the exact e-mail (core §B.3). Mirrors T2's src/lib/auth/identity.ts, which writes the links
 * (`test:platform` pins the two).
 */
export function normalizeEmailForIdentity(email: string): string {
  const value = email.normalize("NFKC").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return value;
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** `{ local, domain }` of an address (lower case, trimmed; the last "@" splits), or null when there is no "@". */
export function splitEmail(email: string): { local: string; domain: string } | null {
  const value = email.normalize("NFKC").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return { local: value.slice(0, at), domain: value.slice(at + 1) };
}

/** NFKC, lower case, marks stripped (Arabic harakat included), tatweel removed: the base every reading starts from. */
function foldBase(value: string): string {
  return value.normalize("NFKC").toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(TATWEEL_RE, "");
}

/**
 * Every look-alike reading of a value (CCR r1.0-m-1): the `1→i` reading, then `1→l` instead, each with and without
 * `vv→w` and `rn→m`. The same set as handles.ts `brandFoldings` for ASCII input; Arabic letters pass unchanged.
 */
export function brandFoldings(value: string): string[] {
  const base = foldBase(value);
  const out = new Set<string>();
  for (const one of ["i", "l"]) {
    const single = base.replace(LOOKALIKE_RE, (c) => (c === "1" ? one : (LOOKALIKE[c] ?? c)));
    const w = single.replace(/vv/g, "w");
    const m = single.replace(/rn/g, "m");
    out.add(single).add(w).add(m).add(w.replace(/rn/g, "m"));
  }
  return [...out];
}

/** One reading of a value: its tokens and the joined form without separators ("face-b00k" → "facebook"). */
export interface BrandReading {
  tokens: string[];
  joined: string;
}

function readingOf(folded: string): BrandReading {
  const tokens = folded.split(SEPARATOR_RE).filter(Boolean);
  return { tokens, joined: tokens.join("") };
}

/**
 * `brandTokens(s)` (PLA-§3.4.2, CCR r1.0-m-1): the tokens and the joined form of every look-alike reading of `s`,
 * deduplicated. A value "matches" a term when any one reading does (`matchBrandTerm`).
 */
export function brandTokens(value: string): BrandReading[] {
  const seen = new Set<string>();
  const out: BrandReading[] = [];
  for (const folding of brandFoldings(value)) {
    const r = readingOf(folding);
    const key = r.tokens.join(" ");
    if (r.tokens.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * A protected term folded once (handles.ts `foldBrand`: the `1→i` reading only, never the alternatives), so a term
 * typed "Banque Populaire" is the run `banque` `populaire` and the joined `banquepopulaire`.
 */
export function foldTerm(term: string): BrandReading {
  return readingOf(foldBase(term).replace(LOOKALIKE_RE, (c) => LOOKALIKE[c] ?? c));
}

export type BrandTermMatch = "exact" | "substring" | "skeleton";

/**
 * How a value's readings meet one protected term (PLA-§3.4.1):
 * - `"exact"`: a run of consecutive tokens of one reading, joined, equals the joined term. One token ("cih bank" ∋
 *   `cih`), a run ("banque populaire store" ∋ `banque`+`populaire`, "face-b00k-shop" ∋ `face`+`book`) or the whole
 *   value all count. Applies to every match kind (`skeleton` rows match like `exact` until R3, PL-22).
 * - `"near"`: a `substring` term of at least 4 characters appears inside a reading's joined form ("mybankshop" ∋
 *   `bank`). Shorter terms and `exact` terms never answer near.
 * - `null`: no reading meets it.
 */
export function matchBrandTerm(readings: readonly BrandReading[], term: { term: string; match: BrandTermMatch }): "exact" | "near" | null {
  const t = foldTerm(term.term);
  if (t.joined.length < 2) return null;
  let near = false;
  for (const r of readings) {
    for (let i = 0; i < r.tokens.length; i++) {
      let run = "";
      for (let j = i; j < r.tokens.length && run.length < t.joined.length; j++) {
        run += r.tokens[j]!;
        if (run === t.joined) return "exact";
      }
    }
    if (term.match === "substring" && t.joined.length >= 4 && r.joined.includes(t.joined)) near = true;
  }
  return near ? "near" : null;
}
