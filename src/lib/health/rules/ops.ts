/**
 * Store Health rules of the ops track (P4 CALL CENTER, operations.md OPE-§27.2; core D53, §I.7, SF-03, PL-18).
 * Extension file (docs/STORE-SAAS.md §I.7, §K.3), imported by src/lib/health/registry.ts; the track fills it (sentences
 * `health.ops.<rule>.text` / `.fix` in its own i18n file, D67) and never edits the registry.
 *
 * Every rule is a pure function of `OpsHealthFacts` (src/lib/callcenter/health.server.ts: counts and `Kpi`s of the
 * store, never a customer field): `collect` reads `inputs.ops` when P1's inputs carry it (CCR r1-p4-7), else loads the
 * facts once per store (cached 60 s, the ten rules share the pass), ≤ 40 ms warm, read-only, scoped. A rule is silent
 * below its minimum n and when the facts are unavailable. The R2 rules (`ops:reveals`, `ops:cash_held`) come with
 * their steps. The Profit lite rules (`fin:*`, flag `finance_lite`, silent when it is off) read `FinHealthFacts`
 * (src/lib/finance/lite/health.server.ts) the same way: `inputs.fin` when given, else one cached read.
 *
 *   ops:first_touch            2  first-touch p50 (28 d) above the store's target, n ≥ 30          /team/callcenter
 *   ops:untouched              3  ≥ 1 order older than 2 h of window time without an attempt        /queue/board
 *   ops:no_agent               3  callable orders waiting > 30 window minutes, no live agent        /team/agents
 *   ops:unreachable_rise       2  unreachable 7 d > 28 d + 10 points, n ≥ 30 both                   /team/callcenter
 *   ops:abandoned              1  abandoned claims (7 d) > 15 % of claims, n ≥ 20                   /queue/board
 *   ops:callbacks_overdue      2  ≥ 3 callbacks overdue by > 60 min                                 /queue/board
 *   ops:to_pack_aging          2  ≥ 3 confirmed to pack, no hold, > 48 h of window time             /orders?view=to-pack
 *   ops:hold_passed            2  ≥ 1 hold whose date passed > 48 h ago, still to pack              /orders?view=to-pack
 *   ops:delivery_rescue        2  ≥ 3 in the delivery lane > 4 window hours without a rescue call   /queue/board
 *   ops:sheet_agents_unmapped  1  ≥ 1 sheet label with ≥ 20 confirmations (28 d), no member         /integrations/sheets#agents
 *   fin:costs_missing          1  ≥ 1 SKU of a live page with orders (28 d) without a cost           /finance?tab=costs
 *   fin:settlement_check       1  ≥ 20 delivered orders and "Who holds the cash?" never answered     /finance?tab=costs#carrier
 *   fin:fee_gap                1  a top-5 city charges ≥ 10 units below the carrier rate (n ≥ 10)   /finance?tab=costs#carrier
 *   fin:ad_rate_missing        1  ≥ 1 foreign-currency ad-spend day without a rate (14 d)           /finance?tab=ads
 */
