/**
 * Server-side conversion events — the pure core: no database, no Next.js (unit-testable with a
 * mocked fetch, see scripts/qa/conversions-check.ts).
 *
 *   purchaseConversion(order…)            the Purchase event of a fresh order (or null): the pixels of
 *                                         the VERSION the order was validated against, contents per
 *                                         item from allocate() (docs/OFFERS.md §G.7)
 *   dispatchPurchase(event, secrets, lib) Meta Conversions API + TikTok Events API, one request per
 *                                         pixel that has ITS OWN server token; the test code only
 *                                         inside an active test window of the event's page; never throws
 *   sendTestEvent(…)                      Settings → Pixels "Send test event" (test_event_code only)
 *   triggerFor(conversions, pageId)       the page's Purchase trigger: the one rule the browser and the server follow
 *   planConversionEvents(…)               which events an order sends at creation, confirmation and delivery
 *                                         (operations.md OPE-§20.2), and the outbox items, the 7-day guard and the
 *                                         sealed context they are rebuilt from (OPE-§20.4; R1 P5)
 *
 * Deduplication with the browser pixels (src/landing/runtime/pixels.ts): the same event names
 * (PIXEL_EVENTS) and event_id = purchaseEventId(orderId) — the order id the thank-you page reports
 * as Meta eventID / TikTok event_id / Snap client_dedup_id.
 *
 * Customer data is normalized and SHA-256 hashed here (phone in E.164 — Morocco +212…, name,
 * e-mail, city, country); only the client IP, the user agent and the platforms' own browser / click
 * ids (fbp, fbc, ttp, ttclid) travel in clear, as both APIs require. Tokens go in the request body
 * (Meta) or a header (TikTok), never in a URL, and never in logs or results.
 */
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type { OutboxItem } from "@/lib/jobs/outbox";
import { contentIdOf, expandUnits, itemById, leadItem } from "@/lib/page/catalog";
import { allocate, bumpOffered, fromCents, round2, toCents } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { PIXEL_EVENTS, PIXEL_NAMES, pixelIdList, purchaseEventId, type ServerPlatform } from "@/lib/pixels/ids";
import { testWindow, type PixelLibrary } from "@/lib/pixels/library";
import type { ConversionsSetting } from "@/lib/settings/keys/conversions";
import type { PixelHealthEntry, SettingValue } from "@/lib/settings/schemas";
import type { OrderPayload } from "./contract";
import type { PageTarget } from "./resolve";
import type { ValidOrder } from "./validate";

/** Meta Graph API version for the Conversions API — the one place to bump it (v26.0: July 2026). */
export const META_GRAPH_API_VERSION = "v26.0";
export const META_PURCHASE_EVENT = PIXEL_EVENTS.meta.purchase;
export const TIKTOK_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
/** Equal to the browser pixel's purchase event (deduplication): TikTok's current "Purchase". */
export const TIKTOK_PURCHASE_EVENT = PIXEL_EVENTS.tiktok.purchase;

/**
 * Orders scoring this high (scoreRisk: bot user agent, instant submit, repeated IP…) are kept out of
 * the ad platforms' optimisation. They are still stored and shown to the call center.
 */
export const CONVERSION_MAX_RISK = 70;

const REQUEST_TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 1_200;

export type TrackingSecrets = SettingValue<"tracking_secrets">;

/**
 * The Purchase trigger of a page (operations.md OPE Q.6, OD18; P0b, CCR P5-11): its `pageOverrides` entry, else the
 * store's `purchaseTrigger`. The one rule both sides follow: the thank-you page fires the browser Purchase exactly when
 * this is "order" (`purchaseInBrowserFor`, src/lib/render/store-context.server.ts), and the server sends it at this
 * trigger otherwise, so a Purchase is never counted twice nor lost.
 */
export function triggerFor(conversions: ConversionsSetting, pageId: string | null): ConversionsSetting["purchaseTrigger"] {
  return (pageId ? conversions.pageOverrides[pageId] : undefined) ?? conversions.purchaseTrigger;
}

/** One line of the event's contents: a content id, its units and the average paid price per unit. */
export interface ContentLine {
  id: string;
  quantity: number;
  /** currency units (2 decimals): Σ allocated cents of those units / quantity */
  itemPrice: number;
}

export interface PurchaseConversion {
  orderId: string;
  /** browser ↔ server deduplication key = purchaseEventId(orderId) */
  eventId: string;
  pageId: string;
  /** live page (slug fallback for the event URL) or connected export */
  source: "live" | "export";
  time: Date;
  /** order total (server-computed), currency of the page */
  value: number;
  currency: string;
  /** units of the offer (free units included) */
  qty: number;
  /** units + the bump when taken (num_items); absent → qty */
  numItems?: number;
  /** the lead item's content id */
  contentId: string;
  /** per content id (offer units from allocate(), free units at 0, the bump item at the bump price); absent → one line */
  contents?: ContentLine[];
  /** product name (single-item page) or the offer label */
  contentName: string;
  customer: {
    /** E.164 "+212612345678" */
    phone: string;
    email: string | null;
    name: string;
    city: string | null;
    /** ISO 3166-1 alpha-2 */
    country: string | null;
  };
  client: { ip: string | null; ua: string | null; fbp?: string; fbc?: string; ttclid?: string; ttp?: string };
  /** page URL the order came from (validated http(s)), else null */
  sourceUrl: string | null;
  /** the validated version's pixel ids (server events go to those with their own token) */
  pixels: { meta: string[]; tiktok: string[] };
  /** the order's risk score (R1 P5): `planConversionEvents` applies the gate to trigger `order` at creation only (OD19) */
  risk?: number;
}

