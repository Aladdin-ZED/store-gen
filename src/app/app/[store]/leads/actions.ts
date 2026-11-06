"use server";
/**
 * The lead inbox actions (P3 LANDING; landing.md LAN-§10.3, §10.5; docs/STORE-SAAS.md §I.8 rule 2, D70, D71). Every
 * body is `return storeAction(…)`: the store is the signed request path's, the role comes from the member's grant,
 * never from the browser. Reads go through src/lib/leads/read.ts (masked by scope); writes through
 * src/lib/leads/write.ts, which keeps an agent to the leads they see (their own and the unassigned `new` ones). Each
 * write takes the browser's op id (`onceForStore`), so a retried POST answers the first result instead of writing
 * twice; Undo writes the previous value back the same way. Under "View as store" every write answers
 * `impersonation_read_only` at the seam.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { onceForStore } from "@/lib/landing/op-once.server";
import { contactHref } from "@/lib/leads/contact.server";
import { ConvertLeadInput, convertLeadFor, type ConvertOutcome } from "@/lib/leads/convert.server";
import { getLeadRow, leadCounts, listLeadRows } from "@/lib/leads/read";
import { LOST_REASONS, LeadQuery, type LeadCounts, type LeadRow, type LostReason } from "@/lib/leads/types";
import { assignLeads as assignLeadRows, logAttempt, markLost, reopenLead, setFollowUp, takeNextLead as claimNextLead, type LeadWriter } from "@/lib/leads/write";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult, StoreCtx } from "@/lib/tenancy/types";

const LeadId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "landing.leads.notFound" });
const Channel = z.enum(["whatsapp", "call"]);
const Reason = z.enum(LOST_REASONS);
const When = z.iso.datetime({ offset: true }).nullable();

const viewerOf = (ctx: StoreCtx) => ({ userId: ctx.user.id, role: ctx.membership.role });
const writerOf = (ctx: StoreCtx): LeadWriter => ({ actor: ctx.actor, role: ctx.membership.role });

/** `onceForStore` when the browser sent an op id (every inbox write does), else the write runs as is. */
const once = <T>(ctx: StoreCtx, opId: string | undefined, run: () => Promise<T>): Promise<T> => (opId ? onceForStore(ctx.scope, opId, run) : run());

/** One page of the inbox and the 30-day header (`leads.read`; agents: their own leads plus the unassigned new ones). */
export async function listLeads(q: LeadQuery): Promise<ActionResult<{ rows: LeadRow[]; next?: string; counts: LeadCounts }>> {
  return storeAction("leads.read", async (ctx) => {
    const viewer = viewerOf(ctx);
    const query = LeadQuery.parse(q ?? {});
    const [page, counts] = await Promise.all([listLeadRows(ctx.scope, query, viewer), leadCounts(ctx.scope, viewer)]);
    return { ...page, counts };
  });
}

/** One lead of the inbox (the sheet of a ⌘K result or a deep link), or null. */
export async function getLead(leadId: string): Promise<ActionResult<LeadRow | null>> {
  return storeAction("leads.read", async (ctx) => getLeadRow(ctx.scope, LeadId.parse(leadId), viewerOf(ctx)));
}

/**
 * WhatsApp or Call: one attempt (the first one moves `new` → `contacted` and takes an unassigned lead), the reveal
 * audited `lead.phone_revealed`, and the link the agent's device opens (`wa.me` with the `lead_recovery` text, or
 * `tel:`). `href` is null for a WhatsApp intent that has no phone yet.
 */
export async function logLeadAttempt(leadId: string, channel: "whatsapp" | "call", opId?: string): Promise<ActionResult<{ href: string | null; attempts: number }>> {
  return storeAction(["leads.write", "orders.reveal_phone"], (ctx) =>
    once(ctx, opId, async () => {
      const id = LeadId.parse(leadId);
      const via = Channel.parse(channel);
      const res = await logAttempt(ctx.scope, writerOf(ctx), id, via);
      if (!res.ok) return fail("landing.leads.notFound");
      const lead = await getLeadRow(ctx.scope, id, viewerOf(ctx));
      const href = lead ? await contactHref(ctx.scope, ctx.store.name, lead, res.phone, via) : null;
      return { href, attempts: res.attempts };
    }),
  );
}

