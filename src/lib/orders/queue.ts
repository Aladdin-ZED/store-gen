import "server-only";
/**
 * The claim queue (P4 CALL CENTER; operations.md OPE-§5.2, §27.3, §27.5; docs/STORE-SAAS.md §K.2 P0). Frozen at P0:
 * the pulse counters both operations contributors read (`src/lib/pulse/contributors/{ops,integrations}.ts`, P4 and P5)
 * and the lease release the store lifecycle calls (`transitionStore` on restricted, suspended and closed, core §A.5.1).
 * P4 adds `nextOrder`, `releaseOrder` and `renewLease` here.
 */
import type { PulseContributor } from "@/lib/pulse/types";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

/** OPE-§27.3 (OD33, core §I.4 `StorePulse.counts`): ≤ 50 ms; store parts cached 5 s per store, the per-user part fresh. */
export interface OpsPulse {
  /** since the viewer's last pulse cursor */
  newOrders: number;
  /** agents: theirs; managers: all */
  dueCallbacks: number;
  queueNow: number;
  /** sheet_status = failed + dead outbox items (P5's contributor reports it) */
  syncFailed: number;
}

/** The one function both operations pulse contributors call (the P0 stub name of core §K.2). */
export async function opsPulse(scope: StoreScope, viewer: Parameters<PulseContributor["contribute"]>[1]): Promise<OpsPulse> {
  void scope;
  void viewer;
  throw new Error("not implemented: P4 opsPulse");
}

/**
 * Every lease of the store, released: `claim_token` and `lease_until` cleared, one `released` event (why
 * "store_state", actor system) per order. Agents of a restricted store re-claim on their next `N` (OPE-§27.5).
 */
export async function releaseAllLeases(scope: WriteScope): Promise<{ released: number }> {
  void scope;
  throw new Error("not implemented: P4 releaseAllLeases");
}
