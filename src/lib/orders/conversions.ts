import "server-only";
/**
 * Server-side ad events: Meta Conversions API and TikTok Events API (operations.md OPE-§20; IN-02, IN-03; R1 P5).
 *
 *   createOrder() → purchaseConversion(...)                       (fresh, non-honeypot, non-test orders, risk < 70)
 *   route handler → sendConversionsAfterResponse(target.scope, c)  (after the response, never blocks)
 *   hook int.capi → enqueueCreatedConversions / enqueueTransitionConversions (inTx, src/lib/orders/hooks/integrations.ts)
 *   outbox `capi` → src/lib/jobs/handlers/capi.ts                  (the send, the 7-day guard, health, timeline)
 *   job ops.capi_ctx_purge → purgeCapiContexts(scope)              (capi_ctx nulled 8 days after creation)
 *   saveConversionsAction → applyConversionsChange(scope, …)       (re-renders the pages whose trigger changed)
 *
 * The trigger (OPE-§20.2, OD18): `triggerFor(conversions, pageId)`. At creation, trigger `order` and risk < 70 enqueue
 * the Purchase, one outbox item per pixel of the validated version that has its own server token in the store's
 * Settings → Pixels (`tracking_secrets`, PIX-01), and drain the store's `capi` items in after(). When a later moment can
 * still produce an event (trigger `confirmed` / `delivered`, or the custom events on), the conversion's client data is
 * sealed into `orders.capi_ctx` (envelope v2, scope store, purpose `capi-ctx`, ≤ 8 KB, OD21) without bumping `rev`, and
 * the transition hook rebuilds the events from it inside the order's transaction (OD6: a delivery is exactly as
 * durable as the state that decided it). A test order, a honeypot row and a typed order (unless `manualOrders`) send
 * nothing (OPE-§26, D54, OD16).
 *
 * Multi-tenant (docs/STORE-SAAS.md §D.10, §E.3; PIX-01, PIX-02): every read and write is the order's store's (whereStore),
 * the tokens and the library are the store's own and are read at send time (never in a payload), and the fallback
 * event URL is the store's page URL (`storeUrl`). Store B firing store A's pixel id never uses A's token.
 *
 * Until P8 and P4 merge, `enqueue`, `drainOutbox`, `enqueueRenders` and `appendOrderEvent` are P0 stubs that throw "not
 * implemented". Then the creation path sends its Purchase directly (the R1.0 path, `sendPurchaseConversions`), the
 * transition events wait for the outbox, and the timeline events are skipped. That fallback goes at the R1 integration.
 */
import { after } from "next/server";
import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { auditIn } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { orders, pages } from "@/lib/db/schema";
import { drainOutbox as drainOutboxP8, enqueue as enqueueP8 } from "@/lib/jobs/outbox";
import { enqueueRenders as enqueueRendersP8 } from "@/lib/jobs/renders";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { contentIdOf, leadItem } from "@/lib/page/catalog";
import { recordPixelHealth } from "@/lib/pixels/health.server";
import { pixelIdList, type ServerPlatform } from "@/lib/pixels/ids";
import { markHealthDirty } from "@/lib/platform/health-snapshot";
import { open, seal } from "@/lib/security/crypto";
import { getStoreSettings, type SettingValue } from "@/lib/settings";
import type { ConversionsSetting } from "@/lib/settings/keys/conversions";
import { assertFeature, EntitlementError } from "@/lib/tenancy/entitlements";
import { getStoreById } from "@/lib/tenancy/public";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";
import {
  capiContextOf,
  capiOutboxItems,
  centsOf,
  cleanUrl,
  conversionFromContext,
  conversionsBlocked,
  dispatchPurchase,
  eventsAfter,
  itemsHashOf,
  ownToken,
  parseCapiContext,
  planConversionEvents,
  serverOnlyContext,
  triggerFor,
  type CapiContext,
  type CapiPayload,
  type ConversionMoment,
  type PurchaseConversion,
} from "./conversions-core";
import { appendOrderEvent as appendOrderEventP4 } from "./events";
import type { OrderHookEvent, OrderRow, Tx } from "./hooks";
import { errorSummary } from "./log";
import { versionDoc } from "./resolve";

