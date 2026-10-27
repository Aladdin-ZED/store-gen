/**
 * Registry check (`test:registries`, docs/STORE-SAAS.md §K.2 P0, §K.3): every extension file on disk is imported by
 * its registry, so a track only ever fills its own file and a forgotten import fails `npm test`. Offline, no build:
 * the registries are read as source with the TypeScript parser (several are `server-only`, one runs at load).
 *
 *   npm run test:registries                  (exit 1 on a finding)
 *   npx tsx scripts/qa/registries-check.ts --verbose
 *
 * Per registry: each `<folder>/<file>.ts` is imported by the registry with a value import (never `import type`) of the
 * name the extension point exports (`rules`, `jobs`, `nav`, …), and that binding is used beyond its import line; each
 * extension file exports that name. Side-effect registries (`prepublish`) import the file for its effects. The
 * tenancy harness loads its case files lazily, so its `TENANCY_CASE_FILES` list must equal the folder instead. The
 * three admin locales hold the same i18n files. The checker proves itself first on in-memory fixtures (exit 2 when that
 * self-check fails).
 */
import path from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..", "..");
const VERBOSE = process.argv.includes("--verbose");

/** One extension point: the folder of track files, the registry that must import them, and what each file exports. */
export interface RegistrySpec {
  id: string;
  dir: string; // repo-relative, forward slashes
  registry: string;
  /** the name every extension file exports and the registry imports; null: a side-effect module (registers at import) */
  exportName: string | null;
  /** "imports" (static ES imports, the default) or "list" (a string array named `listName` in the registry) */
  how?: "imports" | "list";
  listName?: string;
  /** files of the folder that are not extension files (types, the registry itself, fixtures) */
  ignore?: readonly (string | RegExp)[];
}

export const REGISTRIES: readonly RegistrySpec[] = [
  { id: "health rules (§I.7)", dir: "src/lib/health/rules", registry: "src/lib/health/registry.ts", exportName: "rules" },
  { id: "pulse contributors (§I.4)", dir: "src/lib/pulse/contributors", registry: "src/lib/pulse/registry.ts", exportName: "contributor" },
  { id: "notification kinds (§I.4)", dir: "src/lib/notify/kinds", registry: "src/lib/notify/registry.ts", exportName: "kinds" },
  { id: "flags (§D.4)", dir: "src/lib/flags/defs", registry: "src/lib/flags/registry.ts", exportName: "flags" },
  { id: "jobs (§H.2)", dir: "src/lib/jobs/tracks", registry: "src/lib/jobs/registry.ts", exportName: "jobs" },
  { id: "order hooks (OPE-§3.6)", dir: "src/lib/orders/hooks", registry: "src/lib/orders/hooks.ts", exportName: "hooks" },
  {
    id: "publish checks (§M.1)",
    dir: "src/lib/render/prepublish",
    registry: "src/lib/render/prepublish.ts",
    exportName: null,
    // budget-limits.ts is the budget gate's own constants (imported by budget.ts); *.fixtures.ts are test data
    ignore: ["budget-limits.ts", /\.fixtures\.ts$/, /selftest/],
  },
  { id: "search providers (§I.3)", dir: "src/lib/admin-data/search", registry: "src/lib/admin-data/search/registry.ts", exportName: "provider", ignore: ["types.ts", "registry.ts"] },
  { id: "navigation (§I.3)", dir: "src/components/admin/shell/nav", registry: "src/components/admin/shell/nav/index.ts", exportName: "nav", ignore: ["types.ts", "index.ts"] },
  { id: "⌘K commands (§I.3)", dir: "src/components/admin/shell/commands", registry: "src/components/admin/shell/commands/index.ts", exportName: "commands", ignore: ["types.ts", "index.ts"] },
  ...(["en", "fr", "ar"] as const).map((l): RegistrySpec => ({ id: `admin messages ${l} (§I.5, D67)`, dir: `src/lib/i18n/admin/${l}`, registry: `src/lib/i18n/admin/${l}.ts`, exportName: "messages" })),
  { id: "tenancy cases (§F.1)", dir: "scripts/qa/tenancy-cases", registry: "scripts/qa/tenancy-check.ts", exportName: "cases", how: "list", listName: "TENANCY_CASE_FILES" },
  { id: "wow-demo steps (§J.3)", dir: "scripts/qa/wow-demo/steps", registry: "scripts/qa/wow-demo.ts", exportName: "steps" },
  { id: "render cases (§J.1, ENGP-12)", dir: "scripts/qa/render-cases", registry: "scripts/qa/render-check.ts", exportName: "cases" },
];

