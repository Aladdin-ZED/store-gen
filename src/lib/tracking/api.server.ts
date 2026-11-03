import "server-only";
/**
 * `POST /api/public/track` (P3 LANDING; landing.md LAN-§9.1, §9.3, LD8, LD9; docs/STORE-SAAS.md §C.2, §C.9, §E.2, §E.8):
 * the request logic behind the thin route file, so it runs (and is tested) without Next's request scope.
 *
 *   lookup   { o, last4 }             the last 4 digits of the E.164 phone, compared in constant time
 *   proof    { o, k }                 the thank-you's proof: `orders.idem`, compared in constant time
 *   signed   { o, s }                 a signed link (checked inside `resolveOrderForTracking`)
 *   request  { o, auth, kind, text? } a shopper's request: one `customer_request` event + `order.customer_request`
 *   intent   { o, k, kind }           the thank-you's "confirm on WhatsApp": one `customer_confirm_intent` per order
 *
 * Order of checks: the body (≤ 4 KB, zod), the platform floor `p:track:ip:<h>` (30 / 10 min), the order → its store
 * (`resolveOrderForTracking`: active and restricted stores only), the effective host must be one of
 * `storeHosts(store)` and the Origin pass `checkOrigin`, the store's bucket `s:<sid>:track:ip:<h>` (10 / 10 min), then
 * the proof. A lookup (or a request proven by the 4 digits) of an order with 10 failed lookups today
 * (`s:<sid>:track:o:<hash(o)>`) is refused: then only the signed and proof links open it.
 *
 * Unknown order, wrong digits, wrong proof, another store's order (or host) and a non-servable store's order answer
 * the same bytes: 404 `{ ok: false, error: "not_found" }`. Every answer leaves after at least 150 ms. Requests never
 * change the order (LD9); once it left the warehouse, or with `landing.tracking.requests` off, they answer `closed`.
 */
import { IS_PROD, isInternalHost } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { storeLock, withNamedLock } from "@/lib/db/locks";
import { orderEvents } from "@/lib/db/schema";
import { effectiveHost, type EffectiveHost } from "@/lib/edge/host";
import { shopperLocaleOf } from "@/lib/landing/copy";
import { appendOrderEvent, type AppendOrderEventInput } from "@/lib/orders/events";
import { checkOrigin, clientContext, json, logError, readJson } from "@/lib/orders/http";
import { notify } from "@/lib/platform/notify";
import { addressOf } from "@/lib/render/store-context.server";
import { hashIp, hmac, safeEqual } from "@/lib/security/crypto";
import { platformBucket, rateLimit, rateLimitReached, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting } from "@/lib/settings";
import { publicApiAnswer, publicScope, resolveOrderForTracking, signTrackLink } from "@/lib/tenancy/public";
import { storeValues } from "@/lib/tenancy/sql";
import type { StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { storeHosts, type StoreAddress } from "@/lib/urls";
import { TrackRequest, type TrackRequestKind, type TrackResponse } from "./contract";
import { orderDocSource } from "./page.server";
import { pendingRequests, requestsOpen } from "./steps";
import { buildTrackView, hasConfirmIntent, loadTrackEvents, loadTrackOrder, type TrackOrderRow } from "./view.server";

/** Every answer leaves after at least this long (LAN-§9.3: no timing oracle between the failure classes). */
export const TRACK_MIN_MS = 150;
export const TRACK_BODY_MAX = 4 * 1024;
/** core §E.8, LAN Q37 */
export const TRACK_LIMITS = { floor: { limit: 30, windowSec: 600 }, store: { limit: 10, windowSec: 600 }, failed: { limit: 10, windowSec: 86_400 } } as const;

type Answer = { status: number; body: TrackResponse | { ok: false; error: "server" } };

const NOT_FOUND: Answer = { status: 404, body: { ok: false, error: "not_found" } };
const RATE_LIMITED: Answer = { status: 429, body: { ok: false, error: "rate_limited" } };
const CLOSED: Answer = { status: 409, body: { ok: false, error: "closed" } };
const invalid = (status: number): Answer => ({ status, body: { ok: false, error: "invalid" } });

/** The bucket key of an order id (a hash: bucket keys never carry an identifier a log reader could use). */
export const orderKey = (orderId: string) => hmac(orderId, "track-o").slice(0, 32);

/** The failed-lookup bucket of an order (10 per day). */
export const failedLookups = (scope: StoreScope, orderId: string) => storeBucket(scope, "track:o", orderKey(orderId));

/**
 * Does this host serve the store (LAN-§9.1)? One of `storeHosts(store)`; in development also a local platform host
 * (localhost, a LAN address), as `checkOrigin` accepts the request's own host there.
 */
export function hostServesStore(eff: EffectiveHost, store: StoreAddress): boolean {
  if (eff.cls !== "platform" && eff.cls !== "store" && eff.cls !== "legacy" && eff.cls !== "custom") return false;
  if (storeHosts(store).has(eff.host)) return true;
  return !IS_PROD && eff.cls === "platform" && eff.via === "direct" && isInternalHost(eff.host);
}

/** A run of 8+ digits (spaces, dots and dashes between) reads as a phone number: never stored in an event's meta. */
const PHONE_LIKE = /\+?\d(?:[\s.-]?\d){7,}/g;
const cleanText = (text: string | undefined) => (text ? text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(PHONE_LIKE, "•••").trim().slice(0, 300) : "");

/**
 * One event through operations' `appendOrderEvent` (the frozen door, LAN Q17). Until P4's body merges the stub throws
 * "not implemented": the same row is then written here through the scope (adapter, removed at P4's merge).
 */
export async function appendTrackEvent(scope: WriteScope, orderId: string, e: AppendOrderEventInput): Promise<boolean> {
  try {
    return (await appendOrderEvent(scope, orderId, e)).ok;
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("not implemented")) throw err;
    await db.insert(orderEvents).values(storeValues(scope, { orderId, actorKind: e.actorKind, actorId: e.actorId ?? null, type: e.type, meta: e.meta ?? null }));
    return true;
  }
}

