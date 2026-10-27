/**
 * The `npm test` wall-time harness of docs/STORE-SAAS.md §J.1 (rev 4 named, rev 5 CRIT2-9: "the budget is a table
 * whose sum is checked, not a list of shares"). Reads the committed table scripts/qa/test-budget.json:
 *
 *   npm run test:budget                                   (static checks, then runs every group's scripts and times them)
 *   npx tsx scripts/qa/test-budget.ts --static            (the static checks only; no suite runs, < 1 s; npm run test:budget-static, in npm run gate)
 *   npx tsx scripts/qa/test-budget.ts --group core,design (only these groups; the ceiling is then not judged)
 *   npx tsx scripts/qa/test-budget.ts --verbose           (also print each suite's output)
 *   npx tsx scripts/qa/test-budget.ts --json              (one JSON document on stdout)
 *
 * Static (every release of the table, so R2 / R3 shares cannot grow silently either): the sum of a release's group
 * budgets (with the groups of the release it `extends`) must not exceed its ceiling and must equal its declared total;
 * a group's `measuredSec` (its time in the timed run that last re-cut the table, P0 review G7) must not exceed its
 * budget, so a re-cut cannot declare a share below its own measurement;
 * group ids and scripts are unique; every script that package.json's `test` chain runs, and `pretest`, belongs to a
 * group of the current release (a new suite joins `npm test` only with a budget), and the `test` entry runs nothing
 * but `npm run <script>` (a direct `tsx` / `node` command would join the chain unbudgeted and untimed). The harness
 * checks its own chain parsing first and exits 2 when that self-check fails.
 *
 * Timed: each group's scripts run one after the other with package.json's command (node_modules/.bin on PATH, no
 * npm wrapper, so npm's own start-up is not billed to a suite). A script package.json does not define yet, or whose
 * `tsx` / `node` entry file does not exist yet, is listed as pending and costs 0 s. The run fails when a group takes
 * longer than its budget or the whole chain longer than the ceiling. A suite that exits non-zero is reported, and
 * its time still counts: correctness is `npm test`'s verdict, this harness judges time.
 *
 * Exit codes: 0 ok, 1 a budget exceeded or a static check failed, 2 the table or package.json is unreadable.
 */
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { z } from "zod";

const ROOT = path.resolve(__dirname, "..", "..");
const TABLE_FILE = path.join(ROOT, "scripts", "qa", "test-budget.json");

const Group = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1),
  owner: z.string().min(1),
  budgetSec: z.number().int().positive(),
  measuredSec: z.number().nonnegative().optional(),
  scripts: z.array(z.string().min(1)).min(1),
  note: z.string().optional(),
});
const Release = z.object({
  extends: z.string().optional(),
  ceilingSec: z.number().int().positive(),
  totalSec: z.number().int().positive(),
  groups: z.array(Group).min(1),
});
const Table = z.object({
  "//": z.string().optional(),
  current: z.string(),
  releases: z.record(z.string(), Release),
});
type Group = z.infer<typeof Group>;
type Table = z.infer<typeof Table>;

/* ------------------------------------------------------------------ */
/* args                                                               */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
function option(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}
const STATIC = flag("--static");
const VERBOSE = flag("--verbose");
const JSON_OUT = flag("--json");
const ONLY = option("--group")?.split(",").map((s) => s.trim()).filter(Boolean);

const log = (line = "") => {
  if (!JSON_OUT) console.log(line);
};