/** What the checker reads: a folder listing (file names) and a file's text, both repo-relative. */
export interface Io {
  list(dir: string): string[] | null;
  read(file: string): string | null;
}

const diskIo: Io = {
  list: (dir) => {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) return null;
    return readdirSync(abs).filter((n) => statSync(path.join(abs, n)).isFile());
  },
  read: (file) => {
    const abs = path.join(ROOT, file);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  },
};

const norm = (p: string) => p.replace(/\\/g, "/").replace(/\.(tsx?|mts)$/, "");

/** Resolves an import specifier of `from` to a repo-relative path without extension (null: a package). */
function resolveSpecifier(from: string, spec: string): string | null {
  if (spec.startsWith("@/")) return norm(path.posix.join("src", spec.slice(2)));
  if (spec.startsWith("./") || spec.startsWith("../")) return norm(path.posix.join(path.posix.dirname(from), spec));
  return null;
}

const parse = (file: string, text: string) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** How many identifiers named `name` the file holds (its import binding counts as one). */
function identifierCount(sf: ts.SourceFile, name: string): number {
  let n = 0;
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === name) n++;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/** The names a module exports through `export const|let|var|function|class`. */
function exportedNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    const exported = ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text);
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) out.add(st.name.text);
  }
  return out;
}

/** The string items of `const <name> = [...] (as const)` in the file, or null when there is no such array. */
function stringList(sf: ts.SourceFile, name: string): string[] | null {
  let found: string[] | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      let init: ts.Expression = node.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      if (ts.isArrayLiteralExpression(init)) found = init.elements.filter(ts.isStringLiteral).map((e) => e.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const ignored = (spec: RegistrySpec, name: string) => (spec.ignore ?? []).some((p) => (typeof p === "string" ? p === name : p.test(name)));

/** The findings of one registry, and the extension files it covers. */
export function checkRegistry(spec: RegistrySpec, io: Io): { files: string[]; findings: string[] } {
  const findings: string[] = [];
  const listing = io.list(spec.dir);
  const source = io.read(spec.registry);
  if (listing === null) return { files: [], findings: [`${spec.dir}: the folder is missing`] };
  if (source === null) return { files: [], findings: [`${spec.registry}: the registry is missing`] };
  const files = listing.filter((n) => /\.tsx?$/.test(n) && !/\.d\.ts$/.test(n) && !ignored(spec, n)).sort();
  const sf = parse(spec.registry, source);

  if (spec.how === "list") {
    const listName = spec.listName ?? "";
    const list = stringList(sf, listName);
    if (!list) findings.push(`${spec.registry}: no string list \`${listName}\``);
    else {
      const names = files.map((f) => f.replace(/\.tsx?$/, ""));
      for (const n of names) if (!list.includes(n)) findings.push(`${spec.dir}/${n}.ts is not in ${listName} (${spec.registry})`);
      for (const n of list) if (!names.includes(n)) findings.push(`${listName} names ${n}, but ${spec.dir}/${n}.ts does not exist`);
      if (identifierCount(sf, listName) < 2) findings.push(`${spec.registry}: ${listName} is declared but never read`);
    }
  } else {
    // every import of the registry, resolved, with the binding it creates
    const imports = new Map<string, { typeOnly: boolean; local: string | null; imported: string | null; sideEffect: boolean }[]>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const target = resolveSpecifier(spec.registry, st.moduleSpecifier.text);
      if (!target) continue;
      const entries = imports.get(target) ?? [];
      const clause = st.importClause;
      if (!clause) entries.push({ typeOnly: false, local: null, imported: null, sideEffect: true });
      else {
        const named = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
        if (!named.length) entries.push({ typeOnly: clause.isTypeOnly, local: clause.name?.text ?? null, imported: clause.name ? "default" : null, sideEffect: false });
        for (const el of named) entries.push({ typeOnly: clause.isTypeOnly || el.isTypeOnly, local: el.name.text, imported: (el.propertyName ?? el.name).text, sideEffect: false });
      }
      imports.set(target, entries);
    }
    for (const f of files) {
      const target = norm(`${spec.dir}/${f}`);
      const entries = imports.get(target) ?? [];
      if (!entries.length) {
        findings.push(`${spec.dir}/${f} is not imported by ${spec.registry}`);
        continue;
      }
      if (spec.exportName === null) {
        if (!entries.some((e) => !e.typeOnly)) findings.push(`${spec.registry} imports ${spec.dir}/${f} as types only (it must run: \`import "./…"\`)`);
        continue;
      }
      const value = entries.filter((e) => !e.typeOnly && e.imported === spec.exportName);
      if (!value.length) findings.push(`${spec.registry} does not import \`${spec.exportName}\` (as a value) from ${spec.dir}/${f}`);
      else if (!value.some((e) => e.local && identifierCount(sf, e.local) >= 2)) findings.push(`${spec.registry} imports \`${spec.exportName}\` from ${spec.dir}/${f} but never uses it`);
    }
  }

  if (spec.exportName !== null) {
    for (const f of files) {
      const text = io.read(`${spec.dir}/${f}`);
      if (text === null) continue;
      if (!exportedNames(parse(`${spec.dir}/${f}`, text)).has(spec.exportName)) findings.push(`${spec.dir}/${f} does not export \`${spec.exportName}\``);
    }
  }
  return { files, findings };
}

/** The three admin locales hold the same files (a track's fr or ar file never exists without its en one). */
export function checkLocales(io: Io): string[] {
  const sets = (["en", "fr", "ar"] as const).map((l) => [l, (io.list(`src/lib/i18n/admin/${l}`) ?? []).filter((n) => /\.ts$/.test(n)).sort()] as const);
  const all = [...new Set(sets.flatMap(([, s]) => s))].sort();
  return sets.flatMap(([l, s]) => all.filter((n) => !s.includes(n)).map((n) => `src/lib/i18n/admin/${l}/${n} is missing (the other locales have it)`));
}

/* ------------------------------------------------------------------ */
/* self-check: the checker on in-memory fixtures                       */
/* ------------------------------------------------------------------ */

function memIo(files: Record<string, string>): Io {
  return {
    list: (dir) => {
      const names = Object.keys(files)
        .filter((f) => path.posix.dirname(f) === dir)
        .map((f) => path.posix.basename(f));
      return names.length || Object.keys(files).some((f) => f.startsWith(`${dir}/`)) ? names : null;
    },
    read: (file) => files[file] ?? null,
  };
}

/** The failures of the checker on its fixtures (empty: it finds what it must and nothing else), and how many ran. */
function selfCheck(): { failures: string[]; ran: number } {
  const spec: RegistrySpec = { id: "fixture", dir: "x/rules", registry: "x/registry.ts", exportName: "rules", ignore: ["types.ts"] };
  const ext = { "x/rules/a.ts": "export const rules = [];", "x/rules/b.ts": "export const rules = [];", "x/rules/types.ts": "export type R = 1;" };
  const good = `import { rules as aRules } from "./rules/a";\nimport { rules as bRules } from "./rules/b";\nexport const ALL = [...aRules, ...bRules];`;
  const cases: [name: string, files: Record<string, string>, expect: RegExp | null, s?: RegistrySpec][] = [
    ["a complete registry passes", { ...ext, "x/registry.ts": good }, null],
    [
      "an @/ import resolves to src/",
      { "src/x/rules/a.ts": "export const rules = [];", "src/x/registry.ts": `import { rules as a } from "@/x/rules/a";\nexport const ALL = a;` },
      null,
      { ...spec, dir: "src/x/rules", registry: "src/x/registry.ts" },
    ],
    ["a forgotten import fails", { ...ext, "x/registry.ts": `import { rules as aRules } from "./rules/a";\nexport const ALL = [...aRules];` }, /b\.ts is not imported/],
    ["a type-only import fails", { ...ext, "x/registry.ts": `import { rules as aRules } from "./rules/a";\nimport type { rules as bRules } from "./rules/b";\nexport const ALL = [...aRules];` }, /does not import `rules` \(as a value\) from x\/rules\/b\.ts/],
    ["an unused binding fails", { ...ext, "x/registry.ts": `import { rules as aRules } from "./rules/a";\nimport { rules as bRules } from "./rules/b";\nexport const ALL = [...aRules];` }, /from x\/rules\/b\.ts but never uses it/],
    ["a file without the export fails", { ...ext, "x/rules/b.ts": "export const other = [];", "x/registry.ts": good }, /b\.ts does not export `rules`/],
    ["a missing registry fails", { ...ext }, /the registry is missing/],
    [
      "a side-effect registry needs a runtime import",
      { "x/rules/a.ts": "export {};", "x/registry.ts": `import type {} from "./rules/a";` },
      /as types only/,
      { ...spec, exportName: null },
    ],
    [
      "a list registry names every file",
      { ...ext, "x/registry.ts": `export const LIST = ["a"] as const;\nfor (const n of LIST) load(n);` },
      /b\.ts is not in LIST/,
      { ...spec, how: "list", listName: "LIST" },
    ],
  ];
  const out: string[] = [];
  for (const [name, files, expect, s] of cases) {
    const { findings } = checkRegistry(s ?? spec, memIo(files));
    const ok = expect === null ? findings.length === 0 : findings.some((f) => expect.test(f));
    if (!ok) out.push(`${name}: got ${JSON.stringify(findings)}`);
  }
  const locales = checkLocales(memIo({ "src/lib/i18n/admin/en/a.ts": "", "src/lib/i18n/admin/fr/a.ts": "", "src/lib/i18n/admin/ar/b.ts": "" }));
  if (!(locales.some((f) => f.includes("ar/a.ts")) && locales.some((f) => f.includes("en/b.ts")))) out.push(`locale parity: got ${JSON.stringify(locales)}`);
  return { failures: out, ran: cases.length + 1 };
}

function main(): void {
  const self = selfCheck();
  if (self.failures.length) {
    console.error("registries-check: the self-check failed");
    for (const f of self.failures) console.error(`  ✗ ${f}`);
    process.exit(2);
  }
  let findings = 0;
  for (const spec of REGISTRIES) {
    const r = checkRegistry(spec, diskIo);
    findings += r.findings.length;
    console.log(`${r.findings.length ? "✗" : "✓"} ${spec.id}: ${r.files.length} files · ${spec.registry}${VERBOSE ? ` · ${r.files.join(", ")}` : ""}`);
    for (const f of r.findings) console.log(`    ✗ ${f}`);
  }
  const locales = checkLocales(diskIo);
  findings += locales.length;
  console.log(`${locales.length ? "✗" : "✓"} admin locales hold the same files`);
  for (const f of locales) console.log(`    ✗ ${f}`);
  console.log(findings ? `✗ test:registries: ${findings} finding(s)` : `✓ test:registries: every extension file is imported by its registry (${REGISTRIES.length} registries, self-check ${self.ran}/${self.ran})`);
  process.exit(findings ? 1 : 0);
}

if (require.main === module) main();
