/**
 * Integer cents at the operations boundary (P4 CALL CENTER; operations.md OD35, core D41). Pure and isomorphic.
 * `orders` keeps its money columns as `decimal(12,2)` (mysql2 hands them over as strings); operations code converts
 * them once, here, and computes in integer cents from then on. src/lib/markets/money.ts formats and never converts.
 * S3 takes this file over with the rest of src/lib/finance/** in R2.
 */

/**
 * "249.90" → 24990, 249.9 → 24990, "-0.005" → -1. Half-up (away from zero) on the third decimal. A string is read
 * digit by digit, so "0.29" never becomes 28.999…; a number goes through its shortest decimal text. NaN, ±Infinity,
 * an empty or malformed string → 0 (a money column is never any of these).
 */
export function toCents(decimal: string | number): number {
  const text = typeof decimal === "number" ? (Number.isFinite(decimal) ? decimalText(decimal) : "") : decimal.trim();
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const whole = Number(m[2] || "0");
  const frac = (m[3] ?? "").padEnd(3, "0");
  const cents = whole * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return cents === 0 ? 0 : sign * cents;
}

/** A finite number as plain decimal text (no exponent): 1e-7 → "0.0000001". */
function decimalText(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}
