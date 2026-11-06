import "server-only";
/**
 * The console order lookup (platform.md PLA-§11.3, PD14; core D28): `/admin/orders`.
 *
 *   const card = await lookupOrderById(ctx, "CMD-7K3Q9X");     // every role: one masked card, or null
 *   const r = await lookupOrdersByPhone(ctx, "0612345678");     // orders.lookup (admin+): one row per store
 *
 * By id: the global primary key (order ids are global, D28), so the store comes from the row; the card carries the
 * store, the store-time creation, the states, the total and currency, the masked customer (`maskName`, `maskPhone`),
 * an items summary (product names and quantities only) and the page; never the address or the note. "Open in the
 * store profile" → `/admin/stores/<id>/orders?o=<orderId>`, where a reveal can happen (PLA-§7.4).
 *
 * By phone: `libphonenumber-js` to E.164 (default region MA), then `customers.phone` (`cu_phone_idx`) → per store the
 * orders count, the last order date, delivered / refused counts and the store's blocklist state for that phone. The
 * header shows the phone masked. Audit `platform.order.lookup { phoneHash: hmac(phone, "console-lookup"), stores }`
 * (never the raw phone); bucket `p:orders:lookup:<userId>` 30 an hour. Analysts have no phone field (no permission).
 */
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { and, eq, inArray } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { AuthRefusal, FieldsError } from "@/lib/auth/errors";
import { db } from "@/lib/db/client";
import { blocklist, customers, orders, pages, stores } from "@/lib/db/schema";
import { hmac } from "@/lib/security/crypto";
import { platformBucket, rateLimit } from "@/lib/security/rate-limit";
import { whereStore } from "@/lib/tenancy/sql";
import type { PlatformCtx, StoreScope } from "@/lib/tenancy/types";
import { maskName, maskPhone, type Masked } from "./mask";
import { ORDER_ID_RE } from "./profile/orders";
import { platformScope } from "./seam";

export const LOOKUPS_PER_HOUR = 30;
const PHONE_STORES_MAX = 200;

export interface OrderCard {
  id: string;
  store: { id: string; handle: string | null; name: string; timezone: string };
  createdAt: string;
  status: string;
  confirmState: string;
  totalCents: number;
  currency: string;
  customer: Masked;
  phone: Masked;
  city: string | null;
  /** product names and quantities, no customer text */
  items: { name: string; qty: number }[];
  page: { id: string; name: string } | null;
  /** "Store checkout" when the order has no landing page */
  storeCheckout: boolean;
  isTest: boolean;
  profileHref: string;
}

const itemsOf = (raw: unknown): { name: string; qty: number }[] =>
  Array.isArray(raw)
    ? raw
        .slice(0, 20)
        .map((i) => ({ name: typeof i?.name === "string" ? i.name.slice(0, 120) : "", qty: typeof i?.qty === "number" && Number.isFinite(i.qty) ? i.qty : 1 }))
        .filter((i) => i.name)
    : [];

/** The order's page (its name for the card), read through the order's own store. */
async function pageOf(scope: StoreScope, pageId: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db.select({ id: pages.id, name: pages.name }).from(pages).where(whereStore(pages, scope, eq(pages.id, pageId))).limit(1);
  return row ?? null;
}

