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
 * fallback; the pass never blocks the wizard's "Next".
 *
 * `guardNovelty(lines, origin, deps)` (step 10) wires the pass for the browser: `check` is design's
 * `checkHeadlinesAction(niche, texts)` and `engineLine` design's `rewriteLine`, both INJECTED by the wizard (P6 owns
 * the call site; P7 never imports a design server action); the re-ask is `copy.field` with intent `differentiate`
 * (the line's structure tag and the line itself in `mustAvoid`) through the client ladder, cut at the run's deadline;
 * the result updates the draft's `CopyOrigin` map. `useNoveltyGuard` is its hook.
 */
import { useCallback, useMemo, useState } from "react";
import type { AiPolicy, DeviceInfo } from "../policy";
import type { AiOutcome, CopyOrigin } from "../provider/types";
import { headlineStructureOf } from "../schema/tasks/copy-hero";
import type { CopyLocale } from "../prompts";
import type { FieldRewriteInput, FieldRewriteOut } from "../schema/tasks/copy-field";
import { runAiOnce } from "./client";

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

/* ------------------------------------------------------------------ */
/* The browser wiring (step 10)                                        */
/* ------------------------------------------------------------------ */

/** What design's `checkHeadlinesAction` answers (an `ActionResult`), or a plain verdict list. */
export type HeadlineCheckAnswer = { ok: true; data: readonly NoveltyVerdict[] } | { ok: false } | readonly NoveltyVerdict[];
export type HeadlineCheck = (niche: string, texts: readonly string[]) => Promise<HeadlineCheckAnswer>;

/** design's action takes ≤ 60 lines per call */
export const NOVELTY_CHECK_BATCH = 60;

/** The field maxima a re-ask is held to (AiCopy / PageCopy): a headline 84, a title 90, a sub 190, a lead 220. */
export function noveltyMaxFor(path: string): number {
  const leaf = path.split(".").pop() ?? path;
  if (leaf === "headline") return 84;
  if (leaf === "title" || leaf.endsWith("_title")) return 90;
  if (leaf === "sub") return 190;
  if (leaf === "lead") return 220;
  return 120;
}

export interface NoveltyGuardDeps {
  /** design's `checkHeadlinesAction` (injected) */
  check: HeadlineCheck;
  /** design's `rewriteLine` (injected): the generator's line with another structure, or null */
  engineLine: (line: NoveltyLine) => string | null;
  /** the library line for the field (origin `library`), or null */
  libraryLine?: (line: NoveltyLine) => string | null;
  niche: string;
  locale: CopyLocale;
  product: { name: string; facts: string[] };
  /** the one re-ask (copy.field `differentiate`): the client ladder in the browser, a stub in test:ai */
  rewrite: (input: FieldRewriteInput, signal: AbortSignal) => Promise<AiOutcome<FieldRewriteOut>>;
  /** the run's deadline (epoch ms): a re-ask past it gives nothing (the engine or library line is used) */
  deadlineAt?: number;
  now?: () => number;
  maxFor?: (path: string) => number;
}

/** Unwraps the action's answer; anything else throws, so the pass turns advisory. */
async function verdictsOf(check: HeadlineCheck, niche: string, texts: readonly string[]): Promise<NoveltyVerdict[]> {
  const out: NoveltyVerdict[] = [];
  for (let i = 0; i < texts.length; i += NOVELTY_CHECK_BATCH) {
    const part = texts.slice(i, i + NOVELTY_CHECK_BATCH);
    const a = await check(niche, part);
    const list: readonly NoveltyVerdict[] | null = Array.isArray(a) ? (a as readonly NoveltyVerdict[]) : "ok" in a && a.ok ? a.data : null;
    if (!list || list.length !== part.length) throw new Error("novelty check unavailable");
    out.push(...list);
  }
  return out;
}

/** The re-ask input of one colliding line (AI-§D.2 rule 13): its structure tag and the line itself to avoid. */
export function reaskInput(line: NoveltyLine, deps: Pick<NoveltyGuardDeps, "locale" | "product" | "maxFor">): FieldRewriteInput {
  return {
    locale: deps.locale,
    field: line.path,
    text: line.text.slice(0, 1_200),
    max: (deps.maxFor ?? noveltyMaxFor)(line.path),
    intent: "differentiate",
    targetLocale: null,
    product: { name: deps.product.name.slice(0, 120), facts: deps.product.facts.slice(0, 6) },
    mustAvoid: [headlineStructureOf(line.text, deps.locale), line.text.slice(0, 200)],
  };
}

/** The novelty pass with the injected check, the copy.field re-ask inside the deadline, and the origin map updated. */
export async function guardNovelty(
  lines: readonly NoveltyLine[],
  origin: Readonly<Record<string, CopyOrigin>>,
  deps: NoveltyGuardDeps,
): Promise<NoveltyResult & { origin: Record<string, CopyOrigin> }> {
  const now = deps.now ?? (() => Date.now());
  const result = await noveltyPass(lines, {
    check: (texts) => verdictsOf(deps.check, deps.niche, texts),
    reask: async (line) => {
      const left = deps.deadlineAt === undefined ? 20_000 : deps.deadlineAt - now();
      if (left <= 0) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort("timeout"), left);
      try {
        const out = await deps.rewrite(reaskInput(line, deps), ctrl.signal);
        return out.ok ? (out.value.variants.find((v) => v.trim()) ?? null) : null;
      } finally {
        clearTimeout(timer);
      }
    },
    engineLine: deps.engineLine,
    libraryLine: deps.libraryLine ?? (() => null),
  });
  const next: Record<string, CopyOrigin> = { ...origin };
  for (const [path, l] of Object.entries(result.lines)) next[path] = l.origin;
  return { ...result, origin: next };
}

