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
 * Maintainer-owned shapes, frozen at C0a. The order-state types (snapshot, moves, actor, source) are P4's, frozen at
 * P0 in src/lib/orders/state.ts and transition.ts and re-exported here. Hooks get a `WriteScope` (D71): they write
 * (customer counters, outbox items, lead attribution), and every caller (createOrderRow, P4's transition and edit
 * paths) holds one.
 */
import type { db } from "@/lib/db/client";
import type { leads, orders } from "@/lib/db/schema";
import { leadCreatedWebhooks } from "@/lib/webhooks/lead";
import { logError } from "@/lib/orders/log";
import type { WriteScope } from "@/lib/tenancy/types";
import type { PurchaseConversion } from "./conversions-core";
import type { Move, OrderActor, OrderSnapshot, TransitionSource } from "./state";
import { hooks as aiHooks } from "./hooks/ai";
import { hooks as integrationsHooks } from "./hooks/integrations";
import { hooks as landingHooks } from "./hooks/landing";
import { hooks as logisticsHooks } from "./hooks/logistics";
import { hooks as moneyHooks } from "./hooks/money";
import { hooks as opsHooks } from "./hooks/ops";
import { hooks as storefrontHooks } from "./hooks/storefront";
import { hooks as webhooksHooks } from "./hooks/webhooks";

export type OrderRow = typeof orders.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
/** The handle of the order's transaction (inTx hooks write with it). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type { Move, OrderActor, OrderSnapshot, TransitionSource } from "./state";

export type OrderHookEvent =
  | { on: "created"; order: OrderRow; conversion: PurchaseConversion | null; target: { pageId: string; versionId: string | null; source: OrderRow["source"] } }
  | { on: "transition"; before: OrderSnapshot; after: OrderSnapshot; moves: Move[]; actor: OrderActor; source: TransitionSource }
  | { on: "edited"; before: OrderSnapshot; after: OrderSnapshot; fields: string[]; actor: OrderActor };

export interface OrderHook {
  name: string; // "<track>.<name>", e.g. "int.capi"
  phase: "inTx" | "afterCommit";
  on: OrderHookEvent["on"][];
  run(scope: WriteScope, e: OrderHookEvent, tx?: Tx): Promise<void>;
}

/**
 * Every contributed hook, in run order (written at P0; `scripts/qa/registries-check.ts` proves no file is left out):
 * operations first (OPE-§3.6: `ops.created` sets `customer_id` and `city_key`, which landing's attribution and
 * `zone_not_served` read), then landing, then integrations (the CAPI and Telegram outbox items, the Sheets push).
 * R2 (contract step C2-D): S4's logistics (assignment rules), S1's storefront (stock moves) and S3's money
 * (commissions) right after operations, so they read `customer_id` / `city_key`; S7's ai (version stats) after
 * integrations; S5's webhooks last, so an event reflects every other hook's write.
 */
export const ORDER_HOOKS: readonly OrderHook[] = [...opsHooks, ...logisticsHooks, ...storefrontHooks, ...moneyHooks, ...landingHooks, ...integrationsHooks, ...aiHooks, ...webhooksHooks];

/**
 * Runs the hooks registered for (`on`, `phase`) in order. An `inTx` failure is rethrown so the caller's transaction
 * rolls back; an `afterCommit` failure is logged and the next hook still runs.
 */
export async function runOrderHooks(on: OrderHookEvent["on"], phase: OrderHook["phase"], scope: WriteScope, event: OrderHookEvent, tx?: Tx): Promise<void> {
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

/**
 * The lead hook (OPE Q.18, core §K.4 R2 contract step C2-B2): runs right after a lead row is INSERTED (not on the
 * upsert's update of an existing lead), with the insert's transaction when it has one. A test lead (`is_test`, D54) runs
 * nothing. S5's `lead.created` webhooks join here (src/lib/webhooks/lead.ts). Never throws into the caller: a failure is
 * recorded under `orders:hook:lead.created`. The callers (the landing lead beacon, the WhatsApp order intent, S1's v3
 * leads) call it only while `releaseOn("R2")`.
 */
export async function onLeadCreated(scope: WriteScope, lead: LeadRow, tx?: Tx): Promise<void> {
  if (lead.isTest) return;
  try {
    await leadCreatedWebhooks(scope, lead, tx);
  } catch (err) {
    logError("orders:hook:lead.created", err);
  }
}
