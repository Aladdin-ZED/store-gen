/**
 * Order hooks of the landing track (P3 LANDING, landing.md LAN-§23.5, §10.4, §7.4).
 * Extension file (docs/STORE-SAAS.md §K.3; operations.md OPE-§3.6), created empty at P0 and imported by
 * src/lib/orders/hooks.ts; the track fills it and never edits the registry.
 *
 * `landing.created` (afterCommit, on `created`), each step isolated so one failure never stops the other:
 *  1. lead attribution (LD12, the pure rule of src/lib/leads/attribution.ts): the order's store, its idem, its `WA-`
 *     ref, its phone in the last 7 days, test with test only; applied by a scoped UPDATE guarded by
 *     `converted_order_id IS NULL`, so a lead credits one order once; `lead.recovered` goes to the assignee of a lead
 *     that became `recovered`;
 *  2. `zone_not_served` appended to `orders.flags` (scoped UPDATE) when the store shows delivery dates and the order's
 *     city falls in a zone marked "not served"; the key is `orders.city_key ?? cityKey(orders.city)`, computed here
 *     since P4's `ops.created` hook runs in the same phase.
 * Never throws into the caller (the registry logs a failure under `orders:hook:landing.created`).
 */
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, orders } from "@/lib/db/schema";
import { zoneForCity } from "@/lib/delivery/match";
import { listZones } from "@/lib/delivery/zones.server";
import { ATTRIBUTION_DAYS, attributeOrder, refInNote, type Attribution, type AttributionLead } from "@/lib/leads/attribution";
import { errorSummary } from "@/lib/orders/log";
import { notify } from "@/lib/platform/notify";
import { getStoreSetting } from "@/lib/settings";
import { getStoreById } from "@/lib/tenancy/public";
import { whereStore } from "@/lib/tenancy/sql";
import type { WriteScope } from "@/lib/tenancy/types";
import { cityKey } from "../address";
import type { OrderHook, OrderHookEvent, OrderRow } from "../hooks";

const DAY_MS = 86_400_000;
export const ZONE_NOT_SERVED_FLAG = "zone_not_served";

/** The unconverted leads an order could credit: its idem, its note's `WA-` ref, its phone in the 7 days before it. */
async function candidates(scope: WriteScope, order: OrderRow): Promise<AttributionLead[]> {
  const since = new Date(order.createdAt.getTime() - ATTRIBUTION_DAYS * DAY_MS);
  const ref = refInNote(order.note);
  const match = or(
    eq(leads.idem, order.idem),
    and(gte(leads.createdAt, since), lte(leads.createdAt, order.createdAt), or(eq(leads.phone, order.phone), ref ? eq(leads.ref, ref) : undefined)),
  );
  return db
    .select({
      id: leads.id,
      idem: leads.idem,
      phone: leads.phone,
      ref: leads.ref,
      attempts: leads.attempts,
      isTest: leads.isTest,
      createdAt: leads.createdAt,
      convertedOrderId: leads.convertedOrderId,
    })
    .from(leads)
    .where(whereStore(leads, scope, isNull(leads.convertedOrderId), eq(leads.isTest, order.isTest), match))
    .orderBy(desc(leads.createdAt))
    .limit(20);
}

/** a manual order an agent converted from a lead carries `ref = "lead:<id>"` (src/lib/orders/manual.ts, OPE-§11.4) */
const AGENT_LEAD_REF = /^lead:[0-9A-Z]{26}$/;

/**
 * Applies LD12 to one new order; the attribution written, or null. An agent's conversion (`ref = "lead:<id>"`) is not
 * matched here: `convertLeadToOrder` credits that lead through `markLeadConverted` (`converted_via = 'agent'`, status
 * `recovered`, LAN-§10.4, OPE-§11.4), which an idem / phone match run first in the `created` hook would pre-empt.
 */
export async function attributeLead(scope: WriteScope, order: OrderRow): Promise<(Attribution & { assigneeId: string | null }) | null> {
  if (order.ref && AGENT_LEAD_REF.test(order.ref)) return null;
  const found = attributeOrder(
    { idem: order.idem, phone: order.phone, isTest: order.isTest, createdAt: order.createdAt, note: order.note },
    (await candidates(scope, order)).map((l) => ({ ...l, attempts: Number(l.attempts), isTest: !!l.isTest })),
  );
  if (!found) return null;
  const res = await db
    .update(leads)
    .set({ status: found.status, convertedOrderId: order.id, convertedVia: found.via, nextAt: null, updatedAt: new Date() })
    .where(whereStore(leads, scope, eq(leads.id, found.leadId), isNull(leads.convertedOrderId)));
  const changed = (Array.isArray(res) ? res[0] : res) as { affectedRows?: number } | undefined;
  if (!changed?.affectedRows) return null;
  const [lead] = await db.select({ assigneeId: leads.assigneeId }).from(leads).where(whereStore(leads, scope, eq(leads.id, found.leadId))).limit(1);
  return { ...found, assigneeId: lead?.assigneeId ?? null };
}

/** Appends `zone_not_served` to the order's flags when its city is in a "not served" zone (LAN-§7.4); true when it did. */
export async function flagZoneNotServed(scope: WriteScope, order: OrderRow): Promise<boolean> {
  const checkout = await getStoreSetting(scope, "checkout");
  if (!checkout.zonesEnabled) return false;
  const key = (order.cityKey as Parameters<typeof zoneForCity>[1]) ?? (order.city ? cityKey(order.city) : null);
  const zone = zoneForCity(await listZones(scope), key);
  if (!zone?.notServed) return false;
  const res = await db
    .update(orders)
    .set({ flags: sql`JSON_ARRAY_APPEND(COALESCE(${orders.flags}, '[]'), '$', ${ZONE_NOT_SERVED_FLAG})` })
    .where(whereStore(orders, scope, eq(orders.id, order.id), sql`(${orders.flags} IS NULL OR NOT JSON_CONTAINS(${orders.flags}, JSON_QUOTE(${ZONE_NOT_SERVED_FLAG})))`));
  const changed = (Array.isArray(res) ? res[0] : res) as { affectedRows?: number } | undefined;
  return !!changed?.affectedRows;
}

async function landingCreated(scope: WriteScope, e: OrderHookEvent): Promise<void> {
  if (e.on !== "created") return;
  const order = e.order;
  try {
    const won = await attributeLead(scope, order);
    if (won?.status === "recovered" && won.assigneeId) {
      const store = await getStoreById(scope.storeId);
      await notify(
        { audience: "user", userId: won.assigneeId, storeId: scope.storeId },
        "lead.recovered",
        { leadId: won.leadId, orderId: order.id },
        { link: store ? `/app/${store.handle}/leads?lead=${won.leadId}` : undefined, dedupeKey: `lead.recovered:${won.leadId}` },
      );
    }
  } catch (err) {
    console.error("[orders:hook:landing.created] attribution:", errorSummary(err));
  }
  try {
    await flagZoneNotServed(scope, order);
  } catch (err) {
    console.error("[orders:hook:landing.created] zone_not_served:", errorSummary(err));
  }
}

export const hooks: OrderHook[] = [{ name: "landing.created", phase: "afterCommit", on: ["created"], run: landingCreated }];
