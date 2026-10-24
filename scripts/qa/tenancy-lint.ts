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
 * pinned group holds more `tenancy: platform` annotations than its pin; "the count may only grow with a reviewer's
 * approval", §F.1).
 *
 * - Tenant tables = every mysqlTable of src/lib/db/schema.ts with a `store_id` column, read from the schema at run
 *   time (rev 3, ENGC-5), so a new table is covered the day it is added.
 * - The annotation exemption (§E.3 rule 6) needs both an allowlisted file and the annotation on the statement: in its
 *   leading comments or on one of its lines. It covers the statement-level rules (L1, L2, L2b, L3, L3b, L6, L10).
 * - An annotation is a `// tenancy:` comment on its own line before the statement or at the end of one of its lines.
 * - L9's only exemptions are the allow file's `actions` (file + exported name + reason, maintainer only, CCR r1.0-m-3).
 * - L2 takes only the four helpers (`eq(T.storeId, scope.storeId)` alone is not a store predicate, though not L2b).
 * - L4 judges process state, so it skips the standalone `selftest*.ts` scripts, and a module-scope Map / Set that the
 *   type checker proves is never changed after module load (a ReadonlySet / ReadonlyMap slot, or only ever read) is a
 *   lookup table, not a cache: it needs no allow entry (see `frozen`).
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
  L1: "tenant-table call in a function without a StoreScope parameter",
  L2: "select/update/delete whose .where() has no store predicate on a scope parameter",
  L2b: "eq(<table>.storeId, …) instead of inStore()/whereStore()/byId()",
  L3: "tenant insert without storeValues(), or a call to the removed settings API",
  L3b: ".set() on a tenant table names storeId",
  L4: "process-wide global or module-scope Map/Set outside scopedCache() and the allow file",
  L5: "rate bucket that is not a Bucket, or GET_LOCK outside src/lib/db",
  L6: "write without a WriteScope parameter, a cast to WriteScope, or a scope minted outside the seam",
  L7: "src/app or src/components imports the db client or schema",
  L8: "hand-built /admin path or live URL (use appHref / storeUrl)",
  L9: "server action whose body does not start with return storeAction/platformAction/userAction/publicAction(",
  L10: "raw SQL on a tenant table without store_id = / storeSql( in its WHERE or SET",
  L12: "publish path without runPrePublishChecks(), or a public order/lead handler without resolveTestToken()",
  L13: "route handler that does not pass its seam first",
  PIN: "more tenancy annotations than the allow file pins",
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
/** §E.3 rule 6: where `// tenancy: public-key <key>` exempts a statement */
const PUBLIC_KEY_FILES = ["src/lib/tenancy/public.ts", "src/lib/tenancy/invites.ts"];
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
  publicResolvers: ["resolvePublicTarget", "resolveStoreByHandle", "resolveOrderForTracking", "resolveKitShare", "resolveProductKey", "resolveContextKey"].map(
    (name) => ({ file: F.publicResolvers, name }),
  ),
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

