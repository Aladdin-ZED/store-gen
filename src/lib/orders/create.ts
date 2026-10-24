import "server-only";
/**
 * createOrder — the public order pipeline.
 *
 *   resolve pageKey → idempotent replay → the version the shopper saw (orderVersion: ≤ 72 h after it
 *   was replaced) → validate (prices recomputed in cents from that version; "stale" when the page the
 *   shopper saw is gone and the order no longer matches) → Turnstile → per-IP limit → blocklist → duplicate (same phone + page, 12 h)
 *   → per-phone limit → per-page burst signal → risk score → insert → lead converted + stats
 *   → { ok, orderId, upsellToken, total, currency }
 *
 * Nothing a stranger can do may stop real customers from ordering, so no shared counter refuses an
 * order: the per-phone limit counts the phone's STORED orders (honeypot rows and orders the call center
 * cancelled or marked fake don't count), and the per-page burst only raises the risk score.
 * Honeypot hits get a success-looking answer (bots learn nothing) and touch no shared quota; they are
 * stored flagged and never sent to the sheet.
 * The "duplicate" answer is only given to the network that placed the earlier order (the customer
 * re-submitting): anyone else gets the normal flow with the new order flagged, so the API never tells
 * a stranger that a phone number ordered. It still runs after the per-IP limit.
 * Sheet sync is the caller's job (after() in the route handler) when `sync` is true, and so are the
 * server-side Purchase events (`conversion`, see ./conversions).
 *
 * One order insert (docs/STORE-SAAS.md D72): `createOrderRow(draft, ctx)` is the only insert of an order row in the
 * codebase; T3 extracts it in R1.0 from step 9 below (the id retry on ER_DUP_ENTRY, is_test, sheet_status, rev and
 * the confirm_state defaults, upsell_token_hash, the order_events "created" row, the INSERT IGNORE outbox items and
 * the runOrderHooks("created", "afterCommit", …) call inside after()). Signature frozen at C0a.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { newOrderId } from "@/lib/db/ids";
import { blocklist, leads, orders } from "@/lib/db/schema";
import { hashIp, sign } from "@/lib/security/crypto";
import { rateLimit, type RateResult } from "@/lib/security/rate-limit";
import { leadItem } from "@/lib/page/catalog";
import { fromCents, offerMath } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { bumpOrderStats } from "@/lib/stats";
import type { OrderPayload, OrderResponse } from "./contract";
import { purchaseConversion, type PurchaseConversion } from "./conversions";
import { logError } from "./log";
import { orderVersion, resolvePageKey, type PageTarget } from "./resolve";
import { scoreRisk } from "./risk";
import { checkCaptcha } from "./turnstile";
import { validateOrder } from "./validate";
import type { Actor, WriteScope } from "@/lib/tenancy/types";

export interface CreateOrderContext {
  ip: string;
  ua: string | null;
  /** pre-resolved target (the route resolves it first for CORS decisions) */
  target?: PageTarget;
  /** Turnstile token sent next to the payload (field "cf") */
  captchaToken?: string | null;
  /** the request carried no Origin header */
  noOrigin?: boolean;
  /**
   * the hidden "website" field was filled — the route detects it before schema validation
   * (OrderPayload only accepts an empty value) so bots still get a success-looking answer
   */
  honeypot?: boolean;
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

/** The order's own columns; the id, the store, the test flag, the upsell hash and the timestamps are createOrderRow's. */
export type OrderDraft = Omit<typeof orders.$inferInsert, "id" | "storeId" | "isTest" | "upsellTokenHash" | "createdAt" | "updatedAt">;

export interface CreateOrderRowCtx {
  scope: WriteScope;
  /** resolveTestToken(store, token).test (D54): is_test, flag "test", sheet_status "disabled", no CAPI, no bumpOrderStats */
  test: boolean;
  /** mint the one-click upsell token for the new order (the page's upsell is on) */
  upsell: boolean;
  /** the shopper (public path) or the member placing a manual order (OP-08) */
  actor: Actor;
  /** the built Purchase event or null, handed to runOrderHooks("created") inside after() */
  conversion: PurchaseConversion | null;
  now?: Date;
}

export interface CreatedOrderRow {
  orderId: string;
  /** shown once to the shopper (thank-you upsell), only its hash is stored */
  upsellToken: string | null;
  /** the idem key already had an order in this store: that order, nothing inserted */
  replayed: boolean;
}

/** D72: the one insert of an order row (public v2 path, P4's manual orders, the R2 v3 paths). T3. */
export async function createOrderRow(draft: OrderDraft, ctx: CreateOrderRowCtx): Promise<CreatedOrderRow> {
  void draft;
  void ctx;
  throw new Error("not implemented: T3 (createOrderRow)");
}

