/**
 * The deploy archive's gate-file rule (maintainer; docs/STORE-SAAS.md §H.10, SEC-10, §K.2 P0 stub rule; P0 maintainer
 * decision 5), as a pure function so `test:prepublish` can prove it without a git tree. scripts/deploy/archive.mjs
 * refuses to build an archive whenever this answers a problem:
 *   - `qa/.gate-ok` must name the current HEAD and be younger than 24 h (only a green `npm run gate` writes it);
 *   - it must not say `stubBuild: true`: scripts/qa/gate-ok.ts writes that while design's height model is the P0
 *     stub, i.e. the D52 budget gate only writes notes, so the build must never ship (STUB-BUILD LOCK).
 */

export const GATE_MAX_AGE_MS = 24 * 60 * 60_000;
export const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * @param {unknown} gate the parsed `qa/.gate-ok`
 * @param {{ head: string; now: number }} at the current HEAD sha and the time (ms)
 * @returns {string | null} why the archive is refused, or null
 */
export function gateFileProblem(gate, { head, now }) {
  const g = gate && typeof gate === "object" ? /** @type {Record<string, unknown>} */ (gate) : null;
  if (!g || typeof g.sha !== "string" || g.sha !== head) {
    return `qa/.gate-ok names ${typeof g?.sha === "string" ? g.sha.slice(0, 12) : "no commit"}, not HEAD ${head.slice(0, 12)}: run npm run gate on this commit`;
  }
  const at = typeof g.at === "string" ? Date.parse(g.at) : NaN;
  if (!Number.isFinite(at)) return "qa/.gate-ok has no valid time (at): run npm run gate again";
  const age = now - at;
  if (age < -CLOCK_SKEW_MS) return `qa/.gate-ok is dated in the future (${g.at}): run npm run gate again`;
  if (age > GATE_MAX_AGE_MS) return `qa/.gate-ok is ${(age / 3_600_000).toFixed(1)} h old (limit 24 h): run npm run gate again`;
  if (g.stubBuild === true) {
    return "qa/.gate-ok says stubBuild: true: this commit still has design's P0 height stub (src/lib/design/heights.ts), so its D52 budget gate only writes notes; it is never archived or deployed (STUB-BUILD LOCK, docs/STORE-SAAS.md §K.2)";
  }
  return null;
}
