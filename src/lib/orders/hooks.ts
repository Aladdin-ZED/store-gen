import "server-only";
/**
 * Order hooks (docs/STORE-SAAS.md §K.1, §K.3; operations.md OPE-§3.6, OPE Q.7): what runs when an order is created,
 * changes state or is edited, contributed by the track files `./hooks/<track>.ts` (CAPI and Telegram by P5, customer
 * counters and assignment by P4, lead attribution and `zone_not_served` by P3; R2: commissions, webhooks, stock).
 *
 *   inTx         inside the order's transaction, with its handle: a failure rolls the change back (`server`)
 *   afterCommit  after the commit: inside after() in a request, inline in jobs; a failure is only recorded
 *
 * Hooks never throw into the caller (failures go to the error log under `orders:hook:<name>`). createOrderRow (T3)
 * calls `runOrderHooks("created", "afterCommit", …)`; P4's transition and edit paths call the other events.
 *
 * Maintainer-owned shapes, frozen at C0a. The order-state types (snapshot, moves, actor, source) are P4's
 * (src/lib/orders/state.ts); they are declared here with the fields every hook may read until P4 replaces them
 * through the maintainer.
 */
import type { db } from "@/lib/db/client";
import type { orders } from "@/lib/db/schema";
import { logError } from "@/lib/orders/log";
import type { StoreScope } from "@/lib/tenancy/types";
import type { PurchaseConversion } from "./conversions-core";
import { hooks as integrationsHooks } from "./hooks/integrations";
import { hooks as landingHooks } from "./hooks/landing";
import { hooks as opsHooks } from "./hooks/ops";

export type OrderRow = typeof orders.$inferSelect;
/** The handle of the order's transaction (inTx hooks write with it). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An order as one state axis move saw it (P4: the axis columns and `rev`). */
export interface OrderSnapshot {
  id: string;
  status: string;
  isTest: boolean;
  [field: string]: unknown;
}
export interface Move {
  axis: string;
  from: string | null;
  to: string;
}
export type OrderActor = { kind: "user"; userId: string } | { kind: "system"; job: string } | { kind: "platform"; userId: string } | { kind: "public" };
export type TransitionSource = "ui" | "bulk" | "queue" | "sheets" | "carrier" | "job" | "api";

export type OrderHookEvent =
  | { on: "created"; order: OrderRow; conversion: PurchaseConversion | null; target: { pageId: string; versionId: string | null; source: OrderRow["source"] } }
  | { on: "transition"; before: OrderSnapshot; after: OrderSnapshot; moves: Move[]; actor: OrderActor; source: TransitionSource }
  | { on: "edited"; before: OrderSnapshot; after: OrderSnapshot; fields: string[]; actor: OrderActor };

export interface OrderHook {
  name: string; // "<track>.<name>", e.g. "int.capi"
  phase: "inTx" | "afterCommit";
  on: OrderHookEvent["on"][];
  run(scope: StoreScope, e: OrderHookEvent, tx?: Tx): Promise<void>;
}

/**
 * Every contributed hook, in run order (written at P0; `scripts/qa/registries-check.ts` proves no file is left out):
 * operations first (OPE-§3.6: `ops.created` sets `customer_id` and `city_key`, which landing's attribution and
 * `zone_not_served` read), then landing, then integrations (the CAPI and Telegram outbox items, the Sheets push).
 */
export const ORDER_HOOKS: readonly OrderHook[] = [...opsHooks, ...landingHooks, ...integrationsHooks];

/**
 * Runs the hooks registered for (`on`, `phase`) in order. An `inTx` failure is rethrown so the caller's transaction
 * rolls back; an `afterCommit` failure is logged and the next hook still runs.
 */
export async function runOrderHooks(on: OrderHookEvent["on"], phase: OrderHook["phase"], scope: StoreScope, event: OrderHookEvent, tx?: Tx): Promise<void> {
  if (event.on !== on) throw new Error(`orders: hook event "${event.on}" run as "${on}"`);
  for (const hook of ORDER_HOOKS) {
    if (hook.phase !== phase || !hook.on.includes(on)) continue;
    try {
      await hook.run(scope, event, phase === "inTx" ? tx : undefined);
    } catch (err) {
      logError(`orders:hook:${hook.name}`, err);
      if (phase === "inTx") throw err;
    }
  }
}
