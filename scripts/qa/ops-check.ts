// proves: OP-04, OP-07, OP-13, OP-14
/**
 * `test:ops` (P4 CALL CENTER; operations.md OPE-§O.1, §O.4; docs/STORE-SAAS.md §J.1): the call centre's offline
 * checks, in named sections. Static lints over P4's own files, then the pure suite src/lib/callcenter/selftest.ts.
 *   npm run test:ops
 *
 *   static · isomorphic   cityKey (address.ts), the window helpers (window.ts, defaults.ts, window.fixtures.ts), the
 *                         state machine (state.ts, priority.ts) and risk-explain.ts import nothing server-side:
 *                         P3's chunks and S1's checkout may bundle them by source import (OD47, OD57, D68)
 *   static · hours keys   no P4 file reads or writes the removed `store.confirmation.hours` /
 *                         `policies.contact.hours` (D73, CRIT2)
 *   static · masking      no P4 file declares maskName / maskAddress / maskCustomerFields (OD61, CRIT14)
 *   static · defaults     every default of src/lib/callcenter/defaults.ts says "reasoned starting value, not researched"
 *   static · cityKey size `cityKey` alone, minified like the landing chunks: ≤ 400 B (OPE-§10.1)
 *   pure                  masking, cities and the city-key.json parity fixture, risk, the ISO window, the ladder on a
 *                         fake clock, priorityOf, the ISO keys, the ops catalog (src/lib/callcenter/selftest.ts)
 *
 * Each lint is proven on a planted fixture first (it must catch it), then run on the tree. Prints its wall time; fails
 * above 25 s for test:state + test:ops + test:profit together (OPE-§O.1; src/lib/callcenter/suite-clock.ts).
 */
import Module from "node:module";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { recordSuiteTime } from "@/lib/callcenter/suite-clock";

const started = performance.now();
const ROOT = process.cwd();
let passes = 0;
const failures: string[] = [];
let section = "";
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) passes++;
  else failures.push(`[${section}] ${name}${detail === undefined ? "" : `\n    ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}

/* ------------------------------------------------------------------ */
/* P4's files (OPE-§P, core §K.2 P4 row)                               */
/* ------------------------------------------------------------------ */

const P4_PATTERNS = [
  "src/lib/orders/{state,events,queue,customers,duplicates,manual,address,risk-explain,admin,transition,edit,masking,profile,export-zip,state.selftest}.ts",
  "src/lib/orders/hooks/ops.ts",
  "src/lib/callcenter/**",
  "src/lib/finance/lite/**",
  "src/lib/admin-data/orders.ts",
  "src/app/app/[store]/{orders,queue,customers,finance}/**",
  "src/app/app/[store]/team/{agents,callcenter}/**",
  "src/app/api/app/[store]/{orders,ops}/**",
  "src/components/admin/{orders,queue,customers,agents,callcenter,finance}/**",
  "src/lib/settings/keys/{ops,accounting}.ts",
  "src/lib/{health/rules,pulse/contributors,notify/kinds,flags/defs,admin-data/search,jobs/tracks}/ops.ts",
  "src/components/admin/shell/{commands,nav}/ops.ts",
  "src/lib/i18n/admin/{en,fr,ar}/{ops,finance}.ts",
  "scripts/qa/{ops-check,queue-check,ops-db-check,profit-check}.ts",
  "scripts/qa/{e2e,tenancy-cases}/ops.ts",
  "scripts/qa/wow-demo/steps/ops.ts",
];

function expandBraces(p: string): string[] {
  const m = /\{([^{}]+)\}/.exec(p);
  if (!m) return [p];
  return m[1]!.split(",").flatMap((alt) => expandBraces(p.slice(0, m.index) + alt + p.slice(m.index + m[0].length)));
}
function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
}
function p4Files(): string[] {
  const out: string[] = [];
  for (const pattern of P4_PATTERNS.flatMap(expandBraces)) {
    if (pattern.endsWith("/**")) {
      const dir = join(ROOT, pattern.slice(0, -3));
      if (existsSync(dir)) walk(dir, out);
    } else if (existsSync(join(ROOT, pattern))) out.push(join(ROOT, pattern));
  }
  return [...new Set(out)];
}
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");

/* ------------------------------------------------------------------ */
/* the lints (pure functions over source text, so each can be proven)  */
/* ------------------------------------------------------------------ */

