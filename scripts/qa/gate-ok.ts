/**
 * The last step of `npm run gate` (docs/STORE-SAAS.md §J.5, §H.10; SEC-10): every earlier step was green, so this
 * writes `qa/.gate-ok` = `{ "sha": <git rev-parse HEAD>, "at": <ISO time>, "stubBuild"?: true }`.
 * `scripts/deploy/archive.mjs` refuses to build a deploy archive without that file for the current HEAD, younger than
 * 24 h, or with `stubBuild: true`; the archive carries it so the boot log (`src/lib/db/boot-config.ts`) names the
 * commit the gate passed on.
 *
 * `stubBuild` (STUB-BUILD LOCK, P0 maintainer decision 5; docs/STORE-SAAS.md §K.2 P0 stub rule, §H.10) is written
 * whenever design's height model is still the P0 stub. It asks the module (`heightModelIsStub()`), never
 * SG_STUB_BUILD_OK: a gate that ran with the variable proves a merge, not that the build may ship.
 *
 *   npx tsx scripts/qa/gate-ok.ts            (only as the tail of `npm run gate`)
 *
 * It refuses (exit 1, no file written, an older file removed) when the working tree has changes other than
 * `docs/saas/PROGRESS.md` (the lead's log, never committed): a gate run on uncommitted code says nothing about HEAD.
 * No secrets are read or written.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { heightModelIsStub } from "@/lib/render/prepublish/budget-limits";

const ROOT = path.resolve(__dirname, "..", "..");
const GATE_FILE = path.join(ROOT, "qa", ".gate-ok");
/** the one path the lead edits during a workflow without committing it */
const ALLOWED_DIRTY = new Set(["docs/saas/PROGRESS.md"]);

const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

/** Paths of `git status --porcelain` (untracked included, ignored excluded); a rename lists both sides. */
function dirtyPaths(porcelain: string): string[] {
  const out: string[] = [];
  for (const line of porcelain.split("\n")) {
    if (line.length < 4) continue;
    const rest = line.slice(3);
    for (const part of rest.split(" -> ")) {
      const p = part.startsWith('"') ? (JSON.parse(part) as string) : part;
      out.push(p.replace(/\\/g, "/"));
    }
  }
  return out;
}

function main(): void {
  const sha = git("rev-parse", "HEAD").trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`git rev-parse HEAD gave "${sha}"`);
  const dirty = dirtyPaths(git("status", "--porcelain=v1", "--untracked-files=all")).filter((p) => !ALLOWED_DIRTY.has(p));
  if (dirty.length) {
    rmSync(GATE_FILE, { force: true });
    console.error(`gate-ok: ✗ the tree has ${dirty.length} uncommitted change(s), so the gate did not test HEAD ${sha.slice(0, 7)}; commit them and run the gate again:`);
    for (const p of dirty.slice(0, 20)) console.error(`  ${p}`);
    if (dirty.length > 20) console.error(`  … ${dirty.length - 20} more`);
    process.exit(1);
  }
  const stubBuild = heightModelIsStub();
  const body = `${JSON.stringify({ sha, at: new Date().toISOString(), ...(stubBuild ? { stubBuild: true } : {}) })}\n`;
  mkdirSync(path.dirname(GATE_FILE), { recursive: true });
  const tmp = `${GATE_FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, body, { mode: 0o644 });
  renameSync(tmp, GATE_FILE);
  if (stubBuild) console.log(`gate-ok: ✓ qa/.gate-ok names ${sha}, marked stubBuild (the P0 height stub): scripts/deploy/archive.mjs refuses it`);
  else console.log(`gate-ok: ✓ qa/.gate-ok names ${sha} (valid 24 h for scripts/deploy/archive.mjs)`);
}

main();
