import "server-only";
/**
 * createOrder — the public order pipeline, inside the store of the resolved page key (docs/STORE-SAAS.md §E.2,
 * §E.3, §E.8; ORD-01 … ORD-07, ORD-21):
 *
 *   resolved target (store, public scope, published doc) → idempotent replay (in the store) → the version the
 *   shopper saw (orderVersion: ≤ 72 h after it was replaced) → validate (prices recomputed in cents from that
 *   version; "stale" when the page the shopper saw is gone and the order no longer matches) → Turnstile (the
 *   store's keys) → per-IP limit (per store) → store flood breaker → blocklist (the store's) → duplicate (same
 *   phone + page, 12 h) → per-phone limit (the store's orders) → per-page burst signal → risk score (the store's
 *   history) → createOrderRow → lead converted + stats → { ok, orderId, upsellToken, total, currency }
 *
 * Nothing a stranger can do may stop real customers from ordering, so no shared counter refuses an
 * order: the per-phone limit counts the phone's STORED orders (honeypot rows and orders the call center
 * cancelled or marked fake don't count), and the per-page burst only raises the risk score. The one
 * exception is the store flood breaker (`s:<sid>:orders`, 600 per 10 min, far above any real COD volume):
 * it protects the shared database from one store's flood, and only stored-order attempts count.
 * Honeypot hits get a success-looking answer (bots learn nothing) and touch no shared quota; they are
 * stored flagged and never sent to the sheet.
 * The "duplicate" answer is only given to the network that placed the earlier order (the customer
 * re-submitting): anyone else gets the normal flow with the new order flagged, so the API never tells
 * a stranger that a phone number ordered. It still runs after the per-IP limit.
 * Every read is the store's: one store's blocklist, order history or limits never decide another store's order
 * (ORD-03 … ORD-05); a shared fraud network would be an explicit opt-in, not a side effect.
 *
 * Test orders (D54; `ctx.test` = resolveTestToken(store, ?sg-test)): stored `is_test` with the flag "test" and
 * `sheet_status = 'disabled'`, risk-scored and queued like any order, but no server-side Purchase, no
 * bumpOrderStats, no Sheets push; the duplicate guard and the per-phone limit count test orders among test
 * orders only, and the risk history reads real orders only, so testing never blocks or taints a customer.
 * Sheet sync is the caller's job (after() in the route handler) when `sync` is true, and so are the
 * server-side Purchase events (`conversion`, see ./conversions).
 *
 * One order insert (D72): `createOrderRow(draft, ctx)` below is the only insert of an order row in the codebase
 * (this pipeline, P4's manual orders, the R2 v3 paths).
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { newOrderId } from "@/lib/db/ids";
import { blocklist, leads, orders } from "@/lib/db/schema";
import { hashIp, sign } from "@/lib/security/crypto";
import { rateLimit, type RateResult } from "@/lib/security/rate-limit";
import { leadItem } from "@/lib/page/catalog";
import { fromCents, offerMath } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { bumpOrderStats } from "@/lib/stats";
import type { PublicPageTarget } from "@/lib/tenancy/public";
import { byId, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";
import type { OrderPayload, OrderResponse } from "./contract";
import { purchaseConversion, type PurchaseConversion } from "./conversions";
import { ORDER_HOOKS, runOrderHooks, type OrderHookEvent, type OrderRow, type Tx } from "./hooks";
import { logError } from "./log";
import { orderVersion, type PageTarget } from "./resolve";
import { scoreRisk } from "./risk";
import { checkCaptcha, type TurnstileKeys } from "./turnstile";
import { validateOrder } from "./validate";

/* ------------------------------------------------------------------ */
/* Rate buckets of the public write path (§E.8)                        */
/* ------------------------------------------------------------------ */

/**
 * `s:<storeId>:<name>:<key>` and `p:<name>:<key>`, the §E.8 shapes (keys are hashes, never raw IPs). C0b's
 * `storeBucket` / `platformBucket` build the same strings; these become calls to them when the branded
 * `Bucket` type lands, with no bucket renamed.
 */
