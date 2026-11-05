import "server-only";
/**
 * "Mark cash received" (P4 CALL CENTER; operations.md OD52, OPS-6, §M.3 `markCashReceivedAction`): for mixed setups
 * (a statement carrier that pays some parcels by hand, an owner who collected the cash himself), money `collected →
 * remitted` through the one writer, class M (`finance.write`), source `bulk`, event meta `settlement: "manual"`.
 * ≤ 200 distinct ids per call, each answered on its own (another store's id or a missing one: not_found; an order
 * whose money is not `collected`: the writer's `illegal`); the `bulk` bucket (30 / 10 min) is charged by the action.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { actorFrom, transitionOrder, type TransitionError } from "@/lib/orders/transition";
import { whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

export const CASH_BULK_MAX = 200;
const ORDER_ID = /^[A-Z0-9]{2,8}-[A-Z0-9]{4,12}$/;

export interface CashResult {
  ok: string[];
  failed: { id: string; error: TransitionError | "not_found" }[];
}

/** finance.write: collected → remitted for each id (see the header). */
export async function markCashReceived(ctx: WriteCtx, ids: readonly string[]): Promise<ActionResult<CashResult>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  if (!Array.isArray(ids)) return { ok: false, error: "invalid" };
  const list = [...new Set(ids.map((x) => String(x).trim().toUpperCase()))];
  if (!list.length || list.length > CASH_BULK_MAX) return { ok: false, error: "invalid" };
  const valid = list.filter((id) => ORDER_ID.test(id));
  const revs = new Map(
    (valid.length ? await db.select({ id: orders.id, rev: orders.rev }).from(orders).where(whereStore(orders, ctx.scope, inArray(orders.id, valid))) : []).map((r) => [r.id, r.rev]),
  );
  const actor = actorFrom(ctx);
  const out: CashResult = { ok: [], failed: [] };
  for (const id of list) {
    const rev = revs.get(id);
    if (rev === undefined) {
      out.failed.push({ id, error: "not_found" });
      continue;
    }
    const res = await transitionOrder(actor, ctx.scope, { orderId: id, want: { money: "remitted" }, source: "bulk", expectRev: rev });
    if (res.ok) out.ok.push(id);
    else out.failed.push({ id, error: res.error });
  }
  return { ok: true, data: out };
}