/** The view and the signed parameter of an order the caller proved. */
async function viewAnswer(scope: StoreScope, store: StoreRow, order: TrackOrderRow, withLink: boolean): Promise<Answer> {
  const source = await orderDocSource(scope, store, order);
  const view = await buildTrackView(scope, order, { locale: shopperLocaleOf(source?.doc.locale ?? order.locale ?? store.defaultLocale), doc: source?.doc ?? null });
  return { status: 200, body: { ok: true, view, ...(withLink ? { s: signTrackLink(store.id, order.id) } : {}) } };
}

/** The last 4 digits, under the failed-lookup bucket: true when they match; a miss counts one failure. */
async function lastFourMatch(scope: StoreScope, order: TrackOrderRow, last4: string): Promise<boolean> {
  const bucket = failedLookups(scope, order.id);
  if (await rateLimitReached(bucket, TRACK_LIMITS.failed.limit)) return false;
  const digits = order.phone.replace(/\D/g, "");
  if (digits.length >= 4 && safeEqual(last4, digits.slice(-4))) return true;
  await rateLimit(bucket, TRACK_LIMITS.failed.limit, TRACK_LIMITS.failed.windowSec);
  return false;
}

async function request(scope: WriteScope, store: StoreRow, order: TrackOrderRow, kind: TrackRequestKind, text: string | undefined): Promise<Answer> {
  const landing = await getStoreSetting(scope, "landing");
  if (!landing.tracking.requests || !requestsOpen({ status: order.status, confirmState: order.confirmState, shipState: order.shipState })) return CLOSED;
  const events = await loadTrackEvents(scope, order.id);
  // one pending request per kind: a repeat is answered like the first, nothing more is written
  if (!pendingRequests(events).includes(kind)) {
    const clean = cleanText(text);
    await appendTrackEvent(scope, order.id, { actorKind: "customer", type: "customer_request", meta: { kind, ...(clean ? { text: clean } : {}) } });
    await notify({ audience: "store_role", storeId: store.id, roles: ["owner", "admin", "manager"] }, "order.customer_request", { orderId: order.id, request: kind });
    if (order.assigneeId) await notify({ audience: "user", userId: order.assigneeId, storeId: store.id }, "order.customer_request", { orderId: order.id, request: kind });
  }
  return viewAnswer(scope, store, (await loadTrackOrder(scope, order.id)) ?? order, false);
}