export const storeBucketKey = (scope: StoreScope, name: string, key?: string) => `s:${scope.storeId}:${name}${key ? `:${key}` : ""}`.slice(0, 191);
export const platformBucketKey = (name: string, key?: string) => `p:${name}${key ? `:${key}` : ""}`.slice(0, 191);

/** stored-order attempts per store per 10 min above which the store answers 429 (ORD-21, §E.8) */
export const STORE_FLOOD_LIMIT = 600;

/* ------------------------------------------------------------------ */
/* The one order insert (D72)                                          */
/* ------------------------------------------------------------------ */

/** The order's own columns; the id, the store, the test flag, the upsell hash and the timestamps are createOrderRow's. */
export type OrderDraft = Omit<typeof orders.$inferInsert, "id" | "storeId" | "isTest" | "upsellTokenHash" | "createdAt" | "updatedAt">;

export interface CreateOrderRowCtx {
  scope: WriteScope;
  /** resolveTestToken(store, token).test (D54): is_test, flag "test", sheet_status "disabled", no CAPI, no bumpOrderStats */
  test: boolean;
  /** mint the one-click upsell token for the new order (the page's upsell is on) */
  upsell: boolean;
  /** the shopper (public path, `shopperActor`) or the member placing a manual order (OP-08) */
  actor: Actor;
  /**
   * the built Purchase event or null, handed to runOrderHooks("created") inside after(); a function builds it
   * from the new order's id (the public path: the event carries the order id as its event id)
   */
  conversion: PurchaseConversion | null | ((orderId: string) => PurchaseConversion | null);
  now?: Date;
}

export interface CreatedOrderRow {
  orderId: string;
  /** shown once to the shopper (thank-you upsell), only its hash is stored */
  upsellToken: string | null;
  /** the idem key already had an order in this store: that order, nothing inserted */
  replayed: boolean;
  /** the Purchase event handed to the hooks (null for a replay, a test order or no event) */
  conversion: PurchaseConversion | null;
}

/** Thrown by createOrderRow when the idem key belongs to an order of another store (orders_idem_uq is global). */
export class OrderIdemTaken extends Error {
  constructor() {
    super("orders: the idempotency key belongs to another store's order");
    this.name = "OrderIdemTaken";
  }
}

/** The public path's actor: a shopper has no account (P0's order_events row records it as `customer`). */
export function shopperActor(ip: string): Actor {
  return { kind: "api", userId: null, impersonatorId: null, ip };
}

/** Upsell token: unguessable (HMAC with APP_SECRET) yet re-derivable for idempotent replays. Stored hashed. */
export const upsellTokenFor = (orderId: string, idem: string) => sign(`${orderId}.${idem}`, "upsell-token");
export const upsellTokenHash = (token: string) => sha256(token);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function errCode(err: unknown): { code?: string; message: string } {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string; sqlMessage?: string } };
  return {
    code: e?.code ?? e?.cause?.code,
    message: `${e?.message ?? ""} ${e?.cause?.sqlMessage ?? e?.cause?.message ?? ""}`,
  };
}

/** The scope's order with this idempotency key, if any. */
async function findByIdem(scope: StoreScope, idem: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(whereStore(orders, scope, eq(orders.idem, idem))).limit(1);
  return row;
}

/**
 * Work after the response: inside after() in a request, inline (awaited) where there is no request (jobs, tests).
 * Never throws.
 */
async function afterResponse(label: string, task: () => Promise<void>): Promise<void> {
  const guarded = () => task().catch((err) => logError(label, err));
  try {
    after(guarded);
  } catch {
    await guarded();
  }
}

/** The "created" event of an order row (the inTx phase has no Purchase event yet). */
const createdEvent = (order: OrderRow, conversion: PurchaseConversion | null): OrderHookEvent => ({
  on: "created",
  order,
  conversion,
  target: { pageId: order.pageId, versionId: order.versionId, source: order.source },
});

