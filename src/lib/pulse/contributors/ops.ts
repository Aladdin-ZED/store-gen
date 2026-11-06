/**
 * Pulse counters of the ops track (P4 CALL CENTER, operations.md OPE-§27.3, OD33).
 * Extension file (docs/STORE-SAAS.md §I.4, §K.3), created at P0 and imported by src/lib/pulse/registry.ts; the track
 * never edits the registry. The queue header reads `queueNow`, `dueCallbacks` and `newOrders` from here (one poller
 * per browser, OD33); `syncFailed` is P5's key (`./integrations.ts`), so it is not repeated here. The numbers are
 * `opsPulse` (src/lib/orders/queue.ts): the store parts cached 5 s per store, an agent's own callbacks read fresh.
 * A failure throws and the route omits these keys (core §I.4), never a made-up 0.
 */
import { opsPulse } from "@/lib/orders/queue";
import type { PulseContributor } from "../types";

export const contributor: PulseContributor = {
  id: "ops",
  contribute: async (scope, viewer) => {
    const p = await opsPulse(scope, viewer);
    return { newOrders: p.newOrders, dueCallbacks: p.dueCallbacks, queueNow: p.queueNow };
  },
};
