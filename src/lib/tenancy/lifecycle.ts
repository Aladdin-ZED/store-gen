import "server-only";
/**
 * Store lifecycle (docs/STORE-SAAS.md §A.5): the one writer of `stores.status`. `transitionStore` validates the edge
 * (§A.5.1, ALLOWED_TRANSITIONS), writes the row with a compare-and-set on the old status, audits, sends exactly one
 * notification of the edge's kind (§I.4), calls `invalidateStore(storeId)` and `markHealthDirty(storeId)`, releases
 * agent leases for restricted / suspended / closed, runs `ensureTemplateSet` for a store-mode go-live, and refunds the
 * shared `pending_media_bytes` on any transition out of `pending` (D69).
 *
 * Signature frozen at C0a; T1 implements the body (§K.1).
 */
import type { PlatformCtx, StoreCtx, StoreStatus, SystemCtx } from "./types";

export interface TransitionOpts {
  /** a status_reason code (≤ 40 chars) */
  reason: string;
  /** staff note (≤ 500 chars); shown to the store only with notify.showNote */
  note?: string;
  notify?: { showNote: boolean };
}

export async function transitionStore(ctx: PlatformCtx | StoreCtx | SystemCtx, storeId: string, to: StoreStatus, opts: TransitionOpts): Promise<void> {
  void ctx;
  void storeId;
  void to;
  void opts;
  throw new Error("not implemented: T1 (transitionStore)");
}
