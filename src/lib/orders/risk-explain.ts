/**
 * Risk explanation (P4 CALL CENTER; operations.md OPE-§10.2, OD39; OP-14). Pure and isomorphic: the queue card and
 * the drawer show why an order scored what it scored, from the closed flag list of src/lib/orders/risk.ts, in the
 * agent's language (`ops.risk.<flag>`, ar / fr / en). A score never blocks an order (risk.ts): "To check" (50-69) and
 * "High risk" (≥ 70) are advice. `{n}` comes only from this store's customer row, never from another store; with no
 * row the sentence is said without a number. The store's calibration line (`ops.risk.calibration`) is the
 * aggregates' (`riskBandOutcomes`), shown beside these reasons.
 */
import type { MessageKey, MessageVars } from "@/lib/i18n/admin";

/** the negative flags of `scoreRisk` (risk.ts), in its order; `test:ops` re-reads the list from risk.ts's source */
export const RISK_FLAGS = ["honeypot", "too_fast", "fast", "no_ua", "bot_ua", "captcha_missing", "captcha_unverified", "no_origin", "ip_repeat", "history_bad", "page_burst", "duplicate"] as const;
export type RiskFlag = (typeof RISK_FLAGS)[number];
/** the one positive flag: a customer with delivered orders */
export const POSITIVE_RISK_FLAG = "returning_customer";

/**
 * The points each flag adds in `scoreRisk` (risk.ts), the order the reasons are ranked in. `ip_repeat` (10-30) and
 * `history_bad` (15-45) vary with their count: `ip_repeat` ranks at its minimum, `history_bad` at 15 × n when the
 * store's customer row gives n.
 */
export const RISK_POINTS: Readonly<Record<RiskFlag, number>> = {
  honeypot: 100,
  too_fast: 35,
  fast: 10,
  no_ua: 20,
  bot_ua: 40,
  captcha_missing: 20,
  captcha_unverified: 10,
  no_origin: 15,
  ip_repeat: 10,
  history_bad: 15,
  page_burst: 30,
  duplicate: 40,
};

export type RiskLevel = "low" | "check" | "high";
/** a catalog key with its values, rendered with `t()` / `useT()` in the reader's language */
export interface MessageRef {
  key: MessageKey;
  vars?: MessageVars;
}
/** This store's customer row (OPE-§9.1): `bad` = fake + returned + cancelled, `delivered` = delivered. */
export interface CustomerHistory {
  bad: number;
  delivered: number;
}
export interface RiskReason {
  flag: RiskFlag;
  points: number;
  text: MessageRef;
}

/** The history the sentences may quote, from this store's `customers` row (null when the order has none). */
export function customerHistoryOf(row: { fakeCount: number; returnedCount: number; cancelledCount: number; deliveredCount: number } | null): CustomerHistory | null {
  return row ? { bad: row.fakeCount + row.returnedCount + row.cancelledCount, delivered: row.deliveredCount } : null;
}

/** < 50 low (no chip), 50-69 "To check", ≥ 70 "High risk" (the sheet's "[À vérifier]" starts at 50, risk.ts). */
export function riskLevel(score: number): RiskLevel {
  return score >= 70 ? "high" : score >= 50 ? "check" : "low";
}

const isFlag = (f: string): f is RiskFlag => (RISK_FLAGS as readonly string[]).includes(f);

function reasonText(flag: RiskFlag, history: CustomerHistory | null): MessageRef {
  if (flag === "history_bad") return history && history.bad > 0 ? { key: "ops.risk.history_bad", vars: { n: history.bad } } : { key: "ops.risk.history_bad_nocount" };
  return { key: `ops.risk.${flag}` };
}

/**
 * The level and the top three reasons by points (ties in risk.ts's order), plus the positive line for a returning
 * customer. Unknown flags are skipped (the list is closed; `test:ops` fails when risk.ts gains one without a text).
 */
export function explainRisk(score: number, flags: readonly string[], history: CustomerHistory | null): { level: RiskLevel; reasons: RiskReason[]; positive: MessageRef | null } {
  const seen = new Set<RiskFlag>();
  const reasons: RiskReason[] = [];
  for (const f of flags) {
    if (!isFlag(f) || seen.has(f)) continue;
    seen.add(f);
    const points = f === "history_bad" && history && history.bad > 0 ? Math.min(45, 15 * history.bad) : RISK_POINTS[f];
    reasons.push({ flag: f, points, text: reasonText(f, history) });
  }
  reasons.sort((a, b) => b.points - a.points || RISK_FLAGS.indexOf(a.flag) - RISK_FLAGS.indexOf(b.flag));
  const positive: MessageRef | null = flags.includes(POSITIVE_RISK_FLAG)
    ? history && history.delivered > 0
      ? { key: "ops.risk.returning_customer", vars: { n: history.delivered } }
      : { key: "ops.risk.returning_customer_nocount" }
    : null;
  return { level: riskLevel(score), reasons: reasons.slice(0, 3), positive };
}