/**
 * D72: the one insert of an order row (the public v2 path, P4's manual orders, the R2 v3 paths), in the scope's
 * store, inside one transaction with the `inTx` order hooks:
 *  - the order id from `newOrderId()` (src/lib/db/ids), retried on the astronomically rare id collision
 *    (ER_DUP_ENTRY on the primary key; three retries); no caller ever makes an order id;
 *  - `store_id` from the scope only (§E.3 rule 4); `is_test`, the flag "test" and `sheet_status = 'disabled'` for a
 *    test order (D54), else the draft's sheet status (default "pending");
 *  - `upsell_token_hash` of the token minted for the new id (ctx.upsell);
 *  - `rev` and the state axes (`confirm_state`, `ship_state`, `money_state`) take their column defaults (0005,
 *    P0): never from the draft;
 *  - the same idempotency key already stored in this store → that order, `replayed`, nothing inserted; in another
 *    store → OrderIdemTaken (the caller answers "invalid": the key is global, the order is not);
 *  - after the commit, `runOrderHooks("created", "afterCommit", …)` inside after() with the built Purchase event.
 * With 0005 (P0, through the maintainer: this file is maintainer-owned from P0) the same transaction gains the
 * `order_events` "created" row and the `INSERT IGNORE` outbox items.
 */
export function createOrderRow(draft: OrderDraft, ctx: CreateOrderRowCtx): Promise<CreatedOrderRow> {
  return insertOrderRow(ctx.scope, draft, ctx);
}

async function insertOrderRow(scope: WriteScope, draft: OrderDraft, ctx: Omit<CreateOrderRowCtx, "scope">): Promise<CreatedOrderRow> {
  const { test } = ctx;
  const now = ctx.now ?? new Date();
  const flags = test ? [...new Set([...(draft.flags ?? []), "test"])] : draft.flags?.length ? draft.flags : null;
  const sheetStatus = test ? "disabled" : (draft.sheetStatus ?? "pending");
  const createdHooks = ORDER_HOOKS.some((h) => h.on.includes("created"));
  for (let attempt = 0; ; attempt++) {
    const orderId = newOrderId();
    const token = ctx.upsell ? upsellTokenFor(orderId, draft.idem) : null;
    try {
      const row = await db.transaction(async (tx: Tx) => {
        await tx.insert(orders).values(
          storeValues(scope, { ...draft, id: orderId, isTest: test, flags, sheetStatus, upsellTokenHash: token ? upsellTokenHash(token) : null, createdAt: now, updatedAt: now }),
        );
        if (!createdHooks) return null;
        const [stored] = await tx.select().from(orders).where(byId(orders, scope, orderId)).limit(1);
        if (!stored) throw new Error("orders: the inserted order is not readable in its store");
        await runOrderHooks("created", "inTx", scope, createdEvent(stored, null), tx);
        return stored;
      });
      const conversion = test ? null : typeof ctx.conversion === "function" ? ctx.conversion(orderId) : ctx.conversion;
      if (row) await afterResponse("orders:hooks", () => runOrderHooks("created", "afterCommit", scope, createdEvent(row, conversion)));
      return { orderId, upsellToken: token, replayed: false, conversion };
    } catch (err) {
      const e = errCode(err);
      if (e.code !== "ER_DUP_ENTRY") throw err;
      if (/orders_idem_uq/.test(e.message)) {
        // the same submit raced in on another request (this store), or the key is another store's
        const prior = await findByIdem(scope, draft.idem);
        if (!prior) throw new OrderIdemTaken();
        return { orderId: prior.id, upsellToken: prior.upsellTokenHash ? upsellTokenFor(prior.id, prior.idem) : null, replayed: true, conversion: null };
      }
      if (attempt >= 3) throw err;
    }
  }
}


/* ------------------------------------------------------------------ */
/* The public order pipeline                                           */
/* ------------------------------------------------------------------ */

export interface CreateOrderContext {
  ip: string;
  ua: string | null;
  /** the resolved page key (resolvePublicTarget): its store, its public scope and the published document */
  target: PublicPageTarget;
  /** Turnstile token sent next to the payload (field "cf") */
  captchaToken?: string | null;
  /** the request carried no Origin header */
  noOrigin?: boolean;
  /**
   * the hidden "website" field was filled — the route detects it before schema validation
   * (OrderPayload only accepts an empty value) so bots still get a success-looking answer
   */
  honeypot?: boolean;
  /** resolveTestToken(target.store, ?sg-test).test (D54): a test order */
  test?: boolean;
  /** the store's Turnstile keys when the caller already has them (null: off); read for the store otherwise */
  turnstile?: TurnstileKeys | null;
}