const DUPLICATE_WINDOW_MS = 12 * 3600_000;
/** stored orders per phone (all pages) per 24 h */
export const PHONE_DAILY_LIMIT = 4;
const PHONE_WINDOW_MS = 86_400_000;
/** orders per page per 10 min above which new ones are flagged "page_burst" (never refused) */
export const PAGE_BURST = 200;
/** statuses the call center gave to orders that should not count against the phone */
const REJECTED_STATUSES = ["cancelled", "fake"] as const;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Upsell token: unguessable (HMAC with APP_SECRET) yet re-derivable for idempotent replays. Stored hashed. */
export const upsellTokenFor = (orderId: string, idem: string) => sign(`${orderId}.${idem}`, "upsell-token");
export const upsellTokenHash = (token: string) => sha256(token);

const fail = (error: Exclude<OrderResponse, { ok: true }>["error"], extra: Partial<CreateOrderResult> = {}): CreateOrderResult => ({
  response: { ok: false, error },
  sync: false,
  ...extra,
});

function errCode(err: unknown): { code?: string; message: string } {
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string; sqlMessage?: string } };
  return {
    code: e?.code ?? e?.cause?.code,
    message: `${e?.message ?? ""} ${e?.cause?.sqlMessage ?? e?.cause?.message ?? ""}`,
  };
}

type OrderRow = typeof orders.$inferSelect;

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

async function findByIdem(idem: string): Promise<OrderRow | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.idem, idem)).limit(1);
  return row;
}

