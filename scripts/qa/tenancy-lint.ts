/**
 * Tenancy lint: the static isolation gate of docs/STORE-SAAS.md §F.1 (rules L1-L10, L12, L13; L11 arrives with
 * R2's contract step). TypeScript compiler API (typescript 5.9.3, D47) over src/**\/*.{ts,tsx}; no database, no
 * network, no build:
 *
 *   npm run test:tenancy-lint                            (exit code 1 on any violation, 2 when the lint is broken)
 *   npx tsx scripts/qa/tenancy-lint.ts --summary         (counts only: per rule, per kind, the top files)
 *   npx tsx scripts/qa/tenancy-lint.ts --rule L2,L2b     (only these rules)
 *   npx tsx scripts/qa/tenancy-lint.ts --json            (one JSON document on stdout)
 *   npx tsx scripts/qa/tenancy-lint.ts --timing          (also print the time of each phase on stderr)
 *
 * Each violation prints as `file:line rule message`, then the counts per rule, the `// tenancy: platform` and
 * `// tenancy: public-key` annotations per directory, and the pins of scripts/qa/tenancy-allow.json (rule PIN: a
 * pinned group holds more queries exempted by `tenancy: platform` than its pin; "the count may only grow with a
 * reviewer's approval", §F.1).
 *
 * - Tenant tables = every mysqlTable of src/lib/db/schema.ts with a `store_id` column, read from the schema at run
 *   time (rev 3, ENGC-5), so a new table is covered the day it is added. A builder argument is named by its type
 *   (`_.name`), so a helper, a `let`, a ternary or a typed parameter cannot hide a tenant table; a table the type does
 *   not name (a generic, `MySqlTable`, any, SQL as a source) is L1 `dynamic-table`, and a tenant table handed to an
 *   app function without a StoreScope parameter is L1 `table-arg` (review C0b F6).
 * - A scope parameter is a parameter typed StoreScope, or a ctx whose `scope` is one (StoreCtx / WriteCtx, D71 rev 4);
 *   the predicate's scope is that parameter, `<ctx>.scope`, or a `scope` destructured from it (review C0b F15).
 * - The annotation exemption (§E.3 rule 6) needs both an allowlisted file and the annotation on the query: an own-line
 *   comment leading the innermost statement (or the expression-bodied function and its declaration) that holds the
 *   query, an own-line comment leading the query expression, or a comment on one of the query's own lines. Never a
 *   comment elsewhere in an enclosing statement, never across a function boundary (review C0b F7). It covers the
 *   statement-level rules (L1, L2, L2b, L3, L3b, L6, L10). PIN counts the exempted queries, not comment lines.
 * - L9's only exemptions are the allow file's `actions` (file + exported name + reason, maintainer only, CCR r1.0-m-3);
 *   every export of a "use server" file the lint cannot read as a seam-wrapped function fails closed (review C0b F11).
 * - L2 takes only the four helpers (`eq(T.storeId, scope.storeId)` alone is not a store predicate, though not L2b);
 *   every `.where()` of a chain must carry one (drizzle keeps the last), a `$dynamic()` chain may not escape, storeSql()
 *   in a template counts only as its first conjunct, and an and() sibling that may hold a top-level OR is reported
 *   (drizzle inlines a nested SQL fragment without parentheses; whereStore() parenthesizes each condition).
 * - L6 judges the scope each write uses (not the function), and outside the seam files any object literal that is a
 *   StoreScope or spreads a scope / ctx, Object.assign / structuredClone of one, and any cast to a scope (review C0b
 *   F1, F8). The brand is a symbol-keyed property a spread copies: the nominal brand is CCR r1.0-m-5 for R2. Its
 *   `reveal-scope` kind (P0b, CCR P4-8) pins the one staff write scope, `platformRevealScope()`, to
 *   src/lib/orders/profile.ts; P0b review F-3 adds `scope-ref` (platformRevealScope, platformScope or mintScope used as
 *   a value anywhere: an alias, a callback, a shorthand property, so no call can hide behind a local name the callee
 *   check never resolves) and `reveal-escape` (in profile.ts the reveal scope goes straight into a call of an app
 *   function, or into a `const` read only that way; never returned, stored, spread or out of an export).
 * - L10 reads every SQL text of src/** (a string, template or `+` chain starting with a statement keyword, wherever it
 *   goes, and every drizzle `sql` template), per query level (review C0b F5).
 * - L4 judges process state, so it skips the standalone `selftest*.ts` scripts, and a module-scope Map / Set that the
 *   type checker proves is never changed after module load (a ReadonlySet / ReadonlyMap slot, or only ever read, its
 *   references found by resolved symbol through renaming imports) is a lookup table, not a cache: it needs no allow
 *   entry (see `frozen`). A Map / Set a function, a static block or an IIFE stores in module scope, a static or a
 *   globalThis property is judged too, and so is any globalThis.__cod… / __sg… access whatever its cast (F9).
 * - The standalone selftests are also outside L10 (raw SQL) and L6's forged-scope checks: they seed and fake stores on
 *   purpose, and the app never imports them; every other rule applies to them.
 * - The lint checks itself first: built-in fixtures (virtual files compiled in the same program, against the real
 *   schema, helpers and seam types) carry `//! <rules>` markers, and every rule must fire on exactly the marked lines,
 *   or the run stops with exit code 2 before src is judged.
 * - R1.0: standalone (`npm run test:tenancy-lint`); it joins `npm test` and `prebuild` at the R1.0 integration with
 *   0 violations (§J.1, §J.5). docs/saas/ccr/r1.0-c0b-lint-baseline.md records the counts at C0b.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import ts from "typescript";
import { z } from "zod";
import * as schemaModule from "../../src/lib/db/schema";

/* ------------------------------------------------------------------ */
/* paths and rule table                                                */
/* ------------------------------------------------------------------ */

const norm = (f: string) => f.replace(/\\/g, "/");
const ROOT = norm(path.resolve(__dirname, "..", ".."));
const ALLOW_FILE = `${ROOT}/scripts/qa/tenancy-allow.json`;
const FOLD = process.platform === "win32";
const fold = (f: string) => (FOLD ? norm(f).toLowerCase() : norm(f));

/** repo-relative path with forward slashes ("src/lib/x.ts"); files outside the repo keep their absolute path */
function rel(fileName: string): string {
  const f = norm(fileName);
  return fold(f).startsWith(fold(ROOT) + "/") ? f.slice(ROOT.length + 1) : f;
}

const RULES = {
  L1: "tenant-table call in a function without a StoreScope parameter, a table the lint cannot name, or a table handed off",
  L2: "select/update/delete whose .where() has no store predicate on a scope parameter, or one that can be widened",
  L2b: "eq(<table>.storeId, …) instead of inStore()/whereStore()/byId()",
  L3: "tenant insert without storeValues(), or a call to the removed settings API",
  L3b: ".set() / ON DUPLICATE KEY UPDATE on a tenant table whose value type has storeId",
  L4: "process-wide global or module-scope Map/Set outside scopedCache() and the allow file",
  L5: "rate bucket that is not a Bucket (or a cast to one), rateLimit as a value, or GET_LOCK outside src/lib/db",
  L6: "write through a scope that is not a WriteScope, a forged or cast scope, or a scope minted outside the seam",
  L7: "src/app or src/components imports the db client or schema (directly or through a re-export)",
  L8: "hand-built /admin path or live URL (use appHref / storeUrl)",
  L9: "server action whose body does not start with return storeAction/platformAction/userAction/publicAction(",
  L10: "raw SQL on a tenant table without store_id = as a conjunct of its level's WHERE, or with a table name the lint cannot read",
  L12: "publish path without runPrePublishChecks(), or a public order/lead handler without resolveTestToken()",
  L13: "route handler that does not pass its seam first",
  PIN: "more queries exempted by tenancy annotations than the allow file pins",
} as const;
type RuleId = keyof typeof RULES;

interface Violation {
  file: string;
  line: number;
  rule: RuleId;
  kind: string;
  message: string;
}

/** §E.3 rule 6: where `// tenancy: platform <reason>` exempts a statement */
const PLATFORM_DIRS = [
  "src/lib/platform/",
  "src/lib/jobs/",
  "src/lib/tenancy/",
  "src/lib/auth/",
  "src/lib/db/",
  "src/lib/ai/platform/",
  "src/lib/design/novelty.server.ts",
  "src/lib/health/",
];
/**
 * §E.3 rule 6: where `// tenancy: public-key <key>` exempts a statement. `src/lib/media/store.ts`: the chunk store's
 * media-key read (§G.6: a media key is global and random; the media route resolves its store first with
 * `resolveMediaKey`), CCR r1.0-m-4.
 */
const PUBLIC_KEY_FILES = ["src/lib/tenancy/public.ts", "src/lib/tenancy/invites.ts", "src/lib/media/store.ts"];
const under = (file: string, prefixes: readonly string[]) => prefixes.some((p) => (p.endsWith("/") ? file.startsWith(p) : file === p));

const F = {
  sql: "src/lib/tenancy/sql.ts",
  seam: "src/lib/tenancy/seam.ts",
  platformSeam: "src/lib/platform/seam.ts",
  auth: "src/lib/auth/index.ts",
  publicResolvers: "src/lib/tenancy/public.ts",
  settings: "src/lib/settings/index.ts",
  rateLimit: "src/lib/security/rate-limit.ts",
  publish: "src/lib/render/publish.server.ts",
  prepublish: "src/lib/render/prepublish.ts",
  types: "src/lib/tenancy/types.ts",
  schema: "src/lib/db/schema.ts",
  dbClient: "src/lib/db/client.ts",
  cache: "src/lib/tenancy/cache.ts",
};

/** the removed single-tenant settings API (§D.10; `getSettings` is its plural read, deleted with it) */
const LEGACY_SETTINGS = new Set(["getSetting", "getSettings", "setSetting", "updateSetting"]);
/** the four bodies an exported server action may start with (§E.2, AUTH-31) */
const SEAM_ACTIONS: Record<string, string> = { storeAction: F.seam, platformAction: F.platformSeam, userAction: F.auth, publicAction: F.auth };
/** C0a's mintScope callers (src/lib/tenancy/seam.ts: "lint L6 pins them") */
const MINT_SITES = [F.seam, F.platformSeam, F.publicResolvers, "src/lib/jobs/scope.ts"];
/** the one caller of `platformRevealScope` (P0b, CCR P4-8, D71): recordPlatformReveal's `phone_revealed` event */
const REVEAL_SITE = "src/lib/orders/profile.ts";
/** the scope builders whose every use must be a direct call (P0b review F-3, kind `scope-ref`): name → declaring file */
const SCOPE_FNS: Readonly<Record<string, string>> = { platformRevealScope: F.platformSeam, platformScope: F.platformSeam, mintScope: F.seam };
/** the reveal site, and its self-check twin in the fixture folder */
function isRevealSite(f: string): boolean {
  return f === REVEAL_SITE || f === `src/lib/orders/${FX}/profile.ts`;
}
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const DRIZZLE_TABLE_CALLS = new Set(["from", "update", "delete", "insert", "innerJoin", "leftJoin", "rightJoin", "fullJoin", "$count"]);
const WRITES = new Set(["insert", "update", "delete"]);
/** members that only read a Map / Set (L4: a module-scope collection used only through these is frozen at module load) */
const READ_MEMBERS = new Set(["has", "get", "size", "keys", "values", "entries", "forEach"]);
const READONLY_COLLECTIONS = new Set(["ReadonlySet", "ReadonlyMap"]);
/** standalone test scripts (`tsx src/**\/selftest*.ts`): never imported by the app, so no process state of theirs is shared (L4) */
const SELFTEST = /(^|\/)selftest[^/]*\.tsx?$/;

interface FnRef {
  file: string;
  name: string;
}
interface AllowEntry {
  file: string;
  symbol: string;
  reason: string;
}
interface Pin {
  files: string[];
  max: number;
  reason: string;
}
interface Config {
  allow: AllowEntry[];
  /** L9: exported server actions that cannot take a seam wrapper, by file and name, each with its reason (m-3) */
  actions: AllowEntry[];
  pins: Pin[];
  /** functions that commit a rendered version (L12) */
  publishSinks: FnRef[];
  /** the pre-publish gate (L12) */
  prePublishGates: FnRef[];
  /** the test-order token check of public order/lead handlers (L12, D54) */
  testToken: FnRef[];
  /** the public resolvers a /api/public handler passes before any tenant-table call (L13) */
  publicResolvers: FnRef[];
  /**
   * L13: platform reads a public handler may make before it knows the store, neither a touch nor a resolution (each
   * one a `tenancy: platform` query of src/lib/tenancy/public.ts that returns no store's rows: the CORS preflight's
   * union of export origins, §E.6 / PUB-21). Added at the T3 merge (R1.0 integration).
   */
  preResolveReads: FnRef[];
}

const AllowFile = z
  .object({
    $comment: z.union([z.string(), z.array(z.string())]).optional(),
    entries: z.array(z.object({ file: z.string().min(1), symbol: z.string().min(1), reason: z.string().min(8) }).strict()),
    actions: z.array(z.object({ file: z.string().min(1), symbol: z.string().min(1), reason: z.string().min(8) }).strict()).default([]),
    pins: z.array(z.object({ files: z.array(z.string().min(1)).min(1), max: z.number().int().min(0), reason: z.string().min(4) }).strict()),
  })
  .strict();

const REAL_CONFIG = (allow: z.infer<typeof AllowFile>): Config => ({
  allow: allow.entries,
  actions: allow.actions,
  pins: allow.pins,
  publishSinks: [
    { file: F.publish, name: "publishPage" },
    { file: F.publish, name: "renderAndCommit" },
  ],
  prePublishGates: [{ file: F.prepublish, name: "runPrePublishChecks" }],
  testToken: [{ file: F.publicResolvers, name: "resolveTestToken" }],
  // resolveUpsellOrder and resolveMediaKey: T3's public-key resolvers (orderId, mediaKey), added at the T3 merge
  publicResolvers: [
    "resolvePublicTarget",
    "resolveStoreByHandle",
    "resolveOrderForTracking",
    "resolveKitShare",
    "resolveProductKey",
    "resolveContextKey",
    "resolveUpsellOrder",
    "resolveMediaKey",
  ].map((name) => ({ file: F.publicResolvers, name })),
  preResolveReads: [{ file: F.publicResolvers, name: "listActiveExportOrigins" }],
});

/* ------------------------------------------------------------------ */
/* tenant tables (read from the schema at run time)                    */
/* ------------------------------------------------------------------ */

/** export name → SQL table name, for every table with a `store_id` column */
function tenantTablesFromSchema(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of Object.entries(schemaModule as Record<string, unknown>)) {
    if (!is(value, MySqlTable)) continue;
    const cfg = getTableConfig(value);
    if (cfg.columns.some((c) => c.name === "store_id")) out.set(name, cfg.name);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* AST helpers                                                         */
/* ------------------------------------------------------------------ */

type FnLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

const isFnLike = (n: ts.Node): n is FnLike =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) ||
  ts.isConstructorDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) ||
  ts.isSetAccessorDeclaration(n);

function unwrap(e: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e))
    e = e.expression;
  return e;
}

/** innermost first */
function enclosingFns(n: ts.Node): FnLike[] {
  const out: FnLike[] = [];
  for (let p = n.parent; p; p = p.parent) if (isFnLike(p)) out.push(p);
  return out;
}

function isAncestor(a: ts.Node, n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

/** a statement (or a class property) whose own leading comment can carry an annotation */
function isStatementLike(n: ts.Node): boolean {
  return (
    ts.isVariableStatement(n) ||
    ts.isExpressionStatement(n) ||
    ts.isReturnStatement(n) ||
    ts.isIfStatement(n) ||
    ts.isForStatement(n) ||
    ts.isForOfStatement(n) ||
    ts.isForInStatement(n) ||
    ts.isWhileStatement(n) ||
    ts.isDoStatement(n) ||
    ts.isThrowStatement(n) ||
    ts.isSwitchStatement(n) ||
    ts.isLabeledStatement(n) ||
    ts.isExportAssignment(n) ||
    ts.isPropertyDeclaration(n)
  );
}

/**
 * The annotation carriers of `n` (review C0b F7): the innermost statement that contains it, or, when that is closer,
 * the expression-bodied function it sits in together with the declaration that holds that function
 * (`leak: async () => db…`, `export const f = () => db…`). Never crosses a function boundary: a comment on an outer
 * statement does not reach a query inside a nested function.
 */
function annotationCarriers(n: ts.Node): ts.Node[] {
  for (let p = n.parent; p; p = p.parent) {
    if (isFnLike(p)) {
      if (!p.body || ts.isBlock(p.body)) return [];
      const out: ts.Node[] = [p];
      let h: ts.Node = p.parent;
      while (ts.isParenthesizedExpression(h) || ts.isAsExpression(h) || ts.isSatisfiesExpression(h)) h = h.parent;
      if (ts.isPropertyAssignment(h) || ts.isPropertyDeclaration(h)) out.push(h);
      else if (ts.isVariableDeclaration(h)) {
        out.push(h);
        if (ts.isVariableDeclarationList(h.parent) && h.parent.declarations.length === 1 && ts.isVariableStatement(h.parent.parent)) out.push(h.parent.parent);
      }
      return out;
    }
    if (isStatementLike(p)) return [p];
  }
  return [];
}

/** `(() => …)()` / `(async function () {…})()`: runs once, where it stands */
function isIife(fn: FnLike): boolean {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  let e: ts.Node = fn;
  while (ts.isParenthesizedExpression(e.parent)) e = e.parent;
  return ts.isCallExpression(e.parent) && e.parent.expression === e;
}

/** the builder chain a call starts: every `.x(…)` call chained after it (`db.select().from(t).where(…).limit(1)`) */
function chainAfter(start: ts.CallExpression): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  let cur: ts.Expression = start;
  for (;;) {
    const pa = cur.parent;
    if (!pa || !ts.isPropertyAccessExpression(pa) || pa.expression !== cur) break;
    const call = pa.parent;
    if (!call || !ts.isCallExpression(call) || call.expression !== pa) break;
    out.push(call);
    cur = call;
  }
  return out;
}
const methodOf = (c: ts.CallExpression): string => (ts.isPropertyAccessExpression(c.expression) ? c.expression.name.text : "");

/** the whole query a tenant call belongs to: the outermost call of its chain, stopping before .then / .catch / .finally */
function queryTop(call: ts.CallExpression): ts.Expression {
  let top: ts.Expression = call;
  for (const c of chainAfter(call)) {
    if (["then", "catch", "finally"].includes(methodOf(c))) break;
    top = c;
  }
  return top;
}

const lineOf = (sf: ts.SourceFile, pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

function isDirective(s: ts.Statement | undefined, text: string): boolean {
  return !!s && ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === text;
}

function isUseServerFile(sf: ts.SourceFile): boolean {
  for (const s of sf.statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false;
    if (s.expression.text === "use server") return true;
  }
  return false;
}

/** `import type { … }` or `import { type A, type B }`: erased at build time */
function typeOnlyImport(d: ts.ImportDeclaration): boolean {
  const c = d.importClause;
  if (!c) return false;
  if (c.isTypeOnly) return true;
  return !c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly);
}

const hasModifier = (n: ts.Node, kind: ts.SyntaxKind) => !!(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === kind));

/** the name a function is known by (declaration, method, or the variable / property it is assigned to) */
function fnName(fn: FnLike): string | null {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn) || ts.isGetAccessorDeclaration(fn) || ts.isSetAccessorDeclaration(fn)) && fn.name)
    return ts.isIdentifier(fn.name) || ts.isStringLiteral(fn.name) ? fn.name.text : null;
  if (ts.isFunctionExpression(fn) && fn.name) return fn.name.text;
  let p: ts.Node = fn.parent;
  while (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p)) p = p.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
  return null;
}

/** an export of a module: `fn` is the function it resolves to, or null when the lint cannot read one (`why`) */
interface ExportedItem {
  name: string;
  fn: FnLike | null;
  at: ts.Node;
  why?: string;
}

/** the function a value expression denotes: a function literal, or a `const` / function declaration it names (aliases followed) */
function fnOfValue(e: ts.Expression | undefined, checker: ts.TypeChecker, depth = 0): FnLike | null {
  if (!e || depth > 4) return null;
  const x = unwrap(e);
  if (ts.isArrowFunction(x) || ts.isFunctionExpression(x)) return x;
  if (!ts.isIdentifier(x) && !ts.isPropertyAccessExpression(x)) return null;
  let sym = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(x) ? x.name : x);
  if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
  return fnOfDecls(sym?.declarations ?? [], checker, depth);
}

function fnOfDecls(decls: readonly ts.Declaration[], checker: ts.TypeChecker, depth: number): FnLike | null {
  for (const d of decls) {
    if (d.getSourceFile().isDeclarationFile) continue;
    if (isFnLike(d) && (d as FnLike).body) return d as FnLike;
    if ((ts.isVariableDeclaration(d) && ts.getCombinedNodeFlags(d) & ts.NodeFlags.Const) || ts.isPropertyAssignment(d)) {
      const fn = fnOfValue(d.initializer, checker, depth + 1);
      if (fn) return fn;
    }
  }
  return null;
}

/**
 * Every runtime export of a module (review C0b F11, F12): function declarations, `export const x = <fn | identifier>`,
 * `export default <fn | identifier>`, local `export { a as b }` resolve to their function; a call result
 * (`export const x = wrap(…)`), a re-export (`export { x } from`, `export *`) and a non-function value answer
 * `fn: null` with the reason, so a seam rule can fail closed. Type-only exports are skipped.
 */
