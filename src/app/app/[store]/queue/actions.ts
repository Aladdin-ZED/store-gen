"use server";
/**
 * The queue's server actions (P4 CALL CENTER; operations.md §M.3, OPE-§5, §6, §8.2, §4.1, §5.7). The console itself
 * talks to the four hot-path routes (`/api/app/<h>/ops/*`, OD36); these serve the drawer ("Take this order", "Show
 * number", outcomes outside the queue), ⌘K and the inbound lookup field. Every body is `return storeAction(…)` through
 * the store's seam; the queue's functions answer their own result inside `data` (an order the member may not touch
 * answers `not_found` there, exactly like another store's id).
 *
 *   nextOrderAction       agents.self, `claim` 120 / min (charged by nextOrder)
 *   releaseOrderAction    agents.self (Skip / Break of the held order)
 *   setPresenceAction     agents.self
 *   recordOutcomeAction   orders.write (+ the next card with `andNext`)
 *   revealPhoneAction     orders.reveal_phone (sensitive), `reveal` 300 / h (charged by revealPhone)
 *   addNoteAction         orders.write; the claim holder's lease renewed
 *   editNoteAction        orders.write (the author, within 5 minutes)
 *   takeOrderAction       agents.self, `claim` 120 / min; `inbound` for the ids of the agent's lookups
 *   inboundLookupAction   agents.self, `inbound` 60 / h (charged by inboundLookup)
 *   queueScriptAction     orders.read: the script panel's ar / fr / en tab (the order's visibility rule)
 *   queueTimelineAction   orders.read: the desktop console's timeline column (the drawer's visibility rule)
 */
import { z } from "zod";
import { cardRow } from "@/lib/callcenter/card";
import { inboundLookup } from "@/lib/callcenter/inbound";
import { OutcomeInput, recordOutcome } from "@/lib/callcenter/outcomes";
import { setPresence } from "@/lib/callcenter/presence";
import { revealPhone, type RevealWhy } from "@/lib/callcenter/reveal";
import { SCRIPT_LOCALES } from "@/lib/callcenter/script";
import { compileScript } from "@/lib/callcenter/script.server";
import { viewerSeesOrder } from "@/lib/callcenter/visibility";
import { addNote, editNote, orderTimeline, viewerOf } from "@/lib/orders/events";
import { nextOrder, releaseOrder, renewLease, takeOrder } from "@/lib/orders/queue";
import { storeAction } from "@/lib/tenancy/seam";

const Idem = z.uuid({ error: "Unknown request." });
const OrderId = z.string().trim().toUpperCase().max(20, { error: "Unknown order." });
const Why = z.enum(["call", "whatsapp", "view"], { error: "Unknown reason." });
const Presence = z.enum(["online", "break", "offline"], { error: "Unknown presence." });
const NoteId = z.number().int().positive({ error: "Unknown note." });

export async function nextOrderAction(idem: string) {
  return storeAction("agents.self", (ctx) => nextOrder(ctx, { idem: Idem.parse(idem) }));
}

export async function releaseOrderAction(orderId: string, why: "skip" | "break") {
  return storeAction("agents.self", (ctx) => releaseOrder(ctx, OrderId.parse(orderId), z.enum(["skip", "break"]).parse(why)));
}

export async function setPresenceAction(presence: "online" | "break" | "offline") {
  return storeAction("agents.self", (ctx) => setPresence(ctx, Presence.parse(presence)));
}

export async function recordOutcomeAction(input: OutcomeInput) {
  return storeAction("orders.write", (ctx) => recordOutcome(ctx, OutcomeInput.parse(input)));
}

export async function revealPhoneAction(orderId: string, why: RevealWhy, opts: { templateId?: string; idem?: string } = {}) {
  return storeAction("orders.reveal_phone", (ctx) => {
    const o = z.strictObject({ templateId: z.string().max(40).optional(), idem: z.uuid().optional() }).parse(opts);
    return revealPhone(ctx, OrderId.parse(orderId), Why.parse(why), o);
  });
}

export async function addNoteAction(orderId: string, text: string) {
  return storeAction("orders.write", async (ctx) => {
    const id = OrderId.parse(orderId);
    const r = await addNote(ctx, id, z.string().max(2_000).parse(text));
    if (r.ok) await renewLease(ctx.scope, id, ctx.user.id);
    return r;
  });
}

export async function editNoteAction(orderId: string, eventId: number, text: string) {
  return storeAction("orders.write", (ctx) => editNote(ctx, OrderId.parse(orderId), NoteId.parse(eventId), z.string().max(2_000).parse(text)));
}

export async function takeOrderAction(orderId: string, opts: { inbound?: boolean } = {}) {
  return storeAction("agents.self", (ctx) => takeOrder(ctx, OrderId.parse(orderId), { inbound: z.strictObject({ inbound: z.boolean().optional() }).parse(opts).inbound === true }), {
    rate: { name: "claim", limit: 120, windowSec: 60 },
  });
}

export async function inboundLookupAction(phone: string) {
  return storeAction("agents.self", (ctx) => inboundLookup(ctx, z.string().max(64).parse(phone)));
}

/** The script panel's language tab (OPE-§7.2: ar / fr / en): the order's script compiled in `locale`. */
export async function queueScriptAction(orderId: string, locale: string) {
  return storeAction("orders.read", async (ctx) => {
    const id = OrderId.parse(orderId);
    const loc = z.enum(SCRIPT_LOCALES).parse(locale);
    const row = await cardRow(ctx.scope, id);
    if (!row || !viewerSeesOrder(ctx.scope, viewerOf(ctx), row, true)) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, script: await compileScript(ctx.scope, row, ctx, { locale: loc }) };
  });
}

/** The desktop console's right column: the held order's timeline (OPE-§4.1, §13.1), the visibility rule of the drawer. */
export async function queueTimelineAction(orderId: string) {
  return storeAction("orders.read", (ctx) => orderTimeline(ctx.scope, ctx, OrderId.parse(orderId), { limit: 20 }));
}
