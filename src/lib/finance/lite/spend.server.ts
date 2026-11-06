import "server-only";
/**
 * Manual ad spend of Profit lite (P4 CALL CENTER; operations.md OPE-§16.2 "Ad spend", §2.7 `ad_spend_daily`, OD56,
 * AC-03 R1): one cell per (platform, store-local day), `source = 'manual'`, `account_id = ''`, `campaign_id = ''`,
 * typed and stored in the platform account's currency (`accounting.adAccounts`, absent = the store currency). Every
 * figure converts it with the owner's dated rate (./ad-rates.ts); a cell without a rate for its day is shown
 * "needs a rate" and excluded from the CPA with a visible count.
 *
 *   saveAdSpendCell(ctx, …)   upsert one cell (null or 0 removes it); days from 120 days ago to today
 *   adSpendGrid(scope, 14)    the grid: days × platforms, typed amount, currency, converted cents or "needs a rate",
 *                             the converted total per day and the count of days not counted
 *   spendBetween(scope, …)    the converted Σ of a day range with its missing rates (the CPA's spend)
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { auditFrom } from "@/lib/audit";
import { storeTz } from "@/lib/callcenter/insights-sql";
import { opsNow } from "@/lib/callcenter/presence";
import { addDaysYmd, storeYmd } from "@/lib/callcenter/window";
import { db } from "@/lib/db/client";
import { adSpendDaily } from "@/lib/db/schema";
import { getStoreSetting } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { ActionResult, StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { convertSpend, spendStoreCents, type ConvertedSpend, type SpendRow } from "./ad-rates";
import { AD_PLATFORMS, type AdPlatform } from "./settings.server";

export const SPEND_BACK_DAYS = 120;

/** The store currency (one currency per store, OPE-§16.1). */
export async function storeCurrencyOf(scope: StoreScope): Promise<string> {
  return ((await getStoreById(scope.storeId))?.currency || "MAD").toUpperCase();
}
const SPEND_MAX_CENTS = 1_000_000_000;

/** The manual rows of a day range (inclusive), oldest first. */
async function spendRows(scope: StoreScope, fromYmd: string, toYmd: string): Promise<(SpendRow & { platform: AdPlatform })[]> {
  const rows = await db
    .select({ day: adSpendDaily.day, platform: adSpendDaily.platform, spendCents: adSpendDaily.spendCents, currency: adSpendDaily.currency })
    .from(adSpendDaily)
    .where(whereStore(adSpendDaily, scope, gte(adSpendDaily.day, fromYmd), lte(adSpendDaily.day, toYmd)))
    .limit(5_000);
  return rows.map((r) => ({ ...r, day: String(r.day).slice(0, 10) })).sort((a, b) => a.day.localeCompare(b.day));
}

/** The converted spend of fromYmd..toYmd (store cents after the owner's rates) with what could not be converted. */
export async function spendBetween(scope: StoreScope, fromYmd: string, toYmd: string): Promise<ConvertedSpend & { typed: number }> {
  const [rows, accounting, currency] = await Promise.all([spendRows(scope, fromYmd, toYmd), getStoreSetting(scope, "accounting"), storeCurrencyOf(scope)]);
  const typed = rows.filter((r) => r.spendCents !== 0).length;
  return { ...convertSpend(rows, accounting.adRates, currency), typed };
}

/** Per day: the converted Σ (null when nothing was typed that day), and whether a cell lacked a rate. */
export async function spendByDay(scope: StoreScope, fromYmd: string, toYmd: string): Promise<Map<string, { cents: number | null; missing: number }>> {
  const [rows, accounting, currency] = await Promise.all([spendRows(scope, fromYmd, toYmd), getStoreSetting(scope, "accounting"), storeCurrencyOf(scope)]);
  const out = new Map<string, { cents: number | null; missing: number }>();
  for (const r of rows) {
    if (r.spendCents === 0) continue;
    const cur = out.get(r.day) ?? { cents: null, missing: 0 };
    const c = spendStoreCents(r.spendCents, r.currency, r.day, accounting.adRates, currency);
    if (c === null) cur.missing++;
    else cur.cents = (cur.cents ?? 0) + c;
    out.set(r.day, cur);
  }
  return out;
}

export interface SpendCell {
  platform: AdPlatform;
  /** typed amount in the account currency; null = empty */
  spendCents: number | null;
  currency: string;
  /** converted to the store currency; null = empty or needs a rate */
  storeCents: number | null;
  needsRate: boolean;
}