function moduleExports(sf: ts.SourceFile, checker: ts.TypeChecker): ExportedItem[] {
  const out: ExportedItem[] = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && hasModifier(s, ts.SyntaxKind.ExportKeyword)) {
      if (s.body) out.push({ name: hasModifier(s, ts.SyntaxKind.DefaultKeyword) ? "default" : (s.name?.text ?? "default"), fn: s, at: s.name ?? s });
    } else if (ts.isVariableStatement(s) && hasModifier(s, ts.SyntaxKind.ExportKeyword) && !hasModifier(s, ts.SyntaxKind.DeclareKeyword)) {
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) {
          out.push({ name: d.name.getText(sf), fn: null, at: d.name, why: "a destructured export" });
          continue;
        }
        const fn = ts.getCombinedNodeFlags(d) & ts.NodeFlags.Const ? fnOfValue(d.initializer, checker) : null;
        const init = d.initializer ? unwrap(d.initializer) : undefined;
        out.push({ name: d.name.text, fn, at: d.name, why: fn ? undefined : init && ts.isCallExpression(init) ? "a value built by a call" : "not a function the lint can read" });
      }
    } else if (ts.isExportAssignment(s) && !s.isExportEquals) {
      const fn = fnOfValue(s.expression, checker);
      out.push({ name: "default", fn, at: s, why: fn ? undefined : "a default export that is not a function the lint can read" });
    } else if (ts.isExportDeclaration(s) && !s.isTypeOnly) {
      if (!s.exportClause || ts.isNamespaceExport(s.exportClause)) {
        out.push({ name: s.exportClause ? s.exportClause.name.text : "*", fn: null, at: s, why: "export * re-exports a module" });
        continue;
      }
      for (const spec of s.exportClause.elements) {
        if (spec.isTypeOnly) continue;
        if (s.moduleSpecifier) {
          out.push({ name: spec.name.text, fn: null, at: spec, why: "a re-export from another module" });
          continue;
        }
        const sym = checker.getExportSpecifierLocalTargetSymbol(spec);
        const target = sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
        if (target && !(target.flags & ts.SymbolFlags.Value)) continue; // a type
        const fn = fnOfDecls(target?.declarations ?? [], checker, 0);
        out.push({ name: spec.name.text, fn, at: spec, why: fn ? undefined : "not a function the lint can read" });
      }
    } else if ((ts.isClassDeclaration(s) || ts.isEnumDeclaration(s)) && hasModifier(s, ts.SyntaxKind.ExportKeyword) && !hasModifier(s, ts.SyntaxKind.DeclareKeyword)) {
      out.push({ name: s.name?.text ?? "default", fn: null, at: s.name ?? s, why: "a class or enum export" });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* raw SQL (L2 templates, L10)                                         */
/* ------------------------------------------------------------------ */

/** a template span or a concatenated value inside SQL text: unknown SQL (a fragment, an identifier, a value) */
const DYN = " \u0001 ";
/** the start of a SQL statement in a string of the app (keywords in capitals, as the code base writes them) */
const SQL_START = /^\s*\(?\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|WITH|TRUNCATE)\b/;
/** drizzle operators whose output is one comparison of their operands (no OR of their own) */
const SAFE_OPS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "isNull", "isNotNull", "inArray", "notInArray", "like", "notLike", "ilike", "notIlike", "between", "notBetween", "exists", "notExists"]);

type SqlTok = { t: "word"; v: string; up: string } | { t: "str" } | { t: "num" } | { t: "param" } | { t: "dyn" } | { t: "op"; v: string };
interface SqlGroup {
  t: "group";
  items: SqlNode[];
}
type SqlNode = SqlTok | SqlGroup;

function sqlTokens(text: string): SqlTok[] {
  const out: SqlTok[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) i++;
    else if (c === "\u0001") {
      out.push({ t: "dyn" });
      i++;
    } else if ((c === "-" && text[i + 1] === "-") || c === "#") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === "'" || c === '"') {
      i++;
      while (i < text.length && !(text[i] === c && text[i + 1] !== c)) i += text[i] === "\\" || text[i] === c ? 2 : 1;
      i++;
      out.push({ t: "str" });
    } else if (c === "`") {
      const end = text.indexOf("`", i + 1);
      const v = text.slice(i + 1, end < 0 ? text.length : end);
      if (v.includes("\u0001")) out.push({ t: "dyn" }); // `${table}`: a name the lint cannot read
      else out.push({ t: "word", v, up: `\`${v}` }); // a quoted identifier is never a keyword
      i = end < 0 ? text.length : end + 1;
    } else if (/[A-Za-z_$@]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_$@]/.test(text[j])) j++;
      const v = text.slice(i, j);
      out.push({ t: "word", v, up: v.toUpperCase() });
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[0-9.eE]/.test(text[j])) j++;
      out.push({ t: "num" });
      i = j;
    } else if (c === "?") {
      out.push({ t: "param" });
      i++;
    } else {
      const three = text.slice(i, i + 3);
      const two = text.slice(i, i + 2);
      const v = three === "<=>" ? three : ["||", "&&", ":=", "<>", "!=", ">=", "<="].includes(two) ? two : c;
      out.push({ t: "op", v });
      i += v.length;
    }
  }
  return out;
}

/** the statements of a SQL text (split on `;` outside parentheses), each as a tree of parenthesised groups */
function sqlStatements(text: string): SqlNode[][] {
  const out: SqlNode[][] = [];
  const stack: SqlNode[][] = [[]];
  for (const tok of sqlTokens(text)) {
    if (tok.t === "op" && tok.v === "(") stack.push([]);
    else if (tok.t === "op" && tok.v === ")") {
      if (stack.length > 1) {
        const items = stack.pop()!;
        stack[stack.length - 1].push({ t: "group", items });
      } else stack[0].push({ t: "dyn" }); // an unbalanced `)`: the text breaks out of its context
    } else if (tok.t === "op" && tok.v === ";" && stack.length === 1) {
      if (stack[0].length) out.push(stack[0]);
      stack[0] = [];
    } else stack[stack.length - 1].push(tok);
  }
  while (stack.length > 1) {
    const items = stack.pop()!;
    stack[stack.length - 1].push({ t: "group", items }, { t: "dyn" }); // an unclosed `(`
  }
  if (stack[0].length) out.push(stack[0]);
  return out;
}

const isWord = (n: SqlNode | undefined, ...ups: string[]): n is Extract<SqlTok, { t: "word" }> => !!n && n.t === "word" && (!ups.length || ups.includes(n.up));
const isOp = (n: SqlNode | undefined, ...vs: string[]) => !!n && n.t === "op" && vs.includes(n.v);
type Word = Extract<SqlTok, { t: "word" }>;
const isSubquery = (n: SqlNode | undefined): boolean => !!n && n.t === "group" && isWord(n.items[0], "SELECT", "WITH");
const wordOf = (n: SqlNode): n is Word => n.t === "word";

/** clause keywords that end a table list, a SET list or a WHERE */
const SQL_CLAUSE = new Set(["WHERE", "GROUP", "ORDER", "LIMIT", "HAVING", "UNION", "EXCEPT", "INTERSECT", "JOIN", "INNER", "LEFT", "RIGHT", "CROSS", "STRAIGHT_JOIN", "NATURAL", "FULL", "OUTER", "ON", "USING", "FOR", "LOCK", "WINDOW", "SET", "VALUES", "VALUE", "SELECT", "INTO", "PARTITION", "FROM", "RETURNING", "AS", "USE", "IGNORE", "FORCE", "DUPLICATE", "OFFSET"]);
const WHERE_END = new Set(["GROUP", "ORDER", "LIMIT", "HAVING", "FOR", "LOCK", "WINDOW", "RETURNING", "ON", "UNION", "EXCEPT", "INTERSECT", "OFFSET"]);

interface SqlFound {
  tables: string[];
  problems: string[];
  dynamic: boolean;
  insertTarget?: string;
}

/**
 * L10 (review C0b F5): one statement, judged per query level. A level that names a tenant table (FROM / JOIN with
 * comma lists, UPDATE, INSERT [INTO], REPLACE, DELETE … FROM, TRUNCATE [TABLE], schema-qualified names) needs
 * `store_id = …` as a conjunct of its own WHERE (not in SET, not only inside a subquery, not under OR / NOT, no
 * unknown fragment beside it); an UPDATE or ON DUPLICATE KEY UPDATE may not assign store_id; an INSERT names the
 * store_id column; TRUNCATE is always reported; a table name the lint cannot read is reported.
 */
function analyzeSql(items: SqlNode[], tenant: (name: string) => boolean): SqlFound {
  const found: SqlFound = { tables: [], problems: [], dynamic: false };
  level(items, tenant, found);
  return found;
}

/** the next table reference at `i`: [name | DYN | null (a derived table), the index after it and its alias] */
function tableRef(items: SqlNode[], i: number): { name: string | null; dyn: boolean; next: number } {
  const n = items[i];
  if (!n) return { name: null, dyn: false, next: i };
  if (n.t === "dyn") return { name: null, dyn: true, next: i + 1 };
  if (n.t === "group") return { name: null, dyn: false, next: i + 1 };
  if (!isWord(n) || SQL_CLAUSE.has(n.up)) return { name: null, dyn: false, next: i };
  let name = n.v;
  let j = i + 1;
  while (isOp(items[j], ".") && (isWord(items[j + 1]) || items[j + 1]?.t === "dyn")) {
    const part = items[j + 1]!;
    if (part.t === "dyn") return { name: null, dyn: true, next: j + 2 };
    name = (part as Extract<SqlTok, { t: "word" }>).v;
    j += 2;
  }
  if (isOp(items[j], ".") && items[j + 1]?.t === "dyn") return { name: null, dyn: true, next: j + 2 };
  return { name, dyn: false, next: j };
}

function level(items: SqlNode[], tenant: (name: string) => boolean, found: SqlFound): void {
  // set operations: each SELECT of a UNION is its own level
  const setOp = items.findIndex((n) => isWord(n, "UNION", "EXCEPT", "INTERSECT"));
  if (setOp >= 0) {
    level(items.slice(0, setOp), tenant, found);
    let k = setOp + 1;
    while (isWord(items[k], "ALL", "DISTINCT")) k++;
    level(items.slice(k), tenant, found);
    return;
  }
  // subqueries and derived tables: their own levels; other groups are searched for subqueries
  const descend = (list: SqlNode[]) => {
    for (const n of list) {
      if (n.t !== "group") continue;
      if (isSubquery(n)) level(n.items, tenant, found);
      else descend(n.items);
    }
  };
  descend(items);

  let start = 0;
  if (isWord(items[0], "WITH")) {
    // WITH [RECURSIVE] name [(cols)] AS (…) [, …] <statement>: the CTE bodies were descended into above
    start = items.findIndex((n, i) => i > 0 && isWord(n, "SELECT", "INSERT", "UPDATE", "DELETE", "REPLACE"));
    if (start < 0) return;
  }
  const body = items.slice(start);
  const head = body[0];
  const tables: string[] = [];
  let dyn = false;
  const note = (r: { name: string | null; dyn: boolean }) => {
    if (r.dyn) dyn = true;
    else if (r.name && tenant(r.name)) tables.push(r.name.toLowerCase());
  };
  const problems: string[] = [];
  const kw = isWord(head) ? head.up : "";

  if (kw === "INSERT" || kw === "REPLACE") {
    let i = 1;
    while (isWord(body[i], "LOW_PRIORITY", "DELAYED", "HIGH_PRIORITY", "IGNORE")) i++;
    if (isWord(body[i], "INTO")) i++;
    const target = tableRef(body, i);
    note(target);
    let cols: string[] | null = null;
    let j = target.next;
    if (body[j]?.t === "group" && !isSubquery(body[j])) {
      cols = (body[j] as SqlGroup).items.filter(wordOf).map((w) => w.v.toLowerCase());
      j++;
    }
    const setAt = body.findIndex((n, k) => k >= j && isWord(n, "SET"));
    const selAt = body.findIndex((n, k) => k >= j && isWord(n, "SELECT", "WITH"));
    const dupAt = body.findIndex((n, k) => k >= j && isWord(n, "DUPLICATE"));
    if (setAt >= 0 && (dupAt < 0 || setAt < dupAt)) cols = assignments(body.slice(setAt + 1, dupAt < 0 ? undefined : dupAt - 1)).map((a) => a.col);
    if (target.name && tenant(target.name)) {
      found.insertTarget ??= target.name.toLowerCase();
      if (!cols?.includes("store_id")) problems.push(`INSERT into ${target.name} without a store_id column`);
    }
    if (target.dyn) problems.push("INSERT into a table the lint cannot read");
    if (dupAt >= 0) {
      const odku = assignments(body.slice(dupAt + 3));
      if (target.name && tenant(target.name) && odku.some((a) => a.col === "store_id" || a.dyn)) problems.push("ON DUPLICATE KEY UPDATE assigns store_id (or an unknown list)");
    }
    if (selAt >= 0) level(body.slice(selAt, dupAt < 0 ? undefined : dupAt - 1), tenant, found);
  } else if (kw === "TRUNCATE") {
    const r = tableRef(body, isWord(body[1], "TABLE") ? 2 : 1);
    note(r);
    if (r.name && tenant(r.name)) problems.push(`TRUNCATE empties every store's ${r.name}`);
    if (r.dyn) problems.push("TRUNCATE of a table the lint cannot read");
  } else {
    // SELECT / DELETE / UPDATE / a fragment: the tables of this level
    for (let i = 0; i < body.length; i++) {
      const n = body[i];
      if (!isWord(n)) continue;
      if (n.up === "FROM" || (n.up === "UPDATE" && i === 0) || n.up === "JOIN" || n.up === "STRAIGHT_JOIN" || (n.up === "USING" && kw === "DELETE")) {
        let j = i + 1;
        while (isWord(body[j], "LOW_PRIORITY", "IGNORE", "QUICK", "LATERAL")) j++;
        for (;;) {
          const r = tableRef(body, j);
          if (r.next === j) break;
          note(r);
          j = r.next;
          if (isWord(body[j], "AS")) j++;
          if (isWord(body[j]) && !SQL_CLAUSE.has((body[j] as Extract<SqlTok, { t: "word" }>).up)) j++; // alias
          if (body[j]?.t === "dyn") dyn = true; // a value spliced into the table list (`FROM orders ${x}`)
          if (n.up === "JOIN" || n.up === "STRAIGHT_JOIN" || !isOp(body[j], ",")) break;
          j++;
        }
      }
    }
    if (kw === "UPDATE" && (tables.length || dyn)) {
      const setAt = body.findIndex((n) => isWord(n, "SET"));
      const whereAt = body.findIndex((n) => isWord(n, "WHERE"));
      if (setAt >= 0) {
        const sets = assignments(body.slice(setAt + 1, whereAt < 0 ? undefined : whereAt));
        if (sets.some((a) => a.col === "store_id")) problems.push("UPDATE assigns store_id in SET (rows would move to another store)");
        else if (sets.some((a) => a.dyn)) problems.push("UPDATE with an unknown SET list (it could assign store_id)");
      }
    }
    if (tables.length && !storeWhere(body)) problems.push("store_id = … is not a conjunct of this level's WHERE (not in SET, not only in a subquery, not under OR / NOT, no unknown fragment beside it)");
    if (dyn) problems.push("a table name the lint cannot read (a template value or an unknown fragment)");
  }
  found.tables.push(...tables);
  if (dyn) found.dynamic = true;
  found.problems.push(...problems);
}

/** `col = …` items of a SET / ON DUPLICATE KEY UPDATE list (top level, comma-separated) */
function assignments(items: SqlNode[]): { col: string; dyn: boolean }[] {
  const out: { col: string; dyn: boolean }[] = [];
  let cur: SqlNode[] = [];
  const flush = () => {
    if (!cur.length) return;
    const eqAt = cur.findIndex((n) => isOp(n, "="));
    const lhs = eqAt < 0 ? cur : cur.slice(0, eqAt);
    const last = [...lhs].reverse().find(wordOf);
    out.push({ col: last ? last.v.toLowerCase() : "", dyn: eqAt < 0 || lhs.some((n) => n.t === "dyn") });
    cur = [];
  };
  for (const n of items) {
    if (isOp(n, ",")) flush();
    else cur.push(n);
  }
  flush();
  return out;
}

/** this level's WHERE has `[x.]store_id = …` as a top-level conjunct */
function storeWhere(items: SqlNode[]): boolean {
  const at = items.findIndex((n) => isWord(n, "WHERE"));
  if (at < 0) return false;
  let end = items.findIndex((n, i) => i > at && isWord(n) && WHERE_END.has(n.up));
  if (end < 0) end = items.length;
  return storeConjunct(items.slice(at + 1, end));
}

function storeConjunct(items: SqlNode[]): boolean {
  if (items.some((n) => isWord(n, "OR", "XOR") || isOp(n, "||", ":=") || n.t === "dyn")) return false;
  let cur: SqlNode[] = [];
  const conjuncts: SqlNode[][] = [];
  let between = false; // BETWEEN a AND b: that AND is not a conjunction
  for (const n of items) {
    if (isWord(n, "BETWEEN")) between = true;
    if ((isWord(n, "AND") || isOp(n, "&&")) && !(between && isWord(n, "AND"))) {
      conjuncts.push(cur);
      cur = [];
    } else {
      if (isWord(n, "AND")) between = false;
      cur.push(n);
    }
  }
  conjuncts.push(cur);
  return conjuncts.some((c) => {
    const g = c[0];
    if (c.length === 1 && g.t === "group" && !isSubquery(g)) return storeConjunct(g.items);
    let i = 0;
    if (isWord(c[0]) && isOp(c[1], ".")) i = 2;
    return isWord(c[i]) && (c[i] as Extract<SqlTok, { t: "word" }>).v.toLowerCase() === "store_id" && isOp(c[i + 1], "=") && c.length > i + 2;
  });
}

