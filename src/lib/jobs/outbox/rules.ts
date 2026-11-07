/**
 * The outbox's pure rules (docs/STORE-SAAS.md §H.1, ENGC-29; R1 P8 step 4). No I/O and no clock of their own, so
 * test:jobs drives them offline and the drainer (./drain.ts), the SQL (./sql.ts) and the API (../outbox.ts) share them:
 *
 *   checkItems(items)               the enqueue refusals: kind stored by 0005, topic ≤ 48, dedupe key ≤ 160, target ≤ 64
 *   outcomeOf(attempts, result, t)  one send's result → done, pending with the next try (the backoff ladder) or dead
 *   httpRetryable(status)           4xx is final except 408 and 429; everything else may be tried again
 *   resendKey(base, n)              a deliberate re-send's key, `${base}:r${n}` (ENGC-29)
 *   replayRule(state, kind)         what `replay` does with a row: replay it, nothing (already queued), or refuse
 *   claimLimit(handler, taken)      the per-kind and per-store caps of one claim
 *   claimStatement(n, owner)        the §H.1 claim statement, verbatim (no SKIP LOCKED on 10.4)
 *   planUnits(items, batch)         a handler's merged sends: one store's items of one key, at most `max` per send
 *   cleanLastError(text)            what `last_error` may hold: a code or plain text, masked, ≤ 300 characters
 */
import { outbox } from "@/lib/db/schema";
import { redactSummary } from "../errors";
import type { ClaimedItem, OutboxHandler, OutboxItem, OutboxKind, OutboxState, SendResult } from "../outbox";

/**
 * The delay before retry n (n = attempts after the failing send, 1-based): 1 min, 5 min, 30 min, 2 h, 6 h, 24 h (§H.1;
 * P0b, CCR P5-1). A send that fails after the last step is final: the row goes `dead`. Frozen; re-exported by
 * ../outbox.ts (defined here so this module needs no value from it).
 */
export const OUTBOX_BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000] as const;

/**
 * Is this failing send the item's last (P0b, CCR P5-1)? True for a refusal (`retry: false`) and for a retryable
 * failure once the ladder is used up: `attempts` counts the sends tried before this one, so the 7th failing send is
 * final. P5's handlers fire `int.delivery_dead` and the failing notices once, at this dead transition (OPE-§21.3,
 * §28.2), never on every retry. Frozen; re-exported by ../outbox.ts.
 */
export function isFinalFailure(item: Pick<ClaimedItem, "attempts">, result: SendResult): boolean {
  return !result.ok && (!result.retry || item.attempts >= OUTBOX_BACKOFF_MS.length);
}

/** The kinds the `outbox.kind` enum stores (0006 appended "edge_purge"; "push" arrives with 0007, PLA Q.21): anything else is refused. */
export const STORED_KINDS: readonly OutboxKind[] = outbox.kind.enumValues;
/** Every kind of the frozen type, in the order the drainer serves them inside one store (seller-facing first; the edge purge, S6, last). */
export const DRAIN_ORDER: readonly OutboxKind[] = ["telegram", "capi", "webhook", "carrier", "whatsapp", "push", "mail", "edge_purge"];

export const TOPIC_MAX = 48;
export const DEDUPE_MAX = 160;
export const TARGET_MAX = 64;
/** a payload above this is a programming error (Telegram ≤ 3,500 chars, webhooks ≤ 64 KB, CAPI and mail are small) */
export const PAYLOAD_MAX_BYTES = 256 * 1024;
export const LAST_ERROR_MAX = 300;
/** the claim's lease (§H.1: `lease_until = now + INTERVAL 2 MINUTE`) */
export const LEASE_MINUTES = 2;
/** the envelope purpose of a `pii: true` payload (§F.3) */
export const OUTBOX_SEAL_PURPOSE = "outbox:v1";
/** §H.1 mail caps (Hostinger SMTP limits are unverified, R-D51): a platform bucket per minute, `mail_sent` per hour */
export const MAIL_PER_MINUTE = 4;
export const MAIL_PER_HOUR = 150;