/**
 * One intent writer per order at a time, across processes: the clicks that arrive together wait on the order's named
 * lock (`storeLock`, 3 s), and each finds the first one's row (LAN-§9.3, the dedupe on the event type). A click that
 * cannot take the lock in time is answered like the others: the writer holding it records the intent.
 */
async function intent(scope: WriteScope, order: TrackOrderRow): Promise<Answer> {
  await withNamedLock(storeLock(scope.storeId, `ci.${order.id.toLowerCase()}`), 3, async () => {
    if (!(await hasConfirmIntent(scope, order.id))) {
      await appendTrackEvent(scope, order.id, { actorKind: "customer", type: "customer_confirm_intent", meta: { kind: "confirm_whatsapp" } });
    }
  });
  return { status: 200, body: { ok: true } };
}

async function answer(req: Request): Promise<Answer> {
  const body = await readJson(req, TRACK_BODY_MAX);
  if (!body.ok) return invalid(body.status);
  const parsed = TrackRequest.safeParse(body.value);
  if (!parsed.success) return invalid(422);
  const input = parsed.data;

  const ip = hashIp(clientContext(req).ip);
  if (!(await rateLimit(platformBucket("track:ip", ip), TRACK_LIMITS.floor.limit, TRACK_LIMITS.floor.windowSec)).ok) return RATE_LIMITED;

  const sig = input.op === "signed" ? input.s : input.op === "request" && "s" in input.auth ? input.auth.s : null;
  const target = await resolveOrderForTracking(input.o, sig);
  if (!target || publicApiAnswer(target.store.status, "track") !== "open") return NOT_FOUND;
  const address = addressOf(target.store);
  if (!hostServesStore(effectiveHost(req.headers), address) || !checkOrigin(req, { store: address, allowedOrigins: null }).ok) return NOT_FOUND;
  // a public WriteScope of the order's store (the shopper's request and intent are appended through it)
  const scope = publicScope(target.store);
  if (!(await rateLimit(storeBucket(scope, "track:ip", ip), TRACK_LIMITS.store.limit, TRACK_LIMITS.store.windowSec)).ok) return RATE_LIMITED;

  const order = await loadTrackOrder(scope, input.o);
  if (!order) return NOT_FOUND;
  switch (input.op) {
    case "lookup":
      return (await lastFourMatch(scope, order, input.last4)) ? viewAnswer(scope, target.store, order, true) : NOT_FOUND;
    case "proof":
      return safeEqual(input.k, order.idem) ? viewAnswer(scope, target.store, order, true) : NOT_FOUND;
    case "signed":
      return viewAnswer(scope, target.store, order, false);
    case "request": {
      const auth = input.auth;
      const proven = "s" in auth ? true : "k" in auth ? safeEqual(auth.k, order.idem) : await lastFourMatch(scope, order, auth.last4);
      return proven ? request(scope, target.store, order, input.kind, input.text) : NOT_FOUND;
    }
    case "intent":
      return safeEqual(input.k, order.idem) ? intent(scope, order) : NOT_FOUND;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The route's whole body: the answer, at least `TRACK_MIN_MS` after the request arrived. */
export async function handleTrackApi(req: Request): Promise<Response> {
  const start = Date.now();
  let out: Answer;
  try {
    out = await answer(req);
  } catch (err) {
    logError("api/track", err);
    out = { status: 500, body: { ok: false, error: "server" } };
  }
  const left = TRACK_MIN_MS - (Date.now() - start);
  if (left > 0) await sleep(left);
  return json(out.body, out.status);
}