export {
  CONVERSION_MAX_RISK,
  META_GRAPH_API_VERSION,
  META_PURCHASE_EVENT,
  TIKTOK_EVENTS_URL,
  TIKTOK_PURCHASE_EVENT,
  purchaseConversion,
  serverCredentials,
  type PurchaseConversion,
} from "./conversions-core";

const LOG = "[conversions]";

type Secrets = SettingValue<"tracking_secrets">;
type Library = SettingValue<"pixel_library">;
type Conversions = ConversionsSetting;

/** The envelope purpose of `orders.capi_ctx` (core §F.3; frozen once sealed rows exist). */
export const CAPI_CTX_PURPOSE = "capi-ctx";

/* ------------------------------------------------------------------ */
/* P8's and P4's API, and the test double                              */
/* ------------------------------------------------------------------ */

/** The calls of other tracks this file makes (frozen signatures, src/lib/contracts/r1-p0.ts). */
export interface CapiDeps {
  enqueue: typeof enqueueP8;
  drainOutbox: typeof drainOutboxP8;
  enqueueRenders: typeof enqueueRendersP8;
  appendOrderEvent: typeof appendOrderEventP4;
}

// one double per module instance (test:integrations-db loads this module once); never set in a server
let capiDouble: Partial<CapiDeps> | null = null;

/** Replace P8's and P4's calls with spies (test:integrations-db). Refused under NODE_ENV=production. */
export function setCapiDoubleForTests(double: Partial<CapiDeps> | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("conversions: the test double is refused in production");
  capiDouble = double;
}

/** The calls in effect (the double only outside production). */
export function capiDeps(): CapiDeps {
  const d = process.env.NODE_ENV === "production" ? null : capiDouble;
  return {
    enqueue: d?.enqueue ?? enqueueP8,
    drainOutbox: d?.drainOutbox ?? drainOutboxP8,
    enqueueRenders: d?.enqueueRenders ?? enqueueRendersP8,
    appendOrderEvent: d?.appendOrderEvent ?? appendOrderEventP4,
  };
}

/** A P0 stub of another track ("not implemented: P4 …" / "P8 …"): not available yet, never an error to log. */
export const notBuiltYet = (err: unknown): boolean => err instanceof Error && /^not implemented: P[48]\b/.test(err.message);

/* ------------------------------------------------------------------ */
/* the sealed context                                                  */
/* ------------------------------------------------------------------ */

/** Seal a context for the order's store (envelope v2, purpose `capi-ctx`). */
export function sealCapiContext(scope: StoreScope, ctx: CapiContext): string {
  return seal(JSON.stringify(ctx), { store: scope.storeId }, CAPI_CTX_PURPOSE);
}

