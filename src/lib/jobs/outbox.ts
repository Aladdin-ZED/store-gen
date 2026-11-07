import "server-only";
/**
 * The outbox (P8 PLATFORM OPS; docs/STORE-SAAS.md §H.1, R-D25, D24, ENGC-29; §K.2 P0): every delivery to the outside
 * (CAPI, Telegram; R2 webhooks, carriers, mail; R3 WhatsApp, push) is a row enqueued in the transaction that decided it
 * (`INSERT IGNORE` on `dedupe_key`), drained by `after()` right after the request and by the cron's `outbox` slot
 * (§H.2 slot 3), with backoff 1 min → 24 h, then `dead`, replayable from the store's integrations page and the console.
 *
 * Handlers register from `src/lib/jobs/handlers/<kind>.ts` (P5: capi, telegram; R2 S5: webhook, mail; R3 D2/D5:
 * carrier, whatsapp, push), which src/lib/jobs/registry.ts imports, so no track edits a registry; `drainOutbox` loads
 * that registry before it claims anything (test:registries proves every handler file is imported there).
 *
 *   await enqueue(scope, [{ kind: "telegram", topic: "new_order", dedupeKey: `tg:${orderId}`, payload }], { tx });
 *   after(() => drainOutbox({ storeId: scope.storeId, budgetMs: 8_000 }));        // the request that enqueued
 *   await replay(ctx, id);                                                        // dead → pending, audited
 *   await outboxSummary(scope);                                                   // the store's deliveries health
 *
 * - **enqueue** validates kind (as stored by 0005), topic ≤ 48, dedupe key ≤ 160 and target ≤ 64, refuses an
 *   impersonation scope (`impersonation_read_only`: the type already cannot carry one), seals a `pii: true` payload
 *   with the store's envelope (or the platform's) under purpose `outbox:v1` (§F.3), and inserts the batch with one
 *   multi-row INSERT IGNORE (on the caller's `tx` when given). It never inspects payloads: items of a test order are
 *   kept out by the callers' hooks, which check `order.is_test` first (D54).
 * - **drainOutbox** runs ./outbox/drain.ts over the database (./outbox/sql.ts): store by store through the system seam,
 *   the platform items apart; caps per handler (`maxPerTick` per drain, `perStorePerTick` per store), the handler's
 *   `timeoutMs`, the `capi_enabled` kill switch (§H.8: capi waits) and the handler's `paused()`, mail's platform caps
 *   (4 a minute, 150 an hour: over a cap the item is rescheduled, not attempted). A dead transition marks the store's
 *   health dirty and counts `dead_<kind>` in the error ring. It never throws (it runs inside `after()`).
 * - **The re-send rule** (ENGC-29): `dedupe_key` is unique across every state, so a deliberate re-send uses
 *   `resendKey(base, n)` and is audited by its caller; `reportDuplicates(result, at)` counts `{ duplicates }` in the
 *   error ring (area `outbox`, code `duplicate_enqueue`) so the order hooks never swallow them; `replay` accepts `done`
 *   rows of webhook and telegram only.
 * - **Data**: `last_error` is a code or plain text (masked, ≤ 300 chars), never the payload; summaries and job_runs carry
 *   counts, kinds, topics and codes only. Done rows are kept 14 days and dead rows 30 days (§H.11, P8 step 10).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/orders/hooks";
import { releaseOn } from "@/lib/auth/permissions";
import { outbox } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreCtx, StoreScope, SystemCtx, WriteScope } from "@/lib/tenancy/types";
import { errorCode, recordError } from "./errors";
import type { JobCtx, JobResult } from "./runner";
import type { DrainDeps, DrainState, RawItem } from "./outbox/drain";
import { DRAIN_ORDER, OUTBOX_SEAL_PURPOSE, PAYLOAD_MAX_BYTES, checkItems, replayRule } from "./outbox/rules";

export { OUTBOX_BACKOFF_MS, OUTBOX_CANCELLED_PREFIX, isFinalFailure } from "./outbox/rules";
export { httpRetryable, resendKey } from "./outbox/rules";

export type OutboxKind = "webhook" | "capi" | "telegram" | "whatsapp" | "mail" | "carrier" | "edge_purge" /* 0006, OS-12 (S6) */ | "push" /* 0007, PLA Q.21 */;
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
 * A kind's sender. The drainer calls `send(item, signal)` and `batch.send(items, signal)` with an `AbortSignal` that
 * fires at `timeoutMs` as a second argument (P8): a handler may declare it (`send(item, signal?)`) and pass it to its
 * fetch, so a timed-out request is cut instead of finishing after the item was already rescheduled.
 */
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
  /**
   * A per-send cap of the handler's own (R2 contract step C2-E, S5's request; OPE-§L: 2,000 webhook deliveries per
   * store per hour). The drainer asks it for each unit just before the send, like mail's platform caps: `{ ok: false,
   * retryAt }` gives the unit's items back with `next_at = retryAt` and attempts untouched (counted `rescheduled`); a
   * gate that throws counts as `{ ok: false, retryAt: now + 60 s }` and is recorded. A batch unit asks for its first item.
   */
  gate?(item: { storeId: string | null; targetId: string | null; topic: string }, now: number): Promise<{ ok: true } | { ok: false; retryAt: number }>;
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

