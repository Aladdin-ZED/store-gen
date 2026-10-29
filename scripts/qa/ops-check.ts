// proves: OP-01, OP-04, OP-07, OP-13, OP-14
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
 *   static · state writer only src/lib/orders/transition.ts and createOrderRow write `status` / `confirm_state` /
 *                         `ship_state` / `money_state` anywhere in src/** (drizzle `.set` and raw SQL; OPE-§3.7, OP-01),
 *                         with one named temporary exemption (P5's src/lib/sheets/sync.ts, removed by the P4 verify step
 *                         after rebasing on P5; a stale exemption fails); a single `insert(orders)` call site (OD62)
 *   static · timeline     `TimelineItem` carries no phone, email, address or note field, at any depth (OPE-§O.1)
 *   pure                  masking, cities and the city-key.json parity fixture, risk, the ISO window, the ladder on a
 *                         fake clock, priorityOf, the ISO keys, the ops catalog (src/lib/callcenter/selftest.ts)
 *   pure · idempotency    the Idempotency-Key cache (src/lib/callcenter/idem.ts, OD36): nextOrder / recordOutcome
 *                         results replayed per store and user, a double tap runs once, a throw is not kept, the
 *                         10-minute expiry on a fake clock, the 2,000-entry store bound
 *
 * Each lint is proven on a planted fixture first (it must catch it), then run on the tree. Prints its wall time; fails
 * above 25 s for test:state + test:ops + test:profit together (OPE-§O.1; src/lib/callcenter/suite-clock.ts).
 */
import Module from "node:module";
import ts from "typescript";
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

