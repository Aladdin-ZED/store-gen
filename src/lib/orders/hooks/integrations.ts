/**
 * Order hooks of the integrations track (P5 INTEGRATIONS, operations.md OPE-§3.6).
 * Extension file (docs/STORE-SAAS.md §K.3; operations.md OPE-§3.6), created empty at P0 and imported by
 * src/lib/orders/hooks.ts; the track fills it and never edits the registry.
 *
 * - `int.sheets` (afterCommit; transition, edited): the order's cells changed (P4's transition and edit set the
 *   `sheet_dirty` bits in the same UPDATE), so the store's push is scheduled (src/lib/sheets/push.ts, debounced 2 s per
 *   store, then after()). Never for a test order (D54: its `sheet_status` is `disabled` and the push's queries say
 *   `is_test = 0` as well). The creation path keeps its own after() push (src/lib/orders/http.ts).
 * `int.capi` and `int.telegram` (inTx) arrive with steps 6 and 7.
 */
import { scheduleSheetPush } from "@/lib/sheets/push";
import type { OrderHook } from "../hooks";

export const sheetsHook: OrderHook = {
  name: "int.sheets",
  phase: "afterCommit",
  on: ["transition", "edited"],
  async run(scope, e) {
    if (e.on === "created" || e.after.isTest) return;
    scheduleSheetPush(scope);
  },
};

export const hooks: OrderHook[] = [sheetsHook];
