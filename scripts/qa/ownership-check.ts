/**
 * Ownership check (`test:ownership`, docs/STORE-SAAS.md §J.1 rev 3 ENGC-8, rev 5 CRIT2-22): "two tracks never own one
 * file" (§K.3) as a mechanical check. No database, no network, no git (except --write-baseline):
 *
 *   npm run test:ownership                                   (exit 1 on a finding of the current phase, 2 when broken)
 *   npx tsx scripts/qa/ownership-check.ts --phase R1         (also judge a later phase's rows strictly, e.g. at P0)
 *   npx tsx scripts/qa/ownership-check.ts --owner <path>     (who owns this path in each phase, and why)
 *   npx tsx scripts/qa/ownership-check.ts --rows [T3]        (the parsed rows: every include / exclude pattern)
 *   npx tsx scripts/qa/ownership-check.ts --verbose          (also list the paths a specific claim took from a glob)
 *   npx tsx scripts/qa/ownership-check.ts --json             (one JSON document on stdout)
 *   npx tsx scripts/qa/ownership-check.ts --write-baseline --phase R1 [--at <rev>]
 *                                                            (maintainer, at a phase start: writes the manifest)
 *
 * Sources, parsed on every run (so a row edited in the spec is checked the same day):
 * - core §K.1 (the C0 table's (b) rows = C0b; the T1-T4 "Owns" column), §K.2 (P1-P8 "Owns"), §K.4 (S1-S7 "Main
 *   areas"), §K.3's maintainer list (every phase);
 * - the six parts' ownership sections (PLA-§P, LAN-§26, OPE-§P, AI-§R, DES-§26, STO-§27): tables and the paragraphs or
 *   bullets under a heading that names a track.
 * Only backticked paths count. A row's text is read as the specs write it: `a/{b,c}/**` braces; `except` / `outside`
 * (in or out of parentheses, up to the next `;` or `:`) with relative paths resolved against the glob they follow;
 * the shorthands `nav` / `commands` / `i18n` / `jobs` + a file name; "`x` is P4's" / "is **not** P6's" removes `x` from
 * the row; any other parenthesis is commentary, and so is a sentence that starts with "Read-only", "Not", "Reads",
 * another track's name, or a clause after "never" / "imports".
 *
 * The rule (phase = R1.0 T1-T4 + C0b, R1 P1-P8, R2 S1-S7, R3 D1-D5; the maintainer's rows apply in every phase):
 * a path's owner is the strongest claim, in this order: a track's specific path (no `**`, no `*` in the file name) ·
 * the maintainer's specific path · a track's glob · the maintainer's glob. Two tracks at the strongest level is a
 * finding ("two tracks of the same phase"), whatever the files on disk; so is a file that is new since the phase began
 * (not in docs/saas/ownership-baseline.json) and that no row of the current phase claims (not judged in an archive
 * build without `.git`, whose commit the gate already judged). Overlaps are looked for on every working-tree file
 * (honouring .gitignore) and on a witness path made from every pattern of every phase, so a glob intersection is
 * found before either track writes a file. The current phase (the manifest's) fails the run;
 * later phases print warnings until their contract step makes them current (or `--phase` names them).
 * A missing or unparsable manifest fails the run, never a silent pass. P0b review F-7: a file the root .gitignore
 * re-includes (a `!` rule naming a file, e.g. `!/qa/design-corpus/labels.json`) is meant to be committed, so it must be
 * owned in the current phase (or be in the manifest) before anyone writes it: otherwise the first commit of it fails.
 */
import path from "node:path";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { z } from "zod";

const ROOT = path.resolve(__dirname, "..", "..").replace(/\\/g, "/");
const BASELINE_FILE = "docs/saas/ownership-baseline.json";
const CORE = "docs/STORE-SAAS.md";

const PHASES = ["R1.0", "R1", "R2", "R3"] as const;
type Phase = (typeof PHASES)[number];
type Tier = "track" | "maintainer";

/** Tracks per phase (§K.1, §K.2, §K.4, §K.5). C0a merged at the R1.0 phase start, so its rows own nothing in R1.0. */
const TRACKS: Record<Phase, readonly string[]> = {
  "R1.0": ["C0b", "T1", "T2", "T3", "T4"],
  R1: ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
  R2: ["S1", "S2", "S3", "S4", "S5", "S6", "S7"],
  R3: ["D1", "D2", "D3", "D4", "D5"],
};
/** Tracks whose rows name paths; the parser is broken when one of them ends up with no pattern (exit 2). */
const MUST_HAVE_ROWS = ["C0b", "T1", "T2", "T3", "T4", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "S1", "S2", "S3", "S4", "S5", "S7", "D2", "D3", "D4", "D5"];
const TRACK_RE = /\b(C0[ab]?|T[1-4]|P[1-8]|S[1-7]|D[1-5])\b/;

function phaseOf(owner: string): Phase {
  if (owner.startsWith("C0") || owner.startsWith("T")) return "R1.0";
  if (owner.startsWith("P")) return "R1";
  if (owner.startsWith("S")) return "R2";
  return "R3";
}

/* ------------------------------------------------------------------ */
/* patterns                                                           */
/* ------------------------------------------------------------------ */

interface Pattern {
  glob: string;
  re: RegExp;
  /** no `**` and no `*` in the file name: a named file (a `<locale>` directory still counts as named) */
  specific: boolean;
  excludes: Pattern[];
}

interface Row {
  owner: string; // "T3", "P1", "maintainer"
  tier: Tier;
  phases: readonly Phase[];
  source: string; // "core §K.2", "LAN-§26.1"
  includes: Pattern[];
  /** row-level removals: "`x` is the maintainer's" */
  excludes: Pattern[];
}

/** `a/{b,c/{d,e}}/f` → every alternative (nested, items trimmed). */
export function expandBraces(glob: string): string[] {
  const open = glob.indexOf("{");
  if (open < 0) return [glob];
  let depth = 0;
  let close = -1;
  const commas: number[] = [];
  for (let i = open; i < glob.length; i++) {
    const c = glob[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    } else if (c === "," && depth === 1) commas.push(i);
  }
  if (close < 0) return [glob.replace(/[{}]/g, "")];
  const parts: string[] = [];
  let start = open + 1;
  for (const c of [...commas, close]) {
    parts.push(glob.slice(start, c).trim());
    start = c + 1;
  }
  const head = glob.slice(0, open);
  const tail = glob.slice(close + 1);
  return parts.flatMap((p) => expandBraces(head + p + tail));
}

