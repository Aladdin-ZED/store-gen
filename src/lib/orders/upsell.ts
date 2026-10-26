import "server-only";
/**
 * One-click post-purchase upsell from the thank-you page. The token returned with the order is
 * single-use (its hash is cleared atomically), valid for max(30, offer window) minutes (+2 min grace),
 * and the upsell price always comes from the version the order was placed on.
 *
 * A catalog-item upsell (`upsell.item`, docs/OFFERS.md §G.3–G.4) records the item, its own unit (name,
 * short, sku: the Sheets Variante / SKU / Articles cells) and, when the item has options, that they are
 * still to be confirmed by phone: "… + [UPSELL] 1 × Sérum (options à confirmer)".
 *
 * In the order's store (docs/STORE-SAAS.md §E.3, ORD-17): the public resolver `resolveUpsellOrder` finds the
 * order's store from its id, and every read and write here is that store's; the network budget is the store's
 * (`s:<sid>:upsell:ip:<hash>`, 20 per 10 min). A test order (D54) takes its upsell like any order but, like the
 * order itself, never reaches the stats or the sheet.
 */
import { timingSafeEqual } from "node:crypto";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { orders, type OrderItems, type OrderUnit } from "@/lib/db/schema";
import { itemById, itemName, itemShort } from "@/lib/page/catalog";
import { round2 } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { hashIp } from "@/lib/security/crypto";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { bumpOrderStats } from "@/lib/stats";
import { byId } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { upsellTokenHash } from "./create";
import { logError } from "./log";
import { versionDoc } from "./resolve";

export type UpsellResponse =
  | { ok: true; orderId: string; total: number; currency: string }
  | { ok: false; error: "invalid" | "expired" | "rate_limited" };

const GRACE_MS = 2 * 60_000;
const CLOSED: ReadonlySet<string> = new Set(["cancelled", "fake", "returned"]);

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export interface UpsellResult {
  response: UpsellResponse;
  /** re-queue the sheet row update after responding */
  sync: boolean;
  retryAfter?: number;
}

/** The upsell of `input.orderId`, an order of the scope's store (the public scope of `resolveUpsellOrder`). */
export async function acceptUpsell(scope: WriteScope, input: { orderId: string; token: string }, ctx: { ip: string }): Promise<UpsellResult> {
  const gate = await rateLimit(storeBucket(scope, "upsell:ip", hashIp(ctx.ip)), 20, 600);
  if (!gate.ok) return { response: { ok: false, error: "rate_limited" }, sync: false, retryAfter: gate.retryAfter };

  const [order] = await db.select().from(orders).where(byId(orders, scope, input.orderId)).limit(1);
  const hash = upsellTokenHash(input.token);
  if (!order?.upsellTokenHash || !sameHash(order.upsellTokenHash, hash) || order.items.upsell) {
    return { response: { ok: false, error: "invalid" }, sync: false };
  }
  // the call center already closed this order (cancelled / fake): nothing to add to
  if (CLOSED.has(order.status)) return { response: { ok: false, error: "expired" }, sync: false };
  const doc = order.versionId ? await versionDoc(scope, order.versionId) : null;
  const offer = doc?.offers.upsell;
  if (!doc || !offer?.enabled) return { response: { ok: false, error: "invalid" }, sync: false };

  const windowMs = Math.max(30, offer.windowMinutes) * 60_000 + GRACE_MS;
  if (Date.now() - order.createdAt.getTime() > windowMs) return { response: { ok: false, error: "expired" }, sync: false };

  const price = round2(offer.price);
  const items: OrderItems = { ...order.items, upsell: upsellRecord(doc, offer, price) };
  const res = await db
    .update(orders)
    .set({
      items,
      subtotal: sql`${orders.subtotal} + ${price}`,
      total: sql`${orders.total} + ${price}`,
      upsellTokenHash: null,
      sheetStatus: sql`IF(${orders.sheetStatus} = 'disabled', 'disabled', 'pending')`,
      updatedAt: new Date(),
    })
    .where(and(byId(orders, scope, order.id), eq(orders.upsellTokenHash, hash), notInArray(orders.status, [...CLOSED])));
  const head = (Array.isArray(res) ? res[0] : res) as { affectedRows?: number };
  if (head?.affectedRows !== 1) return { response: { ok: false, error: "invalid" }, sync: false }; // lost a race

  // honeypot rows (sheet disabled) and test orders (D54) stay out of the stats and the sheet
  const quiet = order.sheetStatus === "disabled" || order.isTest;
  if (!quiet) {
    await bumpOrderStats(scope, order.pageId, order.createdAt, { revenue: price }).catch((err) => logError("orders:upsell-stats", err));
  }
  return {
    response: { ok: true, orderId: order.id, total: round2(Number(order.total) + price), currency: order.currency },
    sync: !quiet,
  };
}

/**
 * The stored upsell: title and price, plus for a catalog item its id, "options à confirmer" when it has
 * option groups, and its unit (no options chosen: the call center confirms them). The unit rides in
 * the JSON next to the typed fields (OrderItems.upsell.unit, requested from C0): readers that don't
 * know it ignore it.
 */
export function upsellRecord(doc: Pick<PageDoc, "items" | "product">, offer: { title: string; item?: string }, price: number): NonNullable<OrderItems["upsell"]> {
  const item = offer.item ? itemById(doc, offer.item) : undefined;
  if (!item) return { title: offer.title, price };
  const unit: OrderUnit = {
    item: item.id,
    label: itemName(doc, item),
    short: itemShort(doc, item),
    ...(item.sku ? { sku: item.sku } : {}),
    options: [],
  };
  const record: NonNullable<OrderItems["upsell"]> & { unit: OrderUnit } = {
    title: offer.title,
    price,
    item: item.id,
    ...(item.groups.length ? { confirmOptions: true as const } : {}),
    unit,
  };
  return record;
}