/** the statement-list member that contains `n` (its annotation carrier) */
function enclosingStatement(n: ts.Node): ts.Node {
  let cur = n;
  while (cur.parent && !ts.isBlock(cur.parent) && !ts.isSourceFile(cur.parent) && !ts.isModuleBlock(cur.parent) && !ts.isCaseClause(cur.parent) && !ts.isDefaultClause(cur.parent))
    cur = cur.parent;
  return cur;
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

/** function-like initializer of a declaration (`const f = async () => …`, `{ f: function () {} }`) */
function fnInitializer(d: ts.Declaration): FnLike | null {
  if (isFnLike(d) && (d as FnLike).body) return d as FnLike;
  const init = ts.isVariableDeclaration(d) || ts.isPropertyAssignment(d) ? d.initializer : undefined;
  if (!init) return null;
  const e = unwrap(init);
  return ts.isArrowFunction(e) || ts.isFunctionExpression(e) ? e : null;
}

interface ExportedFn {
  name: string;
  fn: FnLike;
  at: ts.Node;
}

function exportedFunctions(sf: ts.SourceFile, checker: ts.TypeChecker): ExportedFn[] {
  const out: ExportedFn[] = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && s.body && hasModifier(s, ts.SyntaxKind.ExportKeyword)) {
      out.push({ name: hasModifier(s, ts.SyntaxKind.DefaultKeyword) ? "default" : (s.name?.text ?? "default"), fn: s, at: s.name ?? s });
    } else if (ts.isVariableStatement(s) && hasModifier(s, ts.SyntaxKind.ExportKeyword)) {
      for (const d of s.declarationList.declarations) {
        const fn = fnInitializer(d);
        if (fn && ts.isIdentifier(d.name)) out.push({ name: d.name.text, fn, at: d.name });
      }
    } else if (ts.isExportAssignment(s) && !s.isExportEquals) {
      const e = unwrap(s.expression);
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) out.push({ name: "default", fn: e, at: s });
    } else if (ts.isExportDeclaration(s) && !s.moduleSpecifier && s.exportClause && ts.isNamedExports(s.exportClause)) {
      for (const spec of s.exportClause.elements) {
        const sym = checker.getExportSpecifierLocalTargetSymbol(spec);
        const fn = sym?.declarations?.map(fnInitializer).find((x): x is FnLike => !!x);
        if (fn) out.push({ name: spec.name.text, fn, at: spec });
      }
    }
  }
  return out;
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
  private readonly scopeParamMemo = new Map<FnLike, ts.ParameterDeclaration[]>();
  private readonly l6Reported = new Set<FnLike>();
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

  /** the initializer of a `const` the identifier names, in the same file */
  private constInit(id: ts.Identifier): ts.Expression | null {
    const d = this.symbolOf(id)?.valueDeclaration;
    if (!d || !ts.isVariableDeclaration(d) || !d.initializer || !(ts.getCombinedNodeFlags(d) & ts.NodeFlags.Const)) return null;
    return d.getSourceFile() === id.getSourceFile() ? d.initializer : null;
  }

  /** parameters of `fn` typed StoreScope (or a narrower scope type); `any` never counts */
  private scopeParams(fn: FnLike): ts.ParameterDeclaration[] {
    let hit = this.scopeParamMemo.get(fn);
    if (!hit) {
      hit = fn.parameters.filter((p) => this.isScopeType(this.checker.getTypeAtLocation(p.name)));
      this.scopeParamMemo.set(fn, hit);
    }
    return hit;
  }

  /** an identifier bound to a StoreScope-typed parameter of a function enclosing `at` */
  private isScopeParamRef(e: ts.Expression | undefined, at: ts.Node): boolean {
    if (!e) return false;
    const x = unwrap(e);
    if (!ts.isIdentifier(x)) return false;
    const d = this.checker.getSymbolAtLocation(x)?.valueDeclaration;
    if (!d || !ts.isParameter(d) || !isFnLike(d.parent) || !isAncestor(d.parent, at)) return false;
    return this.scopeParams(d.parent).includes(d);
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

  /** the statement carries an annotation that its file is allowlisted for (§E.3 rule 6) */
  private exempt(node: ts.Node): boolean {
    const kinds: Annotation["kind"][] = [];
    if (under(this.relFile, PLATFORM_DIRS)) kinds.push("platform");
    if (under(this.relFile, PUBLIC_KEY_FILES)) kinds.push("public-key");
    if (!kinds.length) return false;
    const lines = this.annotationLines.get(this.file);
    if (!lines?.size) return false;
    const stmt = enclosingStatement(node);
    const sf = this.file;
    let from = lineOf(sf, stmt.getStart(sf));
    for (const c of ts.getLeadingCommentRanges(sf.text, stmt.pos) ?? []) from = Math.min(from, lineOf(sf, c.pos));
    const to = lineOf(sf, stmt.getEnd());
    for (const [line, kind] of lines) if (line >= from && line <= to && kinds.includes(kind)) return true;
    return false;
  }

  /* ---------------- the per-file walk ---------------- */

  run(files: readonly ts.SourceFile[]): void {
    for (const sf of files) this.collectAnnotations(sf);
    for (const sf of files) {
      this.file = sf;
      this.relFile = rel(sf.fileName);
      this.ops.set(sf, []);
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
    else if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && f !== F.seam) this.onCast(n);
    else if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier))
      this.onImport(n.moduleSpecifier.text, n, ts.isImportDeclaration(n) ? typeOnlyImport(n) : n.isTypeOnly);
    else if (ts.isModuleDeclaration(n) && n.flags & ts.NodeFlags.GlobalAugmentation && f.startsWith("src/lib/") && !SELFTEST.test(f)) this.onDeclareGlobal(n);
    else if (ts.isNewExpression(n) && f.startsWith("src/lib/")) this.onNew(n);
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) this.onConcat(n);
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
      if (DRIZZLE_TABLE_CALLS.has(m)) {
        const table = this.tenantTableOf(call.arguments[0]);
        if (table) this.onTenantCall(call, m, table);
      }
      if (m === "findFirst" || m === "findMany") this.onRelational(call, callee);
      if ((m === "execute" || m === "query") && call.arguments[0] && !ts.isTaggedTemplateExpression(call.arguments[0])) this.onRawString(call.arguments[0]);
    }

    const ref = this.calleeRef(call);
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
    else if (ref.file === F.seam && ref.name === "mintScope" && !MINT_SITES.includes(f))
      this.report(call, "L6", "mint-scope", "mintScope() outside the four seam files: build scopes through requireStoreMember / platformScope / publicScope / systemScope");
    else if (ref.file === F.seam && ref.name === "requireStoreMember" && /(^|\/)route\.tsx?$/.test(f)) {
      const a = call.arguments[0] ? unwrap(call.arguments[0]) : undefined;
      const hasHandle = !a || !ts.isObjectLiteralExpression(a) ? !!a : a.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "handle");
      if (!hasHandle) this.report(call, "L13", "require-handle", "a route handler calls requireStoreMember() without a handle (§C.3 step 2)");
    }
  }

  private onTenantCall(call: ts.CallExpression, method: string, table: string): void {
    this.ops.get(this.file)!.push({ node: call, pos: call.getStart(this.file), table, method });
    const exempt = this.exempt(call);
    if (exempt) return;
    const scopeFn = enclosingFns(call).find((fn) => this.scopeParams(fn).length > 0);
    const at = call.arguments[0];
    if (!scopeFn) this.report(at, "L1", "query", `.${method}(${table}) in a function without a StoreScope parameter`);

    if (method === "from" || method === "update" || method === "delete") {
      const where = this.chainCall(call, "where");
      if (!where) this.report(at, "L2", "no-where", `.${method}(${table}) has no .where()`);
      else if (!this.hasStorePred(where.arguments[0], call))
        this.report(at, "L2", "unscoped-where", `.${method}(${table}).where() has no inStore/whereStore/byId/storeSql on a StoreScope parameter (top level or inside and())`);
    }
    if (method === "$count" && !this.hasStorePred(call.arguments[1], call))
      this.report(at, "L2", "unscoped-where", `$count(${table}) has no store predicate on a StoreScope parameter`);

    if (method === "insert") {
      const values = this.chainCall(call, "values");
      if (values && !this.valuesOk(values.arguments[0])) this.report(at, "L3", "insert-values", `.insert(${table}).values() not wrapped in storeValues(scope, …)`);
      const odku = this.chainCall(call, "onDuplicateKeyUpdate");
      const arg = odku?.arguments[0] ? unwrap(odku.arguments[0]) : undefined;
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const set = arg.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "set");
        if (set && this.namesStoreId(set.initializer)) this.report(at, "L3b", "set-storeId", `.insert(${table}).onDuplicateKeyUpdate({ set }) names storeId`);
      }
    }
    if (method === "update") {
      const set = this.chainCall(call, "set");
      if (set && this.namesStoreId(set.arguments[0])) this.report(at, "L3b", "set-storeId", `.update(${table}).set() names storeId`);
    }
    if (WRITES.has(method) && scopeFn && !this.l6Reported.has(scopeFn)) {
      const write = this.scopeParams(scopeFn).some((p) => this.isWriteType(this.checker.getTypeAtLocation(p.name)));
      if (!write) {
        this.l6Reported.add(scopeFn);
        this.report(at, "L6", "write-scope", `.${method}(${table}) in ${fnName(scopeFn) ?? "a function"} whose scope parameter is not a WriteScope (D71)`);
      }
    }
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
    else if (!this.hasStorePred(where.initializer, call))
      this.report(call, "L2", "unscoped-where", `query.${holder.name.text}.${callee.name.text}({ where }) has no inStore/whereStore/byId/storeSql on a StoreScope parameter (a callback where is not checked: pass the SQL)`);
  }

  /** the next call named `name` in the builder chain that starts at `start` (`db.select().from(t).where(…)`) */
  private chainCall(start: ts.CallExpression, name: string): ts.CallExpression | null {
    let cur: ts.Expression = start;
    for (;;) {
      const pa = cur.parent;
      if (!pa || !ts.isPropertyAccessExpression(pa) || pa.expression !== cur) return null;
      const call = pa.parent;
      if (!call || !ts.isCallExpression(call) || call.expression !== pa) return null;
      if (pa.name.text === name) return call;
      cur = call;
    }
  }

  /** inStore / whereStore / byId / storeSql on a scope parameter, at the top level or inside and( (never or( / not() */
  private hasStorePred(expr: ts.Expression | undefined, at: ts.Node, depth = 0): boolean {
    if (!expr || depth > 4) return false;
    const e = unwrap(expr);
    if (ts.isCallExpression(e)) {
      if (this.isCall(e, F.sql, "inStore", "whereStore", "byId")) return this.isScopeParamRef(e.arguments[1], at);
      if (this.isCall(e, F.sql, "storeSql")) return this.isScopeParamRef(e.arguments[0], at);
      if (this.isDrizzleCall(e, "and"))
        return e.arguments.some((a) => (ts.isSpreadElement(a) ? this.spreadHasPred(a.expression, at, depth) : this.hasStorePred(a, at, depth + 1)));
      return false;
    }
    if (ts.isTaggedTemplateExpression(e) && this.isSqlTag(e) && ts.isTemplateExpression(e.template)) {
      const raw = [e.template.head.text, ...e.template.templateSpans.map((s) => s.literal.text)].join(" ? ");
      if (/\bor\b/i.test(raw)) return false;
      return e.template.templateSpans.some((s) => {
        const x = unwrap(s.expression);
        return ts.isCallExpression(x) && this.isCall(x, F.sql, "storeSql") && this.isScopeParamRef(x.arguments[0], at);
      });
    }
    if (ts.isConditionalExpression(e)) return this.hasStorePred(e.whenTrue, at, depth + 1) && this.hasStorePred(e.whenFalse, at, depth + 1);
    if (ts.isIdentifier(e)) {
      const init = this.constInit(e);
      return !!init && this.hasStorePred(init, at, depth + 1);
    }
    return false;
  }

  private spreadHasPred(e: ts.Expression, at: ts.Node, depth: number): boolean {
    let x = unwrap(e);
    if (ts.isIdentifier(x)) x = this.constInit(x) ?? x;
    x = unwrap(x);
    return ts.isArrayLiteralExpression(x) && x.elements.some((el) => !ts.isSpreadElement(el) && this.hasStorePred(el, at, depth + 1));
  }

  /** storeValues(scope, …), a literal with `storeId: <scope>.storeId`, an array or .map() of those, or a const of one */
  private valuesOk(expr: ts.Expression | undefined, depth = 0): boolean {
    if (!expr || depth > 4) return false;
    const e = unwrap(expr);
    if (ts.isCallExpression(e)) {
      if (this.isCall(e, F.sql, "storeValues")) return true;
      const cb = e.arguments[0] ? unwrap(e.arguments[0]) : undefined;
      if (ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === "map" && cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        if (!ts.isBlock(cb.body)) return this.valuesOk(cb.body, depth + 1);
        const [only] = cb.body.statements;
        return cb.body.statements.length === 1 && ts.isReturnStatement(only) && this.valuesOk(only.expression, depth + 1);
      }
      return false;
    }
    if (ts.isObjectLiteralExpression(e))
      return e.properties.some((p) => {
        if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name) || p.name.text !== "storeId") return false;
        const v = unwrap(p.initializer);
        return ts.isPropertyAccessExpression(v) && v.name.text === "storeId" && this.isScopeType(this.checker.getTypeAtLocation(v.expression));
      });
    if (ts.isArrayLiteralExpression(e)) return e.elements.length > 0 && e.elements.every((el) => !ts.isSpreadElement(el) && this.valuesOk(el, depth + 1));
    if (ts.isIdentifier(e)) {
      const init = this.constInit(e);
      return !!init && this.valuesOk(init, depth + 1);
    }
    return false;
  }

  private namesStoreId(expr: ts.Expression | undefined): boolean {
    if (!expr) return false;
    const e = unwrap(expr);
    return ts.isObjectLiteralExpression(e) && e.properties.some((p) => !!p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && (p.name.text === "storeId" || p.name.text === "store_id"));
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
    if (this.exempt(call)) return;
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
    let text: string;
    if (ts.isNoSubstitutionTemplateLiteral(t.template)) text = t.template.text;
    else {
      text = t.template.head.text;
      for (const span of t.template.templateSpans) text += this.sqlPlaceholder(span.expression) + span.literal.text;
    }
    this.checkSqlText(text, t);
  }

  private sqlPlaceholder(expr: ts.Expression): string {
    const e = unwrap(expr);
    const table = this.tenantTableOf(e);
    if (table) return ` ${table} `;
    if (ts.isPropertyAccessExpression(e) && e.name.text === "storeId" && this.tenantTableOf(e.expression)) return " store_id ";
    if (ts.isCallExpression(e) && this.isCall(e, F.sql, "storeSql")) return " store_id = ? ";
    if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === "raw" && e.arguments[0] && ts.isStringLiteralLike(e.arguments[0]))
      return e.arguments[0].text;
    return " ? ";
  }

  private onRawString(arg: ts.Expression): void {
    const a = unwrap(arg);
    let text: string | null = null;
    if (ts.isStringLiteralLike(a)) text = a.text;
    else if (ts.isTemplateExpression(a)) text = [a.head.text, ...a.templateSpans.map((s) => s.literal.text)].join(" ? ");
    if (text !== null) this.checkSqlText(text, a);
  }

  private checkSqlText(raw: string, node: ts.Node): void {
    const text = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(--|#)[^\n]*/g, " ");
    for (const stmt of text.split(";")) {
      const tables = new Set<string>();
      for (const m of stmt.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+`?([a-z_][a-z0-9_]*)`?/gi)) if (this.isTenantSqlName(m[1].toLowerCase())) tables.add(m[1].toLowerCase());
      if (!tables.size) continue;
      const insert = /^\s*(INSERT|REPLACE)\b/i.test(stmt);
      this.ops.get(this.file)!.push({ node, pos: node.getStart(this.file), table: [...tables][0], method: insert ? "raw-insert" : "raw" });
      if (this.exempt(node)) continue;
      let ok: boolean;
      if (insert) {
        const cols = /\bINTO\s+`?[a-z_][a-z0-9_]*`?\s*\(([^)]*)\)/i.exec(stmt);
        ok = !!cols && /\bstore_id\b/i.test(cols[1]);
        if (ok && /\bFROM\b/i.test(stmt.slice(cols!.index + cols![0].length))) ok = this.predAfterWhere(stmt.slice(cols!.index + cols![0].length));
      } else ok = this.predAfterWhere(stmt);
      if (!ok) this.report(node, "L10", "raw-sql", `raw SQL on ${[...tables].join(", ")} without store_id = / storeSql( in its WHERE / SET`);
    }
  }

  private predAfterWhere(stmt: string): boolean {
    const m = /\b(WHERE|SET)\b/i.exec(stmt);
    return !!m && /\bstore_id\s*=/i.test(stmt.slice(m.index));
  }

  private tenantSqlNames: Set<string> | null = null;
  private isTenantSqlName(name: string): boolean {
    this.tenantSqlNames ??= new Set(this.tenantDecls.values());
    return this.tenantSqlNames.has(name);
  }

  /* ---------------- literals: L5 (GET_LOCK), L8 ---------------- */

  private onLiteral(n: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression): void {
    const f = this.relFile;
    if (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent) || ts.isExternalModuleReference(n.parent) || ts.isLiteralTypeNode(n.parent)) return;
    if (ts.isExpressionStatement(n.parent)) return; // directives
    const text = ts.isTemplateExpression(n) ? [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join("${}") : n.text;
    if (/\bGET_LOCK\s*\(/i.test(text) && !f.startsWith("src/lib/db/")) this.report(n, "L5", "get-lock", "GET_LOCK outside src/lib/db/: use storeLock / platformLock with withNamedLock (§E.7)");
    if (!f.startsWith("src/components/") && !f.startsWith("src/app/app/")) return;
    const head = ts.isTemplateExpression(n) ? n.head.text : n.text;
    if (/^\/admin(?=[/?#]|$)/.test(head)) this.report(n, "L8", "admin-path", `"${head.slice(0, 40)}" hard-codes an /admin path: use appHref() / the console URL builders (ADM-37)`);
    else if (ts.isTemplateExpression(n) && head === "/") this.report(n, "L8", "live-url", "`/${…}` builds a live URL by hand: use storeUrl() / appHref() (ADM-39)");
  }

  private onConcat(n: ts.BinaryExpression): void {
    const f = this.relFile;
    if (!f.startsWith("src/components/") && !f.startsWith("src/app/app/")) return;
    const left = unwrap(n.left);
    if (ts.isStringLiteralLike(left) && left.text === "/") this.report(n, "L8", "live-url", `"/" + … builds a live URL by hand: use storeUrl() / appHref() (ADM-39)`);
  }

  /* ---------------- casts and predicates: L6 ---------------- */

  private onCast(n: ts.AsExpression | ts.TypeAssertion): void {
    if (ts.isConstTypeReference(n.type)) return;
    const target = this.checker.getTypeFromTypeNode(n.type);
    if (!this.carriesWrite(target, n)) return;
    if (this.carriesWrite(this.checker.getTypeAtLocation(n.expression), n)) return;
    this.report(n, "L6", "cast", "a cast or assertion to WriteScope (or a ctx carrying one) outside src/lib/tenancy/seam.ts (D71)");
  }

  private onFunction(fn: FnLike): void {
    const f = this.relFile;
    if (fn.type && ts.isTypePredicateNode(fn.type) && fn.type.type && f !== F.seam && this.carriesWrite(this.checker.getTypeFromTypeNode(fn.type.type), fn))
      this.report(fn.type, "L6", "cast", "a type guard that narrows to WriteScope outside src/lib/tenancy/seam.ts (D71)");
    // L9, inline server action (a function whose first statement is "use server")
    if (fn.body && ts.isBlock(fn.body) && isDirective(fn.body.statements[0], "use server")) this.checkActionBody(fn, fn.name ?? fn, true);
  }

  /* ---------------- imports: L7 ---------------- */

  private onImport(spec: string, at: ts.Node, typeOnly = false): void {
    const f = this.relFile;
    if (!f.startsWith("src/app/") && !f.startsWith("src/components/")) return;
    const res = ts.resolveModuleName(spec, this.file.fileName, this.program.getCompilerOptions(), this.host, this.resolutionCache).resolvedModule;
    const target = res ? rel(res.resolvedFileName) : null;
    if (target === F.dbClient || target === F.schema)
      this.report(at, "L7", typeOnly ? "db-type-import" : "db-import", `imports ${target} (ADM-38): call a repository instead${typeOnly ? " (row types come from the repository module)" : ""}`);
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
    for (let p: ts.Node = n.parent; p; p = p.parent) {
      if (isFnLike(p) || ts.isClassStaticBlockDeclaration(p)) return;
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
    if (this.allowed(symbol)) return;
    const direct = !!binding?.initializer && unwrap(binding.initializer) === n;
    if (this.readonlySlot(n) || (direct && this.frozen(binding!))) return;
    const hint = direct && ts.getCombinedNodeFlags(binding!) & ts.NodeFlags.Const ? `; a lookup table that is never changed: type it Readonly${n.expression.text}` : "";
    this.report(n, "L4", "module-map", `module-scope new ${n.expression.text}() (${symbol}): use scopedCache() or list it in scripts/qa/tenancy-allow.json with a reason${hint}`);
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

  /** every reference of the `const` `decl` binds only reads (other files too when `crossFile` and it is exported) */
  private onlyRead(decl: ts.VariableDeclaration, crossFile: boolean, depth: number): boolean {
    if (depth > 3 || !ts.isIdentifier(decl.name)) return false;
    const sym = this.checker.getSymbolAtLocation(decl.name);
    if (!sym) return false;
    const name = decl.name.text;
    const own = decl.getSourceFile();
    const target = (id: ts.Identifier) => {
      let s = this.checker.getSymbolAtLocation(id);
      if (s && s.flags & ts.SymbolFlags.Alias) s = this.checker.getAliasedSymbol(s);
      return s === sym;
    };
    let exported = hasModifier(decl.parent.parent, ts.SyntaxKind.ExportKeyword);
    const uses = (sf: ts.SourceFile): boolean => {
      let ok = true;
      const walk = (n: ts.Node) => {
        if (!ok) return;
        if (ts.isIdentifier(n) && n !== decl.name && n.text === name && target(n)) {
          if (ts.isExportSpecifier(n.parent) || ts.isExportAssignment(n.parent)) exported = true;
          if (!this.readOnlyUse(n, depth)) ok = false;
        }
        ts.forEachChild(n, walk);
      };
      walk(sf);
      return ok;
    };
    if (!uses(own)) return false;
    if (!exported) return true;
    if (!crossFile) return false;
    return this.program
      .getSourceFiles()
      .every((sf) => sf === own || sf.isDeclarationFile || !rel(sf.fileName).startsWith("src/") || !sf.text.includes(name) || uses(sf));
  }

  private readOnlyUse(e: ts.Expression, depth: number): boolean {
    const p = e.parent;
    if (ts.isSpreadElement(p) || ts.isTypeQueryNode(p) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) return true;
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
    const isRoute = /^src\/app\/.*(^|\/)route\.tsx?$/.test(f);
    if (f.startsWith("src/lib/") && !SELFTEST.test(f)) this.casts4(sf);
    if (isUseServerFile(sf)) {
      for (const ex of exportedFunctions(sf, this.checker)) {
        const inline = !!ex.fn.body && ts.isBlock(ex.fn.body) && isDirective(ex.fn.body.statements[0], "use server");
        if (!inline) this.checkActionBody(ex.fn, ex.at, false);
        if (this.reach(ex.fn, "publish", (fn) => this.matches(fn, this.cfg.publishSinks)) && !this.reach(ex.fn, "gate", (fn) => this.matches(fn, this.cfg.prePublishGates)))
          this.report(ex.at, "L12", "publish-gate", `${ex.name}() reaches a publish without runPrePublishChecks() (§M.1)`);
      }
    }
    if (!isRoute && !f.startsWith("src/app/s/[store]/")) return;
    const exported = exportedFunctions(sf, this.checker);
    for (const ex of exported) {
      const handler = HTTP_METHODS.has(ex.name);
      if (isRoute && handler && (f.startsWith("src/app/api/public/") || f.startsWith("src/app/s/"))) {
        if (this.reach(ex.fn, "order-lead-insert", (fn) => this.opsIn(fn).some((o) => (o.table === "orders" || o.table === "leads") && (o.method === "insert" || o.method === "raw-insert"))) && !this.reach(ex.fn, "test-token", (fn) => this.matches(fn, this.cfg.testToken)))
          this.report(ex.at, "L12", "test-token", `${ex.name} creates an order or lead without resolveTestToken() (D54)`);
      }
      if (handler && f.startsWith("src/app/api/app/[store]/")) this.checkFirstAwait(ex, F.seam, "storeGuard");
      else if (handler && f.startsWith("src/app/api/admin/")) this.checkFirstAwait(ex, F.platformSeam, "platformGuard");
      else if (handler && f.startsWith("src/app/api/public/")) {
        const hit = this.firstTouch(ex.fn, "public", (c) => this.isRef(c, this.cfg.publicResolvers));
        if (hit && hit !== "resolved") this.report(hit, "L13", "public-resolver", `${ex.name}: a tenant-table call before a public resolver (resolvePublicTarget / resolveStoreByHandle / …)`);
      } else if (f.startsWith("src/app/s/[store]/")) {
        const hit = this.firstTouch(ex.fn, "handle", (c) => this.isCall(c, F.publicResolvers, "resolveStoreByHandle") && this.isParamsStore(c.arguments[0]));
        if (hit && hit !== "resolved") this.report(hit, "L13", "store-handle", `${ex.name}: a tenant-table call before resolveStoreByHandle(params.store)`);
      }
    }
  }

  /** L4 also covers `globalThis as { __codX?: … }` declarations outside `declare global` */
  private casts4(sf: ts.SourceFile): void {
    const seen = new Set<string>();
    const visit = (n: ts.Node) => {
      if ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && ts.isIdentifier(unwrap(n.expression)) && (unwrap(n.expression) as ts.Identifier).text === "globalThis") {
        const lits: ts.TypeLiteralNode[] = [];
        const collect = (t: ts.Node) => {
          if (ts.isTypeLiteralNode(t)) lits.push(t);
          ts.forEachChild(t, collect);
        };
        collect(n.type);
        for (const lit of lits)
          for (const m of lit.members) {
            const name = m.name && ts.isIdentifier(m.name) ? m.name.text : null;
            if (!name || !/^__(cod|sg)/.test(name) || seen.has(name)) continue;
            seen.add(name);
            if (!this.allowed(name)) this.report(m, "L4", "global", `globalThis.${name}: a process-wide global; use scopedCache() or list it in scripts/qa/tenancy-allow.json with a reason`);
          }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }

  private checkActionBody(fn: FnLike, at: ts.Node, inline: boolean): void {
    if (this.l9Checked.has(fn) || !fn.body) return;
    this.l9Checked.add(fn);
    const name = fnName(fn);
    const allowedAction = name ? this.cfg.actions.find((a) => a.file === this.relFile && a.symbol === name) : undefined;
    if (allowedAction) {
      this.usedAllow.add(allowedAction);
      return;
    }
    const isSeam = (e: ts.Expression | undefined) => {
      if (!e) return false;
      const x = unwrap(e);
      if (!ts.isCallExpression(x)) return false;
      const r = this.calleeRef(x);
      return !!r && SEAM_ACTIONS[r.name] === r.file;
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
  private checkFirstAwait(ex: ExportedFn, file: string, guard: "storeGuard" | "platformGuard"): void {
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
    const decls = this.symbolOf(x)?.declarations ?? [];
    for (const d of decls) {
      const file = rel(d.getSourceFile().fileName);
      if (!file.startsWith("src/") || d.getSourceFile().isDeclarationFile) continue;
      const fn = fnInitializer(d);
      if (fn?.body) return fn;
    }
    return null;
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

  private reachesTenant(fn: FnLike): boolean {
    return this.reach(fn, "tenant", (f) => this.opsIn(f).length > 0);
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

  private checkPins(): void {
    const groups = new Map<Pin, Annotation[]>();
    for (const a of this.annotations) {
      if (a.kind !== "platform") continue;
      const pin = this.cfg.pins.find((p) => under(a.file, p.files.map((g) => (g.endsWith("/**") ? g.slice(0, -2) : g))));
      if (pin) groups.set(pin, [...(groups.get(pin) ?? []), a]);
    }
    for (const [pin, list] of groups) {
      if (list.length <= pin.max) continue;
      list.sort((x, y) => (x.file === y.file ? x.line - y.line : x.file < y.file ? -1 : 1));
      const a = list[pin.max];
      this.violations.push({ file: a.file, line: a.line, rule: "PIN", kind: "pin", message: `${list.length} "tenancy: platform" annotations in ${pin.files.join(" + ")}, pinned at ${pin.max} (${pin.reason})` });
    }
  }

  pinCounts(): { pin: Pin; count: number }[] {
    return this.cfg.pins.map((pin) => ({
      pin,
      count: this.annotations.filter((a) => a.kind === "platform" && this.cfg.pins.find((p) => under(a.file, p.files.map((g) => (g.endsWith("/**") ? g.slice(0, -2) : g)))) === pin).length,
    }));
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
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, pages, plans, storeMembers } from "@/lib/db/schema";
import { byId, inStore, storeSql, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { ReadScope, StoreScope, WriteScope } from "@/lib/tenancy/types";

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
  await db.delete(pages).where(inStore(pages, scope));
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
  [`src/lib/platform/${FX}/console.ts`]: `
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { storeMembers } from "@/lib/db/schema";
import { platformScope } from "@/lib/platform/seam";
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
  return [rows, trailing, one, minted];
}
export async function second() {
  // tenancy: platform second annotation over the fixture pin //! PIN
  return db.select().from(storeMembers).where(eq(storeMembers.role, "owner"));
}
`,
  [`src/lib/${FX}/cache.ts`]: `
import { platformScope } from "@/lib/platform/seam";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { rateLimit } from "@/lib/security/rate-limit";
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
export async function legacy() {
  await rateLimit("api:order:x", 1, 1); //! L5
  const lock = "SELECT GET_LOCK('cod:x', 1)"; //! L5
  return [lock, await getSetting("store")]; //! L3
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
  return <a href="/admin/pages" data-k={String(pages)} data-p={band}>{live}{joined}{notAdmin}</a>; //! L8
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
`,
  [`src/lib/${FX}/publish.ts`]: `
export async function fixturePublish(): Promise<void> {}
export async function fixtureGate(): Promise<void> {}
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
import { storeValues } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
export async function insertOrder(scope: WriteScope) {
  await db.insert(orders).values(storeValues(scope, {}) as never);
}
`,
  [`src/app/api/public/${FX}/order/route.ts`]: `
import { insertOrder } from "@/lib/${FX}/orders";
import { publicScope, resolvePublicTarget, resolveTestToken } from "@/lib/tenancy/public";
import { good } from "@/lib/${FX}/repo";
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
  pins: [{ files: [`src/lib/platform/${FX}/**`], max: 2, reason: "fixture pin" }],
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
