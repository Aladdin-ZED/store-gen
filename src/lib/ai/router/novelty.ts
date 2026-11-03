/**
 * Generated-line novelty before display (P7 AI; ai.md AI-§D.2 rule 13, AI-02 (9); core §M.4 N8; QUAL-1). Isomorphic
 * and pure: every outside call is injected, so P7 never imports a design server action.
 *
 *   const r = await noveltyPass(lines, { check, reask, engineLine, libraryLine });
 *   r.lines["hero.headline"]   → { text, origin }   (origin "engine" / "library" when the line was replaced)
 *   r.flags                    → ["novelty_reasked", "novelty_replaced"] as they happened
 *
 * Only the AI-written headlines and leads (origin `cloud` or `local`) are checked. A line whose verdict is `close`
 * (containment > 0.35) or whose niche band is `high` (share > 25 %) is re-asked once (`reask`: copy.field with intent
 * `differentiate`, inside the run's deadline); the new line is checked again, and if it still collides (or the re-ask
 * gave nothing) it is replaced by the engine's generator line (`engineLine`, design's `rewriteLine`, origin `engine`)
 * or, when the generator has none, by the library line (origin `library`). The check is advisory where it cannot run
 * (a throw: no network, the bucket exhausted): the lines ship as they are and the publish dialog's N8 item is the
 * fallback; the pass never blocks the wizard's "Next". Step 10's `useNoveltyGuard` wraps this pass.
 */
import type { CopyOrigin } from "../provider/types";

export type NoveltyBand = "low" | "mid" | "high";
/** design's `checkHeadlineNovelty` answer for one line (bands only, over ≥ 10 owners; else null) */
export interface NoveltyVerdict {
  verdict: "ok" | "close";
  band: NoveltyBand | null;
}

export interface NoveltyLine {
  /** the field path ("hero.headline", "benefits.lead") */
  path: string;
  text: string;
  origin: CopyOrigin;
}

export interface NoveltyDeps {
  /** one verdict per text, in order (≤ 60 texts per call) */
  check: (texts: readonly string[]) => Promise<readonly NoveltyVerdict[]>;
  /** the one re-ask of a colliding line (copy.field `differentiate`); null when it gave nothing usable */
  reask: (line: NoveltyLine) => Promise<string | null>;
  /** design's generator line with another structure (origin `engine`); null when it has none */
  engineLine: (line: NoveltyLine) => string | null;
  /** the library line for the field (origin `library`) */
  libraryLine: (line: NoveltyLine) => string | null;
}

export type NoveltyFlag = "novelty_reasked" | "novelty_replaced";

export interface NoveltyResult {
  lines: Record<string, { text: string; origin: CopyOrigin }>;
  flags: NoveltyFlag[];
  /** the paths re-asked, and those finally replaced */
  reasked: string[];
  replaced: string[];
  /** the check could not run: the lines shipped unchecked */
  advisory: boolean;
}

/** `close` or the `high` band: the line would meet a hard N8 at publish. */
export const collides = (v: NoveltyVerdict | undefined): boolean => v !== undefined && (v.verdict === "close" || v.band === "high");

const isAi = (o: CopyOrigin) => o === "cloud" || o === "local";

export async function noveltyPass(lines: readonly NoveltyLine[], deps: NoveltyDeps): Promise<NoveltyResult> {
  const out: NoveltyResult = { lines: Object.fromEntries(lines.map((l) => [l.path, { text: l.text, origin: l.origin }])), flags: [], reasked: [], replaced: [], advisory: false };
  const ai = lines.filter((l) => isAi(l.origin) && l.text.trim());
  if (!ai.length) return out;
  let first: readonly NoveltyVerdict[];
  try {
    first = await deps.check(ai.map((l) => l.text));
  } catch {
    out.advisory = true;
    return out;
  }
  const hits = ai.filter((_, i) => collides(first[i]));
  if (!hits.length) return out;

  // one re-ask per colliding line, then one check of every new line together
  const again = await Promise.all(hits.map(async (l) => ({ line: l, text: await deps.reask(l).catch(() => null) })));
  out.reasked = hits.map((l) => l.path);
  out.flags.push("novelty_reasked");
  const asked = again.filter((a): a is { line: NoveltyLine; text: string } => typeof a.text === "string" && a.text.trim() !== "");
  let second: readonly NoveltyVerdict[] = [];
  let checked = true;
  try {
    second = asked.length ? await deps.check(asked.map((a) => a.text)) : [];
  } catch {
    checked = false;
  }
  for (const a of again) {
    const k = asked.indexOf(a as { line: NoveltyLine; text: string });
    if (k >= 0 && (!checked || !collides(second[k]))) {
      // an unchecked re-ask ships as AI text, advisory like a first line the check could not read
      out.lines[a.line.path] = { text: asked[k]!.text, origin: a.line.origin };
      if (!checked) out.advisory = true;
      continue;
    }
    const engine = deps.engineLine(a.line);
    const library = engine === null ? deps.libraryLine(a.line) : null;
    if (engine !== null) out.lines[a.line.path] = { text: engine, origin: "engine" };
    else if (library !== null) out.lines[a.line.path] = { text: library, origin: "library" };
    else continue;
    out.replaced.push(a.line.path);
  }
  if (out.replaced.length) out.flags.push("novelty_replaced");
  return out;
}
