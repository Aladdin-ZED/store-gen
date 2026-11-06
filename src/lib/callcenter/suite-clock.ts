/**
 * The operations suites' shared wall-time ceiling (P4 CALL CENTER; operations.md OPE-§O.1, ENGP-24): `test:state`,
 * `test:ops` and `test:profit` together stay ≤ 25 s. Each suite records its own wall time in
 * `qa/.ops-suite-times.json` (git-ignored) and fails when the fresh times of the three (recorded in the last 15
 * minutes, i.e. the same `npm test` run) add up to more than the ceiling. Test-only (node:fs); no app module imports it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OPS_SUITES_CEILING_MS = 25_000;
const FRESH_MS = 15 * 60_000;
const FILE = join(process.cwd(), "qa", ".ops-suite-times.json");

/** Records `name`'s wall time and answers the three suites' fresh total (this one included). */
export function recordSuiteTime(name: "state" | "ops" | "profit", ms: number): { totalMs: number; parts: Record<string, number>; over: boolean } {
  let all: Record<string, { ms: number; at: number }> = {};
  try {
    all = JSON.parse(readFileSync(FILE, "utf8")) as typeof all;
  } catch {
    all = {};
  }
  const now = Date.now();
  all[name] = { ms: Math.round(ms), at: now };
  try {
    mkdirSync(join(process.cwd(), "qa"), { recursive: true });
    writeFileSync(FILE, JSON.stringify(all));
  } catch {
    // a read-only checkout still runs the suite; only the shared total is lost
  }
  const parts: Record<string, number> = {};
  for (const [k, v] of Object.entries(all)) if (now - v.at <= FRESH_MS) parts[k] = v.ms;
  const totalMs = Object.values(parts).reduce((a, b) => a + b, 0);
  return { totalMs, parts, over: totalMs > OPS_SUITES_CEILING_MS };
}
