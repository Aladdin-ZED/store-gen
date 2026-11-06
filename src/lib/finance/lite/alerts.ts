/**
 * Profit lite alerts (P4 CALL CENTER; operations.md OPE-§16.2 "Alerts", §21.2 the profit alert line, OD50). Pure and
 * isomorphic: the job `fin.alerts` (src/lib/jobs/tracks/ops.ts → src/lib/finance/lite/alerts.server.ts) reads the
 * facts, this file decides which conditions hold and how the `profit_alerts` rows move.
 *
 *   cpa_over_breakeven  CPA_placed > 1.1 × BE_CPA_placed on each of the last 2 complete days, ≥ 20 placed orders in
 *                       those two days (store-level, key "")
 *   refusal_spike       refusal rate of the last 7 days > the 28-day rate + 10 points, ≥ 20 finals in the 7 days
 *                       (key "")
 *   city_refusal        a city's 28-day refusal rate > the store's + 15 points, ≥ 20 finals in that city (key = the
 *                       city slug); the evidence carries the city's return-reason counts only when reasons are coded
 *
 * Refusal rate = refused ÷ finals (delivered + refused + returned + lost) of the orders whose final move fell in the
 * window. Hysteresis: a condition fires once (one row, one notification per firing); the open row keeps the last time
 * the condition held (`evidence.seenAt`, epoch ms) and clears after 2 days without it. Points are compared in basis
 * points so 0.1 + 0.2 never decides.
 */

