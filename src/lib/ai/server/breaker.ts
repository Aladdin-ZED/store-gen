/**
 * The circuit breaker of the server provider (P7 AI; ai.md AI-§B.10, AI-§A.4 `paused`). Pure and in memory, with an
 * injected clock, so `test:ai` drives it with a fake one.
 *
 *   - 5 `provider_overloaded` / `provider_error` failures within 2 minutes → open (cloud `block = "paused"`) for
 *     60 s; the next call after that is a single trial: success closes it, a counted failure opens it again.
 *   - An auth failure (401 / 403) opens it until the key changes (`resetAnthropic()`) or "Test connection" succeeds
 *     (`authCleared()`); `tripAuth()` answers true only on the first trip, so staff are notified once.
 * Every store's policy reads `paused()` through `aiPolicyFor`'s probes (within its 15 s cache).
 */
import type { AiFailCode } from "../provider/types";
import { processState } from "./process";

export const BREAKER = { failures: 5, windowMs: 120_000, pauseMs: 60_000 } as const;

export type BreakerState = "closed" | "open" | "half_open" | "auth";

export type BreakerGate = { ok: true; trial: boolean } | { ok: false; code: "provider_overloaded" | "provider_auth"; retryAfterSec?: number };

const COUNTED: ReadonlySet<AiFailCode> = new Set<AiFailCode>(["provider_overloaded", "provider_error"]);

export class CircuitBreaker {
  private fails: number[] = [];
  private openUntil = 0;
  private trialOut = false;
  private authOpen = false;

  constructor(private readonly now: () => number = Date.now) {}

  state(): BreakerState {
    if (this.authOpen) return "auth";
    if (this.openUntil === 0) return "closed";
    return this.now() < this.openUntil ? "open" : "half_open";
  }

  /** What the policy shows: open or auth. A half-open breaker lets its one trial through, so it is not "paused". */
  paused(): boolean {
    const s = this.state();
    return s === "open" || s === "auth";
  }

  /** Whether a call may go out now; a half-open breaker hands out exactly one trial. */
  allow(): BreakerGate {
    const s = this.state();
    if (s === "auth") return { ok: false, code: "provider_auth" };
    if (s === "open") return { ok: false, code: "provider_overloaded", retryAfterSec: Math.ceil((this.openUntil - this.now()) / 1000) };
    if (s === "half_open") {
      if (this.trialOut) return { ok: false, code: "provider_overloaded", retryAfterSec: 1 };
      this.trialOut = true;
      return { ok: true, trial: true };
    }
    return { ok: true, trial: false };
  }

  /**
   * The outcome of a call that went out: "ok", or its failure code. Returns true when this outcome opened the breaker.
   * A trial that the provider answered with anything but a counted failure closes it (the provider is reachable).
   */
  record(outcome: "ok" | AiFailCode, trial: boolean): boolean {
    const t = this.now();
    const counted = outcome !== "ok" && COUNTED.has(outcome);
    if (trial) {
      this.trialOut = false;
      if (counted) {
        this.openUntil = t + BREAKER.pauseMs;
        return true;
      }
      if (outcome !== "cancelled") {
        this.openUntil = 0;
        this.fails = [];
      }
      return false;
    }
    if (!counted) return false;
    this.fails = this.fails.filter((at) => t - at < BREAKER.windowMs);
    this.fails.push(t);
    if (this.fails.length >= BREAKER.failures && this.openUntil === 0) {
      this.openUntil = t + BREAKER.pauseMs;
      this.fails = [];
      return true;
    }
    return false;
  }

  /** An auth failure: open until fixed; true on the first trip only (one staff notification). */
  tripAuth(): boolean {
    if (this.authOpen) return false;
    this.authOpen = true;
    return true;
  }

  /** The key changed or "Test connection" succeeded. */
  authCleared(): void {
    this.authOpen = false;
  }

  /** Back to closed (tests, a console reset). */
  reset(): void {
    this.fails = [];
    this.openUntil = 0;
    this.trialOut = false;
    this.authOpen = false;
  }
}

/** The process-wide breaker of the Claude API (./process.ts). */
export function breaker(): CircuitBreaker {
  return processState("breaker", () => new CircuitBreaker());
}