/**
 * Per kind for one store: depth by state, the oldest pending, and the dead items with their last error (§H.5).
 * P8 (additive): every state counted, the oldest pending's age in minutes, the dead count, each dead row's last status.
 */
export interface OutboxSummary {
  byKind: {
    kind: OutboxKind;
    pending: number;
    running: number;
    dead: number;
    oldestPendingAt: string | null;
    /** P8: the other states */
    done: number;
    cancelled: number;
    /** P8: minutes since the oldest pending item was enqueued */
    oldestPendingMin: number | null;
  }[];
  /** the last 5 dead rows, newest first; never the payload */
  dead: { id: string; kind: OutboxKind; topic: string; attempts: number; lastError: string | null; at: string; /** P8 */ lastStatus: number | null }[];
  /** P8: every dead row of the store */
  deadCount: number;
}

/** The whole outbox for `getHealth()` and the console's Queues panel (§H.5, PLA-§15): never a payload. */
export interface PlatformOutboxSummary {
  byKind: { kind: OutboxKind; state: OutboxState; count: number }[];
  /** the oldest pending item per store and kind (store null = a platform item), oldest first, at most 20 */
  oldestPending: { storeId: string | null; kind: OutboxKind; at: string }[];
  deadCount: number;
  /** the last 20 dead rows, newest first */
  dead: { id: string; storeId: string | null; kind: OutboxKind; topic: string; attempts: number; lastStatus: number | null; lastError: string | null; at: string }[];
}

/** a row id (id26) */
const ID_RE = /^[0-9A-Z]{26}$/;
/** the store states whose items the cron drains (§A.5.3: active, and restricted for existing orders) */
export const OUTBOX_STORE_STATES = ["active", "restricted"] as const;
/** a kind found pending with no handler is probed for at most this often per process */
const MISSING_PROBE_MS = 10 * 60_000;

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

/** The store a write scope names (null: a platform item); refuses what the type would refuse at compile time. */
async function ownerOf(scope: WriteScope | "platform"): Promise<string | null> {
  if (scope === "platform") return null;
  const kind: string = scope.kind;
  if (kind === "member" || kind === "public" || kind === "system") return scope.storeId;
  const { SeamError } = await import("@/lib/tenancy/seam");
  throw new SeamError(kind === "impersonation" ? "impersonation_read_only" : "forbidden");
}

/**
 * INSERT IGNORE on dedupe_key; `duplicates` is surfaced by the order hooks, never swallowed (ENGC-29). With `opts.tx`
 * (P0b, CCR P5-1) the INSERT IGNORE runs on the caller's transaction handle, so an inTx hook's items roll back with
 * the order (OD6, OPE-§3.6): a delivery is exactly as durable as the state that decided it.
 */