/** Open a stored context; null when it does not open for this store or does not parse (never throws). */
export function openCapiContext(scope: StoreScope, sealed: string | null | undefined): CapiContext | null {
  if (!sealed) return null;
  try {
    return parseCapiContext(open(sealed, { store: scope.storeId }, CAPI_CTX_PURPOSE));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* shared reads                                                        */
/* ------------------------------------------------------------------ */

/** The store's URL of the event's page when the order did not report one (live pages only; exports live elsewhere). */
export async function storeFallbackUrl(scope: StoreScope, c: Pick<PurchaseConversion, "source" | "pageId">): Promise<string | null> {
  if (c.source !== "live") return null;
  const [[row], store] = await Promise.all([
    db.select({ slug: pages.slug }).from(pages).where(byId(pages, scope, c.pageId)).limit(1),
    getStoreById(scope.storeId),
  ]);
  return row && store ? storeUrl(store, `/${row.slug}`) : null;
}

/** Is the store's server-events feature on? A kill switch counts as on: its items wait in the outbox (§H.8). */
async function capiFeatureOn(scope: StoreScope): Promise<boolean> {
  try {
    await assertFeature(scope, "pixels_capi");
    return true;
  } catch (err) {
    if (err instanceof EntitlementError) return err.reason === "kill";
    throw err;
  }
}

const hasTokenIn = (secrets: Secrets) => (platform: ServerPlatform, pixelId: string) => !!ownToken(secrets, platform, pixelId);
const honeypotOf = (flags: string[] | null | undefined) => !!flags?.includes("honeypot");

/* ------------------------------------------------------------------ */
/* the R1.0 direct send (the test-event path, and the creation path    */
/* while P8's outbox is the P0 stub)                                   */
/* ------------------------------------------------------------------ */

/** Dispatch, log the failures, record the pixels' health (the callers catch). */
async function dispatchAndRecord(scope: WriteScope, event: PurchaseConversion, secrets: Secrets, library: Library): Promise<void> {
  const results = await dispatchPurchase(event, secrets, library);
  for (const r of results) {
    if (!r.ok) console.error(`${LOG} ${r.platform} purchase for order ${event.orderId} (pixel …${r.pixelId.slice(-4)}) failed: ${r.detail ?? "unknown error"}`);
  }
  if (results.length) {
    await recordPixelHealth(
      scope,
      results.map((r) => ({ platform: r.platform, id: r.pixelId, state: r.ok ? ("ok" as const) : ("refused" as const), code: r.code, testMode: r.testMode })),
      { throttle: true },
    );
  }
}

const logFailure = (c: Pick<PurchaseConversion, "orderId">, err: unknown) => console.error(`${LOG} order ${c.orderId}:`, errorSummary(err));

/**
 * Send the order's Purchase to every pixel of the store that has its own server token, now. Never throws. `secrets` /
 * `library` default to the store's settings (pass them when already loaded).
 */
export async function sendPurchaseConversions(scope: WriteScope, c: PurchaseConversion, opts: { secrets?: Secrets; library?: Library } = {}): Promise<void> {
  try {
    const stored = opts.secrets && opts.library ? null : await getStoreSettings(scope, ["tracking_secrets", "pixel_library"]);
    const secrets = opts.secrets ?? stored!.tracking_secrets;
    const library = opts.library ?? stored!.pixel_library;
    const event: PurchaseConversion = c.sourceUrl ? c : { ...c, sourceUrl: await storeFallbackUrl(scope, c).catch(() => null) };
    await dispatchAndRecord(scope, event, secrets, library);
  } catch (err) {
    logFailure(c, err);
  }
}

/* ------------------------------------------------------------------ */
/* at creation (OPE-§20.4 (1))                                         */
/* ------------------------------------------------------------------ */

export interface CreationOutcome {
  /** outbox items handed to `enqueue` (0: nothing planned, no token, or the order may not send) */
  enqueued: number;
  /** the context was sealed into `orders.capi_ctx` */
  sealed: boolean;
  /** the R1.0 direct send ran (P8's outbox is not built yet) */
  direct: boolean;
}

/**
 * The creation half of a public order's server events (the body of `sendConversionsAfterResponse`, exported for the
 * tests). Reads the order back (the belt over T3's skip: a test order or a honeypot row sends nothing), plans the
 * `created` moment, enqueues and drains, and seals the context when a later moment can still send. Never throws.
 */
export async function conversionsAtCreation(scope: WriteScope, c: PurchaseConversion, opts: { drain?: boolean } = {}): Promise<CreationOutcome> {
  const out: CreationOutcome = { enqueued: 0, sealed: false, direct: false };
  try {
    const [row] = await db
      .select({ isTest: orders.isTest, source: orders.source, flags: orders.flags, items: orders.items, risk: orders.riskScore })
      .from(orders)
      .where(byId(orders, scope, c.orderId))
      .limit(1);
    if (!row || row.isTest) return out;
    const settings = await getStoreSettings(scope, ["conversions", "tracking_secrets"]);
    const conv = settings.conversions;
    const order = { id: c.orderId, isTest: row.isTest, honeypot: honeypotOf(row.flags), source: row.source, risk: c.risk ?? row.risk };
    if (conversionsBlocked(order, conv.manualOrders) || !(await capiFeatureOn(scope))) return out;

    const trigger = triggerFor(conv, c.pageId);
    const event: PurchaseConversion = c.sourceUrl ? c : { ...c, sourceUrl: await storeFallbackUrl(scope, c).catch(() => null) };
    const planned = planConversionEvents({ trigger, customEvents: conv.customEvents, manualOrders: conv.manualOrders, order, at: "created" });
    const items = capiOutboxItems(event, planned, hasTokenIn(settings.tracking_secrets), "created");
    const deps = capiDeps();
    if (items.length) {
      try {
        await deps.enqueue(scope, items);
        out.enqueued = items.length;
        if (opts.drain !== false) await deps.drainOutbox({ storeId: scope.storeId, kinds: ["capi"], budgetMs: 8_000 }).catch((err: unknown) => notBuiltYet(err) || logFailure(c, err));
      } catch (err) {
        if (!notBuiltYet(err)) throw err;
        // P8's outbox is the P0 stub: R1.0's direct Purchase, so a store's ads keep learning between the merges
        await sendPurchaseConversions(scope, event, { secrets: settings.tracking_secrets });
        out.direct = true;
      }
    }

    if (eventsAfter(trigger, conv.customEvents, "created")) {
      const sealed = sealCapiContext(scope, capiContextOf(event, itemsHashOf(row.items)));
      // no rev bump: the context is bookkeeping, not an order change (OD4)
      await db.update(orders).set({ capiCtx: sealed }).where(whereStore(orders, scope, eq(orders.id, c.orderId), eq(orders.isTest, false)));
      out.sealed = true;
    }
  } catch (err) {
    logFailure(c, err);
  }
  return out;
}

/**
 * After the response (Next after()): the creation half of the order's server events. Never throws and never delays
 * the shopper's confirmation. Frozen call site: T3's public order route.
 */
export function sendConversionsAfterResponse(scope: StoreScope, c: PurchaseConversion | null | undefined): void {
  if (!c) return;
  try {
    // after the response the work is background work of the order's store (system scope, OPE-§20.4)
    after(() => conversionsAtCreation(systemScope(systemCtx("orders.capi"), scope.storeId), c).then(() => undefined));
  } catch (err) {
    console.error(`${LOG} could not schedule order ${c.orderId}:`, errorSummary(err));
  }
}

/* ------------------------------------------------------------------ */
/* the int.capi hook (OPE-§20.4 (2), inTx)                             */
/* ------------------------------------------------------------------ */

/** What the hook reads of the order inside its transaction (never selected for anything else). */
const HOOK_COLUMNS = {
  id: orders.id,
  isTest: orders.isTest,
  source: orders.source,
  flags: orders.flags,
  pageId: orders.pageId,
  versionId: orders.versionId,
  capiCtx: orders.capiCtx,
  phone: orders.phone,
  email: orders.email,
  name: orders.name,
  city: orders.city,
  productName: orders.productName,
  total: orders.total,
  currency: orders.currency,
  qty: orders.qty,
  items: orders.items,
  risk: orders.riskScore,
  ref: orders.ref,
  createdAt: orders.createdAt,
  confirmedAt: orders.confirmedAt,
  deliveredAt: orders.deliveredAt,
};

async function hookOrder(scope: StoreScope, id: string, tx: Tx) {
  const [row] = await tx.select(HOOK_COLUMNS).from(orders).where(byId(orders, scope, id)).limit(1);
  return row ?? null;
}
type HookOrder = NonNullable<Awaited<ReturnType<typeof hookOrder>>>;

/**
 * The document of the order's version, else of its page's published version (a typed order may carry none), and the
 * page's public key (the browser pixel's content id fallback).
 */
async function orderDoc(scope: StoreScope, pageId: string, versionId: string | null) {
  const [page] = await db.select({ v: pages.publishedVersionId, key: pages.publicKey }).from(pages).where(byId(pages, scope, pageId)).limit(1);
  const id = versionId ?? page?.v ?? null;
  const doc = id ? await versionDoc(scope, id) : null;
  return doc ? { doc, pageKey: page?.key ?? pageId } : null;
}

/**
 * The context of an order without a usable `capi_ctx` (purged, never sealed, a typed order): the page facts of the
 * order's version (its pixels, the lead content id, the market) and no client data. Null when no version is known.
 */
async function serverOnlyContextOf(scope: StoreScope, o: HookOrder): Promise<CapiContext | null> {
  const found = await orderDoc(scope, o.pageId, o.versionId);
  if (!found) return null;
  const { doc, pageKey } = found;
  const pixels = { meta: pixelIdList("meta", doc.tracking.metaPixelId), tiktok: pixelIdList("tiktok", doc.tracking.tiktokPixelId) };
  if (!pixels.meta.length && !pixels.tiktok.length) return null;
  const country = doc.market !== "INTL" && /^[A-Z]{2}$/.test(doc.market) ? doc.market : null;
  return serverOnlyContext({
    pageId: o.pageId,
    source: o.source === "export" || o.source === "php" ? "export" : "live",
    currency: o.currency,
    contentId: contentIdOf(doc, leadItem(doc), pageKey).slice(0, 200),
    contentName: (o.productName || doc.product.name).slice(0, 160),
    country,
    sourceUrl: cleanUrl(o.ref),
    pixels,
    qty: o.qty,
    itemsHash: itemsHashOf(o.items),
  });
}

export interface HookOutcome {
  moments: ConversionMoment[];
  enqueued: number;
  /** `capi_ctx` was nulled in the transaction */
  cleared: boolean;
  ctx: CapiPayload["ctx"] | null;
}

/** The moments a transition reaches (a confirmation, a delivery) and whether it ends the order's ad events. */
export function momentsOf(e: Extract<OrderHookEvent, { on: "transition" }>): { moments: ConversionMoment[]; ended: boolean } {
  const moments: ConversionMoment[] = [];
  let ended = false;
  for (const m of e.moves) {
    if (m.axis === "confirm" && m.to === "confirmed" && m.from !== "confirmed" && !moments.includes("confirmed")) moments.push("confirmed");
    if (m.axis === "ship" && m.to === "delivered" && m.from !== "delivered" && !moments.includes("delivered")) moments.push("delivered");
    // the ship axis ends without a delivery: no later moment exists (a terminal confirm state may reopen, OPE-§20.4 (5))
    if (m.axis === "ship" && (m.to === "refused" || m.to === "returned" || m.to === "lost")) ended = true;
  }
  return { moments: moments.sort((a, b) => (a === "confirmed" ? -1 : b === "confirmed" ? 1 : 0)), ended };
}

async function enqueueInTx(scope: WriteScope, items: Parameters<CapiDeps["enqueue"]>[1], tx: Tx): Promise<number> {
  if (!items.length) return 0;
  try {
    await capiDeps().enqueue(scope, items, { tx });
    return items.length;
  } catch (err) {
    // P8's outbox is the P0 stub: the order's change goes through, its events wait for the outbox (never a rollback)
    if (notBuiltYet(err)) return 0;
    throw err;
  }
}

/**
 * Hook `int.capi` on a transition (inTx; OPE-§20.4 (2)): a confirmation (→ `confirmed`) or a delivery (→ `delivered`)
 * enqueues the events of the matrix (the trigger's Purchase at any risk, the custom events), rebuilt from the sealed
 * context with time = `confirmed_at` / `delivered_at` and value = the current total, on the order's transaction handle
 * (a failure rolls the change back with no outbox row). Then `capi_ctx` is nulled once no later moment can send
 * (after the delivery, a refused / returned / lost ship, or a trigger and setting with nothing left). A test order
 * returns at once. A missing context sends the server fields only, and the payload says so (`ctx: "missing"`).
 */
export async function enqueueTransitionConversions(scope: WriteScope, e: Extract<OrderHookEvent, { on: "transition" }>, tx: Tx): Promise<HookOutcome> {
  const out: HookOutcome = { moments: [], enqueued: 0, cleared: false, ctx: null };
  if (e.after.isTest) return out;
  const { moments, ended } = momentsOf(e);
  out.moments = moments;
  if (!moments.length && !ended) return out;

  const o = await hookOrder(scope, e.after.id, tx);
  if (!o || o.isTest) return out;
  const settings = await getStoreSettings(scope, ["conversions", "tracking_secrets"]);
  const conv: Conversions = settings.conversions;
  const trigger = triggerFor(conv, o.pageId);
  const order = { id: o.id, isTest: o.isTest, honeypot: honeypotOf(o.flags), source: o.source, risk: o.risk };

  if (moments.length && !conversionsBlocked(order, conv.manualOrders) && (await capiFeatureOn(scope))) {
    const sealed = openCapiContext(scope, o.capiCtx);
    const ctx = sealed ?? (await serverOnlyContextOf(scope, o));
    out.ctx = sealed ? "sealed" : "missing";
    if (ctx) {
      const facts = { id: o.id, phone: o.phone, email: o.email, name: o.name, city: o.city, totalCents: centsOf(o.total), qty: o.qty, itemsHash: itemsHashOf(o.items), risk: o.risk };
      const items: Parameters<CapiDeps["enqueue"]>[1][number][] = [];
      for (const at of moments) {
        const planned = planConversionEvents({ trigger, customEvents: conv.customEvents, manualOrders: conv.manualOrders, order, at });
        if (!planned.length) continue;
        const time = (at === "confirmed" ? o.confirmedAt : o.deliveredAt) ?? new Date();
        const c = conversionFromContext(ctx, facts, { event: planned[0]!.event, time });
        if (!c.sourceUrl) c.sourceUrl = await storeFallbackUrl(scope, c).catch(() => null);
        items.push(...capiOutboxItems(c, planned, hasTokenIn(settings.tracking_secrets), out.ctx));
      }
      out.enqueued = await enqueueInTx(scope, items, tx);
    }
  }

  const reached: ConversionMoment = moments.includes("delivered") ? "delivered" : moments.includes("confirmed") ? "confirmed" : "created";
  const done = ended || moments.includes("delivered") || (moments.length > 0 && !eventsAfter(trigger, conv.customEvents, reached));
  if (done && o.capiCtx !== null) {
    // no rev bump: the context is bookkeeping (OD4); the same transaction as the items it served
    await tx.update(orders).set({ capiCtx: null }).where(byId(orders, scope, o.id));
    out.cleared = true;
  }
  return out;
}

/**
 * Hook `int.capi` on creation (inTx): public orders are the creation path's (`sendConversionsAfterResponse`; the dedupe
 * keys make a repeat harmless), so only a typed order (manual, WhatsApp) sends here, and only while
 * `conversions.manualOrders` is on (OD16): its `created` events, server fields only.
 */
export async function enqueueCreatedConversions(scope: WriteScope, row: OrderRow, tx: Tx): Promise<number> {
  if (row.isTest || (row.source !== "manual" && row.source !== "whatsapp")) return 0;
  const settings = await getStoreSettings(scope, ["conversions", "tracking_secrets"]);
  const conv = settings.conversions;
  const order = { id: row.id, isTest: row.isTest, honeypot: honeypotOf(row.flags), source: row.source, risk: row.riskScore };
  if (conversionsBlocked(order, conv.manualOrders)) return 0;
  const planned = planConversionEvents({ trigger: triggerFor(conv, row.pageId), customEvents: conv.customEvents, manualOrders: conv.manualOrders, order, at: "created" });
  if (!planned.length || !(await capiFeatureOn(scope))) return 0;
  const o = await hookOrder(scope, row.id, tx);
  const ctx = o ? await serverOnlyContextOf(scope, o) : null;
  if (!o || !ctx) return 0;
  const facts = { id: o.id, phone: o.phone, email: o.email, name: o.name, city: o.city, totalCents: centsOf(o.total), qty: o.qty, itemsHash: itemsHashOf(o.items), risk: o.risk };
  const c = conversionFromContext(ctx, facts, { event: "Purchase", time: o.createdAt });
  return enqueueInTx(scope, capiOutboxItems(c, planned, hasTokenIn(settings.tracking_secrets), "missing"), tx);
}

/* ------------------------------------------------------------------ */
/* ops.capi_ctx_purge (OPE-§20.4 (5), OPE-§J)                          */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;
/** a context is nulled once its order is 8 days old (the last event it can serve is 7 days − 1 h old by then) */
export const CAPI_CTX_KEEP_MS = 8 * DAY_MS;
/** the purge looks back this far (a missed day or an outage is caught up; older rows were purged before) */
export const CAPI_CTX_LOOKBACK_MS = 30 * DAY_MS;
const PURGE_BATCH = 500;

/**
 * Null `capi_ctx` of the store's orders created 8 to 30 days ago (`orders_store_created_idx`), 500 rows per statement
 * until none is left or the deadline passes. Answers the rows cleared and whether the store is done.
 */
export async function purgeCapiContexts(scope: WriteScope, opts: { now?: number; deadline?: number } = {}): Promise<{ cleared: number; done: boolean }> {
  const now = opts.now ?? Date.now();
  const deadline = opts.deadline ?? now + 1_000;
  const from = new Date(now - CAPI_CTX_LOOKBACK_MS);
  const until = new Date(now - CAPI_CTX_KEEP_MS);
  let cleared = 0;
  for (;;) {
    if (Date.now() > deadline) return { cleared, done: false };
    const [res] = await db
      .update(orders)
      .set({ capiCtx: null })
      .where(whereStore(orders, scope, and(gte(orders.createdAt, from), lt(orders.createdAt, until), isNotNull(orders.capiCtx))))
      .limit(PURGE_BATCH);
    const n = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    cleared += n;
    if (n < PURGE_BATCH) return { cleared, done: true };
  }
}

/* ------------------------------------------------------------------ */
/* the setting changed (OPE-§20.3)                                     */
/* ------------------------------------------------------------------ */

/**
 * The page ids of `ids` that are this store's (any status): a per-page trigger override may name only those, so another
 * store's page id reads as a missing one (core §E.3). Read by `saveConversionsAction` (≤ 200 overrides).
 */
export async function ownConversionPages(scope: StoreScope, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: pages.id }).from(pages).where(whereStore(pages, scope, inArray(pages.id, [...ids])));
  return new Set(rows.map((r) => r.id));
}

