/**
 * The proxy's runtime-log lines (docs/STORE-SAAS.md §C.2 step 2, §C.3 `foreign`, §C.5 key rotation). src/proxy.ts
 * never touches the database (R-D6), so what the spec records as `error_events` area `edge` starts here as a
 * bounded in-process tally plus a rate-limited log line; the health recorder (P1, `getHealth().edge`) reads
 * `edgeTally()` and writes the rows and the `edge_bad_key` alarm. Nothing here decides an answer.
 *
 *  - reportForeignHost: a request on a host nothing in the configuration names (almost always PLATFORM_URL left
 *    behind after a move: every page then answers 404), logged once per host (at most 20 hosts per process). The
 *    successor of src/lib/render/serve.server.ts reportForeignHost.
 *  - noteEdgeCheck: an `x-sg-edge` that does not verify (code `bad_key`: wrong key, stale `x-sg-ts`, or no
 *    EDGE_KEY on this server) counted per minute and logged at most once a minute; a request still using
 *    EDGE_KEY_PREV (code `prev_key`) logged at most once an hour.
 *
 * State lives on globalThis (one copy per process even when the proxy and the routes are separate bundles); a
 * restart only logs again.
 */
import type { EdgeCheck } from "./host";

export interface EdgeTally {
  /** start (ms) of the minute `badKeyMinute` counts */
  minuteStart: number;
  /** unverifiable x-sg-edge requests in the current minute (the `edge_bad_key` alarm fires at 10) */
  badKeyMinute: number;
  /** unverifiable x-sg-edge requests since the process started, by reason */
  badKey: { bad_key: number; stale: number; unconfigured: number };
  /** last request verified with EDGE_KEY_PREV (ms), or null */
  prevKeyAt: number | null;
  /** last edge-verified request (ms), or null: the health view's "last seen" */
  verifiedAt: number | null;
}

interface LogState {
  foreign: Set<string>;
  tally: EdgeTally;
  badKeyLoggedAt: number;
  prevKeyLoggedAt: number;
}

declare global {
  var __sgProxyLog: LogState | undefined;
}

const MAX_FOREIGN = 20;
const LOGGABLE_HOST_RE = /^[a-z0-9.-]{1,253}(?::\d{1,5})?$/;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function state(): LogState {
  return (globalThis.__sgProxyLog ??= {
    foreign: new Set(),
    tally: { minuteStart: 0, badKeyMinute: 0, badKey: { bad_key: 0, stale: 0, unconfigured: 0 }, prevKeyAt: null, verifiedAt: null },
    badKeyLoggedAt: -Infinity,
    prevKeyLoggedAt: -Infinity,
  });
}

export function reportForeignHost(host: string): void {
  if (!LOGGABLE_HOST_RE.test(host)) return; // normalized hosts only: no control characters reach the log
  const seen = state().foreign;
  if (seen.has(host) || seen.size >= MAX_FOREIGN) return;
  seen.add(host);
  const configured = process.env.PLATFORM_URL ?? process.env.PUBLIC_URL ?? "(unset)";
  console.warn(
    `[edge] a request for ${host} was answered with the neutral 404: no configured host matches it (PLATFORM_URL ${configured}, ADMIN_HOST, LEGACY_PLATFORM_HOSTS, STORE_ROOT_DOMAIN). Update PLATFORM_URL if the site moved to this domain.`,
  );
}

const BAD_KEY_HINT: Record<"bad_key" | "stale" | "unconfigured", string> = {
  bad_key: "the Worker secret and EDGE_KEY / EDGE_KEY_PREV differ, or the header is forged",
  stale: "x-sg-ts is missing or more than 5 minutes off (a replayed header set, or the Worker's clock)",
  unconfigured: "this server has no usable EDGE_KEY while the Worker sends one",
};

/** Count one edge check of a request that carried `x-sg-edge` (an absent header is not counted). */
export function noteEdgeCheck(check: EdgeCheck, now: number = Date.now()): void {
  if (check.state === "absent") return;
  const s = state();
  if (check.state === "verified") {
    s.tally.verifiedAt = now;
    if (check.key !== "prev") return;
    s.tally.prevKeyAt = now;
    if (now - s.prevKeyLoggedAt < HOUR) return;
    s.prevKeyLoggedAt = now;
    console.warn("[edge] prev_key: a request was verified with EDGE_KEY_PREV. Finish the rotation (Worker secret = EDGE_KEY), then remove EDGE_KEY_PREV and restart.");
    return;
  }
  const t = s.tally;
  if (now - t.minuteStart >= MINUTE) {
    t.minuteStart = now;
    t.badKeyMinute = 0;
  }
  t.badKeyMinute++;
  t.badKey[check.reason]++;
  if (now - s.badKeyLoggedAt < MINUTE) return;
  s.badKeyLoggedAt = now;
  console.warn(`[edge] bad_key (${check.reason}): an x-sg-edge header did not verify and got the neutral 404; ${BAD_KEY_HINT[check.reason]}.`);
}

/** A copy of the edge tally (the health recorder's input). */
export function edgeTally(): EdgeTally {
  const t = state().tally;
  return { ...t, badKey: { ...t.badKey } };
}

/** Tests only: forget every logged host and count. */
export function resetProxyLog(): void {
  globalThis.__sgProxyLog = undefined;
}