const KEY_RE = /^[\x21-\x7e]+$/; // printable ASCII, no spaces: keys are built from ids and names
const TOPIC_RE = /^[A-Za-z0-9_.:-]+$/;

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

/** Refuses a malformed batch with the index and field at fault (never a value of the payload). */
export function checkItems(items: readonly OutboxItem[]): void {
  items.forEach((it, i) => {
    const bad = (what: string): never => {
      throw new RangeError(`outbox: item ${i}: ${what}`);
    };
    if (!it || typeof it !== "object") bad("not an item");
    if (!STORED_KINDS.includes(it.kind)) bad(`kind "${String(it.kind).slice(0, 16)}" is not stored by this schema`);
    if (typeof it.topic !== "string" || !TOPIC_RE.test(it.topic) || it.topic.length > TOPIC_MAX) bad(`topic must be 1-${TOPIC_MAX} of [A-Za-z0-9_.:-]`);
    if (typeof it.dedupeKey !== "string" || !KEY_RE.test(it.dedupeKey) || it.dedupeKey.length > DEDUPE_MAX) bad(`dedupeKey must be 1-${DEDUPE_MAX} printable characters`);
    if (it.targetId !== undefined && (typeof it.targetId !== "string" || !KEY_RE.test(it.targetId) || it.targetId.length > TARGET_MAX)) bad(`targetId must be 1-${TARGET_MAX} printable characters`);
    if (it.notBefore !== undefined && !(it.notBefore instanceof Date && Number.isFinite(it.notBefore.getTime()))) bad("notBefore must be a valid Date");
    if (it.pii !== undefined && typeof it.pii !== "boolean") bad("pii must be a boolean");
  });
}

/**
 * A deliberate re-send's dedupe key (ENGC-29): `dedupe_key` is unique across every state, so the same key would be
 * ignored against the kept `done` row. The caller audits the re-send.
 */
