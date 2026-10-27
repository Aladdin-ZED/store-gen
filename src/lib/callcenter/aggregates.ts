import "server-only";
/**
 * Deterministic aggregates for insights and learners (P4 CALL CENTER; operations.md OPE-§27.6, OD43, OD44;
 * docs/STORE-SAAS.md §K.2 P0, rev 2.1): the Today brief (P2) and the Campaign Kit by-angle table (P3) read them, the
 * R3 digest and best-time learner too. Store-local days, cells under 5 orders suppressed, test and honeypot orders
 * excluded, no customer field in any cell; city keys are `CityKey` slugs and an order without one counts under "*".
 *
 * P0 stubs: the documented defaults, empty cells with `suppressed: 0` and no attempt rows (nothing is computed, so
 * nothing is shown). P4 adds `cancelReasonMix`, `returnReasonMix` and `riskBandOutcomes` here.
 */
import type { Kpi } from "@/lib/orders/profile";
import type { StoreScope } from "@/lib/tenancy/types";

/** YYYY-MM-DD, store-local */
export type ISODate = string;
export type AggDim = "page" | "city" | "source" | "agent" | "offer" | "campaign" /* utm_campaign */ | "angle" /* utm_content */ | "carrier" /* R2 */ | "hour" | "weekday";
export const AGG_DIMS: readonly AggDim[] = ["page", "city", "source", "agent", "offer", "campaign", "angle", "carrier", "hour", "weekday"];

export interface AggCell {
  key: string;
  placed: number;
  confirmed: number;
  delivered: number;
  refused: number;
  cancelled: number;
  unreachable: number;
  fake: number;
  n: number;
  confirmationRate: Kpi;
  deliveryRate: Kpi;
  delta?: { prevPlaced: number; prevDeliveryRate: Kpi };
}

/** One grouped query per dimension; cached 5 min per (store, query hash); ≤ 400 ms on 50,000 orders. */
export async function opsAggregates(
  scope: StoreScope,
  q: { from: ISODate; to: ISODate; dims: AggDim[]; compareWith?: "previous" },
): Promise<{ cells: Record<AggDim, AggCell[]>; suppressed: number /* cells under 5 orders */; computedAt: string }> {
  void scope;
  void q;
  const cells = Object.fromEntries(AGG_DIMS.map((d) => [d, [] as AggCell[]])) as Record<AggDim, AggCell[]>;
  return { cells, suppressed: 0, computedAt: new Date().toISOString() };
}

/** OD44: raw counts per (weekday, hour), contacted = outcome ∉ {no_answer, busy, switched_off}; every UI applies n ≥ 30. */
export async function attemptStats(scope: StoreScope, q?: { days?: 90 }): Promise<{ weekday: number; hour: number; attempts: number; contacted: number }[]> {
  void scope;
  void q;
  return [];
}