export interface CreateOrderResult {
  response: OrderResponse;
  /** push to Google Sheets after responding */
  sync: boolean;
  /** seconds, for rate-limited answers */
  retryAfter?: number;
  /** server-side Purchase event of a newly stored order (send after responding) */
  conversion?: PurchaseConversion;
}

const DUPLICATE_WINDOW_MS = 12 * 3600_000;
/** stored orders per phone (all pages of the store) per 24 h */
export const PHONE_DAILY_LIMIT = 4;
const PHONE_WINDOW_MS = 86_400_000;
/** orders per page per 10 min above which new ones are flagged "page_burst" (never refused) */
export const PAGE_BURST = 200;
/** statuses the call center gave to orders that should not count against the phone */
const REJECTED_STATUSES = ["cancelled", "fake"] as const;

const fail = (error: Exclude<OrderResponse, { ok: true }>["error"], extra: Partial<CreateOrderResult> = {}): CreateOrderResult => ({
  response: { ok: false, error },
  sync: false,
  ...extra,
});

function replay(prior: OrderRow, target: PageTarget): CreateOrderResult {
  if (prior.pageId !== target.pageId) return fail("invalid");
  return {
    response: {
      ok: true,
      orderId: prior.id,
      total: Number(prior.total),
      currency: prior.currency,
      ...(prior.upsellTokenHash ? { upsellToken: upsellTokenFor(prior.id, prior.idem) } : {}),
    },
    sync: false,
  };
}

export function createOrder(payload: OrderPayload, ctx: CreateOrderContext): Promise<CreateOrderResult> {
  return placeOrder(ctx.target.scope, payload, ctx);
}