export async function createOrder(payload: OrderPayload, ctx: CreateOrderContext): Promise<CreateOrderResult> {
  const resolved = ctx.target ?? (await resolvePageKey(payload.pageKey, "order"));
  if (!resolved) return fail("unavailable");

  // 1. idempotency — a retried submit returns the original answer
  const prior = await findByIdem(payload.idem);
  if (prior) return replay(prior, resolved);

  // 2. fields & prices against the version the shopper saw (bots that filled the honeypot learn nothing)
  const version = await orderVersion(resolved, payload as { v?: unknown; ver?: unknown });
  // the version validated against: stored on the order, and its pixels get the server events
  const target: PageTarget = { ...resolved, versionId: version.versionId, doc: version.doc };
  const { doc } = target;
  const honeypot = !!payload.website || !!ctx.honeypot;
  const v = validateOrder(payload, doc, { fallback: version.fallback });
  if (!v.ok) {
    if (honeypot) return { response: decoyResponse(doc, payload.bundleId), sync: false };
    if (v.stale) return { response: { ok: false, error: "stale" }, sync: false };
    return { response: { ok: false, error: "invalid", fields: v.fields }, sync: false };
  }
  const o = v.value;
  const money = { subtotal: fromCents(o.totals.subtotal), shipping: fromCents(o.totals.shipping), total: fromCents(o.totals.total) };

  // 3. optional Turnstile — after local validation, so a typo never burns the single-use token
  const captcha = await checkCaptcha(target, ctx.captchaToken, ctx.ip, { noOrigin: ctx.noOrigin });
  if (captcha === "failed") return fail("invalid");

  // network hash: IPv4 address or IPv6 /64 (security/ip rateKeyIp)
  const ipHash = hashIp(ctx.ip);
  const now = new Date();
  const throttled = (limited: RateResult[]): CreateOrderResult =>
    honeypot
      ? { response: decoyResponse(doc, payload.bundleId), sync: false }
      : fail("rate_limited", { retryAfter: Math.max(...limited.map((r) => r.retryAfter), 1) });

  // 4. per-IP limit (8 / 10 min) — the only shared bucket, and only the caller's own network fills it
  const byIp = await rateLimit(`order:ip:${ipHash}`, 8, 600);
  if (!byIp.ok) return throttled([byIp]);

  // 5. blocklist (generic answer)
  const [blocked] = await db
    .select({ id: blocklist.id })
    .from(blocklist)
    .where(
      or(
        and(eq(blocklist.kind, "phone"), eq(blocklist.value, o.phone.e164)),
        and(eq(blocklist.kind, "ip"), eq(blocklist.value, ipHash)),
      ),
    )
    .limit(1);
  if (blocked) return honeypot ? { response: decoyResponse(doc, payload.bundleId), sync: false } : fail("blocked");

  // honeypot rows never count as a customer's order (duplicate guard, per-phone limit)
  const notHoneypot = or(isNull(orders.flags), sql`${orders.flags} NOT LIKE '%"honeypot"%'`);

  // 6. duplicate: same phone on the same page within 12 h (honeypot / cancelled orders don't count).
  //    Answered as such only to the network that placed it; otherwise the order goes on, flagged.
  let duplicate = false;
  if (!honeypot) {
    const dups = await db
      .select({ ipHash: orders.ipHash })
      .from(orders)
      .where(
        and(
          eq(orders.phone, o.phone.e164),
          eq(orders.pageId, target.pageId),
          gte(orders.createdAt, new Date(now.getTime() - DUPLICATE_WINDOW_MS)),
          ne(orders.status, "cancelled"),
          notHoneypot,
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(8);
    if (dups.some((d) => d.ipHash === ipHash)) return fail("duplicate");
    duplicate = dups.length > 0;
  }

  // 7. per phone: 4 stored orders / 24 h on all pages (orders_phone_idx) — no bucket a stranger could
  //    fill: honeypot rows and orders the call center cancelled / marked fake don't count. Then the
  //    per-page burst (200 / 10 min), counted for orders about to be stored: a risk signal only, so
  //    a flood can never shut a page (and its exports) to real shoppers. Bot traffic skips both.
  let pageBurst = false;
  if (!honeypot) {
    const recent = await db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(
        and(
          eq(orders.phone, o.phone.e164),
          gte(orders.createdAt, new Date(now.getTime() - PHONE_WINDOW_MS)),
          notInArray(orders.status, [...REJECTED_STATUSES]),
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

  // 8. risk signals
  const since24h = new Date(now.getTime() - 86_400_000);
  const [[ipStats], history] = await Promise.all([
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(orders)
      // served by orders_ip_idx (ip_hash, created_at), migration 0002, or the (page_id, created_at) index
      .where(and(eq(orders.pageId, target.pageId), gte(orders.createdAt, since24h), eq(orders.ipHash, ipHash))),
    db
      .select({ status: orders.status, n: sql<number>`COUNT(*)` })
      .from(orders)
      .where(and(eq(orders.phone, o.phone.e164), inArray(orders.status, ["fake", "returned", "cancelled", "delivered"])))
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

  // 9. persist (order ids are random: retry on the astronomically rare collision)
  const withUpsell = !!doc.offers.upsell?.enabled;
  const utm = Object.fromEntries(Object.entries(payload.utm).filter(([, val]) => typeof val === "string" && val));
  let orderId = "";
  let token: string | undefined;
  for (let attempt = 0; ; attempt++) {
    orderId = newOrderId();
    token = withUpsell ? upsellTokenFor(orderId, payload.idem) : undefined;
    try {
      await db.insert(orders).values({
        id: orderId,
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
        upsellTokenHash: token ? upsellTokenHash(token) : null,
        sheetStatus: honeypot ? "disabled" : "pending",
        createdAt: now,
        updatedAt: now,
      });
      break;
    } catch (err) {
      const e = errCode(err);
      if (e.code !== "ER_DUP_ENTRY") throw err;
      if (/orders_idem_uq/.test(e.message)) {
        // the same submit raced in on another request: answer like a replay
        const again = await findByIdem(payload.idem);
        if (again) return replay(again, target);
      }
      if (attempt >= 3) throw err;
    }
  }

  // 10. side effects (never fail the order)
  if (!honeypot) {
    await Promise.all([
      db
        .update(leads)
        .set({ convertedOrderId: orderId })
        .where(
          and(
            isNull(leads.convertedOrderId),
            or(
              eq(leads.idem, payload.idem),
              and(eq(leads.pageId, target.pageId), eq(leads.phone, o.phone.e164), gte(leads.createdAt, new Date(now.getTime() - 7 * 86_400_000))),
            ),
          ),
        ),
      bumpOrderStats(target.pageId, now, { orders: 1, revenue: money.total }),
    ]).catch((err) => logError("orders:bookkeeping", err));
  }

  const conversion = honeypot
    ? null
    : purchaseConversion({ orderId, createdAt: now, payload, order: o, target, riskScore: risk.score, ip: ctx.ip, ua: ctx.ua });

  return {
    response: { ok: true, orderId, total: money.total, currency: doc.currency, ...(token ? { upsellToken: token } : {}) },
    sync: !honeypot,
    ...(conversion ? { conversion } : {}),
  };
}

/**
 * Success-looking answer for automated submitters (honeypot filled) when nothing is stored:
 * invalid or throttled bot submissions must be indistinguishable from accepted ones.
 */
export function decoyResponse(doc: PageDoc | null, bundleId?: unknown): OrderResponse {
  const offer = doc?.offers.bundles.find((b) => b.id === bundleId);
  const price = doc ? (offer ? fromCents(offerMath(doc, offer).from) : leadItem(doc).price) : 0;
  return { ok: true, orderId: newOrderId(), total: price, currency: doc?.currency ?? "MAD" };
}