export interface SpendGrid {
  storeCurrency: string;
  /** per platform: the account currency ("Billed in USD") */
  accounts: Record<AdPlatform, string>;
  days: { day: string; cells: SpendCell[]; totalStoreCents: number; needsRate: number }[];
  /** days with at least one cell without a rate ("3 days not counted") */
  daysNotCounted: number;
  rates: { currency: string; fromDay: string; rateMilli: number }[];
}

/** The last `days` store-local days (today first) × the five platforms. */
export async function adSpendGrid(scope: StoreScope, days = 14): Promise<SpendGrid> {
  const n = Math.max(1, Math.min(31, Math.floor(days)));
  const [storeCurrency, tz] = await Promise.all([storeCurrencyOf(scope), storeTz(scope)]);
  const today = storeYmd(opsNow(), tz);
  const from = addDaysYmd(today, -(n - 1));
  const [rows, accounting] = await Promise.all([spendRows(scope, from, today), getStoreSetting(scope, "accounting")]);
  const accounts = Object.fromEntries(AD_PLATFORMS.map((p) => [p, accounting.adAccounts[p]?.currency ?? storeCurrency])) as Record<AdPlatform, string>;
  const byCell = new Map(rows.map((r) => [`${r.day}:${r.platform}`, r]));
  const out: SpendGrid["days"] = [];
  for (let i = 0; i < n; i++) {
    const day = addDaysYmd(today, -i);
    let total = 0;
    let needs = 0;
    const cells = AD_PLATFORMS.map((platform): SpendCell => {
      const r = byCell.get(`${day}:${platform}`);
      const currency = r?.currency ?? accounts[platform];
      if (!r || r.spendCents === 0) return { platform, spendCents: null, currency, storeCents: null, needsRate: false };
      const c = spendStoreCents(r.spendCents, r.currency, day, accounting.adRates, storeCurrency);
      if (c === null) needs++;
      else total += c;
      return { platform, spendCents: r.spendCents, currency, storeCents: c, needsRate: c === null };
    });
    out.push({ day, cells, totalStoreCents: total, needsRate: needs });
  }
  return { storeCurrency, accounts, days: out, daysNotCounted: out.filter((d) => d.needsRate > 0).length, rates: accounting.adRates };
}

export const AdSpendCellInput = z.strictObject({
  platform: z.enum(AD_PLATFORMS as unknown as [AdPlatform, ...AdPlatform[]]),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** in the account currency; null or 0 clears the cell */
  spendCents: z.number().int().min(0).max(SPEND_MAX_CENTS).nullable(),
});

/** finance.write: one cell of the grid (the account currency is the platform's, read now). */
export async function saveAdSpendCell(ctx: WriteCtx, input: unknown): Promise<ActionResult<{ day: string; platform: AdPlatform; currency: string; storeCents: number | null }>> {
  if (!ctx.can("finance.write")) return { ok: false, error: "forbidden" };
  const parsed = AdSpendCellInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { platform, day, spendCents } = parsed.data;
  const today = storeYmd(opsNow(), await storeTz(ctx.scope));
  if (day > today || day < addDaysYmd(today, -SPEND_BACK_DAYS)) return { ok: false, error: "invalid" };
  const accounting = await getStoreSetting(ctx.scope, "accounting");
  const storeCurrency = (ctx.store.currency || "MAD").toUpperCase();
  const currency = accounting.adAccounts[platform]?.currency ?? storeCurrency;
  const key = and(eq(adSpendDaily.platform, platform), eq(adSpendDaily.accountId, ""), eq(adSpendDaily.campaignId, ""), eq(adSpendDaily.day, day));
  if (spendCents === null || spendCents === 0) {
    await db.delete(adSpendDaily).where(whereStore(adSpendDaily, ctx.scope, key));
  } else {
    const set = { spendCents, currency, source: "manual" as const, updatedBy: ctx.user.id, updatedAt: opsNow() };
    await db
      .insert(adSpendDaily)
      .values(storeValues(ctx.scope, { platform, accountId: "", campaignId: "", day, campaignName: null, importRunId: null, ...set }))
      .onDuplicateKeyUpdate({ set });
  }
  await auditFrom(ctx, "finance.ad_spend.saved", { target: `${platform}:${day}`, meta: { platform, day, spendCents: spendCents ?? 0, currency } });
  const storeCents = spendCents ? spendStoreCents(spendCents, currency, day, accounting.adRates, storeCurrency) : null;
  return { ok: true, data: { day, platform, currency, storeCents } };
}
