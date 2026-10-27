#!/usr/bin/env node
/**
 * The gated deploy archive (docs/STORE-SAAS.md §H.10, SEC-10; docs/HANDOFF.md §4 step 2): the zip Hostinger builds.
 *
 *   node scripts/deploy/archive.mjs <out.zip>        e.g. node scripts/deploy/archive.mjs ../storegen-deploy.zip
 *
 * It refuses (exit 1, nothing written) unless
 *   - `qa/.gate-ok` exists, names the current `git rev-parse HEAD` and is younger than 24 h (only a green
 *     `npm run gate` writes it: scripts/qa/gate-ok.ts);
 *   - the working tree is clean except `docs/saas/PROGRESS.md` (the lead's log, never committed), so the archive is
 *     exactly the commit the gate passed on;
 *   - no tracked file looks like a secret (`.env*` other than `.env.example`, `*.pem`);
 *   - the output path is outside the repository or git-ignored (an untracked zip would dirty the tree).
 * Then `git archive --format=zip HEAD` (tracked files only) plus `qa/.gate-ok` itself, so the boot log names the gate
 * commit (src/lib/db/boot-config.ts), and it prints the size and sha256. It never uploads (the lead does, HANDOFF §4)
 * and never reads an env file.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE_FILE = path.join(ROOT, "qa", ".gate-ok");
const GATE_MAX_AGE_MS = 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const ALLOWED_DIRTY = new Set(["docs/saas/PROGRESS.md"]);

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

function refuse(message, details = []) {
  console.error(`archive: ✗ ${message}`);
  for (const d of details.slice(0, 20)) console.error(`  ${d}`);
  if (details.length > 20) console.error(`  … ${details.length - 20} more`);
  process.exit(1);
}

/** Paths of `git status --porcelain=v1` (a rename lists both sides; quoted paths unquoted). */
function dirtyPaths(porcelain) {
  const out = [];
  for (const line of porcelain.split("\n")) {
    if (line.length < 4) continue;
    for (const part of line.slice(3).split(" -> ")) out.push((part.startsWith('"') ? JSON.parse(part) : part).replace(/\\/g, "/"));
  }
  return out;
}

const secretLike = (p) => {
  const base = p.split("/").pop() ?? p;
  return (base.startsWith(".env") && base !== ".env.example") || base.endsWith(".pem");
};

/** Entry names of a zip, from its central directory (enough to verify what git archive wrote). */
function zipEntries(file) {
  const buf = readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error(`bad central directory entry ${n}`);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    names.push(buf.toString("utf8", off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function main() {
  const outArg = process.argv[2];
  if (!outArg || outArg.startsWith("-")) refuse("usage: node scripts/deploy/archive.mjs <out.zip>");
  const out = path.resolve(outArg);
  if (!out.toLowerCase().endsWith(".zip")) refuse(`the output must be a .zip file, got ${outArg}`);
  if (!existsSync(path.dirname(out))) refuse(`the output folder does not exist: ${path.dirname(out)}`);

  // 1. HEAD and a clean tree
  const head = git("rev-parse", "HEAD").trim();
  if (!/^[0-9a-f]{40}$/.test(head)) refuse(`git rev-parse HEAD gave "${head}"`);
  const dirty = dirtyPaths(git("status", "--porcelain=v1", "--untracked-files=all")).filter((p) => !ALLOWED_DIRTY.has(p));
  if (dirty.length) refuse(`the tree has ${dirty.length} uncommitted change(s); commit them and run npm run gate again:`, dirty);

  // 2. the gate file: this HEAD, younger than 24 h
  if (!existsSync(GATE_FILE)) refuse("qa/.gate-ok is missing: run npm run gate (it writes the file when every step is green)");
  let gate;
  try {
    gate = JSON.parse(readFileSync(GATE_FILE, "utf8"));
  } catch {
    refuse("qa/.gate-ok is not valid JSON: run npm run gate again");
  }
  if (typeof gate?.sha !== "string" || gate.sha !== head) {
    refuse(`qa/.gate-ok names ${typeof gate?.sha === "string" ? gate.sha.slice(0, 12) : "no commit"}, not HEAD ${head.slice(0, 12)}: run npm run gate on this commit`);
  }
  const at = typeof gate.at === "string" ? Date.parse(gate.at) : NaN;
  if (!Number.isFinite(at)) refuse("qa/.gate-ok has no valid time (at): run npm run gate again");
  const age = Date.now() - at;
  if (age < -CLOCK_SKEW_MS) refuse(`qa/.gate-ok is dated in the future (${gate.at}): run npm run gate again`);
  if (age > GATE_MAX_AGE_MS) refuse(`qa/.gate-ok is ${(age / 3_600_000).toFixed(1)} h old (limit 24 h): run npm run gate again`);

  // 3. nothing secret is tracked
  const tracked = git("ls-tree", "-r", "--name-only", "-z", "HEAD").split("\0").filter(Boolean);
  const secrets = tracked.filter(secretLike);
  if (secrets.length) refuse("tracked files look like secrets; remove them from git first:", secrets);

  // 4. the output never dirties the tree
  const rel = path.relative(ROOT, out);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    let ignored = true;
    try {
      git("check-ignore", "-q", "--no-index", rel.replace(/\\/g, "/"));
    } catch {
      ignored = false;
    }
    if (!ignored) refuse(`${rel} is inside the repository and not git-ignored; write the archive outside it (e.g. ../storegen-deploy.zip)`);
  }

  // 5. the archive: tracked files of HEAD + qa/.gate-ok (the last --prefix wins for the tree, so it stays at the root)
  rmSync(out, { force: true });
  git("archive", "--format=zip", "-o", out, "--prefix=qa/", "--add-file=qa/.gate-ok", "--prefix=", "HEAD");

  const names = zipEntries(out);
  const files = names.filter((n) => !n.endsWith("/"));
  const problems = [];
  if (!names.includes("qa/.gate-ok")) problems.push("qa/.gate-ok is not in the archive");
  if (!names.includes("package.json")) problems.push("package.json is not at the archive root");
  const leaked = files.filter(secretLike);
  if (leaked.length) problems.push(`secret-like entries: ${leaked.join(", ")}`);
  const trackedSet = new Set(tracked);
  const extra = files.filter((n) => n !== "qa/.gate-ok" && !trackedSet.has(n));
  if (extra.length) problems.push(`entries that are not tracked files: ${extra.slice(0, 5).join(", ")}`);
  if (files.length !== tracked.length + 1) problems.push(`${files.length} files in the archive, expected ${tracked.length} tracked + qa/.gate-ok`);
  if (problems.length) {
    rmSync(out, { force: true });
    refuse("the archive failed its own check (removed):", problems);
  }

  const bytes = statSync(out).size;
  const sha256 = createHash("sha256").update(readFileSync(out)).digest("hex");
  console.log(`archive: ✓ ${out}`);
  console.log(`  commit  ${head}`);
  console.log(`  gate    passed ${(age / 3_600_000).toFixed(1)} h ago`);
  console.log(`  files   ${files.length} (${tracked.length} tracked + qa/.gate-ok)`);
  console.log(`  size    ${bytes} bytes (${(bytes / 1_048_576).toFixed(1)} MiB)`);
  console.log(`  sha256  ${sha256}`);
}

main();
