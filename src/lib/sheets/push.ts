import "server-only";
/**
 * The Sheets push trigger (P5 INTEGRATIONS; operations.md OPE-§19.5, §3.6 hook `int.sheets`; docs/STORE-SAAS.md §K.2 P0,
 * OPE Q.8). `scheduleSheetPush(scope)` is debounced 2 s per store, then `after(() => pushStore(scope, { maxCalls: 2 }))`;
 * the cron's `sheets.push` slot drains the rest. A test order never schedules a push (its `sheet_status` is `disabled`).
 * Typed stub frozen at P0 with a `WriteScope` (D71: the push writes `sheet_status`); P5 adds `pushStore` here.
 */
import type { WriteScope } from "@/lib/tenancy/types";

export function scheduleSheetPush(scope: WriteScope): void {
  void scope;
  throw new Error("not implemented: P5 scheduleSheetPush");
}