/* ------------------------------------------------------------------ */
/* building the event (inside createOrder)                             */
/* ------------------------------------------------------------------ */

const FBP_RE = /^fb\.[0-9]\.[0-9]{10,16}\.[0-9]{1,30}$/;
const FBC_RE = /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_\-.]{8,480}$/;
const TT_ID_RE = /^[A-Za-z0-9_\-.:|]{8,500}$/;

/** http(s) URL without credentials or fragment, else null (the order's `ref` is client-supplied). */
export function cleanUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.username = "";
    u.password = "";
    u.hash = "";
    const s = u.toString();
    return s.length <= 500 ? s : null;
  } catch {
    return null;
  }
}

/** Country the order ships to: the page market, else the phone's country. */
function orderCountry(doc: PageDoc, phoneCountry: string): string | null {
  const cc = doc.market !== "INTL" ? doc.market : phoneCountry;
  return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

/**
 * Contents of an order per content id (§G.7): each unit's share of the offer price from allocate()
 * (free units 0, surcharges on their unit) under its item's content id; a choice unit not resolved
 * counts as the first available choice of its line; the bump item at the bump price.
 */
export function orderContents(
  doc: PageDoc,
  order: Pick<ValidOrder, "offer" | "selection" | "totals">,
  pageKey: string,
): { contents: ContentLine[]; numItems: number } {
  const slots = expandUnits(order.offer, doc.items);
  const cents = allocate(doc, order.offer, order.selection);
  const acc = new Map<string, { q: number; c: number }>();
  const add = (id: string, c: number) => {
    const cur = acc.get(id) ?? { q: 0, c: 0 };
    acc.set(id, { q: cur.q + 1, c: cur.c + c });
  };
  slots.forEach((s, k) => {
    const itemId = s.item ?? order.selection.units[k]?.item ?? s.available?.[0] ?? s.choices?.[0] ?? "";
    add(contentIdOf(doc, itemById(doc, itemId) ?? leadItem(doc), pageKey), cents[k] ?? 0);
  });
  const bump = doc.offers.orderBump;
  const tookBump = order.selection.bump && bumpOffered(doc, order.offer.id) && order.totals.bump > 0;
  const bumpItem = tookBump && bump?.item ? itemById(doc, bump.item) : undefined;
  if (bumpItem) add(contentIdOf(doc, bumpItem, pageKey), order.totals.bump);
  const contents = [...acc].map(([id, { q, c }]) => ({ id, quantity: q, itemPrice: round2(fromCents(c) / q) }));
  return { contents, numItems: slots.length + (tookBump ? 1 : 0) };
}

/**
 * The Purchase event of a freshly stored order, or null when the page has no Meta/TikTok pixel or the
 * order looks automated. `target.doc` is the version the order was validated against: its pixels are the
 * ones the shopper's browser fired. A risky order (≥ CONVERSION_MAX_RISK) gets no event here, so none of
 * its client data is sealed either; an agent's confirmation still sends its trigger's events (OD19), from
 * the server fields only (src/lib/orders/conversions.ts; CCR r1-p5-10 proposes keeping the context).
 */
export function purchaseConversion(input: {
  orderId: string;
  createdAt: Date;
  payload: OrderPayload;
  order: Pick<ValidOrder, "totals" | "items" | "offer" | "selection" | "phone" | "email" | "name" | "city">;
  target: Pick<PageTarget, "doc" | "pageId" | "source">;
  riskScore: number;
  ip: string;
  ua: string | null;
}): PurchaseConversion | null {
  const { payload, order, target } = input;
  const { doc } = target;
  const pixels = { meta: pixelIdList("meta", doc.tracking.metaPixelId), tiktok: pixelIdList("tiktok", doc.tracking.tiktokPixelId) };
  if (!pixels.meta.length && !pixels.tiktok.length) return null;
  if (input.riskScore >= CONVERSION_MAX_RISK) return null;

  const ip = input.ip && isIP(input.ip) && input.ip !== "0.0.0.0" && input.ip !== "::" ? input.ip : null;
  const fbp = payload.fbp && FBP_RE.test(payload.fbp) ? payload.fbp : undefined;
  const fbc = payload.fbc && FBC_RE.test(payload.fbc) ? payload.fbc : undefined;
  const ttclid = payload.utm.ttclid && TT_ID_RE.test(payload.utm.ttclid) ? payload.utm.ttclid : undefined;
  const ttp = payload.ttp && TT_ID_RE.test(payload.ttp) ? payload.ttp : undefined;
  const { contents, numItems } = orderContents(doc, order, payload.pageKey);
  const label = order.items.bundleLabel?.trim();

  return {
    orderId: input.orderId,
    eventId: purchaseEventId(input.orderId),
    pageId: target.pageId,
    source: target.source,
    time: input.createdAt,
    value: round2(fromCents(order.totals.total)),
    currency: doc.currency,
    qty: order.items.qty,
    numItems,
    // same content id as the browser pixel (runtime config: lead item sku || pageKey)
    contentId: contentIdOf(doc, leadItem(doc), payload.pageKey),
    contents,
    contentName: (doc.items.length > 1 && label ? label : doc.product.name).slice(0, 160),
    customer: {
      phone: order.phone.e164,
      email: order.email || null,
      name: order.name,
      city: order.city && order.city !== "Autre" ? order.city : null,
      country: orderCountry(doc, order.phone.country),
    },
    client: {
      ip,
      ua: input.ua,
      ...(fbp ? { fbp } : {}),
      ...(fbc ? { fbc } : {}),
      ...(ttclid ? { ttclid } : {}),
      ...(ttp ? { ttp } : {}),
    },
    sourceUrl: cleanUrl(payload.ref),
    pixels,
    risk: input.riskScore,
  };
}

/* ------------------------------------------------------------------ */
/* credentials                                                         */
/* ------------------------------------------------------------------ */

export interface ServerCredential {
  token: string;
  /** the platform's "Test events" code: set only inside an active test window of the event's page */
  testCode?: string;
}

/** The pixel's own server token ("" = none). The legacy single tokens are never read (§A.2 #3). */
export function ownToken(s: TrackingSecrets, platform: ServerPlatform, pixelId: string): string {
  return (platform === "meta" ? s.metaTokens : s.tiktokTokens)?.[pixelId] ?? "";
}

/** The pixel's saved test event code ("" = none). Saved is not active: see serverCredentials. */
export function savedTestCode(s: TrackingSecrets, platform: ServerPlatform, pixelId: string): string {
  return (platform === "meta" ? s.metaTestCodes : s.tiktokTestCodes)?.[pixelId] ?? "";
}

/**
 * The token (and test code) a server event of this pixel for this page uses, or null (browser only):
 * the pixel's own token (no legacy fallback); its saved test code only while the pixel has an active
 * test window for `pageId` (another page firing the same pixel sends production events).
 */
export function serverCredentials(
  s: TrackingSecrets,
  library: PixelLibrary | null | undefined,
  platform: ServerPlatform,
  pixelId: string,
  pageId: string | null,
  now: number = Date.now(),
): ServerCredential | null {
  const token = ownToken(s, platform, pixelId);
  if (!token) return null;
  const code = savedTestCode(s, platform, pixelId);
  const testing = !!code && !!pageId && !!testWindow(library, platform, pixelId, pageId, now);
  return { token, ...(testing ? { testCode: code } : {}) };
}

/* ------------------------------------------------------------------ */
/* normalization + hashing                                             */
/* ------------------------------------------------------------------ */

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Lowercase, letters only (Meta fn/ln: no punctuation, no spaces; UTF-8 kept for Arabic names). */
const lettersOnly = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");

/** Meta ct: lowercase, no accents, no spaces or punctuation ("Fès" → "fes", "Beni Mellal" → "benimellal"). */
const cityKey = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");

const emailKey = (s: string | null) => {
  const e = s?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+$/.test(e) ? e : null;
};

export interface HashedCustomer {
  /** digits with country code, no "+" (Meta ph) */
  phoneDigits: string;
  /** E.164 with "+" (TikTok phone) */
  phoneE164: string;
  email: string | null;
  fn: string | null;
  ln: string | null;
  city: string | null;
  country: string | null;
}

export function hashCustomer(c: PurchaseConversion["customer"]): HashedCustomer {
  const digits = c.phone.replace(/[^0-9]/g, "");
  const [first = "", ...rest] = c.name.trim().split(/\s+/);
  const fn = lettersOnly(first);
  const ln = lettersOnly(rest.join(" "));
  const email = emailKey(c.email);
  const city = c.city ? cityKey(c.city) : "";
  return {
    phoneDigits: sha256(digits),
    phoneE164: sha256(`+${digits}`),
    email: email ? sha256(email) : null,
    fn: fn ? sha256(fn) : null,
    ln: ln ? sha256(ln) : null,
    city: city ? sha256(city) : null,
    country: c.country ? sha256(c.country.toLowerCase()) : null,
  };
}

/* ------------------------------------------------------------------ */
/* request bodies                                                      */
/* ------------------------------------------------------------------ */

const unitPrice = (c: PurchaseConversion) => round2(c.value / Math.max(1, c.qty));

/** The event's contents (events without contents: one line at the average price). */
const contentsOf = (c: PurchaseConversion): ContentLine[] =>
  c.contents?.length ? c.contents : [{ id: c.contentId, quantity: c.qty, itemPrice: unitPrice(c) }];
const contentIds = (c: PurchaseConversion) => contentsOf(c).map((x) => x.id);

/** Meta Conversions API body of a Purchase (access_token added at send time). */
export function metaPurchaseBody(c: PurchaseConversion, h: HashedCustomer, testCode?: string): Record<string, unknown> {
  const userData: Record<string, unknown> = {
    ph: [h.phoneDigits],
    ...(h.email ? { em: [h.email] } : {}),
    ...(h.fn ? { fn: [h.fn] } : {}),
    ...(h.ln ? { ln: [h.ln] } : {}),
    ...(h.city ? { ct: [h.city] } : {}),
    ...(h.country ? { country: [h.country] } : {}),
    ...(c.client.ip ? { client_ip_address: c.client.ip } : {}),
    ...(c.client.ua ? { client_user_agent: c.client.ua } : {}),
    ...(c.client.fbp ? { fbp: c.client.fbp } : {}),
    ...(c.client.fbc ? { fbc: c.client.fbc } : {}),
  };
  return {
    data: [
      {
        event_name: META_PURCHASE_EVENT,
        event_time: Math.floor(c.time.getTime() / 1000),
        event_id: c.eventId,
        action_source: "website",
        ...(c.sourceUrl ? { event_source_url: c.sourceUrl } : {}),
        user_data: userData,
        custom_data: {
          currency: c.currency,
          value: c.value,
          content_ids: contentIds(c),
          content_type: "product",
          content_name: c.contentName,
          contents: contentsOf(c).map((x) => ({ id: x.id, quantity: x.quantity, item_price: x.itemPrice })),
          num_items: c.numItems ?? c.qty,
          order_id: c.orderId,
        },
      },
    ],
    ...(testCode ? { test_event_code: testCode } : {}),
  };
}

/** TikTok Events API (v1.3 event/track) body of a Purchase. */
export function tiktokPurchaseBody(c: PurchaseConversion, h: HashedCustomer, pixelCode: string, testCode?: string): Record<string, unknown> {
  const user: Record<string, unknown> = {
    phone: h.phoneE164,
    ...(h.email ? { email: h.email } : {}),
    ...(c.client.ttclid ? { ttclid: c.client.ttclid } : {}),
    ...(c.client.ttp ? { ttp: c.client.ttp } : {}),
    ...(c.client.ip ? { ip: c.client.ip } : {}),
    ...(c.client.ua ? { user_agent: c.client.ua } : {}),
  };
  return {
    event_source: "web",
    event_source_id: pixelCode,
    ...(testCode ? { test_event_code: testCode } : {}),
    data: [
      {
        event: TIKTOK_PURCHASE_EVENT,
        event_time: Math.floor(c.time.getTime() / 1000),
        event_id: c.eventId,
        user,
        ...(c.sourceUrl ? { page: { url: c.sourceUrl } } : {}),
        properties: {
          contents: contentsOf(c).map((x) => ({ content_id: x.id, content_type: "product", content_name: c.contentName, quantity: x.quantity, price: x.itemPrice })),
          content_type: "product",
          content_ids: contentIds(c),
          currency: c.currency,
          value: c.value,
          order_id: c.orderId,
        },
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* transport                                                           */
/* ------------------------------------------------------------------ */

interface HttpOutcome {
  ok: boolean;
  retry: boolean;
  /** HTTP status, null on network errors / timeouts */
  status: number | null;
  json: Record<string, unknown> | null;
  /** one-line description for logs (never request data) */
  detail: string;
}

/** Short, single-line text from an API answer. */
const tidy = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 300);

/** The JSON object of an API answer, else null (never throws). */
export async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await res.json();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** POST JSON with a timeout; retries network errors, 429 and 5xx (`attempts` in total). Never throws. */
async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  accept: (status: number, json: Record<string, unknown> | null) => boolean,
  describe: (status: number, json: Record<string, unknown> | null) => string,
  attempts: number,
): Promise<HttpOutcome> {
  let last: HttpOutcome = { ok: false, retry: false, status: null, json: null, detail: "not sent" };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
        redirect: "error",
      });
      const json = await readJson(res);
      const ok = accept(res.status, json);
      last = { ok, retry: !ok && (res.status === 429 || res.status >= 500), status: res.status, json, detail: ok ? "" : describe(res.status, json) };
    } catch (err) {
      last = { ok: false, retry: true, status: null, json: null, detail: err instanceof Error ? `${err.name}: ${err.message}` : "network error" };
    }
    if (last.ok || !last.retry || attempt === attempts) return last;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  return last;
}

