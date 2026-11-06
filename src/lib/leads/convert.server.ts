import "server-only";
/**
 * "Convert to order" of the inbox (P3 LANDING; landing.md LAN-§10.3, §10.5; docs/STORE-SAAS.md §K.2 P0, D72). The
 * browser sends what the agent confirmed (name, city, address, note, "the customer already confirmed") and the
 * sheet's draft id; the selection and the phone are read here from the lead row, so a full phone never travels to the
 * browser. P4's `convertLeadToOrder` re-prices on the server (the published version, or the lead's within 72 h,
 * OFFERS D8), dispatches on `sel.v` and inserts through `createOrderRow`; `markLeadConverted` then records the order
 * on the lead (idempotent: a second call answers the first order). The draft id is the order's `idem`, so a double
 * submit returns the first order (OD36).
 *
 * An agent converts only the leads they see (their own, or an unassigned `new` one); another store's or agent's lead
 * answers `not_found` before anything is written.
 */
import { and, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { convertLeadToOrder } from "@/lib/orders/manual";
import { markLeadConverted } from "@/lib/orders/leads";
import { whereStore } from "@/lib/tenancy/sql";
import type { WriteCtx } from "@/lib/tenancy/types";
import { ConvertLeadInput, LEAD_WINDOW_DAYS, type ConvertOutcome } from "./types";

export { ConvertLeadInput, type ConvertOutcome };

const DAY_MS = 86_400_000;
const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

type Convert = typeof convertLeadToOrder;


const failure = (error: string, message: string): ConvertOutcome => ({ ok: false, error, message });

/**
 * Converts the lead `leadId` of the ctx's store. `convert` is P4's function (a test passes its own). Answers the
 * order id; an already converted lead answers its order (`already: true`) without calling `convert`.
 */
export async function convertLeadFor(
  ctx: WriteCtx,
  leadId: string,
  raw: ConvertLeadInput,
  convert: Convert = convertLeadToOrder,
  now: Date = new Date(),
): Promise<ConvertOutcome> {
  const input = ConvertLeadInput.safeParse(raw);
  if (!input.success || !ID_RE.test(leadId)) return failure("invalid", "landing.leads.convert.invalid");
  const me = ctx.actor.userId ?? "";
  const agentGuard = ctx.membership.role === "agent" ? or(eq(leads.assigneeId, me), and(isNull(leads.assigneeId), eq(leads.status, "new"))) : undefined;
  const [lead] = await db
    .select({ id: leads.id, sel: leads.sel, phone: leads.phone, status: leads.status, convertedOrderId: leads.convertedOrderId })
    .from(leads)
    .where(whereStore(leads, ctx.scope, eq(leads.id, leadId), gte(leads.createdAt, new Date(now.getTime() - LEAD_WINDOW_DAYS * DAY_MS)), agentGuard))
    .limit(1);
  if (!lead) return failure("not_found", "landing.leads.notFound");
  if (lead.convertedOrderId) return { ok: true, orderId: lead.convertedOrderId, already: true };
  if (lead.status === "lost") return failure("invalid", "landing.leads.convert.lost");
  if (!lead.phone) return failure("invalid", "landing.leads.convert.noPhone");
  const sel = lead.sel;
  // a v3 selection (store intent, R2) goes through the products picker: P4 dispatches on `sel.v`
  const selection =
    sel && sel.v === 2 && sel.bundleId
      ? { offerId: sel.bundleId, units: sel.units, extras: sel.extras ?? {}, bump: !!sel.bump }
      : { offerId: "", units: [], extras: {}, bump: false };
  const v = input.data;
  const res = await convert(ctx, leadId, {
    selection,
    customer: { name: v.name, phone: lead.phone, city: v.city, ...(v.address ? { address: v.address } : {}), ...(v.note ? { note: v.note } : {}) },
    confirmed: v.confirmed,
    idem: v.idem,
  });
  if (!res.ok) return { ok: false, error: res.error, ...(res.message ? { message: res.message } : {}) };
  const marked = await markLeadConverted(ctx.scope, leadId, res.data.orderId, "agent");
  if (!marked.ok) return failure("not_found", "landing.leads.notFound");
  return { ok: true, orderId: marked.orderId, already: marked.already };
}
