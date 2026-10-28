#!/usr/bin/env node
/**
 * Refresh the vendored disposable e-mail domain list (docs/STORE-SAAS.md §F.8; platform.md PLA-§3.4.1, PLA-§P.1).
 * Manual, never run by a build or a test, never imported at runtime: the app reads only the committed
 * src/lib/platform/data/disposable-domains.json.
 *
 *   node scripts/platform/refresh-disposable.mjs            # fetch upstream, print the diff, change nothing
 *   node scripts/platform/refresh-disposable.mjs --write    # the same, then write the JSON (curated: false)
 *   node scripts/platform/refresh-disposable.mjs --all      # print every added / removed domain, not the first 40
 *
 * Source: the CC0-1.0 list of github.com/disposable-email-domains/disposable-email-domains
 * (`disposable_email_blocklist.conf`, one lower-case domain per line). Lines that are not a plain domain are dropped
 * and counted. Review the printed diff before committing the written file.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM = "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";
const SOURCE = "https://github.com/disposable-email-domains/disposable-email-domains (disposable_email_blocklist.conf)";
const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "lib", "platform", "data", "disposable-domains.json");
const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;
const SHOW = 40;

const args = new Set(process.argv.slice(2));
const write = args.has("--write");
const all = args.has("--all");

const current = JSON.parse(readFileSync(FILE, "utf8"));
const before = new Set(current.domains);

let text;
try {
  const res = await fetch(UPSTREAM, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "store-gen refresh-disposable" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  text = await res.text();
} catch (err) {
  console.error(`✗ could not fetch the upstream list (${err instanceof Error ? err.message : String(err)}); nothing changed`);
  process.exit(1);
}

let dropped = 0;
const after = new Set();
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim().toLowerCase();
  if (!line || line.startsWith("#")) continue;
  if (DOMAIN_RE.test(line)) after.add(line);
  else dropped++;
}
if (after.size < 1_000) {
  console.error(`✗ upstream answered only ${after.size} domains: refusing to use it; nothing changed`);
  process.exit(1);
}

const added = [...after].filter((d) => !before.has(d)).sort();
const removed = [...before].filter((d) => !after.has(d)).sort();
const list = (items) => (all || items.length <= SHOW ? items : [...items.slice(0, SHOW), `… and ${items.length - SHOW} more (--all prints every one)`]);

console.log(`disposable domains: ${before.size} committed (${current.curated ? "curated subset" : `upstream of ${current.updated}`}), ${after.size} upstream, ${dropped} upstream lines dropped`);
console.log(`+ ${added.length} added`);
for (const d of list(added)) console.log(`  + ${d}`);
console.log(`- ${removed.length} removed`);
for (const d of list(removed)) console.log(`  - ${d}`);

if (!write) {
  console.log("dry run: nothing written (pass --write to replace the JSON)");
  process.exit(0);
}
const next = {
  source: SOURCE,
  license: "CC0-1.0",
  curated: false,
  updated: new Date().toISOString().slice(0, 10),
  note: "The upstream CC0 list as fetched by scripts/platform/refresh-disposable.mjs. Never fetched at runtime.",
  domains: [...after].sort(),
};
writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);
console.log(`✓ wrote ${next.domains.length} domains to ${FILE}`);
