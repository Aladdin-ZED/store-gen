/**
 * The browser ↔ server stream events (P7 AI; ai.md AI-§A.7, AI-§B.6). Isomorphic and pure. A pattern-A stream task
 * answers `application/x-ndjson`: one event per line, numbered by `s` from 0, a `progress` heartbeat with stage `wait`
 * every 5 s while the model thinks, and the stream ends after `final` or `error`. The poll transport keeps the same
 * events in the run buffer and serves them with `?after=<seq>`.
 */
import type { AiFailCode, AiFlag } from "../provider/types";
import type { Effort, TaskClass } from "../tasks";

export type AiStreamEvent =
  | { s: number; t: "start"; runId: string; provider: "server"; class: TaskClass; model: string; effort: Effort }
  /** a guarded value, ready to show */
  | { s: number; t: "field"; path: string; value: unknown }
  /** keep the library text */
  | { s: number; t: "field_rejected"; path: string }
  /** Director: "read" | "brief" | "critique" | "repair" | "verify" | "done"; "wait" = the heartbeat */
  | { s: number; t: "progress"; stage: string; done?: number; total?: number }
  /** server-side refusal fallback */
  | { s: number; t: "model_fallback"; from: string; to: string }
  /** a stage became a detached job (pattern B) */
  | { s: number; t: "job"; jobId: string }
  | { s: number; t: "final"; runId: string; value: unknown; rejected: string[]; credits: number; ms: number; flags: AiFlag[] }
  | { s: number; t: "error"; code: AiFailCode; retryable: boolean };

export type AiStreamEventType = AiStreamEvent["t"];
const TYPES: ReadonlySet<string> = new Set<AiStreamEventType>(["start", "field", "field_rejected", "progress", "model_fallback", "job", "final", "error"]);

/** The heartbeat interval while the model thinks (AI-§A.7) */
export const STREAM_HEARTBEAT_MS = 5_000;

/** One NDJSON line (with its newline). */
export function ndjsonLine(e: AiStreamEvent): string {
  return `${JSON.stringify(e)}\n`;
}

/** A stream ends after these. */
export function isTerminalEvent(e: AiStreamEvent): boolean {
  return e.t === "final" || e.t === "error";
}

/** Parses one line; anything that is not an event object with a numeric `s` and a known `t` is dropped (null). */
export function parseEventLine(line: string): AiStreamEvent | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as { s?: unknown; t?: unknown };
    if (typeof o.s !== "number" || !Number.isInteger(o.s) || o.s < 0 || typeof o.t !== "string" || !TYPES.has(o.t)) return null;
    return v as AiStreamEvent;
  } catch {
    return null;
  }
}

/** Splits arriving chunks into whole lines (a chunk may end mid-line or mid-character); never throws. */
export class NdjsonSplitter {
  private rest = "";

  /** the events completed by this chunk, in order */
  push(chunk: string): AiStreamEvent[] {
    const text = this.rest + chunk;
    const lines = text.split("\n");
    this.rest = lines.pop() ?? "";
    const out: AiStreamEvent[] = [];
    for (const line of lines) {
      const e = parseEventLine(line);
      if (e) out.push(e);
    }
    return out;
  }

  /** the last line when the body ended without a newline */
  end(): AiStreamEvent[] {
    const e = parseEventLine(this.rest);
    this.rest = "";
    return e ? [e] : [];
  }
}
