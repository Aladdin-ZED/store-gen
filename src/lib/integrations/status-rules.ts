/**
 * The `integration_status` state rules (P5 INTEGRATIONS; operations.md OPE-§28.2, OPE-§2.6) and the Sheets backlog
 * threshold (core §H.5, ENGC-33; OPE-§27.2). Pure and isomorphic: src/lib/integrations/status.ts applies them to the
 * stored row, the health rules and the screens read the same constants, and `test:conversions` proves the table.
 *
 * One result in, the next row out. Per kind:
 *   - `sheets` (one row, target ""): `ok` after a run without error, `warn` while the oldest waiting order is older
 *     than 5 minutes, `failing` after 3 failed runs in a row or when the store's run opened the Google breaker, `off`
 *     when the store disabled Sheets;
 *   - `capi` (one row per pixel, "meta:<pixel>"): `ok` on a 2xx, `warn` on a failure, `failing` once 3 failures in a
 *     row meet no success in the last 24 hours;
 *   - `telegram` (one row): `failing` at once on 401, 403 or "chat not found" (the bot can never send again by itself),
 *     `warn` on 429 and on every other failure;
 *   - R2 / R3 kinds (webhook, carrier, whatsapp) until their tracks refine them: `failing` after 3 failures in a row.
 * Only a success brings a row back from `failing`; a later failure of another sort never softens it.
 */
import { TELEGRAM_FINAL_CODES, causeFromStatus, isCauseCode, type CauseCode } from "./causes";
import type { IntegrationKind } from "./health";

export type IntegrationState = "ok" | "warn" | "failing" | "off";

/**
 * What one run or one send answered: `ok`; `retry` (a retryable failure: 429, 5xx, a timeout); `failed` (a refusal
 * or a failed Sheets run); `breaker` (this store's Sheets run opened the platform breaker); `off` (disabled).
 */
export type StatusOutcome = "ok" | "retry" | "failed" | "breaker" | "off";

export interface StatusInput {
  kind: IntegrationKind;
  /** "" (sheets, telegram) | "meta:<pixel>" (capi) | endpoint id | account id; ≤ 64 */
  targetId?: string;
  outcome: StatusOutcome;
  /** a cause code (src/lib/integrations/causes.ts); never raw error text */
  code?: string | null;
  /** the failed call's HTTP status (0 = no answer), when no code says more */
  status?: number | null;
  /** items still waiting (sheets: pending + failed appends; capi / telegram: pending items) */
  backlog?: number;
  /** sheets: the oldest waiting order's `created_at`; others: the oldest pending item's `next_at` */
  oldestPendingAt?: Date | null;
}

/** The row as the rules see it (epoch ms; null = never). */
export interface StatusRow {
  state: IntegrationState;
  failures: number;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastErrorCode: string | null;
  backlog: number;
  oldestPendingAt: number | null;
  /** the first failure of the current streak (the "since" of a notification); null while healthy */
  streakAt: number | null;
}

export const MINUTE_MS = 60_000;
/** ≤ 1 write per minute per row, unless the state changes (OPE-§28.2, OPE-§O.4 IN-03) */
export const STATUS_WRITE_EVERY_MS = MINUTE_MS;
/** sheets: `warn` once the oldest waiting order is older than this */
export const SHEETS_WARN_AFTER_MS = 5 * MINUTE_MS;
/** failures in a row before `failing` (sheets runs; capi with no success in 24 h; R2 kinds) */
export const FAILING_AFTER = 3;
export const CAPI_SUCCESS_WINDOW_MS = 24 * 60 * MINUTE_MS;
/** `last_error_code` is varchar(48) */
const CODE_MAX = 48;

/** The cause code a failing input stores: its own code when it is one of ours, else one read from its status. */
export function failureCode(input: Pick<StatusInput, "kind" | "code" | "status">): CauseCode {
  if (isCauseCode(input.code)) return input.code;
  return causeFromStatus(input.status, input.kind);
}

const RANK: Record<IntegrationState, number> = { off: 0, ok: 1, warn: 2, failing: 3 };

/** The next row after one result at `now` (epoch ms). `prev` null: the target's first result. */
export function nextStatus(prev: StatusRow | null, input: StatusInput, now: number): StatusRow {
  const backlog = Math.max(0, Math.trunc(input.backlog ?? prev?.backlog ?? 0));
  const oldestPendingAt = input.oldestPendingAt !== undefined ? (input.oldestPendingAt?.getTime() ?? null) : (prev?.oldestPendingAt ?? null);
  const base: StatusRow = {
    state: prev?.state ?? "ok",
    failures: prev?.failures ?? 0,
    lastOkAt: prev?.lastOkAt ?? null,
    lastErrorAt: prev?.lastErrorAt ?? null,
    lastErrorCode: prev?.lastErrorCode ?? null,
    backlog,
    oldestPendingAt,
    streakAt: prev?.streakAt ?? null,
  };

  if (input.outcome === "off") return { ...base, state: "off", failures: 0, streakAt: null };

  if (input.outcome === "ok") {
    const late = input.kind === "sheets" && oldestPendingAt !== null && now - oldestPendingAt > SHEETS_WARN_AFTER_MS;
    return { ...base, state: late ? "warn" : "ok", failures: 0, lastOkAt: now, streakAt: null };
  }

  const code = failureCode(input).slice(0, CODE_MAX);
  const failures = base.failures + 1;
  let state: IntegrationState;
  switch (input.kind) {
    case "sheets":
      state = input.outcome === "breaker" || failures >= FAILING_AFTER ? "failing" : "warn";
      break;
    case "capi": {
      const noSuccess = base.lastOkAt === null || now - base.lastOkAt >= CAPI_SUCCESS_WINDOW_MS;
      state = failures >= FAILING_AFTER && noSuccess ? "failing" : "warn";
      break;
    }
    case "telegram":
      state = TELEGRAM_FINAL_CODES.has(code as CauseCode) ? "failing" : "warn";
      break;
    default:
      state = failures >= FAILING_AFTER ? "failing" : "warn";
  }
  // only a success recovers: a 429 after a revoked token keeps the row failing, its incident open and its cause named
  const softer = base.state === "failing" && RANK[state] < RANK.failing;
  return { ...base, state: softer ? "failing" : state, failures, lastErrorAt: now, lastErrorCode: softer ? (base.lastErrorCode ?? code) : code, streakAt: base.streakAt ?? now };
}

/**
 * The Sheets backlog threshold in minutes (core §H.5 rev 3, ENGC-33; OPE-§27.2 `int:sheets_backlog`):
 * `max(15, 5 × ceil(activeSheetsStores / 16))`. Slot 1 serves ≈ 16 stores per 5-minute tick, so past 16 active
 * stores a store legitimately waits several ticks; the issue and the staff alarm scale with it instead of firing for
 * everyone. An unknown count reads as one store (15 minutes).
 */
export function sheetsBacklogThresholdMin(activeSheetsStores: number | null | undefined): number {
  const active = Number.isFinite(activeSheetsStores) ? Math.max(1, Math.trunc(activeSheetsStores as number)) : 1;
  return Math.max(15, 5 * Math.ceil(active / 16));
}
