import "server-only";
/**
 * An agent's earnings statement (operations.md OPE-§15.5, OP-15; R2, S3 MONEY). The contract step (C2-C) froze the
 * reader P4's `/queue/me` renders through S3's `<EarningsStatement data={…} />` (mounted by the maintainer when the
 * `commissions` entitlement is on): the agent's own `agent_earnings` rows of one period ("YYYY-MM", the store
 * timezone), integer minor units. An agent reads only their own statement. null = no commission rule applies to the
 * agent (nothing is rendered). Contract body until S3 merges: null. No R1 path calls it.
 */
import type { agentEarnings } from "@/lib/db/schema";
import type { StoreScope } from "@/lib/tenancy/types";

type EarningRow = typeof agentEarnings.$inferSelect;

export interface EarningsStatementData {
  userId: string;
  /** "YYYY-MM" */
  period: string;
  currency: string;
  totals: { pendingCents: number; earnedCents: number; paidCents: number; voidCents: number };
  entries: { id: string; at: string; orderId: string | null; entry: EarningRow["entry"]; amountCents: number; state: EarningRow["state"] }[];
}

/** The statement of one agent for a period (default: the current one). S3 (contract body: null). */
export async function earningsStatement(scope: StoreScope, userId: string, opts?: { period?: string }): Promise<EarningsStatementData | null> {
  void scope;
  void userId;
  void opts;
  return null;
}
