import "server-only";
/**
 * Agent presence and the lease bookkeeping it drives (P4 CALL CENTER; operations.md OPE-§5.2, §5.5, OD7, OD8, OD60,
 * §2.4; docs/STORE-SAAS.md §E.6).
 *
 *   setPresence     Online / Break / Offline (agents.self). Break and Offline release the claim the agent holds
 *                   (`released`, why "break"); an explicit break is respected by Next until the agent taps Online.
 *   touchAgent      the heartbeat (`POST /ops/presence { heartbeat }` every 60 s while the tab is visible) and every
 *                   Next: `last_seen_at`, and the lease of the order the agent holds renewed to now + leaseMinutes
 *                   (OD60), at most one write per 60 s per agent. The renewal is guarded by `lease_until > now`, so an
 *                   expired lease is never resurrected (the order may already be in a colleague's hands).
 *   isLive          online and a heartbeat within 3 minutes (round-robin assignment, the board)
 *   releaseClaims   one door for ending claims: skip, break, a manager's reassignment; `released` per order
 *
 * `agent_profiles` rows are created lazily (OPE-§2.4): the first presence write of a member who takes calls inserts it.
 * The clock is `opsNow()` (`Date.now()`), so the DB-backed suite drives leases with a fake clock (OPE-§O.2).
 */
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentProfiles, orders } from "@/lib/db/schema";
import { appendEvents, type NewOrderEvent } from "@/lib/orders/events";
import type { OrderActor } from "@/lib/orders/state";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";

export type Presence = "online" | "break" | "offline";
export type AgentProfileRow = typeof agentProfiles.$inferSelect;

/** The call centre's clock: `Date.now()`, so a test's fake clock reaches leases, windows and caches alike (OD8). */
export const opsNow = (): Date => new Date(Date.now());

/** a heartbeat this recent keeps an online agent live (OPE-§5.5) */
export const LIVE_MS = 180_000;
/** at most one presence write per agent per this long (OPE-§5.5, §13.2 "≤ 1 write per 60 s") */
export const TOUCH_EVERY_MS = 60_000;

export const isLive = (a: Pick<AgentProfileRow, "presence" | "lastSeenAt">, now: Date): boolean =>
  a.presence === "online" && !!a.lastSeenAt && now.getTime() - a.lastSeenAt.getTime() <= LIVE_MS;

/** the agents whose presence was written in the last 60 s (per store, per user): the heartbeat's throttle */
const touched = scopedCache<number>({ name: "ops-touch", maxEntries: 20_000, ttlMs: TOUCH_EVERY_MS });

/** The agent's profile row, or null before their first presence write. */
export async function profileOf(scope: StoreScope, userId: string): Promise<AgentProfileRow | null> {
  const [row] = await db.select().from(agentProfiles).where(whereStore(agentProfiles, scope, eq(agentProfiles.userId, userId))).limit(1);
  return row ?? null;
}

/** Writes the presence (and, when online, the heartbeat), creating the profile on first use. */
export async function writePresence(scope: WriteScope, userId: string, p: Presence, now: Date): Promise<void> {
  const seen = p === "online" ? { lastSeenAt: now } : {};
  await db
    .insert(agentProfiles)
    .values(storeValues(scope, { userId, presence: p, presenceAt: now, ...seen }))
    .onDuplicateKeyUpdate({ set: { presence: p, presenceAt: now, ...seen } });
  if (p === "online") touched.set(scope.storeId, userId, now.getTime());
  else touched.delete(scope.storeId, userId);
}

/**
 * Renews the lease of the order `userId` holds to now + leaseMinutes, inside its own UPDATE (OPE-§5.2): 0 or 1 row,
 * never a lease that has already expired. No `rev` bump (a renewal changes no state the card shows).
 */
export async function renewHeldLease(scope: WriteScope, userId: string, now: Date, leaseMinutes: number, orderId?: string): Promise<boolean> {
  const until = new Date(now.getTime() + leaseMinutes * 60_000);
  const held = and(eq(orders.assigneeId, userId), isNotNull(orders.claimToken), gt(orders.leaseUntil, now));
  const res = await db
    .update(orders)
    .set({ leaseUntil: until })
    .where(whereStore(orders, scope, held, orderId === undefined ? undefined : eq(orders.id, orderId)));
  return affectedRows(res) > 0;
}

/**
 * The heartbeat (OPE-§5.5, OD60): `last_seen_at` and the held lease, at most once per 60 s per agent. Silent for an
 * agent with no profile yet (Next creates it).
 */
export async function touchAgent(scope: WriteScope, userId: string): Promise<void> {
  if (touched.get(scope.storeId, userId) !== undefined) return;
  const now = opsNow();
  touched.set(scope.storeId, userId, now.getTime());
  const { leaseMinutes } = await getStoreSetting(scope, "ops");
  await db.update(agentProfiles).set({ lastSeenAt: now }).where(whereStore(agentProfiles, scope, eq(agentProfiles.userId, userId)));
  await renewHeldLease(scope, userId, now, leaseMinutes);
}

/** Forget the heartbeat throttle of one agent (tests; a presence change already does). */
export function forgetTouch(scope: StoreScope, userId: string): void {
  touched.delete(scope.storeId, userId);
}

/**
 * Ends the claims `holder` holds (all of them, or the one on `orderId`): `claim_token` and `lease_until` cleared,
 * `rev + 1` (the holder's open card answers `conflict` on its next write, OPE-§13.2a), one `released` event per order
 * with `why`. The assignee stays: the agent who worked the order meets it first when it is due again (claim ORDER BY).
 * Answers the released order ids.
 */
export async function releaseClaims(
  scope: WriteScope,
  holder: string,
  orderId: string | null,
  why: "skip" | "break" | "manager",
  actor: Pick<OrderActor, "kind" | "userId">,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const mine = and(eq(orders.assigneeId, holder), isNotNull(orders.claimToken));
    const rows = await tx
      .select({ id: orders.id, rev: orders.rev })
      .from(orders)
      .where(whereStore(orders, scope, mine, orderId === null ? undefined : eq(orders.id, orderId)))
      .for("update");
    if (!rows.length) return [];
    const events: NewOrderEvent[] = [];
    for (const r of rows) {
      await tx
        .update(orders)
        .set({ claimToken: null, leaseUntil: null, rev: r.rev + 1 })
        .where(and(byId(orders, scope, r.id), eq(orders.rev, r.rev)));
      events.push({ orderId: r.id, actorKind: actor.kind, actorId: actor.userId, type: "released", reasonCode: why, meta: { why }, rev: r.rev + 1 });
    }
    await appendEvents(tx, scope, events);
    return rows.map((r) => r.id);
  });
}

/**
 * Online, Break or Offline (agents.self). Break and Offline release the held claim (`released`, why "break", OPE-§5.2);
 * Online writes the heartbeat too.
 */
export async function setPresence(ctx: WriteCtx, p: Presence): Promise<ActionResult<void>> {
  if (!ctx.can("agents.self")) return { ok: false, error: "forbidden" };
  if (p !== "online" && p !== "break" && p !== "offline") return { ok: false, error: "invalid" };
  const now = opsNow();
  await writePresence(ctx.scope, ctx.user.id, p, now);
  if (p !== "online") await releaseClaims(ctx.scope, ctx.user.id, null, "break", { kind: "user", userId: ctx.user.id });
  return { ok: true, data: undefined };
}

export const affectedRows = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
};
