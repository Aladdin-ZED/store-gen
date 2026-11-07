"use client";
/**
 * The merge dialog of two duplicate orders (operations.md OPE-§9.4, OP-06 merge; R2, S4 LOGISTICS takes over
 * `src/components/admin/orders/manual/**`). The R2 contract step (C2-E) froze its props and mounted the "Merge…" entry
 * in P4's order drawer duplicate banner (src/components/admin/orders/order-drawer.tsx) for `orders.edit` +
 * `orders.assign` holders, from the drawer's R2 block (absent while `releaseOn("R2")` is false). S4's body previews the
 * merged lines (the v3 shape, OPE-§9.4), confirms, and calls its merge action; `onDone` re-reads the drawer. Stub until
 * S4 merges: renders nothing (`null`).
 */
import type { ReactElement } from "react";

export interface MergeDialogProps {
  /** the order the drawer shows (kept) */
  keepId: string;
  /** its suspected duplicate (merged into keepId) */
  dupId: string;
  onDone: () => void;
}

/** S4 (stub: renders nothing). */
export function MergeDialog(props: MergeDialogProps): ReactElement | null {
  void props;
  return null;
}
