/**
 * The guard's number rule, as the numbers audit wraps it (P3 LANDING; landing.md LAN-§6.4 rule 5): "the gate reuses
 * the guard's number rule rather than re-implementing it". The rule lives in P7's src/lib/ai/guard.ts
 * (`allowedNumbers(ctx)`, lines 52-66), which does not export it today; CCR docs/saas/ccr/r1-p3-1.md asks P7 to export
 * `allowedNumbers` and `numbersIn` unchanged. Until it lands, this adapter is a line-for-line copy of those two
 * private functions (the merchant facts, the product name, the price and the delivery text, each numeral kept as
 * written and as a plain number), and test:honesty checks it against `cleanAiText`, the guard's exported entry point,
 * so the two can never drift. At the merge it becomes `export { allowedNumbers as guardAllowedNumbers } from
 * "@/lib/ai/guard"`.
 */
import type { GuardContext } from "@/lib/ai/guard";

const ASCII_DIGITS = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** guard.ts `numbersIn` */
export function guardNumbersIn(s: string): string[] {
  return ASCII_DIGITS(s).match(/\d+(?:[.,]\d+)?/g)?.map((n) => n.replace(",", ".")) ?? [];
}

/** guard.ts `allowedNumbers`: the numbers the copy may mention (facts, name, price, delivery line). */
export function guardAllowedNumbers(ctx: GuardContext): Set<string> {
  const out = new Set<string>();
  const add = (s: string | number | null | undefined) => {
    if (s === null || s === undefined) return;
    for (const n of guardNumbersIn(String(s))) {
      out.add(n);
      out.add(String(Number(n)));
    }
  };
  for (const f of ctx.facts) add(f);
  add(ctx.productName);
  add(ctx.price);
  add(ctx.deliveryText);
  return out;
}