const metaAccept = (status: number, json: Record<string, unknown> | null): boolean =>
  status >= 200 && status < 300 && !!json && typeof json.events_received === "number" && json.events_received > 0;

export const metaDescribe = (status: number, json: Record<string, unknown> | null) => {
  const error = (json?.error ?? null) as { message?: unknown; code?: unknown; error_subcode?: unknown } | null;
  return `HTTP ${status}${error ? ` code ${tidy(error.code)}${error.error_subcode ? `/${tidy(error.error_subcode)}` : ""}: ${tidy(error.message)}` : ""}`;
};

// the Business API answers HTTP 200 with a non-zero `code` on errors
const tiktokAccept = (status: number, json: Record<string, unknown> | null): boolean => status >= 200 && status < 300 && !!json && json.code === 0;

/** Did the platform take the event (Meta: `events_received` > 0; TikTok: `code` 0 on a 2xx)? */
export const acceptedBy = (platform: ServerPlatform, status: number, json: Record<string, unknown> | null): boolean =>
  platform === "meta" ? metaAccept(status, json) : tiktokAccept(status, json);

/** The Conversions API endpoint of a Meta pixel (dataset). */
export const metaEventsUrl = (pixelId: string): string => `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events`;

export const tiktokDescribe = (status: number, json: Record<string, unknown> | null) => `HTTP ${status}${json ? ` code ${tidy(json.code)}: ${tidy(json.message)}` : ""}`;