/** The pipeline, every query in the target's store (`scope` = ctx.target.scope). */
async function placeOrder(scope: WriteScope, payload: OrderPayload, ctx: CreateOrderContext): Promise<CreateOrderResult> {
  const resolved = ctx.target;
  const { store } = resolved;
  const test = !!ctx.test;

  // 1. idempotency — a retried submit returns the original answer (the store's orders only)
  const prior = await findByIdem(scope, payload.idem);
  if (prior) return replay(prior, resolved);

  // 2. fields & prices against the version the shopper saw (bots that filled the honeypot learn nothing)
  const version = await orderVersion(scope, resolved, payload as { v?: unknown; ver?: unknown });
  // the version validated against: stored on the order, and its pixels get the server events
  const target: PageTarget = { ...resolved, versionId: version.versionId, doc: version.doc };
  const { doc } = target;
  const honeypot = !!payload.website || !!ctx.honeypot;
  const decoy = (): CreateOrderResult => ({ response: decoyResponse(doc, payload.bundleId, store), sync: false });
  const v = validateOrder(payload, doc, { fallback: version.fallback });
  if (!v.ok) {
    if (honeypot) return decoy();
    if (v.stale) return { response: { ok: false, error: "stale" }, sync: false };
    return { response: { ok: false, error: "invalid", fields: v.fields }, sync: false };
  }
  const o = v.value;
  const money = { subtotal: fromCents(o.totals.subtotal), shipping: fromCents(o.totals.shipping), total: fromCents(o.totals.total) };

  // 3. optional Turnstile (the store's widget) — after local validation, so a typo never burns the single-use token
  const captcha = await checkCaptcha(scope, target, ctx.captchaToken, ctx.ip, { noOrigin: ctx.noOrigin, ...(ctx.turnstile !== undefined ? { keys: ctx.turnstile } : {}) });
  if (captcha === "failed") return fail("invalid");

  // network hash: IPv4 address or IPv6 /64 (security/ip rateKeyIp)
  const ipHash = hashIp(ctx.ip);
  const now = new Date();
  const throttled = (limited: RateResult[]): CreateOrderResult =>
    honeypot ? decoy() : fail("rate_limited", { retryAfter: Math.max(...limited.map((r) => r.retryAfter), 1) });

  // 4. per-IP limit in this store (8 / 10 min, ORD-02) — only the caller's own network fills it; then the store
  //    flood breaker (ORD-21), counted for stored-order attempts only (honeypots never count)
  const byIp = await rateLimit(storeBucketKey(scope, "order:ip", ipHash), 8, 600);
  if (!byIp.ok) return throttled([byIp]);
  if (!honeypot) {
    const flood = await rateLimit(storeBucketKey(scope, "orders"), STORE_FLOOD_LIMIT, 600);
    if (!flood.ok) return throttled([flood]);
  }

  // 5. the store's blocklist (generic answer, ORD-03)
  const [blocked] = await db
    .select({ id: blocklist.id })
    .from(blocklist)
    .where(
      whereStore(
        blocklist,
        scope,
        or(and(eq(blocklist.kind, "phone"), eq(blocklist.value, o.phone.e164)), and(eq(blocklist.kind, "ip"), eq(blocklist.value, ipHash))),
      ),
    )
    .limit(1);
  if (blocked) return honeypot ? decoy() : fail("blocked");

  // honeypot rows never count as a customer's order (duplicate guard, per-phone limit); test orders count
  // among test orders only (D54)
  const notHoneypot = or(isNull(orders.flags), sql`${orders.flags} NOT LIKE '%"honeypot"%'`);
  const sameKind = eq(orders.isTest, test);

  // 6. duplicate: same phone on the same page within 12 h (honeypot / cancelled orders don't count).
  //    Answered as such only to the network that placed it; otherwise the order goes on, flagged.
  let duplicate = false;
  if (!honeypot) {
    const dups = await db
      .select({ ipHash: orders.ipHash })
      .from(orders)
      .where(
        whereStore(
          orders,
          scope,
          eq(orders.phone, o.phone.e164),
          eq(orders.pageId, target.pageId),
          gte(orders.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
          ne(orders.status, "cancelled"),
          sameKind,
          notHoneypot,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(8);
    if (dups.some((d) => d.ipHash === ipHash)) return fail("duplicate");
    duplicate = dups.length > 0;
  }

  // 7. per phone: 4 stored orders / 24 h on the store's pages (orders_store_phone_idx, ORD-04) — no bucket a
  //    stranger could fill: honeypot rows and orders the call center cancelled / marked fake don't count. Then
  //    the per-page burst (200 / 10 min), counted for orders about to be stored: a risk signal only, so a flood
  //    can never shut a page (and its exports) to real shoppers. Bot traffic skips both.
  let pageBurst = false;
  if (!honeypot) {
    const recent = await db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(
        whereStore(
          orders,
          scope,
          eq(orders.phone, o.phone.e164),
          gte(orders.createdAt, new Date(now.getTime() - PHONE_WINDOW_MS)),
          notInArray(orders.status, [...REJECTED_STATUSES]),
          sameKind,
          notHoneypot,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(PHONE_DAILY_LIMIT);
    if (recent.length >= PHONE_DAILY_LIMIT) {
      // a slot frees up when the oldest of the last PHONE_DAILY_LIMIT orders leaves the window
      const frees = recent[PHONE_DAILY_LIMIT - 1]!.createdAt.getTime() + PHONE_WINDOW_MS;
      return fail("rate_limited", { retryAfter: Math.max(1, Math.ceil((frees - now.getTime()) / 1000)) });
    }
    const byPage = await rateLimit(`order:page:${target.pageId}`, PAGE_BURST, 600);
    pageBurst = !byPage.ok;
  }

  // 8. risk signals from the store's real orders (ORD-05: another store's outcomes never leak in)
  const since24h = new Date(now.getTime() - 86_400_000);
  const real = eq(orders.isTest, false);
  const [[ipStats], history] = await Promise.all([
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(orders)
      // served by orders_store_page_idx (store_id, page_id, created_at)
      .where(whereStore(orders, scope, eq(orders.pageId, target.pageId), gte(orders.createdAt, since24h), eq(orders.ipHash, ipHash), real)),
    db
      .select({ status: orders.status, n: sql<number>`COUNT(*)` })
      .from(orders)
      .where(whereStore(orders, scope, eq(orders.phone, o.phone.e164), inArray(orders.status, ["fake", "returned", "cancelled", "delivered"]), real))
      .groupBy(orders.status),
  ]);
  const count = (s: string) => Number(history.find((h) => h.status === s)?.n ?? 0);
  const risk = scoreRisk({
    honeypot,
    t: payload.t,
    ua: ctx.ua,
    captcha,
    noOrigin: !!ctx.noOrigin,
    ipOrders24h: Number(ipStats?.n ?? 0),
    badHistory: count("fake") + count("returned") + count("cancelled"),
    delivered: count("delivered"),
    pageBurst,
    duplicate,
  });

  // 9. persist through the one insert (D72)
  const utm = Object.fromEntries(Object.entries(payload.utm).filter(([, val]) => typeof val === "string" && val));
  let created: CreatedOrderRow;
  try {
    created = await createOrderRow(
      {
        pageId: target.pageId,
        versionId: target.versionId,
        exportId: target.exportId,
        source: target.source,
        status: "new",
        name: o.name,
        phone: o.phone.e164,
        phoneRaw: o.phoneRaw,
        city: o.city,
        address: o.address,
        note: o.note,
        email: o.email,
        productName: doc.product.name.slice(0, 160),
        items: o.items,
        qty: o.items.qty,
        subtotal: money.subtotal,
        shipping: money.shipping,
        total: money.total,
        currency: doc.currency,
        locale: o.locale,
        utm: Object.keys(utm).length ? utm : null,
        ref: payload.ref?.slice(0, 500) || null,
        ipHash,
        ua: ctx.ua?.slice(0, 300) || null,
        eventId: payload.eventId,
        idem: payload.idem,
        riskScore: risk.score,
        flags: risk.flags.length ? risk.flags : null,
        sheetStatus: honeypot ? "disabled" : "pending",
      },
      {
        scope,
        test,
        upsell: !!doc.offers.upsell?.enabled,
        actor: shopperActor(ctx.ip),
        conversion: honeypot ? null : (orderId) => purchaseConversion({ orderId, createdAt: now, payload, order: o, target, riskScore: risk.score, ip: ctx.ip, ua: ctx.ua }),
        now,
      },
    );
  } catch (err) {
    if (err instanceof OrderIdemTaken) return fail("invalid");
    throw err;
  }
  if (created.replayed) {
    // the same submit raced in on another request of this store: answer like a replay
    const again = await findByIdem(scope, payload.idem);
    return again ? replay(again, target) : fail("invalid");
  }
  const { orderId, upsellToken: token, conversion } = created;

  // 10. side effects (never fail the order): the lead of this visit converted (same kind), the page's stats (real
  //     orders only)
  if (!honeypot) {
    await Promise.all([
      db
        .update(leads)
        .set({ convertedOrderId: orderId })
        .where(
          whereStore(
            leads,
            scope,
            isNull(leads.convertedOrderId),
            eq(leads.isTest, test),
            or(
              eq(leads.idem, payload.idem),
              and(eq(leads.pageId, target.pageId), eq(leads.phone, o.phone.e164), gte(leads.createdAt, new Date(now.getTime() - 7 * 86_400_000))),
            ),
          ),
        ),
      test ? null : bumpOrderStats(scope, target.pageId, now, { orders: 1, revenue: money.total }),
    ]).catch((err) => logError("orders:bookkeeping", err));
  }

  return {
    response: { ok: true, orderId, total: money.total, currency: doc.currency, ...(token ? { upsellToken: token } : {}) },
    sync: !honeypot && !test,
    ...(conversion ? { conversion } : {}),
  };
}

/**
 * Success-looking answer for automated submitters (honeypot filled) when nothing is stored:
 * invalid or throttled bot submissions must be indistinguishable from accepted ones. The currency is the
 * page's, else the store's (ORD-07); MAD only when neither is known (an unknown page key).
 */
export function decoyResponse(doc: PageDoc | null, bundleId?: unknown, store?: Pick<StoreRow, "currency"> | null): OrderResponse {
  const offer = doc?.offers.bundles.find((b) => b.id === bundleId);
  const price = doc ? (offer ? fromCents(offerMath(doc, offer).from) : leadItem(doc).price) : 0;
  return { ok: true, orderId: newOrderId(), total: price, currency: doc?.currency ?? store?.currency ?? "MAD" };
}