/**
 * After `conversions` was saved (step 8's `saveConversionsAction`): the live pages whose effective trigger changed are
 * re-rendered (`enqueueRenders(scope, ids, "conversions", 4)`: the thank-you page drops or regains the browser
 * Purchase), the store's health is marked dirty, and the change is audited (`integrations.conversions.changed`).
 */
export async function applyConversionsChange(
  scope: WriteScope,
  before: Conversions,
  next: Conversions,
  actor: Actor,
  opts: { stepUp?: "totp" | "password" } = {},
): Promise<{ pages: string[]; enqueued: number }> {
  const live = await db
    .select({ id: pages.id })
    .from(pages)
    .where(whereStore(pages, scope, eq(pages.status, "published"), isNotNull(pages.publishedVersionId)));
  const changed = live.map((p) => p.id).filter((id) => triggerFor(before, id) !== triggerFor(next, id));
  let enqueued = 0;
  if (changed.length) {
    try {
      enqueued = (await capiDeps().enqueueRenders(scope, changed, "conversions", 4)).enqueued;
    } catch (err) {
      if (!notBuiltYet(err)) throw err;
    }
  }
  await markHealthDirty(scope.storeId).catch((err: unknown) => console.error(`${LOG} markHealthDirty:`, errorSummary(err)));
  await auditIn(scope, actor, "integrations.conversions.changed", {
    meta: {
      trigger: next.purchaseTrigger,
      overrides: Object.keys(next.pageOverrides).length,
      customEvents: next.customEvents,
      manualOrders: next.manualOrders,
      pages: changed.length,
      // the save is a step-up-gated write under integrations.manage (§F.5 rev 4 meta.stepUp)
      ...(opts.stepUp ? { stepUp: opts.stepUp } : {}),
    },
  });
  return { pages: changed, enqueued };
}
