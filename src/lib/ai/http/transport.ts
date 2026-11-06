import "server-only";
/**
 * The two browser transports of a pattern-A stream task (P7 AI; ai.md AI-§A.7, AI-§B.6; docs/STORE-SAAS.md §H.12):
 *
 *   stream   `200 application/x-ndjson`: one `AiStreamEvent` per line, numbered from 0, a `progress` / `wait` heartbeat
 *            every 5 s, closed after `final` or `error`. `Cache-Control: no-store, no-transform` (Next's compression
 *            skips a no-transform body, so lines are never held back) and `X-Accel-Buffering: no` (a buffering
 *            proxy passes each line on). A client disconnect (the request's signal, or the body cancelled) aborts the
 *            upstream call through the run's signal. A stream never outlives `STREAM_CAP_MS`, under the ≈ 120 s proxy cut.
 *   poll     the same events in the run buffer, `scopedCache("ai-runs")`: per store and run, ≤ 600 runs, 10 minutes,
 *            ≤ 256 KB of events per run (a `field` past the budget is dropped; `final` and `error` always land,
 *            and `final` carries every field). `runs/[id]?after=<seq>` reads it.
 *
 * Which one a store gets is `platform_ai.streamTransport` (`stream` by default; probe line 8 sets it, and three
 * buffered runs in a row reported by the client switch it to `poll`, `recordBufferedTransport`).
 */
import { getPlatformSetting, setPlatformSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { apiHeaders } from "./plumbing";
import { scopedCache } from "@/lib/tenancy/cache";
import type { AiFailure, AiResult } from "../provider/types";
import { STREAM_HEARTBEAT_MS, isTerminalEvent, ndjsonLine, type AiStreamEvent } from "../stream/events";

/** A stream closes with `error: timeout` after this, whatever the run does (the proxy cuts a response near 120 s). */
export const STREAM_CAP_MS = 100_000;
export const RUN_BUFFER_MAX_RUNS = 600;
export const RUN_BUFFER_TTL_MS = 10 * 60_000;
export const RUN_BUFFER_MAX_BYTES = 256 * 1024;

/** An event before its sequence number is given. */
export type AiStreamEventBody = AiStreamEvent extends infer E ? (E extends AiStreamEvent ? Omit<E, "s"> : never) : never;
export type Emit = (e: AiStreamEventBody) => void;

/* ------------------------------------------------------------------ */
/* The outcome as events                                               */
/* ------------------------------------------------------------------ */

/** The end of a run as events: the model fallbacks the provider made, then `final`; or `error`. */
export function emitOutcome(emit: Emit, out: AiResult<unknown> | AiFailure): void {
  if (!out.ok) {
    emit({ t: "error", code: out.code, retryable: out.retryable });
    return;
  }
  for (const n of out.notes) if (n.code === "model_refusal") emit({ t: "model_fallback", from: String(n.from), to: String(n.to) });
  emit({ t: "final", runId: out.runId ?? "", value: out.value, rejected: out.rejected, credits: out.usage?.credits ?? 0, ms: out.ms, flags: out.flags });
}

/* ------------------------------------------------------------------ */
/* NDJSON                                                              */
/* ------------------------------------------------------------------ */

export function ndjsonHeaders(): Headers {
  const h = apiHeaders();
  h.set("Content-Type", "application/x-ndjson; charset=utf-8");
  h.set("Cache-Control", "no-store, no-transform");
  h.set("X-Accel-Buffering", "no");
  return h;
}

/**
 * A `200 application/x-ndjson` answer whose events `work` emits. `work` gets the signal every upstream call must
 * take: it aborts on a client disconnect and at the cap. The stream closes on the first terminal event; an exception
 * in `work` becomes `error: unknown`, and a `work` that returns without a terminal event closes with one.
 */
export function ndjsonResponse(work: (emit: Emit, signal: AbortSignal) => Promise<void>, opts: { signal?: AbortSignal; capMs?: number; heartbeatMs?: number } = {}): Response {
  const ctl = new AbortController();
  const enc = new TextEncoder();
  let closed = false;
  let seq = 0;
  let beat: ReturnType<typeof setInterval> | null = null;
  let cap: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    closed = true;
    if (beat) clearInterval(beat);
    if (cap) clearTimeout(cap);
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = () => {
        if (closed) return;
        stop();
        try {
          controller.close();
        } catch {
          // the client went away first
        }
      };
      const emit: Emit = (e) => {
        if (closed) return;
        const ev = { s: seq++, ...e } as AiStreamEvent;
        try {
          controller.enqueue(enc.encode(ndjsonLine(ev)));
        } catch {
          stop();
          ctl.abort();
          return;
        }
        if (isTerminalEvent(ev)) finish();
      };
      beat = setInterval(() => emit({ t: "progress", stage: "wait" }), opts.heartbeatMs ?? STREAM_HEARTBEAT_MS);
      cap = setTimeout(() => {
        emit({ t: "error", code: "timeout", retryable: true });
        ctl.abort();
      }, opts.capMs ?? STREAM_CAP_MS);
      if (opts.signal) {
        if (opts.signal.aborted) ctl.abort();
        opts.signal.addEventListener(
          "abort",
          () => {
            ctl.abort();
            finish();
          },
          { once: true },
        );
      }
      void work(emit, ctl.signal)
        .catch(() => emit({ t: "error", code: "unknown", retryable: false }))
        .finally(() => emit({ t: "error", code: ctl.signal.aborted ? "cancelled" : "unknown", retryable: false }));
    },
    cancel() {
      // the client disconnected: the upstream call stops with it
      stop();
      ctl.abort();
    },
  });
  return new Response(body, { status: 200, headers: ndjsonHeaders() });
}