/** By id (`console.read`, every role): one masked card, or null ("No order with this id"). */
export async function lookupOrderById(ctx: PlatformCtx, orderId: string): Promise<OrderCard | null> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  const id = orderId.trim().toUpperCase();
  if (!ORDER_ID_RE.test(id)) return null;
  // tenancy: platform order-lookup by the global primary key (D28, PLA-§11.3): one row, its customer fields masked before they leave
  const [row] = await db
    .select({
      id: orders.id,
      storeId: orders.storeId,
      pageId: orders.pageId,
      createdAt: orders.createdAt,
      status: orders.status,
      confirmState: orders.confirmState,
      total: orders.total,
      currency: orders.currency,
      name: orders.name,
      phone: orders.phone,
      city: orders.city,
      items: orders.items,
      isTest: orders.isTest,
      handle: stores.handle,
      storeName: stores.name,
      timezone: stores.timezone,
    })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) return null;
  const page = row.pageId ? await pageOf(platformScope(ctx, row.storeId), row.pageId) : null;
  return {
    id: row.id,
    store: { id: row.storeId, handle: row.handle, name: row.storeName, timezone: row.timezone },
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    confirmState: row.confirmState,
    totalCents: Math.round(Number(row.total) * 100),
    currency: row.currency,
    customer: maskName(row.name),
    phone: maskPhone(row.phone),
    city: row.city,
    items: itemsOf(row.items),
    page: page ? { id: page.id, name: page.name } : null,
    storeCheckout: !page,
    isTest: row.isTest,
    profileHref: `/admin/stores/${row.storeId}/orders?o=${encodeURIComponent(row.id)}`,
  };
}

/** A typed number → E.164 (default region MA), or null. */
export function toE164(input: string, region: "MA" = "MA"): string | null {
  const raw = input.trim();
  if (!raw || raw.length > 40) return null;
  const p = parsePhoneNumberFromString(raw, region);
  // a possible number is enough to look up (a customer typed it at checkout; the console never dials it)
  return p && (p.isValid() || p.isPossible()) ? p.number : null;
}

export interface PhoneLookup {
  /** the number, masked (the result header) */
  phone: Masked;
  stores: {
    store: { id: string; handle: string | null; name: string };
    orders: number;
    lastOrderAt: string | null;
    delivered: number;
    refused: number;
    blocked: boolean;
  }[];
}

/** By phone (`orders.lookup`): one audit row without the phone, 30 an hour per staff member. */
export async function lookupOrdersByPhone(ctx: PlatformCtx, input: string): Promise<PhoneLookup> {
  if (!ctx.can("orders.lookup")) throw new AuthRefusal("forbidden");
  const phone = toE164(typeof input === "string" ? input : "");
  if (!phone) throw new FieldsError({ phone: "console.lookup.phone_invalid" });
  if (!(await rateLimit(platformBucket("orders:lookup", ctx.user.id), LOOKUPS_PER_HOUR, 3_600)).ok) throw new AuthRefusal("rate_limited");
  // tenancy: platform order-lookup by phone across stores (PLA-§11.3, §M.4 cu_phone_idx exact match): counts and dates per store, never a name or an address
  const rows = await db
    .select({
      storeId: customers.storeId,
      orders: customers.ordersCount,
      lastOrderAt: customers.lastOrderAt,
      delivered: customers.deliveredCount,
      refused: customers.refusedCount,
      handle: stores.handle,
      name: stores.name,
    })
    .from(customers)
    .innerJoin(stores, eq(stores.id, customers.storeId))
    .where(eq(customers.phone, phone))
    .limit(PHONE_STORES_MAX);
  const ids = rows.map((r) => r.storeId);
  // tenancy: platform order-lookup: the same phone on those stores' blocklists (an existence test per store)
  const blocked = ids.length ? await db.select({ storeId: blocklist.storeId }).from(blocklist).where(and(inArray(blocklist.storeId, ids), eq(blocklist.kind, "phone"), eq(blocklist.value, phone))) : [];
  const blockedSet = new Set(blocked.map((b) => b.storeId));
  await auditFrom(ctx, "platform.order.lookup", { meta: { phoneHash: hmac(phone, "console-lookup"), stores: rows.length } });
  return {
    phone: maskPhone(phone),
    stores: rows
      .map((r) => ({
        store: { id: r.storeId, handle: r.handle, name: r.name },
        orders: r.orders,
        lastOrderAt: r.lastOrderAt?.toISOString() ?? null,
        delivered: r.delivered,
        refused: r.refused,
        blocked: blockedSet.has(r.storeId),
      }))
      .sort((a, b) => (a.lastOrderAt ?? "") < (b.lastOrderAt ?? "") ? 1 : -1),
  };
}
