/**
 * The library provider (P7 AI; ai.md AI-§A.5, AI-§A.4 "the library rung never fails"). Isomorphic and pure: it wraps
 * the deterministic code of ./library-tasks.ts, never fails for a task it supports and costs nothing.
 *
 *   - copy.page → `libraryCopy()` projected to the AiCopy keys (the same merge path runs on the client);
 *   - copy.hero → the library hero of the direction's slot;
 *   - copy.field → the same field from 3 other seeds (until design's structure-tagged library, DG-07);
 *   - design.plan → the engine's archetype ranking as three slot briefs with empty hints (read-only: nothing is read
 *     from a photo), so the wizard code path is one whether the Director ran or not;
 *   - callcenter.script → the built-in template script (`libraryScript`; P4's src/lib/callcenter/script-builtins.ts is
 *     not in this base: the router switches to it at the R1 integration, CCR r1-p7-6);
 *   - ad.brief → an empty `AdBriefOut` (no angle, no checklist), so P3's template kit stays the per-field fallback through
 *     `mergeAdBrief`;
 *   - injection.screen → the keyword heuristic of AI-§E.3.
 * Every other task is not supported here (`supports` says so, and the caller keeps its own fallback).
 */
import type { ProductCategory } from "@/lib/page/schema";
import type { AiTaskId } from "../tasks";
import { libraryCopyPage, libraryField, libraryHero, libraryPlan, libraryScreen, libraryScript } from "./library-tasks";
import type { AiOutcome, AiProvider, AiResult, AiRunContext, AiRunOpts, AiSupport, AiTaskInput, AiTaskOutput } from "./types";

/** What the library needs beside the input (the router knows it from the store and the run). */
export interface LibraryRunOpts {
  /** deterministic per input (the router derives it from the input hash) */
  seed: number;
  hasWhatsapp: boolean;
  /** copy.field: the product's category (the field rewrite input carries none) */
  category?: ProductCategory;
}

export const LIBRARY_TASKS: ReadonlySet<AiTaskId> = new Set<AiTaskId>(["copy.page", "copy.hero", "copy.field", "design.plan", "callcenter.script", "ad.brief", "injection.screen"]);

export const LIBRARY_PROMPT_VERSION = "library";

/** The library's answer for a supported task, or null (unsupported). Never throws on a valid input. */
export function libraryValue<T extends AiTaskId>(task: T, input: AiTaskInput<T>, opts: LibraryRunOpts): AiTaskOutput<T> | null {
  const lib = { seed: opts.seed, hasWhatsapp: opts.hasWhatsapp };
  switch (task) {
    case "copy.page":
      return libraryCopyPage(input as AiTaskInput<"copy.page">, lib) as AiTaskOutput<T>;
    case "copy.hero":
      return libraryHero(input as AiTaskInput<"copy.hero">, lib) as AiTaskOutput<T>;
    case "copy.field":
      return libraryField(input as AiTaskInput<"copy.field">, { ...lib, category: opts.category ?? "other" }) as AiTaskOutput<T>;
    case "design.plan":
      return libraryPlan(input as AiTaskInput<"design.plan">) as AiTaskOutput<T>;
    case "callcenter.script":
      return libraryScript(input as AiTaskInput<"callcenter.script">) as AiTaskOutput<T>;
    case "ad.brief": {
      const i = input as AiTaskInput<"ad.brief">;
      return { basedOnVersionId: i.basedOnVersionId, angles: [], filmChecklist: [] } as AiTaskOutput<T>;
    }
    case "injection.screen":
      return libraryScreen(input as AiTaskInput<"injection.screen">) as AiTaskOutput<T>;
    default:
      return null;
  }
}

/** The library rung's result (provider "library", 0 credits, no model). */
export function libraryResult<T extends AiTaskId>(task: T, input: AiTaskInput<T>, opts: LibraryRunOpts & { ms?: number; notes?: AiResult<unknown>["notes"] }): AiOutcome<AiTaskOutput<T>> {
  const started = Date.now();
  let value: AiTaskOutput<T> | null = null;
  try {
    value = libraryValue(task, input, opts);
  } catch {
    value = null;
  }
  if (value === null) return { ok: false, code: "unknown", retryable: false, provider: "library", runId: null };
  return {
    ok: true,
    value,
    provider: "library",
    class: null,
    model: null,
    effort: null,
    promptVersion: LIBRARY_PROMPT_VERSION,
    rubricVersion: null,
    runId: null,
    jobId: null,
    usage: null,
    ms: opts.ms ?? Date.now() - started,
    ttftMs: null,
    rejected: [],
    flags: [],
    notes: opts.notes ?? [],
  };
}

/** A seed from a hex digest (the input hash): stable per input, so "Write again" without the cloud is stable too. */
export const seedOf = (hex: string): number => parseInt(hex.slice(0, 8), 16) % 1_000_000;

/** The library rung as an `AiProvider` (the browser's ladder and the server's `server-then-library`). */
export function libraryProvider(opts: (ctx: AiRunContext) => LibraryRunOpts): AiProvider {
  return {
    id: "library",
    supports(task: AiTaskId): AiSupport {
      return LIBRARY_TASKS.has(task) ? { ok: true } : { ok: false, code: "unknown" };
    },
    async run<T extends AiTaskId>(task: T, input: AiTaskInput<T>, ctx: AiRunContext, _o: AiRunOpts): Promise<AiOutcome<AiTaskOutput<T>>> {
      void _o;
      return libraryResult(task, input, opts(ctx));
    },
  };
}
