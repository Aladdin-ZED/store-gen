// proves: OP-01, OP-03, OP-04, OP-05, OP-07, OP-09, OP-10, OP-11, OP-13, OP-14, OP-16, SF-03
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
 *   static · queue card   `QueueOrder` carries no phone or e-mail field at any depth, and the address, landmark and note
 *                         only inside `customer` (OPE-§5.3 read with §O.1); `TimelineItem`, `ConsoleOrderRow`, `AggCell`,
 *                         `InboundResult` (and `OrderListRow` once declared) carry none of the five
 *   pure                  masking, cities and the city-key.json parity fixture, risk, the ISO window, the ladder on a
 *                         fake clock, priorityOf, the ISO keys, the ops catalog (src/lib/callcenter/selftest.ts)
 *   pure · idempotency    the Idempotency-Key cache (src/lib/callcenter/idem.ts, OD36): nextOrder / recordOutcome
 *                         results replayed per store and user, a double tap runs once, a throw is not kept, the
 *                         10-minute expiry on a fake clock, the 2,000-entry store bound
 *   pure · carrier csv    (OP-16, OD55) the Carrier CSV writer: the saved column order, ';' / ',', the BOM, national
 *                         digits, the locale's decimal separator, held orders refused with their ids, ≤ 20 columns;
 *                         ManifestSource equal to the §18.3 list and to the setting's enum
 *   pure · views          (OP-09, OD49) the 16 built-in views of OPE-§12.1, holds out of To pack, the role defaults
 *   static · kpi returns  (OPE-§14.3) every function exported by src/lib/callcenter/kpis.ts is declared to return `Kpi`
 *                         (TypeScript compiler API), never a bare number
 *   static · honest triad (OD38) no catalog string under ops.tile.*, fin.tile.*, int.tg.* holds two of placed /
 *                         confirmed / delivered, in en, fr (passées / confirmées / livrées) and ar
 *   pure · insights       the KPI formulas with the minimum-n rule (rescue rate and inbound share included), the
 *                         aggregate cells (suppression under 5, no customer field), the reason mixes, the best-hours
 *                         strip, and each ops Store Health rule on its fixtures: fires above its threshold, silent
 *                         below its minimum n and on a quiet store, evidence with n, no customer field, ≤ 40 ms
 *   static · console      (OP-17, OPE-§13) the queue's key map against the shell chords (disjoint, by event.code, no
 *                         key twice) and its registration in commands/ops.ts; no orange OKLCH literal and no orange
 *                         class in src/components/admin/queue/**; its motion; no uppercase / tracking / italic; logical
 *                         properties only; the console set complete in ar, fr and en
 *   pure · console        (OD36, OD37) the outbox (five fields ≤ 512 B, stale entries dropped, a store switch clears
 *                         the others, the 0.5 … 15 s schedule on network errors only, the same key on every retry, a
 *                         4xx never retried), the keys on Arabic / AZERTY layouts, the callback and hold chips in the
 *                         store's time zone, money and times with Latin digits
 *   pure · card           the ScriptDoc caps (OP-05), the built-in script and WhatsApp texts, the compile rules (upsell
 *                         gating, empty steps and missing facts dropped, no ETA sentence without an ETA), the wa.me
 *                         limits, and the 40 queue-card fixtures (8 delivery-lane) each ≤ 6 KB gzipped (OPE-§5.3)
 *
 * Each lint is proven on a planted fixture first (it must catch it), then run on the tree. Prints its wall time; fails
 * above 25 s for test:state + test:ops + test:profit together (OPE-§O.1; src/lib/callcenter/suite-clock.ts).
 */
import Module from "node:module";
import ts from "typescript";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { recordSuiteTime } from "@/lib/callcenter/suite-clock";
import { orderItemsView } from "@/lib/orders/items-v3";

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
  // (empty since the P4 merge: P5's Sheets pull moved onto applyExternalStatus and src/lib/sheets/sync.ts was split)
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
const CONTACT_FIELD = /^(phone|phoneRaw|phone_raw|e164|email)$/i;
const ADDRESS_FIELD = /^(address|landmark|note)$/i;

/** `typeFields` without the subtree of the top-level member `skip` (the card's `customer`). */
function typeFieldsExcept(src: string, typeName: string, skip: string): string[] {
  const sf = ts.createSourceFile("x.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let root: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined;
  sf.forEachChild((n) => {
    if ((ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) && n.name.text === typeName) root = n;
  });
  if (!root) return ["<missing type>"];
  const members = ts.isInterfaceDeclaration(root) ? root.members : ts.isTypeLiteralNode(root.type) ? root.type.members : ts.factory.createNodeArray<ts.TypeElement>([]);
  const out: string[] = [];
  for (const m of members) {
    if (!(ts.isPropertySignature(m) && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name)))) continue;
    if (m.name.text === skip) continue;
    out.push(m.name.text);
    if (m.type) out.push(...typeFields(`${src}
interface __Probe { x: ${m.type.getText(sf)} }`, "__Probe").slice(1));
  }
  return out;
}

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
for (const f of ["src/lib/orders/address.ts", "src/lib/callcenter/window.ts", "src/lib/callcenter/defaults.ts", "src/lib/callcenter/window.fixtures.ts", "src/lib/callcenter/priority.ts", "src/lib/callcenter/ladder.ts", "src/lib/orders/state.ts", "src/lib/orders/risk-explain.ts", "src/lib/callcenter/script.ts", "src/lib/callcenter/script-builtins.ts", "src/lib/callcenter/wa.ts"]) {
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

section = "static · queue card";
{
  // OPE-§O.1 read with OPE-§5.3 (spec drift, recorded in the step report): QueueOrder carries no phone or e-mail field
  // at any depth; the address, the landmark and the note travel only inside QueueOrder.customer, because the agent
  // confirms them on the call. The list, timeline, console and aggregate rows carry none of the five.
  const cardSrc = readFileSync(join(ROOT, "src", "lib", "callcenter", "card.ts"), "utf8");
  const all = typeFields(cardSrc, "QueueOrder");
  const outside = typeFieldsExcept(cardSrc, "QueueOrder", "customer");
  check("QueueOrder is declared in src/lib/callcenter/card.ts", !all.includes("<missing type>"), all);
  check("QueueOrder carries no phone or e-mail field, at any depth", all.filter((n) => CONTACT_FIELD.test(n)).length === 0, all);
  check("QueueOrder carries the address, landmark and note only inside `customer`", outside.filter((n) => ADDRESS_FIELD.test(n)).length === 0 && all.filter((n) => ADDRESS_FIELD.test(n)).length === 3, outside);
  for (const [file, name] of [
    ["src/lib/orders/events.ts", "TimelineItem"],
    ["src/lib/orders/profile.ts", "ConsoleOrderRow"],
    ["src/lib/callcenter/aggregates.ts", "AggCell"],
    ["src/lib/callcenter/inbound.ts", "InboundResult"],
    // P4 step 6: the list row lives with the list query; its phone is `phoneMasked` (OPE-§12.3), never a raw field
    ["src/lib/orders/admin.ts", "OrderListRow"],
  ] as const) {
    const f = typeFields(readFileSync(join(ROOT, file), "utf8"), name);
    check(`${name} (${file}) carries no phone, e-mail, address, landmark or note field`, !f.includes("<missing type>") && f.filter((n) => CONTACT_FIELD.test(n) || ADDRESS_FIELD.test(n)).length === 0, f);
  }
  // the lint itself, on planted shapes
  const planted = "interface Q { customer: { address: string; note: string | null; landmark: string }; delivery: D }\ninterface D { note: string }";
  check("the card lint catches an address-like field outside `customer`", typeFieldsExcept(planted, "Q", "customer").filter((n) => ADDRESS_FIELD.test(n)).length === 1);
  check("the card lint catches a nested phone field", typeFields("interface Q { a: { b: { phone: string } } }", "Q").filter((n) => CONTACT_FIELD.test(n)).length === 1);
}

section = "static · kpi returns";
{
  // OPE-§14.3: every function exported by src/lib/callcenter/kpis.ts answers a `Kpi`, never a bare number (TypeScript
  // compiler API over the declarations: an exported function without the `Kpi` return annotation fails)
  const notKpi = (src: string): string[] => {
    const sf = ts.createSourceFile("kpis.ts", src, ts.ScriptTarget.Latest, true);
    const bad: string[] = [];
    const exported = (n: ts.Node) => !!(ts.getCombinedModifierFlags(n as ts.Declaration) & ts.ModifierFlags.Export);
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && exported(st)) {
        const t = st.type?.getText(sf);
        if (t !== "Kpi" && t !== "Promise<Kpi>") bad.push(st.name?.text ?? "<anonymous>");
      } else if (ts.isVariableStatement(st) && exported(st)) {
        for (const d of st.declarationList.declarations) {
          const init = d.initializer;
          if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
            const t = init.type?.getText(sf);
            if (t !== "Kpi" && t !== "Promise<Kpi>") bad.push(d.name.getText(sf));
          }
        }
      }
    }
    return bad;
  };
  check("the lint catches an exported function answering a number", notKpi("export function rate(a: number): number { return a; }\nexport const r2 = (a: number): Kpi => x;").join() === "rate");
  check("the lint catches an exported arrow without the Kpi annotation", notKpi("export const r = (a: number) => a;").join() === "r");
  const src = readFileSync(join(ROOT, "src", "lib", "callcenter", "kpis.ts"), "utf8");
  check("every exported function of src/lib/callcenter/kpis.ts returns Kpi", notKpi(src).length === 0, notKpi(src));
}