export async function enqueue(scope: WriteScope | "platform", items: readonly OutboxItem[], opts?: { tx?: Tx }): Promise<{ inserted: number; duplicates: number }> {
  const storeId = await ownerOf(scope);
  if (!items.length) return { inserted: 0, duplicates: 0 };
  checkItems(items);
  const [{ newId }, { seal }, { insertItems }] = await Promise.all([import("@/lib/db/ids"), import("@/lib/security/crypto"), import("./outbox/sql")]);
  const rows = items.map((it, i): import("./outbox/sql").InsertRow => {
    const json = JSON.stringify(it.payload ?? null);
    if (Buffer.byteLength(json, "utf8") > PAYLOAD_MAX_BYTES) throw new RangeError(`outbox: item ${i}: payload over ${PAYLOAD_MAX_BYTES} bytes`);
    const payload = it.pii ? seal(json, storeId ? { store: storeId } : "platform", OUTBOX_SEAL_PURPOSE) : json;
    return [newId(), storeId, it.kind, it.topic, it.targetId ?? null, it.dedupeKey, payload, it.pii ? 1 : 0, it.notBefore ?? null];
  });
  const inserted = await insertItems(rows, opts?.tx);
  return { inserted, duplicates: items.length - inserted };
}

/**
 * Counts an enqueue's duplicates in the error ring (area `outbox`, code `duplicate_enqueue`, §H.1 / ENGC-29), one per
 * duplicate item (at most 100 per call), under the caller's area as the route and the store. Returns `result`.
 *
 *   reportDuplicates(await enqueue(scope, items, { tx }), { area: "hooks:integrations", storeId: scope.storeId });
 */
export function reportDuplicates<R extends { inserted: number; duplicates: number }>(result: R, at: { area: string; storeId?: string | null }): R {
  const n = Math.min(100, Math.max(0, Math.trunc(result.duplicates)));
  for (let i = 0; i < n; i++) recordError("outbox", null, { code: "duplicate_enqueue", storeId: at.storeId ?? null, route: at.area });
  return result;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Drain                                                               */
/* ------------------------------------------------------------------ */

/** Kinds already reported as pending without a handler (a bit per DRAIN_ORDER index), and the last probe: process state, no store data. */
let missingLogged = 0;
let missingProbeAt = -Infinity;

/** The drainer over the app's database, handlers, kill switch and mail caps. */
/** `platform_mail.perMinute` / `perHour` (R2), clamped to 1-30 and 1-2,000; the R1 constants when unreadable. */
async function mailCaps(perMinute: number, perHour: number): Promise<{ perMinute: number; perHour: number }> {
  try {
    const { getPlatformSetting } = await import("@/lib/settings");
    const mail = await getPlatformSetting("platform_mail");
    const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : d);
    return { perMinute: clamp(mail.perMinute, 1, 30, perMinute), perHour: clamp(mail.perHour, 1, 2_000, perHour) };
  } catch (err) {
    recordError("outbox", err, { route: "outbox:mail:caps" });
    return { perMinute, perHour };
  }
}

