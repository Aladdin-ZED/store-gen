/**
 * Recorded outputs (P7 AI; ai.md AI-§F.1, AI-§F.6 "offline", AI-§F.10; AI-07 (1)). Isomorphic and pure; the files
 * live at `src/lib/ai/eval/sets/<family>/recorded/<version>.json` and are read by `scripts/qa/ai-eval.ts --offline`.
 *
 * A recorded file holds what one prompt version answered over one family's fixtures, run by run: the raw output (what
 * the model wrote, before any guard), the usage the cost is derived from, the wall clock, the stop reason, the run's
 * canary token (Director families) and, for an infra failure, the error (never scored: `errors.jsonl`).
 *
 * R1 has no API key, so the R1 files are hand-authored (`synthetic: true`, ./synthetic.ts): every run carries a
 * one-line `why` (a clean pass, or the failure it plants and which guard rule must catch it). A live run with
 * `--record` (step 8) replaces a synthetic file with a real recording, never the other way round.
 */
import type { R1Family } from "../prompts/registry";

export interface RecordedUsage {
  /** the served model (asserted against the requested one, AI-§F.10) */
  model: string;
  inTok: number;
  outTok: number;
  cacheReadTok: number;
  cacheWrite5mTok?: number;
  cacheWrite1hTok?: number;
  /** the thinking part of `outTok` (`thinkingShare`) */
  thinkingTok?: number;
}

/** "max_tokens" is recorded as `status: truncated` (AI-§F.10) */
export type StopReason = "end_turn" | "refusal" | "max_tokens";

export interface RecordedRun {
  /** the raw output; null for a refusal or an infra failure */
  output: unknown;
  /** synthetic files: why this output (a clean pass, or the planted failure and the rule that must catch it) */
  why?: string;
  /** null for an infra failure that billed nothing */
  usage: RecordedUsage | null;
  ms: number;
  stop: StopReason;
  /** the run's canary token (Director families: placed after the last cache breakpoint, AI-§E.3) */
  canary?: string;
  /** an infra failure (overloaded, timeout, network): written to errors.jsonl, never scored as 0 */
  error?: string;
  /** the request went through Message Batches (cost × 0.5) */
  batch?: boolean;
  /** judge runs: the fixture's a and b were shown swapped (the A/B order is randomised per case, AI-§F.5) */
  swapped?: boolean;
}

export interface RecordedFile {
  family: R1Family;
  /** "copy.page@s1"; an unregistered version (`broken`) is recorded only to prove the gate */
  version: string;
  synthetic: boolean;
  /** one line: how the file was produced */
  why: string;
  /** the rung and the requested model */
  source: { rung: "server" | "local"; model: string | null };
  /** the family's fixtures hash at the recording (64 hex) */
  fixturesHash: string;
  /** a deliberately broken version (AI-07 (6)): what is broken; the gate must block it */
  broken?: string;
  /** fixture id → its runs (≥ 1; injection cases × 3, AI-08 (2)) */
  runs: Record<string, RecordedRun[]>;
}

/** "recorded/<version>.json", relative to sets/<family>/. */
export const recordedName = (version: string): string => `recorded/${version}.json`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The problems of a parsed recorded file (empty = usable); a synthetic file needs a `why` on every run. */
export function recordedProblems(v: unknown): string[] {
  if (!isObj(v)) return ["not an object"];
  const out: string[] = [];
  if (typeof v.family !== "string") out.push("family");
  if (typeof v.version !== "string" || !v.version.includes("@")) out.push("version");
  if (typeof v.synthetic !== "boolean") out.push("synthetic");
  if (typeof v.why !== "string" || !v.why.trim()) out.push("why");
  if (typeof v.fixturesHash !== "string" || !/^[0-9a-f]{64}$/.test(v.fixturesHash)) out.push("fixturesHash");
  if (!isObj(v.runs)) return [...out, "runs"];
  for (const [id, runs] of Object.entries(v.runs)) {
    if (!Array.isArray(runs) || runs.length === 0) {
      out.push(`runs.${id}`);
      continue;
    }
    runs.forEach((r, i) => {
      if (!isObj(r) || !("output" in r) || typeof r.ms !== "number" || !["end_turn", "refusal", "max_tokens"].includes(String(r.stop))) out.push(`runs.${id}.${i}`);
      else if (v.synthetic === true && (typeof r.why !== "string" || !r.why.trim())) out.push(`runs.${id}.${i}.why`);
    });
  }
  return out;
}

/** One run per line, fixtures sorted, so a diff names the run that changed. */
export function serializeRecorded(f: RecordedFile): string {
  const head: Record<string, unknown> = { family: f.family, version: f.version, synthetic: f.synthetic, why: f.why, source: f.source, fixturesHash: f.fixturesHash };
  if (f.broken) head.broken = f.broken;
  const ids = Object.keys(f.runs).sort();
  const body = ids.map((id) => `    ${JSON.stringify(id)}: [\n${f.runs[id]!.map((r) => `      ${JSON.stringify(r)}`).join(",\n")}\n    ]`).join(",\n");
  return `${JSON.stringify(head).slice(0, -1)},\n  "runs": {\n${body}\n  }\n}\n`;
}
