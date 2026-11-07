import "server-only";
/**
 * Commission replay (operations.md OPE-§15.3, OP-15; R2, S3 MONEY). The contract step (C2-C) froze `replayCommissionsFor` for
 * P4's label backfill (`backfillMappedLabel`, src/lib/callcenter/labels.ts, wired by the maintainer after the
 * transaction that returns the touched order ids): re-derive the `agent_earnings` entries of those orders from their
 * events; idempotent (`ae_uq`), a no-op without the `commissions` entitlement. Contract body until S3 merges: a no-op
 * answering 0 (no commission rule can exist before S3). No R1 path calls it.
 */
import type { WriteScope } from "@/lib/tenancy/types";

/** Replay the commissions of these orders (≤ 500 ids). S3 (contract body: no-op). */
export async function replayCommissionsFor(scope: WriteScope, orderIds: readonly string[]): Promise<{ replayed: number }> {
  void scope;
  void orderIds;
  return { replayed: 0 };
}