async function appDeps(yieldLoop: () => Promise<void>): Promise<DrainDeps> {
  const [{ dbDrainStore }, { newId }, crypto, { killSwitchTripped }, { markHealthDirty }, rate, usage] = await Promise.all([
    import("./outbox/sql"),
    import("@/lib/db/ids"),
    import("@/lib/security/crypto"),
    import("@/lib/auth/platform-config"),
    import("@/lib/platform/health-snapshot"),
    import("@/lib/security/rate-limit"),
    import("@/lib/tenancy/usage"),
    import("./registry"), // the handler files register themselves at import (src/lib/jobs/registry.ts)
  ]);
  const { MAIL_PER_HOUR, MAIL_PER_MINUTE, nextHourStart } = await import("./outbox/rules");
  // R2 (PLA-§13.5; contract step C2-E): the caps the mail screen edits (`platform_mail`), clamped; R1 keeps the constants
  const caps = releaseOn("R2") ? await mailCaps(MAIL_PER_MINUTE, MAIL_PER_HOUR) : { perMinute: MAIL_PER_MINUTE, perHour: MAIL_PER_HOUR };
  return {
    store: dbDrainStore,
    handler: outboxHandler,
    now: Date.now,
    killed: async (kind) => kind === "capi" && (await killSwitchTripped("capi_enabled")),
    async mailGate(now) {
      const minute = await rate.rateLimit(rate.platformBucket("outbox:mail"), caps.perMinute, 60);
      if (!minute.ok) return { ok: false, retryAt: now + Math.max(1, minute.retryAfter) * 1000 };
      try {
        await usage.chargePlatformUsage("mail_sent", usage.platformPeriodOf("hour", new Date(now)), 1, { limit: caps.perHour });
      } catch (err) {
        if (err instanceof usage.QuotaError) return { ok: false, retryAt: nextHourStart(now) };
        throw err;
      }
      return { ok: true };
    },
    open: (item: RawItem) => JSON.parse(item.encrypted ? crypto.open(item.payload, item.storeId ? { store: item.storeId } : "platform", OUTBOX_SEAL_PURPOSE) : item.payload) as unknown,
    newClaim: newId,
    onDead(item) {
      if (item.storeId) void markHealthDirty(item.storeId).catch(() => undefined);
      recordError("outbox", null, { code: `dead_${item.kind}`, storeId: item.storeId, route: `outbox:${item.kind}` });
    },
    recordError,
    yieldLoop,
    async onMissing(scope, kinds) {
      const unlogged = kinds.filter((k) => !(missingLogged & (1 << DRAIN_ORDER.indexOf(k))));
      if (!unlogged.length || Date.now() - missingProbeAt < MISSING_PROBE_MS) return;
      missingProbeAt = Date.now();
      let found: OutboxKind[] = [];
      try {
        found = await dbDrainStore.pendingKinds(scope, unlogged);
      } catch (err) {
        recordError("outbox", err, { storeId: scope.storeId, route: "outbox:probe" }); // a probe never fails the drain
      }
      for (const kind of found) {
        missingLogged |= 1 << DRAIN_ORDER.indexOf(kind);
        console.error(`[outbox] no handler registered for kind "${kind}": its items stay pending until one is`);
        recordError("outbox", null, { code: `no_handler_${kind}`, storeId: scope.storeId, route: `outbox:${kind}` });
      }
    },
  };
}

const setImmediateLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Platform items first (mail is capped and small), then the stores with due items, round robin from the job's cursor. */
async function drainEverything(deps: DrainDeps, ctx: SystemCtx, kinds: readonly OutboxKind[], deadline: number, st: DrainState): Promise<{ stores: number; platformFailed: boolean }> {
  const { drainOwner } = await import("./outbox/drain");
  const { forEachStore, systemScope } = await import("./scope");
  let platformFailed = false;
  try {
    await drainOwner(deps, null, kinds, deadline, st);
  } catch (err) {
    platformFailed = true;
    console.error("[outbox] platform items not drained:", errorCode(err));
    recordError("outbox", err, { route: "outbox:platform" });
  }
  if (Date.now() >= deadline) {
    st.more = true;
    return { stores: 0, platformFailed };
  }
  const run = await forEachStore(ctx, { job: ctx.job, states: OUTBOX_STORE_STATES, budgetMs: Math.max(1, deadline - Date.now()), where: "pending_outbox" }, async (_scope, store) => {
    // the frozen callback types its scope as a StoreScope; the outcome writes need the job's own WriteScope
    const n = await drainOwner(deps, systemScope(ctx, store.id), kinds, deadline, st);
    await deps.yieldLoop();
    return n;
  });
  if (!run.done) st.more = true;
  return { stores: run.visited, platformFailed };
}

/** `opts.kinds` checked, in DRAIN_ORDER (default: every kind). */
function kindsOf(kinds: readonly OutboxKind[] | undefined): OutboxKind[] {
  if (kinds === undefined) return [...DRAIN_ORDER];
  const bad = kinds.filter((k) => !DRAIN_ORDER.includes(k));
  if (bad.length) throw new RangeError(`outbox: unknown kind "${String(bad[0]).slice(0, 16)}"`);
  return DRAIN_ORDER.filter((k) => kinds.includes(k));
}

/**
 * Claims due rows (lease pattern, no SKIP LOCKED on 10.4), sends them through their handler within `budgetMs`. Per
 * kind, a handler's `paused()` is asked once before claiming (a paused kind is skipped untouched), and a handler's
 * `batch` merges one store's claimed items of one key into a single send; the backoff (`OUTBOX_BACKOFF_MS`) and the
 * dead transition (`isFinalFailure`) are judged per item (P0b, CCR P5-1).
 *
 * With `storeId` (the `after()` drain of the request that enqueued): that store's items only. Without: the platform
 * items, then every store with due items (`active` / `restricted`), round robin. Never throws: a failure is logged,
 * counted in the error ring and reported as `more`.
 */