export function resendKey(base: string, n: number): string {
  if (typeof base !== "string" || !KEY_RE.test(base)) throw new RangeError("outbox: resendKey needs the item's dedupe key");
  if (!Number.isSafeInteger(n) || n < 1) throw new RangeError("outbox: resendKey needs n ≥ 1");
  const key = `${base}:r${n}`;
  if (key.length > DEDUPE_MAX) throw new RangeError(`outbox: resendKey is over ${DEDUPE_MAX} characters`);
  return key;
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

/** May a send that got this HTTP status be tried again? 4xx is final, except 408 (timeout) and 429 (rate limit). */
export function httpRetryable(status: number): boolean {
  return !(status >= 400 && status < 500) || status === 408 || status === 429;
}

/** A row's next state after one send (attempts = the sends tried before this one; `now` = epoch ms). */
export type Outcome =
  | { state: "done"; status: number | null }
  | { state: "pending"; attempts: number; nextAt: number; status: number | null; error: string }
  | { state: "dead"; attempts: number; status: number | null; error: string }
  | { state: "cancelled"; attempts: number; status: number | null; error: string };

/** A handler drops an item on purpose (the CAPI 7-day guard): a final failure with this error prefix → `cancelled`, never `dead` (CCR r1-p5-9). */
export const OUTBOX_CANCELLED_PREFIX = "cancelled:";
/** The longest wait a handler's `retryAfterMs` may ask for (CCR r1-p5-11). */
const RETRY_AFTER_CAP_MS = 24 * 3_600_000;

/** A handler's answer as the drainer reads it: the frozen SendResult, plus an optional `retryAfterMs` (Telegram's 429 `retry_after`, CCR r1-p5-11). */
export type DrainResult = SendResult & { retryAfterMs?: number };

/** The delay before the next try after `attempts` failed sends (1-based): 1 min, 5 min, 30 min, 2 h, 6 h, 24 h. */
export function backoffMs(attempts: number): number {
  const i = Math.min(Math.max(1, Math.trunc(attempts)), OUTBOX_BACKOFF_MS.length) - 1;
  return OUTBOX_BACKOFF_MS[i]!;
}

/**
 * ok → done; a refusal (`retry: false`) or the 7th failing send → dead; any other failure → pending again with
 * attempts + 1 and `next_at` one step further up the ladder (§H.1; `isFinalFailure`, P0b CCR P5-1).
 */
export function outcomeOf(attempts: number, result: DrainResult, now: number): Outcome {
  const status = typeof result.status === "number" && Number.isInteger(result.status) ? result.status : null;
  if (result.ok) return { state: "done", status };
  const next = attempts + 1;
  if (!result.retry && typeof result.error === "string" && result.error.startsWith(OUTBOX_CANCELLED_PREFIX)) {
    return { state: "cancelled", attempts: next, status, error: cleanLastError(result.error.slice(OUTBOX_CANCELLED_PREFIX.length)) || "cancelled" };
  }
  const error = cleanLastError(result.error) || "failed";
  if (isFinalFailure({ attempts }, result)) return { state: "dead", attempts: next, status, error };
  const after = typeof result.retryAfterMs === "number" && Number.isFinite(result.retryAfterMs) ? Math.min(RETRY_AFTER_CAP_MS, Math.max(0, result.retryAfterMs)) : 0;
  return { state: "pending", attempts: next, nextAt: now + Math.max(backoffMs(next), after), status, error };
}

/** A handler's answer as the drainer trusts it: anything that is not a SendResult is a retryable `bad_result`. */
export function normalizeResult(r: unknown): DrainResult {
  if (r && typeof r === "object" && "ok" in r) {
    const x = r as { ok: unknown; retry?: unknown; status?: unknown; error?: unknown; retryAfterMs?: unknown };
    const status = typeof x.status === "number" && Number.isInteger(x.status) ? { status: x.status } : {};
    const after = typeof x.retryAfterMs === "number" && Number.isFinite(x.retryAfterMs) && x.retryAfterMs > 0 ? { retryAfterMs: x.retryAfterMs } : {};
    if (x.ok === true) return { ok: true, ...status };
    if (x.ok === false) return { ok: false, retry: x.retry !== false, error: typeof x.error === "string" ? x.error : "failed", ...status, ...after };
  }
  return { ok: false, retry: true, error: "bad_result" };
}

/** `last_error`: a code or plain text with e-mail addresses and digit runs masked (never the payload), ≤ 300 chars. */
export function cleanLastError(text: unknown): string {
  if (typeof text !== "string") return "";
  return redactSummary(text.replace(/\s+/g, " ").trim(), LAST_ERROR_MAX);
}

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

/** The kinds whose `done` rows may be sent again (ENGC-29): a webhook delivery and a Telegram message. */
export const RESENDABLE_DONE: readonly OutboxKind[] = ["webhook", "telegram"];

/**
 * What `replay` does with a row (§H.1, OPE-§28.1):
 * - `dead` → pending (any kind; a CAPI item still meets its 7-day guard at send time);
 * - `done` → pending for webhook and telegram only; a done CAPI or mail row is refused (`invalid`): an ad platform or
 *   an inbox would count it twice;
 * - `pending` / `running` → nothing (a second click while it waits is a no-op, no second audit row);
 * - `cancelled` → refused (a CAPI item cancelled by its 7-day guard would be cancelled again).
 */
export function replayRule(state: OutboxState, kind: OutboxKind): "replay" | "noop" | "invalid" {
  if (state === "dead") return "replay";
  if (state === "done") return RESENDABLE_DONE.includes(kind) ? "replay" : "invalid";
  if (state === "pending" || state === "running") return "noop";
  return "invalid";
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

/**
 * How many rows of a kind one claim may take: the handler's `perStorePerTick`, within what is left of its
 * `maxPerTick` for this drain (`taken` = rows of the kind already claimed in it, every store counted). 0 = skip.
 */
export function claimLimit(h: Pick<OutboxHandler<unknown>, "maxPerTick" | "perStorePerTick">, taken: number): number {
  const per = Number.isFinite(h.perStorePerTick) ? Math.trunc(h.perStorePerTick) : 0;
  const max = Number.isFinite(h.maxPerTick) ? Math.trunc(h.maxPerTick) : 0;
  return Math.max(0, Math.min(per, max - Math.max(0, taken)));
}

/**
 * The §H.1 claim, verbatim (R-D19 pattern; MariaDB 10.4 has no SKIP LOCKED): the rows due, or running past their
 * lease, of the given kinds, oldest `next_at` first, take the claim token and a 2-minute lease in one UPDATE; the
 * claimer then reads back `WHERE claim = ?`. Parameters: the claim token, each kind, the store id (owner "store"),
 * the limit. Platform items (`store_id` NULL: mail, R2) are claimed on their own.
 */
export function claimStatement(kinds: number, owner: "store" | "platform"): string {
  if (!Number.isInteger(kinds) || kinds < 1 || kinds > DRAIN_ORDER.length) throw new RangeError("outbox: a claim names 1-7 kinds");
  const marks = Array.from({ length: kinds }, () => "?").join(", ");
  if (owner === "store") {
    return `UPDATE outbox SET state = 'running', claim = ?, lease_until = UTC_TIMESTAMP(3) + INTERVAL ${LEASE_MINUTES} MINUTE WHERE ((state = 'pending' AND next_at <= UTC_TIMESTAMP(3)) OR (state = 'running' AND lease_until < UTC_TIMESTAMP(3))) AND kind IN (${marks}) AND store_id = ? ORDER BY next_at LIMIT ?`;
  }
  // tenancy: platform the platform items (store_id NULL: mail, R2) belong to no store; claimed apart from every store's
  return `UPDATE outbox SET state = 'running', claim = ?, lease_until = UTC_TIMESTAMP(3) + INTERVAL ${LEASE_MINUTES} MINUTE WHERE ((state = 'pending' AND next_at <= UTC_TIMESTAMP(3)) OR (state = 'running' AND lease_until < UTC_TIMESTAMP(3))) AND kind IN (${marks}) AND store_id IS NULL ORDER BY next_at LIMIT ?`;
}

/* ------------------------------------------------------------------ */
/* Merged sends                                                        */
/* ------------------------------------------------------------------ */

/** One send: a single item through `send`, or one store's items of one key through `batch.send`. */
export interface SendUnit<P> {
  batch: boolean;
  items: ClaimedItem<P>[];
}

/**
 * The sends for one claim, in claim order (P0b, CCR P5-1): without `batch` every item alone; with it, the items whose
 * `key` is null alone and the others grouped by key, at most `max` per group (the group sits where its first item
 * was). A `key` that throws counts as null.
 */
export function planUnits<P>(items: readonly ClaimedItem<P>[], batch: OutboxHandler<P>["batch"]): SendUnit<P>[] {
  if (!batch) return items.map((it) => ({ batch: false, items: [it] }));
  const max = Math.max(1, Number.isFinite(batch.max) ? Math.trunc(batch.max) : 1);
  const units: SendUnit<P>[] = [];
  const open = new Map<string, SendUnit<P>>();
  for (const it of items) {
    let key: string | null = null;
    try {
      key = batch.key(it);
    } catch {
      key = null;
    }
    if (typeof key !== "string") {
      units.push({ batch: false, items: [it] });
      continue;
    }
    const k = `${it.storeId ?? ""}|${key}`;
    const unit = open.get(k);
    if (unit && unit.items.length < max) unit.items.push(it);
    else {
      const fresh: SendUnit<P> = { batch: true, items: [it] };
      open.set(k, fresh);
      units.push(fresh);
    }
  }
  return units;
}

/* ------------------------------------------------------------------ */
/* Mail caps                                                           */
/* ------------------------------------------------------------------ */

/** The start of the next UTC hour after `now` (epoch ms): when an hour's `mail_sent` cap opens again. */
export function nextHourStart(now: number): number {
  return (Math.floor(now / 3_600_000) + 1) * 3_600_000;
}
