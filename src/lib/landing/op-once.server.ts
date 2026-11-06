import "server-only";
/**
 * Idempotency keys of the landing settings writes (P3 LANDING; docs/STORE-SAAS.md §I.8 rule 2, LAN-§7.3, §8.4, §3.3):
 * every optimistic write of the delivery, "After the order" and policies screens carries an `opId` the browser draws
 * once per intent, so a retried POST (a flaky network, a double tap, the undo racing the write) answers the first
 * result instead of writing twice.
 *
 *   return storeAction("checkout.write", (ctx) => onceForStore(ctx.scope, opId, () => …))
 *
 * Results live in `scopedCache("landing-ops")` under (storeId, opId) for 10 minutes, so an op id of one store can
 * never answer another store's request; a write that throws is not remembered (the retry runs it again). The writes
 * themselves are replace-or-merge of the store's own rows, so a replay after the entry expired writes the same values.
 */
import { z } from "zod";
import { scopedCache } from "@/lib/tenancy/cache";
import type { StoreScope } from "@/lib/tenancy/types";

/** an op id as the browser draws it (`crypto.randomUUID()` or a ULID) */
export const OpId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, { error: "Invalid operation id." });

const ops = scopedCache<unknown>({ name: "landing-ops", maxEntries: 5_000, ttlMs: 10 * 60_000 });

export async function onceForStore<T>(scope: StoreScope, opId: string, run: () => Promise<T>): Promise<T> {
  const key = OpId.parse(opId);
  const done = ops.get(scope.storeId, key);
  if (done !== undefined) return done as T;
  const value = await run();
  ops.set(scope.storeId, key, value === undefined ? null : value);
  return value;
}
