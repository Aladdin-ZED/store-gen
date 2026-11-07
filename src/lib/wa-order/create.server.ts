import "server-only";
/**
 * `POST /api/public/wa` (P3 LANDING; landing.md LAN-§11.2, §11.4; docs/STORE-SAAS.md §C.4, §E.8, D18, D42, D54): the
 * request logic behind the thin route file, so it runs (and is tested) without Next's request scope.
 *
 * Order of checks (LAN-§11.4 step 1): the in-memory burst guard, the body (≤ 16 KB, zod; no price field), the platform
 * floor `p:wa:ip:<h>` (30 / 10 min), the page key → its store (`resolvePublicTarget`), the store takes orders
 * (`publicApiAnswer(status, "wa")`: pending, restricted, suspended → `unavailable`), a live page (an export never
 * offers the intent), the effective host is one of `storeHosts(store)` and the Origin passes `checkOrigin`, the store's
 * bucket `s:<sid>:wa:ip:<h>` (10 / 10 min), then `landing.waOrder.enabled` and a WhatsApp number.
 *
 * Then: the version the shopper saw (`orderVersion`, the 72 h rule of OFFERS D8), the server price
 * (`priceWaSelection`), one `leads` row (`kind = 'whatsapp'`, no phone, a fresh `WA-` ref unique in the store, a
 * server uuid `idem`, `sel`, the server total, `version_id`, utm, the city, `is_test` from `?sg-test=` signed for the
 * store) and the message (./text.ts). Every refusal of a store answers the same `unavailable`.
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { leads, type LeadSelectionV2 } from "@/lib/db/schema";
import { zoneLineFor } from "@/lib/delivery/zones.server";
import { effectiveHost } from "@/lib/edge/host";
import { shopperLocaleOf } from "@/lib/landing/copy";
import { ownTemplate } from "@/lib/landing/templates.server";
import { LEAD_SEL_MAX_BYTES } from "@/lib/leads/types";
import { findCity, getMarket } from "@/lib/markets";
import { cityKey } from "@/lib/orders/address";
import { checkOrigin, clientContext, json, logError, readJson } from "@/lib/orders/http";
import { leadSelectionText } from "@/lib/orders/lead-text";
import { orderVersion } from "@/lib/orders/resolve";
import { leadInserted } from "@/lib/orders/leads";
import { releaseOn } from "@/lib/auth/permissions";
import { landingShippingZone } from "@/lib/render/landing-v3.server";
import { cleanInput } from "@/lib/orders/validate";
import type { PageDoc } from "@/lib/page/schema";
import { addressOf } from "@/lib/render/store-context.server";
import { whatsappNumber } from "@/lib/render/config";
import { burstLimit } from "@/lib/security/burst-limit";
import { hashIp } from "@/lib/security/crypto";
import { platformBucket, rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSettings } from "@/lib/settings";
import { publicApiAnswer, resolvePublicTarget, resolveTestToken, TEST_PARAM, type PublicPageTarget } from "@/lib/tenancy/public";
import { storeValues } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { hostServesStore } from "@/lib/tracking/api.server";
import { WA_BODY_MAX, WaOrderRequest, type WaOrderResponse } from "./contract";
import { priceWaSelection, type WaPrice } from "./price";
import { newWaRef, WA_REF_TRIES } from "./ref";
import { waOrderText } from "./text";

/** core §E.8, LAN-§23.3 */
export const WA_LIMITS = { floor: { limit: 30, windowSec: 600 }, store: { limit: 10, windowSec: 600 } } as const;

type Answer = { status: number; body: WaOrderResponse | { ok: false; error: "server" } };

const UNAVAILABLE: Answer = { status: 404, body: { ok: false, error: "unavailable" } };
const RATE_LIMITED: Answer = { status: 429, body: { ok: false, error: "rate_limited" } };
const invalid = (status: number): Answer => ({ status, body: { ok: false, error: "invalid" } });

