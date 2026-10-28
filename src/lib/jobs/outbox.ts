import "server-only";
/**
 * The outbox (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.1, R-D25, D24, ENGC-29; §K.2 P0): every delivery to the outside
 * (CAPI, Telegram; R2 webhooks, carriers, mail; R3 WhatsApp, push) is a row enqueued in the transaction that decided it
 * (`INSERT IGNORE` on `dedupe_key`), drained by `after()` right after the request and by the cron's `outbox` slot
 * (§H.2 slot 3), with backoff 1 min → 24 h, then `dead`, replayable from the store's integrations page and the console.
 *
 * Handlers register from `src/lib/jobs/handlers/<kind>.ts` (P5: capi, telegram; R2 S5: webhook, mail; R3 D2/D5:
 * carrier, whatsapp, push), which src/lib/jobs/registry.ts imports, so no track edits a registry. Frozen at P0: the
 * registration works; `enqueue`, `drainOutbox`, `replay` and `outboxSummary` are P8's typed stubs.
 */
import type { outbox } from "@/lib/db/schema";
import type { Tx } from "@/lib/orders/hooks";
import type { PlatformCtx, StoreCtx, StoreScope, WriteScope } from "@/lib/tenancy/types";

export type OutboxKind = "webhook" | "capi" | "telegram" | "whatsapp" | "mail" | "carrier" | "push" /* 0007, PLA Q.21 */;
export type OutboxState = (typeof outbox.$inferSelect)["state"];

export interface OutboxItem<P = unknown> {
  kind: OutboxKind;
  topic: string;
  targetId?: string;
  /** unique across every state: a deliberate re-send appends ":r<n>" and is audited (ENGC-29) */
  dedupeKey: string;
  payload: P;
  /** sealed with the store's envelope (§F.3) */
  pii?: boolean;
  notBefore?: Date;
}

/** A claimed row as a handler receives it (payload opened). */
export interface ClaimedItem<P = unknown> {
  id: string;
  /** null: a platform item (mail) */
  storeId: string | null;
  kind: OutboxKind;
  topic: string;
  targetId: string | null;
  dedupeKey: string;
  payload: P;
  /** sends tried before this one */
  attempts: number;
  createdAt: Date;
}

export type SendResult = { ok: true; status?: number } | { ok: false; retry: boolean; status?: number; error: string };

/**
 * The delay before retry n (n = attempts after the failing send, 1-based): 1 min, 5 min, 30 min, 2 h, 6 h, 24 h (§H.1;
 * P0b, CCR P5-1). A send that fails after the last step is final: the row goes `dead`.
 */
export const OUTBOX_BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000] as const;

/**
 * Is this failing send the item's last (P0b, CCR P5-1)? True for a refusal (`retry: false`) and for a retryable
 * failure once the ladder is used up: `attempts` counts the sends tried before this one, so the 7th failing send is
 * final. P5's handlers fire `int.delivery_dead` and the failing notices once, at this dead transition (OPE-§21.3,
 * §28.2), never on every retry.
 */
export function isFinalFailure(item: Pick<ClaimedItem, "attempts">, result: SendResult): boolean {
  return !result.ok && (!result.retry || item.attempts >= OUTBOX_BACKOFF_MS.length);
}

export interface OutboxHandler<P> {
  kind: OutboxKind;
  maxPerTick: number;
  perStorePerTick: number;
  timeoutMs: number;
  send(item: ClaimedItem<P>): Promise<SendResult>;
  /**
   * The kind's pause (P0b, CCR P5-1; §H.8 `capi_enabled`: "handler pauses, items wait"). `drainOutbox` asks once per
   * drain and kind, before claiming; while it answers true the kind's rows are not claimed, no attempt is counted and
   * `next_at` does not move, so the items go out unchanged when the switch comes back.
   */
  paused?(): Promise<boolean>;
  /**
   * Merged sends (P0b, CCR P5-1; OPE-§21.3: a store's Telegram `new_order` items in one message, ≤ 10). The drainer
   * groups the claimed items of one store that share a non-null `key` (at most `max` per group) into one `send`
   * call; an item whose key is null goes through the handler's own `send`. The result applies to every item of the
   * group, with `attempts`, the backoff and `isFinalFailure` judged per item.
   */
  batch?: {
    max: number;
    key(item: ClaimedItem<P>): string | null;
    send(items: readonly ClaimedItem<P>[]): Promise<SendResult>;
  };
}

export interface DrainReport {
  ms: number;
  claimed: number;
  done: number;
  retried: number;
  dead: number;
  /** the budget ran out with due items left */
  more: boolean;
}

/** Per kind for one store: depth by state, the oldest pending, and the dead items with their last error (§H.5). */
export interface OutboxSummary {
  byKind: { kind: OutboxKind; pending: number; running: number; dead: number; oldestPendingAt: string | null }[];
  dead: { id: string; kind: OutboxKind; topic: string; attempts: number; lastError: string | null; at: string }[];
}

/**
 * INSERT IGNORE on dedupe_key; `duplicates` is surfaced by the order hooks, never swallowed (ENGC-29). With `opts.tx`
 * (P0b, CCR P5-1) the INSERT IGNORE runs on the caller's transaction handle, so an inTx hook's items roll back with
 * the order (OD6, OPE-§3.6): a delivery is exactly as durable as the state that decided it.
 */
export async function enqueue(scope: WriteScope | "platform", items: readonly OutboxItem[], opts?: { tx?: Tx }): Promise<{ inserted: number; duplicates: number }> {
  void scope;
  void items;
  void opts;
  throw new Error("not implemented: P8 enqueue");
}

declare global {
  var __sgOutboxHandlers: Map<OutboxKind, OutboxHandler<unknown>> | undefined;
}

/** A function declaration (hoisted): a handler file may register while a module that imports it is still loading. */
function handlers(): Map<OutboxKind, OutboxHandler<unknown>> {
  return (globalThis.__sgOutboxHandlers ??= new Map<OutboxKind, OutboxHandler<unknown>>());
}

/** Called from `src/lib/jobs/handlers/<kind>.ts`; a second registration of a kind replaces the first (a dev reload). */
export function registerOutboxHandler<P>(h: OutboxHandler<P>): void {
  handlers().set(h.kind, h);
}

/** The handler registered for a kind (the drainer's lookup; null until the owning track's file registers it). */
export function outboxHandler(kind: OutboxKind): OutboxHandler<unknown> | null {
  return handlers().get(kind) ?? null;
}

/**
 * Claims due rows (lease pattern, no SKIP LOCKED on 10.4), sends them through their handler within `budgetMs`. Per
 * kind, a handler's `paused()` is asked once before claiming (a paused kind is skipped untouched), and a handler's
 * `batch` merges one store's claimed items of one key into a single send; the backoff (`OUTBOX_BACKOFF_MS`) and the
 * dead transition (`isFinalFailure`) are judged per item (P0b, CCR P5-1).
 */
export async function drainOutbox(opts: { budgetMs: number; storeId?: string; kinds?: OutboxKind[] }): Promise<DrainReport> {
  void opts;
  throw new Error("not implemented: P8 drainOutbox");
}

/** dead → pending, audited; also `done` rows of `webhook` and `telegram` (a deliberate re-send), never `capi` or `mail`. */
export async function replay(ctx: StoreCtx | PlatformCtx, id: string): Promise<void> {
  void ctx;
  void id;
  throw new Error("not implemented: P8 replay");
}

export async function outboxSummary(scope: StoreScope): Promise<OutboxSummary> {
  void scope;
  throw new Error("not implemented: P8 outboxSummary");
}