/**
 * `platformOnly` (R2 contract step C2-E, S6's request): drain only the platform items (owner null: S6's `edge_purge`
 * rows, scope "platform", target_id = the store), skipping the per-store pass; S6 drains them right after enqueueing.
 */
export async function drainOutbox(opts: { budgetMs: number; storeId?: string; kinds?: OutboxKind[]; platformOnly?: true }): Promise<DrainReport> {
  const started = Date.now();
  const { newDrainState, drainOwner } = await import("./outbox/drain");
  const st = newDrainState();
  try {
    if (!Number.isFinite(opts.budgetMs) || opts.budgetMs <= 0) throw new RangeError("outbox: drainOutbox needs a positive budget");
    const kinds = kindsOf(opts.kinds);
    const deadline = started + opts.budgetMs;
    const deps = await appDeps(setImmediateLoop);
    const { systemCtx, systemScope } = await import("./scope");
    const ctx = systemCtx("outbox");
    if (opts.platformOnly) await drainOwner(deps, null, kinds, deadline, st);
    else if (opts.storeId !== undefined) await drainOwner(deps, systemScope(ctx, opts.storeId), kinds, deadline, st);
    else await drainEverything(deps, ctx, kinds, deadline, st);
  } catch (err) {
    st.more = true;
    console.error("[outbox] drain failed:", errorCode(err));
    recordError("outbox", err, { route: "outbox:drain", storeId: opts.storeId ?? null });
  }
  return { ms: Date.now() - started, claimed: st.claimed, done: st.done, retried: st.retried, dead: st.dead, more: st.more };
}

/**
 * The cron's `outbox` job (§H.2 slot 3, 13 s shared by every handler; registered in ./tracks/core.ts): the platform
 * items, then the stores with due items through forEachStore (its cursor, its per-store job_runs rows), with the
 * job's `yield()` between sends and stores.
 */