/** mysql2's error code, looking through drizzle's wrapping (`cause`). */
function dbErrorCode(err: unknown): string | undefined {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export interface WaIntentInput {
  target: PublicPageTarget;
  req: WaOrderRequest;
  test: boolean;
  now?: Date;
}

export interface WaIntent {
  leadId: string;
  /** the version the intent was priced on */
  doc: PageDoc;
  ref: string;
  price: WaPrice;
  versionId: string;
  city: string | null;
}

/** The form's city as the market knows it (a listed city's value), else the cleaned text; null when empty. */
function cityOf(target: PublicPageTarget, raw: string | undefined, doc = target.doc): string | null {
  const input = cleanInput(raw, 80);
  if (!input) return null;
  const market = getMarket(doc.market);
  return market.cities ? (findCity(market.code, input)?.value ?? null) : input;
}

/**
 * Prices the intent on the version the shopper saw and stores it: one `leads` row of the target's store. A duplicate
 * reference (another intent of the store drew it) draws again, at most `WA_REF_TRIES` times.
 */
export function createWaIntent(input: WaIntentInput): Promise<WaIntent> {
  return storeIntent(input.target.scope, input);
}

async function storeIntent(scope: WriteScope, { target, req, test, now = new Date() }: WaIntentInput): Promise<WaIntent> {
  const seen = await orderVersion(scope, target, { v: 2, ver: req.ver });
  const doc = seen.doc;
  // LP-16 (D75, R2): the zone delivery of a runtime_v 3 version (undefined: the page fee)
  const zone = await landingShippingZone(scope, seen.versionId, req.city);
  const price = priceWaSelection(doc, req, zone);
  const city = cityOf(target, req.city, doc);
  const utm = Object.fromEntries(Object.entries(req.utm ?? {}).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  const sel: LeadSelectionV2 = {
    v: 2,
    ...(seen.versionId ? { ver: seen.versionId } : {}),
    bundleId: price.offer.id,
    ...(price.input.bump ? { bump: true } : {}),
    units: price.input.units,
    extras: price.input.extras,
    ...(price.input.b ? { b: price.input.b } : {}),
  };
  const selKept = Buffer.byteLength(JSON.stringify(sel), "utf8") <= LEAD_SEL_MAX_BYTES ? sel : null;
  const selection = leadSelectionText(doc, { bundleId: price.offer.id, units: price.input.units, extras: price.input.extras });
  for (let attempt = 1; ; attempt++) {
    const id = newId();
    const ref = newWaRef();
    try {
      await db.insert(leads).values(
        storeValues(scope, {
          id,
          pageId: target.pageId,
          idem: randomUUID(),
          phone: null,
          name: null,
          city,
          bundleId: price.offer.id,
          selection,
          utm: Object.keys(utm).length ? utm : null,
          isTest: test,
          kind: "whatsapp" as const,
          ref,
          sel: selKept,
          totalCents: price.total,
          versionId: seen.versionId || null,
          status: "new" as const,
          createdAt: now,
          updatedAt: now,
        }),
      );
      // OPE Q.18 (R2 contract step C2-B2): the lead hook of the new intent; R1 runs nothing
      if (releaseOn("R2")) await leadInserted(scope, id);
      return { leadId: id, doc, ref, price, versionId: seen.versionId, city };
    } catch (err) {
      if (dbErrorCode(err) !== "ER_DUP_ENTRY" || attempt >= WA_REF_TRIES) throw err;
    }
  }
}

/** The zone window of the picked city before the call, in the page language; "" without a city or a zone. */
async function etaTextFor(target: PublicPageTarget, city: string | null, locale: string, now: Date): Promise<string> {
  if (!city) return "";
  try {
    const line = await zoneLineFor(target.scope, cityKey(city), now, { stage: "before_call" });
    return line?.etaText?.[shopperLocaleOf(locale)] ?? "";
  } catch (err) {
    logError("api/wa:eta", err);
    return "";
  }
}

async function answer(req: Request): Promise<Answer> {
  const client = clientContext(req);
  if (!burstLimit("wa", client.ip).ok) return RATE_LIMITED;
  const body = await readJson(req, WA_BODY_MAX);
  if (!body.ok) return invalid(body.status);
  const parsed = WaOrderRequest.safeParse(body.value);
  if (!parsed.success) return invalid(422);
  const input = parsed.data;

  const ip = hashIp(client.ip);
  if (!(await rateLimit(platformBucket("wa:ip", ip), WA_LIMITS.floor.limit, WA_LIMITS.floor.windowSec)).ok) return RATE_LIMITED;

  const target = await resolvePublicTarget(input.pageKey, { purpose: "order" });
  if (!target || target.kind !== "page" || publicApiAnswer(target.store.status, "wa") !== "open") return UNAVAILABLE;
  const address = addressOf(target.store);
  if (!hostServesStore(effectiveHost(req.headers), address) || !checkOrigin(req, { store: address, allowedOrigins: null }).ok) return UNAVAILABLE;
  const scope = target.scope;
  if (!(await rateLimit(storeBucket(scope, "wa:ip", ip), WA_LIMITS.store.limit, WA_LIMITS.store.windowSec)).ok) return RATE_LIMITED;

  const { landing, store: contacts } = await getStoreSettings(scope, ["landing", "store"]);
  const number = landing.waOrder.enabled ? whatsappNumber(target.doc, contacts.whatsapp) : null;
  if (!number) return UNAVAILABLE;

  const { test } = resolveTestToken(target.store, new URL(req.url).searchParams.get(TEST_PARAM));
  const now = new Date();
  const intent = await createWaIntent({ target, req: input, test, now });
  const doc = intent.doc;
  const [template, etaText] = await Promise.all([ownTemplate(scope, "wa_order", doc.locale), etaTextFor(target, intent.city, doc.locale, now)]);
  const { text } = waOrderText({ doc, price: intent.price, ref: intent.ref, number, template, etaText });
  return { status: 200, body: { ok: true, ref: intent.ref, number, text } };
}

/** The route's whole body. */
export async function handleWaApi(req: Request): Promise<Response> {
  let out: Answer;
  try {
    out = await answer(req);
  } catch (err) {
    logError("api/wa", err);
    out = { status: 500, body: { ok: false, error: "server" } };
  }
  return json(out.body, out.status);
}