function die(msg: string): never {
  console.error(`test-budget: ${msg}`);
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* static checks                                                      */
/* ------------------------------------------------------------------ */

function loadTable(): Table {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(TABLE_FILE, "utf8"));
  } catch (e) {
    die(`cannot read ${path.relative(ROOT, TABLE_FILE)}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const parsed = Table.safeParse(raw);
  if (!parsed.success) die(`scripts/qa/test-budget.json is malformed: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  if (!parsed.data.releases[parsed.data.current]) die(`current release "${parsed.data.current}" is not in releases`);
  return parsed.data;
}

/** A release's groups including the ones it extends (base first). */
function groupsOf(table: Table, release: string, seen: string[] = []): Group[] {
  const r = table.releases[release];
  if (!r) die(`release "${release}" is not in the table (extended by ${seen.at(-1) ?? "?"})`);
  if (seen.includes(release)) die(`releases extend each other in a loop: ${[...seen, release].join(" -> ")}`);
  return [...(r.extends ? groupsOf(table, r.extends, [...seen, release]) : []), ...r.groups];
}

/**
 * The scripts `npm test` runs: `pretest` plus every `npm run <name>` of the test entry, split on `&&` / `||` / `;`.
 * Any other command of the entry (`tsx scripts/qa/x.ts`, `node …`) is returned in `direct`: it would join the chain
 * with no budget group and never be timed, so the static check fails on it (review C0b F16, §J.1 CRIT2-9).
 */
function testChain(scripts: Record<string, string>): { chain: string[]; direct: string[] } {
  const chain: string[] = [];
  const direct: string[] = [];
  for (const part of (scripts.test ?? "").split(/&&|\|\||;/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^npm\s+run(?:\s+(?:-s|--silent))?\s+([\w:.-]+)(?:\s+--(?:\s+\S+)*)?$/.exec(part);
    if (m) chain.push(m[1]!);
    else direct.push(part);
  }
  return { chain: scripts.pretest ? ["pretest", ...chain] : chain, direct };
}

function staticChecks(table: Table, scripts: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [name, r] of Object.entries(table.releases)) {
    const groups = groupsOf(table, name);
    const sum = groups.reduce((n, g) => n + g.budgetSec, 0);
    if (sum > r.ceilingSec) problems.push(`${name}: the group budgets sum to ${sum} s, over the ${r.ceilingSec} s ceiling`);
    if (sum !== r.totalSec) problems.push(`${name}: the group budgets sum to ${sum} s but the table declares ${r.totalSec} s`);
    if (r.totalSec > r.ceilingSec) problems.push(`${name}: the declared total ${r.totalSec} s is over the ${r.ceilingSec} s ceiling`);
    const ids = new Map<string, number>();
    const owners = new Map<string, string>();
    for (const g of groups) {
      ids.set(g.id, (ids.get(g.id) ?? 0) + 1);
      if (g.measuredSec !== undefined && g.measuredSec > g.budgetSec) problems.push(`${name}: group ${g.id} measured ${g.measuredSec} s in the run that re-cut the table, over its ${g.budgetSec} s share`);
      for (const s of g.scripts) {
        const prev = owners.get(s);
        if (prev && prev !== g.id) problems.push(`${name}: script ${s} is in two groups (${prev}, ${g.id})`);
        owners.set(s, g.id);
      }
    }
    for (const [id, n] of ids) if (n > 1) problems.push(`${name}: group id "${id}" appears ${n} times`);
  }
  const current = new Set(groupsOf(table, table.current).flatMap((g) => g.scripts));
  const { chain, direct } = testChain(scripts);
  for (const s of chain) {
    if (!current.has(s)) problems.push(`package.json test runs ${s}, which has no budget group in ${table.current} (add it to scripts/qa/test-budget.json through the maintainer)`);
  }
  for (const c of direct) problems.push(`package.json test runs "${c}" directly: give it a script and run it as npm run <script>, so it gets a budget group and is timed`);
  return problems;
}

/** The harness checks its own parsing first (exit 2 when it is broken): a direct command never slips past the static check. */
function selfCheck(): string[] {
  const out: string[] = [];
  const same = (name: string, got: unknown, want: unknown) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) out.push(`${name}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  };
  same("npm run chain", testChain({ test: "npm run a && npm run -s b; npm run --silent c || npm run d -- --flag" }), { chain: ["a", "b", "c", "d"], direct: [] });
  same("pretest first", testChain({ pretest: "node x.mjs", test: "npm run a" }).chain, ["pretest", "a"]);
  same("direct tsx / node", testChain({ test: "npm run a && tsx scripts/qa/x.ts && node scripts/y.mjs" }).direct, ["tsx scripts/qa/x.ts", "node scripts/y.mjs"]);
  const table: Table = { current: "R", releases: { R: { ceilingSec: 10, totalSec: 5, groups: [{ id: "g", label: "g", owner: "m", budgetSec: 5, scripts: ["a"] }] } } };
  same("static: budgeted chain passes", staticChecks(table, { test: "npm run a", a: "tsx a.ts" }), []);
  same("static: a direct command fails", staticChecks(table, { test: "npm run a && tsx scripts/qa/x.ts", a: "tsx a.ts" }).length, 1);
  same("static: an unbudgeted script fails", staticChecks(table, { test: "npm run a && npm run b", a: "tsx a.ts", b: "tsx b.ts" }).length, 1);
  const under: Table = { current: "R", releases: { R: { ceilingSec: 10, totalSec: 5, groups: [{ id: "g", label: "g", owner: "m", budgetSec: 5, measuredSec: 6, scripts: ["a"] }] } } };
  same("static: a share below its own measurement fails", staticChecks(under, { test: "npm run a", a: "tsx a.ts" }).length, 1);
  return out;
}

/* ------------------------------------------------------------------ */
/* timed run                                                          */
/* ------------------------------------------------------------------ */

interface ScriptRun {
  script: string;
  status: "ran" | "pending";
  ms: number;
  exit: number | null;
  why?: string;
}

/** `tsx <file>` / `node [--flags] <file>`: the entry file, when the command names one. */
function entryFile(command: string): string | null {
  const m = /^(?:tsx|node)\s+(?:--?[\w-]+(?:=\S+)?\s+)*([^\s&|]+\.(?:[cm]?[jt]s|tsx))\b/.exec(command.trim());
  return m ? m[1]! : null;
}

function pathEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  env[key] = [path.join(ROOT, "node_modules", ".bin"), env[key] ?? ""].join(path.delimiter);
  return env;
}

function runScript(script: string, scripts: Record<string, string>, env: NodeJS.ProcessEnv): ScriptRun {
  const command = scripts[script];
  if (command === undefined) return { script, status: "pending", ms: 0, exit: null, why: "not in package.json yet" };
  const entry = entryFile(command);
  if (entry && !existsSync(path.join(ROOT, entry))) return { script, status: "pending", ms: 0, exit: null, why: `${entry} not written yet` };
  const t0 = performance.now();
  const res = spawnSync(command, { cwd: ROOT, env, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const ms = Math.round(performance.now() - t0);
  const exit = res.status ?? (res.signal ? 128 : 1);
  if (VERBOSE || exit !== 0) {
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trimEnd();
    if (out && !JSON_OUT) console.log((VERBOSE ? out : out.split("\n").slice(-15).join("\n")).replace(/^/gm, "      | "));
  }
  return { script, status: "ran", ms, exit };
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function main(): void {
  const broken = selfCheck();
  if (broken.length) die(`self-check failed:\n  ${broken.join("\n  ")}`);
  const table = loadTable();
  let scripts: Record<string, string>;
  try {
    scripts = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch (e) {
    die(`cannot read package.json: ${e instanceof Error ? e.message : String(e)}`);
  }

  const problems = staticChecks(table, scripts);
  const staticCount = problems.length;
  const release = table.releases[table.current]!;
  const groups = groupsOf(table, table.current);
  const declared = groups.reduce((n, g) => n + g.budgetSec, 0);
  log(`test-budget: ${table.current} declares ${declared} s of ${release.ceilingSec} s (${groups.length} groups); ${Object.keys(table.releases).length} releases checked statically`);
  for (const p of problems) log(`  ✗ ${p}`);

  const runs: Record<string, ScriptRun[]> = {};
  const overGroups: string[] = [];
  let totalMs = 0;
  if (!STATIC) {
    const unknown = (ONLY ?? []).filter((id) => !groups.some((g) => g.id === id));
    if (unknown.length) die(`unknown group(s): ${unknown.join(", ")}`);
    const env = pathEnv();
    for (const g of groups) {
      if (ONLY && !ONLY.includes(g.id)) continue;
      log(`\n${g.id} (${g.owner}): budget ${g.budgetSec} s`);
      const list: ScriptRun[] = [];
      for (const s of g.scripts) {
        const r = runScript(s, scripts, env);
        list.push(r);
        if (r.status === "pending") log(`    ${s.padEnd(22)} pending (${r.why})`);
        else log(`    ${s.padEnd(22)} ${sec(r.ms).padStart(8)}${r.exit === 0 ? "" : `   exit ${r.exit} (its time still counts)`}`);
      }
      const ms = list.reduce((n, r) => n + r.ms, 0);
      totalMs += ms;
      runs[g.id] = list;
      const over = ms > g.budgetSec * 1000;
      if (over) overGroups.push(g.id);
      log(`  ${over ? "✗" : "✓"} ${g.id}: ${sec(ms)} of ${g.budgetSec} s`);
    }
    const all = !ONLY;
    const overCeiling = all && totalMs > release.ceilingSec * 1000;
    log(`\n${overCeiling ? "✗" : "✓"} total ${sec(totalMs)}${all ? ` of the ${release.ceilingSec} s ceiling` : " (subset: the ceiling is judged on a full run only)"}`);
    if (overCeiling) problems.push(`the chain took ${sec(totalMs)}, over the ${release.ceilingSec} s ceiling`);
    for (const id of overGroups) problems.push(`group ${id} is over its budget`);
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ release: table.current, ceilingSec: release.ceilingSec, declaredSec: declared, totalMs: STATIC ? null : totalMs, runs, problems }, null, 2));
  } else {
    for (const p of problems.slice(staticCount)) log(`  ✗ ${p}`);
    log(problems.length ? `\n${problems.length} problem(s)` : STATIC ? "✓ budget table consistent" : "✓ within budget");
  }
  process.exit(problems.length ? 1 : 0);
}

main();