/** Managers: the leads go to an active member of the store, or back to the pool (null). */
export async function assignLeads(ids: string[], userId: string | null, opId?: string): Promise<ActionResult<{ n: number }>> {
  return storeAction("orders.assign", (ctx) =>
    once(ctx, opId, async () => {
      const list = z.array(LeadId).max(200).parse(ids);
      const to = userId === null ? null : LeadId.parse(userId);
      const res = await assignLeadRows(ctx.scope, writerOf(ctx), list, to);
      if (!res.ok) return fail("landing.leads.assign.invalid");
      return { n: res.n };
    }),
  );
}

/** "Take next": the oldest unassigned `new` lead, claimed for the caller; null when none is left. */
export async function takeNextLead(): Promise<ActionResult<LeadRow | null>> {
  return storeAction("leads.write", async (ctx) => {
    const id = await claimNextLead(ctx.scope, writerOf(ctx));
    return id ? getLeadRow(ctx.scope, id, viewerOf(ctx)) : null;
  });
}

export async function markLeadLost(leadId: string, reason: LostReason, opId?: string): Promise<ActionResult<null>> {
  return storeAction("leads.write", (ctx) =>
    once(ctx, opId, async () => {
      const res = await markLost(ctx.scope, writerOf(ctx), LeadId.parse(leadId), Reason.parse(reason));
      if (!res.ok) return fail(res.error === "invalid" ? "landing.leads.lost.invalid" : "landing.leads.notFound");
      return null;
    }),
  );
}

/** The Undo of "Mark lost": the lead is open again with the follow-up it had. */
export async function reopenLeadAction(leadId: string, nextAt: string | null, opId?: string): Promise<ActionResult<null>> {
  return storeAction("leads.write", (ctx) =>
    once(ctx, opId, async () => {
      const at = When.parse(nextAt);
      const res = await reopenLead(ctx.scope, writerOf(ctx), LeadId.parse(leadId), at ? new Date(at) : null);
      if (!res.ok) return fail("landing.leads.notFound");
      return null;
    }),
  );
}

/** The next follow-up of an open lead (now … 30 days ahead), or none. */
export async function setLeadFollowUp(leadId: string, at: string | null, opId?: string): Promise<ActionResult<null>> {
  return storeAction("leads.write", (ctx) =>
    once(ctx, opId, async () => {
      const when = When.parse(at);
      const res = await setFollowUp(ctx.scope, writerOf(ctx), LeadId.parse(leadId), when ? new Date(when) : null);
      if (!res.ok) return fail(res.error === "invalid" ? "landing.leads.followUp.invalid" : "landing.leads.notFound");
      return null;
    }),
  );
}

/**
 * Convert to order (`orders.create`): P4's `convertLeadToOrder` with the lead's selection and phone (read on the
 * server), then `markLeadConverted`. The sheet's draft id is the order's `idem`: a double submit answers the first
 * order. A refusal of the order sheet comes back as `{ ok: false, … }` in `data`, so the sheet can show it inline.
 */
export async function convertLead(leadId: string, input: ConvertLeadInput, opId?: string): Promise<ActionResult<ConvertOutcome>> {
  return storeAction("orders.create", (ctx) =>
    once(ctx, opId, async () => {
      try {
        return await convertLeadFor(ctx, LeadId.parse(leadId), ConvertLeadInput.parse(input));
      } catch (err) {
        // P4's order sheet merges before this screen ships; until then its typed stub throws
        if (err instanceof Error && err.message.startsWith("not implemented")) return { ok: false, error: "feature_off", message: "landing.leads.convert.unavailable" } satisfies ConvertOutcome;
        throw err;
      }
    }),
  );
}
