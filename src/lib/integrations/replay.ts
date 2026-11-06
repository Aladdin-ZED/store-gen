import "server-only";
/**
 * Store-side replay of outbox deliveries (P5 INTEGRATIONS; operations.md OPE-§28.1 row actions, OPE-§L "Replay",
 * OPE-§Q.26; docs/STORE-SAAS.md §H.1 re-send rule, ENGC-29, §E.8, §F.5). The integrations page's **Replay** (a `dead`
 * row of any kind), **Send again** (a `done` row of `telegram` and, R2, `webhook`) and **Replay all dead of this kind**
 * all go through the core's `replay(ctx, id)` (P8, src/lib/jobs/outbox.ts), after the rules the core leaves to the
 * store side:
 *
 *   - the row must be the store's own and a tenant kind: another store's id, an unknown id and a `mail` row all answer
 *     the seam's `not_found` (core §E.3);
 *   - `pending` / `running` rows: a no-op (a second click while the first replay waits), nothing called, no audit;
 *   - `done` rows: Send again for `telegram` / `webhook` only; a `done` CAPI or mail row is never re-sent (an ad
 *     platform would count it twice) → `ReplayRefused("not_resendable")`;
 *   - `cancelled` rows (a CAPI item past the 7-day guard): refused (`"cancelled"`), a replay would be cancelled again;
 *   - the bucket `s:<sid>:replay:<uid>` 30 per hour, charged once per call: "Replay all dead" is one call and touches at
 *     most 50 rows, oldest first;
 *   - one `integrations.outbox.replayed` audit row per replayed row, written by the core's `replay` (meta `{ kind, topic, outboxId, from }`, CCR r1-p5-12).
 *
 * Test orders never reach this: none of their items was enqueued (core D54). A replayed `capi` row still passes the
 * 7-day guard at send time (the handler's, OPE-§20.4).
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { outbox } from "@/lib/db/schema";
import { replay as coreReplay, type OutboxKind, type OutboxState } from "@/lib/jobs/outbox";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { SeamError } from "@/lib/tenancy/seam";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreCtx, WriteCtx } from "@/lib/tenancy/types";
import { TENANT_OUTBOX_KINDS } from "./deliveries";

/** `s:<sid>:replay:<uid>`: 30 replays per member per hour (OPE-§L rev 2, core §E.8 rev 2.1). */
export const REPLAY_BUCKET = { name: "replay", limit: 30, windowSec: 3600 } as const;
/** "Replay all dead of this kind" touches at most this many rows per call (OPE-§L). */
export const REPLAY_ALL_MAX = 50;
/** The kinds whose `done` rows may be sent again (core §H.1 rev 4). */
export const RESENDABLE_KINDS: ReadonlySet<OutboxKind> = new Set<OutboxKind>(["telegram", "webhook"]);

type TenantKind = (typeof TENANT_OUTBOX_KINDS)[number];
const TENANT_KINDS: ReadonlySet<string> = new Set(TENANT_OUTBOX_KINDS);
export const isTenantKind = (kind: string): kind is TenantKind => TENANT_KINDS.has(kind);

/** A row the rules above keep from replaying (the page words each code). */
export class ReplayRefused extends Error {
  constructor(readonly code: "not_resendable" | "cancelled") {
    super(code);
    this.name = "ReplayRefused";
  }
}

export type ReplayOutcome = "replayed" | "resent" | "noop";

export interface ReplayResult {
  outcome: ReplayOutcome;
  kind: TenantKind;
  topic: string;
}

/** What a replay needs of the session: the store's write scope, the actor and the member (the bucket's key). */
export type ReplayCtx = Pick<WriteCtx, "scope" | "actor" | "user">;

/* ------------------------------------------------------------------ */
/* the core's replay (a seam for test:integrations-db)                 */
/* ------------------------------------------------------------------ */

export interface ReplayDeps {
  replay(ctx: ReplayCtx, id: string): Promise<void>;
}

const realDeps: ReplayDeps = { replay: (ctx, id) => coreReplay(ctx as StoreCtx, id) };
let double: Partial<ReplayDeps> | null = null;

/** Stand-ins for P8's `replay` (scripts only; refused under NODE_ENV=production). */
export function setReplayDoubleForTests(d: Partial<ReplayDeps> | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("replay: the test double is refused in production");
  double = d;
}

const deps = (): ReplayDeps => (process.env.NODE_ENV === "production" || !double ? realDeps : { ...realDeps, ...double });

/* ------------------------------------------------------------------ */
/* replays                                                             */
/* ------------------------------------------------------------------ */

/** One call of the member's bucket; an empty bucket is the seam's `rate_limited`. */
async function charge(ctx: ReplayCtx): Promise<void> {
  const gate = await rateLimit(storeBucket(ctx.scope, REPLAY_BUCKET.name, ctx.user.id), REPLAY_BUCKET.limit, REPLAY_BUCKET.windowSec);
  if (!gate.ok) throw new SeamError("rate_limited");
}

async function replayed(ctx: ReplayCtx, row: { id: string; kind: TenantKind; topic: string }, resend: boolean): Promise<void> {
  // the core's replay writes the one `integrations.outbox.replayed` row (kind, topic, outboxId, from) (CCR r1-p5-12)
  void resend;
  await deps().replay(ctx, row.id);
}

/** What the rules say of one row's state (null: a no-op). */
function decide(kind: TenantKind, state: OutboxState): "replay" | "resend" | null {
  if (state === "dead") return "replay";
  if (state === "pending" || state === "running") return null;
  if (state === "done") {
    if (RESENDABLE_KINDS.has(kind)) return "resend";
    throw new ReplayRefused("not_resendable");
  }
  throw new ReplayRefused("cancelled");
}

/** Replay (dead) or Send again (done telegram / webhook) one row of the store. */
export async function replayDelivery(ctx: ReplayCtx, id: string): Promise<ReplayResult> {
  await charge(ctx);
  const [row] = await db
    .select({ id: outbox.id, kind: outbox.kind, topic: outbox.topic, state: outbox.state })
    .from(outbox)
    .where(byId(outbox, ctx.scope, id))
    .limit(1);
  if (!row || !isTenantKind(row.kind)) throw new SeamError("not_found");
  const kind = row.kind;
  const what = decide(kind, row.state);
  if (!what) return { outcome: "noop", kind, topic: row.topic };
  await replayed(ctx, { id: row.id, kind, topic: row.topic }, what === "resend");
  return { outcome: what === "resend" ? "resent" : "replayed", kind, topic: row.topic };
}

/** "Replay all dead of this kind": one bucket call, at most 50 dead rows of the store, oldest first. */
export async function replayDeadOfKind(ctx: ReplayCtx, kind: TenantKind): Promise<{ replayed: number; more: boolean }> {
  await charge(ctx);
  const rows = await db
    .select({ id: outbox.id, topic: outbox.topic })
    .from(outbox)
    .where(whereStore(outbox, ctx.scope, and(eq(outbox.kind, kind), eq(outbox.state, "dead"))))
    .orderBy(asc(outbox.createdAt), asc(outbox.id))
    .limit(REPLAY_ALL_MAX + 1);
  const batch = rows.slice(0, REPLAY_ALL_MAX);
  for (const r of batch) await replayed(ctx, { id: r.id, kind, topic: r.topic }, false);
  return { replayed: batch.length, more: rows.length > REPLAY_ALL_MAX };
}