function sendMeta(body: Record<string, unknown>, pixelId: string, token: string, attempts: number): Promise<HttpOutcome> {
  const url = metaEventsUrl(pixelId);
  // in the body, not the URL: tokens never end up in URL logs
  return post(url, {}, { ...body, access_token: token }, metaAccept, metaDescribe, attempts);
}

function sendTikTok(body: Record<string, unknown>, token: string, attempts: number): Promise<HttpOutcome> {
  return post(TIKTOK_EVENTS_URL, { "Access-Token": token }, body, tiktokAccept, tiktokDescribe, attempts);
}

/* ------------------------------------------------------------------ */
/* dispatch                                                            */
/* ------------------------------------------------------------------ */

export type HealthCode = NonNullable<PixelHealthEntry["code"]>;

export interface ConversionResult {
  platform: ServerPlatform;
  pixelId: string;
  ok: boolean;
  /** failure description (no request data, no token) */
  detail?: string;
  /** failure class for pixel_health (§A.5) */
  code?: HealthCode;
  testMode: boolean;
}

const META_TOKEN_CODES = new Set([102, 190, 463, 467]);
const META_PERMISSION_CODES = new Set([3, 10, 200, 210, 294]);
const META_RATE_CODES = new Set([4, 17, 32, 613, 80004]);
const TIKTOK_TOKEN_CODES = new Set([40104, 40105, 40106]);
const TIKTOK_RATE_CODES = new Set([40100, 40133, 51021]);

