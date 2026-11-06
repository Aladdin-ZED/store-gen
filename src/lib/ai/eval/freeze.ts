/**
 * Freezes the prompt artifacts (P7 AI; ai.md AI-§F.1, AI-07 (2)):
 *   npx tsx src/lib/ai/eval/freeze.ts            records the hash of every NEW prompt version in
 *                                                 src/lib/ai/prompts/hashes.json and cuts every missing library
 *                                                 baseline (src/lib/ai/eval/sets/<family>/baseline/library@<hash>.json)
 *   npx tsx src/lib/ai/eval/freeze.ts --check    writes nothing; exits 1 when something is missing or changed
 *   npx tsx src/lib/ai/eval/freeze.ts --vocab    (the R1 integration, once P6's vocabulary is real) re-records the
 *                                                 Director versions whose own text is unchanged (`vocabDrift`)
 *
 * It refuses, and changes nothing, when a recorded version's hash changed (a prompt edit needs a new version
 * string) or a recorded version is gone (retired versions stay). An existing baseline file is never rewritten.
 * `writeBaselineOnce` is the one writer the live runs (step 8) use for `baseline/<version>.json`.
 * Node only (file access); never imported by the app.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { R1_FAMILIES, manifestProblems, templateHashes, type R1Family } from "../prompts/registry";
import { baselineName, libraryBaseline, type BaselineFile } from "./baseline";
import { fixturesHash } from "./fixtures";

const ROOT = process.cwd();
export const HASHES_PATH = join(ROOT, "src/lib/ai/prompts/hashes.json");
export const setDir = (family: R1Family) => join(ROOT, "src/lib/ai/eval/sets", family);
export const baselinePath = (family: R1Family, version: string, hash?: string) => join(setDir(family), "baseline", baselineName(version, hash));

export function readManifest(): Record<string, string> {
  return existsSync(HASHES_PATH) ? (JSON.parse(readFileSync(HASHES_PATH, "utf8")) as Record<string, string>) : {};
}

/** One output per line, so a diff names the fixture that changed. */
export function serializeBaseline(b: BaselineFile): string {
  const head = JSON.stringify({ family: b.family, version: b.version, source: b.source, fixturesHash: b.fixturesHash });
  const lines = Object.keys(b.outputs)
    .sort()
    .map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(b.outputs[id])}`);
  return `${head.slice(0, -1)},\n  "outputs": {\n${lines.join(",\n")}\n  }\n}\n`;
}

/** Writes a baseline file unless it exists (never regenerated). */
export function writeBaselineOnce(path: string, b: BaselineFile): "written" | "exists" {
  if (existsSync(path)) return "exists";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeBaseline(b), { flag: "wx" });
  return "written";
}

function main(): void {
  const check = process.argv.includes("--check");
  const recorded = readManifest();
  const now = templateHashes();
  const { changed, vocabDrift, removed, unrecorded: added } = manifestProblems(recorded, now);
  const problems = [
    ...removed.map((v) => `${v} is recorded but no longer registered (versions are never removed)`),
    ...changed.map((v) => `${v} changed (recorded ${recorded[v]!.slice(0, 12)}, now ${now[v]!.slice(0, 12)}): a prompt edit needs a new version string`),
  ];
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exit(1);
  }
  const rerecord = process.argv.includes("--vocab") ? vocabDrift : [];
  if (vocabDrift.length && !rerecord.length) {
    console.error(`✗ design's vocabulary changed since ${vocabDrift.join(", ")} were cut: cut the next Director versions, or re-record them with --vocab at the R1 integration (they never served traffic)`);
    if (!check) process.exit(1);
  }
  const missing = R1_FAMILIES.filter((f) => !existsSync(baselinePath(f, "library", fixturesHash(f))));
  if (check) {
    for (const v of added) console.error(`✗ ${v} has no recorded hash`);
    for (const f of missing) console.error(`✗ ${f} has no library baseline for its current fixtures`);
    if (added.length || missing.length || vocabDrift.length) process.exit(1);
    console.log("✓ prompt hashes and library baselines are frozen");
    return;
  }
  if (added.length || rerecord.length) {
    const redo = new Set(rerecord.flatMap((v) => [v, `${v}#vocab`]));
    const next = Object.fromEntries(
      Object.keys({ ...recorded, ...now })
        .sort()
        .map((v) => [v, redo.has(v) ? now[v]! : (recorded[v] ?? now[v]!)]),
    );
    writeFileSync(HASHES_PATH, `${JSON.stringify(next, null, 2)}\n`);
    if (added.length) console.log(`recorded ${added.length} new entr${added.length === 1 ? "y" : "ies"}: ${added.join(", ")}`);
    if (rerecord.length) console.log(`re-recorded after design's vocabulary changed: ${rerecord.join(", ")}`);
  }
  for (const f of missing) {
    const b = libraryBaseline(f);
    console.log(`${f}: ${writeBaselineOnce(baselinePath(f, "library", b.fixturesHash), b)} ${baselineName("library", b.fixturesHash)} (${Object.keys(b.outputs).length} fixtures)`);
  }
  if (!added.length && !missing.length && !rerecord.length) console.log("nothing to freeze");
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/lib/ai/eval/freeze.ts")) main();
