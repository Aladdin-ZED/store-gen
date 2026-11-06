/**
 * test:i18n-coverage (core §I.5, §I.8 rule 8, D36, D65, D67; PLA-§N.1, §O.1, §22.18 row 8; PL-13, TN-02, TN-05, UX-08):
 * the admin catalogs are complete where R1 promises three languages, consistent everywhere, and free of the AI tells.
 * Pure Node over the catalog modules and the source tree, no build, no DB (≤ 3 s):
 *
 *   npm run test:i18n-coverage           (exit 1 on a failure, 2 when the checker itself is broken)
 *   npx tsx scripts/qa/i18n-coverage.ts --strict          (PENDING items fail too: gate:r1)
 *
 * Checks (every finding names the key, the locale and the file):
 * - `complete`: ar, fr and en hold every key of the R1-complete set: the prefixes `auth.`, `onboarding.`, `team.`,
 *   `shell.`, `health.`, `brief.`, `report.` (P1-10), `error.`, the publish-gate titles (`budget.`, `landing.gate.`,
 *   `design.gate.`, `design.slop.`, `design.copy.`, `design.novelty.`), `design.health.` and the reveal strings
 *   `design.reveal.` (P6-14), every key of P2's six files, P2's own error codes (D65), and `notify.<kind>.title` /
 *   `.body` of every registered tenant kind (`tenant: true` in src/lib/notify/registry.ts).
 * - `gate-source`: a gate title key written as a literal in a publish check (src/lib/render/prepublish/**,
 *   src/lib/design/**, src/lib/landing/**) exists in en.
 * - `used-key`: a P2-prefixed key a P2 surface passes to a translator, or writes as a literal with two dots or more,
 *   exists in en (a typo renders the key itself).
 * - `fr-ops`: every `ops.`, `int.` and `fin.` key exists in fr (rev 3, OD58).
 * - `orphan`: every fr and ar key exists in en.
 * - `placeholders`: the `{var}` set and the plural variables of a key are the same in every locale.
 * - `plural`: a plural block is well formed and has `other`; en and fr have `one`; ar has all six categories (zero,
 *   one, two, few, many, other).
 * - `typography` (every catalog of every track, the base catalogs and console.ts included): no em-dash, no en-dash, no
 *   "Step n" label (en, fr, ar), Latin digits only.
 * - `owners`: a key is declared in one file per locale. The owner is the file: the base catalogs are the maintainer's,
 *   `<locale>/<file>.ts` is its track's (D67), T2's identity catalogs (src/lib/auth/i18n/<locale>.ts) count as one
 *   owner. Two owners fail; one owner's two files fail too (a spread silently keeps one value).
 * - `parse`: the declared keys read from each file's source equal the keys of its module (guards the parser).
 *
 * The coverage per prefix is printed last (the UX-08 report). The checker runs its own fixtures first; a rule that
 * stops firing, or fires on a good fixture, exits 2 before the tree is judged.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { blankComments, lineAt, read, ROOT, scan } from "../../src/lib/admin-theme/lint";

const NAME = "test:i18n-coverage";
const LOCALES = ["en", "fr", "ar"] as const;
type Locale = (typeof LOCALES)[number];

/* ------------------------------------------------------------------ */
/* What R1 promises                                                    */
/* ------------------------------------------------------------------ */

/** Complete in ar, fr and en in R1 (core §I.5; PLA-§N.1, §N.2; DES-§20, LAN-§6.5; P0b P1-10, P6-14). */
export const COMPLETE_PREFIXES = [
  "auth.",
  "onboarding.",
  "team.",
  "shell.",
  "health.",
  "brief.",
  "report.",
  "error.",
  // every publish-gate GateItem.title (core §M.2, LAN-§6.5, DES-§20)
  "budget.",
  "landing.gate.",
  "design.gate.",
  "design.slop.",
  "design.copy.",
  "design.novelty.",
  // design's Store Health sentences and the onboarding reveal (DES-§20, P6-14)
  "design.health.",
  "design.reveal.",
] as const;

