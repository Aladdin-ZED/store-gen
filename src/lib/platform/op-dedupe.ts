import "server-only";
/**
 * The console action kit (platform.md PLA-§4.5 "Dangerous actions" and "Mutations", §L "Operation de-duplication",
 * §M.5): what every action of src/app/admin/(console)/**\/actions.ts wraps around its write.
 *
 *   return platformAction("signups.decide", (ctx) => withOp(ctx, opOf(input), async () => done(await approveReview(ctx, input))));
 *
 * `withOp`: the sheet mints an operation id (a ULID) when it opens and re-sends the SAME id after a step-up or a
 * retry; the first run of `p:op:<userId>.<opId>` (the bucket of ./op-once.ts, 10 minutes) does the write, a repeat
 * answers the first result again from the `console-op` cache (a scopedCache keyed by the staff member and the id).
 * A repeat that reaches another process (no cached result) answers `conflict` (`console.op.duplicate`: reload). A
 * failed first run gives the id back (its bucket row is deleted), so the corrected sheet can send it again. An action
 * called without an id runs as is (reads, and the callers that de-duplicate in their domain function).
 *
 * `done` / `doneStore`: `refresh()` from next/cache after every write (PD39; outside a server action, in the QA
 * scripts, the call is skipped), and for an action on one store `markHealthDirty` plus its console strips dropped
 * (the `console-strips` cache, PLA-§M.5).
 */
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";
import { platformBucket } from "@/lib/security/rate-limit";
import { scopedCache } from "@/lib/tenancy/cache";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { markHealthDirty } from "./health-snapshot";
import { OP_WINDOW_SEC, OpId, firstRun } from "./op-once";
import { invalidateStrips } from "./profile/overview-strips";

/** the first result of each (staff member, operation id), kept for the bucket's window */
const replays = scopedCache<{ value: unknown }>({ name: "console-op", maxEntries: 2_000, ttlMs: OP_WINDOW_SEC * 1_000 });
const PLATFORM = "p";

/** The `opId` field of an action's input, when it is an object (undefined otherwise). */
export function opOf(input: unknown): unknown {
  return input && typeof input === "object" && "opId" in input ? (input as { opId?: unknown }).opId : undefined;
}

/** Gives an operation id back after a failed first run (its bucket row goes, so the next send is a first run). */
async function release(ctx: PlatformCtx, opId: string): Promise<void> {
  const bucket: string = platformBucket("op", `${ctx.user.id}.${opId}`);
  await db
    .delete(rateLimits)
    .where(eq(rateLimits.bucket, bucket))
    .catch(() => undefined);
}

/** Runs `fn` once per (staff member, `opId`) for 10 minutes; a repeat answers the first result (see the header). */
export async function withOp<T>(ctx: PlatformCtx, opId: unknown, fn: () => Promise<T>): Promise<T> {
  if (opId === undefined || opId === null || opId === "") return fn();
  const parsed = OpId.safeParse(opId);
  if (!parsed.success) throw new FieldsError({ opId: "console.op.invalid" });
  const id = parsed.data;
  const key = `${ctx.user.id}:${id}`;
  const prior = replays.get(PLATFORM, key);
  if (prior) return prior.value as T;
  if (!(await firstRun(ctx, id))) {
    const settled = replays.get(PLATFORM, key);
    if (settled) return settled.value as T;
    throw new AuthRefusal("conflict", "console.op.duplicate");
  }
  try {
    const value = await fn();
    replays.set(PLATFORM, key, { value });
    return value;
  } catch (err) {
    await release(ctx, id);
    throw err;
  }
}

/** `refresh()` of the client router after a write (PD39); a no-op outside a server action (the QA scripts). */
export function refreshView(): void {
  try {
    refresh();
  } catch {
    // not inside a server action: nothing to refresh
  }
}

/** After a write: the router refresh; answers `value` unchanged. */
export function done<T>(value: T): T {
  refreshView();
  return value;
}

/** After a write on one store: its health row is marked dirty (the next run recomputes it), its strips dropped, the refresh. */
export async function doneStore<T>(storeId: string | null | undefined, value: T): Promise<T> {
  if (storeId) {
    await markHealthDirty(storeId);
    invalidateStrips(storeId);
  }
  return done(value);
}