section = "static · honest triad";
{
  // OD38: "placed", "confirmed" and "delivered" never share one catalog string under ops.tile.*, fin.tile.*, int.tg.*
  const WORDS: Record<"en" | "fr" | "ar", RegExp[]> = {
    en: [/\bplaced\b/i, /\bconfirmed\b/i, /\bdelivered\b/i],
    fr: [/\bpass[ée]e?s?\b/i, /\bconfirm[ée]e?s?\b/i, /\blivr[ée]e?s?\b/i],
    ar: [/الطلبات/, /المؤكدة/, /توصلو/],
  };
  const triad = (locale: "en" | "fr" | "ar", text: string) => WORDS[locale].filter((re) => re.test(text)).length >= 2;
  check("the lint catches a tile with two of the three words (en)", triad("en", "12 placed, 8 confirmed"));
  check("the lint catches a tile with two of the three words (fr, ar)", triad("fr", "12 passées, 8 livrées") && triad("ar", "الطلبات المؤكدة"));
  check("the lint passes a one-word tile", !triad("en", "Confirmed today") && !triad("fr", "Confirmées aujourd'hui"));
  const load = (rel: string): Record<string, string> => {
    const file = join(ROOT, rel);
    if (!existsSync(file)) return {};
    const src = readFileSync(file, "utf8");
    const out: Record<string, string> = {};
    for (const m of src.matchAll(/^\s*"((?:ops\.tile|fin\.tile|int\.tg)\.[^"]+)":\s*("(?:[^"\\]|\\.)*")/gm)) out[m[1]!] = JSON.parse(m[2]!) as string;
    return out;
  };
  let seen = 0;
  const bad: string[] = [];
  for (const locale of ["en", "fr", "ar"] as const) {
    for (const file of ["ops", "finance", "integrations"]) {
      for (const [k, v] of Object.entries(load(`src/lib/i18n/admin/${locale}/${file}.ts`))) {
        seen++;
        if (triad(locale, v)) bad.push(`${locale} ${k}: ${v}`);
      }
    }
  }
  check("ops.tile.* keys exist in en, fr and ar", seen >= 3 * 20, seen);
  check("no ops.tile.* / fin.tile.* / int.tg.* string holds two of placed / confirmed / delivered (OD38)", bad.length === 0, bad);
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

/* ------------------------------------------------------------------ */
/* pure · card (src/lib/callcenter/{card,script,script-builtins,wa}.ts) */
/* ------------------------------------------------------------------ */

/**
 * The ScriptDoc caps (OPE-§7.2, OP-05), the built-in script (OPE-§7.3) and the queue card's size (OPE-§5.3: the 40
 * fixtures, 8 of them delivery-lane cards, each ≤ 6 KB gzipped before any trimming), built through the card's own pure
 * assembler. P5's `renderTemplate` is still its P0 stub in this base (it throws), so the texts are rendered by a
 * reference renderer of OPE-§7.1's grammar written here and only the structure is asserted: the zero-invented-numbers
 * proof is P5's `test:conversions` templates section (re-run after the rebase on P5). Runs after `pure()` (server-only
 * stubbed).
 */