/** Gate title prefixes a publish check may write as a literal (the `gate-source` rule). */
export const GATE_PREFIXES = ["budget.", "landing.gate.", "design.gate.", "design.slop.", "design.copy.", "design.novelty."] as const;

/** fr with en in R1 (rev 3, OD58). */
export const FR_PREFIXES = ["ops.", "int.", "fin."] as const;

/** P2's own action codes (D65; PLA-§N.2 rev 3, rev 4): `error.<code>` in ar / fr / en. */
export const P2_ERROR_CODES = ["brand_protected", "category_required", "already_requested", "owns_store", "is_staff", "too_soon"] as const;

/** P2's six files (D67): every key they hold is tenant-facing and R1-complete (PLA-§22 intro). */
export const P2_FILES = ["shell", "auth", "onboarding", "team", "health", "brief"] as const;

/** The track that owns `<locale>/<file>.ts` (core §I.5, D67; §K.2). */
const TRACK_OF_FILE: Readonly<Record<string, string>> = {
  console: "P1",
  notify: "P1",
  shell: "P2",
  auth: "P2",
  onboarding: "P2",
  team: "P2",
  health: "P2",
  brief: "P2",
  landing: "P3",
  ops: "P4",
  finance: "P4",
  integrations: "P5",
  design: "P6",
  ai: "P7",
  storefront: "S1",
};

/** Pending items (warn, fail under --strict), each with its owner and reason. */
interface PendingItem {
  id: string;
  owner: string;
  why: string;
  /** still open? */
  open: (m: Model) => boolean;
}
// R1 P1 merge: "kind health.issue_new" (P1) is done (registered in src/lib/notify/kinds/platform.ts with its texts)
const PENDING: PendingItem[] = [];

/* ------------------------------------------------------------------ */
/* The model the rules judge                                           */
/* ------------------------------------------------------------------ */

export interface CatalogFile {
  /** repo path, forward slashes */
  file: string;
  locale: Locale;
  owner: string;
  /** the file stem for track files ("shell"), "base" or "identity" */
  stem: string;
  /** keys as declared in the source, in order, with their 1-based lines */
  declared: { key: string; line: number }[];
  /** the module's own values */
  values: Record<string, string>;
}

export interface Model {
  files: CatalogFile[];
  /** the merged catalogs the app renders (src/lib/i18n/admin/<locale>.ts) */
  merged: Record<Locale, Record<string, string>>;
  /** registered tenant kinds */
  tenantKinds: string[];
  /** literal gate keys found in publish checks */
  gateLiterals: { key: string; file: string; line: number }[];
  /** P2-prefixed keys used by P2 surfaces */
  usedKeys: { key: string; file: string; line: number }[];
  /** the action codes whose `error.<code>` text is required (P2_ERROR_CODES) */
  errorCodes: readonly string[];
}

export interface Finding {
  rule: string;
  where: string;
  detail: string;
}

/* ------------------------------------------------------------------ */
/* Message syntax                                                      */
/* ------------------------------------------------------------------ */

// the runtime's own grammar (src/lib/i18n/admin/index.ts): `{v}` and `{v, plural, cat {…} … other {…}}`, no nesting
const PLURAL_RE = /\{(\w+),\s*plural,\s*((?:[a-z]+\s*\{[^{}]*\}\s*)+)\}/g;
const FORM_RE = /([a-z]+)\s*\{([^{}]*)\}/g;
const VAR_RE = /\{(\w+)\}/g;

export const AR_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export interface Parsed {
  vars: Set<string>;
  plurals: Map<string, Set<string>>;
  malformed: string | null;
}

export function parseMessage(value: string): Parsed {
  const vars = new Set<string>();
  const plurals = new Map<string, Set<string>>();
  const rest = value.replace(PLURAL_RE, (_whole, name: string, body: string) => {
    const cats = new Set<string>();
    for (const m of body.matchAll(FORM_RE)) {
      cats.add(m[1]!);
      for (const v of m[2]!.matchAll(VAR_RE)) vars.add(v[1]!);
    }
    plurals.set(name, cats);
    vars.add(name);
    return "";
  });
  for (const v of rest.matchAll(VAR_RE)) vars.add(v[1]!);
  const leftover = rest.replace(VAR_RE, "");
  let malformed: string | null = null;
  if (/,\s*plural\s*,/.test(rest)) malformed = "a plural block the runtime can't read (nested braces or a bad category)";
  else if (/[{}]/.test(leftover)) malformed = "an unbalanced or unknown brace";
  return { vars, plurals, malformed };
}

