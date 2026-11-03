/**
 * Typed provider errors (P7 AI; ai.md AI-§B.10, AI-§A.4 step 10). Pure: no network, no database, so `test:ai` checks
 * the mapping with real SDK error instances.
 *
 *   - `AiServerError(code, retryable, status?, retryAfterSec?)`: the one error the server rung throws below the router;
 *     `breaker` says whether it counts toward the circuit breaker (AI-§B.10: overloads, 5xx, connection failures).
 *   - `fromSdkError(err, opts)`: the AI-§B.10 table, most specific class first (`APIError` last), by `instanceof` and
 *     status only: messages are never string-matched [api]. An abort of our own deadline is `timeout`; an abort the
 *     caller asked for is `cancelled`.
 *   - `retryAfterOf(headers)`: `retry-after-ms` or `retry-after` (seconds or an HTTP date), in seconds.
 */
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { AiFailCode } from "../provider/types";

export class AiServerError extends Error {
  constructor(
    readonly code: AiFailCode,
    readonly retryable: boolean,
    readonly status?: number,
    readonly retryAfterSec?: number,
  ) {
    super(code);
    this.name = "AiServerError";
  }

  /** counts toward the breaker: overloaded, 5xx and connection failures (AI-§B.10) */
  get breaker(): boolean {
    return this.code === "provider_overloaded" || this.code === "provider_error";
  }
}

/** Seconds to wait from a response's headers, or undefined (never negative). */
export function retryAfterOf(headers: Headers | undefined | null, now = Date.now()): number | undefined {
  if (!headers || typeof headers.get !== "function") return undefined;
  const ms = headers.get("retry-after-ms");
  if (ms !== null && /^\d+(?:\.\d+)?$/.test(ms.trim())) return Math.max(0, Number(ms) / 1000);
  const raw = headers.get("retry-after");
  if (raw === null) return undefined;
  const v = raw.trim();
  if (/^\d+(?:\.\d+)?$/.test(v)) return Math.max(0, Number(v));
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, (at - now) / 1000) : undefined;
}

export interface FromSdkOpts {
  /** our own deadline fired (the abort was ours, not the caller's) */
  deadline?: boolean;
}

const OVERLOADED = 529;

/** The AI-§B.10 table. Never reads a message; an unknown throwable is `unknown` (not retryable). */
export function fromSdkError(err: unknown, opts: FromSdkOpts = {}): AiServerError {
  if (err instanceof AiServerError) return err;
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) return new AiServerError("provider_auth", false, err.status);
  if (err instanceof NotFoundError) return new AiServerError("model_unavailable", false, err.status);
  if (err instanceof BadRequestError) return new AiServerError("bad_request", false, err.status);
  if (err instanceof RateLimitError) return new AiServerError("rate_limited", true, err.status, retryAfterOf(err.headers));
  if (err instanceof InternalServerError) {
    const overloaded = err.status === OVERLOADED || err.type === "overloaded_error";
    return new AiServerError(overloaded ? "provider_overloaded" : "provider_error", true, err.status, retryAfterOf(err.headers));
  }
  // the SDK's own request timeout runs at the remaining deadline: both are our deadline
  if (err instanceof APIConnectionTimeoutError) return new AiServerError("timeout", true);
  if (err instanceof APIUserAbortError) return opts.deadline ? new AiServerError("timeout", true) : new AiServerError("cancelled", false);
  if (err instanceof APIConnectionError) return new AiServerError("provider_error", true);
  if (err instanceof APIError) {
    const status = typeof err.status === "number" ? err.status : undefined;
    return new AiServerError("provider_error", status !== undefined && status >= 500, status, retryAfterOf(err.headers as Headers | undefined));
  }
  if (err instanceof Error && err.name === "AbortError") return opts.deadline ? new AiServerError("timeout", true) : new AiServerError("cancelled", false);
  return new AiServerError("unknown", false);
}