/** Spec placeholders (`<locale>`, `<track>`, `<n>`) are one path segment or a part of one. */
const unplaceholder = (g: string) => g.replace(/<[a-zA-Z_-]+>/g, "*");

/** A directory written without a glob (`src/lib/storage`, `api/health`) means everything under it. */
function asDirGlob(g: string): string {
  const last = g.split("/").at(-1) ?? "";
  if (g.endsWith("/")) return `${g}**`;
  if (!last.includes(".") && !last.includes("*") && !/\[.*\]$/.test(last)) return `${g}/**`;
  return g;
}

export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      const after = glob[i + 2];
      if (after === "/") {
        out += "(?:[^/]+/)*"; // "a/**/b": zero or more directories
        i += 2;
      } else {
        out += ".+"; // "a/**": anything below
        i += 1;
      }
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

function makePattern(glob: string): Pattern {
  const g = asDirGlob(unplaceholder(glob.trim()));
  const last = g.split("/").at(-1) ?? "";
  return { glob: g, re: globToRegExp(g), specific: !g.includes("**") && !last.includes("*"), excludes: [] };
}

const ROOTS = /^(src|scripts|docs|drizzle|public|php|edge|qa)\//;
const TOP_FILES = /^(package(-lock)?\.json|next\.config\.ts|tsconfig\.json|drizzle\.config\.ts|eslint\.config\.mjs|\.gitignore|AGENTS\.md|CLAUDE\.md|README\.md)$/;
const EXT = /\.(tsx?|mts|mjs|cjs|js|json|md|css|sql|sha256|txt|xml|webmanifest|html|ya?ml|png|svg|ico|woff2?|php)$/;