/* ------------------------------------------------------------------ */
/* The rules                                                           */
/* ------------------------------------------------------------------ */

const TYPO_RULES: { re: RegExp; what: string }[] = [
  { re: /—/, what: "an em-dash" },
  { re: /–/, what: "an en-dash" },
  { re: /(?:^|[^\p{L}])(?:step|étape)\s*\d/iu, what: 'a "Step n" label' },
  { re: /الخطوة\s*\d/, what: 'a "Step n" label' },
  { re: /[٠-٩۰-۹]/, what: "Arabic-Indic digits (Latin digits only)" },
];

const startsWithAny = (key: string, prefixes: readonly string[]) => prefixes.some((p) => key.startsWith(p));
const fmt = (s: Set<string>) => `{${[...s].sort().join(", ")}}`;
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** The keys every locale must hold. */
export function requiredKeys(m: Model): Set<string> {
  const req = new Set<string>();
  for (const k of Object.keys(m.merged.en)) if (startsWithAny(k, COMPLETE_PREFIXES)) req.add(k);
  for (const f of m.files)
    if (f.locale === "en" && (P2_FILES as readonly string[]).includes(f.stem) && f.owner === "P2") for (const k of Object.keys(f.values)) req.add(k);
  for (const code of m.errorCodes) req.add(`error.${code}`);
  for (const kind of m.tenantKinds) {
    req.add(`notify.${kind}.title`);
    req.add(`notify.${kind}.body`);
  }
  return req;
}