async function card(): Promise<void> {
  section = "pure · card";
  const { ScriptDoc, compileScriptDoc, requiredVars, OBJECTION_IDS, SCRIPT_LOCALES } = await import("@/lib/callcenter/script");
  const { BUILTIN_SCRIPTS, builtinScriptId } = await import("@/lib/callcenter/script-builtins");
  const { TEMPLATE_VARS } = await import("@/lib/integrations/templates");
  const W = await import("@/lib/callcenter/wa");
  const C = await import("@/lib/callcenter/card");
  const { mintScope } = await import("@/lib/tenancy/seam");
  type Values = Parameters<typeof compileScriptDoc>[1];
  type CardRow = import("@/lib/callcenter/card").CardRow;
  type QueueOrder = import("@/lib/callcenter/card").QueueOrder;

  /** OPE-§7.1 grammar: "{var}", "[[ … ]]" dropped when a variable inside is empty, "{{" / "}}" literal braces */
  const render = (src: string, values: Values): string => {
    const OPEN = "\u0000";
    const CLOSE = "\u0001";
    const get = (k: string) => values[k as keyof Values] ?? "";
    const fill = (t: string) => t.replace(/\{([a-z_]+)\}/g, (_m, k: string) => get(k));
    const esc = src.replace(/\{\{/g, OPEN).replace(/\}\}/g, CLOSE);
    const blocks = esc.replace(/\[\[([\s\S]*?)\]\]/g, (_m, inner: string) => ([...inner.matchAll(/\{([a-z_]+)\}/g)].every((m) => get(m[1]!).trim() !== "") ? fill(inner) : ""));
    return fill(blocks).split(OPEN).join("{").split(CLOSE).join("}");
  };

  // the schema's caps (OP-05)
  const step = (i: number, say = "Bonjour {customer_first_name}.") => ({ id: `s${i}`, title: `Étape ${i}`, say });
  const doc = (steps: number, objections = 0) => ({
    v: 1,
    steps: Array.from({ length: steps }, (_, i) => step(i)),
    objections: [...OBJECTION_IDS.slice(0, Math.min(6, objections)).map((id) => ({ id, say: "{total}" })), ...(objections > 6 ? [{ id: "price", say: "{total}" }] : [])],
  });
  check("ScriptDoc: 12 steps and 6 objections pass", ScriptDoc.safeParse(doc(12, 6)).success);
  check("ScriptDoc: a 13-step script fails", !ScriptDoc.safeParse(doc(13)).success);
  check("ScriptDoc: a 7th objection fails", !ScriptDoc.safeParse(doc(3, 7)).success);
  check("ScriptDoc: a script without a step fails", !ScriptDoc.safeParse(doc(0)).success);
  check("ScriptDoc: a line over 400 characters fails", !ScriptDoc.safeParse({ v: 1, steps: [step(1, "x".repeat(401))] }).success && ScriptDoc.safeParse({ v: 1, steps: [step(1, "x".repeat(400))] }).success);
  check("ScriptDoc: a 5th check fails", !ScriptDoc.safeParse({ v: 1, steps: [{ ...step(1), checks: ["a", "b", "c", "d", "e"] }] }).success);
  check("ScriptDoc: an objection outside the closed list fails", !ScriptDoc.safeParse({ v: 1, steps: [step(1)], objections: [{ id: "quality", say: "x" }] }).success);
  check("ScriptDoc: an objection answer over 300 characters fails", !ScriptDoc.safeParse({ v: 1, steps: [step(1)], objections: [{ id: "price", say: "x".repeat(301) }] }).success);
  check("ScriptDoc: `when` and `action` are closed lists", !ScriptDoc.safeParse({ v: 1, steps: [{ ...step(1), when: "sometimes" }] }).success && !ScriptDoc.safeParse({ v: 1, steps: [{ ...step(1), action: "refund" }] }).success);

  // the built-ins (OPE-§7.3)
  const vars = new Set<string>(TEMPLATE_VARS);
  for (const l of SCRIPT_LOCALES) {
    const b = BUILTIN_SCRIPTS[l];
    check(`built-in ${l}: a valid ScriptDoc`, ScriptDoc.safeParse(b).success, ScriptDoc.safeParse(b).error?.issues);
    check(`built-in ${l}: the six steps in order and the six objections`, b.steps.map((x) => x.id).join() === "greeting,recap,address,availability,offer,close" && b.objections.map((o) => o.id).join() === OBJECTION_IDS.join());
    check(`built-in ${l}: the offer step is upsell-gated with add_upsell, the address step edits the address`, b.steps[4]!.when === "upsell" && b.steps[4]!.action === "add_upsell" && b.steps[2]!.action === "edit_address" && b.steps[2]!.checks.length === 2);
    const used = [...b.steps.map((x) => x.say), ...b.objections.map((o) => o.say)].flatMap((t) => [...t.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!));
    check(`built-in ${l}: every variable is one of P5's TEMPLATE_VARS`, used.every((v) => vars.has(v)), used.filter((v) => !vars.has(v)));
    check(`built-in ${l}: eta_text only inside optional blocks (no delivery timing without a zone ETA)`, [...b.steps, ...b.objections].every((x) => !requiredVars(x.say).includes("eta_text")));
  }
  check("built-in ids are builtin:script:<locale>", builtinScriptId("ar") === "builtin:script:ar");

  // the agent WhatsApp built-ins and the link (OPE-§22.2, §22.3)
  for (const k of W.AGENT_WA_KINDS) for (const l of SCRIPT_LOCALES) check(`wa ${k} ${l}: the order id is a required variable`, requiredVars(W.BUILTIN_WA[k][l]).includes("order_id"));
  check(
    "wa ids: built-ins and 26-character row ids parse, anything else does not",
    JSON.stringify([W.parseWaTemplateId("builtin:wa:confirm"), W.parseWaTemplateId("01JC3X8Y0000000000000000AB"), W.parseWaTemplateId("builtin:wa:refund"), W.parseWaTemplateId("x")]) ===
      JSON.stringify([{ builtin: "confirm" }, { rowId: "01JC3X8Y0000000000000000AB" }, null, null]),
  );

  const base: Values = {
    customer_first_name: "سلمى",
    order_id: "CMD-7K3Q9X",
    product: "Huile d'argan",
    offer_label: "2 flacons + 1 offert",
    units_text: "Huile d'argan 50 ml × 3",
    qty: "3",
    total: "249,90 MAD",
    shipping_text: "livraison gratuite",
    city: "Fès",
    address: "Hay Salam 12",
    landmark: "",
    eta_text: "",
    store_name: "Argania",
    agent_first_name: "Karim",
    confirm_number: "",
  };
  const fr = compileScriptDoc(BUILTIN_SCRIPTS.fr, base, render, { locale: "fr", source: "builtin", templateId: builtinScriptId("fr") });
  check("compile: no upsell → the offer step is dropped (5 steps)", fr.steps.map((x) => x.id).join() === "greeting,recap,address,availability,close", fr.steps.map((x) => x.id));
  check("compile: an empty eta_text leaves no sentence about delivery timing", [...fr.steps.map((x) => x.text), ...fr.objections.map((o) => o.text)].every((t) => !/ivraison (est )?prévue/.test(t)), fr);
  check("compile: the trust answer drops its missing confirm_number block and keeps its sentence", fr.objections.find((o) => o.id === "trust")?.text === "Vous payez le livreur en main propre après avoir vu le colis.");
  check("compile: no template syntax is left in any text", [...fr.steps.map((x) => x.text), ...fr.objections.map((o) => o.text)].every((t) => !/[{}]|\[\[|\]\]/.test(t)));
  check("compile: the six objection chips carry their label key", fr.objections.length === 6 && fr.objections.every((o) => o.label.key === `ops.script.obj.${o.id}`));
  const up = compileScriptDoc(BUILTIN_SCRIPTS.en, { ...base, upsell_title: "Savon noir", upsell_price: "49 MAD", eta_text: "tomorrow or the day after" }, render, { locale: "en", source: "builtin", templateId: builtinScriptId("en") });
  check("compile: an upsell on offer → the offer step, and the ETA sentences come back", up.steps.length === 6 && up.steps[4]!.id === "offer" && up.steps[5]!.text.includes("Delivery is planned tomorrow or the day after."), up.steps.map((x) => x.text));
  const sparse = compileScriptDoc(
    { v: 1, steps: [{ id: "a", title: "A", say: "[[{eta_text}]]", checks: [], when: "always", action: "none" }, { id: "b", title: "B", say: "ok", checks: [], when: "always", action: "none" }], objections: [{ id: "trust", say: "Call {confirm_number}." }] },
    base,
    render,
    { locale: "fr", source: "store", templateId: "X" },
  );
  check("compile: a step that renders empty is dropped; an objection whose fact is missing is dropped", sparse.steps.map((x) => x.id).join() === "b" && sparse.objections.length === 0, sparse);

  // the wa.me link's limits: optional blocks first, then units_text; the order id always kept
  const phone = "+212612345678";
  const longUnits = "Huile d'argan 50 ml × 3 · ".repeat(40);
  const tmpl = "Commande {order_id} : {units_text}[[ Livraison prévue {eta_text}.]] Merci.";
  const link = W.waLink(phone, tmpl, { ...base, units_text: longUnits, eta_text: "demain" }, render, "CMD-7K3Q9X");
  const text = decodeURIComponent(link.split("?text=")[1] ?? "");
  check("wa link: ≤ 2,000 characters, the order id kept, units shortened with …, the optional block dropped first", link.length <= W.WA_URL_MAX && text.includes("CMD-7K3Q9X") && text.includes("…") && !text.includes("Livraison prévue"), { length: link.length, text: text.slice(0, 120) });
  const ar = W.waLink(phone, W.BUILTIN_WA.confirm.ar, base, render, "CMD-7K3Q9X");
  check("wa link: the Arabic confirm text fits whole", ar.startsWith("https://wa.me/212612345678?text=") && decodeURIComponent(ar.split("?text=")[1]!).includes("CMD-7K3Q9X") && ar.length <= W.WA_URL_MAX);
  const huge = W.waLink(phone, `${"ء".repeat(900)} {order_id}`, base, render, "CMD-7K3Q9X");
  check("wa link: a custom text that cannot fit is cut, and the order id leads it", huge.length <= W.WA_URL_MAX && decodeURIComponent(huge.split("?text=")[1]!).startsWith("CMD-7K3Q9X"), huge.length);
  check("wa link: no template → the bare chat", W.waUrl(phone) === "https://wa.me/212612345678");

  // the 40 card fixtures (OPE-§5.3), built through the card's pure assembler
  const scope = mintScope("member", "0P4C0000000000000000000001");
  // a Wednesday, 11:30 in Casablanca
  const now = new Date("2026-11-04T10:30:00Z");
  const names = ["Salma Bennani", "عبد الرحيم الإدريسي", "Fatima-Zahra El Amrani", "Youssef", "Khadija Ait Lahcen", "محمد أمين"];
  const notes = [null, "Appeler après 18h, travaille le matin.", "الزنقة 14 قرب الحمام، الباب الأخضر. عيط قبل ما توصل.", "Livrer au bureau, 2e étage, demander M. Alaoui à l'accueil. ".repeat(6).slice(0, 400)];
  const flagsets: string[][] = [[], ["fast"], ["too_fast", "ip_repeat", "history_bad"], ["returning_customer"], ["no_ua", "captcha_missing", "page_burst", "duplicate"]];
  const variants = (n: number) => Array.from({ length: n }, (_, i) => ({ Taille: ["S", "M", "L", "XL"][i % 4]!, Couleur: ["Noir", "Beige", "Bleu nuit", "Bordeaux"][i % 4]! }));
  const maxScript = {
    v: 1 as const,
    steps: Array.from({ length: 12 }, (_, i) => ({
      id: `step_${i}`,
      title: `Étape ${i + 1} du script`,
      say: "Bonjour {customer_first_name}, ici {agent_first_name} de {store_name}. Pour votre commande {order_id} de {offer_label}, je vérifie avec vous {units_text}, le total {total} et l'adresse à {city}. ".repeat(3).slice(0, 400),
      checks: ["Ville confirmée", "Adresse et repère notés", "Créneau de livraison", "Disponibilité du client"],
      when: "always" as const,
      action: "none" as const,
    })),
    objections: OBJECTION_IDS.map((id) => ({ id, say: "Je comprends tout à fait. Le prix de {offer_label} est {total}, vous payez à la réception, rien avant, et {store_name} reste votre interlocuteur pour toute question. ".repeat(2).slice(0, 300) })),
  };
  const fixtures: { label: string; card: QueueOrder; raw: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const delivery = i >= 32;
    const l = SCRIPT_LOCALES[i % 3]!;
    const qty = 1 + (i % 6);
    const row = {
      id: `CMD-${String(100000 + i)}`,
      storeId: scope.storeId,
      pageId: "01JC3X8Y0000000000000PAGE1",
      versionId: null,
      exportId: null,
      source: "live",
      status: "new",
      name: names[i % names.length]!,
      phone: `+2126${String(10000000 + i * 7919).slice(0, 8)}`,
      phoneRaw: null,
      city: i % 7 === 0 ? null : ["Fès", "Casablanca", "Tanger", "Agadir", "Oujda", "الدار البيضاء"][i % 6]!,
      address:
        i % 5 === 0
          ? "Résidence Al Andalous, immeuble 7, appartement 12, en face de la pharmacie du quartier, derrière la mosquée, 3e rue à droite après le rond-point du marché central. ".repeat(2).slice(0, 300)
          : "Hay Salam 12",
      note: notes[i % notes.length]!,
      email: null,
      productName: i % 4 === 0 ? "Coffret soin visage huile d'argan pure pressée à froid, sérum, crème de nuit et savon noir beldi parfumé à l'eucalyptus" : "Huile d'argan",
      items: { bundleId: "b", bundleLabel: qty > 1 ? `${qty} flacons + 1 offert` : "1 flacon", qty, unitPrice: 99.9, variants: variants(qty) },
      qty,
      subtotal: "249.90",
      shipping: i % 2 ? "0.00" : "35.00",
      total: "284.90",
      currency: "MAD",
      locale: l,
      utm: null,
      ref: null,
      ipHash: "a".repeat(64),
      ua: "Mozilla/5.0 (Linux; Android 14)",
      eventId: null,
      idem: "00000000-0000-4000-8000-000000000000",
      riskScore: [10, 55, 75, 30, 90][i % 5]!,
      flags: flagsets[i % flagsets.length]!,
      upsellTokenHash: null,
      sheetStatus: "pending",
      sheetAttempts: 0,
      sheetError: null,
      createdAt: new Date(now.getTime() - (i + 1) * 3_600_000),
      updatedAt: now,
      isTest: i % 13 === 0,
      confirmState: delivery ? "confirmed" : (["new", "attempting", "callback"] as const)[i % 3]!,
      shipState: delivery ? "attempt_failed" : "none",
      moneyState: "unpaid",
      assigneeId: "01JC3X8Y00000000000AGENT01",
      leaseUntil: new Date(now.getTime() + 900_000),
      claimToken: "01JC3X8Y00000000000CLAIM01",
      dueAt: null,
      attempts: i % 4,
      priority: 500,
      cancelReason: null,
      customerId: i % 3 === 0 ? null : "01JC3X8Y0000000000CUSTOM01",
      mergedInto: null,
      cityKey: i % 7 === 0 ? null : "fes",
      createdBy: null,
      rev: i,
      confirmedBy: null,
      confirmedAt: null,
      firstTouchAt: null,
      shippedAt: null,
      deliveredAt: null,
      finalAt: null,
      landmark: i % 2 ? "Près de la grande mosquée, porte verte" : null,
      adjustCents: 0,
      sheetLabel: null,
      sheetDirty: 0,
      capiCtx: null,
      trackingRef: delivery ? `TRK${i}ABC123456` : null,
      carrierLabel: delivery ? "Amana Express" : null,
      shipAfter: null,
      deliveryAttempts: delivery ? 1 + (i % 3) : 0,
    } as unknown as CardRow;
    const upsell = i % 4 === 1;
    const values: Values = {
      ...base,
      customer_first_name: row.name.split(" ")[0]!,
      order_id: row.id,
      offer_label: orderItemsView(row.items).bundleLabel,
      units_text: `Huile d'argan × ${qty}`,
      eta_text: i % 2 ? "demain ou après-demain" : "",
      upsell_title: upsell ? "Savon noir beldi" : "",
      upsell_price: upsell ? "49 MAD" : "",
    };
    const max = i === 5 || i === 21;
    const sdoc = max ? maxScript : BUILTIN_SCRIPTS[l];
    const script = compileScriptDoc(sdoc, values, render, { locale: l, source: max ? "store" : "builtin", templateId: max ? "01JC3X8Y0000000000SCRIPT01" : builtinScriptId(l) });
    const templates =
      i % 2
        ? Array.from({ length: 5 }, (_, k) => ({ id: `01JC3X8Y000000000000CUST0${k}`, channel: "whatsapp" as const, kind: "custom", pageId: null, name: `Relance personnalisée numéro ${k + 1} pour les clients fidèles`, body: "x", source: "user" as const }))
        : [];
    const parts = {
      now,
      tz: "Africa/Casablanca",
      ui: (["fr", "ar", "en"] as const)[i % 3]!,
      history: row.customerId ? { ordersCount: 4 + i, deliveredCount: 2, refusedCount: 1, returnedCount: 0, cancelledCount: 1, fakeCount: i % 2 } : null,
      duplicates: i % 6 === 0 ? Array.from({ length: 5 }, (_, k) => ({ id: `CMD-9${String(i).padStart(2, "0")}00${k}`, createdAt: new Date(now.getTime() - k * 86_400_000), confirmState: "new" as const, shipState: "none" as const })) : [],
      templates,
      bands: { check: { band: "check" as const, decided: 52, bad: 20, badShareBp: 3846 }, high: i % 2 ? null : { band: "high" as const, decided: 40, bad: 30, badShareBp: 7500 } },
      attempts: [
        { weekday: 3, hour: 18, attempts: 212, contacted: 140 },
        { weekday: 3, hour: 11, attempts: 90, contacted: 40 },
        { weekday: 3, hour: 9, attempts: 12, contacted: 12 },
      ],
      eta: values.eta_text || null,
      rescues: delivery ? i % 3 : 0,
      script,
    };
    const opts = { leaseUntil: row.leaseUntil, mine: true, maxCalls: 3, ...(i % 9 === 0 ? { inbound: true } : {}) };
    const built = C.assembleCard(scope, row, opts, parts);
    // the card before any trimming: the bound must hold without `fitCard`'s help
    const raw = C.cardGzBytes({ ...built, script });
    fixtures.push({ label: `#${i} ${l}${delivery ? " delivery" : ""}${max ? " max-script" : ""}`, card: built, raw });
  }
  check("40 card fixtures, 8 of them delivery-lane cards", fixtures.length === 40 && fixtures.filter((f) => f.card.lane === "delivery").length === 8);
  const over = fixtures.filter((f) => f.raw > 6_144);
  check("every card fixture is ≤ 6 KB gzipped before any trimming (OPE-§5.3)", over.length === 0, over.map((f) => [f.label, f.raw]));
  const biggest = fixtures.reduce((a, b) => (a.raw > b.raw ? a : b));
  console.log(`  cards: ${Math.min(...fixtures.map((f) => f.raw))}-${biggest.raw} B gzipped (largest ${biggest.label})`);
  const leaky = fixtures.filter((f) => {
    const j = JSON.stringify(f.card);
    return /\+?2126\d{8}/.test(j) || j.includes("Mozilla") || j.includes("a".repeat(64));
  });
  check("no card carries a full phone, the user agent or the IP hash", leaky.length === 0, leaky.map((f) => f.label));
  const d = fixtures.find((f) => f.card.lane === "delivery")!.card;
  const [f0, f1] = [fixtures[0]!.card, fixtures[1]!.card];
  check("a delivery card has its strip (rescue calls left, carrier, tracking); a confirm card has none", !!d.delivery && d.delivery.rescueCallsLeft >= 0 && d.delivery.carrierLabel === "Amana Express" && f1.delivery === null);
  check("a card's money is in integer cents", f1.totalCents === 28_490 && f1.shippingCents === 0 && f0.shippingCents === 3_500);
  check("calibration only for a band with its n (check: 3846 bp of 52; low: none)", f1.risk.calibration?.badShareBp === 3846 && f1.risk.calibration?.n === 52 && f0.risk.calibration === null);
  check(
    "the built-in WhatsApp kinds per lane, then the store's customs",
    f0.templates.map((x) => x.id).join() === "builtin:wa:confirm,builtin:wa:missed_call,builtin:wa:address" && d.templates[0]!.id === "builtin:wa:delivery_day" && f1.templates.length === 8,
    [f0.templates, d.templates[0], f1.templates.length],
  );
  check("the built-in template names are in the viewer's language", f0.templates[0]!.name === "Confirmer la commande" && f1.templates[0]!.name === "تأكيد الطلب", [f0.templates[0], f1.templates[0]]);
  check("bestHoursHint: the weekday's best cell with ≥ 30 attempts (Wednesday 18:00-19:00, n = 212)", f0.ui.bestHoursHint?.key === "ops.queue.bestHours" && JSON.stringify(f0.ui.bestHoursHint.vars) === JSON.stringify({ from: 18, to: 19, n: 212 }), f0.ui.bestHoursHint);
  check("inbound cards say so; claimed ones do not", f0.inbound === true && f1.inbound === undefined);
  check("history from the customer row; none without one", f0.customer.history === null && f1.customer.history?.orders === 5);
  check("the masked phone only", f1.customer.phoneMasked.includes("•") && !/\d{6}/.test(f1.customer.phoneMasked.replace(/\s/g, "")), f1.customer.phoneMasked);
  check("a city-less order has no ETA key", f0.eta.cityKey === null && f1.eta.cityKey === "fes");
  // fitCard: a pathological card (caps bypassed) is trimmed under the bound, its first step kept
  const f5 = fixtures[5]!.card;
  // text gzip cannot shrink much: a linear congruential stream over 200 Arabic code points
  let seed = 12_345;
  const noise = () => {
    seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
    return String.fromCharCode(0x621 + ((seed >>> 16) % 200));
  };
  const fat: QueueOrder = {
    ...f5,
    script: { ...f5.script, steps: Array.from({ length: 40 }, (_, k) => ({ id: `x${k}`, title: "x", text: Array.from({ length: 400 }, noise).join(""), checks: [], action: "none" as const })) },
  };
  check("fitCard: the planted card is over the bound before trimming", C.cardGzBytes(fat) > C.CARD_GZ_MAX, C.cardGzBytes(fat));
  const fitted = C.fitCard(fat);
  check("fitCard: an oversized card is trimmed to ≤ 5.5 KB gz, its first step kept", C.cardGzBytes(fitted) <= C.CARD_GZ_MAX && fitted.script.steps[0]!.id === "x0" && fitted.script.objections.length === 0, C.cardGzBytes(fitted));
}