/** The health class of a failed send (token · permission · pixel · rate · network · other). */
export function failureCode(platform: ServerPlatform, status: number | null, json: Record<string, unknown> | null): HealthCode {
  if (status === null) return "network";
  if (status === 429) return "rate";
  if (platform === "meta") {
    const err = (json?.error ?? null) as { code?: unknown; message?: unknown } | null;
    const code = Number(err?.code);
    const msg = String(err?.message ?? "").toLowerCase();
    if (META_TOKEN_CODES.has(code) || status === 401) return "token";
    if (META_RATE_CODES.has(code)) return "rate";
    if (META_PERMISSION_CODES.has(code) || (code >= 200 && code < 300) || status === 403) return "permission";
    if (code === 100 && /pixel|dataset|object|does not exist|unsupported/.test(msg)) return "pixel";
    if (status >= 500) return "network";
    return "other";
  }
  const code = Number(json?.code);
  const msg = String(json?.message ?? "").toLowerCase();
  if (TIKTOK_TOKEN_CODES.has(code) || /access.?token/.test(msg) || status === 401) return "token";
  if (TIKTOK_RATE_CODES.has(code)) return "rate";
  if (code === 40001 || /permission|authori[sz]/.test(msg) || status === 403) return "permission";
  if (/pixel/.test(msg)) return "pixel";
  if (status >= 500) return "network";
  return "other";
}

/**
 * Send the order's Purchase to every pixel of the validated version that has its own server token
 * (one request per pixel, all in parallel, each with one retry). The test code rides along only
 * inside an active test window of the event's page. Never throws.
 */