export function audit(m: Model): Finding[] {
  const out: Finding[] = [];
  const add = (rule: string, where: string, detail: string) => out.push({ rule, where, detail });

  // complete
  for (const key of [...requiredKeys(m)].sort()) {
    for (const l of LOCALES)
      if (m.merged[l][key] === undefined)
        add("complete", `${l} ${key}`, l === "en" ? "required but no catalog declares it" : `missing in ${l} (R1 ships it in ar, fr and en)`);
  }

  // gate titles written in a publish check
  for (const g of m.gateLiterals) if (m.merged.en[g.key] === undefined) add("gate-source", `${g.file}:${g.line}`, `gate title ${g.key} has no catalog text`);

  // keys a P2 surface uses
  for (const u of m.usedKeys) if (m.merged.en[u.key] === undefined) add("used-key", `${u.file}:${u.line}`, `${u.key} is not in the en catalog`);

  // fr for the operations prefixes
  for (const key of Object.keys(m.merged.en))
    if (startsWithAny(key, FR_PREFIXES) && m.merged.fr[key] === undefined) add("fr-ops", `fr ${key}`, "missing in fr (operations ship fr with en in R1)");

  // fr / ar keys exist in en
  for (const l of ["fr", "ar"] as const)
    for (const key of Object.keys(m.merged[l])) if (m.merged.en[key] === undefined) add("orphan", `${l} ${key}`, "not in the en catalog");

  // syntax, placeholders, plural categories
  for (const l of LOCALES) {
    for (const [key, value] of Object.entries(m.merged[l])) {
      const p = parseMessage(value);
      if (p.malformed) add("plural", `${l} ${key}`, p.malformed);
      for (const [name, cats] of p.plurals) {
        const need = l === "ar" ? AR_CATEGORIES : (["one", "other"] as const);
        const missing = need.filter((c) => !cats.has(c));
        if (!cats.has("other") && !missing.includes("other")) missing.push("other");
        if (missing.length) add("plural", `${l} ${key}`, `{${name}, plural} lacks ${missing.join(", ")}`);
      }
      if (l === "en") continue;
      const en = m.merged.en[key];
      if (en === undefined) continue;
      const pe = parseMessage(en);
      if (!sameSet(p.vars, pe.vars)) add("placeholders", `${l} ${key}`, `${fmt(p.vars)} vs en ${fmt(pe.vars)}`);
      const pl = new Set(p.plurals.keys());
      const ple = new Set(pe.plurals.keys());
      if (!sameSet(pl, ple)) add("placeholders", `${l} ${key}`, `plural variables ${fmt(pl)} vs en ${fmt(ple)}`);
    }
  }

  // typography in every file of every track
  for (const f of m.files) {
    for (const [key, value] of Object.entries(f.values)) {
      for (const r of TYPO_RULES)
        if (r.re.test(value)) add("typography", `${f.file}:${f.declared.find((d) => d.key === key)?.line ?? 0}`, `${key} has ${r.what}`);
    }
  }

  // one owner per key and locale
  for (const l of LOCALES) {
    const where = new Map<string, CatalogFile[]>();
    for (const f of m.files.filter((x) => x.locale === l)) for (const d of f.declared) where.set(d.key, [...(where.get(d.key) ?? []), f]);
    for (const [key, files] of where) {
      if (files.length < 2) continue;
      const owners = new Set(files.map((f) => f.owner));
      add("owners", `${l} ${key}`, `${owners.size > 1 ? "two owners" : "declared twice"}: ${files.map((f) => `${f.file} (${f.owner})`).join(", ")}`);
    }
  }

  // the parser reads what the module exports
  for (const f of m.files) {
    if (f.stem === "base") continue; // a base catalog's module also holds the spread keys
    const declared = new Set(f.declared.map((d) => d.key));
    const exported = new Set(Object.keys(f.values));
    if (!sameSet(declared, exported)) add("parse", f.file, `source declares ${declared.size} keys, the module exports ${exported.size}`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reading the tree                                                    */
/* ------------------------------------------------------------------ */

const DECL_RE = /^[ \t]*(["'])([^"'\n]+)\1[ \t]*:/gm;

export function declaredKeys(src: string): { key: string; line: number }[] {
  const clean = blankComments(src, "ts");
  return [...clean.matchAll(DECL_RE)].map((m) => ({ key: m[2]!, line: lineAt(clean, m.index ?? 0) }));
}

function loadModule(rel: string): Record<string, string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(path.join(ROOT, rel)) as { messages?: Record<string, string> };
  return { ...(mod.messages ?? {}) };
}

function catalogFiles(): CatalogFile[] {
  const files: CatalogFile[] = [];
  for (const l of LOCALES) {
    const base = `src/lib/i18n/admin/${l}.ts`;
    files.push({ file: base, locale: l, owner: "maintainer", stem: "base", declared: declaredKeys(read(base)), values: loadModule(base) });
    for (const name of readdirSync(`${ROOT}/src/lib/i18n/admin/${l}`)
      .filter((n) => n.endsWith(".ts"))
      .sort()) {
      const rel = `src/lib/i18n/admin/${l}/${name}`;
      const stem = name.slice(0, -3);
      files.push({ file: rel, locale: l, owner: TRACK_OF_FILE[stem] ?? `the ${stem} file`, stem, declared: declaredKeys(read(rel)), values: loadModule(rel) });
    }
    const identity = `src/lib/auth/i18n/${l}.ts`;
    files.push({ file: identity, locale: l, owner: "T2 identity", stem: "identity", declared: declaredKeys(read(identity)), values: loadModule(identity) });
  }
  // a base catalog's values are its own declarations only (its module also carries the spreads)
  for (const f of files.filter((x) => x.stem === "base")) {
    const own = new Set(f.declared.map((d) => d.key));
    f.values = Object.fromEntries(Object.entries(f.values).filter(([k]) => own.has(k)));
  }
  return files;
}

const GATE_RE = new RegExp(`(["'\`])((?:${GATE_PREFIXES.map((p) => p.replace(/\./g, "\\.")).join("|")})[a-z0-9_.]*[a-z0-9_])\\1`, "gi");

function gateLiterals(): Model["gateLiterals"] {
  const out: Model["gateLiterals"] = [];
  for (const file of scan(["src/lib/render/prepublish", "src/lib/render/prepublish.ts", "src/lib/design", "src/lib/landing"], [".ts", ".tsx"])) {
    const src = blankComments(read(file), "ts");
    for (const m of src.matchAll(GATE_RE)) {
      if (m[1] === "`" && m[0].includes("${")) continue;
      out.push({ key: m[2]!, file, line: lineAt(src, m.index ?? 0) });
    }
  }
  return out;
}

const P2_PREFIX = "(?:auth|onboarding|team|shell|health|brief)";
/** a translator call: t("…"), tr("…"), authT("…"), T("…") */
const CALL_RE = new RegExp(`\\b(?:t|tr|tt|T|authT|translate)\\(\\s*(["'])(${P2_PREFIX}\\.[a-z0-9_.]*[a-z0-9_])\\1`, "g");
/**
 * any literal with two dots or more under a P2 prefix (a key in a config object); not `auth.`, whose literals are
 * also audit actions ("auth.sessions.revoked", src/lib/audit.ts)
 */
const LITERAL_RE = /(["'])((?:onboarding|team|shell|health|brief)\.[a-z0-9_]+\.[a-z0-9_.]*[a-z0-9_])\1/g;

/** The P2 surfaces whose keys must exist (PLA-§P.2; the store dashboard and the public pages). */
const SURFACE_ROOTS = ["src/components/admin/shell", "src/components/admin/common", "src/components/admin/dashboard", "src/app/(public)", "src/app/app"];

function usedKeys(): Model["usedKeys"] {
  const out: Model["usedKeys"] = [];
  for (const file of scan(SURFACE_ROOTS, [".ts", ".tsx"])) {
    if (file.endsWith("selftest.ts")) continue;
    const src = blankComments(read(file), "ts");
    const seen = new Set<string>();
    for (const re of [CALL_RE, LITERAL_RE]) {
      for (const m of src.matchAll(re)) {
        const at = `${m[2]}@${m.index}`;
        if (seen.has(at)) continue;
        seen.add(at);
        out.push({ key: m[2]!, file, line: lineAt(src, m.index ?? 0) });
      }
    }
  }
  return out;
}

function tenantKinds(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const reg = require(path.join(ROOT, "src/lib/notify/registry.ts")) as { NOTIFICATION_KINDS: readonly { kind: string; tenant: boolean }[] };
  return reg.NOTIFICATION_KINDS.filter((k) => k.tenant).map((k) => k.kind);
}

function loadModel(): Model {
  const merged = Object.fromEntries(LOCALES.map((l) => [l, loadModule(`src/lib/i18n/admin/${l}.ts`)])) as Record<Locale, Record<string, string>>;
  return { files: catalogFiles(), merged, tenantKinds: tenantKinds(), gateLiterals: gateLiterals(), usedKeys: usedKeys(), errorCodes: P2_ERROR_CODES };
}

/* ------------------------------------------------------------------ */
/* The coverage report (UX-08)                                         */
/* ------------------------------------------------------------------ */

function prefixOf(key: string): string {
  const parts = key.split(".");
  const two = ["design", "landing", "notify", "health", "shell", "console"].includes(parts[0]!) && parts.length > 2;
  return two ? `${parts[0]}.${parts[1]}.` : `${parts[0]}.`;
}

function coverageTable(m: Model): string[] {
  const required = requiredKeys(m);
  const rows = new Map<string, { n: number; fr: number; ar: number; req: number }>();
  for (const key of Object.keys(m.merged.en)) {
    const p = prefixOf(key);
    const r = rows.get(p) ?? { n: 0, fr: 0, ar: 0, req: 0 };
    r.n++;
    if (required.has(key)) r.req++;
    if (m.merged.fr[key] !== undefined) r.fr++;
    if (m.merged.ar[key] !== undefined) r.ar++;
    rows.set(p, r);
  }
  const pct = (a: number, n: number) => `${Math.floor((a / n) * 100)} %`.padStart(6);
  const lines = [`${"prefix".padEnd(26)}${"en".padStart(6)}${"fr".padStart(8)}${"ar".padStart(8)}  R1`];
  for (const [p, r] of [...rows].sort(([a], [b]) => a.localeCompare(b))) {
    const r1 = r.req === r.n ? "ar fr en" : r.req > 0 ? `ar fr en (${r.req})` : startsWithAny(p, FR_PREFIXES) ? "fr en" : "en";
    lines.push(`${p.padEnd(26)}${String(r.n).padStart(6)}  ${pct(r.fr, r.n)}  ${pct(r.ar, r.n)}  ${r1}`);
  }
  const all = Object.keys(m.merged.en).length;
  lines.push(`${"all".padEnd(26)}${String(all).padStart(6)}  ${pct(Object.keys(m.merged.fr).length, all)}  ${pct(Object.keys(m.merged.ar).length, all)}`);
  return lines;
}

/* ------------------------------------------------------------------ */
/* Fixtures: each rule fires on its bad case and stays quiet on the good one */
/* ------------------------------------------------------------------ */

function fixtureModel(over: {
  en?: Record<string, string>;
  fr?: Record<string, string>;
  ar?: Record<string, string>;
  files?: CatalogFile[];
  kinds?: string[];
  gate?: string[];
  used?: string[];
  codes?: string[];
}): Model {
  const en = over.en ?? {};
  const fr = over.fr ?? {};
  const ar = over.ar ?? {};
  const file = (l: Locale, values: Record<string, string>): CatalogFile => ({
    file: `fixture/${l}/shell.ts`,
    locale: l,
    owner: "P2",
    stem: "shell",
    declared: Object.keys(values).map((key, i) => ({ key, line: i + 1 })),
    values,
  });
  return {
    files: over.files ?? [file("en", en), file("fr", fr), file("ar", ar)],
    merged: { en, fr, ar },
    tenantKinds: over.kinds ?? [],
    gateLiterals: (over.gate ?? []).map((key) => ({ key, file: "fixture/gate.ts", line: 1 })),
    usedKeys: (over.used ?? []).map((key) => ({ key, file: "fixture/page.tsx", line: 1 })),
    errorCodes: over.codes ?? [],
  };
}

const AR6 = "{n, plural, zero {لا شيء} one {واحد} two {اثنان} few {# قليلة} many {# كثيرة} other {# أخرى}}";
const GOOD = {
  en: { "shell.x": "Hello {name}.", "shell.n": "{n, plural, one {# item} other {# items}}" },
  fr: { "shell.x": "Bonjour {name}.", "shell.n": "{n, plural, one {# élément} other {# éléments}}" },
  ar: { "shell.x": "مرحبًا {name}.", "shell.n": AR6 },
};

const FIXTURES: { name: string; model: Model; expect: string[] }[] = [
  { name: "complete trilingual catalog", model: fixtureModel(GOOD), expect: [] },
  { name: "missing ar key", model: fixtureModel({ ...GOOD, ar: { "shell.x": "مرحبًا {name}." } }), expect: ["complete"] },
  { name: "P2 error code without its text", model: fixtureModel({ ...GOOD, codes: ["brand_protected"] }), expect: ["complete"] },
  { name: "tenant kind without its texts", model: fixtureModel({ ...GOOD, kinds: ["store.approved"] }), expect: ["complete"] },
  { name: "gate title without text", model: fixtureModel({ ...GOOD, gate: ["design.gate.N1"] }), expect: ["gate-source"] },
  { name: "used key typo", model: fixtureModel({ ...GOOD, used: ["shell.typo.key"] }), expect: ["used-key"] },
  {
    name: "ops key without fr",
    model: (() => {
      const m = fixtureModel(GOOD);
      m.merged.en = { ...m.merged.en, "ops.queue.title": "Queue" }; // P4's file, not P2's: fr is required, ar is not
      return m;
    })(),
    expect: ["fr-ops"],
  },
  { name: "fr orphan", model: fixtureModel({ ...GOOD, fr: { ...GOOD.fr, "shell.gone": "Parti" } }), expect: ["orphan"] },
  { name: "placeholder renamed", model: fixtureModel({ ...GOOD, fr: { ...GOOD.fr, "shell.x": "Bonjour {nom}." } }), expect: ["placeholders"] },
  {
    name: "ar plural lacks categories",
    model: fixtureModel({ ...GOOD, ar: { ...GOOD.ar, "shell.n": "{n, plural, one {واحد} other {# أخرى}}" } }),
    expect: ["plural"],
  },
  { name: "ar count key without plural", model: fixtureModel({ ...GOOD, ar: { ...GOOD.ar, "shell.n": "{n} عناصر" } }), expect: ["placeholders"] },
  {
    name: "malformed plural",
    model: fixtureModel({ ...GOOD, en: { ...GOOD.en, "shell.n": "{n, plural, one {# {x}} other {#}}" } }),
    expect: ["plural", "placeholders"],
  },
  { name: "em-dash", model: fixtureModel({ ...GOOD, en: { ...GOOD.en, "shell.x": "Hello {name} — welcome." } }), expect: ["typography"] },
  { name: "Step n label", model: fixtureModel({ ...GOOD, fr: { ...GOOD.fr, "shell.x": "Étape 1 : {name}." } }), expect: ["typography"] },
  { name: "Arabic-Indic digits", model: fixtureModel({ ...GOOD, ar: { ...GOOD.ar, "shell.x": "مرحبًا {name} ٣." } }), expect: ["typography"] },
  {
    name: "a key in two owners' files",
    model: (() => {
      const m = fixtureModel(GOOD);
      m.files.push({
        file: "fixture/en/ops.ts",
        locale: "en",
        owner: "P4",
        stem: "ops",
        declared: [{ key: "shell.x", line: 1 }],
        values: { "shell.x": "Hello {name}." },
      });
      return m;
    })(),
    expect: ["owners"],
  },
  {
    name: "parser and module disagree",
    model: (() => {
      const m = fixtureModel(GOOD);
      m.files[0]!.declared = m.files[0]!.declared.slice(1);
      return m;
    })(),
    expect: ["parse"],
  },
];

function selfTest(): string[] {
  const failures: string[] = [];
  for (const f of FIXTURES) {
    const rules = new Set(audit(f.model).map((x) => x.rule));
    if (f.expect.length === 0 && rules.size > 0) failures.push(`good fixture "${f.name}" fired: ${[...rules].join(", ")}`);
    for (const r of f.expect) if (!rules.has(r)) failures.push(`bad fixture "${f.name}" did not fire ${r}`);
    for (const r of rules) if (f.expect.length > 0 && !f.expect.includes(r)) failures.push(`bad fixture "${f.name}" also fired ${r}`);
  }
  // the declaration parser: comments ignored, one key per property line
  const parsed = declaredKeys(`export const messages = {\n  // "nope": "x",\n  "a.b": "x", /* "c": */\n  'd.e':\n    "y",\n};`).map((d) => d.key);
  if (parsed.join() !== "a.b,d.e") failures.push(`declaredKeys read ${parsed.join() || "nothing"}`);
  return failures;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

if (require.main === module) {
  const started = Date.now();
  const strict = process.argv.includes("--strict");
  try {
    const broken = selfTest();
    if (broken.length) {
      for (const b of broken) console.error(`${NAME} self-test: ${b}`);
      process.exit(2);
    }
    const model = loadModel();
    const findings = audit(model);
    const pending = PENDING.filter((p) => p.open(model));
    for (const line of coverageTable(model)) console.log(line);
    for (const p of PENDING) if (!p.open(model)) console.warn(`PENDING ${p.id} (${p.owner}): done, remove the entry`);
    for (const p of pending) console.warn(`${p.id} [${strict ? "FAIL (strict)" : "pending"}: ${p.owner}] ${p.why}`);
    for (const f of findings) console.error(`${f.rule} ${f.where}: ${f.detail}`);
    const failed = findings.length + (strict ? pending.length : 0);
    const required = requiredKeys(model).size;
    console.log(
      `${NAME}: ${model.files.length} catalog files, ${required} keys required in ar / fr / en, ${model.usedKeys.length} used keys, ` +
        `${findings.length} finding(s), ${pending.length} pending${strict ? ", strict" : ""}, ${Date.now() - started} ms: ${failed ? "FAIL" : "OK"}`,
    );
    process.exit(failed ? 1 : 0);
  } catch (err) {
    console.error(`${NAME}: broken:`, err);
    process.exit(2);
  }
}