/** A backticked span that names a path (not `createOrderRow(draft, ctx)`, `x-sg-path`, `create.ts:255-300`). */
function isPathLike(s: string): boolean {
  if (!s || /[`:'"=;<>]/.test(s.replace(/<[a-zA-Z_-]+>/g, "")) || /\s/.test(s.replace(/\{[^}]*\}/g, ""))) return false;
  if (/^[\w.-]+\(/.test(s) || s.includes("${")) return false; // a call or a template, not a route group
  if (/^[/@]/.test(s) || /^[A-Z][A-Z0-9_]*\//.test(s)) return false; // a URL path ("/p"), a package ("@x/y"), an env area ("DATA_DIR/x")
  if (ROOTS.test(s) || TOP_FILES.test(s)) return true;
  const last = s.replace(/\{[^}]*\}/g, "x").split("/").at(-1) ?? "";
  return s.includes("/") ? /^[\w.[\]()*@+-]+$/.test(last) || s.endsWith("/**") : EXT.test(last) || /\*/.test(last);
}
const isAbsolute = (s: string) => ROOTS.test(s) || TOP_FILES.test(s);

/** The static directory a glob starts with: `src/lib/{a,b}/**` → `src/lib/`. */
function staticDir(glob: string): string {
  const cut = glob.search(/[*{<]/);
  const head = cut < 0 ? glob : glob.slice(0, cut);
  const slash = head.lastIndexOf("/");
  if (cut < 0 && !EXT.test(glob.split("/").at(-1) ?? "")) return glob.endsWith("/") ? glob : `${glob}/`;
  return slash < 0 ? "" : head.slice(0, slash + 1);
}

/** `team/{agents,callcenter}/**` after `src/app/app/[store]/team/**` → `src/app/app/[store]/team/{agents,callcenter}/**`. */
function resolveRelative(rel: string, base: string): string {
  const segs = base.split("/").filter(Boolean);
  const first = rel.split("/")[0];
  if (first && segs.at(-1) === first) segs.pop();
  return segs.length ? `${segs.join("/")}/${rel}` : rel;
}

const SHORTHAND: Record<string, string> = {
  nav: "src/components/admin/shell/nav/",
  commands: "src/components/admin/shell/commands/",
  i18n: "src/lib/i18n/admin/<locale>/",
  jobs: "src/lib/jobs/tracks/",
};

/* ------------------------------------------------------------------ */
/* row text → patterns                                                */
/* ------------------------------------------------------------------ */

interface Token {
  code: boolean;
  text: string;
}

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  const parts = s.split("`");
  parts.forEach((p, i) => {
    if (i % 2 === 1) out.push({ code: true, text: p });
    else if (p) out.push({ code: false, text: p.replace(/\*\*/g, "") });
  });
  return out;
}

/** "`x` is P4's", "`x` stays landing's", "`x` is **not** P6's" (a part name such as "landing" is never the row's track code). */
const POSSESSIVE = /^\s*(?:[\w./-]+\s+){0,4}?(?:is|are|stays?|remains?)\s+(not\s+)?(?:the\s+)?([\w-]+)['’]s?(?=[\s,.;)/]|$)/i;
const NEG_SENTENCE = /^\s*(?:[-*]\s+)?(?:\(?rev \d[^)]*\)?\s*)?(read-only|reads?\b|not\b|none\b|this part edits no|ownership boundaries|delivered for|shared with|imports? of|expected ccrs|overlap check)/i;
const NEG_CLAUSE = /\b(never|imports?|imported|reads?|consumed|called|appends?)\b/i;
/** "`x` … through the maintainer": a change the row's track asks for, not a file it owns. */
const VIA_MAINTAINER = /^[^`;]*?\bthrough the maintainer\b/i;
const DOES_NOT_EXIST = /\bdo(?:es)?\s+not\s+exist\b/i;

/**
 * Turn one row's text into include and row-level exclude patterns (see the header for the reading rules).
 * `owner` is the row's track: "`x` is P4's" removes `x` from any other track's row.
 */
export function parseOwnText(text: string, owner: string): { includes: Pattern[]; excludes: Pattern[] } {
  const includes: Pattern[] = [];
  const excludes: Pattern[] = [];
  const tokens = tokenize(text);
  type Paren = { mode: "except" | "ignore" };
  const parens: Paren[] = [];
  let exceptMode = false; // outside parentheses
  let sentenceNeg = false;
  let clauseNeg = false;
  let sentenceStart = true;
  let base = ""; // static dir of the last absolute include
  let lastInclude: Pattern | null = null;
  let shorthand: string[] | null = null;
  let othersNext = false;
  let insideNext = false;

  const inExcept = () => (parens.length ? parens.at(-1)!.mode === "except" : exceptMode);
  const ignoring = () => parens.length > 0 && parens.at(-1)!.mode === "ignore";

  for (let ti = 0; ti < tokens.length; ti++) {
    const tok = tokens[ti]!;
    if (!tok.code) {
      // walk the text: parentheses, clause and sentence boundaries, the words that switch modes
      const t = tok.text;
      let outside = ""; // this text's characters outside any parenthesis
      for (let i = 0; i < t.length; i++) {
        const c = t[i]!;
        const rest = t.slice(i + 1);
        if (!parens.length && c !== "(") outside += c;
        if (c === "(") {
          const mode = /^\s*(except|outside)\b/i.test(rest) || /^\s*not\b/i.test(rest) ? "except" : "ignore";
          parens.push({ mode });
        } else if (c === ")") parens.pop();
        else if (c === ";") {
          if (parens.length) {
            if (parens.at(-1)!.mode === "except") parens.at(-1)!.mode = "ignore";
          } else {
            exceptMode = false;
            clauseNeg = false;
            shorthand = null;
          }
        } else if (c === ":" && !parens.length) {
          exceptMode = false;
          clauseNeg = false;
        } else if (c === "." && !parens.length && (/^\s+(?=[A-Z(*])/.test(rest) || /^\s*$/.test(rest) && ti === tokens.length - 1)) {
          exceptMode = false;
          clauseNeg = false;
          sentenceNeg = false;
          sentenceStart = true;
          shorthand = null;
        }
        if (sentenceStart && /\S/.test(c) && c !== "." && !parens.length) {
          const sentence = t.slice(i);
          const named = TRACK_RE.exec(sentence.slice(0, 30));
          sentenceNeg =
            NEG_SENTENCE.test(sentence) ||
            DOES_NOT_EXIST.test(sentence.split(/\.\s/)[0] ?? "") ||
            (!!named && named.index < 3 && normOwner(named[1]!) !== owner && owner !== "maintainer");
          sentenceStart = false;
        }
      }
      // "except" / "outside" and the clause negations count outside parentheses only (the last one in the text wins)
      const last = [...outside.matchAll(/\b(except|outside)\b|[;:]/gi)].at(-1);
      if (last && /except|outside/i.test(last[0]!)) exceptMode = true;
      const lastNeg = [...outside.matchAll(/[;:]|\b(never|imports?|imported|reads?|consumed|called|appends?)\b/gi)].at(-1);
      if (lastNeg && NEG_CLAUSE.test(lastNeg[0]!)) clauseNeg = true;
      // "inside D4's `src/landing/sections/**` glob", "P3's `orderForm/**` and `thankyou/**`", "the frozen `sticky.ts`":
      // the next paths are named as someone else's (a joiner keeps the mark for the next path of the list)
      const pre = /\b(maintainer|core|C0[ab]?|T[1-4]|P[1-8]|S[1-7]|D[1-5])['’]s\s*$/i.exec(t);
      if (pre) othersNext = normOwner(pre[1]!) !== owner;
      else if (/\bfrozen\s*$/i.test(t)) othersNext = true;
      else if (!/^\s*(?:,|and|or|\/|\+)?\s*$/i.test(t)) othersNext = false;
      if (!parens.length) {
        // the shorthand before a bare file name: "nav `console.ts`", "nav/i18n/jobs `landing.ts`", "+ `notify.ts`"
        const sh = /(?:^|[\s,(;])((?:nav|commands|i18n|jobs)(?:\/(?:nav|commands|i18n|jobs))*)\s*$/.exec(t);
        if (sh) shorthand = sh[1]!.split("/");
        else if (!/^\s*\+\s*$/.test(t) && !/^\s*$/.test(t)) shorthand = null;
      }
      insideNext = /\binside\s*$/i.test(t);
      continue;
    }

    // a code span
    const raw = tok.text.trim();
    if (!isPathLike(raw) && !(inExcept() && /^\([\w-]+\)(?:\/\S*)?$/.test(raw))) continue; // "outside `(editor)`"
    const next = tokens[ti + 1];
    const poss = next && !next.code ? POSSESSIVE.exec(next.text) : null;
    let resolved: string[];
    if (isAbsolute(raw)) resolved = [raw];
    else if (shorthand && !raw.includes("/")) resolved = shorthand.map((k) => SHORTHAND[k] + raw);
    else resolved = [resolveRelative(raw, base)];

    if (poss) {
      const named = normOwner(poss[2]!);
      const not = !!poss[1];
      if ((not && named === owner) || (!not && named !== owner)) {
        for (const r of resolved) excludes.push(makePattern(r));
        continue;
      }
    }
    if (inExcept() && lastInclude) {
      const under = isAbsolute(raw) ? resolved.every((r) => r.startsWith(staticDir(lastInclude!.glob))) : true;
      if (under) {
        for (const r of resolved) for (const g of expandBraces(r)) lastInclude.excludes.push(makePattern(g));
        continue;
      }
      exceptMode = false; // an absolute path elsewhere ends the except list
    }
    const after = next && !next.code ? next.text : "";
    if (ignoring()) {
      // "(inside `src/lib/design/**`, already P6's): `sheets.ts`, …": the folder the next bare names live in
      if (insideNext && isAbsolute(raw)) base = staticDir(raw);
      continue;
    }
    if (sentenceNeg || clauseNeg || othersNext || DOES_NOT_EXIST.test(after.slice(0, 30)) || VIA_MAINTAINER.test(after)) continue;
    for (const r of resolved) {
      for (const g of expandBraces(r)) {
        const p = makePattern(g);
        includes.push(p);
        lastInclude = p;
      }
      if (isAbsolute(raw)) base = staticDir(r); // bare names keep resolving against the last full path
    }
  }
  return { includes, excludes };
}

function normOwner(code: string): string {
  if (/^maintainer|core$/i.test(code)) return "maintainer";
  if (code === "C0") return "C0b"; // DES-§26 "R1.0 · C0 (design lead, docs only)": DESIGN v3 is a C0b row (§K.1)
  return code;
}

/* ------------------------------------------------------------------ */
/* spec sources                                                       */
/* ------------------------------------------------------------------ */

class SpecError extends Error {}

function read(file: string): string {
  try {
    return readFileSync(`${ROOT}/${file}`, "utf8").replace(/\r\n/g, "\n");
  } catch {
    throw new SpecError(`${file} is missing`);
  }
}

/** The lines of a markdown section: from the heading matching `start` to the next heading of the same or a higher level. */
function section(doc: string, file: string, start: RegExp): string[] {
  const lines = doc.split("\n");
  const i = lines.findIndex((l) => start.test(l));
  if (i < 0) throw new SpecError(`${file}: section ${start} not found`);
  const level = /^#+/.exec(lines[i]!)![0].length;
  let j = i + 1;
  while (j < lines.length && !(new RegExp(`^#{1,${level}} `).test(lines[j]!))) j++;
  return lines.slice(i, j);
}

/** Split a markdown table row into cells (`\|` and pipes inside backticks stay in the cell). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let tick = false;
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (c === "`") {
      tick = !tick;
      cur += c;
    } else if (c === "|" && !tick) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

interface TableRow {
  first: string;
  own: string;
}

/** Every table in `lines` with a column whose header matches `col`: its rows' first cell and that column. */
function tables(lines: string[], col: RegExp): TableRow[] {
  const out: TableRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith("|") || !lines[i + 1]?.startsWith("|---")) continue;
    const head = cells(lines[i]!);
    const k = head.findIndex((h) => col.test(h));
    let j = i + 2;
    for (; j < lines.length && lines[j]!.startsWith("|"); j++) {
      if (k < 0) continue;
      const c = cells(lines[j]!);
      out.push({ first: c[0] ?? "", own: c[k] ?? "" });
    }
    i = j;
  }
  return out;
}

function addRow(rows: Row[], owner: string, source: string, text: string, phases?: readonly Phase[]): void {
  const o = normOwner(owner);
  const { includes, excludes } = parseOwnText(text, o);
  if (!includes.length && !excludes.length) return;
  const tier: Tier = o === "maintainer" ? "maintainer" : "track";
  rows.push({ owner: o, tier, phases: phases ?? (tier === "maintainer" ? PHASES : [phaseOf(o)]), source, includes, excludes });
}

function phasesNamed(text: string): Phase[] | undefined {
  const m = /\bR(1\.0|1|2|3)\b/.exec(text);
  return m ? [`R${m[1]}` as Phase] : undefined;
}

function coreRows(rows: Row[]): void {
  const doc = read(CORE);
  // §K.1: the C0 table ((b) rows are C0b's; (a) rows merged at the phase start) and the T1-T4 table
  const k1 = section(doc, CORE, /^### K\.1 /);
  const c0Start = k1.findIndex((l) => /^\| File \| Content at C0 exit/.test(l));
  if (c0Start < 0) throw new SpecError(`${CORE}: §K.1 C0 table not found`);
  for (let j = c0Start + 2; j < k1.length && k1[j]!.startsWith("|"); j++) {
    const file = cells(k1[j]!)[0] ?? "";
    // each path takes the marker of the next top-level "(a…)" / "(b…)" parenthesis after it
    let pending = "";
    let depth = 0;
    let marker: string | null = null;
    let tick = false;
    for (let i = 0; i < file.length; i++) {
      const c = file[i]!;
      if (c === "`") tick = !tick;
      else if (!tick && c === "(") {
        if (depth === 0) marker = /^\((a|b)\b/.exec(file.slice(i))?.[1] ?? null;
        depth++;
      } else if (!tick && c === ")") {
        depth--;
        if (depth === 0 && marker) {
          if (marker === "b") addRow(rows, "C0b", "core §K.1 C0 (b)", pending, ["R1.0"]);
          pending = "";
          marker = null;
          continue;
        }
      }
      if (!marker) pending += c;
    }
  }
  for (const r of tables(k1, /^Owns\b/)) {
    const code = TRACK_RE.exec(r.first)?.[1];
    if (code) addRow(rows, code, "core §K.1", r.own);
  }
  for (const r of tables(section(doc, CORE, /^### K\.2 /), /^Owns$/)) {
    const code = TRACK_RE.exec(r.first)?.[1];
    if (code) addRow(rows, code, "core §K.2", r.own);
  }
  const k3 = section(doc, CORE, /^### K\.3 /).join("\n");
  const shared = /Owned by the maintainer for the whole of R1 product[^:]*:([\s\S]*?)A track needing a change/.exec(k3);
  if (!shared) throw new SpecError(`${CORE}: §K.3 maintainer list not found`);
  addRow(rows, "maintainer", "core §K.3", shared[1]!);
  for (const r of tables(section(doc, CORE, /^### K\.4 /), /^Main areas$/)) {
    const code = TRACK_RE.exec(r.first)?.[1];
    if (code) addRow(rows, code, "core §K.4", r.own);
  }
}

const PARTS: { file: string; start: RegExp; tag: string }[] = [
  { file: "docs/saas/spec/platform.md", start: /^## PLA-§P\. /, tag: "PLA-§P" },
  { file: "docs/saas/spec/landing.md", start: /^## LAN-§26 /, tag: "LAN-§26" },
  { file: "docs/saas/spec/operations.md", start: /^## OPE-§P\. /, tag: "OPE-§P" },
  { file: "docs/saas/spec/ai.md", start: /^## AI-§R /, tag: "AI-§R" },
  { file: "docs/saas/spec/design.md", start: /^## DES-§26 /, tag: "DES-§26" },
  { file: "docs/saas/spec/storefront.md", start: /^## STO-§27 /, tag: "STO-§27" },
];
/** Paragraphs that end a subsection's ownership list ("Build order inside P7:", "R1 exit", "Wave 1 (…"). */
const STOP_BLOCK = /^\s*(?:\d+\.\s+)?(build order|merge order|order inside|r\d(?:\.0)? exit|wave \d)/i;

function ownerOfHeading(h: string): { owner: string; phases?: Phase[] } | null {
  const text = h.replace(/^#+\s*\S+\s*/, ""); // drop "### PLA-§P.1"
  const code = TRACK_RE.exec(text)?.[1];
  if (code) return { owner: code };
  if (/maintainer/i.test(text)) return { owner: "maintainer", phases: phasesNamed(text) };
  return null;
}

function partRows(rows: Row[]): void {
  for (const part of PARTS) {
    const lines = section(read(part.file), part.file, part.start);
    let ctx: { owner: string; phases?: Phase[] } | null = null;
    let sub = part.tag;
    let stopped = false;
    let block: string[] = [];
    const flush = () => {
      const text = block.join(" ").trim();
      block = [];
      if (!text || !ctx || stopped) return;
      if (STOP_BLOCK.test(text.replace(/\*\*/g, ""))) {
        stopped = true;
        return;
      }
      if (NEG_SENTENCE.test(text.replace(/\*\*/g, ""))) return;
      addRow(rows, ctx.owner, sub, text, ctx.phases);
    };
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^#{3,} /.test(line)) {
        flush();
        ctx = ownerOfHeading(line);
        sub = /§[\w.]+/.exec(line)?.[0] ? `${part.tag.split("-§")[0]}-${/§[\w.]+/.exec(line)![0]}` : part.tag;
        stopped = false;
        continue;
      }
      if (line.startsWith("|")) {
        flush();
        if (!lines[i + 1]?.startsWith("|---")) continue;
        const head = cells(line);
        const k = head.findIndex((h) => /^(owns|paths)\b/i.test(h));
        let j = i + 2;
        for (; j < lines.length && lines[j]!.startsWith("|"); j++) {
          if (k < 0) continue;
          const c = cells(lines[j]!);
          const first = c[0] ?? "";
          const code = TRACK_RE.exec(first)?.[1];
          if (code) addRow(rows, code, sub, c[k] ?? "");
          else if (/maintainer/i.test(first)) addRow(rows, "maintainer", sub, c[k] ?? "", phasesNamed(first));
          else if (ctx) addRow(rows, ctx.owner, sub, c[k] ?? "", ctx.phases);
        }
        i = j - 1;
        continue;
      }
      if (!line.trim() || /^\s*(?:[-*]|\d+\.)\s/.test(line)) flush();
      if (line.trim()) block.push(line.trim());
    }
    flush();
  }
}

/** Ownership the contract states outside the §K tables (each cites its section). */
function contractRows(rows: Row[]): void {
  const add = (owner: string, phases: readonly Phase[], source: string, globs: string[]) =>
    rows.push({ owner, tier: owner === "maintainer" ? "maintainer" : "track", phases, source, includes: globs.flatMap(expandBraces).map(makePattern), excludes: [] });
  // §K.1 rules / §K.3: "a track ... writes a note in docs/saas/ccr/<release>-<track>-<n>.md"
  for (const phase of PHASES) {
    for (const t of TRACKS[phase]) add(t, [phase], "core §K.1 / §K.3 (CCR notes)", [`docs/saas/ccr/{r1.0,r1,r2,r3}-${t.toLowerCase()}-*.md`]);
  }
  // §K.3: the maintainer's own notes (the CCRs it files while applying the tracks' ones, e.g. r1.0-m-3)
  add("maintainer", PHASES, "core §K.3 (maintainer CCR notes)", ["docs/saas/ccr/{r1.0,r1,r2,r3}-m-*.md"]);
}

export function loadRows(): Row[] {
  const rows: Row[] = [];
  coreRows(rows);
  partRows(rows);
  contractRows(rows);
  const owners = new Set(rows.filter((r) => r.includes.length).map((r) => r.owner));
  const missing = MUST_HAVE_ROWS.filter((t) => !owners.has(t));
  if (missing.length) throw new SpecError(`no ownership rows parsed for ${missing.join(", ")}: the spec layout changed or the parser broke`);
  return rows;
}

/* ------------------------------------------------------------------ */
/* resolution                                                         */
/* ------------------------------------------------------------------ */

interface Claim {
  owner: string;
  tier: Tier;
  specific: boolean;
  pattern: string;
  source: string;
}

const rank = (c: Claim) => (c.specific ? (c.tier === "track" ? 4 : 3) : c.tier === "track" ? 2 : 1);

function claimsFor(rows: Row[], phase: Phase, file: string): Claim[] {
  const out: Claim[] = [];
  for (const r of rows) {
    if (!r.phases.includes(phase)) continue;
    if (r.excludes.some((x) => x.re.test(file))) continue;
    for (const p of r.includes) {
      if (!p.re.test(file) || p.excludes.some((x) => x.re.test(file))) continue;
      out.push({ owner: r.owner, tier: r.tier, specific: p.specific, pattern: p.glob, source: r.source });
    }
  }
  return out;
}

interface Resolution {
  owners: string[]; // the strongest level's distinct owners (≥ 2 = a finding)
  claims: Claim[];
  overridden: Claim[]; // weaker claims of other owners (a specific path inside another track's glob)
}

function resolve(rows: Row[], phase: Phase, file: string): Resolution | null {
  const claims = claimsFor(rows, phase, file);
  if (!claims.length) return null;
  const top = Math.max(...claims.map(rank));
  const owners = [...new Set(claims.filter((c) => rank(c) === top).map((c) => c.owner))];
  const overridden = claims.filter((c) => rank(c) < top && !owners.includes(c.owner));
  return { owners, claims, overridden };
}

/** A concrete path inside a pattern: `src/app/admin/**` → `src/app/admin/__w__`, `design-*.ts` → `design-__w__.ts`. */
const witness = (glob: string) => glob.replace(/\*\*/g, "__w__").replace(/\*/g, "__w__").replace(/\?/g, "w");

/* ------------------------------------------------------------------ */
/* working tree (no git: .gitignore honoured by hand)                 */
/* ------------------------------------------------------------------ */

interface IgnoreRule {
  base: string; // directory of the .gitignore ("" = root)
  re: RegExp;
  negate: boolean;
  dirOnly: boolean;
}

function ignoreRules(dir: string): IgnoreRule[] {
  const file = `${ROOT}/${dir ? `${dir}/` : ""}.gitignore`;
  if (!existsSync(file)) return [];
  return ignoreRulesFrom(readFileSync(file, "utf8"), dir);
}

function ignoreRulesFrom(text: string, dir: string): IgnoreRule[] {
  const out: IgnoreRule[] = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.replace(/(?<!\\)\s+$/, "");
    if (!line || line.startsWith("#")) continue;
    let negate = false;
    if (line.startsWith("!")) {
      negate = true;
      line = line.slice(1);
    }
    line = line.replace(/^\\/, "");
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes("/");
    line = line.replace(/^\//, "");
    let src = "";
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (c === "*" && line[i + 1] === "*") {
        src += line[i + 2] === "/" ? "(?:.*/)?" : ".*";
        i += line[i + 2] === "/" ? 2 : 1;
      } else if (c === "*") src += "[^/]*";
      else if (c === "?") src += "[^/]";
      else if (c === "[") {
        const end = line.indexOf("]", i);
        if (end > i) {
          src += line.slice(i, end + 1);
          i = end;
        } else src += "\\[";
      } else src += c.replace(/[.+^${}()|\\]/g, "\\$&");
    }
    out.push({ base: dir, re: new RegExp(anchored ? `^${src}$` : `(?:^|/)${src}$`), negate, dirOnly });
  }
  return out;
}

function ignored(rules: IgnoreRule[], rel: string, isDir: boolean): boolean {
  let verdict = false;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    const local = r.base ? (rel.startsWith(`${r.base}/`) ? rel.slice(r.base.length + 1) : null) : rel;
    if (local !== null && r.re.test(local)) verdict = !r.negate;
  }
  return verdict;
}

/**
 * The file paths a .gitignore re-includes (P0b review F-7): every `!` rule that names a file (its last segment has an
 * extension; `dir/` and bare names such as Next's `!.yarn/patches` are directories), relative to the root, a `*` in it
 * turned into a witness segment (`cliche-fixture.*.json` → `cliche-fixture.__w__.json`).
 */
function reincludedFiles(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("!") || line.endsWith("/")) continue;
    const rel = line.slice(1).replace(/^\//, "");
    if (!/^.+\.[^./]+$/.test(rel.split("/").pop() ?? "")) continue;
    out.push(witness(rel));
  }
  return out;
}

/** `.git/info/exclude` (when a `.git` directory exists): the clone's own ignore rules, read like a root .gitignore. */
function excludeRules(): IgnoreRule[] {
  const file = `${ROOT}/.git/info/exclude`;
  return existsSync(file) ? ignoreRulesFrom(readFileSync(file, "utf8"), "") : [];
}

/** Every file git would track: the tree minus `.git`, `.git/info/exclude` and the .gitignore rules (nested files included). */
export function workingTree(): string[] {
  const files: string[] = [];
  const walk = (dir: string, rules: IgnoreRule[]) => {
    const here = [...rules, ...ignoreRules(dir)];
    for (const name of readdirSync(`${ROOT}/${dir}`).sort()) {
      if (name === ".git") continue;
      const rel = dir ? `${dir}/${name}` : name;
      let st;
      try {
        st = statSync(`${ROOT}/${rel}`);
      } catch {
        continue;
      }
      if (ignored(here, rel, st.isDirectory())) continue;
      if (st.isDirectory()) walk(rel, here);
      else files.push(rel);
    }
  };
  walk("", excludeRules());
  return files;
}

/* ------------------------------------------------------------------ */
/* baseline manifest                                                  */
/* ------------------------------------------------------------------ */

const Baseline = z.object({
  phase: z.enum(PHASES),
  startedAt: z.string().regex(/^[0-9a-f]{40}$/),
  files: z.array(z.string().min(1)),
});
type Baseline = z.infer<typeof Baseline>;

function readBaseline(): Baseline {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(`${ROOT}/${BASELINE_FILE}`, "utf8"));
  } catch (e) {
    throw new BaselineError(`${BASELINE_FILE} is missing or not JSON (${e instanceof Error ? e.message : String(e)}): the check never passes without it`);
  }
  const parsed = Baseline.safeParse(raw);
  if (!parsed.success) throw new BaselineError(`${BASELINE_FILE} is malformed: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  return parsed.data;
}
class BaselineError extends Error {}

/** `--write-baseline --phase <P> [--at <rev>]`: the one step that reads git (§J.1 rev 5). */
function writeBaseline(phase: Phase, at: string | undefined): void {
  const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const sha = git(["rev-parse", `${at ?? "HEAD"}^{commit}`]).trim();
  const list = at ? git(["ls-tree", "-r", "--name-only", "--full-tree", sha]) : git(["ls-files"]);
  const files = list.split("\n").map((s) => s.trim()).filter(Boolean).sort();
  const out: Baseline = { phase, startedAt: sha, files };
  writeFileSync(`${ROOT}/${BASELINE_FILE}`, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`ownership-check: wrote ${BASELINE_FILE} (phase ${phase}, ${sha.slice(0, 7)}, ${files.length} files)`);
}

/* ------------------------------------------------------------------ */
/* self-check: the reading rules on fixed sentences                   */
/* ------------------------------------------------------------------ */

function selfCheck(): string[] {
  const fails: string[] = [];
  const owns = (text: string, owner: string, file: string): boolean => {
    const { includes, excludes } = parseOwnText(text, owner);
    if (excludes.some((x) => x.re.test(file))) return false;
    return includes.some((p) => p.re.test(file) && !p.excludes.some((x) => x.re.test(file)));
  };
  const expect = (text: string, owner: string, file: string, want: boolean) => {
    if (owns(text, owner, file) !== want) fails.push(`${want ? "should" : "should not"} own ${file}: ${text}`);
  };
  const b = expandBraces("a/{b, c/{d,e}}/f.ts").join(" ");
  if (b !== "a/b/f.ts a/c/d/f.ts a/c/e/f.ts") fails.push(`expandBraces: ${b}`);
  expect("`src/lib/db/**` (except `schema.ts`, `locks.ts`), `src/lib/audit.ts`", "T1", "src/lib/db/locks.ts", false);
  expect("`src/lib/db/**` (except `schema.ts`, `locks.ts`), `src/lib/audit.ts`", "T1", "src/lib/db/client.ts", true);
  expect("`src/lib/db/**` (except `schema.ts`, `locks.ts`), `src/lib/audit.ts`", "T1", "src/lib/audit.ts", true);
  expect("`src/lib/auth/**` except `permissions.ts`, `unknown-page.ts` (and nothing under `src/lib/security/**`: `selftest.ts` there is T3's); `src/lib/mail/**`", "T2", "src/lib/auth/permissions.ts", false);
  expect("`src/lib/auth/**` except `permissions.ts`, `unknown-page.ts` (and nothing under `src/lib/security/**`); `src/lib/mail/**`", "T2", "src/lib/security/x.ts", false);
  expect("`src/lib/auth/**` except `permissions.ts`; `src/lib/mail/**`", "T2", "src/lib/mail/index.ts", true);
  expect("**`src/app/app/[store]/team/**` except `team/{agents,callcenter}/**` (P4)**", "P2", "src/app/app/[store]/team/agents/page.tsx", false);
  expect("**`src/app/app/[store]/team/**` except `team/{agents,callcenter}/**` (P4)**", "P2", "src/app/app/[store]/team/page.tsx", true);
  expect("`src/app/admin/**` **except `src/app/admin/(auth)/setup/**`** (T2) **and `src/app/admin/(console)/ai/**`** (P7)", "P1", "src/app/admin/(console)/ai/page.tsx", false);
  expect("`src/app/admin/**` **except `src/app/admin/(auth)/setup/**`** (T2) **and `src/app/admin/(console)/ai/**`** (P7)", "P1", "src/app/admin/(console)/stores/page.tsx", true);
  expect("`src/lib/render/**` (incl. the new `preview-token.ts`; the `prepublish.ts` registry file itself is the maintainer's)", "T3", "src/lib/render/prepublish.ts", false);
  expect("`src/lib/render/**` (incl. the new `preview-token.ts`)", "T3", "src/lib/render/publish.server.ts", true);
  expect("`src/lib/design/**` except `src/lib/design/types.frozen.ts`, `scripts/check-theme.ts`", "P6", "scripts/check-theme.ts", true);
  expect("`src/lib/design/types.frozen.ts` is **not** P6's (maintainer)", "P6", "src/lib/design/types.frozen.ts", false);
  expect("`src/lib/x.ts`, nav/i18n/jobs `landing.ts`, i18n `console.ts` + `notify.ts`", "P3", "src/lib/i18n/admin/fr/notify.ts", true);
  expect("`src/lib/x.ts`, nav/i18n/jobs `landing.ts`", "P3", "src/components/admin/shell/nav/landing.ts", true);
  expect("`src/lib/x.ts`, nav/i18n/jobs `landing.ts`", "P3", "src/lib/jobs/tracks/landing.ts", true);
  expect("`src/lib/x/**`. Read-only for P3: `src/lib/page/**`.", "P3", "src/lib/page/schema.ts", false);
  expect("`src/lib/x/**`. P3 imports P4's `CallingWindowEditor`, `src/lib/callcenter/window.ts` and never edits them", "P3", "src/lib/callcenter/window.ts", false);
  expect("`src/lib/shipping/**`; S4 never writes under `src/lib/catalog/**`", "S4", "src/lib/catalog/a.ts", false);
  expect("`src/lib/x/**`, `createOrderRow(draft, ctx)`, `src/app/{robots.txt, preview}/**`", "T3", "src/app/preview/[token]/page.tsx", true);
  expect("`src/lib/i18n/admin/<locale>/{shell,auth}.ts`", "P2", "src/lib/i18n/admin/ar/auth.ts", true);
  expect("**`src/app/app/[store]/pages/**` outside `(editor)`**", "P3", "src/app/app/[store]/pages/(editor)/x/page.tsx", false);
  expect("`src/landing/primitives/{Price,Badge}.tsx`; P3's `orderForm/**` and `thankyou/**` keep consuming them", "P6", "src/landing/primitives/thankyou/x.tsx", false);
  expect("`src/lib/design/**`, **new (inside `src/lib/design/**`, already P6's):** `sheets.ts`", "P6", "src/lib/design/sheets.ts", true);
  expect("`src/lib/orders/state.ts`; appends to `src/lib/orders/contract.ts` status labels through the maintainer", "P4", "src/lib/orders/contract.ts", false);
  expect("`scripts/qa/ai-eval.ts`, adds `@anthropic-ai/sdk` (exact pinned version)", "P7", "scripts/qa/@anthropic-ai/sdk/x", false);
  expect("`src/app/s/[store]/policies/**`; the `track/**` route stays landing's", "S1", "src/app/s/[store]/policies/track/x", false);
  // the resolution order: track path > maintainer path > track glob > maintainer glob; two tracks at the top = a finding
  const row = (owner: string, text: string): Row => ({ owner, tier: owner === "maintainer" ? "maintainer" : "track", phases: ["R1"], source: "fixture", ...parseOwnText(text, owner) });
  const fx = [row("P1", "`src/a/**`"), row("P2", "`src/a/b/**`, `src/a/c.ts`"), row("P3", "`src/a/c/d.ts`"), row("maintainer", "`src/a/e.ts`, `src/z/**`"), row("P4", "`src/z/**`")];
  const owners = (f: string) => resolve(fx, "R1", f)?.owners.sort().join("+") ?? "-";
  for (const [f, want] of [["src/a/b/x.ts", "P1+P2"], ["src/a/c.ts", "P2"], ["src/a/c/d.ts", "P3"], ["src/a/e.ts", "maintainer"], ["src/z/q.ts", "P4"], ["src/y.ts", "-"]] as const) {
    if (owners(f) !== want) fails.push(`resolve ${f}: ${owners(f)}, expected ${want}`);
  }
  if (!globToRegExp("a/**/b.ts").test("a/b.ts") || !globToRegExp("a/**/b.ts").test("a/x/y/b.ts") || globToRegExp("a/*.ts").test("a/x/b.ts")) fails.push("globToRegExp");
  const rules = [{ base: "", re: /^qa$/, negate: false, dirOnly: false }, { base: "", re: /(?:^|\/)\.env[^/]*$/, negate: false, dirOnly: false }, { base: "", re: /(?:^|\/)\.env\.example$/, negate: true, dirOnly: false }];
  if (!ignored(rules, "qa", true) || !ignored(rules, ".env.local", false) || ignored(rules, ".env.example", false)) fails.push("gitignore rules");
  const re = reincludedFiles("!.yarn/patches\n/qa/*\n!/qa/design-corpus/\n/qa/design-corpus/*\n!/qa/design-corpus/labels.json\n# !/qa/no.json\n!.env.example\n!/qa/design-corpus/cliche-fixture.*.json\n").join(" ");
  if (re !== "qa/design-corpus/labels.json .env.example qa/design-corpus/cliche-fixture.__w__.json") fails.push(`reincludedFiles: ${re}`);
  return fails;
}

/* ------------------------------------------------------------------ */
/* main                                                               */
/* ------------------------------------------------------------------ */

interface Finding {
  phase: Phase;
  kind: "two-owners" | "unowned-new";
  path: string;
  witness: boolean; // a path made from a pattern, not a file on disk
  detail: string;
}

function main(): void {
  const argv = process.argv.slice(2);
  const opt = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const JSON_OUT = argv.includes("--json");
  const VERBOSE = argv.includes("--verbose");
  const log = (s = "") => {
    if (!JSON_OUT) console.log(s);
  };

  const strictPhase = opt("--phase");
  if (strictPhase && !(PHASES as readonly string[]).includes(strictPhase)) {
    console.error(`ownership-check: --phase must be one of ${PHASES.join(", ")}`);
    process.exit(2);
  }
  if (argv.includes("--write-baseline")) {
    if (!strictPhase) {
      console.error("ownership-check: --write-baseline needs --phase R1.0 | R1 | R2 | R3");
      process.exit(2);
    }
    writeBaseline(strictPhase as Phase, opt("--at"));
    return;
  }

  const self = selfCheck();
  if (self.length) {
    for (const f of self) console.error(`ownership-check self-check: ${f}`);
    process.exit(2);
  }

  let rows: Row[];
  let baseline: Baseline;
  try {
    rows = loadRows();
    baseline = readBaseline();
  } catch (e) {
    if (e instanceof SpecError) {
      console.error(`ownership-check: ${e.message}`);
      process.exit(2);
    }
    if (e instanceof BaselineError) {
      console.error(`ownership-check: ✗ ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  if (argv.includes("--rows")) {
    const who = opt("--rows");
    for (const r of rows) {
      if (who && !who.startsWith("--") && r.owner !== who) continue;
      console.log(`${r.owner} [${r.phases.join(",")}] ${r.source}`);
      for (const p of r.includes) console.log(`   + ${p.glob}${p.specific ? "" : "  (glob)"}${p.excludes.length ? `  except ${p.excludes.map((x) => x.glob).join(", ")}` : ""}`);
      for (const x of r.excludes) console.log(`   - ${x.glob}`);
    }
    return;
  }

  const ownerOf = opt("--owner");
  if (ownerOf) {
    const f = ownerOf.replace(/\\/g, "/").replace(/^\.\//, "");
    for (const phase of PHASES) {
      const res = resolve(rows, phase, f);
      if (!res) {
        console.log(`${phase}: no owner (read-only in this phase)`);
        continue;
      }
      console.log(`${phase}: ${res.owners.join(" + ")}${res.owners.length > 1 ? "   ✗ two owners" : ""}`);
      for (const c of res.claims) console.log(`     ${c.owner.padEnd(10)} ${c.specific ? "path" : "glob"} ${c.pattern}  (${c.source})`);
    }
    return;
  }

  const current = baseline.phase;
  const strict = new Set<Phase>([current, ...(strictPhase ? [strictPhase as Phase] : [])]);
  const tree = workingTree();
  const known = new Set(baseline.files);
  const fresh = tree.filter((f) => !known.has(f));

  // candidate paths: the files on disk and one witness per pattern of every phase
  const witnesses = new Set<string>();
  for (const r of rows) for (const p of r.includes) witnesses.add(witness(p.glob));
  const onDisk = new Set(tree);

  const findings: Finding[] = [];
  const takenFromGlob: string[] = [];
  for (const phase of PHASES) {
    const seen = new Set<string>();
    for (const [file, isWitness] of [...tree.map((f) => [f, false] as const), ...[...witnesses].filter((w) => !onDisk.has(w)).map((w) => [w, true] as const)]) {
      const res = resolve(rows, phase, file);
      if (!res) continue;
      if (res.owners.length > 1) {
        const key = `${res.owners.sort().join("+")} ${file}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const detail = res.claims.filter((c) => res.owners.includes(c.owner) && rank(c) === Math.max(...res.claims.map(rank))).map((c) => `${c.owner} ${c.pattern} (${c.source})`).join(" · ");
        findings.push({ phase, kind: "two-owners", path: isWitness ? file.replace(/__w__/g, "*") : file, witness: isWitness, detail });
      } else if (VERBOSE && phase === current && !isWitness && res.overridden.some((c) => c.tier === "track")) {
        takenFromGlob.push(`${file}: ${res.owners[0]} (${res.overridden.filter((c) => c.tier === "track").map((c) => `${c.owner} ${c.pattern}`).join(", ")})`);
      }
    }
  }
  // An archive build (no `.git`: `prebuild` on Hostinger, §J.5) judges the rows only: its tree is a commit the gate
  // already judged (scripts/deploy/archive.mjs), and the host may add files of its own beside the extracted archive.
  const archiveBuild = !existsSync(`${ROOT}/.git`);
  if (!archiveBuild) {
    for (const f of fresh) {
      if (!claimsFor(rows, current, f).length) findings.push({ phase: current, kind: "unowned-new", path: f, witness: false, detail: `new since ${baseline.startedAt.slice(0, 7)} and no ${current} row claims it` });
    }
  } else log("ownership-check: no .git (an archive build): the new-file check is skipped; the gate ran it on this commit");
  // P0b review F-7: what .gitignore re-includes is committable, so it is owned before it is written (files on disk
  // and pattern witnesses alike; a path the manifest already holds was tracked at the phase start)
  const gitignore = `${ROOT}/.gitignore`;
  for (const f of existsSync(gitignore) ? reincludedFiles(readFileSync(gitignore, "utf8")) : []) {
    if (known.has(f) || claimsFor(rows, current, f).length) continue;
    if (findings.some((x) => x.kind === "unowned-new" && x.path === f)) continue;
    findings.push({ phase: current, kind: "unowned-new", path: f.replace(/__w__/g, "*"), witness: !onDisk.has(f), detail: `.gitignore re-includes it (committable), and no ${current} row claims it` });
  }

  const hard = findings.filter((f) => strict.has(f.phase));
  const soft = findings.filter((f) => !strict.has(f.phase));
  if (JSON_OUT) {
    console.log(JSON.stringify({ phase: current, startedAt: baseline.startedAt, rows: rows.length, files: tree.length, newFiles: fresh.length, findings: hard, warnings: soft }, null, 2));
  } else {
    const patterns = rows.reduce((n, r) => n + r.includes.length, 0);
    log(`ownership-check: phase ${current} since ${baseline.startedAt.slice(0, 7)} · ${rows.length} rows, ${patterns} patterns · ${tree.length} files (${fresh.length} new) + ${witnesses.size} pattern witnesses`);
    for (const phase of PHASES) {
      const owners = new Set(rows.filter((r) => r.phases.includes(phase) && r.tier === "track").map((r) => r.owner));
      log(`  ${phase}: ${[...owners].sort().join(" ")}`);
    }
    for (const f of hard) log(`  ✗ ${f.phase} ${f.kind} ${f.path}${f.witness ? " (pattern)" : ""}: ${f.detail}`);
    for (const f of soft) log(`  ! ${f.phase} ${f.kind} ${f.path}${f.witness ? " (pattern)" : ""}: ${f.detail}`);
    if (VERBOSE && takenFromGlob.length) {
      log(`\n  ${current}: ${takenFromGlob.length} file(s) a specific claim takes out of another track's glob:`);
      for (const t of takenFromGlob) log(`    ${t}`);
    }
    log(hard.length ? `\n${hard.length} finding(s) in ${[...strict].join(", ")}` : `✓ no file has two owners in ${[...strict].join(", ")}${archiveBuild ? "" : "; every new file has an owner"}${soft.length ? ` (${soft.length} warning(s) in later phases)` : ""}`);
  }
  process.exit(hard.length ? 1 : 0);
}

main();
