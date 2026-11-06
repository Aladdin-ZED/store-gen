/**
 * Order hooks of the integrations track (P5 INTEGRATIONS, operations.md OPE-§3.6).
 * Extension file (docs/STORE-SAAS.md §K.3; operations.md OPE-§3.6), created empty at P0 and imported by
 * src/lib/orders/hooks.ts; the track fills it and never edits the registry.
 *
 * - `int.capi` (inTx; created, transition; OPE-§20.4): a confirmation or a delivery enqueues the order's server ad
 *   events (the trigger's Purchase, the Meta custom events) on the order's transaction handle, rebuilt from the sealed
 *   `capi_ctx`, and nulls the context once no later moment can send (src/lib/orders/conversions.ts
 *   `enqueueTransitionConversions`). On creation only a typed order (manual, WhatsApp) with `conversions.manualOrders`
 *   on sends here (`enqueueCreatedConversions`); a public order's creation events are the route's after() path. A test
 *   order returns at once (D54). A failure rolls the order's change back with no outbox row (OD6).
 * - `int.sheets` (afterCommit; transition, edited): the order's cells changed (P4's transition and edit set the
 *   `sheet_dirty` bits in the same UPDATE), so the store's push is scheduled (src/lib/sheets/push.ts, debounced 2 s per
 *   store, then after()). Never for a test order (D54: its `sheet_status` is `disabled` and the push's queries say
 *   `is_test = 0` as well). The creation path keeps its own after() push (src/lib/orders/http.ts).
 * - `int.telegram` (inTx; created, transition; OPE-§21.3): a new order's `new_order` item on the order's transaction,
 *   due at the end of the batch window, when the store's Telegram is on and `notifications.telegram.newOrders`; a test
 *   order only with `notifications.testOrders` (prefixed "[TEST]" at send, D54), a honeypot row never
 *   (src/lib/integrations/telegram/queue.ts `queueNewOrderTelegram`). A transition sends no message in R1; the event
 *   stays registered as OPE-§3.6 lists it.
 */
import { queueNewOrderTelegram } from "@/lib/integrations/telegram/queue";
import { enqueueCreatedConversions, enqueueTransitionConversions } from "@/lib/orders/conversions";
import { scheduleSheetPush } from "@/lib/sheets/push";
import type { OrderHook } from "../hooks";

export const capiHook: OrderHook = {
  name: "int.capi",
  phase: "inTx",
  on: ["created", "transition"],
  async run(scope, e, tx) {
    if (!tx) throw new Error("int.capi: an inTx hook needs the order's transaction");
    if (e.on === "created") {
      if (!e.order.isTest) await enqueueCreatedConversions(scope, e.order, tx);
      return;
    }
    if (e.on === "transition" && !e.after.isTest) await enqueueTransitionConversions(scope, e, tx);
  },
};

export const sheetsHook: OrderHook = {
  name: "int.sheets",
  phase: "afterCommit",
  on: ["transition", "edited"],
  async run(scope, e) {
    if (e.on === "created" || e.after.isTest) return;
    scheduleSheetPush(scope);
  },
};

export const telegramHook: OrderHook = {
  name: "int.telegram",
  phase: "inTx",
  on: ["created", "transition"],
  async run(scope, e, tx) {
    if (!tx) throw new Error("int.telegram: an inTx hook needs the order's transaction");
    if (e.on !== "created") return;
    await queueNewOrderTelegram(scope, e.order, tx);
  },
};

export const hooks: OrderHook[] = [capiHook, telegramHook, sheetsHook];