export async function outboxJob(ctx: JobCtx): Promise<JobResult> {
  const { newDrainState } = await import("./outbox/drain");
  const st = newDrainState();
  const deps = await appDeps(() => ctx.yield());
  const r = await drainEverything(deps, ctx, DRAIN_ORDER, ctx.deadline, st);
  const paused = (Object.keys(st.paused) as OutboxKind[]).filter((k) => st.paused[k]);
  return {
    done: !st.more,
    processed: st.done + st.retried + st.dead,
    // `delivered`, not `done`: the runner writes its own `done` (the run finished) into the same summary
    summary: {
      stores: r.stores,
      claimed: st.claimed,
      delivered: st.done,
      retried: st.retried,
      dead: st.dead,
      released: st.released,
      rescheduled: st.rescheduled,
      ...(st.lost ? { lost: st.lost } : {}),
      ...(paused.length ? { paused: paused.join(",") } : {}),
    },
    ...(r.platformFailed ? { errorCode: "platform_failed" } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Replay                                                              */
/* ------------------------------------------------------------------ */

/**
 * dead → pending, audited; also `done` rows of `webhook` and `telegram` (a deliberate re-send), never `capi` or `mail`.
 *
 * - A store ctx needs a write scope (an impersonation scope answers `impersonation_read_only`) and
 *   `integrations.manage`; a row outside its store answers `not_found` and is left alone. Audit
 *   `integrations.outbox.replayed` `{ kind, topic, outboxId, from }`.
 * - A platform ctx (the console, `stores.lifecycle`) may act on any store's row or a platform item. Audit
 *   `platform.outbox.replayed` with the row's store.
 * - The row goes back to `pending` with attempts 0 and `next_at` now; its last status and error stay until the next
 *   send. A `pending` or `running` row is left as it is (a second click is a no-op, no second audit row); a done row of
 *   another kind, or a `cancelled` one, answers `invalid`.
 */
export async function replay(ctx: StoreCtx | PlatformCtx, id: string): Promise<void> {
  const { SeamError, memberWriteScope } = await import("@/lib/tenancy/seam");
  if ("scope" in ctx) {
    const scope = memberWriteScope(ctx);
    if (!ctx.can("integrations.manage")) throw new SeamError("forbidden");
    if (typeof id !== "string" || !ID_RE.test(id)) throw new SeamError("not_found");
    return replayStoreRow(ctx, scope, id);
  }
  if (!ctx.can("stores.lifecycle")) throw new SeamError("forbidden");
  if (typeof id !== "string" || !ID_RE.test(id)) throw new SeamError("not_found");
  return replayAnyRow(ctx, id);
}

/**
 * the columns a replay resets: pending now, attempts 0, no claim or lease. A dead row is no longer finished; a done
 * row (the deliberate re-send of telegram / webhook) keeps its `done_at`, so the handler knows the claim is a re-send
 * and marks it "(renvoi)" (CCR r1-p5-11); the next outcome overwrites it.
 */
const replayed = (from: OutboxState) => ({ state: "pending" as const, attempts: 0, nextAt: sql`UTC_TIMESTAMP(3)`, claim: null, leaseUntil: null, ...(from === "done" ? {} : { doneAt: null }) });

/** What a row's replay answers: throws the refusal, true to replay, false for nothing to do. */
async function replayable(row: { state: OutboxState; kind: OutboxKind } | undefined): Promise<boolean> {
  const { SeamError } = await import("@/lib/tenancy/seam");
  if (!row) throw new SeamError("not_found");
  const rule = replayRule(row.state, row.kind);
  if (rule === "invalid") {
    const { AuthRefusal } = await import("@/lib/auth/errors");
    throw new AuthRefusal("invalid");
  }
  return rule === "replay";
}

/** A store's own row, through its write scope: another store's id matches nothing (`not_found`), its row untouched. */
async function replayStoreRow(ctx: StoreCtx, scope: WriteScope, id: string): Promise<void> {
  const [{ db }, { auditFrom }] = await Promise.all([import("@/lib/db/client"), import("@/lib/audit")]);
  const [row] = await db.select({ kind: outbox.kind, topic: outbox.topic, state: outbox.state }).from(outbox).where(whereStore(outbox, scope, eq(outbox.id, id))).limit(1);
  if (!(await replayable(row))) return;
  const [res] = await db
    .update(outbox)
    .set(replayed(row!.state))
    .where(whereStore(outbox, scope, eq(outbox.id, id), eq(outbox.state, row!.state)));
  if (res.affectedRows !== 1) return; // changed meanwhile (another click, a drain): nothing replayed, nothing audited
  await auditFrom(ctx, "integrations.outbox.replayed", { target: id, meta: { kind: row!.kind, topic: row!.topic, outboxId: id, from: row!.state } });
}

/** The console's replay (`stores.lifecycle`): any store's row, or a platform item. */
async function replayAnyRow(ctx: PlatformCtx, id: string): Promise<void> {
  const [{ db }, { auditFrom }] = await Promise.all([import("@/lib/db/client"), import("@/lib/audit")]);
  const [row] = await db
    .select({ storeId: outbox.storeId, kind: outbox.kind, topic: outbox.topic, state: outbox.state })
    .from(outbox) // tenancy: platform the console replays any store's row, or a platform item (stores.lifecycle, PLA-§15)
    .where(eq(outbox.id, id))
    .limit(1);
  if (!(await replayable(row))) return;
  const [res] = await db
    .update(outbox) // tenancy: platform the console's replay of the row it just read (any store, stores.lifecycle)
    .set(replayed(row!.state))
    .where(and(eq(outbox.id, id), eq(outbox.state, row!.state)));
  if (res.affectedRows !== 1) return;
  await auditFrom(ctx, "platform.outbox.replayed", { storeId: row!.storeId, target: id, meta: { kind: row!.kind, topic: row!.topic, outboxId: id, from: row!.state } });
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v)) ? "" : "Z"));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
const minutesSince = (at: string | null, now: number): number | null => (at === null ? null : Math.max(0, Math.floor((now - Date.parse(at)) / 60_000)));

