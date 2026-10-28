/**
 * Shared machinery of the three admin lints (core §I.5, §I.6, §J.1; PLA-§O.1): scripts/qa/admin-tokens-check.ts,
 * admin-motion-check.ts and admin-rtl-lint.ts. Node-only (reads the tree); the app never imports it.
 *
 * - `scan()` walks the named roots (forward-slash repo paths), skipping generated and vendored folders.
 * - `blankComments()` replaces comments with spaces and keeps every newline and string, so a rule never fires on
 *   documentation ("never a bounce") and line numbers stay true.
 * - `PENDING` tables: a hit in a file another track owns is listed with its rule, owner and CCR; it prints a warning
 *   until the owner fixes it, and fails under `--strict` (gate:r1, the R1 integration). An entry with no hit left
 *   prints "remove entry". Every other hit fails.
 * - Each lint runs its own good and bad fixtures first (`selfTest()`): a rule that stops firing, or fires on a good
 *   fixture, stops the run with exit code 2 before the tree is judged.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..", "..", "..").replace(/\\/g, "/");

export interface Hit {
  /** repo-relative, forward slashes */
  file: string;
  line: number;
  rule: string;
  detail: string;
}

export interface PendingEntry {
  /** a repo path, or a folder prefix ending in "/**" */
  path: string;
  rule: string;
  owner: string;
  ccr: string;
}

export interface Fixture {
  name: string;
  /** the virtual repo path the fixture pretends to be (path-scoped rules read it) */
  file: string;
  src: string;
  /** the rules the scanner must report, each at least once; [] = a good fixture */
  expect: readonly string[];
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "out", "coverage"]);

/** Every file under `roots` (repo-relative dirs or files) whose name ends with one of `exts`. */
export function scan(roots: readonly string[], exts: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = `${ROOT}/${rel}`;
    let st;
    try {
      st = statSync(abs);
    } catch {
      return;
    }
    if (st.isFile()) {
      if (exts.some((e) => rel.endsWith(e))) out.push(rel);
      return;
    }
    for (const name of readdirSync(abs)) {
      if (SKIP_DIRS.has(name)) continue;
      walk(`${rel}/${name}`);
    }
  };
  for (const r of roots) walk(r.replace(/\/$/, ""));
  return [...new Set(out)].sort();
}

export const read = (rel: string): string => readFileSync(`${ROOT}/${rel}`, "utf8");

/**
 * Comments become spaces (newlines kept); strings, template literals and regex-free code stay. `css` knows only block
 * comments; `ts` also line comments. A `//` inside a string or a URL in a template is left alone.
 */
export function blankComments(src: string, lang: "ts" | "css"): string {
  const out = src.split("");
  let i = 0;
  const n = src.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  while (i < n) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (lang === "ts" && ch === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end < 0 ? n : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || (lang === "ts" && ch === "`")) {
      i++;
      while (i < n && src[i] !== ch) {
        if (src[i] === "\\") i++;
        else if (ch !== "`" && src[i] === "\n") break; // an unterminated string: give up at the line end
        i++;
      }
      i++;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** 1-based line of an offset. */
export function lineAt(src: string, index: number): number {
  let line = 1;
  for (let k = 0; k < index && k < src.length; k++) if (src.charCodeAt(k) === 10) line++;
  return line;
}

/** Does a pending entry cover this file? */
export function covers(entry: PendingEntry, file: string): boolean {
  return entry.path.endsWith("/**") ? file.startsWith(entry.path.slice(0, -2)) : file === entry.path;
}

/** Runs the fixtures; returns the failures (empty = the scanner works). */
export function selfTest(fixtures: readonly Fixture[], judge: (file: string, src: string) => Hit[]): string[] {
  const failures: string[] = [];
  for (const f of fixtures) {
    const rules = new Set(judge(f.file, f.src).map((h) => h.rule));
    if (f.expect.length === 0 && rules.size > 0) failures.push(`good fixture "${f.name}" fired: ${[...rules].join(", ")}`);
    for (const r of f.expect) if (!rules.has(r)) failures.push(`bad fixture "${f.name}" did not fire ${r}`);
    for (const r of rules) if (f.expect.length > 0 && !f.expect.includes(r)) failures.push(`bad fixture "${f.name}" also fired ${r}`);
  }
  return failures;
}

/** Prints the result and returns the exit code: 0 clean (warnings allowed), 1 failures. */
export function report(
  name: string,
  hits: readonly Hit[],
  pending: readonly PendingEntry[],
  opts: { strict: boolean; files: number; started: number },
): number {
  const used = new Set<PendingEntry>();
  const fails: Hit[] = [];
  const warns: { hit: Hit; entry: PendingEntry }[] = [];
  for (const h of hits) {
    const entry = pending.find((p) => p.rule === h.rule && covers(p, h.file));
    if (entry) {
      used.add(entry);
      warns.push({ hit: h, entry });
    } else fails.push(h);
  }
  for (const w of warns) {
    const tag = opts.strict ? "FAIL (strict)" : "pending";
    console.warn(`${w.hit.file}:${w.hit.line} ${w.hit.rule} ${w.hit.detail}  [${tag}: ${w.entry.owner}, ${w.entry.ccr}]`);
  }
  for (const p of pending) if (!used.has(p)) console.warn(`PENDING ${p.path} ${p.rule} (${p.owner}, ${p.ccr}): clean, remove entry`);
  for (const h of fails) console.error(`${h.file}:${h.line} ${h.rule} ${h.detail}`);
  const failed = fails.length + (opts.strict ? warns.length : 0);
  const ms = Date.now() - opts.started;
  console.log(
    `${name}: ${opts.files} files, ${fails.length} violation(s), ${warns.length} pending (${used.size} entr${used.size === 1 ? "y" : "ies"})` +
      `${opts.strict ? ", strict" : ""}, ${ms} ms: ${failed ? "FAIL" : "OK"}`,
  );
  return failed ? 1 : 0;
}

/** Shared CLI frame: self-test, then judge the tree; exit 2 when the lint itself is broken. */
export function runLint(def: {
  name: string;
  fixtures: readonly Fixture[];
  judge: (file: string, src: string) => Hit[];
  files: () => string[];
  pending: readonly PendingEntry[];
  /** extra whole-tree checks (token maths, cross-file rules) */
  extra?: () => Hit[];
}): never {
  const started = Date.now();
  const strict = process.argv.includes("--strict");
  try {
    const broken = selfTest(def.fixtures, def.judge);
    if (broken.length) {
      for (const b of broken) console.error(`${def.name} self-test: ${b}`);
      process.exit(2);
    }
    const files = def.files();
    const hits: Hit[] = [];
    for (const f of files) hits.push(...def.judge(f, read(f)));
    if (def.extra) hits.push(...def.extra());
    process.exit(report(def.name, hits, def.pending, { strict, files: files.length, started }));
  } catch (err) {
    console.error(`${def.name}: broken:`, err);
    process.exit(2);
  }
}