/** a SQL text with no top-level OR / XOR / || / :=, no comment, no unknown fragment, and balanced parentheses */
function closedSqlText(text: string): boolean {
  if (/--|#|\/\*/.test(stripSqlStrings(text))) return false;
  const stmts = sqlStatements(text);
  if (stmts.length !== 1) return stmts.length === 0;
  return !stmts[0].some((n) => isWord(n, "OR", "XOR") || isOp(n, "||", ":=", ";") || n.t === "dyn");
}

function stripSqlStrings(text: string): string {
  return text.replace(/'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"/g, "''");
}

/**
 * L2 (review C0b F2): the text after `${storeSql(scope)}` keeps it a conjunct: `AND <conjunct>` with no top-level
 * OR / XOR / || / := and no fragment (`fragment`: a nested SQL span sits in it), or `AND ( … )` around all the rest.
 */
function safeAndTail(tail: string, fragment: boolean): boolean {
  if (/--|#|\/\*/.test(stripSqlStrings(tail))) return false;
  const stmts = sqlStatements(tail);
  if (stmts.length !== 1) return false;
  const items = stmts[0];
  if (!(isWord(items[0], "AND") || isOp(items[0], "&&")) || items.length < 2) return false;
  const rest = items.slice(1);
  if (rest.length === 1 && rest[0].t === "group") return true; // AND ( … ): an unbalanced ")" in a literal would have closed the group early
  if (fragment) return false;
  return !rest.some((n) => isWord(n, "OR", "XOR") || isOp(n, "||", ":=") || n.t === "dyn");
}

/* ------------------------------------------------------------------ */
/* the analyzer                                                        */
/* ------------------------------------------------------------------ */

interface TenantOp {
  node: ts.Node;
  pos: number;
  table: string;
  method: string; // drizzle method, or "raw" / "raw-insert"
}

interface Annotation {
  file: string;
  line: number;
  kind: "platform" | "public-key";
}

/** a query (a builder chain, or one raw SQL text) a `tenancy: platform` annotation exempts: what PIN counts */
interface ExemptUnit {
  file: string;
  pos: number;
  annotationLine: number;
}

class Lint {
  readonly violations: Violation[] = [];
  readonly annotations: Annotation[] = [];
  private readonly checker: ts.TypeChecker;
  private readonly tenantDecls = new Map<ts.Node, string>();
  private readonly storeScope: ts.Type;
  private readonly writeScope: ts.Type;
  private readonly bucket: ts.Type | null;
  private readonly ops = new Map<ts.SourceFile, TenantOp[]>();
  private readonly annotationLines = new Map<ts.SourceFile, Map<number, Annotation["kind"]>>();
  /** the exempted queries, keyed by their node (PIN counts these, not comment lines: review C0b F7) */
  private readonly exemptUnits = new Map<ts.Node, ExemptUnit>();
  /** the query tops (outermost chain calls) an annotation exempted: an eq() inside one is exempt too */
  private readonly exemptTops = new Set<ts.Node>();
  /** every identifier of src/** by its text (L4's reference search, built once) */
  private idIndex: Map<string, ts.Identifier[]> | null = null;
  /** import / export specifiers that rename (`{ a as b }`): a → [b] (L4's alias closure) */
  private renameIndex: Map<string, string[]> | null = null;
  /** local names of default imports (L4, for a default-exported const) */
  private defaultImportNames: Set<string> | null = null;
  private readonly scopeParamMemo = new Map<FnLike, ts.ParameterDeclaration[]>();
  private readonly l6Reported = new Set<FnLike>();
  private readonly l6ArgReported = new Set<ts.Node>();
  private readonly l4GlobalSeen = new Set<string>();
  private rateAliases = new Set<string>();
  /** the local names SCOPE_FNS are imported under (`import { platformScope as ps }`), per file */
  private scopeAliases = new Set<string>();
  private readonly l9Checked = new Set<FnLike>();
  private readonly reachMemo = new Map<string, Map<FnLike, boolean>>();
  private readonly targetsMemo = new Map<FnLike, FnLike[]>();
  private readonly resolutionCache: ts.ModuleResolutionCache;
  private readonly usedAllow = new Set<AllowEntry>();
  private file!: ts.SourceFile;
  private relFile = "";

  constructor(
    private readonly program: ts.Program,
    private readonly host: ts.CompilerHost,
    private readonly cfg: Config,
    private readonly tenantByExport: Map<string, string>,
  ) {
    this.checker = program.getTypeChecker();
    const schema = this.source(F.schema);
    for (const s of schema.statements) {
      if (!ts.isVariableStatement(s)) continue;
      for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && tenantByExport.has(d.name.text)) this.tenantDecls.set(d, tenantByExport.get(d.name.text)!);
    }
    if (this.tenantDecls.size !== tenantByExport.size) throw new Error(`tenancy-lint: ${tenantByExport.size - this.tenantDecls.size} tenant tables not found in ${F.schema}`);
    this.storeScope = this.exportedType(F.types, "StoreScope")!;
    this.writeScope = this.exportedType(F.types, "WriteScope")!;
    if (!this.storeScope || !this.writeScope) throw new Error(`tenancy-lint: StoreScope / WriteScope not found in ${F.types}`);
    this.bucket = this.exportedType(F.rateLimit, "Bucket");
    this.resolutionCache = ts.createModuleResolutionCache(ROOT, (s) => fold(s), program.getCompilerOptions());
  }

  private source(relPath: string): ts.SourceFile {
    const sf = this.program.getSourceFile(`${ROOT}/${relPath}`);
    if (!sf) throw new Error(`tenancy-lint: ${relPath} is not in the program`);
    return sf;
  }

  private exportedType(relPath: string, name: string): ts.Type | null {
    const ms = this.checker.getSymbolAtLocation(this.source(relPath));
    let sym = ms && this.checker.getExportsOfModule(ms).find((s) => s.name === name);
    if (!sym) return null;
    if (sym.flags & ts.SymbolFlags.Alias) sym = this.checker.getAliasedSymbol(sym);
    return this.checker.getDeclaredTypeOfSymbol(sym);
  }

  /* ---------------- reporting ---------------- */

  private report(node: ts.Node, rule: RuleId, kind: string, message: string, sf = this.file): void {
    this.violations.push({ file: rel(sf.fileName), line: lineOf(sf, node.getStart(sf)), rule, kind, message });
  }

  /* ---------------- symbols and types ---------------- */

  private symbolOf(e: ts.Node | undefined): ts.Symbol | undefined {
    if (!e) return undefined;
    const target = ts.isPropertyAccessExpression(e) ? e.name : e;
    let sym = this.checker.getSymbolAtLocation(target);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = this.checker.getAliasedSymbol(sym);
    return sym;
  }

  /** the declared name and file of what a call invokes */
  private calleeRef(call: ts.CallExpression): FnRef | null {
    const sym = this.symbolOf(unwrap(call.expression));
    const decl = sym?.declarations?.[0];
    return sym && decl ? { name: sym.name, file: rel(decl.getSourceFile().fileName) } : null;
  }

  private isRef(call: ts.CallExpression, refs: readonly FnRef[]): boolean {
    const r = this.calleeRef(call);
    return !!r && refs.some((x) => x.file === r.file && x.name === r.name);
  }

  private isCall(e: ts.Node | undefined | null, file: string, ...names: string[]): boolean {
    if (!e || !ts.isCallExpression(e)) return false;
    const r = this.calleeRef(e);
    return !!r && r.file === file && names.includes(r.name);
  }

  private isDrizzleCall(e: ts.Node | undefined | null, name: string): boolean {
    if (!e || !ts.isCallExpression(e)) return false;
    const r = this.calleeRef(e);
    return !!r && r.name === name && r.file.includes("drizzle-orm");
  }

  private isUsable(t: ts.Type): boolean {
    return !(t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never));
  }
  private isScopeType(t: ts.Type): boolean {
    return this.isUsable(t) && this.checker.isTypeAssignableTo(t, this.storeScope);
  }
  private isWriteType(t: ts.Type): boolean {
    return this.isUsable(t) && this.checker.isTypeAssignableTo(t, this.writeScope);
  }
  /** a WriteScope, or an object (a ctx) whose `scope` is one */
  private carriesWrite(t: ts.Type, at: ts.Node): boolean {
    if (!this.isUsable(t)) return false;
    if (this.isWriteType(t)) return true;
    const prop = t.getProperty("scope");
    return !!prop && this.isWriteType(this.checker.getTypeOfSymbolAtLocation(prop, at));
  }
  /** a StoreScope, or an object (a StoreCtx / WriteCtx / PublicTarget) whose `scope` is one */
  private carriesScope(t: ts.Type, at: ts.Node): boolean {
    if (!this.isUsable(t)) return false;
    if (this.isScopeType(t)) return true;
    const prop = t.getProperty("scope");
    return !!prop && this.isScopeType(this.checker.getTypeOfSymbolAtLocation(prop, at));
  }
  private typeAt(e: ts.Node): ts.Type {
    return this.checker.getTypeAtLocation(e);
  }

  /** the literal of a `brand` / `name` property of drizzle's `_` config (`'Table'`, `"pages"`), or "" when not a literal */
  private underProp(t: ts.Type, prop: string, at: ts.Node): string | null {
    const u = t.getProperty("_");
    if (!u) return null;
    const p = this.checker.getTypeOfSymbolAtLocation(u, at).getProperty(prop);
    if (!p) return null;
    const pt = this.checker.getTypeOfSymbolAtLocation(p, at);
    return pt.isStringLiteral() ? pt.value : "";
  }

  /**
   * What a value inside a drizzle `sql` template becomes: a table or a column (an identifier), a nested SQL fragment
   * (drizzle inlines it without parentheses, sql.js buildQueryFromSourceParams), a bound value, or unknown (any).
   */
  private sqlKind(e: ts.Expression): "table" | "column" | "sql" | "value" | "unknown" {
    const t = this.typeAt(e);
    if (!this.isUsable(t)) return "unknown";
    let kind: "table" | "column" | "sql" | "value" = "value";
    for (const m of t.isUnion() ? t.types : [t]) {
      const a = this.checker.getApparentType(m);
      if (!a.getProperty("getSQL")) continue;
      if (this.underProp(a, "brand", e) === "Table") kind = kind === "value" ? "table" : kind;
      else if (a.getProperty("columnType") && a.getProperty("table")) kind = kind === "value" ? "column" : kind;
      else return "sql";
    }
    return kind;
  }

  /** the SQL name of the tenant table an expression denotes (the table object, an alias() of it, or a const copy) */
  private tenantTableOf(e: ts.Expression | undefined, depth = 0): string | null {
    if (!e) return null;
    const x = unwrap(e);
    if (!ts.isIdentifier(x) && !ts.isPropertyAccessExpression(x)) return null;
    const decl = this.symbolOf(x)?.valueDeclaration;
    if (!decl) return null;
    const hit = this.tenantDecls.get(decl);
    if (hit) return hit;
    if (depth < 3 && ts.isVariableDeclaration(decl) && decl.initializer && ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) {
      const init = unwrap(decl.initializer);
      if (ts.isCallExpression(init) && this.isDrizzleCall(init, "alias")) return this.tenantTableOf(init.arguments[0], depth + 1);
      if (ts.isIdentifier(init) || ts.isPropertyAccessExpression(init)) return this.tenantTableOf(init, depth + 1);
    }
    return null;
  }

  /**
   * The table a drizzle builder argument denotes, read from its type (review C0b F6): `_.name` of each member of the
   * type (a helper's return, a `let`, a ternary, `TABLES[k]`, a destructured schema member, a `typeof pages`
   * parameter). `dynamic` when it is a table whose name is not a literal (a generic, `MySqlTable`, any) or SQL used as
   * a source; null when the argument is not a table (a subquery, a view, a CTE).
   */
  private tableOfType(e: ts.Expression): { tenant: string[]; dynamic: boolean } | null {
    const t = this.typeAt(e);
    if (t.flags & ts.TypeFlags.Any) return { tenant: [], dynamic: true };
    if (!this.isUsable(t)) return null;
    const out = { tenant: [] as string[], dynamic: false };
    let table = false;
    for (const m of t.isUnion() ? t.types : [t]) {
      const a = this.checker.getApparentType(m);
      const brand = this.underProp(a, "brand", e);
      if (brand === "Table") {
        table = true;
        const name = this.underProp(a, "name", e);
        if (!name) out.dynamic = true;
        else if (this.isTenantSqlName(name)) out.tenant.push(name);
      } else if (brand === "SQL" || (a.getProperty("queryChunks") && a.getProperty("getSQL"))) {
        table = true;
        out.dynamic = true; // sql`orders` as a source
      }
    }
    return table ? out : null;
  }

  /** the initializer of a `const` the identifier names, in the same file */
  private constInit(id: ts.Identifier): ts.Expression | null {
    const d = this.symbolOf(id)?.valueDeclaration;
    if (!d || !ts.isVariableDeclaration(d) || !d.initializer || !(ts.getCombinedNodeFlags(d) & ts.NodeFlags.Const)) return null;
    return d.getSourceFile() === id.getSourceFile() ? d.initializer : null;
  }

  /**
   * Parameters of `fn` typed StoreScope (or a narrower scope type), or a ctx whose `scope` is one (StoreCtx, WriteCtx,
   * `{ scope }`: D71 rev 4 names ctx-taking repositories, review C0b F15); `any` never counts.
   */
  private scopeParams(fn: FnLike): ts.ParameterDeclaration[] {
    let hit = this.scopeParamMemo.get(fn);
    if (!hit) {
      hit = fn.parameters.filter((p) => this.carriesScope(this.checker.getTypeAtLocation(p.name), p));
      this.scopeParamMemo.set(fn, hit);
    }
    return hit;
  }

  private isOwnScopeParam(d: ts.ParameterDeclaration, at: ts.Node): boolean {
    return isFnLike(d.parent) && isAncestor(d.parent, at) && this.scopeParams(d.parent).includes(d);
  }

  /** an identifier bound to a scope parameter (a scope or a ctx) of a function enclosing `at` */
  private isParamRef(e: ts.Expression, at: ts.Node): boolean {
    const x = unwrap(e);
    if (!ts.isIdentifier(x)) return false;
    const d = this.checker.getSymbolAtLocation(x)?.valueDeclaration;
    return !!d && ts.isParameter(d) && this.isOwnScopeParam(d, at);
  }

  /**
   * A StoreScope that comes straight from a scope parameter of a function enclosing `at`: the parameter itself,
   * `<ctx parameter>.scope`, or `scope` destructured from such a parameter (`({ scope }: StoreCtx)`,
   * `const { scope } = ctx`). A local copy or any other expression does not count.
   */
  private isScopeParamRef(e: ts.Expression | undefined, at: ts.Node): boolean {
    if (!e) return false;
    const x = unwrap(e);
    if (!this.isScopeType(this.typeAt(x))) return false;
    if (ts.isPropertyAccessExpression(x)) return x.name.text === "scope" && this.isParamRef(x.expression, at);
    if (!ts.isIdentifier(x)) return false;
    const d = this.checker.getSymbolAtLocation(x)?.valueDeclaration;
    if (!d) return false;
    if (ts.isParameter(d)) return this.isOwnScopeParam(d, at);
    if (ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent) && !d.dotDotDotToken) {
      const key = d.propertyName ?? d.name;
      if (!ts.isIdentifier(key) || key.text !== "scope") return false;
      const holder = d.parent.parent;
      if (ts.isParameter(holder)) return this.isOwnScopeParam(holder, at);
      if (ts.isVariableDeclaration(holder) && holder.initializer && ts.getCombinedNodeFlags(holder) & ts.NodeFlags.Const) return this.isParamRef(holder.initializer, at);
    }
    return false;
  }

  /* ---------------- annotations ---------------- */

  private collectAnnotations(sf: ts.SourceFile): void {
    const lines = new Map<number, Annotation["kind"]>();
    const seen = new Set<number>();
    const text = sf.text;
    // leading comments (own line) and trailing ones (`.from(T) // tenancy: platform …` on the statement's line): TS
    // reports a same-line comment only as trailing, so both are read (maintainer, C0b merge)
    const take = (pos: number) => {
      for (const c of [...(ts.getLeadingCommentRanges(text, pos) ?? []), ...(ts.getTrailingCommentRanges(text, pos) ?? [])]) {
        if (c.kind !== ts.SyntaxKind.SingleLineCommentTrivia || seen.has(c.pos)) continue;
        seen.add(c.pos);
        const m = /^\/\/\s*tenancy:\s*(platform|public-key)\s+\S/.exec(text.slice(c.pos, c.end));
        if (!m) continue;
        const line = lineOf(sf, c.pos);
        lines.set(line, m[1] as Annotation["kind"]);
        this.annotations.push({ file: rel(sf.fileName), line, kind: m[1] as Annotation["kind"] });
      }
    };
    const walk = (n: ts.Node) => {
      take(n.pos);
      take(n.end);
      ts.forEachChild(n, walk);
    };
    walk(sf);
    this.annotationLines.set(sf, lines);
  }

  /** an own-line `// tenancy:` comment among the leading comments of `n`, of one of `kinds` */
  private leadingAnnotation(n: ts.Node, kinds: readonly Annotation["kind"][]): { line: number; kind: Annotation["kind"] } | null {
    const sf = this.file;
    const text = sf.text;
    for (const c of ts.getLeadingCommentRanges(text, n.pos) ?? []) {
      if (c.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
      const lineStart = text.lastIndexOf("\n", c.pos - 1) + 1;
      if (text.slice(lineStart, c.pos).trim() !== "") continue; // trailing comment of the previous line
      const m = /^\/\/\s*tenancy:\s*(platform|public-key)\s+\S/.exec(text.slice(c.pos, c.end));
      if (m && kinds.includes(m[1] as Annotation["kind"])) return { line: lineOf(sf, c.pos), kind: m[1] as Annotation["kind"] };
    }
    return null;
  }

  /**
   * The annotation that exempts the query `node` belongs to (§E.3 rule 6, review C0b F7), in an allowlisted file only:
   * an own-line comment that leads the query's carrier (the innermost statement, or the expression-bodied function
   * and its declaration: `annotationCarriers`), an own-line comment that leads the query expression itself (an array
   * element, an argument), or a comment on one of the query's own lines (`.from(T) // tenancy: platform …`). A comment
   * elsewhere in an enclosing statement exempts nothing. `top` is the whole query (the outermost call of its builder
   * chain, or the raw SQL text); each exempted query is one PIN unit.
   */
  private exempt(node: ts.Node, top: ts.Node = node): boolean {
    const kinds: Annotation["kind"][] = [];
    if (under(this.relFile, PLATFORM_DIRS)) kinds.push("platform");
    if (under(this.relFile, PUBLIC_KEY_FILES)) kinds.push("public-key");
    if (!kinds.length) return false;
    const lines = this.annotationLines.get(this.file);
    if (!lines?.size) return false;
    const sf = this.file;
    let hit: { line: number; kind: Annotation["kind"] } | null = null;
    for (const c of [...annotationCarriers(top), top]) if ((hit = this.leadingAnnotation(c, kinds))) break;
    if (!hit) {
      const from = lineOf(sf, top.getStart(sf));
      const to = lineOf(sf, top.getEnd());
      for (let l = from; l <= to && !hit; l++) {
        const kind = lines.get(l);
        if (kind && kinds.includes(kind)) hit = { line: l, kind };
      }
    }
    if (!hit) return false;
    this.exemptTops.add(top);
    if (hit.kind === "platform" && !this.exemptUnits.has(top)) this.exemptUnits.set(top, { file: this.relFile, pos: top.getStart(sf), annotationLine: hit.line });
    return true;
  }

  /** an eq() / predicate inside a query an annotation already exempted */
  private insideExemptQuery(n: ts.Node): boolean {
    for (let p = n.parent; p; p = p.parent) {
      if (this.exemptTops.has(p)) return true;
      if (isFnLike(p)) return false;
    }
    return false;
  }

  /* ---------------- the per-file walk ---------------- */

  run(files: readonly ts.SourceFile[]): void {
    for (const sf of files) this.collectAnnotations(sf);
    for (const sf of files) {
      this.file = sf;
      this.relFile = rel(sf.fileName);
      this.ops.set(sf, []);
      // L5: the local names rateLimit / rateLimitReached are imported under (`import { rateLimit as rl }`)
      this.rateAliases = new Set();
      this.scopeAliases = new Set();
      for (const s of sf.statements)
        if (ts.isImportDeclaration(s) && s.importClause?.namedBindings && ts.isNamedImports(s.importClause.namedBindings))
          for (const el of s.importClause.namedBindings.elements) {
            if (el.propertyName && ["rateLimit", "rateLimitReached"].includes(el.propertyName.text)) this.rateAliases.add(el.name.text);
            if (el.propertyName && Object.hasOwn(SCOPE_FNS, el.propertyName.text)) this.scopeAliases.add(el.name.text);
          }
      const visit = (n: ts.Node) => {
        this.visit(n);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    for (const sf of files) {
      this.file = sf;
      this.relFile = rel(sf.fileName);
      this.fileRules(sf);
    }
    this.checkPins();
  }

  unusedAllowEntries(): AllowEntry[] {
    return [...this.cfg.allow, ...this.cfg.actions].filter((e) => !this.usedAllow.has(e));
  }

  private visit(n: ts.Node): void {
    const f = this.relFile;
    if (ts.isCallExpression(n)) this.onCall(n);
    else if (ts.isTaggedTemplateExpression(n)) this.onTaggedTemplate(n);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) this.onLiteral(n);
    else if (ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) this.onCast(n);
    else if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier))
      this.onImport(n.moduleSpecifier.text, n, ts.isImportDeclaration(n) ? typeOnlyImport(n) : n.isTypeOnly);
    else if (ts.isModuleDeclaration(n) && n.flags & ts.NodeFlags.GlobalAugmentation && f.startsWith("src/lib/") && !SELFTEST.test(f)) this.onDeclareGlobal(n);
    else if (ts.isNewExpression(n) && f.startsWith("src/lib/")) this.onNew(n);
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) this.onConcat(n);
    else if (ts.isObjectLiteralExpression(n)) this.onObjectLiteral(n);
    else if (ts.isIdentifier(n) && (n.text === "rateLimit" || n.text === "rateLimitReached" || this.rateAliases.has(n.text))) this.onRateRef(n);
    else if (ts.isIdentifier(n) && (Object.hasOwn(SCOPE_FNS, n.text) || this.scopeAliases.has(n.text))) this.onScopeRef(n);
    if (isFnLike(n)) this.onFunction(n);
  }

  /* ---------------- calls: L1-L3b, L5, L6, L7, L10, L13 ---------------- */

  private onCall(call: ts.CallExpression): void {
    const callee = call.expression;
    if (callee.kind === ts.SyntaxKind.ImportKeyword) {
      const a = call.arguments[0];
      if (a && ts.isStringLiteralLike(a)) this.onImport(a.text, call);
      return;
    }
    if (ts.isIdentifier(callee) && callee.text === "require" && call.arguments[0] && ts.isStringLiteralLike(call.arguments[0])) {
      this.onImport(call.arguments[0].text, call);
      return;
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const m = callee.name.text;
      if (DRIZZLE_TABLE_CALLS.has(m) && call.arguments[0]) {
        const table = this.tenantTableOf(call.arguments[0]);
        if (table) this.onTenantCall(call, m, table);
        else if (this.calleeRef(call)?.file.includes("drizzle-orm")) {
          // review C0b F6: a table reached through a helper, a `let`, a ternary, TABLES[k], a destructured schema or a
          // typed parameter is named by its type; a table the type does not name is reported, never skipped
          const t = this.tableOfType(call.arguments[0]);
          if (t?.tenant.length) this.onTenantCall(call, m, t.tenant[0]);
          else if (t?.dynamic && !this.exempt(call, queryTop(call)))
            this.report(call.arguments[0], "L1", "dynamic-table", `.${m}() on a table the lint cannot name (a generic or untyped table, a MySqlTable parameter, or SQL as a source): pass the table itself`);
        }
      }
      if (m === "findFirst" || m === "findMany") this.onRelational(call, callee);
    }

    const ref = this.calleeRef(call);
    if (!ref || (!ref.file.includes("drizzle-orm") && ref.file !== F.sql)) this.onTableArgs(call);
    this.onScopeCopy(call);
    if (!ref) return;
    const f = this.relFile;
    if (ref.name === "eq" && ref.file.includes("drizzle-orm")) this.onEq(call);
    else if (ref.file === F.settings && LEGACY_SETTINGS.has(ref.name))
      this.report(call, "L3", "legacy-settings", `${ref.name}() is the removed single-tenant settings API; use getStoreSetting / getPlatformSetting (§D.10)`);
    else if (ref.file === F.rateLimit && (ref.name === "rateLimit" || ref.name === "rateLimitReached")) {
      const arg = call.arguments[0];
      if (!this.bucket) this.report(call, "L5", "string-bucket", `${ref.name}() takes a string bucket; build it with platformBucket() / storeBucket() (§E.8)`);
      else if (!arg || !this.isUsable(this.checker.getTypeAtLocation(arg)) || !this.checker.isTypeAssignableTo(this.checker.getTypeAtLocation(arg), this.bucket))
        this.report(call, "L5", "string-bucket", `${ref.name}() bucket is not a Bucket; build it with platformBucket() / storeBucket() (§E.8)`);
    } else if (ref.file === F.platformSeam && ref.name === "platformScope" && !f.startsWith("src/app/admin/") && !f.startsWith("src/lib/platform/"))
      this.report(call, "L6", "platform-scope", "platformScope() outside src/app/admin/** and src/lib/platform/**");
    else if (ref.file === F.platformSeam && ref.name === "platformRevealScope") {
      if (!isRevealSite(f)) this.report(call, "L6", "reveal-scope", `platformRevealScope() outside ${REVEAL_SITE}: the staff write scope is recordPlatformReveal's only (D71, PLA-§7.4)`);
      else this.onRevealResult(call);
    }
    else if (ref.file === F.seam && ref.name === "mintScope" && !MINT_SITES.includes(f))
      this.report(call, "L6", "mint-scope", "mintScope() outside the four seam files: build scopes through requireStoreMember / platformScope / publicScope / systemScope");
    else if (ref.file === F.seam && ref.name === "requireStoreMember" && /(^|\/)route\.tsx?$/.test(f)) {
      const a = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
      const hasHandle = !a || !ts.isObjectLiteralExpression(a) ? !!a : a.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "handle");
      if (!hasHandle) this.report(call, "L13", "require-handle", "a route handler calls requireStoreMember() without a handle (§C.3 step 2)");
    }
  }

  /**
   * L1 (review C0b F6): a tenant table handed to a function of the app that takes no StoreScope (a generic
   * `selectAll(orders)` repository helper) leaves the lint's sight; drizzle's own functions and the four helpers are
   * judged where they are called.
   */
  private onTableArgs(call: ts.CallExpression): void {
    let sig: ts.Signature | undefined;
    for (const a of call.arguments) {
      if (ts.isSpreadElement(a)) continue;
      const table = this.tenantTableOf(a);
      if (!table) continue;
      sig ??= this.checker.getResolvedSignature(call);
      const scoped = !!sig?.getParameters().some((p) => this.carriesScope(this.checker.getTypeOfSymbolAtLocation(p, call), call));
      if (scoped || this.exempt(call)) continue;
      this.report(a, "L1", "table-arg", `the tenant table ${table} passed to ${call.expression.getText(this.file).slice(0, 40)}(), which takes no StoreScope: query it where the scope is`);
    }
  }

  /** L6 (review C0b F1): Object.assign / structuredClone of a scope or a ctx build a scope the seam did not mint */
  private onScopeCopy(call: ts.CallExpression): void {
    if (MINT_SITES.includes(this.relFile) || SELFTEST.test(this.relFile)) return;
    const c = unwrap(call.expression);
    const copy =
      (ts.isIdentifier(c) && c.text === "structuredClone") ||
      (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === "Object" && (c.name.text === "assign" || c.name.text === "create"));
    if (!copy) return;
    if (call.arguments.some((a) => !ts.isSpreadElement(a) && this.carriesScope(this.checker.getNonNullableType(this.typeAt(a)), a)))
      this.report(call, "L6", "scope-copy", `${c.getText(this.file)}() copies a StoreScope (or a ctx carrying one): scopes come only from the seam (§E.1)`);
  }

  /**
   * L6 (review C0b F1): a StoreScope's brand is a symbol-keyed property that an object spread copies, so
   * `{ ...scope, storeId: id }` or `{ ...scope, kind: "member" }` forges another store's scope, or a write scope, with
   * no cast. Outside the seam files an object literal that is itself a StoreScope, or that spreads a scope or a ctx, is
   * reported. A literal without a spread cannot carry the brand (TS2741), so only literals with one are typed.
   */
  private onObjectLiteral(n: ts.ObjectLiteralExpression): void {
    if (MINT_SITES.includes(this.relFile) || SELFTEST.test(this.relFile)) return; // selftests fake ctxs on purpose
    const spreads = n.properties.filter(ts.isSpreadAssignment);
    if (!spreads.length) return;
    if (this.isScopeType(this.typeAt(n))) {
      this.report(n, "L6", "forged-scope", "an object literal that is a StoreScope (a spread copies the brand): scopes come only from the seam (§E.1, D71)");
      return;
    }
    const carries = (t: ts.Type, at: ts.Node) => (t.isUnion() ? t.types : [t]).some((m) => this.carriesScope(m, at));
    if (spreads.some((s) => carries(this.typeAt(s.expression), s)))
      this.report(n, "L6", "scope-spread", "an object literal spreads a StoreScope or a ctx carrying one: pass the scope or the ctx itself (§E.1, D71)");
  }

  /** L5 (review C0b F10): rateLimit / rateLimitReached only as the callee of a direct call, so its bucket is judged */
  /**
   * L6 `scope-ref` (P0b review F-3): a scope builder of SCOPE_FNS used as a value (an alias, a callback, a shorthand
   * property, `const f = seam.platformScope`). The call rules match the callee's declared symbol, and a local alias
   * resolves to the local variable, so every use must be the call itself. Imports, re-exports and `typeof` are not uses.
   */
  private onScopeRef(id: ts.Identifier): void {
    const p = id.parent;
    if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isTypeQueryNode(p) || ts.isQualifiedName(p)) return;
    if ((ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p)) && p.name === id) return;
    let sym = ts.isShorthandPropertyAssignment(p) && p.name === id ? this.checker.getShorthandAssignmentValueSymbol(p) : this.checker.getSymbolAtLocation(id);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = this.checker.getAliasedSymbol(sym);
    const decl = sym?.declarations?.[0];
    if (!sym || !decl || !Object.hasOwn(SCOPE_FNS, sym.name) || rel(decl.getSourceFile().fileName) !== SCOPE_FNS[sym.name]) return;
    let e: ts.Node = ts.isPropertyAccessExpression(p) && p.name === id ? p : id;
    while (ts.isParenthesizedExpression(e.parent) || ts.isNonNullExpression(e.parent)) e = e.parent;
    if (ts.isCallExpression(e.parent) && e.parent.expression === e) return;
    this.report(id, "L6", "scope-ref", `${sym.name} used as a value (an alias, a callback, a property): call it directly, so L6 judges every call (D71)`);
  }

  /**
   * L6 `reveal-escape` (P0b review F-3): in the reveal site the staff WriteScope goes straight into a call of an app
   * function (declared under src/), or into a `const` that is only ever read that way; returned, assigned, stored in
   * an object or array, spread, or handed to a library method (Array#push, Map#set), it could leave the file.
   */
  private onRevealResult(call: ts.CallExpression): void {
    const intoAppCall = (n: ts.Node): boolean => {
      let e: ts.Node = n;
      while (ts.isParenthesizedExpression(e.parent) || ts.isNonNullExpression(e.parent) || ts.isAwaitExpression(e.parent)) e = e.parent;
      const c = e.parent;
      if (!ts.isCallExpression(c) || !c.arguments.some((a) => a === e)) return false;
      return this.calleeRef(c)?.file.startsWith("src/") ?? false;
    };
    if (intoAppCall(call)) return;
    let e: ts.Node = call;
    while (ts.isParenthesizedExpression(e.parent) || ts.isNonNullExpression(e.parent)) e = e.parent;
    const d = e.parent;
    if (ts.isVariableDeclaration(d) && d.initializer === e && ts.isIdentifier(d.name) && ts.getCombinedNodeFlags(d) & ts.NodeFlags.Const) {
      const name = d.name;
      const sym = this.checker.getSymbolAtLocation(name);
      const body = enclosingFns(d)[0] ?? this.file;
      const bad: ts.Node[] = [];
      const walk = (n: ts.Node) => {
        if (ts.isIdentifier(n) && n !== name) {
          const p = n.parent;
          const s = ts.isShorthandPropertyAssignment(p) && p.name === n ? this.checker.getShorthandAssignmentValueSymbol(p) : this.checker.getSymbolAtLocation(n);
          if (s === sym && !(ts.isPropertyAccessExpression(p) && p.name === n) && !intoAppCall(n)) bad.push(n);
        }
        ts.forEachChild(n, walk);
      };
      walk(body);
      for (const n of bad) this.report(n, "L6", "reveal-escape", `the reveal scope ${name.text} is used other than as an argument of an app call: it must never leave ${REVEAL_SITE} (D71)`);
      return;
    }
    this.report(call, "L6", "reveal-escape", "platformRevealScope()'s result must go straight into an app call or a const used only that way, never returned or stored (D71)");
  }

  /** L6 `reveal-escape` (P0b review F-3): no export of the reveal site returns, resolves to or is a WriteScope (or a ctx carrying one). */
  private revealExports(sf: ts.SourceFile): void {
    for (const ex of moduleExports(sf, this.checker)) {
      const types: ts.Type[] = [];
      if (ex.fn) {
        const sig = this.checker.getSignatureFromDeclaration(ex.fn);
        const ret = sig ? this.checker.getReturnTypeOfSignature(sig) : undefined;
        if (ret) types.push(this.checker.getAwaitedType(ret) ?? ret);
      } else types.push(this.checker.getTypeAtLocation(ex.at));
      const members = types.flatMap((t) => (t.isUnion() ? t.types : [t]));
      if (members.some((t) => this.carriesWrite(t, ex.at)))
        this.report(ex.at, "L6", "reveal-escape", `${ex.name}: an export of ${REVEAL_SITE} hands out a WriteScope; the reveal scope never leaves the file (D71)`);
    }
  }

  private onRateRef(id: ts.Identifier): void {
    if (this.relFile === F.rateLimit) return;
    const p = id.parent;
    if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isTypeQueryNode(p)) return;
    let sym = this.checker.getSymbolAtLocation(id);
    if (sym && sym.flags & ts.SymbolFlags.Alias) sym = this.checker.getAliasedSymbol(sym);
    const decl = sym?.declarations?.[0];
    if (!sym || !decl || rel(decl.getSourceFile().fileName) !== F.rateLimit || (sym.name !== "rateLimit" && sym.name !== "rateLimitReached")) return;
    let e: ts.Node = ts.isPropertyAccessExpression(p) && p.name === id ? p : id;
    while (ts.isParenthesizedExpression(e.parent) || ts.isNonNullExpression(e.parent)) e = e.parent;
    if (ts.isCallExpression(e.parent) && e.parent.expression === e) return;
    this.report(id, "L5", "rate-limit-ref", `${sym.name} used as a value (an alias or a callback): call it directly, so its bucket is checked (§E.8)`);
  }

  private onTenantCall(call: ts.CallExpression, method: string, table: string): void {
    this.ops.get(this.file)!.push({ node: call, pos: call.getStart(this.file), table, method });
    const top = queryTop(call);
    if (this.exempt(call, top)) return;
    const scopeFn = enclosingFns(call).find((fn) => this.scopeParams(fn).length > 0);
    const at = call.arguments[0];
    if (!scopeFn) this.report(at, "L1", "query", `.${method}(${table}) in a function without a StoreScope parameter`);
    const chain = chainAfter(call);
    /** the scope arguments the store predicate and storeValues use: L6 judges these, not the function (review C0b F8) */
    const used: ts.Expression[] = [];

    if (method === "from" || method === "update" || method === "delete") {
      // review C0b F3: drizzle keeps only the last .where() (select.js, update.js overwrite config.where), so every
      // .where() of the chain must carry the store predicate, and a $dynamic() builder must not escape
      const wheres = chain.filter((c) => methodOf(c) === "where");
      if (!wheres.length) this.report(at, "L2", "no-where", `.${method}(${table}) has no .where()`);
      else {
        const scopes = wheres.map((w) => this.predScopes(w.arguments[0], call));
        if (scopes.some((s) => !s.length))
          this.report(
            at,
            "L2",
            wheres.length > 1 ? "where-replaced" : "unscoped-where",
            wheres.length > 1
              ? `.${method}(${table}) has ${wheres.length} .where() calls and one lacks the store predicate: drizzle keeps only the last one`
              : `.${method}(${table}).where() has no inStore/whereStore/byId/storeSql on a StoreScope parameter (top level or inside and())`,
          );
        else for (const w of wheres) this.reportOpen(w.arguments[0], call, `.${method}(${table}).where()`);
        used.push(...scopes.flat());
      }
      if (chain.some((c) => methodOf(c) === "$dynamic") && !this.consumedInPlace(top))
        this.report(at, "L2", "dynamic", `.${method}(${table}).$dynamic() leaves the function unexecuted: a later .where() would replace the store predicate; await it where it is built`);
    }
    if (method === "$count") {
      if (!this.predScopes(call.arguments[1], call).length) this.report(at, "L2", "unscoped-where", `$count(${table}) has no store predicate on a StoreScope parameter`);
      else this.reportOpen(call.arguments[1], call, `$count(${table})`);
    }

    if (method === "insert") {
      const values = chain.find((c) => methodOf(c) === "values");
      if (values) {
        const s = this.valuesScopes(values.arguments[0], call);
        if (!s) this.report(at, "L3", "insert-values", `.insert(${table}).values() not wrapped in storeValues(scope, …), or a later spread may override its storeId`);
        else used.push(...s);
      }
      const odku = chain.find((c) => methodOf(c) === "onDuplicateKeyUpdate");
      if (odku?.arguments[0] && this.propHasStoreId(odku.arguments[0], "set"))
        this.report(at, "L3b", "set-storeId", `.insert(${table}).onDuplicateKeyUpdate({ set }): the set's type has storeId (a row could move to another store)`);
    }
    if (method === "update")
      for (const set of chain.filter((c) => methodOf(c) === "set"))
        if (set.arguments[0] && this.typeHasStoreId(this.typeAt(set.arguments[0])))
          this.report(at, "L3b", "set-storeId", `.update(${table}).set(): the value's type has storeId (a row could move to another store; type the patch without it)`);

    if (WRITES.has(method) && scopeFn) {
      if (used.length) {
        for (const s of used) {
          if (this.isWriteType(this.typeAt(s)) || this.l6ArgReported.has(s)) continue;
          this.l6ArgReported.add(s);
          this.report(s, "L6", "write-scope", `.${method}(${table}) writes through ${s.getText(this.file)}, which is not a WriteScope (D71): a read-only impersonation or platform scope cannot write`);
        }
      } else if (!this.l6Reported.has(scopeFn) && !this.scopeParams(scopeFn).some((p) => this.carriesWrite(this.typeAt(p.name), p))) {
        this.l6Reported.add(scopeFn);
        this.report(at, "L6", "write-scope", `.${method}(${table}) in ${fnName(scopeFn) ?? "a function"} whose scope parameter is not a WriteScope (D71)`);
      }
    }
  }

  /** the query is executed where it is built: awaited, or returned from an async function (its caller gets rows) */
  private consumedInPlace(top: ts.Node): boolean {
    let e: ts.Node = top;
    while (ts.isParenthesizedExpression(e.parent)) e = e.parent;
    const p = e.parent;
    if (ts.isAwaitExpression(p)) return true;
    const fn = ts.isReturnStatement(p) ? enclosingFns(p)[0] : ts.isArrowFunction(p) && p.body === e ? p : undefined;
    return !!fn && hasModifier(fn, ts.SyntaxKind.AsyncKeyword);
  }

  /** `db.query.<table>.findFirst / findMany({ where })`: a select whose store predicate is the `where` option (L1, L2) */
  private onRelational(call: ts.CallExpression, callee: ts.PropertyAccessExpression): void {
    const holder = unwrap(callee.expression);
    if (!ts.isPropertyAccessExpression(holder)) return;
    const q = unwrap(holder.expression);
    const table = ts.isPropertyAccessExpression(q) && q.name.text === "query" ? this.tenantByExport.get(holder.name.text) : undefined;
    if (!table || !this.calleeRef(call)?.file.includes("drizzle-orm")) return;
    this.ops.get(this.file)!.push({ node: call, pos: call.getStart(this.file), table, method: "from" });
    if (this.exempt(call)) return;
    if (!enclosingFns(call).some((fn) => this.scopeParams(fn).length > 0)) this.report(call, "L1", "query", `query.${holder.name.text}.${callee.name.text}() in a function without a StoreScope parameter`);
    const opts = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
    const where = opts && ts.isObjectLiteralExpression(opts) ? opts.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "where") : undefined;
    if (!where) this.report(call, "L2", "no-where", `query.${holder.name.text}.${callee.name.text}() has no where`);
    else if (!this.predScopes(where.initializer, call).length)
      this.report(call, "L2", "unscoped-where", `query.${holder.name.text}.${callee.name.text}({ where }) has no inStore/whereStore/byId/storeSql on a StoreScope parameter (a callback where is not checked: pass the SQL)`);
    else this.reportOpen(where.initializer, call, `query.${holder.name.text}.${callee.name.text}({ where })`);
  }

  /**
   * The scope arguments of the store predicates in a where: inStore / whereStore / byId / storeSql on a scope
   * parameter, at the top level or inside and( (never or( / not(). Empty when there is none.
   */
  private predScopes(expr: ts.Expression | undefined, at: ts.Node, depth = 0): ts.Expression[] {
    if (!expr || depth > 4) return [];
    const e = unwrap(expr);
    if (ts.isCallExpression(e)) {
      if (this.isCall(e, F.sql, "inStore", "whereStore", "byId")) return this.isScopeParamRef(e.arguments[1], at) ? [e.arguments[1]] : [];
      if (this.isCall(e, F.sql, "storeSql")) return this.isScopeParamRef(e.arguments[0], at) ? [e.arguments[0]] : [];
      if (this.isDrizzleCall(e, "and")) return e.arguments.flatMap((a) => (ts.isSpreadElement(a) ? this.spreadScopes(a.expression, at, depth) : this.predScopes(a, at, depth + 1)));
      return [];
    }
    if (ts.isTaggedTemplateExpression(e) && this.isSqlTag(e)) {
      const s = this.templatePredScope(e, at);
      return s ? [s] : [];
    }
    if (ts.isConditionalExpression(e)) {
      const a = this.predScopes(e.whenTrue, at, depth + 1);
      const b = this.predScopes(e.whenFalse, at, depth + 1);
      return a.length && b.length ? [...a, ...b] : [];
    }
    if (ts.isIdentifier(e)) {
      const init = this.constInit(e);
      return init ? this.predScopes(init, at, depth + 1) : [];
    }
    return [];
  }

  private spreadScopes(e: ts.Expression, at: ts.Node, depth: number): ts.Expression[] {
    const x = this.constArray(e);
    return x ? x.elements.flatMap((el) => (ts.isSpreadElement(el) ? [] : this.predScopes(el, at, depth + 1))) : [];
  }

  private constArray(e: ts.Expression): ts.ArrayLiteralExpression | null {
    let x = unwrap(e);
    if (ts.isIdentifier(x)) x = unwrap(this.constInit(x) ?? x);
    return ts.isArrayLiteralExpression(x) ? x : null;
  }

  /**
   * L2 (review C0b F2): storeSql() inside a larger `sql` template counts only as its first conjunct:
   * `${storeSql(scope)}` alone, `${storeSql(scope)} AND <conjunct>` with no OR / XOR / || / := and only bound values,
   * tables and columns in the rest, or `${storeSql(scope)} AND ( … )` around all the rest. storeSql emits
   * `store_id = ?` without parentheses, and drizzle inlines a nested SQL fragment without them, so NOT, a comparison
   * or an OR applied to it, or a fragment outside the parentheses, could widen it to every store.
   */
  private templatePredScope(e: ts.TaggedTemplateExpression, at: ts.Node): ts.Expression | null {
    if (!ts.isTemplateExpression(e.template) || e.template.head.text.trim()) return null;
    const [first, ...rest] = e.template.templateSpans;
    const x = unwrap(first.expression);
    if (!ts.isCallExpression(x) || !this.isCall(x, F.sql, "storeSql") || !this.isScopeParamRef(x.arguments[0], at)) return null;
    if (!rest.length && !first.literal.text.trim()) return x.arguments[0];
    let tail = first.literal.text;
    let fragment = false;
    for (const s of rest) {
      const v = unwrap(s.expression);
      if (ts.isCallExpression(v) && this.isDrizzleCall(v, "raw")) {
        const a = v.arguments[0];
        if (!a || !ts.isStringLiteralLike(a)) return null;
        tail += ` ${a.text} ${s.literal.text}`;
        continue;
      }
      const k = this.sqlKind(s.expression);
      if (k === "unknown") return null;
      if (k === "sql") fragment = true;
      tail += (k === "sql" ? " \u0001 " : " ? ") + s.literal.text;
    }
    return safeAndTail(tail, fragment) ? x.arguments[0] : null;
  }

  /** L2 (review C0b F2): an and() sibling of the store predicate that may expand to a top-level OR */
  private reportOpen(expr: ts.Expression | undefined, at: ts.Node, what: string): void {
    for (const o of this.openSiblings(expr, at))
      this.report(
        o,
        "L2",
        "open-condition",
        `${what}: ${o.getText(this.file).slice(0, 60)} sits in and() beside the store predicate and may hold a top-level OR (drizzle inlines a nested SQL fragment without parentheses): use whereStore(table, scope, …), which parenthesizes each condition, or drizzle operators`,
      );
  }

  private openSiblings(expr: ts.Expression | undefined, at: ts.Node, depth = 0): ts.Expression[] {
    if (!expr || depth > 4) return [];
    const e = unwrap(expr);
    if (ts.isCallExpression(e) && this.isDrizzleCall(e, "and")) {
      const out: ts.Expression[] = [];
      for (const a of e.arguments) {
        if (ts.isSpreadElement(a)) {
          const arr = this.constArray(a.expression);
          if (!arr) out.push(a.expression);
          else for (const el of arr.elements) if (ts.isSpreadElement(el) || (!this.predScopes(el, at, depth + 1).length && !this.closedCond(el))) out.push(el);
          continue;
        }
        if (this.predScopes(a, at, depth + 1).length) out.push(...this.openSiblings(a, at, depth + 1));
        else if (!this.closedCond(a)) out.push(a);
      }
      return out;
    }
    if (ts.isConditionalExpression(e)) return [...this.openSiblings(e.whenTrue, at, depth + 1), ...this.openSiblings(e.whenFalse, at, depth + 1)];
    if (ts.isIdentifier(e)) {
      const init = this.constInit(e);
      return init ? this.openSiblings(init, at, depth + 1) : [];
    }
    return [];
  }

  /**
   * A condition that cannot expand to a top-level OR where drizzle inlines it: a drizzle operator over columns and
   * bound values, and( / or( / not( of such conditions, the four helpers, a `sql` template whose text has no top-level
   * OR / XOR / || / := and whose fragments are closed too, undefined, or a value that is not SQL at all.
   */
  private closedCond(expr: ts.Expression | undefined, depth = 0): boolean {
    if (!expr) return true;
    if (depth > 6) return false;
    const e = unwrap(expr);
    if ((ts.isIdentifier(e) && e.text === "undefined") || e.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isCallExpression(e)) {
      if (this.isCall(e, F.sql, "inStore", "whereStore", "byId", "storeSql")) return true;
      const r = this.calleeRef(e);
      if (r?.file.includes("drizzle-orm")) {
        if (r.name === "and" || r.name === "or" || r.name === "not")
          return e.arguments.every((a) => (ts.isSpreadElement(a) ? !!this.constArray(a.expression)?.elements.every((el) => !ts.isSpreadElement(el) && this.closedCond(el, depth + 1)) : this.closedCond(a, depth + 1)));
        if (SAFE_OPS.has(r.name))
          return e.arguments.every((a) => {
            if (ts.isSpreadElement(a)) return false;
            const k = this.sqlKind(a);
            return k !== "unknown" && (k !== "sql" || this.closedCond(a, depth + 1));
          });
        if (r.name === "raw") return !!e.arguments[0] && ts.isStringLiteralLike(e.arguments[0]) && closedSqlText(e.arguments[0].text);
      }
    }
    if (ts.isTaggedTemplateExpression(e) && this.isSqlTag(e)) {
      if (ts.isNoSubstitutionTemplateLiteral(e.template)) return closedSqlText(e.template.text);
      let text = e.template.head.text;
      for (const s of e.template.templateSpans) {
        const k = this.sqlKind(s.expression);
        if (k === "unknown") return false;
        text += (k === "sql" && !this.closedCond(s.expression, depth + 1) ? " \u0001 " : " ? ") + s.literal.text;
      }
      return closedSqlText(text);
    }
    if (ts.isConditionalExpression(e)) return this.closedCond(e.whenTrue, depth + 1) && this.closedCond(e.whenFalse, depth + 1);
    if (ts.isIdentifier(e)) {
      const init = this.constInit(e);
      if (init) return this.closedCond(init, depth + 1);
    }
    const k = this.sqlKind(e);
    return k !== "sql" && k !== "unknown";
  }

  /**
   * The scope arguments of insert values (L3, review C0b F4): storeValues(<scope parameter>, …), a literal with
   * `storeId: <scope parameter>.storeId` and no spread or storeId key after it, an array or .map() of those, or a
   * const of one. Null when the values do not pin the scope's store.
   */
  private valuesScopes(expr: ts.Expression | undefined, at: ts.Node, depth = 0): ts.Expression[] | null {
    if (!expr || depth > 4) return null;
    const e = unwrap(expr);
    if (ts.isCallExpression(e)) {
      if (this.isCall(e, F.sql, "storeValues")) return this.isScopeParamRef(e.arguments[0], at) ? [e.arguments[0]] : null;
      const cb = e.arguments[0] ? unwrap(e.arguments[0]) : undefined;
      if (ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === "map" && cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        if (!ts.isBlock(cb.body)) return this.valuesScopes(cb.body, at, depth + 1);
        const [only] = cb.body.statements;
        return cb.body.statements.length === 1 && ts.isReturnStatement(only) ? this.valuesScopes(only.expression, at, depth + 1) : null;
      }
      return null;
    }
    if (ts.isObjectLiteralExpression(e)) {
      const key = (p: ts.ObjectLiteralElementLike) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null);
      const i = e.properties.findIndex((p) => {
        if (!ts.isPropertyAssignment(p) || key(p) !== "storeId") return false;
        const v = unwrap(p.initializer);
        return ts.isPropertyAccessExpression(v) && v.name.text === "storeId" && this.isScopeParamRef(v.expression, at);
      });
      if (i < 0) return null;
      if (e.properties.slice(i + 1).some((p) => ts.isSpreadAssignment(p) || key(p) === "storeId" || key(p) === "store_id")) return null;
      return [unwrap(((e.properties[i] as ts.PropertyAssignment).initializer as ts.PropertyAccessExpression).expression)];
    }
    if (ts.isArrayLiteralExpression(e)) {
      if (!e.elements.length) return null;
      const out: ts.Expression[] = [];
      for (const el of e.elements) {
        const s = ts.isSpreadElement(el) ? null : this.valuesScopes(el, at, depth + 1);
        if (!s) return null;
        out.push(...s);
      }
      return out;
    }
    if (ts.isIdentifier(e)) {
      const init = this.constInit(e);
      return init ? this.valuesScopes(init, at, depth + 1) : null;
    }
    return null;
  }

  /** L3b (review C0b F4): the type has a storeId / store_id key, or a string index signature, or is any */
  private typeHasStoreId(t: ts.Type): boolean {
    if (t.flags & ts.TypeFlags.Any) return true;
    for (const m of t.isUnion() ? t.types : [t]) {
      if (m.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
      if (m.getProperty("storeId") || m.getProperty("store_id")) return true;
      if (this.checker.getIndexInfosOfType(m).some((ii) => !!(ii.keyType.flags & ts.TypeFlags.String))) return true;
    }
    return false;
  }

  private propHasStoreId(e: ts.Expression, prop: string): boolean {
    const t = this.typeAt(e);
    if (t.flags & ts.TypeFlags.Any) return true;
    const p = t.getProperty(prop);
    return !!p && this.typeHasStoreId(this.checker.getTypeOfSymbolAtLocation(p, e));
  }

  private storeIdColumn(e: ts.Expression): boolean {
    const x = unwrap(e);
    return ts.isPropertyAccessExpression(x) && x.name.text === "storeId" && !!this.tenantTableOf(x.expression);
  }

  /** L2b: eq(T.storeId, x) where x is neither <scope parameter>.storeId nor another table's store_id column (a join) */
  private onEq(call: ts.CallExpression): void {
    const [a, b] = call.arguments;
    if (!a || !b) return;
    const sa = this.storeIdColumn(a);
    const sb = this.storeIdColumn(b);
    if (!sa && !sb) return;
    if (sa && sb) return;
    const other = unwrap(sa ? b : a);
    if (ts.isPropertyAccessExpression(other) && other.name.text === "storeId" && this.isScopeParamRef(other.expression, call)) return;
    if (this.insideExemptQuery(call) || this.exempt(call)) return;
    this.report(call, "L2b", "eq-storeId", "eq(<table>.storeId, …) with a value that is not a scope: use inStore(table, scope) / whereStore / byId");
  }

  /* ---------------- raw SQL: L10 ---------------- */

  private isSqlTag(t: ts.TaggedTemplateExpression): boolean {
    const tag = unwrap(t.tag);
    if (!ts.isIdentifier(tag) && !ts.isPropertyAccessExpression(tag)) return false;
    const sym = this.symbolOf(tag);
    const decl = sym?.declarations?.[0];
    return !!sym && sym.name === "sql" && !!decl && rel(decl.getSourceFile().fileName).includes("drizzle-orm");
  }

  private onTaggedTemplate(t: ts.TaggedTemplateExpression): void {
    if (!this.isSqlTag(t)) return;
    this.checkSqlText(this.sqlTemplateText(t, 0), t);
  }

  /** a drizzle `sql` template as SQL text: tables and columns by name, bound values as `?`, an unknown fragment as DYN */
  private sqlTemplateText(t: ts.TaggedTemplateExpression, depth: number): string {
    if (ts.isNoSubstitutionTemplateLiteral(t.template)) return t.template.text;
    let text = t.template.head.text;
    for (const span of t.template.templateSpans) text += this.sqlPlaceholder(span.expression, depth) + span.literal.text;
    return text;
  }

  private sqlPlaceholder(expr: ts.Expression, depth = 0): string {
    const e = unwrap(expr);
    const table = this.tenantTableOf(e);
    if (table) return ` ${table} `;
    if (ts.isPropertyAccessExpression(e) && e.name.text === "storeId" && this.tenantTableOf(e.expression)) return " store_id ";
    if (ts.isCallExpression(e)) {
      const lit = e.arguments[0] && ts.isStringLiteralLike(e.arguments[0]) ? e.arguments[0].text : null;
      if (this.isCall(e, F.sql, "storeSql")) return ` ${lit ?? "store_id"} = ? `;
      if (this.isDrizzleCall(e, "raw")) return lit !== null ? ` ${lit} ` : DYN;
      if (this.isDrizzleCall(e, "identifier")) return lit !== null ? ` \`${lit}\` ` : DYN;
    }
    if (depth < 3 && ts.isTaggedTemplateExpression(e) && this.isSqlTag(e)) return ` ${this.sqlTemplateText(e, depth + 1)} `;
    if (depth < 3 && ts.isIdentifier(e)) {
      const init = this.constInit(e);
      if (init) return this.sqlPlaceholder(init, depth + 1);
    }
    const k = this.sqlKind(e);
    if (k === "table") return ` \`${this.underProp(this.checker.getApparentType(this.typeAt(e)), "name", e) || "t"}\` `;
    if (k === "column") return " c ";
    if (k === "sql" || k === "unknown") return DYN;
    return " ? ";
  }

  /**
   * L10 (review C0b F5) over every SQL text of src/**: a string or template whose text starts with SELECT / INSERT /
   * UPDATE / DELETE / REPLACE / WITH / TRUNCATE (wherever it goes: a const, a helper, sql.raw), a `+` chain that starts
   * with one, and every drizzle `sql` template. A template span or a concatenated value is DYN (unknown SQL).
   */
  private onRawText(text: string, node: ts.Node): void {
    if (SELFTEST.test(this.relFile)) return;
    if (SQL_START.test(text)) this.checkSqlText(text, node);
  }

  private checkSqlText(raw: string, node: ts.Node): void {
    for (const stmt of sqlStatements(raw)) {
      const found = analyzeSql(stmt, (n) => this.isTenantSqlName(n));
      if (!found.tables.length && !found.problems.length) continue;
      if (found.tables.length)
        this.ops.get(this.file)!.push({ node, pos: node.getStart(this.file), table: found.insertTarget ?? found.tables[0], method: found.insertTarget ? "raw-insert" : "raw" });
      if (!found.problems.length || this.exempt(node)) continue;
      this.report(node, "L10", found.dynamic ? "dynamic-sql" : "raw-sql", `raw SQL${found.tables.length ? ` on ${[...new Set(found.tables)].join(", ")}` : ""}: ${[...new Set(found.problems)].join("; ")}`);
    }
  }

  private tenantSqlNames: Set<string> | null = null;
  private isTenantSqlName(name: string): boolean {
    this.tenantSqlNames ??= new Set(this.tenantDecls.values());
    return this.tenantSqlNames.has(name.toLowerCase());
  }

  /* ---------------- literals: L5 (GET_LOCK), L8, L10 ---------------- */

  private onLiteral(n: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression): void {
    const f = this.relFile;
    if (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent) || ts.isExternalModuleReference(n.parent) || ts.isLiteralTypeNode(n.parent)) return;
    if (ts.isExpressionStatement(n.parent)) return; // directives
    const text = ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join("${}") : n.text;
    if (/\bGET_LOCK\s*\(/i.test(text) && !f.startsWith("src/lib/db/")) this.report(n, "L5", "get-lock", "GET_LOCK outside src/lib/db/: use storeLock / platformLock with withNamedLock (§E.7)");
    if (!ts.isTaggedTemplateExpression(n.parent) && !this.concatHandled.has(n)) this.onRawText(this.rawText(n), n);
    if (!f.startsWith("src/components/") && !f.startsWith("src/app/app/")) return;
    const head = ts.isTemplateExpression(n) ? n.head.text : n.text;
    if (/^\/admin(?=[/?#]|$)/.test(head)) this.report(n, "L8", "admin-path", `"${head.slice(0, 40)}" hard-codes an /admin path: use appHref() / the console URL builders (ADM-37)`);
    else if (ts.isTemplateExpression(n) && head === "/") this.report(n, "L8", "live-url", "`/${…}` builds a live URL by hand: use storeUrl() / appHref() (ADM-39)");
  }

  private readonly concatHandled = new Set<ts.Node>();

  /** the text of a plain string / template / value in raw SQL: a string `const` is inlined (a name in code), anything else is DYN */
  private rawText(e: ts.Expression, depth = 0): string {
    const x = unwrap(e);
    if (ts.isStringLiteralLike(x)) return x.text;
    if (ts.isTemplateExpression(x)) return x.head.text + x.templateSpans.map((s) => this.rawText(s.expression, depth + 1) + s.literal.text).join("");
    if (depth < 3 && ts.isIdentifier(x)) {
      const init = this.constInit(x);
      if (init && (ts.isStringLiteralLike(unwrap(init)) || ts.isTemplateExpression(unwrap(init)))) return this.rawText(init, depth + 1);
    }
    return DYN;
  }

  private onConcat(n: ts.BinaryExpression): void {
    const f = this.relFile;
    // L10: a `+` chain whose text starts with SQL ("SELECT * FROM " + table + " WHERE …"); judged once, at its root
    if (!(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const parts: ts.Expression[] = [];
      const flat = (e: ts.Expression) => {
        const x = ts.isParenthesizedExpression(e) ? e.expression : e;
        if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
          flat(x.left);
          flat(x.right);
        } else parts.push(x);
      };
      flat(n);
      const first = parts[0];
      if (first && (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first))) {
        const text = parts.map((p) => this.rawText(p)).join("");
        if (SQL_START.test(text)) {
          for (const p of parts) this.concatHandled.add(p);
          this.onRawText(text, n);
        }
      }
    }
    if (!f.startsWith("src/components/") && !f.startsWith("src/app/app/")) return;
    const left = unwrap(n.left);
    if (ts.isStringLiteralLike(left) && left.text === "/") this.report(n, "L8", "live-url", `"/" + … builds a live URL by hand: use storeUrl() / appHref() (ADM-39)`);
  }

  /* ---------------- casts and predicates: L5, L6 ---------------- */

  private onCast(n: ts.AsExpression | ts.TypeAssertion): void {
    if (ts.isConstTypeReference(n.type)) return;
    const f = this.relFile;
    const target = this.checker.getTypeFromTypeNode(n.type);
    const source = this.checker.getNonNullableType(this.typeAt(n.expression));
    // L5 (review C0b F10): only rate-limit.ts brands a Bucket; a cast would let any code spend another store's bucket
    if (this.bucket && f !== F.rateLimit && this.isUsable(target) && this.checker.isTypeAssignableTo(target, this.bucket) && !(this.isUsable(source) && this.checker.isTypeAssignableTo(source, this.bucket)))
      this.report(n, "L5", "bucket-cast", "a cast to Bucket outside src/lib/security/rate-limit.ts: build it with platformBucket() / storeBucket() (§E.8)");
    if (f === F.seam) return;
    // L6 (review C0b F1): a cast to StoreScope forges a store; a cast to WriteScope upgrades a read-only scope. A
    // downcast inside a union of real ctxs (`ctx as StoreCtx` from `StoreCtx | PlatformCtx`) mints nothing; the
    // standalone selftests build fake ctxs on purpose (the app never imports them)
    const fromUnion = source.isUnion() && source.types.some((t) => this.carriesScope(t, n));
    if (this.carriesScope(target, n) && !this.carriesScope(source, n) && !fromUnion && !SELFTEST.test(f))
      this.report(n, "L6", "cast", "a cast or assertion to StoreScope (or a ctx carrying one) outside src/lib/tenancy/seam.ts: scopes come only from the seam (§E.1)");
    else if (this.carriesWrite(target, n) && !this.carriesWrite(source, n))
      this.report(n, "L6", "cast", "a cast or assertion to WriteScope (or a ctx carrying one) outside src/lib/tenancy/seam.ts (D71)");
  }

  private onFunction(fn: FnLike): void {
    const f = this.relFile;
    if (fn.type && ts.isTypePredicateNode(fn.type) && fn.type.type && f !== F.seam) {
      const t = this.checker.getTypeFromTypeNode(fn.type.type);
      if (this.carriesWrite(t, fn) || this.carriesScope(t, fn)) this.report(fn.type, "L6", "cast", "a type guard that narrows to a StoreScope / WriteScope outside src/lib/tenancy/seam.ts (§E.1, D71)");
    }
    // L9, inline server action (a function whose first statement is "use server")
    if (fn.body && ts.isBlock(fn.body) && isDirective(fn.body.statements[0], "use server")) this.checkActionBody(fn, fn.name ?? fn, true);
  }

  /* ---------------- imports: L7 ---------------- */

  private onImport(spec: string, at: ts.Node, typeOnly = false): void {
    const f = this.relFile;
    if (!f.startsWith("src/app/") && !f.startsWith("src/components/")) return;
    const res = ts.resolveModuleName(spec, this.file.fileName, this.program.getCompilerOptions(), this.host, this.resolutionCache).resolvedModule;
    const target = res ? rel(res.resolvedFileName) : null;
    if (target === F.dbClient || target === F.schema) {
      this.report(at, "L7", typeOnly ? "db-type-import" : "db-import", `imports ${target} (ADM-38): call a repository instead${typeOnly ? " (row types come from the repository module)" : ""}`);
      return;
    }
    if (typeOnly || (!ts.isImportDeclaration(at) && !ts.isExportDeclaration(at))) return;
    // review C0b F14: a barrel or a renamed re-export reaches the client or a table too; judged by the declaration
    // each imported value resolves to (types stay with the direct-path rule: a repository may re-export a row type)
    const names: (ts.Identifier | ts.StringLiteral)[] = [];
    let namespaceSym: ts.Symbol | undefined;
    if (ts.isImportDeclaration(at)) {
      const c = at.importClause;
      if (c?.name) names.push(c.name);
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings)) {
        for (const el of c.namedBindings.elements) if (!el.isTypeOnly) names.push(el.name);
      }
      if (c?.namedBindings && ts.isNamespaceImport(c.namedBindings)) namespaceSym = this.checker.getSymbolAtLocation(c.namedBindings.name);
    } else if (ts.isExportDeclaration(at)) {
      if (at.exportClause && ts.isNamedExports(at.exportClause)) {
        for (const el of at.exportClause.elements) if (!el.isTypeOnly) names.push(el.name);
      } else if (!at.exportClause && at.moduleSpecifier) namespaceSym = this.checker.getSymbolAtLocation(at.moduleSpecifier);
    }
    const fromDb = (sym: ts.Symbol | undefined): boolean => {
      let s = sym;
      if (s && s.flags & ts.SymbolFlags.Alias) s = this.checker.getAliasedSymbol(s);
      return !!s && !!(s.flags & ts.SymbolFlags.Value) && !!s.declarations?.some((d) => [F.dbClient, F.schema].includes(rel(d.getSourceFile().fileName)));
    };
    let hit = names.find((n) => fromDb(this.checker.getSymbolAtLocation(n)))?.text;
    if (!hit && namespaceSym) {
      let m = namespaceSym;
      if (m.flags & ts.SymbolFlags.Alias) m = this.checker.getAliasedSymbol(m);
      hit = this.checker.getExportsOfModule(m).find((s) => fromDb(s))?.name;
    }
    if (hit) this.report(at, "L7", "db-reexport", `imports ${hit} from ${target ?? spec}, which re-exports src/lib/db/client.ts or schema.ts (ADM-38): call a repository instead`);
  }

  /* ---------------- globals and module caches: L4 ---------------- */

  private allowed(symbol: string): boolean {
    const e = this.cfg.allow.find((a) => a.file === this.relFile && a.symbol === symbol);
    if (e) this.usedAllow.add(e);
    return !!e;
  }

  private onDeclareGlobal(n: ts.ModuleDeclaration): void {
    if (!n.body || !ts.isModuleBlock(n.body)) return;
    for (const s of n.body.statements) {
      if (!ts.isVariableStatement(s)) continue;
      for (const d of s.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !/^__(cod|sg)/.test(d.name.text) || this.allowed(d.name.text)) continue;
        this.report(d, "L4", "global", `globalThis.${d.name.text}: a process-wide global; use scopedCache() or list it in scripts/qa/tenancy-allow.json with a reason`);
      }
    }
  }

  private onNew(n: ts.NewExpression): void {
    if (!ts.isIdentifier(n.expression) || (n.expression.text !== "Map" && n.expression.text !== "Set") || SELFTEST.test(this.relFile)) return;
    let symbol = "<module>";
    let binding: ts.VariableDeclaration | null = null;
    let lazy = false;
    /** the module-load IIFE the collection is built in (`const M: ReadonlyMap<…> = (() => { const m = new Map(); …; return m; })()`) */
    let iife: ts.Node | null = null;
    for (let p: ts.Node = n.parent; p; p = p.parent) {
      if (isFnLike(p) && isIife(p) && !iife) {
        iife = p.parent;
        while (ts.isParenthesizedExpression(iife)) iife = iife.parent;
        continue;
      }
      // review C0b F9: a function, a static block or an IIFE creates process state when it stores the collection in
      // a module-scope binding, a static member or a globalThis property (`lazy ??= new Map()`, `X.c = new Set()`)
      if ((isFnLike(p) && !isIife(p)) || ts.isClassStaticBlockDeclaration(p)) {
        const target = this.lazyTarget(n);
        if (!target) return;
        symbol = target;
        binding = null;
        lazy = true;
        break;
      }
      if (ts.isPropertyDeclaration(p)) {
        if (!hasModifier(p, ts.SyntaxKind.StaticKeyword)) return; // per instance
        symbol = `${(p.parent as ts.ClassLikeDeclaration).name?.text ?? "<class>"}.${p.name.getText(this.file)}`;
        break;
      }
      if (ts.isCallExpression(p) && this.isCall(p, F.cache, "scopedCache")) return;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
        symbol = p.name.text;
        binding ??= p;
        if (ts.isVariableStatement(p.parent.parent) && ts.isSourceFile(p.parent.parent.parent)) break;
      }
      if (ts.isExportAssignment(p)) symbol = "default";
    }
    if (symbol === "") return; // a globalThis property declared in `declare global`: judged there
    if (this.allowed(symbol)) return;
    if (iife && !lazy) {
      // built while the module loads, then judged by the binding that receives the IIFE's result
      const outer = ts.isVariableDeclaration(iife.parent) && iife.parent.initializer && unwrap(iife.parent.initializer) === iife ? iife.parent : null;
      if (ts.isExpression(iife) && this.readonlySlot(iife)) return;
      if (outer && this.frozen(outer)) return;
    }
    const direct = !lazy && !iife && !!binding?.initializer && unwrap(binding.initializer) === n;
    if (!lazy && !iife && (this.readonlySlot(n) || (direct && this.frozen(binding!)))) return;
    const hint = direct && ts.getCombinedNodeFlags(binding!) & ts.NodeFlags.Const ? `; a lookup table that is never changed: type it Readonly${n.expression.text}` : "";
    this.report(n, "L4", "module-map", `${lazy ? "lazily created" : "module-scope"} new ${n.expression.text}() (${symbol}): use scopedCache() or list it in scripts/qa/tenancy-allow.json with a reason${hint}`);
  }

  /**
   * Where a `new Map / Set` made inside a function is stored for the process (review C0b F9): the name of a
   * module-scope binding, `Class.member` for a static, the property name of a globalThis property (`""` when that
   * property is declared in `declare global`, which is judged at its declaration), or null for a local value.
   */
  private lazyTarget(n: ts.Expression): string | null {
    let e: ts.Node = n;
    for (;;) {
      const p: ts.Node = e.parent;
      if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isSatisfiesExpression(p) || ts.isNonNullExpression(p)) e = p;
      else if (ts.isConditionalExpression(p) && p.condition !== e) e = p;
      else if (ts.isBinaryExpression(p) && p.right === e && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(p.operatorToken.kind)) e = p;
      else break;
    }
    const p = e.parent;
    const ASSIGN = [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken];
    if (!ts.isBinaryExpression(p) || p.right !== e || !ASSIGN.includes(p.operatorToken.kind)) return null;
    const left = unwrap(p.left);
    if (ts.isIdentifier(left)) {
      const d = this.checker.getSymbolAtLocation(left)?.valueDeclaration;
      return d && ts.isVariableDeclaration(d) && ts.isVariableStatement(d.parent.parent) && ts.isSourceFile(d.parent.parent.parent) ? left.text : null;
    }
    if (!ts.isPropertyAccessExpression(left) && !ts.isElementAccessExpression(left)) return null;
    const name = ts.isPropertyAccessExpression(left) ? left.name.text : ts.isStringLiteralLike(left.argumentExpression) ? left.argumentExpression.text : "<computed>";
    const obj = unwrap(left.expression);
    if (this.isGlobalThis(obj)) return this.declaredGlobal(left) ? "" : name;
    if (obj.kind === ts.SyntaxKind.ThisKeyword) {
      const cls = ts.findAncestor(left, ts.isClassLike);
      const inStatic = ts.findAncestor(left, (x) => ts.isClassStaticBlockDeclaration(x) || ((ts.isMethodDeclaration(x) || ts.isPropertyDeclaration(x)) && hasModifier(x, ts.SyntaxKind.StaticKeyword)));
      return cls && inStatic ? `${cls.name?.text ?? "<class>"}.${name}` : null;
    }
    if (ts.isIdentifier(obj)) {
      const d = this.symbolOf(obj)?.valueDeclaration;
      if (d && ts.isClassLike(d)) return `${obj.text}.${name}`;
      if (d && ts.isVariableDeclaration(d) && ts.isVariableStatement(d.parent.parent) && ts.isSourceFile(d.parent.parent.parent)) return `${obj.text}.${name}`;
    }
    return null;
  }

  /** `globalThis`, or a const that holds it (`const g = globalThis as unknown as { … }`) */
  private isGlobalThis(e: ts.Expression): boolean {
    const x = unwrap(e);
    if (!ts.isIdentifier(x)) return false;
    if (x.text === "globalThis") return true;
    const init = this.constInit(x);
    return !!init && ts.isIdentifier(unwrap(init)) && (unwrap(init) as ts.Identifier).text === "globalThis";
  }

  /** the property resolves to a `var` of `declare global` (judged by onDeclareGlobal in its own file) */
  private declaredGlobal(access: ts.PropertyAccessExpression | ts.ElementAccessExpression): boolean {
    const sym = this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(access) ? access.name : access.argumentExpression);
    return !!sym?.declarations?.some((d) => !!ts.findAncestor(d, (a) => ts.isModuleDeclaration(a) && !!(a.flags & ts.NodeFlags.GlobalAugmentation)));
  }

  /**
   * L4 globals outside `declare global` (review C0b F9): the members of a type literal a globalThis cast or a
   * globalThis-holding variable is typed with, and any globalThis property or element access named __cod… / __sg…,
   * whatever the cast (`(globalThis as any).__codX`, `(globalThis as Record<string, unknown>)["__sgX"]`).
   */
  private globalsL4(sf: ts.SourceFile): void {
    const flag = (name: string, at: ts.Node) => {
      if (!/^__(cod|sg)/.test(name) || this.l4GlobalSeen.has(`${this.relFile}:${name}`)) return;
      this.l4GlobalSeen.add(`${this.relFile}:${name}`);
      if (!this.allowed(name)) this.report(at, "L4", "global", `globalThis.${name}: a process-wide global; use scopedCache() or list it in scripts/qa/tenancy-allow.json with a reason`);
    };
    const literalMembers = (type: ts.Node | undefined) => {
      const visitType = (t: ts.Node) => {
        if (ts.isTypeLiteralNode(t)) for (const m of t.members) if (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) flag(m.name.text, m);
        ts.forEachChild(t, visitType);
      };
      if (type) visitType(type);
    };
    const visit = (n: ts.Node) => {
      if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && ts.isIdentifier(unwrap(n.expression)) && (unwrap(n.expression) as ts.Identifier).text === "globalThis") literalMembers(n.type);
      else if (ts.isVariableDeclaration(n) && n.type && n.initializer && this.isGlobalThis(n.initializer)) literalMembers(n.type);
      else if ((ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) && this.isGlobalThis(n.expression) && !this.declaredGlobal(n)) {
        const name = ts.isPropertyAccessExpression(n) ? n.name.text : ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : null;
        if (name) flag(name, n);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  /**
   * A module-scope Map / Set nothing can change after module load, so it holds no request's (no store's) data: one
   * created in a ReadonlySet / ReadonlyMap slot (a typed `const`, a typed object member), or a `const` whose every
   * reference, in any file, only reads it: has / get / size / keys / values / entries / forEach, for-of, a spread, a
   * copy (Array.from, new Set, new Map), a ReadonlySet / ReadonlyMap slot (a parameter, a variable, a return type),
   * or a local `const` (a ternary, `??`, `||` included) that is itself only read. Anything else (a mutable
   * parameter, a property, an assignment) may mutate it and counts as a write.
   */
  private frozen(decl: ts.VariableDeclaration): boolean {
    if (!(ts.getCombinedNodeFlags(decl) & ts.NodeFlags.Const) || !ts.isIdentifier(decl.name)) return false;
    return this.onlyRead(decl, true, 0);
  }

  /** the expression sits where the type checker only allows reads (its contextual type is ReadonlySet / ReadonlyMap) */
  private readonlySlot(e: ts.Expression): boolean {
    const t = this.checker.getContextualType(e);
    if (!t) return false;
    const parts = (t.isUnion() ? t.types : [t]).filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
    return parts.length > 0 && parts.every((x) => READONLY_COLLECTIONS.has((x.aliasSymbol ?? x.getSymbol())?.name ?? ""));
  }

  /** the identifiers of src/** by text, the renaming specifiers and the default-import names, built once */
  private buildIdIndex(): void {
    if (this.idIndex) return;
    const ids = new Map<string, ts.Identifier[]>();
    const renames = new Map<string, string[]>();
    const defaults = new Set<string>();
    for (const sf of this.program.getSourceFiles()) {
      if (sf.isDeclarationFile || !rel(sf.fileName).startsWith("src/")) continue;
      const walk = (n: ts.Node) => {
        if (ts.isIdentifier(n)) {
          const list = ids.get(n.text);
          if (list) list.push(n);
          else ids.set(n.text, [n]);
        } else if ((ts.isImportSpecifier(n) || ts.isExportSpecifier(n)) && n.propertyName) {
          const from = n.propertyName.text;
          renames.set(from, [...(renames.get(from) ?? []), n.name.text]);
        } else if (ts.isImportClause(n) && n.name) defaults.add(n.name.text);
        ts.forEachChild(n, walk);
      };
      walk(sf);
    }
    this.idIndex = ids;
    this.renameIndex = renames;
    this.defaultImportNames = defaults;
  }

  /**
   * Every reference of the `const` `decl` binds only reads (other files too when `crossFile` and it is exported).
   * References are found by resolved symbol (review C0b F9): the names to look at are the const's own name plus every
   * name an import / export specifier renames it to (`import { SEEN as S }`), transitively, and the default-import
   * names when it is exported as default.
   */
  private onlyRead(decl: ts.VariableDeclaration, crossFile: boolean, depth: number): boolean {
    if (depth > 3 || !ts.isIdentifier(decl.name)) return false;
    const sym = this.checker.getSymbolAtLocation(decl.name);
    if (!sym) return false;
    this.buildIdIndex();
    const own = decl.getSourceFile();
    const target = (id: ts.Identifier) => {
      let s = this.checker.getSymbolAtLocation(id);
      if (s && s.flags & ts.SymbolFlags.Alias) s = this.checker.getAliasedSymbol(s);
      return s === sym;
    };
    const names = new Set([decl.name.text]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of [...names])
        for (const to of this.renameIndex!.get(n) ?? []) {
          if (names.has(to)) continue;
          names.add(to);
          grew = true;
        }
      if (names.has("default") && !names.has("\0default")) {
        names.add("\0default");
        for (const d of this.defaultImportNames!) names.add(d);
        grew = true;
      }
    }
    let exported = hasModifier(decl.parent.parent, ts.SyntaxKind.ExportKeyword);
    const refs: ts.Identifier[] = [];
    for (const n of names) for (const id of this.idIndex!.get(n) ?? []) if (id !== decl.name && target(id)) refs.push(id);
    for (const id of refs) if (id.getSourceFile() === own && (ts.isExportSpecifier(id.parent) || ts.isExportAssignment(id.parent))) exported = true;
    if (exported && !crossFile) return false;
    for (const id of refs) {
      if (id.getSourceFile() !== own && !crossFile) continue;
      if (!this.readOnlyUse(id, depth)) return false;
    }
    return true;
  }

  private readOnlyUse(e: ts.Expression, depth: number): boolean {
    const p = e.parent;
    if (ts.isSpreadElement(p) || ts.isTypeQueryNode(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p)) return true;
    if (ts.isPropertyAccessExpression(p) && p.name === e) return this.readOnlyUse(p, depth); // M.SEEN through a namespace import
    if (ts.isPropertyAccessExpression(p) && p.expression === e) return READ_MEMBERS.has(p.name.text);
    if (ts.isForOfStatement(p)) return p.expression === e;
    if (this.readonlySlot(e)) return true;
    if ((ts.isNewExpression(p) || ts.isCallExpression(p)) && p.arguments?.length === 1 && p.arguments[0] === e) {
      const c = unwrap(p.expression);
      if (ts.isNewExpression(p)) return ts.isIdentifier(c) && (c.text === "Set" || c.text === "Map");
      return ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === "Array" && c.name.text === "from";
    }
    // pass-through: (x), a ? x : y, x ?? y, x || y; then a local const that is itself only read
    if (ts.isParenthesizedExpression(p) || ts.isNonNullExpression(p) || (ts.isConditionalExpression(p) && p.condition !== e)) return this.readOnlyUse(p, depth);
    if (ts.isBinaryExpression(p) && (p.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || p.operatorToken.kind === ts.SyntaxKind.BarBarToken)) return this.readOnlyUse(p, depth);
    if (ts.isVariableDeclaration(p) && p.initializer === e && ts.getCombinedNodeFlags(p) & ts.NodeFlags.Const) return this.onlyRead(p, false, depth + 1);
    return false;
  }

  /* ---------------- file-level rules: L9, L12, L13 ---------------- */

  private fileRules(sf: ts.SourceFile): void {
    const f = this.relFile;
    if (isRevealSite(f)) this.revealExports(sf);
    const isRoute = /^src\/app\/.*(^|\/)route\.tsx?$/.test(f);
    if (f.startsWith("src/lib/") && !SELFTEST.test(f)) this.globalsL4(sf);
    const exports = isUseServerFile(sf) || isRoute || f.startsWith("src/app/s/[store]/") ? moduleExports(sf, this.checker) : [];
    if (isUseServerFile(sf)) {
      // review C0b F11: Next.js registers every export of a "use server" file as an action, so an export the lint
      // cannot read as a seam-wrapped function (a re-export, export *, a call result, a value) fails closed
      for (const ex of exports) {
        if (!ex.fn) {
          const allowed = this.cfg.actions.find((a) => a.file === f && a.symbol === ex.name);
          if (allowed) this.usedAllow.add(allowed);
          else this.report(ex.at, "L9", "action-export", `${ex.name}: ${ex.why ?? "not a function"} in a "use server" file, which Next.js serves as a server action; export a function whose body starts with return storeAction( / … (AUTH-31)`);
          continue;
        }
        const inline = !!ex.fn.body && ts.isBlock(ex.fn.body) && isDirective(ex.fn.body.statements[0], "use server");
        if (!inline) this.checkActionBody(ex.fn, ex.at, false, ex.name);
        if (this.reach(ex.fn, "publish", (fn) => this.matches(fn, this.cfg.publishSinks)) && !this.reach(ex.fn, "gate", (fn) => this.matches(fn, this.cfg.prePublishGates)))
          this.report(ex.at, "L12", "publish-gate", `${ex.name}() reaches a publish without runPrePublishChecks() (§M.1)`);
      }
    }
    if (!isRoute && !f.startsWith("src/app/s/[store]/")) return;
    const guarded = ["src/app/api/app/[store]/", "src/app/api/admin/", "src/app/api/public/", "src/app/s/[store]/"].some((p) => f.startsWith(p));
    for (const ex of exports) {
      const handler = HTTP_METHODS.has(ex.name);
      // review C0b F12: a handler that is a call result (`export const POST = wrap(…)`) or a re-export cannot be
      // followed to its first statement, so in a guarded tree it fails closed
      if (!ex.fn) {
        if (handler && isRoute && guarded) this.report(ex.at, "L13", "unresolved-handler", `${ex.name}: ${ex.why ?? "not a function"}; a route handler here must be a function whose first await is its seam`);
        continue;
      }
      const fn = ex.fn;
      const item = { ...ex, fn };
      if (isRoute && handler && (f.startsWith("src/app/api/public/") || f.startsWith("src/app/s/"))) {
        if (this.reach(fn, "order-lead-insert", (x) => this.opsIn(x).some((o) => (o.table === "orders" || o.table === "leads") && (o.method === "insert" || o.method === "raw-insert"))) && !this.reach(fn, "test-token", (x) => this.matches(x, this.cfg.testToken)))
          this.report(ex.at, "L12", "test-token", `${ex.name} creates an order or lead without resolveTestToken() (D54)`);
      }
      if (handler && f.startsWith("src/app/api/app/[store]/")) this.checkFirstAwait(item, F.seam, "storeGuard");
      else if (handler && f.startsWith("src/app/api/admin/")) this.checkFirstAwait(item, F.platformSeam, "platformGuard");
      else if (handler && f.startsWith("src/app/api/public/")) {
        const hit = this.firstTouch(fn, "public", (c) => this.isRef(c, this.cfg.publicResolvers));
        if (hit && hit !== "resolved") this.report(hit, "L13", "public-resolver", `${ex.name}: a tenant-table call before a public resolver (resolvePublicTarget / resolveStoreByHandle / …)`);
      } else if (f.startsWith("src/app/s/[store]/")) {
        const hit = this.firstTouch(fn, "handle", (c) => this.isCall(c, F.publicResolvers, "resolveStoreByHandle") && this.isParamsStore(c.arguments[0]));
        if (hit && hit !== "resolved") this.report(hit, "L13", "store-handle", `${ex.name}: a tenant-table call before resolveStoreByHandle(params.store)`);
      }
    }
  }

  private checkActionBody(fn: FnLike, at: ts.Node, inline: boolean, exportName?: string): void {
    if (this.l9Checked.has(fn) || !fn.body) return;
    this.l9Checked.add(fn);
    const name = fnName(fn);
    const allowedAction = this.cfg.actions.find((a) => a.file === this.relFile && (a.symbol === name || a.symbol === exportName));
    if (allowedAction) {
      this.usedAllow.add(allowedAction);
      return;
    }

    const isSeamCall = (x: ts.Expression) => {
      if (!ts.isCallExpression(x)) return false;
      const r = this.calleeRef(x);
      return !!r && SEAM_ACTIONS[r.name] === r.file;
    };
    // `return storeAction(…).then(answer)` (R1.0, T4 merge): the seam call still opens the body and only its answer is
    // reshaped, by a function named in the file (an identifier, never an inline callback that could do more work)
    const isSeam = (e: ts.Expression | undefined) => {
      if (!e) return false;
      const x = unwrap(e);
      if (isSeamCall(x)) return true;
      return (
        ts.isCallExpression(x) &&
        ts.isPropertyAccessExpression(x.expression) &&
        x.expression.name.text === "then" &&
        x.arguments.length === 1 &&
        ts.isIdentifier(x.arguments[0]!) &&
        isSeamCall(unwrap(x.expression.expression))
      );
    };
    let ok: boolean;
    if (!ts.isBlock(fn.body)) ok = isSeam(fn.body);
    else {
      const first = fn.body.statements[inline ? 1 : 0];
      ok = !!first && ts.isReturnStatement(first) && isSeam(first.expression);
    }
    if (!ok) this.report(at, "L9", "action-body", `${fnName(fn) ?? "server action"}: the body must start with return storeAction( / platformAction( / userAction( / publicAction( (AUTH-31)`);
  }

  private isParamsish(e: ts.Expression): boolean {
    const x = unwrap(e);
    return (ts.isIdentifier(x) && x.text === "params") || (ts.isPropertyAccessExpression(x) && x.name.text === "params");
  }

  /** `params.store`, `(await ctx.params).store`, or a `store` destructured from (await) params */
  private isParamsStore(e: ts.Expression | undefined): boolean {
    if (!e) return false;
    const x = unwrap(e);
    const fromParams = (init: ts.Expression | undefined) => {
      if (!init) return false;
      const i = unwrap(init);
      return this.isParamsish(ts.isAwaitExpression(i) ? i.expression : i);
    };
    if (ts.isPropertyAccessExpression(x) && x.name.text === "store") {
      const o = unwrap(x.expression);
      if (this.isParamsish(ts.isAwaitExpression(o) ? o.expression : o)) return true;
      if (ts.isIdentifier(o)) {
        const d = this.checker.getSymbolAtLocation(o)?.valueDeclaration;
        return !!d && ts.isVariableDeclaration(d) && fromParams(d.initializer);
      }
      return false;
    }
    if (ts.isIdentifier(x)) {
      const d = this.checker.getSymbolAtLocation(x)?.valueDeclaration;
      if (!d || !ts.isBindingElement(d) || ((d.propertyName ?? d.name) as ts.Identifier).text !== "store") return false;
      const decl = d.parent.parent;
      return ts.isVariableDeclaration(decl) && fromParams(decl.initializer);
    }
    return false;
  }

  /** L13: the first awaited expression (after awaiting params) must be the guard, called with the request (and the handle) */
  private checkFirstAwait(ex: { name: string; fn: FnLike; at: ts.Node }, file: string, guard: "storeGuard" | "platformGuard"): void {
    const body = ex.fn.body;
    if (!body) return;
    let first: ts.AwaitExpression | null = null;
    const walk = (n: ts.Node) => {
      if (first || (n !== ex.fn && isFnLike(n))) return;
      if (ts.isAwaitExpression(n) && !this.isParamsish(n.expression)) {
        first = n;
        return;
      }
      ts.forEachChild(n, walk);
    };
    walk(body);
    const req = ex.fn.parameters[0]?.name;
    const call = first ? unwrap((first as ts.AwaitExpression).expression) : null;
    const ok =
      !!call &&
      ts.isCallExpression(call) &&
      this.isCall(call, file, guard) &&
      !!req &&
      ts.isIdentifier(req) &&
      !!call.arguments[0] &&
      ts.isIdentifier(unwrap(call.arguments[0])) &&
      (unwrap(call.arguments[0]) as ts.Identifier).text === req.text &&
      (guard === "platformGuard" || this.isParamsStore(call.arguments[1]));
    if (!ok)
      this.report(first ?? ex.at, "L13", guard === "storeGuard" ? "store-guard" : "platform-guard", `${ex.name}: the first awaited statement must be ${guard}(req, ${guard === "storeGuard" ? "params.store, " : ""}…)`);
  }

  /* ---------------- the call graph (L12, L13) ---------------- */

  private matches(fn: FnLike, refs: readonly FnRef[]): boolean {
    const name = fnName(fn);
    const file = rel(fn.getSourceFile().fileName);
    return !!name && refs.some((r) => r.name === name && r.file === file);
  }

  private resolveTarget(e: ts.Expression): FnLike | null {
    const x = unwrap(e);
    if (!ts.isIdentifier(x) && !ts.isPropertyAccessExpression(x)) return null;
    // const aliases are followed (`const fn = touchOrders; await fn()`, review C0b F12)
    const decls = (this.symbolOf(x)?.declarations ?? []).filter((d) => rel(d.getSourceFile().fileName).startsWith("src/"));
    const fn = fnOfDecls(decls, this.checker, 0);
    return fn?.body && rel(fn.getSourceFile().fileName).startsWith("src/") ? fn : null;
  }

  /** functions called (or passed as a callback) inside `fn`, nested functions included */
  private targets(fn: FnLike): FnLike[] {
    let hit = this.targetsMemo.get(fn);
    if (hit) return hit;
    const out = new Set<FnLike>();
    const walk = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const t = this.resolveTarget(n.expression);
        if (t) out.add(t);
        for (const a of n.arguments) {
          const cb = ts.isIdentifier(a) || ts.isPropertyAccessExpression(a) ? this.resolveTarget(a) : null;
          if (cb) out.add(cb);
        }
      }
      ts.forEachChild(n, walk);
    };
    if (fn.body) walk(fn.body);
    hit = [...out];
    this.targetsMemo.set(fn, hit);
    return hit;
  }

  private opsIn(fn: FnLike): TenantOp[] {
    const body = fn.body;
    if (!body) return [];
    return (this.ops.get(fn.getSourceFile()) ?? []).filter((o) => o.pos >= body.pos && o.pos < body.end);
  }

  /** does `fn` reach a function `direct` accepts (itself included), through the call graph? */
  private reach(fn: FnLike, key: string, direct: (fn: FnLike) => boolean): boolean {
    let memo = this.reachMemo.get(key);
    if (!memo) this.reachMemo.set(key, (memo = new Map()));
    const hit = memo.get(fn);
    if (hit !== undefined) return hit;
    memo.set(fn, false); // a cycle answers "no" while in progress
    const result = direct(fn) || this.targets(fn).some((t) => this.reach(t, key, direct));
    memo.set(fn, result);
    return result;
  }

  /** does `fn` reach a tenant-table call, not counting the sanctioned pre-resolution platform reads (L13)? */
  private reachesTenant(fn: FnLike, seen: Set<FnLike> = new Set()): boolean {
    const memo = this.reachMemo.get("tenant-l13") ?? new Map<FnLike, boolean>();
    this.reachMemo.set("tenant-l13", memo);
    const hit = memo.get(fn);
    if (hit !== undefined) return hit;
    if (seen.has(fn) || this.matches(fn, this.cfg.preResolveReads)) return false; // a cycle answers "no" while in progress
    seen.add(fn);
    const result = this.opsIn(fn).length > 0 || this.targets(fn).some((t) => this.reachesTenant(t, seen));
    memo.set(fn, result);
    return result;
  }

  /**
   * L13 public / store pages: walk `fn`'s calls in source order; a resolver (or a function that resolves first) ends
   * the walk clean, a direct tenant-table call or a call that reaches one is the violation.
   */
  private firstTouch(fn: FnLike, key: string, isResolver: (c: ts.CallExpression) => boolean): ts.Node | "resolved" | null {
    if (!fn.body) return null;
    const ops = new Set(this.opsIn(fn).map((o) => o.node));
    const events: ts.Node[] = [];
    const walk = (n: ts.Node) => {
      if (ts.isCallExpression(n) || ops.has(n)) events.push(n);
      ts.forEachChild(n, walk);
    };
    walk(fn.body);
    events.sort((a, b) => a.getStart() - b.getStart());
    for (const ev of events) {
      if (ts.isCallExpression(ev)) {
        if (isResolver(ev)) return "resolved";
        if (ops.has(ev)) return ev;
        const t = this.resolveTarget(ev.expression);
        if (t && this.matches(t, this.cfg.preResolveReads)) continue;
        if (t && this.resolvesFirst(t, key, isResolver)) return "resolved";
        if (t && this.reachesTenant(t)) return ev;
      } else return ev;
    }
    return null;
  }

  /** does `fn` pass a resolver before it touches a tenant table? (memoised per key; a cycle answers "no") */
  private resolvesFirst(fn: FnLike, key: string, isResolver: (c: ts.CallExpression) => boolean): boolean {
    let memo = this.reachMemo.get(`first:${key}`);
    if (!memo) this.reachMemo.set(`first:${key}`, (memo = new Map()));
    const hit = memo.get(fn);
    if (hit !== undefined) return hit;
    memo.set(fn, false);
    const result = this.firstTouch(fn, key, isResolver) === "resolved";
    memo.set(fn, result);
    return result;
  }

  /* ---------------- PIN ---------------- */

  private pinOf(file: string): Pin | undefined {
    return this.cfg.pins.find((p) => under(file, p.files.map((g) => (g.endsWith("/**") ? g.slice(0, -2) : g))));
  }

  /** PIN counts the queries `tenancy: platform` exempts (a builder chain, one raw SQL text), not comment lines (review C0b F7) */
  private checkPins(): void {
    const groups = new Map<Pin, ExemptUnit[]>();
    for (const u of this.exemptUnits.values()) {
      const pin = this.pinOf(u.file);
      if (pin) groups.set(pin, [...(groups.get(pin) ?? []), u]);
    }
    for (const [pin, list] of groups) {
      if (list.length <= pin.max) continue;
      list.sort((x, y) => (x.file === y.file ? x.pos - y.pos : x.file < y.file ? -1 : 1));
      const u = list[pin.max];
      this.violations.push({ file: u.file, line: u.annotationLine, rule: "PIN", kind: "pin", message: `${list.length} queries exempted by "tenancy: platform" in ${pin.files.join(" + ")}, pinned at ${pin.max} (${pin.reason})` });
    }
  }

  pinCounts(): { pin: Pin; count: number }[] {
    const units = [...this.exemptUnits.values()];
    return this.cfg.pins.map((pin) => ({ pin, count: units.filter((u) => this.pinOf(u.file) === pin).length }));
  }

  /** exempted queries per file (for the baseline record) */
  exemptCounts(): Map<string, number> {
    const out = new Map<string, number>();
    for (const u of this.exemptUnits.values()) out.set(u.file, (out.get(u.file) ?? 0) + 1);
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* self-check fixtures                                                 */
/* ------------------------------------------------------------------ */

/**
 * Virtual files compiled into the same program. A `//! <rules>` marker lists the rules that must fire on that line;
 * a line without a marker must stay clean. Fixture paths sit under the real trees whose path rules they exercise.
 */
const FX = "__tenancy_lint_fixture__";
const FIXTURES: Record<string, string> = {
  [`src/lib/${FX}/repo.ts`]: `
import { and, eq, or, sql, type SQL } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "@/lib/db/client";
import * as schemaNs from "@/lib/db/schema";
import { orders, pages, plans, storeMembers } from "@/lib/db/schema";
import { byId, inStore, storeSql, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, ReadScope, StoreCtx, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";

export async function good(scope: StoreScope, id: string) {
  await db.select().from(pages).where(whereStore(pages, scope, eq(pages.id, id)));
  await db.select().from(pages).where(and(eq(pages.status, "draft"), inStore(pages, scope)));
  await db.select().from(pages).where(byId(pages, scope, id));
  await db.select().from(plans);
  const cond = inStore(pages, scope);
  return db.select().from(pages).where(cond);
}
export async function goodWrite(scope: WriteScope, id: string) {
  await db.insert(pages).values(storeValues(scope, { id }) as never);
  await db.update(pages).set({ name: "x" }).where(byId(pages, scope, id));
  await db.delete(pages).where(inStore(pages, scope));
  await db.transaction(async (tx) => tx.delete(orders).where(inStore(orders, scope)));
}
export async function noScope(id: string) {
  await db.select().from(pages).where(eq(pages.id, id)); //! L1 L2
  await db.select().from(orders).innerJoin(pages, eq(pages.id, orders.pageId)); //! L1 L1 L2
}
declare const otherScope: StoreScope;
export async function weakPredicates(scope: StoreScope, input: { storeId: string }) {
  await db.select().from(pages).where(eq(pages.storeId, input.storeId)); //! L2 L2b
  await db.select().from(pages).where(or(inStore(pages, scope), eq(pages.id, "x"))); //! L2
  await db.select().from(pages).where(sql\`\${storeSql(otherScope)} AND 1\`); //! L2
  await db.select().from(pages).where(sql\`\${storeSql(scope)} OR 1\`); //! L2
  const local = scope;
  await db.select().from(pages).where(inStore(pages, local)); //! L2
  await db.select().from(pages).where(eq(pages.storeId, scope.storeId)); //! L2
  await db.select().from(pages).where(and(inStore(pages, scope), eq(pages.storeId, scope.storeId), eq(pages.id, orders.pageId), eq(pages.storeId, orders.storeId)));
  await db.select().from(pages).where(and(inStore(pages, scope), eq(pages.storeId, input.storeId))); //! L2b
}
export async function readOnlyWrites(scope: ReadScope, id: string) {
  await db.update(pages).set({ name: id }).where(inStore(pages, scope)); //! L6
  await db.delete(pages).where(inStore(pages, scope)); //! L6
}
// review C0b F8: the scope a write uses must be the WriteScope, not any scope parameter of the function
export async function copyPage(dst: WriteScope, src: ReadScope, id: string) {
  await db.update(pages).set({ name: id }).where(inStore(pages, src)); //! L6
  await db.insert(pages).values(storeValues(src, { id }) as never); //! L6
  await db.insert(pages).values(storeValues(dst, { id }) as never);
}
// review C0b F1: a spread copies the symbol-keyed brand, so these forge a scope with no cast to WriteScope
export function forge(scope: StoreScope, ctx: StoreCtx, id: string) {
  const other = { ...scope, storeId: id }; //! L6
  const upgraded: WriteScope = { ...scope, kind: "member" as const }; //! L6
  const wctx: StoreCtx<WriteScope> = { ...ctx, scope: { ...ctx.scope, kind: "member" as const } }; //! L6 L6
  const fake = { storeId: id, kind: "member" } as unknown as StoreScope; //! L6
  const copied = Object.assign({}, scope); //! L6
  const cloned = structuredClone(scope); //! L6
  return [other, upgraded, wctx, fake, copied, cloned];
}
export function downcast(ctx: StoreCtx | PlatformCtx, maybe: StoreScope | null) {
  return [(ctx as StoreCtx).scope, maybe as StoreScope, { ...ctx }]; //! L6
}
async function listPagesFx(scope: StoreScope) {
  return db.select().from(pages).where(inStore(pages, scope));
}
export async function forgeCall(scope: StoreScope, input: { storeId: string }) {
  return listPagesFx({ ...scope, storeId: input.storeId }); //! L6
}
// review C0b F2: storeSql() inside a larger template only as the first conjunct
export async function templates(scope: StoreScope, from: string, extra: SQL, name: string) {
  await db.select().from(pages).where(sql\`NOT \${storeSql(scope)}\`); //! L2
  await db.select().from(pages).where(sql\`\${storeSql(scope)} || 1\`); //! L2
  await db.select().from(pages).where(sql\`\${storeSql(scope)} XOR 1\`); //! L2
  await db.select().from(pages).where(sql\`(\${storeSql(scope)}) IS NOT NULL\`); //! L2
  await db.select().from(pages).where(sql\`\${storeSql(scope)} \${sql.raw("OR 1 = 1")}\`); //! L2
  await db.select().from(pages).where(sql\`\${storeSql(scope)} AND \${extra}\`); //! L2
  await db.select().from(pages).where(sql\`\${storeSql(scope)} AND slug >= \${from}\`);
  await db.select().from(pages).where(sql\`\${storeSql(scope)} AND (\${extra})\`);
  await db.select().from(pages).where(and(inStore(pages, scope), extra)); //! L2
  await db.select().from(pages).where(and(inStore(pages, scope), sql\`\${pages.slug} = \${name}\`, or(eq(pages.id, name), eq(pages.slug, name))));
  await db.select().from(pages).where(whereStore(pages, scope, extra));
}
// review C0b F3: drizzle keeps the last .where(), so a $dynamic() chain may not drop or escape the predicate
export async function dynamicWhere(scope: WriteScope, id: string) {
  await db.select().from(pages).$dynamic().where(inStore(pages, scope)).where(eq(pages.id, id)); //! L2
  await db.update(pages).set({ name: id }).$dynamic().where(inStore(pages, scope)).where(eq(pages.id, id)); //! L2
  await db.select().from(pages).$dynamic().where(inStore(pages, scope));
  return db.select().from(pages).$dynamic().where(inStore(pages, scope));
}
export function dynamicEscape(scope: StoreScope) {
  return db.select().from(pages).$dynamic().where(inStore(pages, scope)); //! L2
}
// review C0b F4: a patch typed with storeId, or a spread after storeId, can move a row to another store
export async function patches(scope: WriteScope, id: string, patch: Partial<typeof pages.$inferInsert>) {
  await db.insert(pages).values({ storeId: scope.storeId, ...patch } as never); //! L3
  await db.update(pages).set(patch).where(byId(pages, scope, id)); //! L3b
  await db.update(pages).set({ ...patch }).where(byId(pages, scope, id)); //! L3b
  await db.insert(pages).values(storeValues(scope, { id }) as never).onDuplicateKeyUpdate({ set: patch }); //! L3b
  await db.insert(pages).values({ ...patch, storeId: scope.storeId } as never);
  await db.update(pages).set({ name: id, updatedAt: new Date() }).where(byId(pages, scope, id));
}
// review C0b F6: tables reached through a helper, a let, a ternary, an index, a destructuring or a typed parameter
const tbl = () => pages;
const TABLES = { pages, orders };
const { leads: L } = schemaNs;
export async function selectAll<T extends MySqlTable>(t: T) {
  return db.select().from(t); //! L1
}
export async function tables(scope: StoreScope, f: boolean, name: "pages" | "orders", p: typeof pages) {
  await db.select().from(tbl()).where(eq(pages.id, "x")); //! L2
  let lt = pages;
  lt = f ? lt : pages;
  await db.select().from(lt).where(eq(pages.id, "x")); //! L2
  await db.select().from(f ? pages : orders).where(eq(pages.id, "x")); //! L2
  await db.select().from(TABLES[name]).where(eq(pages.id, "x")); //! L2
  await db.select().from(L).where(eq(L.id, "x")); //! L2
  await db.select().from(p).where(eq(p.id, "x")); //! L2
  await db.select().from(sql\`orders\`); //! L1
  return selectAll(orders); //! L1
}
// review C0b F15: ctx-taking repositories (D71 rev 4) and a destructured scope are scope parameters
export async function ctxWrites(ctx: WriteCtx, id: string) {
  await db.insert(pages).values(storeValues(ctx.scope, { id }) as never);
  return db.select().from(pages).where(byId(pages, ctx.scope, id));
}
export async function destructured({ scope }: { scope: StoreScope }, id: string) {
  return db.select().from(pages).where(byId(pages, scope, id));
}
export async function destructuredLocal(ctx: StoreCtx, id: string) {
  const { scope } = ctx;
  return db.select().from(pages).where(byId(pages, scope, id));
}
// review C0b F5: raw SQL anywhere, judged per query level
async function runSql(q: string) {
  return q;
}
export async function rawProbes(conn: { query(q: string): Promise<unknown> }, name: string, scope: StoreScope) {
  await db.execute(sql.raw("DELETE FROM orders WHERE id = 'x'")); //! L10
  const Q = "DELETE FROM leads WHERE id = 'x'"; //! L10
  await conn.query(Q);
  await runSql("SELECT id FROM pages WHERE slug = 'x'"); //! L10
  await conn.query("SELECT u.id FROM users u, orders o WHERE u.id = o.created_by"); //! L10
  await conn.query("TRUNCATE TABLE orders"); //! L10
  await conn.query("INSERT pages (id, slug) VALUES (?, ?)"); //! L10
  await conn.query("SELECT id FROM cod_storegen.orders WHERE id = ?"); //! L10
  await db.execute(sql\`SELECT id FROM \${sql.identifier("pages")} WHERE id = 'x'\`); //! L10
  await db.execute(sql\`SELECT id FROM \${sql.raw(name)} WHERE id = 'x'\`); //! L10
  await conn.query("UPDATE pages SET store_id = 'B' WHERE store_id = 'A' AND id = 'x'"); //! L10
  await conn.query("SELECT id FROM pages WHERE id = 'x' OR store_id = 'A'"); //! L10
  await conn.query("DELETE FROM pages WHERE id IN (SELECT page_id FROM orders WHERE store_id = 'A')"); //! L10
  await conn.query("SELECT id FROM orders " + name + " WHERE store_id = ?"); //! L10
  await conn.query("SELECT id FROM orders WHERE store_id = ?");
  await conn.query("SELECT o.id FROM orders o JOIN pages p ON p.id = o.page_id WHERE o.store_id = ? AND p.status = 'x'");
  await conn.query("INSERT INTO orders (store_id, id) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = VALUES(id)");
  await conn.query("SELECT id FROM orders WHERE store_id = ? AND created_at BETWEEN ? AND ? FOR UPDATE");
  await db.execute(sql\`SELECT id FROM orders WHERE \${storeSql(scope)} AND id IN (SELECT order_id FROM leads WHERE \${storeSql(scope)})\`);
}
export async function badInserts(scope: WriteScope, id: string) {
  await db.insert(pages).values({ id } as never); //! L3
  await db.insert(pages).values({ id, storeId: scope.storeId } as never);
  await db.update(pages).set({ storeId: id }).where(inStore(pages, scope)); //! L3b
}
export function cast(s: StoreScope) {
  const w = s as WriteScope; //! L6
  const x = s as unknown as WriteScope; //! L6
  return [w, x];
}
export function isWrite(s: StoreScope): s is WriteScope { //! L6
  return s.kind === "member";
}
export async function rawSql(scope: StoreScope) {
  await db.execute(sql\`SELECT id FROM pages WHERE slug = 'x'\`); //! L10
  await db.execute(sql\`SELECT id FROM pages WHERE \${storeSql(scope)} AND slug = 'x'\`);
  await db.execute(sql\`UPDATE stats_daily SET views = 0 /* store_id = */ WHERE page_id = 'x'\`); //! L10
  await db.execute(sql\`DELETE FROM \${orders} WHERE \${orders.storeId} = \${scope.storeId}\`);
  await db.execute(sql\`SELECT 1 FROM plans\`);
}
export async function members() {
  return db.select().from(storeMembers).where(eq(storeMembers.userId, "u")); //! L1 L2
}
export async function relational(scope: StoreScope) {
  await db.query.pages.findFirst({ where: inStore(pages, scope) });
  await db.query.pages.findMany({ columns: { id: true } }); //! L2
  return db.query.plans.findMany();
}
export async function relationalNoScope() {
  return db.query.orders.findMany({ where: eq(orders.id, "x") }); //! L1 L2
}
`,
  // P0b review F-3: the reveal site's twin (isRevealSite): the scope goes into app calls only and never out of the file
  [`src/lib/orders/${FX}/profile.ts`]: `
import { platformRevealScope } from "@/lib/platform/seam";
import type { PlatformCtx, StoreScope, WriteScope } from "@/lib/tenancy/types";

type ConsoleScope = StoreScope & { readonly kind: "platform" };
async function writeEvent(scope: WriteScope, orderId: string): Promise<void> {
  void scope;
  void orderId;
}
export async function goodReveal(ctx: PlatformCtx, scope: ConsoleScope) {
  await writeEvent(platformRevealScope(ctx, scope), "o1");
  const w = platformRevealScope(ctx, scope);
  await writeEvent(w, "o2");
  await writeEvent((w), "o3");
  return null;
}
export async function leaks(ctx: PlatformCtx, scope: ConsoleScope) { //! L6
  const w = platformRevealScope(ctx, scope);
  const kept: WriteScope[] = [];
  kept.push(w); //! L6
  const box = { w }; //! L6
  void [kept, box];
  return w; //! L6
}
export function direct(ctx: PlatformCtx, scope: ConsoleScope) { return platformRevealScope(ctx, scope); } //! L6 L6
export function later(ctx: PlatformCtx, scope: ConsoleScope) {
  let v = platformRevealScope(ctx, scope); //! L6
  v = platformRevealScope(ctx, scope); //! L6
  void v;
}
`,
  [`src/lib/platform/${FX}/console.ts`]: `
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { storeMembers } from "@/lib/db/schema";
import { platformRevealScope, platformScope, platformScope as ps } from "@/lib/platform/seam";
import * as seamNs from "@/lib/platform/seam";
import { mintScope } from "@/lib/tenancy/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";

export async function crossStore(ctx: PlatformCtx) {
  // tenancy: platform console member list across stores
  const rows = await db.select().from(storeMembers).where(eq(storeMembers.userId, "u"));
  const trailing = await db
    .select()
    .from(storeMembers) // tenancy: platform a trailing annotation on one of the statement's lines
    .where(eq(storeMembers.userId, "t"));
  const one = platformScope(ctx, "01ARZ3NDEKTSV4RRFFQ69G5FAV");
  const minted = mintScope("member", "01ARZ3NDEKTSV4RRFFQ69G5FAV"); //! L6
  const revealed = platformRevealScope(ctx, one); //! L6
  // P0b review F-3: an alias hides the call from the callee check, so the alias itself is the finding
  const alias = platformRevealScope; //! L6
  const aliased = alias(ctx, one);
  const viaNs = seamNs.platformRevealScope; //! L6
  const scopes = [platformScope, mintScope].length; //! L6 L6
  const shorthand = { platformScope }; //! L6
  const renamed = ps; //! L6
  const called = ps(ctx, "01ARZ3NDEKTSV4RRFFQ69G5FAV");
  type RevealFn = typeof platformRevealScope;
  const typed: RevealFn | null = null;
  return [rows, trailing, one, minted, revealed, aliased, viaNs, scopes, shorthand, renamed, called, typed, seamNs.platformScope(ctx, "01ARZ3NDEKTSV4RRFFQ69G5FAV")];
}
export async function second() {
  // tenancy: platform second annotation over the fixture pin //! PIN
  return db.select().from(storeMembers).where(eq(storeMembers.role, "owner"));
}
`,
  [`src/lib/${FX}/cache.ts`]: `
import { platformScope } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { rateLimit, type Bucket } from "@/lib/security/rate-limit";
import { getSetting } from "@/lib/settings";

declare global {
  var __codFixtureCache: Map<string, string> | undefined; //! L4
  var __sgFixtureAllowed: number | undefined;
}
const CACHE = new Map<string, number>(); //! L4
export const ALLOWED = new Set(["a"]);
const FROZEN = new Set(["a", "b"]);
const TYPED: ReadonlyMap<string, number> = new Map([["a", 1]]);
export const SHARED = new Set(["x"]);
const GROWS = new Set<string>(); //! L4
export const ESCAPES = new Map<string, number>(); //! L4
const ROLES: Record<string, ReadonlySet<string>> = { a: new Set(["x"]) };
const PICK_A = new Set(["a"]);
const PICK_B = new Set(["b"]);
const PASSED = new Set(["p"]);
const takes = (s: ReadonlySet<string>) => s.size;
export function reads(x: string, f: boolean) {
  GROWS.add(x);
  const picked = f ? PICK_A : (PICK_B ?? PICK_A);
  for (const v of FROZEN) if (v === x) return [...FROZEN, TYPED.get(x), Array.from(SHARED), ROLES.a, picked.has(x), takes(PASSED)];
  return [ESCAPES];
}
const g = globalThis as unknown as { __codFixtureCast?: number }; //! L4
export function inFunction(ctx: PlatformCtx) {
  const local = new Map<string, number>();
  return [local, CACHE, g, platformScope(ctx, "x")]; //! L6
}
export class Holder {
  items = new Set<string>();
  static shared = new Map<string, string>(); //! L4
}
export async function legacy(storeId: string) {
  await rateLimit("api:order:x", 1, 1); //! L5
  const lock = "SELECT GET_LOCK('cod:x', 1)"; //! L5
  await rateLimit(\`s:\${storeId}:orders\` as Bucket, 1, 1); //! L5
  const rl = rateLimit; //! L5
  await rl("p:x", 1, 1);
  return [lock, await getSetting("store")]; //! L3
}
// review C0b F9: state created lazily inside a function, a static block or an IIFE, and globals behind any cast
let lazy: Map<string, number> | undefined;
export function getLazy() { lazy ??= new Map(); return lazy; } //! L4
let lazySet: Set<string> | undefined;
export function getSet() { if (!lazySet) lazySet = new Set(); return lazySet; } //! L4
export const IIFE = (() => { const m = new Map<string, number>(); m.set("a", 1); return m; })(); //! L4
export const FROZEN_IIFE: ReadonlyMap<string, number> = (() => { const m = new Map<string, number>(); m.set("a", 1); return m; })();
export function grow() { IIFE.set("b", 2); return FROZEN_IIFE.get("a"); }
export class Statics {
  static c: Map<string, number>;
  static {
    Statics.c = new Map(); //! L4
  }
}
export function anyGlobal() {
  (globalThis as any).__codFixtureAny ??= new Map(); //! L4 L4
}
export const gt: { __codFixtureTyped?: Map<string, number> } = globalThis as never; //! L4
(globalThis as Record<string, unknown>)["__sgFixtureIndex"] = new Map(); //! L4 L4
export function local() {
  const m = new Map<string, number>();
  const s = (() => new Set<string>())();
  return [m, s];
}
`,
  [`src/lib/${FX}/frozen-a.ts`]: `
export const SEEN = new Set<string>(); //! L4
export const READ_ONLY = new Set<string>(["a"]);
`,
  [`src/lib/${FX}/frozen-b.ts`]: `
import { READ_ONLY as R, SEEN as S } from "@/lib/${FX}/frozen-a";
export function mark(k: string) {
  S.add(k);
  return R.has(k);
}
`,
  [`src/lib/jobs/${FX}/repo.ts`]: `
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages, storeMembers } from "@/lib/db/schema";
// review C0b F7: an annotation exempts only the query it leads or sits on, never a sibling in the same statement
export const repo = {
  leak: async (id: string) => db.select().from(pages).where(eq(pages.id, id)), //! L1 L2
  other: async () => {
    // tenancy: platform a job-runner read in another member of the same statement
    return db.select().from(storeMembers).where(eq(storeMembers.role, "owner"));
  },
  // tenancy: platform an expression-bodied member annotated on its own declaration
  annotated: async () => db.select().from(storeMembers).where(eq(storeMembers.role, "agent")),
};
export async function both() {
  // tenancy: platform one statement, two queries: two PIN units //! PIN
  return Promise.all([db.select().from(storeMembers).where(eq(storeMembers.role, "a")), db.select().from(storeMembers).where(eq(storeMembers.role, "b"))]);
}
`,
  [`src/lib/${FX}/barrel.ts`]: `
export { db } from "@/lib/db/client";
export * from "@/lib/db/schema";
`,
  [`src/lib/${FX}/tables.ts`]: `
export { pages as reexported } from "@/lib/db/schema";
export type { SignupBand as Band } from "@/lib/db/schema";
`,
  [`src/components/${FX}/barrel-user.tsx`]: `
import { db, pages } from "@/lib/${FX}/barrel"; //! L7
import { reexported } from "@/lib/${FX}/tables"; //! L7
import type { Band } from "@/lib/${FX}/tables";
export function Barrel({ band }: { band?: Band }) {
  return <i data-a={typeof db} data-b={typeof pages} data-c={typeof reexported} data-d={band} />;
}
`,
  [`src/lib/${FX}/handlers.ts`]: `
export async function DELETE(req: Request) {
  return new Response(req.url);
}
`,
  [`src/lib/${FX}/selftest.ts`]: `
import { SHARED } from "@/lib/${FX}/cache";
const seen = new Set<string>([...SHARED]);
seen.add("x");
console.log(new Set(seen).size);
`,
  [`src/components/${FX}/link.tsx`]: `
import { pages } from "@/lib/db/schema"; //! L7
import type { SignupBand } from "@/lib/db/schema"; //! L7
export function Links({ slug, band }: { slug: string; band?: SignupBand }) {
  const notAdmin = "/administrators";
  const live = \`/\${slug}\`; //! L8
  const joined = "/" + slug; //! L8
  return <a href="/admin/pages" data-k={String(pages)} data-p={band}>{live}{joined}{notAdmin}</a>; //! L8 L1
}
`,
  [`src/app/${FX}/actions.ts`]: `"use server";
import { storeAction } from "@/lib/tenancy/seam";
import { fixturePublish, fixtureGate } from "@/lib/${FX}/publish";

export async function good(id: string) {
  return storeAction("pages.edit", async () => id);
}
export async function bad(id: string) { //! L9
  const x = id.trim();
  return storeAction("pages.edit", async () => x);
}
export const arrow = async (id: string) => storeAction("pages.edit", async () => { await fixturePublish(); return id; }); //! L12
export async function gated(id: string) {
  return storeAction("pages.edit", async () => { await fixtureGate(); await fixturePublish(); return id; });
}
export async function allowedAction(id: string) {
  const x = id.trim(); // listed in the fixture allow file's actions: no L9
  return x;
}
const shape = (r: unknown) => r;
export async function reshaped(id: string) {
  return storeAction("pages.edit", async () => id).then(shape);
}
export async function reshapedInline(id: string) { //! L9
  return storeAction("pages.edit", async () => id).then((r) => r);
}
export async function thenOnOther(id: string) { //! L9
  return Promise.resolve(id).then(shape);
}
// review C0b F11: every export of a "use server" file is an action; what the lint cannot read fails closed
function makeAction() {
  return async () => 1;
}
const inner = async (id: string) => storeAction("pages.edit", async () => id);
export { fixtureGate as reexported } from "@/lib/${FX}/publish"; //! L9
export * from "@/lib/${FX}/publish"; //! L9
export const viaFactory = makeAction(); //! L9
export { inner as exposed };
export default inner;
export type { Exported } from "@/lib/${FX}/publish";
`,
  [`src/lib/${FX}/publish.ts`]: `
export async function fixturePublish(): Promise<void> {}
export async function fixtureGate(): Promise<void> {}
export type Exported = string;
`,
  [`src/app/${FX}/inline.tsx`]: `
import { storeAction } from "@/lib/tenancy/seam";
export default function Page() {
  async function save(form: FormData) { //! L9
    "use server";
    console.log(form);
  }
  async function ok(form: FormData) {
    "use server";
    return storeAction(null, async () => form.get("x"));
  }
  return [save, ok];
}
`,
  [`src/lib/${FX}/orders.ts`]: `
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { inStore, storeValues } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
export async function insertOrder(scope: WriteScope) {
  await db.insert(orders).values(storeValues(scope, {}) as never);
}
export async function touchOrders(scope: StoreScope) {
  return db.select().from(orders).where(inStore(orders, scope));
}
`,
  [`src/app/api/public/${FX}/order/route.ts`]: `
import { insertOrder, touchOrders } from "@/lib/${FX}/orders";
import { publicScope, resolvePublicTarget, resolveTestToken } from "@/lib/tenancy/public";
import { good } from "@/lib/${FX}/repo";
export async function DELETE(req: Request) {
  const fn = touchOrders; // review C0b F12: a const alias is followed
  await fn(null as never); //! L13
  return new Response(req.url);
}
export async function POST(req: Request) { //! L12
  const t = await resolvePublicTarget(req.url);
  if (!t) return new Response(null, { status: 404 });
  await insertOrder(publicScope(t.store));
  return new Response(null);
}
export async function PUT(req: Request) {
  const t = await resolvePublicTarget(req.url);
  if (!t) return new Response(null, { status: 404 });
  const test = resolveTestToken(t.store, null);
  await insertOrder(publicScope(t.store));
  return new Response(String(test.test));
}
export async function PATCH(req: Request) {
  await good(null as never, req.url); //! L13
  return new Response(null);
}
`,
  [`src/app/api/app/[store]/${FX}/route.ts`]: `
import { storeGuard } from "@/lib/tenancy/seam";
export async function GET(req: Request, ctx: { params: Promise<{ store: string }> }) {
  const { store } = await ctx.params;
  const g = await storeGuard(req, store, "pages.view");
  return g.ok ? new Response("ok") : g.response;
}
export async function POST(req: Request, ctx: { params: Promise<{ store: string }> }) {
  const body = await req.text(); //! L13
  const g = await storeGuard(req, (await ctx.params).store, "pages.edit");
  return g.ok ? new Response(body) : g.response;
}
// review C0b F12: a handler bound by name is followed; a call result or a re-export fails closed
const handler = async (req: Request) => new Response(req.url);
const wrap = <T,>(f: T): T => f;
export const PUT = handler; //! L13
export const PATCH = wrap(async (req: Request) => new Response(req.url)); //! L13
export { DELETE } from "@/lib/${FX}/handlers"; //! L13
export const dynamic = "force-dynamic";
`,
  [`src/app/api/admin/${FX}/route.ts`]: `
import { platformGuard } from "@/lib/platform/seam";
import { requireStoreMember } from "@/lib/tenancy/seam";
export async function GET(req: Request) {
  const g = await platformGuard(req, "console.read");
  return g.ok ? new Response("ok") : g.response;
}
export async function POST(req: Request) {
  const ctx = await requireStoreMember({ permission: "pages.view" }); //! L13 L13
  return new Response(ctx.store.id + req.url);
}
`,
};

const FIXTURE_CONFIG = (real: Config): Config => ({
  ...real,
  allow: [
    { file: `src/lib/${FX}/cache.ts`, symbol: "ALLOWED", reason: "fixture: an allow-listed module Set" },
    { file: `src/lib/${FX}/cache.ts`, symbol: "__sgFixtureAllowed", reason: "fixture: an allow-listed global" },
  ],
  actions: [{ file: `src/app/${FX}/actions.ts`, symbol: "allowedAction", reason: "fixture: an allow-listed action body" }],
  pins: [
    { files: [`src/lib/platform/${FX}/**`], max: 2, reason: "fixture pin" },
    { files: [`src/lib/jobs/${FX}/**`], max: 3, reason: "fixture pin: queries, not comment lines" },
  ],
  publishSinks: [{ file: `src/lib/${FX}/publish.ts`, name: "fixturePublish" }],
  prePublishGates: [{ file: `src/lib/${FX}/publish.ts`, name: "fixtureGate" }],
});

function expectedFromMarkers(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [file, text] of Object.entries(FIXTURES)) {
    text.split("\n").forEach((line, i) => {
      const m = /\/\/!\s*([A-Z0-9 b]+)$/.exec(line);
      if (m) out.set(`${file}:${i + 1}`, m[1].trim().split(/\s+/).sort());
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* program                                                             */
/* ------------------------------------------------------------------ */

function buildProgram(virtual: Map<string, string>): { program: ts.Program; host: ts.CompilerHost } {
  const parsed = ts.getParsedCommandLineOfConfigFile(`${ROOT}/tsconfig.json`, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
  if (!parsed) throw new Error("tenancy-lint: tsconfig.json could not be read");
  const options: ts.CompilerOptions = { ...parsed.options, noEmit: true, incremental: false, tsBuildInfoFile: undefined, plugins: undefined };
  const base = ts.createCompilerHost(options, true);
  const vkey = new Map([...virtual].map(([f, t]) => [fold(f), t]));
  const vdirs = new Set<string>();
  for (const f of vkey.keys()) for (let d = path.posix.dirname(f); d.length > ROOT.length; d = path.posix.dirname(d)) vdirs.add(d);
  const host: ts.CompilerHost = {
    ...base,
    fileExists: (f) => vkey.has(fold(f)) || base.fileExists(f),
    readFile: (f) => vkey.get(fold(f)) ?? base.readFile(f),
    directoryExists: (d) => vdirs.has(fold(d).replace(/\/$/, "")) || (base.directoryExists?.(d) ?? true),
    getSourceFile: (f, lang, onError, create) => {
      const text = vkey.get(fold(f));
      return text !== undefined ? ts.createSourceFile(f, text, lang, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) : base.getSourceFile(f, lang, onError, create);
    },
  };
  const src = ts.sys.readDirectory(`${ROOT}/src`, [".ts", ".tsx"], undefined, ["**/*"]).map(norm);
  const roots = [...src, ...virtual.keys(), `${ROOT}/next-env.d.ts`].filter((f) => vkey.has(fold(f)) || ts.sys.fileExists(f));
  return { program: ts.createProgram({ rootNames: roots, options, host }), host };
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

function main(): number {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const summary = args.includes("--summary");
  const ruleArg = args.find((a, i) => args[i - 1] === "--rule");
  const only = ruleArg ? new Set(ruleArg.split(",").map((r) => r.trim())) : null;
  const t0 = Date.now();
  const phases: [string, number][] = [];
  const mark = (name: string) => phases.push([name, Date.now()]);

  const allow = AllowFile.parse(JSON.parse(readFileSync(ALLOW_FILE, "utf8")));
  const cfg = REAL_CONFIG(allow);
  const tenant = tenantTablesFromSchema();
  const virtual = new Map(Object.entries(FIXTURES).map(([f, t]) => [`${ROOT}/${f}`, t]));
  const { program, host } = buildProgram(virtual);
  mark("program");
  const isFixture = (sf: ts.SourceFile) => rel(sf.fileName).includes(FX);
  const files = program.getSourceFiles().filter((sf) => !sf.isDeclarationFile && rel(sf.fileName).startsWith("src/"));

  // 1. self-check on the fixtures
  const self = new Lint(program, host, FIXTURE_CONFIG(cfg), tenant);
  self.run(files.filter(isFixture));
  mark("self-check");
  const got = new Map<string, string[]>();
  for (const v of self.violations) got.set(`${v.file}:${v.line}`, [...(got.get(`${v.file}:${v.line}`) ?? []), v.rule].sort());
  const want = expectedFromMarkers();
  const problems: string[] = [];
  for (const k of new Set([...want.keys(), ...got.keys()])) {
    const w = (want.get(k) ?? []).join(" ");
    const g = (got.get(k) ?? []).join(" ");
    if (w !== g) problems.push(`  ${k}: expected [${w}] got [${g}]${got.has(k) ? "  " + self.violations.filter((v) => `${v.file}:${v.line}` === k).map((v) => v.message).join(" | ") : ""}`);
  }
  for (const r of Object.keys(RULES)) if (![...want.values()].some((rs) => rs.includes(r))) problems.push(`  no fixture exercises ${r}`);
  if (problems.length) {
    console.error(`✗ tenancy-lint self-check failed (${problems.length}):\n${problems.join("\n")}`);
    return 2;
  }

  // 2. the real tree
  const lint = new Lint(program, host, cfg, tenant);
  lint.run(files.filter((sf) => !isFixture(sf)));
  mark("tree");
  if (args.includes("--timing")) {
    let prev = t0;
    for (const [name, at] of phases) {
      console.error(`  ${name.padEnd(11)}${((at - prev) / 1000).toFixed(1)} s`);
      prev = at;
    }
  }
  const violations = lint.violations
    .filter((v) => !only || only.has(v.rule))
    .sort((a, b) => (a.file === b.file ? a.line - b.line || a.rule.localeCompare(b.rule) : a.file < b.file ? -1 : 1));
  const byRule = new Map<RuleId, number>();
  const byKind = new Map<string, number>();
  const byFile = new Map<string, number>();
  for (const v of violations) {
    byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
    byKind.set(`${v.rule} ${v.kind}`, (byKind.get(`${v.rule} ${v.kind}`) ?? 0) + 1);
    byFile.set(v.file, (byFile.get(v.file) ?? 0) + 1);
  }
  const annotationsByDir = new Map<string, { platform: number; publicKey: number }>();
  for (const a of lint.annotations) {
    const d = path.posix.dirname(a.file);
    const c = annotationsByDir.get(d) ?? { platform: 0, publicKey: 0 };
    if (a.kind === "platform") c.platform++;
    else c.publicKey++;
    annotationsByDir.set(d, c);
  }
  const unused = lint.unusedAllowEntries();
  const ms = Date.now() - t0;

  if (json) {
    console.log(
      JSON.stringify(
        {
          violations,
          counts: Object.fromEntries((Object.keys(RULES) as RuleId[]).map((r) => [r, byRule.get(r) ?? 0])),
          kinds: Object.fromEntries([...byKind].sort()),
          annotations: Object.fromEntries([...annotationsByDir].sort()),
          pins: lint.pinCounts().map(({ pin, count }) => ({ files: pin.files, max: pin.max, count })),
          exempted: Object.fromEntries([...lint.exemptCounts()].sort()),
          unusedAllowEntries: unused,
          tenantTables: [...tenant.values()].sort(),
          files: files.length - virtual.size,
          ms,
        },
        null,
        2,
      ),
    );
    return violations.length ? 1 : 0;
  }

  if (!summary) for (const v of violations) console.log(`${v.file}:${v.line} ${v.rule} ${v.message}`);
  console.log("");
  console.log(`tenancy-lint: ${violations.length} violation(s) in ${byFile.size} file(s) · ${files.length - virtual.size} files · ${tenant.size} tenant tables · self-check ${Object.keys(FIXTURES).length} fixtures ok · ${(ms / 1000).toFixed(1)} s`);
  for (const r of Object.keys(RULES) as RuleId[]) {
    if (only && !only.has(r)) continue;
    console.log(`  ${r.padEnd(4)} ${String(byRule.get(r) ?? 0).padStart(5)}  ${RULES[r]}`);
    for (const [k, n] of [...byKind].filter(([k]) => k.startsWith(r + " ")).sort()) console.log(`  ${"".padEnd(4)} ${"".padStart(5)}    ${String(n).padStart(5)} ${k.slice(r.length + 1)}`);
  }
  console.log("  L11     -  arrives with R2's contract step");
  if (summary) {
    console.log("top files:");
    for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(5)} ${f}`);
  }
  console.log("annotations per directory (platform | public-key):");
  if (!annotationsByDir.size) console.log("  (none)");
  for (const [d, c] of [...annotationsByDir].sort()) console.log(`  ${d}: ${c.platform} | ${c.publicKey}`);
  console.log("pins (tenancy: platform):");
  for (const { pin, count } of lint.pinCounts()) console.log(`  ${pin.files.join(" + ")}: ${count}/${pin.max}`);
  for (const e of unused) console.log(`  ! unused allow entry: ${e.file} ${e.symbol}`);
  return violations.length ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (err) {
  console.error(`✗ tenancy-lint: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 2;
}