async function carrier(): Promise<void> {
  section = "pure · carrier csv";
  const CC = await import("@/lib/callcenter/carrier-csv");
  const { MANIFEST_SOURCES: SETTING } = await import("@/lib/settings/keys/ops");
  const V = await import("@/lib/callcenter/views");
  // OPE-§18.3: the `manifest` kind's source list, in the spec's order
  const SPEC = ["order_id", "name", "phone", "city", "address", "landmark", "cod_amount", "content", "qty", "note", "constant"];
  check("ManifestSource is the §18.3 manifest source list", JSON.stringify(CC.MANIFEST_SOURCES) === JSON.stringify(SPEC), CC.MANIFEST_SOURCES);
  check("ManifestSource equals the ops.carrierCsv setting's enum", JSON.stringify(CC.MANIFEST_SOURCES) === JSON.stringify(SETTING), SETTING);
  const now = new Date("2026-11-03T10:00:00Z");
  const row = (o: Partial<import("@/lib/callcenter/carrier-csv").ManifestRow> = {}): import("@/lib/callcenter/carrier-csv").ManifestRow => ({
    orderId: "CMD-AAAA1111",
    name: "Salma Bennani",
    phone: "+212612345678",
    city: "Fès",
    address: "Hay Salam 12; bloc 3",
    landmark: "près de la mosquée",
    totalCents: 24_990,
    content: "1 × Argan 50ml [ARG-50]",
    qty: 1,
    note: "=SUM(A1)",
    shipAfter: null,
    ...o,
  });
  const spec = {
    delimiter: ";" as const,
    columns: [
      { header: "Téléphone", source: "phone" as const },
      { header: "Destinataire", source: "name" as const },
      { header: "Montant", source: "cod_amount" as const },
      { header: "Ville", source: "city" as const },
      { header: "Adresse", source: "address" as const },
      { header: "Réf", source: "order_id" as const },
      { header: "Produit", source: "content" as const },
      { header: "Qté", source: "qty" as const },
      { header: "Remarque", source: "note" as const },
      { header: "Ouvrir", source: "constant" as const, value: "Non" },
    ],
  };
  const held = row({ orderId: "CMD-HELD0001", shipAfter: new Date("2026-11-05T00:00:00Z") });
  const past = row({ orderId: "CMD-PAST0001", shipAfter: new Date("2026-11-01T00:00:00Z"), totalCents: 25_000, phone: "+212 6 12 34 56 79" });
  const csv = CC.writeCarrierCsv([row(), held, past], spec, { locale: "fr", now });
  const lines = csv.split("\r\n");
  check("UTF-8 BOM first", csv.charCodeAt(0) === 0xfeff);
  check("the owner's headers in the saved order, ';' delimited", lines[0] === "﻿Téléphone;Destinataire;Montant;Ville;Adresse;Réf;Produit;Qté;Remarque;Ouvrir", lines[0]);
  check("a row: national digits, the fr decimal comma, quoted ';', formula-safe note, the constant", lines[1] === `0612345678;Salma Bennani;249,90;Fès;"Hay Salam 12; bloc 3";CMD-AAAA1111;1 × Argan 50ml [ARG-50];1;'=SUM(A1);Non`, lines[1]);
  check("a past hold ships; a whole amount has no decimals; a spaced E.164 still gives national digits", lines[2]?.startsWith("0612345679;Salma Bennani;250;") === true, lines[2]);
  check("the held order is never written", !csv.includes("CMD-HELD0001") && lines.length === 4 && lines[3] === "", lines.length);
  const plan = CC.planCarrierCsv([row(), held, past], now);
  check("planCarrierCsv: held orders refused with their ids, the rest in order", JSON.stringify(plan.held) === JSON.stringify(["CMD-HELD0001"]) && plan.ok.map((r) => r.orderId).join() === "CMD-AAAA1111,CMD-PAST0001", plan);
  const comma = CC.writeCarrierCsv([row()], { delimiter: ",", columns: [{ header: "Amount", source: "cod_amount" }, { header: "Addr", source: "address" }] }, { locale: "en", now });
  check("',' delimiter and the en decimal point", comma.split("\r\n")[1] === `249.90,Hay Salam 12; bloc 3`, comma);
  const frComma = CC.writeCarrierCsv([row()], { delimiter: ",", columns: [{ header: "Montant", source: "cod_amount" }] }, { locale: "fr", now });
  check("',' delimiter with a decimal comma quotes the amount", frComma.split("\r\n")[1] === `"249,90"`, frComma);
  let threw = false;
  try {
    CC.writeCarrierCsv([row()], { delimiter: ";", columns: Array.from({ length: 21 }, (_, i) => ({ header: `C${i}`, source: "qty" as const })) }, { locale: "fr", now });
  } catch {
    threw = true;
  }
  check("more than 20 columns refused", threw);
  check("amountText: negative and sub-unit amounts", CC.amountText(-1_005, "fr") === "-10,05" && CC.amountText(5, "en") === "0.05", [CC.amountText(-1_005, "fr"), CC.amountText(5, "en")]);

  section = "pure · views";
  const SPEC_VIEWS = ["to_call", "callbacks", "new", "no_answer", "to_pack", "on_hold", "on_the_way", "delivery_problems", "delivered", "refused_returned", "cancelled_fake", "high_risk", "duplicates", "sheet_failed", "test", "mine"];
  check("the 16 built-in views of OPE-§12.1, in order", JSON.stringify(V.BUILTIN_VIEWS.map((v) => v.id)) === JSON.stringify(SPEC_VIEWS));
  const toPack = V.builtinView("to_pack")!;
  const onHold = V.builtinView("on_hold")!;
  check("To pack: confirmed, to_pack / packed, holds excluded (OD49)", JSON.stringify(toPack.query) === JSON.stringify({ confirm: ["confirmed"], ship: ["to_pack", "packed"], hold: "none" }), toPack.query);
  check("On hold: the same set with an active hold and the Ship from column", onHold.query.hold === "active" && onHold.columns.includes("ship_from"), onHold);
  check("Delivery problems: attempt_failed / postponed with the rescue column", JSON.stringify(V.builtinView("delivery_problems")!.query.ship) === JSON.stringify(["attempt_failed", "postponed"]) && V.builtinView("delivery_problems")!.columns.includes("rescue"));
  check("Refused & returned: the reason column", V.builtinView("refused_returned")!.columns.includes("return_reason"));
  check("defaults: agents → My orders, managers → To call now, owners → To pack", V.defaultViewFor("agent") === "mine" && V.defaultViewFor("manager") === "to_call" && V.defaultViewFor("owner") === "to_pack");
  const merged = V.withView(toPack, { ship: ["packed", "shipped"] });
  check("withView: the view and the person's filters both apply", JSON.stringify(merged.ship) === JSON.stringify(["packed"]) && merged.hold === "none", merged);
  check("OrderQuery refuses an unknown axis value and a long name", !V.OrderQuery.safeParse({ confirm: ["sold"] }).success && !V.SavedViewInput.safeParse({ name: "x".repeat(61), query: {} }).success);
  check("OrderQuery defaults the sort", V.OrderQuery.parse({}).sort === "created_desc");
}