/** The text inside the parentheses that open at `open` (the index of "("), balanced. */
function balanced(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}
const STATE_KEY = /(?<![\w$.])(status|confirmState|shipState|moneyState)\s*(?=[:,}])/g;
const STATE_SQL = /\bUPDATE\s+(?:`?orders`?|\$\{\s*orders\s*\})\s[\s\S]{0,600}?\bSET\b([\s\S]{0,600})/gi;
const STATE_SQL_COL = /(?<![\w`.])`?(status|confirm_state|ship_state|money_state)`?\s*=/i;
/**
 * The writes of the four state columns in one source file (OPE-§3.7): a drizzle `.update(orders).set({ … })` naming
 * one of them (a `.set(x)` or a spread the lint cannot read counts too), or raw SQL `UPDATE orders … SET status = …`.
 */
function stateWrites(src: string): string[] {
  const out: string[] = [];
  const code = codeOnly(src);
  for (const m of code.matchAll(/\.update\(\s*orders\s*\)/g)) {
    const from = (m.index ?? 0) + m[0].length;
    const rest = code.slice(from);
    const setAt = rest.search(/\.set\(/);
    const end = rest.search(/;/);
    if (setAt < 0 || (end >= 0 && end < setAt)) continue;
    const arg = balanced(rest, setAt + 4).trim();
    const line = code.slice(0, from).split("\n").length;
    if (!arg.startsWith("{")) out.push(`:${line} .update(orders).set(<not an object literal>)`);
    else if (arg.includes("...")) out.push(`:${line} .update(orders).set({ ...spread })`);
    else for (const k of arg.matchAll(STATE_KEY)) out.push(`:${line} .update(orders).set({ ${k[1]} })`);
  }
  const text = noComments(src);
  for (const m of text.matchAll(STATE_SQL)) if (STATE_SQL_COL.test(m[1] ?? "")) out.push(`:${text.slice(0, m.index).split("\n").length} raw UPDATE orders SET <state column>`);
  return out;
}
/** `.insert(orders)` call sites and raw `INSERT INTO orders` of one source file. */
function orderInserts(src: string): number {
  const drizzle = [...codeOnly(src).matchAll(/\.insert\(\s*orders\s*\)/g)].length;
  const raw = [...noComments(src).matchAll(/\bINSERT\s+(?:IGNORE\s+)?INTO\s+(?:`?orders`?|\$\{\s*orders\s*\})[\s(]/gi)].length;
  return drizzle + raw;
}
/** selftests that seed their own throwaway database, and the lint fixtures: not the product's writes */
const TEST_SEED = /(?:^|\/)[^/]*selftest[^/]*\.tsx?$|__tenancy_lint_fixture__/;
/** the one writer and the creation insert (OPE-§3.7) */
const STATE_WRITERS: ReadonlySet<string> = new Set(["src/lib/orders/transition.ts", "src/lib/orders/create.ts"]);
/**
 * Named temporary exemptions (never a silent skip): each names who removes it and when. A listed file that no longer
 * writes a state column fails the check, so the exemption cannot outlive its reason.
 */
const STATE_WRITER_EXEMPT: Readonly<Record<string, string>> = {
  "src/lib/sheets/sync.ts": "P5's legacy Sheets pull writes `status` on main until P5 merges (OPE-§19.6 moves it onto applyExternalStatus); the P4 verify step removes this line after rebasing on P5",
};

/** Property names declared anywhere inside `typeName` (type literals, and the interfaces / aliases of the same file it names). */
function typeFields(src: string, typeName: string, file = "x.ts"): string[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const decls = new Map<string, ts.Node>();
  sf.forEachChild((n) => {
    if (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) decls.set(n.name.text, n);
  });
  const names: string[] = [];
  const seen = new Set<string>();
  const visit = (n: ts.Node): void => {
    if ((ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) names.push(n.name.text);
    if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)) {
      const ref = n.typeName.text;
      const d = decls.get(ref);
      if (d && !seen.has(ref)) {
        seen.add(ref);
        visit(d);
      }
    }
    n.forEachChild(visit);
  };
  const root = decls.get(typeName);
  if (!root) return ["<missing type>"];
  seen.add(typeName);
  visit(root);
  return names;
}
const PII_FIELD = /^(phone|phoneRaw|phone_raw|email|address|note)$/i;

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
  // the state-writer lint (OPE-§3.7): planted writers are caught, the table's other writes are not
  const [U, O, Q] = ["update", "orders", "`"];
  check("the writer lint catches .set({ status })", stateWrites(`await db.${U}(${O}).set({ status, updatedAt: now }).where(x);`).length === 1);
  check("the writer lint catches .set({ confirmState: … }) over several lines", stateWrites(`await tx\n  .${U}(${O})\n  .set({\n    confirmState: "confirmed",\n  })\n  .where(x);`).length === 1);
  check("the writer lint catches a .set(variable)", stateWrites(`await db.${U}(${O}).set(patch).where(x);`).length === 1);
  check("the writer lint catches a spread", stateWrites(`await db.${U}(${O}).set({ ...patch, updatedAt }).where(x);`).length === 1);
  check("the writer lint catches raw SQL", stateWrites(`await conn.query("${U.toUpperCase()} ${Q}${O}${Q} SET ship_state = 'delivered' WHERE store_id = ?");`).length === 1);
  check("the writer lint allows sheetStatus, cityKey and other tables", stateWrites(`await db.${U}(${O}).set({ sheetStatus: "pending", cityKey, priority }).where(x);\nawait db.${U}(pages).set({ status: "published" }).where(y);`).length === 0);
  check("the writer lint ignores comments", stateWrites(`// db.${U}(${O}).set({ status })`).length === 0);
  check("the insert lint counts drizzle and raw inserts", orderInserts(`tx.insert(${O}).values(v); conn.query("INSERT INTO ${Q}${O}${Q} (id) VALUES (?)");`) === 2);
  check("the timeline lint finds nested note and phone fields", typeFields("interface A { b: B; c: { note: string } }\ninterface B { phone: string }", "A").filter((n) => PII_FIELD.test(n)).length === 2);
  check("the timeline lint allows actor.name and text refs", typeFields("interface A { actor: { kind: string; name: string | null }; text: R }\ninterface R { key: string }", "A").filter((n) => PII_FIELD.test(n)).length === 0);
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

section = "static · state writer";
{
  const all: string[] = [];
  walk(join(ROOT, "src"), all);
  const writes: string[] = [];
  const exemptHits = new Map<string, number>();
  const inserts: string[] = [];
  const seeds: string[] = [];
  for (const f of all) {
    const r = rel(f);
    const src = readFileSync(f, "utf8");
    // a selftest seeding its own throwaway database is not an order insert of the product: listed, not counted
    if (TEST_SEED.test(r)) {
      if (orderInserts(src) || stateWrites(src).length) seeds.push(r);
      continue;
    }
    for (let i = orderInserts(src); i > 0; i--) inserts.push(r);
    if (STATE_WRITERS.has(r)) continue;
    const hits = stateWrites(src);
    if (!hits.length) continue;
    if (Object.hasOwn(STATE_WRITER_EXEMPT, r)) exemptHits.set(r, hits.length);
    else writes.push(...hits.map((h) => `${r}${h}`));
  }
  check("only transition.ts and createOrderRow write status / confirm_state / ship_state / money_state (OPE-§3.7)", writes.length === 0, writes);
  for (const [file, why] of Object.entries(STATE_WRITER_EXEMPT)) {
    const n = exemptHits.get(file) ?? 0;
    console.log(`  exempt (temporary): ${file}, ${n} state write(s): ${why}`);
    check(`the temporary exemption of ${file} is still needed (remove it once the file stops writing a state column)`, n > 0);
  }
  check("a single insert(orders) call site in src/**, in src/lib/orders/create.ts (OD62)", inserts.length === 1 && inserts[0] === "src/lib/orders/create.ts", inserts);
  if (seeds.length) console.log(`  test seeds (throwaway databases, not counted): ${seeds.join(", ")}`);
  const tx = readFileSync(join(ROOT, "src", "lib", "orders", "transition.ts"), "utf8");
  check("the lint reads the writer itself as a writer (it watches the right shape)", stateWrites(tx).length > 0, stateWrites(tx));
}

section = "static · timeline";
{
  const fields = typeFields(readFileSync(join(ROOT, "src", "lib", "orders", "events.ts"), "utf8"), "TimelineItem");
  check("TimelineItem is declared in src/lib/orders/events.ts", !fields.includes("<missing type>"), fields);
  check("TimelineItem carries no phone, email, address or note field (OPE-§O.1)", fields.filter((n) => PII_FIELD.test(n)).length === 0, fields);
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

/* ------------------------------------------------------------------ */
/* pure · idempotency (src/lib/callcenter/idem.ts, OD36)               */
/* ------------------------------------------------------------------ */

/**
 * The hot path's Idempotency-Key cache on a fake clock: a replay answers the first result marked `replayed` and runs
 * nothing (nextOrder's and recordOutcome's shapes), per store and user; a run that threw is not kept; the entry lives
 * 10 minutes; a store's bound (2,000 entries) drops its own oldest first and never another store's. Runs after
 * `pure()`, which stubbed `server-only`.
 */
async function idem(): Promise<void> {
  section = "pure · idempotency";
  const real = Date.now;
  let clock = real.call(Date);
  Date.now = () => clock;
  try {
    const { withIdem, isIdemKey, IDEM_TTL_MS, IDEM_MAX_PER_STORE } = await import("@/lib/callcenter/idem");
    type Scope = Parameters<typeof withIdem>[0];
    const store = (id: string) => ({ storeId: id, kind: "member" }) as unknown as Scope;
    const A = store("0P4X0000000000000000000001");
    const B = store("0P4X0000000000000000000002");
    let runs = 0;
    // nextOrder's result and its marker (src/lib/orders/queue.ts)
    type Next = { ok: true; order: { id: string }; resumed: boolean; replayed?: true } | { ok: false; reason: string };
    const nextMark = (r: Next): Next => (r.ok ? { ...r, replayed: true as const } : r);
    const claim = (id: string) => async (): Promise<Next> => {
      runs++;
      return { ok: true, order: { id }, resumed: false };
    };
    const k1 = "6f0b8a52-3c1d-4e8f-9a7b-1c2d3e4f5a6b";
    const first = await withIdem(A, "u1", k1, claim("AB-0001"), nextMark);
    const again = await withIdem(A, "u1", k1, claim("AB-0002"), nextMark);
    check("nextOrder: a replay answers the first card, replayed: true, and runs nothing", runs === 1 && JSON.stringify(again) === JSON.stringify({ ...first, replayed: true }) && !("replayed" in first), { runs, first, again });
    await withIdem(A, "u2", k1, claim("AB-0003"), nextMark);
    await withIdem(B, "u1", k1, claim("AB-0004"), nextMark);
    check("the key is per store and per user (another user, another store: a fresh run)", runs === 3, runs);
    check("an upper-case key is the same key", (await withIdem(A, "u1", k1.toUpperCase(), claim("AB-0005"), nextMark)).ok && runs === 3, runs);
    const k1b = "a8d5c6e4-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
    const empty = await withIdem(A, "u1", k1b, async () => ({ ok: false, reason: "empty" }) as Next, nextMark);
    const emptyAgain = await withIdem(A, "u1", k1b, claim("AB-0006"), nextMark);
    check("a refusal (empty) is replayed as it was", JSON.stringify(empty) === JSON.stringify(emptyAgain) && runs === 3, { empty, emptyAgain });

    // recordOutcome's shape: ActionResult<TransitionResult & …>, the marker on data
    type Out = { ok: true; data: { ok: boolean; rev?: number; replayed?: true } } | { ok: false; error: string };
    const outMark = (r: Out): Out => (r.ok ? { ...r, data: { ...r.data, replayed: true as const } } : r);
    const k2 = "0c9d8e7f-6a5b-4c3d-9e2f-1a0b9c8d7e6f";
    const o1 = await withIdem(A, "u1", k2, async (): Promise<Out> => ({ ok: true, data: { ok: true, rev: 4 } }), outMark);
    const o2 = await withIdem(A, "u1", k2, async (): Promise<Out> => ({ ok: true, data: { ok: true, rev: 5 } }), outMark);
    check(
      "recordOutcome: a replay answers the first result with data.replayed",
      JSON.stringify(o2) === JSON.stringify({ ok: true, data: { ok: true, rev: 4, replayed: true } }) && JSON.stringify(o1) === JSON.stringify({ ok: true, data: { ok: true, rev: 4 } }),
      { o1, o2 },
    );

    // a double tap: the second waits for the first and gets its result
    runs = 0;
    const k3 = "1d2c3b4a-5f6e-4d7c-8b9a-0f1e2d3c4b5a";
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = async (): Promise<Next> => {
      runs++;
      await gate;
      return { ok: true, order: { id: "AB-0010" }, resumed: false };
    };
    const tapA = withIdem(A, "u1", k3, slow, nextMark);
    const tapB = withIdem(A, "u1", k3, slow, nextMark);
    release();
    const [ta, tb] = await Promise.all([tapA, tapB]);
    check("a double tap at once runs once; the second answers replayed", runs === 1 && ta.ok && tb.ok && tb.replayed === true && !("replayed" in ta), { runs, ta, tb });

    // a run that threw is forgotten: its retry runs for real
    runs = 0;
    const k4 = "2e3d4c5b-6a7f-4e8d-9c0b-1a2f3e4d5c6b";
    const thrown = await withIdem(
      A,
      "u1",
      k4,
      async (): Promise<Next> => {
        runs++;
        throw new Error("dropped");
      },
      nextMark,
    ).then(
      () => "resolved",
      (e: Error) => e.message,
    );
    const retried = await withIdem(A, "u1", k4, claim("AB-0011"), nextMark);
    check("a run that threw is not kept: the retry runs", thrown === "dropped" && runs === 2 && retried.ok && !("replayed" in retried), { thrown, runs, retried });

    // the 10-minute life (fake clock)
    runs = 0;
    const k5 = "3f4e5d6c-7b8a-4f9e-8d1c-2b3a4f5e6d7c";
    await withIdem(A, "u1", k5, claim("AB-0012"), nextMark);
    clock += IDEM_TTL_MS - 1_000;
    const late = await withIdem(A, "u1", k5, claim("AB-0013"), nextMark);
    check("9 min 59 s later: still a replay", runs === 1 && late.ok && late.order.id === "AB-0012" && late.replayed === true, { runs, late });
    clock += 1_000;
    const expired = await withIdem(A, "u1", k5, claim("AB-0014"), nextMark);
    check("at 10 minutes the entry has expired: the request runs again", runs === 2 && expired.ok && expired.order.id === "AB-0014" && !("replayed" in expired), { runs, expired });

    // no key, or not a UUID: no cache at all
    runs = 0;
    await withIdem(A, "u1", undefined, claim("AB-0015"), nextMark);
    await withIdem(A, "u1", undefined, claim("AB-0016"), nextMark);
    await withIdem(A, "u1", "not-a-uuid", claim("AB-0017"), nextMark);
    await withIdem(A, "u1", "not-a-uuid", claim("AB-0018"), nextMark);
    check("without a UUID key every request runs (the routes refuse it with 400 idem_required)", runs === 4 && !isIdemKey("not-a-uuid") && isIdemKey(k1), runs);

    // the per-store bound: the store's own oldest entry goes first, another store's stays
    const keyN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const C = store("0P4X0000000000000000000003");
    const D = store("0P4X0000000000000000000004");
    await withIdem(D, "u1", keyN(0), claim("AB-D000"), nextMark);
    for (let n = 0; n <= IDEM_MAX_PER_STORE; n++) await withIdem(C, "u1", keyN(n), claim(`AB-${n}`), nextMark);
    const oldest = await withIdem(C, "u1", keyN(0), claim("AB-AGAIN"), nextMark);
    const newest = await withIdem(C, "u1", keyN(IDEM_MAX_PER_STORE), claim("AB-AGAIN"), nextMark);
    const otherStore = await withIdem(D, "u1", keyN(0), claim("AB-AGAIN"), nextMark);
    check(
      `above ${IDEM_MAX_PER_STORE} entries a store drops its own oldest; its newest and another store's stay`,
      oldest.ok && oldest.order.id === "AB-AGAIN" && newest.ok && newest.replayed === true && otherStore.ok && otherStore.order.id === "AB-D000",
      { oldest, newest, otherStore },
    );
  } finally {
    Date.now = real;
  }
}

cityKeySize()
  .catch((e: unknown) => failures.push(`[static · cityKey size] esbuild failed: ${e instanceof Error ? e.message : String(e)}`))
  .then(pure)
  .catch((e: unknown) => failures.push(`[pure] the selftest threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .then(idem)
  .catch((e: unknown) => failures.push(`[pure · idempotency] threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
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
