import "server-only";
/**
 * Abandoned-lead capture: the runtime posts the form state once the phone looks valid. One row per
 * idempotency key (= the order's idem), updated while the visitor keeps typing, marked converted
 * when the order arrives. Invalid phones and throttled clients are ignored silently.
 *
 * In the store of the resolved page key (docs/STORE-SAAS.md §E.3, ORD-18): the network budget is the store's
 * (`s:<sid>:lead:ip:<hash>`, 30 per 10 min), the "already ordered" check reads the store's orders, the row is
 * written with the store from the scope, and an idem that another store already used is never updated (the key is
 * global, the row is not). A lead from a test link (D54) is stored `is_test`.
 *
 * `selection` (docs/OFFERS.md §G.1, §I.2, §I.4): the warehouse text of the part of the lead's offer
 * choice that resolves against the version the visitor saw ("1 × Jour + 1 × Nuit (NR/M)"), ≤ 400
 * characters. Units or extras that don't resolve (not chosen yet, unknown ids) are left out, never
 * an error.
 *
 * P3 LANDING (landing.md LAN-§10.1, §10.2, LD10, LD11): the beacon is dropped silently when the store's market does not
 * capture leads (`leadCaptureOn`: an EU market, or `landing.leads.capture` off); `sel` keeps the structured choice (a
 * `LeadSelectionV2` from the tolerant `leadSelection()` plus `bundleId` and `ver`, ≤ 8 KB) for one-tap conversion,
 * `version_id` the version seen, `total_cents` the server total of the resolved selection on that version
 * (`orderTotals`; NULL while it does not resolve; display only, a conversion re-prices), `kind` = 'form'. The city is
 * kept (the recovery message can then say the real delivery window).
 */
import { eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { affected, auditIn } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { leads, orders, type LeadLineV3, type LeadSelectionV2, type LeadSelectionV3 } from "@/lib/db/schema";
import { leadCaptureOn } from "@/lib/landing/lead-capture";
import { LEAD_SEL_MAX_BYTES } from "@/lib/leads/types";
import { findCity, getMarket } from "@/lib/markets";
import { normalizePhone } from "@/lib/markets/phone";
import { orderTotals } from "@/lib/page/pricing";
import type { PageDoc } from "@/lib/page/schema";
import { hashIp } from "@/lib/security/crypto";
import { rateLimit, storeBucket } from "@/lib/security/rate-limit";
import { getStoreSetting } from "@/lib/settings";
import type { PublicContextTarget, PublicPageTarget } from "@/lib/tenancy/public";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { Actor, WriteScope } from "@/lib/tenancy/types";
import type { LeadPayload, UnitIn } from "./contract";
import { orderVersion } from "./resolve";
import { onLeadCreated } from "./hooks";
import { releaseOn } from "@/lib/auth/permissions";
import { leadSelectionText } from "./lead-text";
import { cleanInput, resolveSelection, validName } from "./validate";

type Lead = z.output<typeof LeadPayload>;

export interface UpsertLeadContext {
  ip: string;
  /** the resolved page key (resolvePublicTarget, purpose "order") */
  target: PublicPageTarget;
  /** resolveTestToken(target.store, ?sg-test).test (D54) */
  test?: boolean;
}

export function upsertLead(payload: Lead, ctx: UpsertLeadContext): Promise<{ stored: boolean }> {
  return storeLead(ctx.target.scope, payload, ctx);
}

async function storeLead(scope: WriteScope, payload: Lead, ctx: UpsertLeadContext): Promise<{ stored: boolean }> {
  const { target } = ctx;
  // LD11: no capture in this market (or turned off by the store): the beacon is ignored, the endpoint still answers 204
  const landing = await getStoreSetting(scope, "landing");
  if (!leadCaptureOn(target.store.market, landing.leads.capture)) return { stored: false };
  const gate = await rateLimit(storeBucket(scope, "lead:ip", hashIp(ctx.ip)), 30, 600);
  if (!gate.ok) return { stored: false };

  const { doc } = target;
  const phone = normalizePhone(payload.phone, doc.form.phoneCountry);
  if (!phone) return { stored: false };

  const [converted] = await db.select({ id: orders.id }).from(orders).where(whereStore(orders, scope, eq(orders.idem, payload.idem))).limit(1);
  if (converted) return { stored: false };

  const name = payload.name ? validName(payload.name) : null;
  const cityInput = cleanInput(payload.city, 80);
  const market = getMarket(doc.market);
  const city = cityInput ? (market.cities ? (findCity(market.code, cityInput)?.value ?? null) : cityInput) : null;
  const bundleId = payload.bundleId && doc.offers.bundles.some((b) => b.id === payload.bundleId) ? payload.bundleId : null;
  const utm = Object.fromEntries(Object.entries(payload.utm).filter(([, v]) => typeof v === "string" && v));

  // the selection reads the version the visitor saw (same rule as orders); never blocks the lead
  let selection: string | null = null;
  let sel: LeadSelectionV2 | null = null;
  let versionId: string | null = null;
  let totalCents: number | null = null;
  try {
    const seen = await orderVersion(scope, target, payload);
    versionId = seen.versionId;
    const units = (payload.units ?? []).filter((u): u is UnitIn => !!u && typeof u === "object");
    const extras = Object.fromEntries(Object.entries(payload.extras ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"));
    const id = payload.bundleId && seen.doc.offers.bundles.some((b) => b.id === payload.bundleId) ? payload.bundleId : null;
    selection = leadSelectionText(seen.doc, { bundleId: id, units, extras });
    sel = leadSel({ ver: payload.ver, bundleId: id, units, extras });
    totalCents = id ? resolvedTotal(seen.doc, id, units, extras) : null;
  } catch (err) {
    console.warn("[leads] selection skipped:", err instanceof Error ? err.message : "unknown error");
  }

  // only this store's, this page's unconverted lead may be updated through its idem
  const own = sql`\`store_id\` = ${scope.storeId} AND \`page_id\` = ${target.pageId} AND \`converted_order_id\` IS NULL`;
  const now = new Date();
  const id = newId();
  const [res] = await db
    .insert(leads)
    .values(
      storeValues(scope, {
        id,
        pageId: target.pageId,
        idem: payload.idem,
        phone: phone.e164,
        name,
        city,
        bundleId,
        selection,
        utm: Object.keys(utm).length ? utm : null,
        isTest: !!ctx.test,
        kind: "form" as const,
        sel,
        versionId,
        totalCents,
        createdAt: now,
        updatedAt: now,
      }),
    )
    .onDuplicateKeyUpdate({
      set: {
        phone: sql`IF(${own}, VALUES(\`phone\`), \`phone\`)`,
        name: sql`IF(${own}, COALESCE(VALUES(\`name\`), \`name\`), \`name\`)`,
        city: sql`IF(${own}, COALESCE(VALUES(\`city\`), \`city\`), \`city\`)`,
        bundleId: sql`IF(${own}, COALESCE(VALUES(\`bundle_id\`), \`bundle_id\`), \`bundle_id\`)`,
        selection: sql`IF(${own}, COALESCE(VALUES(\`selection\`), \`selection\`), \`selection\`)`,
        // the total belongs to the selection it was computed from: both move together
        totalCents: sql`IF(${own} AND VALUES(\`sel\`) IS NOT NULL, VALUES(\`total_cents\`), \`total_cents\`)`,
        sel: sql`IF(${own}, COALESCE(VALUES(\`sel\`), \`sel\`), \`sel\`)`,
        versionId: sql`IF(${own}, COALESCE(VALUES(\`version_id\`), \`version_id\`), \`version_id\`)`,
        updatedAt: sql`IF(${own}, VALUES(\`updated_at\`), \`updated_at\`)`,
      },
    });
  // OPE Q.18 (R2 contract step C2-B2): a new row (1 affected; an update of the visitor's lead counts 2) runs the
  // lead hook; R1 runs nothing
  if (res.affectedRows === 1 && releaseOn("R2")) await leadInserted(scope, id);
  return { stored: true };
}

/**
 * The store's catalog lead (STO-§15.11, §15.13; STO-R9 accepted; R2 contract step C2-E): an abandoned checkout
 * (`kind: "form"`) or a WhatsApp order intent (`kind: "whatsapp"`, no phone, its 9-character `ref` and the server
 * total). `page_id` is NULL (0006) and `sel = { v: 3, lines, ctxPageId }`. S1's public route parses
 * `LeadPayloadV3` (each line `LineIn.omit({ ls })`, bad entries dropped), prices a WhatsApp intent with `priceLine`,
 * reads `resolveTestToken`, and hands the normalized fields here; this function owns the storage rules landing's
 * `upsertLead` follows: LD11 capture gate (form leads only), the per-IP budget `s:<sid>:lead:ip:<hash>` 30 / 10 min,
 * no lead for an idem that already ordered, one row per idem updated only while it is this store's unconverted page-less
 * lead, and `onLeadCreated` on a new row (R2 only). Unreachable while `releaseOn("R2")` is false.
 */
export interface StoreLeadV3 {
  kind: "form" | "whatsapp";
  idem: string;
  /** E.164 (the route normalized it with the store market's phone country); null only for kind "whatsapp" */
  phone: string | null;
  name: string | null;
  city: string | null;
  lines: LeadLineV3[];
  /** the server total of the lines (display only; a conversion re-prices), null while it does not resolve */
  totalCents: number | null;
  /** kind "whatsapp": the intent's reference (9 characters) */
  ref?: string;
  utm: Record<string, string>;
  test?: boolean;
}

export async function upsertLeadV3(target: PublicContextTarget, lead: StoreLeadV3, ctx: { ip: string }): Promise<{ stored: boolean; id: string | null }> {
  if (!releaseOn("R2")) return { stored: false, id: null };
  const { scope } = target;
  if (lead.kind === "form") {
    const landing = await getStoreSetting(scope, "landing");
    if (!leadCaptureOn(target.store.market, landing.leads.capture)) return { stored: false, id: null };
    if (!lead.phone) return { stored: false, id: null };
  }
  const gate = await rateLimit(storeBucket(scope, "lead:ip", hashIp(ctx.ip)), 30, 600);
  if (!gate.ok) return { stored: false, id: null };
  const [ordered] = await db.select({ id: orders.id }).from(orders).where(whereStore(orders, scope, eq(orders.idem, lead.idem))).limit(1);
  if (ordered) return { stored: false, id: null };

  const sel: LeadSelectionV3 = { v: 3, lines: lead.lines.slice(0, 20), ctxPageId: target.page.id };
  const selOk = Buffer.byteLength(JSON.stringify(sel), "utf8") <= LEAD_SEL_MAX_BYTES;
  const utm = Object.fromEntries(Object.entries(lead.utm).filter(([, v]) => typeof v === "string" && v));
  const own = sql`\`store_id\` = ${scope.storeId} AND \`page_id\` IS NULL AND \`converted_order_id\` IS NULL`;
  const now = new Date();
  const id = newId();
  const [res] = await db
    .insert(leads)
    .values(
      storeValues(scope, {
        id,
        pageId: null,
        idem: lead.idem,
        phone: lead.phone,
        name: lead.name,
        city: lead.city,
        utm: Object.keys(utm).length ? utm : null,
        isTest: !!lead.test,
        kind: lead.kind,
        ...(lead.ref ? { ref: lead.ref } : {}),
        sel: selOk ? sel : null,
        totalCents: selOk ? lead.totalCents : null,
        createdAt: now,
        updatedAt: now,
      }),
    )
    .onDuplicateKeyUpdate({
      set: {
        phone: sql`IF(${own}, COALESCE(VALUES(\`phone\`), \`phone\`), \`phone\`)`,
        name: sql`IF(${own}, COALESCE(VALUES(\`name\`), \`name\`), \`name\`)`,
        city: sql`IF(${own}, COALESCE(VALUES(\`city\`), \`city\`), \`city\`)`,
        totalCents: sql`IF(${own} AND VALUES(\`sel\`) IS NOT NULL, VALUES(\`total_cents\`), \`total_cents\`)`,
        sel: sql`IF(${own}, COALESCE(VALUES(\`sel\`), \`sel\`), \`sel\`)`,
        updatedAt: sql`IF(${own}, VALUES(\`updated_at\`), \`updated_at\`)`,
      },
    });
  if (res.affectedRows === 1) {
    await leadInserted(scope, id);
    return { stored: true, id };
  }
  return { stored: true, id: null };
}

/** `onLeadCreated` with the row just inserted (read back in the scope's store). */
export async function leadInserted(scope: WriteScope, id: string): Promise<void> {
  const [row] = await db.select().from(leads).where(whereStore(leads, scope, eq(leads.id, id))).limit(1);
  if (row) await onLeadCreated(scope, row);
}

/** The structured choice of a lead (`leads.sel`, LAN-§2.1), or null when it would pass 8 KB. */
function leadSel(input: { ver?: string; bundleId: string | null; units: UnitIn[]; extras: Record<string, string> }): LeadSelectionV2 | null {
  const sel: LeadSelectionV2 = {
    v: 2,
    ...(input.ver ? { ver: input.ver } : {}),
    ...(input.bundleId ? { bundleId: input.bundleId } : {}),
    units: input.units,
    extras: input.extras,
  };
  return Buffer.byteLength(JSON.stringify(sel), "utf8") <= LEAD_SEL_MAX_BYTES ? sel : null;
}

/** `orderTotals(…).total` of the selection on the version seen, or null while it does not resolve (a unit or an option still missing). */
function resolvedTotal(doc: PageDoc, bundleId: string, units: UnitIn[], extras: Record<string, string>): number | null {
  const offer = doc.offers.bundles.find((b) => b.id === bundleId);
  if (!offer) return null;
  const r = resolveSelection(doc, offer, { offerId: offer.id, units, extras, bump: false });
  if (r.errors.length) return null;
  return orderTotals(doc, r.selection)?.total ?? null;
}

const LEAD_ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ORDER_ID_RE = /^[A-Z0-9-]{6,20}$/;

/**
 * An agent's conversion of a lead into an order (P3 LANDING; landing.md LAN-§10.2, operations.md OPE-§11.4;
 * docs/STORE-SAAS.md §K.2 P0): sets `converted_order_id`, `converted_via = 'agent'` and the status `recovered` (an
 * agent conversion is a recovery, LAN-§10.4), audited `lead.converted`. Idempotent: a lead converted already answers its
 * existing order id (`already: true`); a lead or an order of another store answers `not_found`. Called by P4's
 * `convertLeadToOrder` once the order row exists. Signature frozen at P0.
 */
export async function markLeadConverted(
  scope: WriteScope,
  leadId: string,
  orderId: string,
  via: "agent",
): Promise<{ ok: true; orderId: string; already: boolean } | { ok: false; error: "not_found" }> {
  if (via !== "agent" || !LEAD_ID_RE.test(leadId) || !ORDER_ID_RE.test(orderId)) return { ok: false, error: "not_found" };
  const current = async () => (await db.select({ convertedOrderId: leads.convertedOrderId }).from(leads).where(whereStore(leads, scope, eq(leads.id, leadId))).limit(1))[0];
  const lead = await current();
  if (!lead) return { ok: false, error: "not_found" };
  if (lead.convertedOrderId) return { ok: true, orderId: lead.convertedOrderId, already: true };
  const [order] = await db.select({ id: orders.id }).from(orders).where(whereStore(orders, scope, eq(orders.id, orderId))).limit(1);
  if (!order) return { ok: false, error: "not_found" };
  const res = await db
    .update(leads)
    .set({ status: "recovered", convertedOrderId: orderId, convertedVia: via, nextAt: null, updatedAt: new Date() })
    .where(whereStore(leads, scope, eq(leads.id, leadId), isNull(leads.convertedOrderId)));
  if (affected(res) !== 1) {
    // a parallel conversion (or the order hook) won the row: answer the order it holds
    const won = await current();
    return won?.convertedOrderId ? { ok: true, orderId: won.convertedOrderId, already: true } : { ok: false, error: "not_found" };
  }
  const actor: Actor = { kind: scope.kind === "system" ? "system" : "user", userId: null, impersonatorId: null, ip: null };
  await auditIn(scope, actor, "lead.converted", { target: leadId, meta: { leadId, orderId, via } });
  return { ok: true, orderId, already: false };
}