export const ALERT_KINDS = ["cpa_over_breakeven", "refusal_spike", "city_refusal"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_MIN_PLACED = 20;
export const ALERT_MIN_FINALS = 20;
export const CLEAR_AFTER_MS = 2 * 86_400_000;

export interface FinalTally {
  delivered: number;
  refused: number;
  returned: number;
  lost: number;
}
const finals = (t: FinalTally) => t.delivered + t.refused + t.returned + t.lost;
/** refused ÷ finals in basis points; null without finals */
const refusalBp = (t: FinalTally): number | null => (finals(t) > 0 ? Math.round((t.refused * 10_000) / finals(t)) : null);

export interface AlertFacts {
  /** the 28-day break-even per placed order in cents; null = not computable (missing inputs, n below 30) */
  beCpaPlacedCents: number | null;
  /** the last 2 complete store-local days, oldest first: placed orders and converted spend (null = no spend typed) */
  lastDays: readonly { day: string; placed: number; spendCents: number | null }[];
  store7: FinalTally;
  store28: FinalTally;
  /** per city slug, 28 days */
  cities28: readonly { cityKey: string; tally: FinalTally; reasons: readonly { reason: string | null; count: number }[] }[];
}

export interface AlertCondition {
  kind: AlertKind;
  key: string;
  /** the numbers the text quotes, with n (and the reason counts of a city) */
  evidence: Record<string, number>;
}

/** The conditions that hold now (see the header). */
export function alertConditions(f: AlertFacts): AlertCondition[] {
  const out: AlertCondition[] = [];
  // cpa_over_breakeven
  if (f.beCpaPlacedCents !== null && f.beCpaPlacedCents > 0 && f.lastDays.length >= 2) {
    const two = f.lastDays.slice(-2);
    const placed = two.reduce((s, d) => s + d.placed, 0);
    const cpas = two.map((d) => (d.spendCents !== null && d.placed > 0 ? d.spendCents / d.placed : null));
    // 1.1 × BE in integer arithmetic: cpa × 10 > be × 11
    const over = cpas.every((c) => c !== null && c * 10 > f.beCpaPlacedCents! * 11);
    if (placed >= ALERT_MIN_PLACED && over) {
      const last = cpas[1]!;
      out.push({ kind: "cpa_over_breakeven", key: "", evidence: { cpaCents: Math.round(last), beCpaCents: f.beCpaPlacedCents, n: placed } });
    }
  }
  // refusal_spike
  const r7 = refusalBp(f.store7);
  const r28 = refusalBp(f.store28);
  if (r7 !== null && r28 !== null && finals(f.store7) >= ALERT_MIN_FINALS && r7 > r28 + 1_000) {
    out.push({ kind: "refusal_spike", key: "", evidence: { rate7Bp: r7, rate28Bp: r28, n: finals(f.store7), refused: f.store7.refused } });
  }
  // city_refusal
  if (r28 !== null) {
    for (const c of f.cities28) {
      const rc = refusalBp(c.tally);
      if (!c.cityKey || c.cityKey === "*" || rc === null || finals(c.tally) < ALERT_MIN_FINALS || rc <= r28 + 1_500) continue;
      const evidence: Record<string, number> = { rateBp: rc, storeRateBp: r28, n: finals(c.tally), refused: c.tally.refused };
      const coded = c.reasons.filter((r) => r.reason && r.count > 0);
      if (coded.length) {
        let failed = 0;
        for (const r of c.reasons) failed += Math.max(0, r.count);
        evidence.failed = failed;
        for (const r of coded) evidence[`reason_${r.reason}`] = r.count;
      }
      out.push({ kind: "city_refusal", key: c.cityKey, evidence });
    }
  }
  return out;
}

/** An open `profit_alerts` row (cleared_at NULL). */
export interface OpenAlert {
  kind: string;
  key: string;
  firedAt: Date;
  evidence: Record<string, number>;
}

export interface AlertStep {
  /** new rows to insert and announce (one notification each) */
  fire: (AlertCondition & { firedAt: Date })[];
  /** open rows whose condition still holds: their evidence is refreshed (seenAt = now) */
  keep: (OpenAlert & { evidence: Record<string, number> })[];
  /** open rows to clear (2 days without the condition) */
  clear: OpenAlert[];
}

const idOf = (kind: string, key: string) => `${kind}\u0000${key}`;

/** One evaluation of the hysteresis (see the header); pure, `now` injected (the fake clock of test:profit). */
export function stepAlerts(open: readonly OpenAlert[], conditions: readonly AlertCondition[], now: Date): AlertStep {
  const holds = new Map(conditions.map((c) => [idOf(c.kind, c.key), c]));
  const openIds = new Set<string>();
  const out: AlertStep = { fire: [], keep: [], clear: [] };
  for (const o of open) {
    const id = idOf(o.kind, o.key);
    if (openIds.has(id)) continue;
    openIds.add(id);
    const c = holds.get(id);
    if (c) out.keep.push({ ...o, evidence: { ...c.evidence, seenAt: now.getTime() } });
    else {
      const seen = Number(o.evidence.seenAt ?? o.firedAt.getTime());
      if (now.getTime() - seen >= CLEAR_AFTER_MS) out.clear.push(o);
    }
  }
  for (const [id, c] of holds) if (!openIds.has(id)) out.fire.push({ ...c, evidence: { ...c.evidence, seenAt: now.getTime() }, firedAt: now });
  return out;
}

/** The notification's numbers of a firing (vars `{ alertKind, key?, value, threshold, n }`, ids and counts only). */
export function alertVars(c: AlertCondition): { alertKind: AlertKind; key?: string; value: number; threshold: number; n: number } {
  const e = c.evidence;
  const base = { alertKind: c.kind, ...(c.key ? { key: c.key } : {}), n: Math.max(0, Math.trunc(e.n ?? 0)) };
  if (c.kind === "cpa_over_breakeven") return { ...base, value: (e.cpaCents ?? 0) / 100, threshold: (e.beCpaCents ?? 0) / 100 };
  if (c.kind === "refusal_spike") return { ...base, value: (e.rate7Bp ?? 0) / 100, threshold: (e.rate28Bp ?? 0) / 100 };
  return { ...base, value: (e.rateBp ?? 0) / 100, threshold: (e.storeRateBp ?? 0) / 100 };
}