export interface NoveltyGuardState {
  status: "idle" | "checking" | "done";
  result: NoveltyResult | null;
}

/**
 * The hook the wizard mounts (P6 injects `check` and `engineLine`). `guard(lines, origin, run)` never blocks the
 * wizard's "Next": the caller shows the lines it has and applies the answer when it comes.
 */
export function useNoveltyGuard(o: {
  check: HeadlineCheck;
  engineLine: (line: NoveltyLine) => string | null;
  libraryLine?: (line: NoveltyLine) => string | null;
  niche: string;
  handle: string;
  policy: AiPolicy;
  device: DeviceInfo;
}): {
  state: NoveltyGuardState;
  guard(
    lines: readonly NoveltyLine[],
    origin: Readonly<Record<string, CopyOrigin>>,
    run: { locale: CopyLocale; product: { name: string; facts: string[] }; deadlineAt?: number },
  ): Promise<NoveltyResult & { origin: Record<string, CopyOrigin> }>;
} {
  const [state, setState] = useState<NoveltyGuardState>({ status: "idle", result: null });
  const { check, engineLine, libraryLine, niche, handle, policy, device } = o;
  const guard = useCallback(
    async (lines: readonly NoveltyLine[], origin: Readonly<Record<string, CopyOrigin>>, run: { locale: CopyLocale; product: { name: string; facts: string[] }; deadlineAt?: number }) => {
      setState((s) => ({ ...s, status: "checking" }));
      const r = await guardNovelty(lines, origin, {
        check,
        engineLine,
        ...(libraryLine ? { libraryLine } : {}),
        niche,
        locale: run.locale,
        product: run.product,
        ...(run.deadlineAt !== undefined ? { deadlineAt: run.deadlineAt } : {}),
        rewrite: (input, signal) => runAiOnce("copy.field", input, { surface: "wizard", signal }, { handle, policy, device }),
      });
      setState({ status: "done", result: r });
      return r;
    },
    [check, engineLine, libraryLine, niche, handle, policy, device],
  );
  return useMemo(() => ({ state, guard }), [state, guard]);
}