export async function dispatchPurchase(
  c: PurchaseConversion,
  secrets: TrackingSecrets,
  library: PixelLibrary | null = null,
  now: number = Date.now(),
): Promise<ConversionResult[]> {
  const jobs: Promise<ConversionResult>[] = [];
  let hashed: HashedCustomer | null = null;
  const h = () => (hashed ??= hashCustomer(c.customer));
  const result = (platform: ServerPlatform, pixelId: string, testMode: boolean, o: HttpOutcome): ConversionResult => ({
    platform,
    pixelId,
    ok: o.ok,
    testMode,
    ...(o.ok ? {} : { detail: o.detail, code: failureCode(platform, o.status, o.json) }),
  });
  for (const pixelId of c.pixels.meta) {
    const cred = serverCredentials(secrets, library, "meta", pixelId, c.pageId, now);
    if (!cred) continue;
    jobs.push(sendMeta(metaPurchaseBody(c, h(), cred.testCode), pixelId, cred.token, 2).then((o) => result("meta", pixelId, !!cred.testCode, o)));
  }
  for (const pixelId of c.pixels.tiktok) {
    const cred = serverCredentials(secrets, library, "tiktok", pixelId, c.pageId, now);
    if (!cred) continue;
    jobs.push(sendTikTok(tiktokPurchaseBody(c, h(), pixelId, cred.testCode), cred.token, 2).then((o) => result("tiktok", pixelId, !!cred.testCode, o)));
  }
  try {
    return await Promise.all(jobs);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* the trigger matrix, the outbox items, the 7-day guard (R1 P5)       */
/* ------------------------------------------------------------------ */

export type PurchaseTrigger = ConversionsSetting["purchaseTrigger"];
/** The moments an order can produce server events (OPE-§20.2), in order. */
export const CONVERSION_MOMENTS = ["created", "confirmed", "delivered"] as const;
export type ConversionMoment = (typeof CONVERSION_MOMENTS)[number];

/** The server events (OD18): the Purchase at the page's trigger, Meta's custom events at the other moments. */
export const SERVER_EVENTS = ["Purchase", "ConfirmedOrder", "DeliveredOrder"] as const;
export type ServerEvent = (typeof SERVER_EVENTS)[number];

/** Order sources an agent typed (OD16): their events go out only while `conversions.manualOrders` is on. */
export const MANUAL_SOURCES: readonly string[] = ["manual", "whatsapp"];

/** Purchase = the order id (the thank-you page's browser event id), ConfirmedOrder "<id>.c", DeliveredOrder "<id>.d". */
export function serverEventId(orderId: string, event: ServerEvent): string {
  return event === "Purchase" ? purchaseEventId(orderId) : `${orderId}.${event === "ConfirmedOrder" ? "c" : "d"}`;
}

/** The name the platform receives: Meta's Purchase name (PIXEL_EVENTS) or the custom event's own name. */
export const metaEventName = (event: ServerEvent): string => (event === "Purchase" ? META_PURCHASE_EVENT : event);

export interface PlannedEvent {
  event: ServerEvent;
  eventId: string;
  /** TikTok receives the Purchase only (OPE-§20.5: its custom events are R3 [verify]) */
  platforms: readonly ServerPlatform[];
}

/** What the plan reads of an order. */
export interface PlanOrder {
  id: string;
  isTest: boolean;
  /** a honeypot row (`flags` holds "honeypot") */
  honeypot?: boolean;
  source: string;
  risk: number;
}

const BOTH: readonly ServerPlatform[] = ["meta", "tiktok"];
const META_ONLY: readonly ServerPlatform[] = ["meta"];

/** The events of one moment for a trigger and the custom-event switch, before the order's own gates. */
function momentEvents(trigger: PurchaseTrigger, customEvents: boolean, at: ConversionMoment): ServerEvent[] {
  if (at === "created") return trigger === "order" ? ["Purchase"] : [];
  if (trigger === at) return ["Purchase"];
  return customEvents ? [at === "confirmed" ? "ConfirmedOrder" : "DeliveredOrder"] : [];
}

/** Test orders, honeypot rows and (unless `manualOrders`) typed orders never send anything (OPE-§20.2, §26, D54). */
export function conversionsBlocked(order: Pick<PlanOrder, "isTest" | "honeypot" | "source">, manualOrders: boolean): boolean {
  return order.isTest || !!order.honeypot || (!manualOrders && MANUAL_SOURCES.includes(order.source));
}

/**
 * The server events an order sends at one moment (OPE-§20.2's matrix):
 *
 *   trigger     created             confirmed                     delivered
 *   order       Purchase (risk<70)  ConfirmedOrder (Meta, custom) DeliveredOrder (Meta, custom)
 *   confirmed   -                   Purchase (any risk, OD19)     DeliveredOrder (Meta, custom)
 *   delivered   -                   ConfirmedOrder (Meta, custom) Purchase
 *
 * "custom" = only while `customEvents` is on. Nothing for a test order, a honeypot row, or a typed order unless
 * `manualOrders`. The risk gate (`CONVERSION_MAX_RISK`) is trigger `order`'s at creation only: a confirmation lifts it.
 */
export function planConversionEvents(input: {
  trigger: PurchaseTrigger;
  customEvents: boolean;
  manualOrders: boolean;
  order: PlanOrder;
  at: ConversionMoment;
}): PlannedEvent[] {
  const { order, at } = input;
  if (conversionsBlocked(order, input.manualOrders)) return [];
  return momentEvents(input.trigger, input.customEvents, at)
    .filter((e) => !(e === "Purchase" && at === "created" && order.risk >= CONVERSION_MAX_RISK))
    .map((event) => ({ event, eventId: serverEventId(order.id, event), platforms: event === "Purchase" ? BOTH : META_ONLY }));
}

/** Can a moment after `reached` still produce an event (so the sealed context must be kept)? */
export function eventsAfter(trigger: PurchaseTrigger, customEvents: boolean, reached: ConversionMoment): boolean {
  const later = CONVERSION_MOMENTS.slice(CONVERSION_MOMENTS.indexOf(reached) + 1);
  return later.some((m) => momentEvents(trigger, customEvents, m).length > 0);
}

const HOUR_MS = 3_600_000;
/** OD20, core §H.1: an event older than 7 days minus 1 hour at send time is never sent (`capi_stale`). */
export const CAPI_MAX_AGE_MS = 7 * 24 * HOUR_MS - HOUR_MS;

/** Is the event too old to send (event_time < now - 7 d + 1 h)? */
export function isStale(eventTime: Date | number, now: number = Date.now()): boolean {
  const t = typeof eventTime === "number" ? eventTime : eventTime.getTime();
  return !Number.isFinite(t) || t < now - CAPI_MAX_AGE_MS;
}

/** The conversion as an outbox payload carries it (JSON: the time as an ISO string). */
export type WireConversion = Omit<PurchaseConversion, "time"> & { time: string };
export const toWire = (c: PurchaseConversion): WireConversion => ({ ...c, time: c.time.toISOString() });
export const fromWire = (w: WireConversion): PurchaseConversion => ({ ...w, time: new Date(w.time) });

/** The payload of a `capi` outbox item (OPE-§20.4 (3)); sealed (`pii: true`), never logged. */
export interface CapiPayload {
  platform: ServerPlatform;
  pixelId: string;
  event: ServerEvent;
  eventId: string;
  /** ISO time of the event (the 7-day guard reads it) */
  eventTime: string;
  conversion: WireConversion;
  /** where the conversion came from: built at creation, rebuilt from the sealed context, or server fields only */
  ctx: "created" | "sealed" | "missing";
}

/** "capi:<platform>:<pixelId>:<orderId>:<event>": unique across every state (ENGC-29). */
export const capiDedupeKey = (platform: ServerPlatform, pixelId: string, orderId: string, event: ServerEvent): string =>
  `capi:${platform}:${pixelId}:${orderId}:${event}`;

/**
 * One `capi` outbox item per planned event and per pixel of the conversion that has its own server token
 * (`hasToken`; pixels without one stay browser-only). The event's id is set per event; `c.time` is its time.
 */
export function capiOutboxItems(
  c: PurchaseConversion,
  events: readonly PlannedEvent[],
  hasToken: (platform: ServerPlatform, pixelId: string) => boolean,
  ctx: CapiPayload["ctx"],
): OutboxItem<CapiPayload>[] {
  const items: OutboxItem<CapiPayload>[] = [];
  for (const e of events) {
    for (const platform of e.platforms) {
      for (const pixelId of c.pixels[platform]) {
        if (!hasToken(platform, pixelId)) continue;
        const conversion = toWire({ ...c, eventId: e.eventId });
        items.push({
          kind: "capi",
          topic: e.event,
          targetId: `${platform}:${pixelId}`,
          dedupeKey: capiDedupeKey(platform, pixelId, c.orderId, e.event),
          pii: true,
          payload: { platform, pixelId, event: e.event, eventId: e.eventId, eventTime: conversion.time, conversion, ctx },
        });
      }
    }
  }
  return items;
}

/** The Meta body of a server event: the Purchase body with the event name swapped for a custom event (OPE-§20.4). */
export function metaEventBody(c: PurchaseConversion, h: HashedCustomer, event: ServerEvent, testCode?: string): Record<string, unknown> {
  const body = metaPurchaseBody(c, h, testCode);
  const data = (body.data as Record<string, unknown>[]).map((d) => ({ ...d, event_name: metaEventName(event) }));
  return { ...body, data };
}

/** A failed send is worth retrying: no answer, 408, 429, a 5xx, or the platform's own rate-limit code. */
export function retryableFailure(platform: ServerPlatform, status: number | null, json: Record<string, unknown> | null): boolean {
  if (status === null || status === 408 || status === 429 || status >= 500) return true;
  return failureCode(platform, status, json) === "rate";
}

/* ------------------------------------------------------------------ */
/* the sealed context (orders.capi_ctx, OD21)                          */
/* ------------------------------------------------------------------ */

/**
 * What a later event is rebuilt from (OPE-§20.4 (1)): the shopper's client data (IP, UA, fbp, fbc, ttclid, ttp), the
 * source URL, the contents and a hash of the order's `items`, plus the page facts the event needs. The customer's
 * phone, name, e-mail and city are read from the order row at send time (an agent may have corrected them), and the
 * value is the order's current total. Sealed with the store's envelope (purpose `capi-ctx`) by conversions.ts.
 */
export const CapiContext = z.object({
  v: z.literal(1),
  pageId: z.string().max(26),
  source: z.enum(["live", "export"]),
  currency: z.string().length(3),
  qty: z.number().int().min(0).max(10_000),
  numItems: z.number().int().min(0).max(10_000).optional(),
  contentId: z.string().max(200),
  contentName: z.string().max(160),
  contents: z
    .array(z.object({ id: z.string().max(200), quantity: z.number().int().min(0), itemPrice: z.number() }))
    .max(40)
    .optional(),
  country: z.string().length(2).nullable(),
  client: z.object({
    ip: z.string().max(45).nullable(),
    ua: z.string().max(400).nullable(),
    fbp: z.string().max(200).optional(),
    fbc: z.string().max(500).optional(),
    ttclid: z.string().max(500).optional(),
    ttp: z.string().max(500).optional(),
  }),
  sourceUrl: z.string().max(500).nullable(),
  pixels: z.object({ meta: z.array(z.string().max(32)).max(3), tiktok: z.array(z.string().max(32)).max(3) }),
  /** itemsHashOf(orders.items) when the context was sealed */
  itemsHash: z.string().max(64),
});
export type CapiContext = z.output<typeof CapiContext>;

/** The sealed column holds <= 8 KB (OD21): the plain JSON stays under this, the envelope's base64 adds a third. */
export const CAPI_CTX_PLAIN_MAX = 5_800;

const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
        )
      : v;

/** A short hash of the order's `items` (key order does not matter): a line edit since creation changes it. */
export function itemsHashOf(items: unknown): string {
  return sha256(JSON.stringify(stable(items ?? null))).slice(0, 32);
}

/** The context of a conversion, kept under `CAPI_CTX_PLAIN_MAX` (the contents go first, then the user agent). */
export function capiContextOf(c: PurchaseConversion, itemsHash: string): CapiContext {
  const ctx: CapiContext = {
    v: 1,
    pageId: c.pageId,
    source: c.source,
    currency: c.currency,
    qty: c.qty,
    ...(c.numItems !== undefined ? { numItems: c.numItems } : {}),
    contentId: c.contentId.slice(0, 200),
    contentName: c.contentName.slice(0, 160),
    ...(c.contents?.length ? { contents: c.contents.slice(0, 40) } : {}),
    country: c.customer.country,
    client: { ...c.client, ua: c.client.ua?.slice(0, 400) ?? null },
    sourceUrl: c.sourceUrl,
    pixels: { meta: c.pixels.meta.slice(0, 3), tiktok: c.pixels.tiktok.slice(0, 3) },
    itemsHash,
  };
  if (JSON.stringify(ctx).length > CAPI_CTX_PLAIN_MAX) delete ctx.contents;
  if (JSON.stringify(ctx).length > CAPI_CTX_PLAIN_MAX) ctx.client = { ...ctx.client, ua: null };
  return ctx;
}

/** The opened context's JSON, validated; null when it does not parse (the caller sends the server fields only). */
export function parseCapiContext(json: string): CapiContext | null {
  try {
    const r = CapiContext.safeParse(JSON.parse(json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** The order row's facts a rebuilt event reads at send time. */
export interface OrderFacts {
  id: string;
  phone: string;
  email: string | null;
  name: string;
  city: string | null;
  /** the current total, integer cents */
  totalCents: number;
  qty: number;
  /** itemsHashOf(orders.items) now */
  itemsHash: string;
  risk: number;
}

/**
 * A server-fields-only context (no `capi_ctx`: purged, never sealed or unreadable): the page facts of the order's
 * version and no client data. Its hash is the order's own, so the contents are the one average line.
 */
export function serverOnlyContext(
  input: Pick<CapiContext, "pageId" | "source" | "currency" | "contentId" | "contentName" | "country" | "sourceUrl" | "pixels" | "qty" | "itemsHash">,
): CapiContext {
  return { v: 1, ...input, client: { ip: null, ua: null } };
}

/**
 * The event rebuilt from the context (OPE-§20.4 (2)): the order's current customer fields and total, the event's id
 * and time; when the items changed since the context was sealed, the contents collapse to one line (the lead content
 * id, the order's units, the average price) so no stale line price is sent.
 */
export function conversionFromContext(ctx: CapiContext, order: OrderFacts, e: { event: ServerEvent; time: Date }): PurchaseConversion {
  const value = round2(fromCents(order.totalCents));
  const changed = ctx.itemsHash !== order.itemsHash;
  const qty = changed ? order.qty : ctx.qty;
  const units = Math.max(1, qty);
  const contents = changed || !ctx.contents?.length ? [{ id: ctx.contentId, quantity: units, itemPrice: round2(value / units) }] : ctx.contents;
  return {
    orderId: order.id,
    eventId: serverEventId(order.id, e.event),
    pageId: ctx.pageId,
    source: ctx.source,
    time: e.time,
    value,
    currency: ctx.currency,
    qty,
    ...(changed ? { numItems: qty } : ctx.numItems !== undefined ? { numItems: ctx.numItems } : {}),
    contentId: ctx.contentId,
    contents,
    contentName: ctx.contentName,
    customer: { phone: order.phone, email: order.email, name: order.name, city: order.city && order.city !== "Autre" ? order.city : null, country: ctx.country },
    client: ctx.client,
    sourceUrl: ctx.sourceUrl,
    pixels: ctx.pixels,
    risk: order.risk,
  };
}

/** Integer cents of an order's decimal money column (`orders.total`). */
export const centsOf = (amount: number): number => toCents(amount);

/* ------------------------------------------------------------------ */
/* Settings → Pixels: "Send test event"                                */
/* ------------------------------------------------------------------ */

export interface TestEventInput {
  platform: ServerPlatform;
  pixelId: string;
  token: string;
  testCode: string;
  /** the store's site URL (event_source_url / page.url) */
  siteUrl: string | null;
  currency: string;
  /** customer country (phone), e.g. "MA" */
  country: string;
  /** the platform's name (`platform.brand.name`, PIX-09): the test product and user agent say who sent the event */
  brand?: string;
}

/** `platform.brand.name`'s default (src/lib/settings/keys/platform.ts). */
export const DEFAULT_BRAND = "Store Gen";

/** "Store Gen" → "Store-Gen": a user-agent product token (RFC 9110 token characters only). */
const uaToken = (brand: string) => brand.replace(/[^A-Za-z0-9!#$%&'*+.^_`|~-]+/g, "-").replace(/^-+|-+$/g, "") || "Store-Gen";

export interface TestEventResult {
  ok: boolean;
  platform: ServerPlatform;
  pixelId: string;
  /** HTTP status of the platform's answer, null when it could not be reached */
  status: number | null;
  eventName: string;
  eventId: string;
  /** one sentence for the admin */
  message: string;
  /** short facts from the answer: events_received, fbtrace_id, request_id, error codes */
  facts: string[];
  /** the platform's JSON answer (pretty, truncated) */
  response: string | null;
  /** failure class (pixel_health) */
  code?: HealthCode;
}

/** A synthetic Purchase sent with the test event code (it lands in Test events only, never in reports). */
export async function sendTestEvent(input: TestEventInput): Promise<TestEventResult> {
  const orderId = `TEST-${randomBytes(4).toString("hex").toUpperCase()}`;
  const brand = input.brand?.replace(/[\u0000-\u001f\u007f]/g, " ").trim() || DEFAULT_BRAND;
  const c: PurchaseConversion = {
    orderId,
    eventId: purchaseEventId(orderId),
    pageId: "test",
    source: "live",
    time: new Date(),
    value: 1,
    currency: input.currency,
    qty: 1,
    contentId: "test-product",
    contentName: `Test product (${brand})`.slice(0, 160),
    customer: { phone: input.country === "MA" ? "+212600000000" : "+33600000000", email: null, name: "Test Client", city: null, country: input.country },
    client: { ip: null, ua: `Mozilla/5.0 (compatible; ${uaToken(brand)}-test-event/1.0)` },
    sourceUrl: cleanUrl(input.siteUrl),
    pixels: { meta: [], tiktok: [] },
  };
  const h = hashCustomer(c.customer);
  const name = PIXEL_NAMES[input.platform];
  const outcome =
    input.platform === "meta"
      ? await sendMeta(metaPurchaseBody(c, h, input.testCode), input.pixelId, input.token, 1)
      : await sendTikTok(tiktokPurchaseBody(c, h, input.pixelId, input.testCode), input.token, 1);
  const json = outcome.json;
  const facts: string[] = [];
  let message: string;
  if (outcome.status === null) {
    message = `Couldn't reach ${name}: ${tidy(outcome.detail)}`;
  } else if (input.platform === "meta") {
    const err = (json?.error ?? null) as { message?: unknown; code?: unknown; error_subcode?: unknown; fbtrace_id?: unknown; error_user_msg?: unknown } | null;
    if (typeof json?.events_received === "number") facts.push(`events_received: ${json.events_received}`);
    if (err?.code !== undefined) facts.push(`code ${tidy(err.code)}${err.error_subcode ? ` / ${tidy(err.error_subcode)}` : ""}`);
    const trace = json?.fbtrace_id ?? err?.fbtrace_id;
    if (trace) facts.push(`fbtrace_id: ${tidy(trace)}`);
    message = outcome.ok ? "Meta received the test event." : tidy(err?.error_user_msg || err?.message) || `Meta answered HTTP ${outcome.status}.`;
  } else {
    if (json && json.code !== undefined) facts.push(`code ${tidy(json.code)}${json.message ? ` · ${tidy(json.message)}` : ""}`);
    if (json?.request_id) facts.push(`request_id: ${tidy(json.request_id)}`);
    message = outcome.ok ? "TikTok received the test event." : tidy(json?.message) || `TikTok answered HTTP ${outcome.status}.`;
  }
  let response: string | null = null;
  if (json) {
    const pretty = JSON.stringify(json, null, 2);
    response = pretty.length > 1500 ? `${pretty.slice(0, 1500)}\n…` : pretty;
  }
  return {
    ok: outcome.ok,
    platform: input.platform,
    pixelId: input.pixelId,
    status: outcome.status,
    eventName: input.platform === "meta" ? META_PURCHASE_EVENT : TIKTOK_PURCHASE_EVENT,
    eventId: c.eventId,
    message,
    facts,
    response,
    ...(outcome.ok ? {} : { code: failureCode(input.platform, outcome.status, outcome.json) }),
  };
}
