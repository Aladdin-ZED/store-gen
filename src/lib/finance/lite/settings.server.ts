import "server-only";
/**
 * The `accounting` setting writes of Profit lite (P4 CALL CENTER; operations.md OPE-§2.9 accounting, §16.2, §M.3
 * finance rows, OD52, OD56; core §F.5 Q.27m). Each one writes the `accounting` key and nothing else after
 * `finance.write`, marks Store Health dirty (the `fin:*` rules read these fields) and audits
 * `finance.settings.updated` with the field names (the settings layer adds its own `store.settings.updated`).
 * Values are the owner's: a cleared packaging cost goes back to NULL, never to 0; no rate is ever fetched.
 *
 *   savePackaging    `packagingCents` (integer cents or null = not set)
 *   saveSettlement   `myCarrier = { settlement, confirmedAt: now }`: the answer to "Who holds the cash after delivery?"
 *   saveAdAccount    `adAccounts[platform].currency` (null = back to the store currency)
 *   saveAdRate       add or replace one dated rate `{ currency, fromDay, rateMilli }` (≤ 120, one per currency and
 *                    day), or remove it (`rateMilli: null`)
 */
import { z } from "zod";
import { settingsActor } from "@/lib/admin-data/store-audit";
import { auditFrom } from "@/lib/audit";
import { opsNow } from "@/lib/callcenter/presence";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { getStoreSetting, updateStoreSetting } from "@/lib/settings";
import type { ActionResult, WriteCtx } from "@/lib/tenancy/types";

type AccountingPatch = Parameters<typeof updateStoreSetting<"accounting">>[2];

async function writeAccounting(ctx: WriteCtx, patch: AccountingPatch, fields: string[]): Promise<void> {
  await updateStoreSetting(ctx.scope, "accounting", patch, settingsActor(ctx.actor));
  await markHealthDirty(ctx.store.id);
  await auditFrom(ctx, "finance.settings.updated", { target: "accounting", meta: { fields } });
}

const PackagingInput = z.strictObject({ packagingCents: z.number().int().min(0).max(10_000_000).nullable() });

/** finance.write: the packaging cost per order (null = not set). */
export async function savePackaging(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ packagingCents: number | null }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = PackagingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await writeAccounting(ctx, { packagingCents: parsed.data.packagingCents }, ["packagingCents"]);
  return { ok: true, data: parsed.data };
}

const SettlementInput = z.strictObject({ settlement: z.enum(["at_delivery", "statement"]) });

/** finance.write: who holds the cash of "my carrier" after delivery, confirmed now (OD52). */
export async function saveSettlement(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ settlement: "at_delivery" | "statement"; confirmedAt: string }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = SettlementInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const confirmedAt = opsNow().toISOString();
  await writeAccounting(ctx, { myCarrier: { settlement: parsed.data.settlement, confirmedAt } }, ["myCarrier"]);
  return { ok: true, data: { settlement: parsed.data.settlement, confirmedAt } };
}

const PLATFORMS = ["meta", "tiktok", "snap", "google", "other"] as const;
export type AdPlatform = (typeof PLATFORMS)[number];
export const AD_PLATFORMS: readonly AdPlatform[] = PLATFORMS;
const Currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const AdAccountInput = z.strictObject({ platform: z.enum(PLATFORMS), currency: Currency.nullable() });

/** finance.write: the billing currency of one ad platform's account (null or the store currency = the store currency). */
export async function saveAdAccount(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ platform: AdPlatform; currency: string }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = AdAccountInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { platform, currency } = parsed.data;
  const storeCurrency = (ctx.store.currency || "MAD").toUpperCase();
  await writeAccounting(
    ctx,
    (cur) => {
      const next = { ...cur.adAccounts };
      if (currency === null || currency === storeCurrency) delete next[platform];
      else next[platform] = { currency };
      return { adAccounts: next };
    },
    ["adAccounts"],
  );
  return { ok: true, data: { platform, currency: currency ?? storeCurrency } };
}

const AdRateInput = z.strictObject({
  currency: Currency,
  fromDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 1 unit = rateMilli / 1000 store units; null removes the rate of that day */
  rateMilli: z.number().int().min(1).max(100_000_000).nullable(),
});

/** finance.write: add, replace or remove one dated rate (≤ 120, one per currency and day). */
export async function saveAdRate(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ rates: number }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = AdRateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { currency, fromDay, rateMilli } = parsed.data;
  if ((ctx.store.currency || "MAD").toUpperCase() === currency) return { ok: false, error: "invalid" };
  const cur = await getStoreSetting(ctx.scope, "accounting", { fresh: true });
  const rest = cur.adRates.filter((r) => !(r.currency === currency && r.fromDay === fromDay));
  const next = rateMilli === null ? rest : [...rest, { currency, fromDay, rateMilli }];
  if (next.length > 120) return { ok: false, error: "invalid" };
  next.sort((a, b) => a.currency.localeCompare(b.currency) || a.fromDay.localeCompare(b.fromDay));
  await writeAccounting(ctx, { adRates: next }, ["adRates"]);
  return { ok: true, data: { rates: next.length } };
}