/* ------------------------------------------------------------------ */
/* The run buffer (poll transport)                                     */
/* ------------------------------------------------------------------ */

interface RunBuffer {
  events: AiStreamEvent[];
  bytes: number;
  done: boolean;
  /** `field` events past the byte budget (the `final` carries them) */
  dropped: number;
}

const buffers = scopedCache<RunBuffer>({ name: "ai-runs", maxEntries: RUN_BUFFER_MAX_RUNS, ttlMs: RUN_BUFFER_TTL_MS });

/** A numbered event sink writing into the buffer of (store, run); events emitted before `open` wait for it. */
export class RunBufferSink {
  private seq = 0;
  private buf: RunBuffer | null = null;
  private readonly pending: AiStreamEvent[] = [];

  constructor(private readonly storeId: string) {}

  /** The run row exists: the buffer is created and the waiting events land. */
  open(runId: string): void {
    if (this.buf) return;
    this.buf = buffers.set(this.storeId, runId, { events: [], bytes: 0, done: false, dropped: 0 });
    for (const e of this.pending.splice(0)) this.push(e);
  }

  get isOpen(): boolean {
    return this.buf !== null;
  }

  readonly emit: Emit = (e) => {
    const ev = { s: this.seq++, ...e } as AiStreamEvent;
    if (this.buf) this.push(ev);
    else this.pending.push(ev);
  };

  private push(ev: AiStreamEvent): void {
    const b = this.buf!;
    if (b.done) return;
    const size = Buffer.byteLength(ndjsonLine(ev));
    const terminal = isTerminalEvent(ev);
    if (!terminal && b.bytes + size > RUN_BUFFER_MAX_BYTES) {
      b.dropped++;
      return;
    }
    b.events.push(ev);
    b.bytes += size;
    if (terminal) b.done = true;
  }
}

/** The events of a run after `after` (−1: all), or null when the buffer is gone (expired, another process, another store). */
export function readRunBuffer(storeId: string, runId: string, after: number): { events: AiStreamEvent[]; done: boolean } | null {
  const b = buffers.get(storeId, runId);
  if (!b) return null;
  return { events: b.events.filter((e) => e.s > after), done: b.done };
}

/* ------------------------------------------------------------------ */
/* Auto-detection of a buffering proxy                                 */
/* ------------------------------------------------------------------ */

/**
 * The client saw three runs in a row arrive in one piece (the first line after `final` would have): the platform
 * switches to the poll transport, once, audited `platform.ai.transport_changed` with the system as the actor.
 * Returns whether this call switched it.
 */
export async function recordBufferedTransport(storeId: string): Promise<boolean> {
  const cur = await getPlatformSetting("platform_ai", { fresh: true });
  if (cur.streamTransport === "poll") return false;
  await setPlatformSetting("platform_ai", { ...cur, streamTransport: "poll" }, { id: "system", kind: "system" });
  await audit("platform.ai.transport_changed", { target: "streamTransport", meta: { from: "stream", to: "poll", reason: "buffered", storeId }, scope: { storeId: null, actorKind: "system" } });
  return true;
}