/** The store's outbox health (§H.5, OPE-§28.1): counts by kind × state, the oldest pending, the dead rows. */
export async function outboxSummary(scope: StoreScope): Promise<OutboxSummary> {
  const { db } = await import("@/lib/db/client");
  const now = Date.now();
  const counts = await db
    .select({ kind: outbox.kind, state: outbox.state, n: sql<number>`COUNT(*)`, oldest: sql<unknown>`MIN(${outbox.createdAt})` })
    .from(outbox)
    .where(whereStore(outbox, scope))
    .groupBy(outbox.kind, outbox.state);
  const dead = await db
    .select({ id: outbox.id, kind: outbox.kind, topic: outbox.topic, attempts: outbox.attempts, lastStatus: outbox.lastStatus, lastError: outbox.lastError, doneAt: outbox.doneAt, nextAt: outbox.nextAt })
    .from(outbox)
    .where(whereStore(outbox, scope, eq(outbox.state, "dead")))
    .orderBy(desc(outbox.doneAt), desc(outbox.id))
    .limit(5);

  const byKind = new Map<OutboxKind, OutboxSummary["byKind"][number]>();
  let deadCount = 0;
  for (const c of counts) {
    const k = byKind.get(c.kind) ?? { kind: c.kind, pending: 0, running: 0, dead: 0, oldestPendingAt: null, done: 0, cancelled: 0, oldestPendingMin: null };
    byKind.set(c.kind, k);
    const n = Number(c.n);
    k[c.state] = n;
    if (c.state === "dead") deadCount += n;
    if (c.state === "pending") {
      k.oldestPendingAt = iso(c.oldest);
      k.oldestPendingMin = minutesSince(k.oldestPendingAt, now);
    }
  }
  return {
    byKind: DRAIN_ORDER.filter((k) => byKind.has(k)).map((k) => byKind.get(k)!),
    dead: dead.map((d) => ({ id: d.id, kind: d.kind, topic: d.topic, attempts: d.attempts, lastError: d.lastError, at: iso(d.doneAt ?? d.nextAt)!, lastStatus: d.lastStatus })),
    deadCount,
  };
}

/** The platform-wide outbox for `getHealth()` (P8 step 11) and the console's Queues panel; console code only. */
export async function platformOutboxSummary(): Promise<PlatformOutboxSummary> {
  const { db } = await import("@/lib/db/client");
  const byKind = await db
    .select({ kind: outbox.kind, state: outbox.state, n: sql<number>`COUNT(*)` })
    .from(outbox) // tenancy: platform getHealth's queue depth: every store's rows and the platform items, counts only (§H.5)
    .groupBy(outbox.kind, outbox.state);
  const oldest = await db
    .select({ storeId: outbox.storeId, kind: outbox.kind, at: sql<unknown>`MIN(${outbox.createdAt})` })
    .from(outbox) // tenancy: platform the oldest pending item per store and kind (§H.5, PLA-§15 Queues), no payload
    .where(eq(outbox.state, "pending"))
    .groupBy(outbox.storeId, outbox.kind)
    .orderBy(sql`MIN(${outbox.createdAt})`)
    .limit(20);
  const dead = await db
    .select({ id: outbox.id, storeId: outbox.storeId, kind: outbox.kind, topic: outbox.topic, attempts: outbox.attempts, lastStatus: outbox.lastStatus, lastError: outbox.lastError, doneAt: outbox.doneAt, nextAt: outbox.nextAt })
    .from(outbox) // tenancy: platform the console's dead items with Replay (PLA-§15 Queues): kind, topic, attempts, last error
    .where(eq(outbox.state, "dead"))
    .orderBy(desc(outbox.doneAt), desc(outbox.id))
    .limit(20);
  return {
    byKind: byKind.map((r) => ({ kind: r.kind, state: r.state, count: Number(r.n) })).sort((a, b) => DRAIN_ORDER.indexOf(a.kind) - DRAIN_ORDER.indexOf(b.kind) || a.state.localeCompare(b.state)),
    oldestPending: oldest.map((r) => ({ storeId: r.storeId, kind: r.kind, at: iso(r.at)! })).filter((r) => r.at !== null),
    deadCount: byKind.filter((r) => r.state === "dead").reduce((n, r) => n + Number(r.n), 0),
    dead: dead.map((d) => ({ id: d.id, storeId: d.storeId, kind: d.kind, topic: d.topic, attempts: d.attempts, lastStatus: d.lastStatus, lastError: d.lastError, at: iso(d.doneAt ?? d.nextAt)! })),
  };
}