import type { OpsHealthFacts } from "@/lib/callcenter/health.server";
import type { FinHealthFacts } from "@/lib/finance/lite/health.server";
import type { Kpi } from "@/lib/orders/profile";
import type { StoreScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import type { HealthEvidence, HealthInputs, HealthIssue, HealthRule, HealthRuleFixture } from "../types";

type Severity = 1 | 2 | 3;
const POINTS: Record<Severity, 3 | 6 | 10> = { 1: 3, 2: 6, 3: 10 };

/** HealthInputs once CCR r1-p4-7 lands: the ops (and Profit lite) facts beside P1's fields */
type WithOps = HealthInputs & { ops?: OpsHealthFacts | null; fin?: FinHealthFacts | null };

/** The facts of this store: P1's inputs when they carry them, else one cached read; null = unavailable (silent). */
async function factsOf(scope: StoreScope, inputs: HealthInputs): Promise<OpsHealthFacts | null> {
  const given = (inputs as WithOps).ops;
  if (given !== undefined) return given;
  try {
    const { opsHealthFacts } = await import("@/lib/callcenter/health.server");
    return await opsHealthFacts(scope);
  } catch {
    return null;
  }
}

/** The Profit lite facts: given, else one cached read; null = unavailable; `on: false` = the flag is off (silent). */
async function finFactsOf(scope: StoreScope, inputs: HealthInputs): Promise<FinHealthFacts | null> {
  const given = (inputs as WithOps).fin;
  if (given !== undefined) return given;
  try {
    const { finHealthFacts } = await import("@/lib/finance/lite/health.server");
    return await finHealthFacts(scope);
  } catch {
    return null;
  }
}

const valueOf = (k: Kpi): number | null => ("insufficient" in k ? null : k.value);

function issue(rule: string, severity: Severity, evidence: HealthEvidence, path: `/${string}`, prefix: "ops" | "fin" = "ops"): HealthIssue {
  return {
    id: `${prefix}:${rule}`,
    group: "operations",
    severity,
    points: POINTS[severity],
    evidence,
    fix: { kind: "link", href: (handle) => appHref(handle, path), label: prefix === "ops" ? `health.ops.${rule}.fix` : `health.ops.fin_${rule}.fix` },
    text: prefix === "ops" ? `health.ops.${rule}.text` : `health.ops.fin_${rule}.text`,
  };
}

/** One rule: its id, release and minimum n, and the pure check over the facts. */
function rule(id: string, minN: number | undefined, check: (f: OpsHealthFacts) => HealthIssue | null): HealthRule {
  return {
    id: `ops:${id}`,
    group: "operations",
    ...(minN === undefined ? {} : { minN }),
    release: "R1",
    collect: async (scope, inputs) => {
      const f = await factsOf(scope, inputs);
      return f ? check(f) : null;
    },
  };
}

/** One Profit lite rule: silent when the flag is off or the facts are unavailable. */
function finRule(id: string, minN: number | undefined, check: (f: FinHealthFacts) => HealthIssue | null): HealthRule {
  return {
    id: `fin:${id}`,
    group: "operations",
    ...(minN === undefined ? {} : { minN }),
    release: "R1",
    collect: async (scope, inputs) => {
      const f = await finFactsOf(scope, inputs);
      return f && f.on ? check(f) : null;
    },
  };
}

export const rules: HealthRule[] = [
  rule("first_touch", 30, (f) => {
    const p50 = valueOf(f.firstTouchP50Min28d);
    if (p50 === null || f.firstTouchP50Min28d.n < 30 || p50 <= f.firstTouchTargetMin) return null;
    return issue("first_touch", 2, { metric: "first_touch_p50_min", value: p50, baseline: f.firstTouchTargetMin, window: "28d", n: f.firstTouchP50Min28d.n }, "/team/callcenter");
  }),
  rule("untouched", undefined, (f) =>
    f.untouched2h >= 1 ? issue("untouched", 3, { metric: "untouched_2h", value: f.untouched2h, window: "now", n: f.untouched2h }, "/queue/board") : null,
  ),
  rule("no_agent", undefined, (f) =>
    f.liveAgents === 0 && f.callableNow > 0 && (f.oldestCallableWindowMin ?? 0) > 30
      ? issue("no_agent", 3, { metric: "callable_wait_min", value: f.oldestCallableWindowMin ?? 0, baseline: 30, window: "now", n: f.callableNow }, "/team/agents")
      : null,
  ),
  rule("unreachable_rise", 30, (f) => {
    const r7 = valueOf(f.unreachableRate7d);
    const r28 = valueOf(f.unreachableRate28d);
    if (r7 === null || r28 === null || f.unreachableRate7d.n < 30 || f.unreachableRate28d.n < 30) return null;
    // ten points, in basis points so 0.1 + 0.2 never decides
    if (Math.round(r7 * 10_000) <= Math.round(r28 * 10_000) + 1_000) return null;
    return issue("unreachable_rise", 2, { metric: "unreachable_rate_pct", value: Math.round(r7 * 1000) / 10, baseline: Math.round(r28 * 1000) / 10, window: "7d", n: f.unreachableRate7d.n }, "/team/callcenter");
  }),
  rule("abandoned", 20, (f) => {
    if (f.claims7d < 20 || f.abandoned7d * 100 <= f.claims7d * 15) return null;
    return issue("abandoned", 1, { metric: "abandoned_claims_pct", value: Math.round((f.abandoned7d * 1000) / f.claims7d) / 10, baseline: 15, window: "7d", n: f.claims7d }, "/queue/board");
  }),
  rule("callbacks_overdue", undefined, (f) =>
    f.callbacksOverdue60 >= 3 ? issue("callbacks_overdue", 2, { metric: "callbacks_overdue_60", value: f.callbacksOverdue60, baseline: 3, window: "now", n: f.callbacksOverdue60 }, "/queue/board") : null,
  ),
  rule("to_pack_aging", undefined, (f) =>
    f.toPackAging48h >= 3 ? issue("to_pack_aging", 2, { metric: "to_pack_48h", value: f.toPackAging48h, baseline: 3, window: "now", n: f.toPackAging48h }, "/orders?view=to-pack") : null,
  ),
  rule("hold_passed", undefined, (f) =>
    f.holdPassed48h >= 1 ? issue("hold_passed", 2, { metric: "hold_passed_48h", value: f.holdPassed48h, window: "now", n: f.holdPassed48h }, "/orders?view=to-pack") : null,
  ),
  rule("delivery_rescue", undefined, (f) =>
    f.rescueWaiting4h >= 3 ? issue("delivery_rescue", 2, { metric: "rescue_waiting_4h", value: f.rescueWaiting4h, baseline: 3, window: "now", n: f.rescueWaiting4h }, "/queue/board") : null,
  ),
  // the 20 confirmations are per label, inside the fact (unmappedLabels20); `n` counts labels, so no engine minN (P4 merge)
  rule("sheet_agents_unmapped", undefined, (f) =>
    f.unmappedLabels20 >= 1 ? issue("sheet_agents_unmapped", 1, { metric: "sheet_labels_unmapped", value: f.unmappedLabels20, window: "28d", n: f.unmappedLabels20 }, "/integrations/sheets#agents") : null,
  ),
  finRule("costs_missing", undefined, (f) =>
    f.uncostedSkus >= 1 ? issue("costs_missing", 1, { metric: "skus_without_cost", value: f.uncostedSkus, window: "28d", n: f.uncostedSkus }, "/finance?tab=costs", "fin") : null,
  ),
  finRule("settlement_check", 20, (f) =>
    f.delivered >= 20 && !f.settlementConfirmed
      ? issue("settlement_check", 1, { metric: "delivered_unconfirmed_settlement", value: f.delivered, baseline: 20, window: "all", n: f.delivered }, "/finance?tab=costs#carrier", "fin")
      : null,
  ),
  finRule("fee_gap", undefined, (f) =>
    f.feeGaps >= 1 ? issue("fee_gap", 1, { metric: "fee_gap_cities", value: f.feeGaps, baseline: Math.round(f.worstGapCents) / 100, window: "28d", n: f.feeGaps }, "/finance?tab=costs#carrier", "fin") : null,
  ),
  finRule("ad_rate_missing", undefined, (f) =>
    f.adRateMissingDays >= 1 ? issue("ad_rate_missing", 1, { metric: "ad_days_without_rate", value: f.adRateMissingDays, window: "14d", n: f.adRateMissingDays }, "/finance?tab=ads", "fin") : null,
  ),
];

/* ------------------------------------------------------------------ */
/* fixtures (`test:health`, `test:ops`): one per rule                  */
/* ------------------------------------------------------------------ */

const kpi = (value: number, n: number, min = 30): Kpi => (n < min ? { n, min, insufficient: true } : { value, n, min });

/** A quiet store: every rule silent. */
export const QUIET_FACTS: OpsHealthFacts = {
  firstTouchTargetMin: 15,
  firstTouchP50Min28d: kpi(9, 120),
  untouched2h: 0,
  liveAgents: 2,
  callableNow: 4,
  oldestCallableWindowMin: 12,
  unreachableRate7d: kpi(0.12, 80),
  unreachableRate28d: kpi(0.1, 300),
  claims7d: 140,
  abandoned7d: 6,
  callbacksOverdue60: 0,
  toPackAging48h: 1,
  holdPassed48h: 0,
  rescueWaiting4h: 0,
  unmappedLabels20: 0,
};

/** A quiet Profit lite: every fin rule silent. */
export const QUIET_FIN: FinHealthFacts = { on: true, uncostedSkus: 0, delivered: 0, settlementConfirmed: true, feeGaps: 0, worstGapCents: 0, adRateMissingDays: 0 };

/** P1's base inputs with the ops facts beside them (the CCR r1-p4-7 field). */
export function withOps(patch: Partial<OpsHealthFacts>): Partial<HealthInputs> {
  const out: Partial<HealthInputs> = {};
  Object.assign(out, { ops: { ...QUIET_FACTS, ...patch }, fin: QUIET_FIN });
  return out;
}

/** The Profit lite facts beside P1's base inputs (quiet ops facts too). */
export function withFin(patch: Partial<FinHealthFacts>): Partial<HealthInputs> {
  const out: Partial<HealthInputs> = {};
  Object.assign(out, { ops: QUIET_FACTS, fin: { ...QUIET_FIN, ...patch } });
  return out;
}

export const fixtures: HealthRuleFixture[] = [
  { rule: "ops:first_touch", fires: withOps({ firstTouchP50Min28d: kpi(42, 64) }), silent: withOps({ firstTouchP50Min28d: kpi(42, 12) }), expect: { severity: 2, metric: "first_touch_p50_min" } },
  { rule: "ops:untouched", fires: withOps({ untouched2h: 2 }), silent: withOps({ untouched2h: 0 }), expect: { severity: 3, metric: "untouched_2h" } },
  { rule: "ops:no_agent", fires: withOps({ liveAgents: 0, callableNow: 7, oldestCallableWindowMin: 55 }), silent: withOps({ liveAgents: 0, callableNow: 7, oldestCallableWindowMin: 20 }), expect: { severity: 3, metric: "callable_wait_min" } },
  {
    rule: "ops:unreachable_rise",
    fires: withOps({ unreachableRate7d: kpi(0.31, 60), unreachableRate28d: kpi(0.14, 240) }),
    silent: withOps({ unreachableRate7d: kpi(0.31, 18), unreachableRate28d: kpi(0.14, 240) }),
    expect: { severity: 2, metric: "unreachable_rate_pct" },
  },
  { rule: "ops:abandoned", fires: withOps({ claims7d: 60, abandoned7d: 14 }), silent: withOps({ claims7d: 12, abandoned7d: 6 }), expect: { severity: 1, metric: "abandoned_claims_pct" } },
  { rule: "ops:callbacks_overdue", fires: withOps({ callbacksOverdue60: 4 }), silent: withOps({ callbacksOverdue60: 2 }), expect: { severity: 2, metric: "callbacks_overdue_60" } },
  { rule: "ops:to_pack_aging", fires: withOps({ toPackAging48h: 5 }), silent: withOps({ toPackAging48h: 2 }), expect: { severity: 2, metric: "to_pack_48h" } },
  { rule: "ops:hold_passed", fires: withOps({ holdPassed48h: 1 }), silent: withOps({ holdPassed48h: 0 }), expect: { severity: 2, metric: "hold_passed_48h" } },
  { rule: "ops:delivery_rescue", fires: withOps({ rescueWaiting4h: 3 }), silent: withOps({ rescueWaiting4h: 2 }), expect: { severity: 2, metric: "rescue_waiting_4h" } },
  { rule: "ops:sheet_agents_unmapped", fires: withOps({ unmappedLabels20: 2 }), silent: withOps({ unmappedLabels20: 0 }), expect: { severity: 1, metric: "sheet_labels_unmapped" } },
  { rule: "fin:costs_missing", fires: withFin({ uncostedSkus: 2 }), silent: withFin({ uncostedSkus: 2, on: false }), expect: { severity: 1, metric: "skus_without_cost" } },
  { rule: "fin:settlement_check", fires: withFin({ delivered: 20, settlementConfirmed: false }), silent: withFin({ delivered: 19, settlementConfirmed: false }), expect: { severity: 1, metric: "delivered_unconfirmed_settlement" } },
  { rule: "fin:fee_gap", fires: withFin({ feeGaps: 1, worstGapCents: 1_500 }), silent: withFin({ feeGaps: 0 }), expect: { severity: 1, metric: "fee_gap_cities" } },
  { rule: "fin:ad_rate_missing", fires: withFin({ adRateMissingDays: 3 }), silent: withFin({ adRateMissingDays: 0 }), expect: { severity: 1, metric: "ad_days_without_rate" } },
];