/* ------------------------------------------------------------------ */
/* pure · insights (P4 step 7: KPIs, aggregates, health rules, board)  */
/* ------------------------------------------------------------------ */

/**
 * The KPI formulas with the minimum-n rule (OD17: 20 per agent, 30 per store, 30 attempts per hour cell), the
 * aggregate cells (suppression under 5, no customer field), the reason mixes, the best-hours strip, and every ops
 * Store Health rule on its in-memory fixtures: it fires above its threshold, stays silent below its minimum n, and no
 * issue carries a customer field. Runs after `pure()`, which stubbed `server-only`.
 */
async function insights(): Promise<void> {
  const t0 = performance.now();
  section = "pure · kpis";
  const K = await import("@/lib/callcenter/kpis");
  const isKpi = (k: unknown): boolean => !!k && typeof k === "object" && typeof (k as { n?: unknown }).n === "number" && typeof (k as { min?: unknown }).min === "number" && ("insufficient" in (k as object) || typeof (k as { value?: unknown }).value === "number");
  const v = (k: import("@/lib/callcenter/kpis").Kpi) => ("insufficient" in k ? null : k.value);
  check("confirmation rate: confirmed ÷ (confirmed + cancelled + unreachable)", v(K.confirmationRate({ confirmed: 15, cancelled: 3, unreachable: 2 }, "agent")) === 0.75);
  check("confirmation rate: 19 decisions of an agent are insufficient, 20 are not", "insufficient" in K.confirmationRate({ confirmed: 19, cancelled: 0, unreachable: 0 }, "agent") && !("insufficient" in K.confirmationRate({ confirmed: 20, cancelled: 0, unreachable: 0 }, "agent")));
  check("confirmation rate: a store needs 30", "insufficient" in K.confirmationRate({ confirmed: 29, cancelled: 0, unreachable: 0 }, "store") && v(K.confirmationRate({ confirmed: 24, cancelled: 3, unreachable: 3 }, "store")) === 0.8);
  check("below the minimum the count and the minimum still travel", JSON.stringify(K.confirmationRate({ confirmed: 4, cancelled: 1, unreachable: 0 }, "store")) === JSON.stringify({ n: 5, min: 30, insufficient: true }));
  check("delivery rate: delivered ÷ (delivered + refused + returned + lost)", v(K.deliveryRate({ delivered: 30, refused: 6, returned: 3, lost: 1 }, "store")) === 0.75);
  check("net delivered rate: delivered ÷ placed over the cohorts", v(K.netDeliveredRate([{ placed: 20, delivered: 10 }, { placed: 20, delivered: 14 }])) === 0.6 && "insufficient" in K.netDeliveredRate([{ placed: 29, delivered: 20 }]));
  const ft = Array.from({ length: 21 }, (_, i) => i + 1);
  check("first touch p50 / p90 (nearest rank) in window minutes, 20 per agent", v(K.firstTouchP50(ft, "agent")) === 11 && v(K.firstTouchP90(ft, "agent")) === 19 && "insufficient" in K.firstTouchP50(ft.slice(0, 19), "agent"));
  check("attempts per confirmation: two decimals, n = confirmed", v(K.attemptsPerConfirmation({ attempts: 50, confirmed: 22 }, "agent")) === 2.27 && K.attemptsPerConfirmation({ attempts: 50, confirmed: 22 }, "agent").n === 22);
  check("handling time: median seconds", v(K.handlingTimeP50(Array.from({ length: 20 }, (_, i) => (i + 1) * 1000), "agent")) === 10);
  check("abandoned and skip rates over claims", v(K.abandonedRate({ abandoned: 5, claimed: 20 }, "agent")) === 0.25 && v(K.skipRate({ skipped: 2, claimed: 40 }, "agent")) === 0.05);
  check("contact rate: 30 attempts per hour cell", "insufficient" in K.contactRate({ contacted: 20, attempts: 29 }) && v(K.contactRate({ contacted: 18, attempts: 30 })) === 0.6);
  check("rescue rate: delivered ÷ final among rescued orders, 20", v(K.rescueRate({ delivered: 15, final: 20 }, "agent")) === 0.75 && "insufficient" in K.rescueRate({ delivered: 15, final: 19 }, "agent"));
  check("inbound share: inbound decisions ÷ decisions, 20 / 30", v(K.inboundShare({ inbound: 6, decisions: 30 }, "store")) === 0.2 && "insufficient" in K.inboundShare({ inbound: 6, decisions: 29 }, "store"));
  check("risky share: risk ≥ 50 ÷ placed, 30", v(K.riskyShare({ risky: 9, placed: 30 })) === 0.3);
  const all = Object.entries(K).filter(([, f]) => typeof f === "function") as [string, (...a: unknown[]) => unknown][];
  check("every exported KPI function answers a Kpi at runtime too", all.every(([name, f]) => name === "rateKpi" || name === "measuredKpi" || isKpi(f(...sampleArgs(name)))), all.map(([n]) => n));

  section = "pure · aggregates";
  const A = await import("@/lib/callcenter/aggregates");
  const counts = (key: string, placed: number, o: Partial<Record<"confirmed" | "cancelled" | "unreachable" | "fake" | "delivered" | "refused" | "returned" | "lost", number>> = {}) => ({ key, placed, confirmed: 0, cancelled: 0, unreachable: 0, fake: 0, delivered: 0, refused: 0, returned: 0, lost: 0, ...o });
  const sup = A.suppressCells([counts("casablanca", 40, { confirmed: 30, cancelled: 5, unreachable: 5, delivered: 20, refused: 4 }), counts("*", 4), counts("fes", 5, { confirmed: 3 })]);
  check("cells under 5 orders are suppressed and counted", sup.suppressed === 1 && sup.cells.map((c) => c.key).join() === "casablanca,fes", sup);
  check("a cell's rates are Kpis over decisions and finals", v(sup.cells[0]!.confirmationRate) === 0.75 && "insufficient" in sup.cells[0]!.deliveryRate && sup.cells[0]!.n === 40, sup.cells[0]);
  check("an agent cell uses the agent minimum (20)", !("insufficient" in A.aggCellOf(counts("01HZ", 30, { delivered: 20 }), "agent").deliveryRate));
  check("AggCell carries no customer field", Object.keys(sup.cells[0]!).every((k) => !CONTACT_FIELD.test(k) && !ADDRESS_FIELD.test(k) && k !== "name"), Object.keys(sup.cells[0]!));
  check("AGG_DIMS is the §27.6 list, ≤ 6 per call", JSON.stringify(A.AGG_DIMS) === JSON.stringify(["page", "city", "source", "agent", "offer", "campaign", "angle", "carrier", "hour", "weekday"]) && A.AGG_MAX_DIMS === 6);
  const mix = A.reasonShares<string | null>([{ reason: "customer_absent", count: 12 }, { reason: null, count: 18 }, { reason: "customer_absent", count: 3 }], "store");
  check("reason mix: merged per reason, largest first, null = no reason given", mix.length === 2 && mix[0]!.reason === null && mix[0]!.count === 18 && mix[1]!.count === 15 && v(mix[0]!.share) === 0.5455 && mix[0]!.share.n === 33, mix);
  check("reason mix below 30: the shares are withheld", A.reasonShares([{ reason: "price", count: 5 }], "store").every((l) => "insufficient" in l.share));

  section = "pure · board";
  const B = await import("@/lib/callcenter/board.server");
  check("hoursOf: a range touches the hours it overlaps", B.hoursOf({ from: "09:30", to: "12:00" }).join() === "9,10,11" && B.hoursOf({ from: "14:30", to: "18:30" }).join() === "14,15,16,17,18", B.hoursOf({ from: "09:30", to: "12:00" }));
  check("hoursOf: a range across midnight wraps", B.hoursOf({ from: "22:00", to: "02:00" }).join() === "22,23,0,1");
  const strip = B.bestHoursOf([{ weekday: 1, hour: 18, attempts: 20, contacted: 12 }, { weekday: 2, hour: 18, attempts: 14, contacted: 9 }, { weekday: 1, hour: 10, attempts: 8, contacted: 2 }], new Set([10, 18]));
  check("best hours: 24 cells, weekdays folded per hour, n ≥ 30 for a rate (OD44)", strip.length === 24 && strip[18]!.attempts === 34 && v(strip[18]!.contactRate) === 0.6176 && "insufficient" in strip[10]!.contactRate && strip[18]!.inWindow && !strip[3]!.inWindow, strip[18]);

  section = "pure · health rules";
  const H = await import("@/lib/health/rules/ops");
  const { HEALTH_RULE_PREFIXES } = await import("@/lib/health/types");
  const { mintScope } = await import("@/lib/tenancy/seam");
  const scope = mintScope("system", "01HZTESTSTORE0000000000000");
  const SPEC_RULES = ["first_touch", "untouched", "no_agent", "unreachable_rise", "abandoned", "callbacks_overdue", "to_pack_aging", "hold_passed", "delivery_rescue", "sheet_agents_unmapped"].map((r) => `ops:${r}`).concat(["costs_missing", "settlement_check", "fee_gap", "ad_rate_missing"].map((r) => `fin:${r}`));
  check("the R1 ops and fin rules of OPE-§27.2, one fixture each", JSON.stringify(H.rules.map((r) => r.id)) === JSON.stringify(SPEC_RULES) && JSON.stringify(H.fixtures.map((f) => f.rule)) === JSON.stringify(SPEC_RULES), H.rules.map((r) => r.id));
  check("every rule id carries a prefix of the ops file (PD79)", H.rules.every((r) => HEALTH_RULE_PREFIXES.ops.includes(r.id.split(":")[0]!)));
  const base = { now: new Date("2026-11-03T10:00:00Z") } as import("@/lib/health/types").HealthInputs;
  const PII_TEXT = /\+?\d[\d\s]{7,}|@[a-z]/i;
  for (const fx of H.fixtures) {
    const r = H.rules.find((x) => x.id === fx.rule)!;
    const t0 = performance.now();
    const fired = await r.collect(scope, { ...base, ...fx.fires });
    const ms = performance.now() - t0;
    const quiet = await r.collect(scope, { ...base, ...fx.silent });
    const calm = await r.collect(scope, { ...base, ...H.withOps({}) });
    check(`${fx.rule} fires on its fixture`, !!fired && fired.id === fx.rule && (!fx.expect?.severity || fired.severity === fx.expect.severity) && (!fx.expect?.metric || fired.evidence.metric === fx.expect.metric), fired);
    check(`${fx.rule} stays silent below its threshold or minimum n`, quiet === null, quiet);
    check(`${fx.rule} stays silent on a quiet store`, calm === null, calm);
    check(`${fx.rule}: evidence with n, a fix link into P4's screens, a health.ops text`, !!fired && typeof fired.evidence.n === "number" && fired.fix.kind === "link" && fired.fix.href("demo").startsWith("/app/demo/") && fired.text === `health.ops.${fx.rule.replace(/^ops:/, "").replace(/^fin:/, "fin_")}.text`, fired && { fix: fired.fix.kind === "link" ? fired.fix.href("demo") : fired.fix, text: fired.text });
    check(`${fx.rule}: no customer field in the issue`, !!fired && !PII_TEXT.test(JSON.stringify(fired)) && !JSON.stringify(fired).match(/"(phone|name|address|email|note)"/), fired);
    check(`${fx.rule}: collect ≤ 40 ms on the in-memory facts`, ms <= 40, ms);
  }
  check("a rule is silent when the ops facts are unavailable (null)", (await H.rules[0]!.collect(scope, { ...base, ...({ ops: null } as object) })) === null);
  console.log(`  insights: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
}

/** Arguments that make each KPI function compute (the runtime half of the Kpi return check). */
function sampleArgs(name: string): unknown[] {
  switch (name) {
    case "netDeliveredRate":
      return [[{ placed: 40, delivered: 30 }]];
    case "firstTouchP50":
    case "firstTouchP90":
    case "handlingTimeP50":
      return [[1, 2, 3], "agent"];
    case "contactRate":
      return [{ contacted: 3, attempts: 40 }];
    case "riskyShare":
      return [{ risky: 1, placed: 40 }];
    default:
      return [{ confirmed: 25, cancelled: 2, unreachable: 1, delivered: 20, refused: 1, returned: 1, lost: 0, attempts: 40, abandoned: 1, claimed: 30, skipped: 1, inbound: 3, decisions: 28, final: 22 }, "agent"];
  }
}

/* ------------------------------------------------------------------ */
/* the agent console (P4 step 9: OPE-§13, OD36, OD37, OP-17)           */
/* ------------------------------------------------------------------ */

section = "static · console";
{
  // OP-17: the queue's single-key map against the shell chords of core §I.3 (no G, no two-key sequence, no duplicate)
  const CHORDS = ["G O", "G Q", "G L", "G C", "G P", "G M", "G T", "G S", "G H", "G N", "G W"];
  const keysSrc = readFileSync(join(ROOT, "src", "components", "admin", "queue", "keys.ts"), "utf8");
  const caps = [...keysSrc.matchAll(/\{ id: "([a-zA-Z0-9]+)", key: "([^"]+)", codes: \[([^\]]*)\]/g)].map((m) => ({ id: m[1]!, key: m[2]!, codes: [...m[3]!.matchAll(/"([A-Za-z0-9]+)"/g)].map((c) => c[1]!) }));
  check("the key map lists N C W 1-6 E S T X I D ? Esc", caps.map((c) => c.key).join(" ") === "N C W 1 2 3 4 5 6 E S T X I D ? Esc", caps.map((c) => c.key));
  // a chord is a two-key sequence: the queue's single keys may equal a chord's second key (N next, G N notifications,
  // core §I.3 lists both), never its prefix, and no queue key is a sequence
  const prefixes = new Set(CHORDS.map((c) => c.split(" ")[0]!));
  const queueOwned = caps.filter((c) => c.key !== "?" && c.key !== "Esc").map((c) => c.key);
  check("the queue map ∩ the shell chords = ∅ (no chord prefix, no sequence, no chord)", queueOwned.every((k) => !prefixes.has(k) && k.length === 1) && CHORDS.every((c) => !queueOwned.includes(c)), queueOwned.filter((k) => prefixes.has(k) || k.length !== 1));
  const codes = caps.flatMap((c) => c.codes);
  check("no physical key bound twice", new Set(codes).size === codes.length, codes);
  check("keys are matched by event.code (KeyN, Digit1 …), letters and digits only", codes.every((c) => /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Escape)$/.test(c)), codes);
  const cmdSrc = readFileSync(join(ROOT, "src", "components", "admin", "shell", "commands", "ops.ts"), "utf8");
  check("commands/ops.ts registers the map for the `?` sheet", /export const shortcuts[^=]*=\s*\{[^}]*keys: QUEUE_KEYS/.test(cmdSrc));

  // no orange in the console (owner rule 1): every OKLCH literal of its files outside hue 25-75 or chroma ≤ 0.06
  const dir = join(ROOT, "src", "components", "admin", "queue");
  const orange: string[] = [];
  let oklch = 0;
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/g)) {
      oklch++;
      const c = Number(m[2]);
      const h = Number(m[3]);
      if (h >= 25 && h <= 75 && c > 0.06) orange.push(`${f}: ${m[0]}`);
    }
    if (/\b(?:orange|amber)-\d{2,3}\b/.test(src)) orange.push(`${f}: a Tailwind orange / amber class`);
  }
  check("the console's colours are read (the scan is not blind)", oklch >= 4, oklch);
  check("no orange in src/components/admin/queue/** (hue 25-75 with chroma > 0.06)", orange.length === 0, orange);
  const css = readFileSync(join(dir, "queue.css"), "utf8");
  const durations = [...css.matchAll(/(\d+)ms/g)].map((m) => Number(m[1]));
  check("console motion: no overshoot curve, reduced motion handled, transitions ≤ 400 ms (the shimmer and sweep loops aside)", !/cubic-bezier\([^)]*(?:-|1\.[1-9])/.test(css) && /prefers-reduced-motion/.test(css) && durations.every((d) => d <= 400 || d === 900 || d === 1400), durations);
  const tsx = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  check("no uppercase, letter-spacing or italic class in the console (RTL7)", !/\b(?:uppercase|italic|tracking-(?:wide|wider|widest|tight|tighter))\b/.test(tsx));
  const physical = [...tsx.matchAll(/(?<![\w-])(?:ml|mr|pl|pr|left|right|border-l|border-r|text-left|text-right|rounded-l|rounded-r)-[\w[][^\s"]*/g)].map((m) => m[0]).filter((x) => x !== "left-1/2");
  check("no physical left / right utilities in the console (logical properties only, core §I.5)", physical.length === 0, physical);
  check("the revealed number never reaches web storage or an app URL", !/(?:localStorage|sessionStorage)[^;]*(?:national|e164|tel\b)/.test(tsx) && !/router\.push\([^)]*(?:national|e164)/.test(tsx));

  // the console set complete in ar, fr and en (OD34), and every literal key it renders present
  const cat = (l: string) => {
    const src = readFileSync(join(ROOT, "src", "lib", "i18n", "admin", l, "ops.ts"), "utf8");
    return new Set([...src.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]!));
  };
  const [en, fr, ar] = [cat("en"), cat("fr"), cat("ar")];
  const PREFIXES = ["ops.queue.", "ops.outcome.", "ops.rescue.", "ops.presence.", "ops.state.", "ops.callback.", "ops.cancel.", "ops.recall.", "ops.hold.", "ops.lane.", "ops.script.", "ops.wa.", "ops.inbound.", "ops.callbacks.", "ops.counter.", "ops.me.", "ops.note.", "ops.timeline.", "ops.key.", "ops.error.", "ops.history.", "ops.dup.", "ops.test.", "ops.reason."];
  const SINGLE = ["ops.saving", "ops.saved", "ops.couldNotSave", "ops.callStarted", "ops.waStarted", "ops.skip", "ops.skipped", "ops.saveAndNext", "ops.edit", "ops.close"];
  const consoleKeys = [...en].filter((k) => PREFIXES.some((p) => k.startsWith(p)) || SINGLE.includes(k));
  check("the console set holds the OPE-§N keys", ["ops.queue.next", "ops.queue.resume", "ops.queue.howDidItGo", "ops.outcome.busy", "ops.state.cap", "ops.state.leaseLost", "ops.callback.outsideHours", "ops.me.endOfDay", "ops.couldNotSave", "ops.rescue.callsLeft", "ops.inbound.paused"].every((k) => en.has(k)));
  check("the console set complete in fr", consoleKeys.filter((k) => !fr.has(k)).length === 0, consoleKeys.filter((k) => !fr.has(k)));
  check("the console set complete in ar", consoleKeys.filter((k) => !ar.has(k)).length === 0, consoleKeys.filter((k) => !ar.has(k)));
  const used = new Set([...[...tsx.matchAll(/["'`](ops\.[a-zA-Z0-9_.]+)["'`]/g)].map((m) => m[1]!), ...[...keysSrc.matchAll(/"(ops\.[a-zA-Z0-9_.]+)"/g)].map((m) => m[1]!)]);
  const missing = [...used].filter((k) => !en.has(k) && !k.endsWith("."));
  check("every literal key the console renders exists in en", missing.length === 0, missing);
}

/** P4 step 10 (OPE-§12.4-§12.6): "Move to…" from the one state machine, the bulk menu, the seam's answers flattened. */
async function ordersClient(): Promise<void> {
  section = "pure · orders list";
  const U = await import("@/components/admin/orders/ops-ui");
  const can = (keys: string[]) => (p: string) => keys.includes(p);
  const agent = U.viewerMovePerms(can(["orders.write"]) as never);
  const manager = U.viewerMovePerms(can(["orders.write", "orders.assign", "orders.force_status", "shipments.write"]) as never);
  const fresh = { confirm: "new", ship: "none", money: "unpaid" } as const;
  const labels = (e: { label: string; mode: string }[], mode: string) => e.filter((x) => x.mode === mode).map((x) => x.label);
  const a = U.moveEntries(fresh, agent);
  check("an agent moves a new order to confirmed, cancelled (with a reason), never to shipped", labels(a, "legal").includes("confirmed") && a.find((x) => x.label === "cancelled")?.reason === "cancel" && !labels(a, "legal").includes("shipped"), a);
  check("without orders.force_status nothing is offered under Force…", labels(a, "force").length === 0, a);
  check("Move to… never lists `new` or `duplicate` (the duplicates block names the sibling)", !a.concat(U.moveEntries(fresh, manager)).some((x) => x.label === "new" || x.label === "duplicate"));
  const m = U.moveEntries({ confirm: "confirmed", ship: "shipped", money: "unpaid" }, manager);
  check("a shipped order cannot be cancelled except by force", !labels(m, "legal").includes("cancelled") && labels(m, "force").includes("cancelled"), m);
  check("a refusal at the door is a legal shipments.write move, no reason asked (the L cell has none)", m.find((x) => x.label === "refused")?.mode === "legal" && m.find((x) => x.label === "refused")?.reason === null, m);
  check("an agent without shipments.write gets no ship target", !U.moveEntries({ confirm: "confirmed", ship: "shipped", money: "unpaid" }, agent).some((x) => x.mode === "legal" && ["delivered", "refused", "returned"].includes(x.label)));
  const bulk = U.bulkEntries([fresh, { confirm: "confirmed", ship: "to_pack", money: "unpaid" }], manager);
  check("the bulk menu offers the union of legal labels, never Force…", bulk.length > 0 && bulk.every((x) => x.mode === "legal"), bulk);

  const ok = await U.settle(Promise.resolve({ ok: true, data: { ok: true, data: { n: 1 } } }));
  const flat = await U.settle(Promise.resolve({ ok: true, data: { ok: true, rev: 3, changed: true } }));
  const inner = await U.settle(Promise.resolve({ ok: true, data: { ok: false, error: "conflict" } }));
  const outer = await U.settle(Promise.resolve({ ok: false, error: "forbidden" }));
  const net = await U.settle(Promise.reject(new Error("offline")));
  check("settle: ActionResult in ActionResult → its data", ok.ok && (ok.data as { n: number }).n === 1, ok);
  check("settle: a TransitionResult stays whole", flat.ok && (flat.data as { rev: number }).rev === 3, flat);
  check("settle: inner and outer refusals and a network error answer { ok: false, error }", !inner.ok && inner.error === "conflict" && !outer.ok && outer.error === "forbidden" && !net.ok && net.error === "network");
  check("the bulk idem is a UUID (OD36's cache key)", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(U.newIdem()));
}

async function consoleClient(): Promise<void> {
  section = "pure · console";
  const O = await import("@/components/admin/queue/outbox");
  const T = await import("@/components/admin/queue/time");
  const K = await import("@/components/admin/queue/keys");

  // OD37: the pending entry holds the five fields only, ≤ 512 B, never a phone, a name or a note
  const entry = { orderId: "WA-ABCD1234", rev: 7, outcome: "callback", idem: O.newIdem(), at: 1_700_000_000_000 };
  const raw = O.serializePending({ ...entry, phone: "+212612345678", name: "Karim", note: "x" } as never);
  check("the pending entry keeps { orderId, rev, outcome, idem, at } only", JSON.stringify(Object.keys(JSON.parse(raw) as object)) === JSON.stringify(["orderId", "rev", "outcome", "idem", "at"]) && !/\+212|Karim/.test(raw), raw);
  check("the pending entry fits 512 B", Buffer.byteLength(raw) <= O.PENDING_MAX_BYTES, Buffer.byteLength(raw));
  check("a fresh entry resumes, a stale one (> 10 min) is dropped", O.parsePending(raw, entry.at + 5_000)?.idem === entry.idem && O.parsePending(raw, entry.at + 11 * 60_000) === null);
  check("a malformed entry is dropped", O.parsePending("{oops", entry.at) === null && O.parsePending(JSON.stringify({ orderId: 1 }), entry.at) === null);
  const store = new Map<string, string>();
  const kv = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  O.savePending("S1", "U1", entry, kv);
  O.savePending("S2", "U1", entry, kv);
  store.set("unrelated", "1");
  O.clearOtherPending("S1", "U1", kv);
  check("a store switch clears the other stores' entries only", store.has(O.pendingKey("S1", "U1")) && !store.has(O.pendingKey("S2", "U1")) && store.has("unrelated"), [...store.keys()]);
  check("the storage key is sg:ops:pending:<storeId>:<userId>", O.pendingKey("S1", "U1") === "sg:ops:pending:S1:U1");
  check("a minted key is a v4 UUID", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(O.newIdem()));

  // the retry schedule: network errors only, 0.5 / 1 / 2 / 4 / 8 / 15 s (≤ 30.5 s), then null; an answer is never retried
  check("the schedule is 0.5 / 1 / 2 / 4 / 8 / 15 s", JSON.stringify(O.RETRY_DELAYS_MS) === "[500,1000,2000,4000,8000,15000]" && O.RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) <= 30_500);
  const slept: number[] = [];
  let calls = 0;
  const gaveUp = await O.withRetry(
    async () => {
      calls++;
      throw new O.NetworkError();
    },
    O.RETRY_DELAYS_MS,
    async (ms) => void slept.push(ms),
  );
  check("offline: 7 tries on the schedule, then the grid's retry", gaveUp === null && calls === 7 && slept.join() === "500,1000,2000,4000,8000,15000", { calls, slept });
  calls = 0;
  const back = await O.withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new O.NetworkError();
      return "saved";
    },
    O.RETRY_DELAYS_MS,
    async () => undefined,
  );
  check("back in coverage on the 3rd try: the answer", back === "saved" && calls === 3);
  let sent = 0;
  const keysSeen = new Set<string>();
  const answeredFetch = async (_u: string, init?: RequestInit) => {
    sent++;
    keysSeen.add(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    return new Response(JSON.stringify({ ok: false, error: "illegal" }), { status: 422 });
  };
  const idemKey = O.newIdem();
  const answered = await O.withRetry(() => O.hot<{ ok: boolean; error: string }>("atlas", "outcome", {}, idemKey, answeredFetch), O.RETRY_DELAYS_MS, async () => undefined);
  check("a 4xx is an answer: never retried, the body kept", sent === 1 && answered?.status === 422 && answered.body.error === "illegal");
  const flaky = async (_u: string, init?: RequestInit) => {
    sent++;
    keysSeen.add(new Headers(init?.headers).get("Idempotency-Key") ?? "");
    if (sent < 4) throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  sent = 0;
  keysSeen.clear();
  await O.withRetry(() => O.hot("atlas", "outcome", {}, idemKey, flaky), O.RETRY_DELAYS_MS, async () => undefined);
  check("every retry carries the same Idempotency-Key", keysSeen.size === 1 && keysSeen.has(idemKey), [...keysSeen]);
  check("the hot path's URL", O.opsPath("atlas-argan", "next") === "/api/app/atlas-argan/ops/next");

  // the keys by event.code (an Arabic layout presses the same physical key)
  const ev = (code: string, key: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ code, key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
  check("N on an Arabic layout (key 'ى') is Next", K.queueKeyOf(ev("KeyN", "ى")) === "next");
  check("Digit1 on AZERTY (key '&') is outcome 1", K.queueKeyOf(ev("Digit1", "&")) === "o1");
  check("? on any layout opens the sheet", K.queueKeyOf(ev("Slash", "?", { shiftKey: true })) === "help" && K.queueKeyOf(ev("KeyM", "?", { shiftKey: true })) === "help" && K.queueKeyOf(ev("Slash", "؟", { shiftKey: true })) === "help");
  check("a modifier held never fires (Ctrl+C copies)", K.queueKeyOf(ev("KeyC", "c", { ctrlKey: true })) === null && K.queueKeyOf(ev("KeyN", "n", { metaKey: true })) === null);
  check("G (the chords' prefix) is not a queue key", K.queueKeyOf(ev("KeyG", "g")) === null);

  // the pickers in the store's time zone (OPE-§6.5, OD49)
  const TZ = "Africa/Casablanca";
  const day = (r: { from: string; to: string }[]) => r;
  const w = {
    tz: TZ,
    days: { 1: day([{ from: "09:30", to: "13:00" }, { from: "14:30", to: "20:00" }]), 2: day([{ from: "09:30", to: "20:00" }]), 3: day([{ from: "09:30", to: "20:00" }]), 4: day([{ from: "09:30", to: "20:00" }]), 5: day([{ from: "09:30", to: "20:00" }]), 6: day([{ from: "10:00", to: "18:00" }]), 7: day([]) },
    closedDates: [],
    overrides: [],
    openOverrideUntil: null,
    configured: true,
  };
  const monNoon = new Date("2026-11-09T11:00:00Z"); // Monday 12:00 in Casablanca (UTC+1)
  const chips = T.callbackChips(monNoon, w);
  check("the four callback chips on a Monday noon", chips.map((c) => c.id).join() === "inOneHour,thisEvening,tomorrow11,tomorrow1830", chips.map((c) => c.id));
  check("This evening is 18:30 store time", T.clock(chips.find((c) => c.id === "thisEvening")!.at, TZ, "en") === "18:30");
  check("In 1 hour at 13:00 falls in the lunch gap: marked outside calling hours", chips.find((c) => c.id === "inOneHour")!.outside === true && chips.find((c) => c.id === "tomorrow11")!.outside === false);
  const lateSat = new Date("2026-11-14T18:50:00Z"); // Saturday 19:50: This evening has passed, Sunday has no hours
  const sat = T.callbackChips(lateSat, w);
  check("after 18:30 This evening is gone; Sunday chips say outside calling hours", !sat.some((c) => c.id === "thisEvening") && sat.filter((c) => c.id.startsWith("tomorrow")).every((c) => c.outside));
  check("a custom callback reads the store's wall clock", T.customInstant("2026-11-10T18:30", TZ, monNoon)?.toISOString() === "2026-11-10T17:30:00.000Z");
  check("a custom callback under 5 minutes or past 30 days is refused", T.customInstant("2026-11-09T12:02", TZ, monNoon) === null && T.customInstant("2026-12-20T12:00", TZ, monNoon) === null);
  const holds = T.holdChips(new Date("2026-11-11T10:00:00Z"), TZ); // a Wednesday
  check("hold chips: tomorrow, next Monday, the 1st of next month", holds.map((h) => `${h.id}:${h.ymd}`).join() === "tomorrow:2026-11-12,nextMonday:2026-11-16,firstOfNextMonth:2026-12-01", holds);
  const lastDay = T.holdChips(new Date("2026-11-30T10:00:00Z"), TZ); // Monday 30 Nov: the 1st is tomorrow
  check("a 1st that is tomorrow is offered once", lastDay.length === 2 && lastDay[0]!.ymd === "2026-12-01", lastDay);
  check("a typed hold within 60 days only", T.holdYmdOk("2026-12-01", monNoon, TZ) && !T.holdYmdOk("2026-11-09", monNoon, TZ) && !T.holdYmdOk("2027-02-01", monNoon, TZ));
  const arMoney = T.money(24_990, "MAD", "ar");
  check("money from integer cents, Latin digits in ar", /^249,90/.test(arMoney.replace(/\s/g, " ")) && /درهم/.test(arMoney), arMoney);
  check("times keep Latin digits in ar", T.clock("2026-11-09T17:30:00Z", TZ, "ar") === "18:30", T.clock("2026-11-09T17:30:00Z", TZ, "ar"));
}

cityKeySize()
  .catch((e: unknown) => failures.push(`[static · cityKey size] esbuild failed: ${e instanceof Error ? e.message : String(e)}`))
  .then(pure)
  .catch((e: unknown) => failures.push(`[pure] the selftest threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .then(idem)
  .catch((e: unknown) => failures.push(`[pure · idempotency] threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .then(card)
  .catch((e: unknown) => failures.push(`[pure · card] threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .then(carrier)
  .catch((e: unknown) => failures.push(`[pure · carrier csv] threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .then(insights)
  .catch((e: unknown) => failures.push(`[pure · insights] threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .then(consoleClient)
  .catch((e: unknown) => failures.push(`[pure · console] threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
  .then(ordersClient)
  .catch((e: unknown) => failures.push(`[pure · orders list] threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`))
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