/** value imports and re-exports of a module (type-only ones are erased and never bundled) */
function valueImports(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of code.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gm)) out.push(m[1]!);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]!);
  return out;
}
const SERVER_SPEC = /^(server-only|node:|next\/|mysql2|drizzle-orm|fs$|path$|crypto$)/;
function resolveLocal(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
/** The server-side modules reachable from `entry` through value imports: [] = isomorphic. */
function serverReach(entry: string, read: (f: string) => string = (f) => readFileSync(f, "utf8"), resolveFn: (spec: string, from: string) => string | null = resolveLocal): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = read(file);
    if (/^\s*import\s+["']server-only["']/m.test(src)) bad.push(`${rel(file)} is server-only`);
    if (/[\\/]src[\\/]lib[\\/]db[\\/]/.test(file)) bad.push(`${rel(file)} is the database layer`);
    for (const spec of valueImports(src)) {
      if (SERVER_SPEC.test(spec)) bad.push(`${rel(file)} imports ${spec}`);
      const next = resolveFn(spec, file);
      if (next) stack.push(next);
    }
  }
  return bad;
}
/** comments removed (strings kept) */
const noComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
/** comments removed and every string / template literal's contents blanked: what the program reads and writes */
const codeOnly = (src: string) => noComments(src).replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, (s) => s[0] + " ".repeat(Math.max(0, s.length - 2)) + s[0]);
/** the removed hours keys (D73): a property access in code, or the exact key path as a string */
const HOURS_ACCESS = /\b(?:confirmation|contact)\??\.hours\b/;
const HOURS_PATH = /["'`](?:store\.|policies\.)?(?:confirmation|contact)\.hours["'`]/;
const HOURS_KEY = { test: (src: string) => HOURS_ACCESS.test(codeOnly(src)) || HOURS_PATH.test(noComments(src)) };
const MASK_DECL_RE = /\b(?:function\*?|const|let|var|class)\s+(maskName|maskAddress|maskCustomerFields)\b|\bas\s+(maskName|maskAddress|maskCustomerFields)\b/;
const MASK_DECL = { test: (src: string) => MASK_DECL_RE.test(codeOnly(src)) };

/* ------------------------------------------------------------------ */
/* static                                                              */
/* ------------------------------------------------------------------ */

const files = p4Files();
const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

section = "static · lint self-check";
{
  const fake = (name: string) => join(ROOT, "src", "lib", "callcenter", name);
  const planted: Record<string, string> = {
    [fake("a.ts")]: 'import { b } from "./b";\nimport type { Db } from "@/lib/db/client";\nexport const a = b;',
    [fake("b.ts")]: 'import "server-only";\nexport const b = 1;',
    [fake("c.ts")]: 'import type { X } from "next/server";\nimport { readFileSync } from "node:fs";\nexport const c = readFileSync;',
    [fake("d.ts")]: '// import "server-only" in a comment\nimport type { Db } from "@/lib/db/client";\nexport const d = 1;',
  };
  // the planted modules live in memory: the same walk, with their own reader and resolver
  const plantedReach = (entry: string) =>
    serverReach(
      entry,
      (f) => planted[f] ?? "",
      (spec) => (spec.startsWith("./") && Object.hasOwn(planted, fake(`${spec.slice(2)}.ts`)) ? fake(`${spec.slice(2)}.ts`) : null),
    );
  check("the import walk finds server-only one import away", plantedReach(fake("a.ts")).some((x) => x.endsWith("b.ts is server-only")), plantedReach(fake("a.ts")));
  check("the import walk finds a node: import", plantedReach(fake("c.ts")).some((x) => x.endsWith("imports node:fs")), plantedReach(fake("c.ts")));
  check("type-only imports and comments are not imports", plantedReach(fake("d.ts")).length === 0, plantedReach(fake("d.ts")));
  // the planted samples are assembled from parts, so this file never matches its own lints
  const H = "hours";
  check("the hours lint catches store.confirmation.hours", HOURS_KEY.test(`const h = store.confirmation.${H};`));
  check("the hours lint catches policies.contact?.hours", HOURS_KEY.test(`p.contact?.${H} ?? null`));
  check("the hours lint catches a quoted path", HOURS_KEY.test(`get("contact.${H}")`));
  check("the hours lint ignores the window's own words", !HOURS_KEY.test("hoursText(w, locale); confirm_hours; callingWindow.days"));
  check("the hours lint ignores prose in comments and messages", !HOURS_KEY.test(`// the removed store.confirmation.${H}\ncheck("no store.confirmation.${H} here", ok);`));
  const [mn, ma, mc] = ["Name", "Address", "CustomerFields"].map((x) => `mask${x}`);
  for (const decl of [`export function ${mn}(`, `const ${ma} = (`, `export { maskFields as ${mc} }`, `let ${mc}`]) check(`the masking lint catches \`${decl}\``, MASK_DECL.test(decl));
  check("the masking lint allows calling the platform's helper", !MASK_DECL.test('import { maskIfImpersonation } from "@/lib/platform/mask"; maskIfImpersonation(scope, row); maskPhone(e164);'));
  check("the P4 file list resolves", files.length > 20 && files.some((f) => rel(f) === "src/lib/orders/address.ts") && files.some((f) => rel(f) === "scripts/qa/ops-check.ts"), files.length);
}

section = "static · isomorphic";
for (const f of ["src/lib/orders/address.ts", "src/lib/callcenter/window.ts", "src/lib/callcenter/defaults.ts", "src/lib/callcenter/window.fixtures.ts", "src/lib/callcenter/priority.ts", "src/lib/callcenter/ladder.ts", "src/lib/orders/state.ts", "src/lib/orders/risk-explain.ts"]) {
  const bad = serverReach(join(ROOT, f));
  check(`${f} imports nothing server-side`, bad.length === 0, bad);
}

section = "static · hours keys";
{
  const hits = files.filter((f) => HOURS_KEY.test(sources.get(f)!)).map(rel);
  check("no P4 file reads or writes store.confirmation.hours / policies.contact.hours (D73)", hits.length === 0, hits);
}

section = "static · masking";
{
  const hits = files.filter((f) => MASK_DECL.test(sources.get(f)!)).map(rel);
  check("no P4 file declares maskName, maskAddress or maskCustomerFields (OD61)", hits.length === 0, hits);
}

section = "static · defaults";
{
  const src = readFileSync(join(ROOT, "src", "lib", "callcenter", "defaults.ts"), "utf8");
  for (const name of ["DEFAULT_WINDOW", "RAMADAN_PRESET", "DEFAULT_LADDER", "OPS_DEFAULTS"]) {
    const at = src.indexOf(`export const ${name}`);
    const doc = src.slice(src.lastIndexOf("/**", at), at);
    check(`${name} is commented "reasoned starting value, not researched"`, at > 0 && /reasoned starting values?, not researched/i.test(doc));
  }
}

/** `cityKey` alone, minified the way the landing chunks are (esbuild, es2019), the city list left external (its data is
 * the form's own list): ≤ 400 B (OPE-§10.1), so a chunk that ever needs a slug can afford it. */
async function cityKeySize(): Promise<void> {
  section = "static · cityKey size";
  const { build } = await import("esbuild");
  const file = join(ROOT, "src", "lib", "orders", "address.ts").split("\\").join("/");
  const r = await build({
    stdin: { contents: `export { cityKey } from "${file}";`, resolveDir: ROOT, loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2019",
    write: false,
    external: ["@/lib/markets/cities-ma"],
    logLevel: "silent",
  });
  const bytes = Buffer.byteLength(r.outputFiles[0]!.text);
  check(`cityKey minified is ≤ 400 B`, bytes <= 400, `${bytes} B: ${r.outputFiles[0]!.text}`);
  console.log(`  cityKey: ${bytes} B minified (≤ 400)`);
  check("the cityKey bundle carries no normalisation table", !/normalize\("NFKD"\)[^]*normalize\("NFKD"\)/.test(r.outputFiles[0]!.text));
}

/* ------------------------------------------------------------------ */
/* pure (src/lib/callcenter/selftest.ts)                               */
/* ------------------------------------------------------------------ */

async function pure(): Promise<void> {
  // src/lib/orders/masking.ts is marked `import "server-only"`; outside Next that import throws
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = require.resolve("libphonenumber-js/max"); // any resolvable module: server-only exports nothing used
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    return req === "server-only" ? stub : orig.call(this, req, ...rest);
  };
  const { runCallcenterSelftest } = await import("@/lib/callcenter/selftest");
  const r = runCallcenterSelftest();
  passes += r.passes;
  failures.push(...r.failures);
  console.log(`  pure: ${Object.entries(r.sections).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
}

cityKeySize()
  .catch((e: unknown) => failures.push(`[static · cityKey size] esbuild failed: ${e instanceof Error ? e.message : String(e)}`))
  .then(pure)
  .catch((e: unknown) => failures.push(`[pure] the selftest threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .finally(() => {
    const ms = performance.now() - started;
    const clock = recordSuiteTime("ops", ms);
    console.log(`test:ops  ${passes} passed, ${failures.length} failed  (${(ms / 1000).toFixed(2)} s; operations suites ${(clock.totalMs / 1000).toFixed(1)} s of 25 s: ${JSON.stringify(clock.parts)})`);
    if (clock.over) failures.push(`[clock] test:state + test:ops + test:profit took ${(clock.totalMs / 1000).toFixed(1)} s, above 25 s (OPE-§O.1)`);
    if (failures.length) {
      for (const f of failures) console.error("FAIL " + f);
      process.exit(1);
    }
  });
