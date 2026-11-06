"use server";
/**
 * `/app/<h>/finance` server actions (P4 CALL CENTER; operations.md OPE-§16.2, §M.3 finance rows, OD25, OD52, OD56,
 * OPS-24; core D63, §A.3.2 `finance.*` R1 for owner and admin). Every body is `return storeAction(…)` with
 * `finance.write`; each refuses `feature_off` while the `finance_lite` flag is off, writes through the Profit lite
 * repositories (src/lib/finance/lite/**) and re-renders the finance screen. Settings writes are audited
 * `finance.settings.updated`.
 *
 *   saveItemCostAction       a cost of an item of a live page, optionally per option codes (`product_costs` row)
 *   saveSkuCostAction        a store-wide cost of a warehouse code (OPS-24)
 *   saveCarrierRateAction    one city's "my carrier" row (or `*`): delivery, return, COD fee bp / min / flat
 *   saveAdSpendCellAction    one cell of the 14-day grid, in the platform account's currency
 *   savePackagingAction      accounting.packagingCents (null = not set)
 *   saveSettlementAction     accounting.myCarrier: who holds the cash after delivery, confirmed now (OD52)
 *   saveAdAccountAction      accounting.adAccounts[platform].currency (OD56)
 *   saveAdRateAction         one dated rate of accounting.adRates, or its removal (OD56)
 *   markCashReceivedAction   money collected → remitted on ≤ 200 orders (class M, meta settlement manual); bucket bulk
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { saveCarrierRate } from "@/lib/finance/lite/carrier.server";
import { saveItemCost, saveSkuCost } from "@/lib/finance/lite/costs.server";
import { financeLiteOn } from "@/lib/finance/lite/flag.server";
import { saveAdAccount, saveAdRate, savePackaging, saveSettlement } from "@/lib/finance/lite/settings.server";
import { markCashReceived } from "@/lib/finance/lite/settlement.server";
import { saveAdSpendCell } from "@/lib/finance/lite/spend.server";
import { BULK_RATE } from "@/lib/orders/admin";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

const refresh = (handle: string) => revalidateStore(handle, "/finance");

/** The flag first, then the write; a successful write re-renders /finance. */
async function gated<T>(ctx: WriteCtx, run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  if (!(await financeLiteOn(ctx.scope))) return { ok: false, error: "feature_off" };
  const res = await run();
  if (res.ok) refresh(ctx.store.handle);
  return res;
}

/** finance.write: an item's unit cost on one live page (per option codes when given). */
export async function saveItemCostAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => saveItemCost(ctx, input)));
}

/** finance.write: the cost of a warehouse code, inherited by every item carrying it. */
export async function saveSkuCostAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => saveSkuCost(ctx, input)));
}

/** finance.write: the default (`*`) or one city's "my carrier" fees. */
export async function saveCarrierRateAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => saveCarrierRate(ctx, input)));
}

/** finance.write: one ad-spend cell (platform × day). */
export async function saveAdSpendCellAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => saveAdSpendCell(ctx, input)));
}

/** finance.write: the packaging cost per order. */
export async function savePackagingAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => savePackaging(ctx, input)));
}

/** finance.write: "Who holds the cash after delivery?" (at_delivery or statement). */
export async function saveSettlementAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => saveSettlement(ctx, input)));
}

/** finance.write: the billing currency of one ad platform. */
export async function saveAdAccountAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => saveAdAccount(ctx, input)));
}

/** finance.write: add, replace or remove a dated rate ("1 USD = 9.85 MAD from 1 Oct"). */
export async function saveAdRateAction(input: unknown) {
  return storeAction("finance.write", (ctx) => gated(ctx, () => saveAdRate(ctx, input)));
}

/** finance.write: "Mark cash received" on the selection (≤ 200 ids), bucket `bulk` 30 / 10 min. */
export async function markCashReceivedAction(ids: string[]) {
  return storeAction(
    "finance.write",
    async (ctx) => {
      const res = await markCashReceived(ctx, ids);
      if (res.ok) revalidateStore(ctx.store.handle, "/finance", "/orders");
      return res;
    },
    { rate: { name: "bulk", ...BULK_RATE } },
  );
}
