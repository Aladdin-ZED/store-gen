"use server";
/**
 * The signed-in user's own actions outside one store (P2 SHELL; platform.md PLA-§M.1, §22.3, §22.15; docs/STORE-SAAS.md
 * §B.4). Each body is `return userAction(…)` (lint L9: same origin first, then the session with MFA passed; no store).
 *
 *   setLastStoreAction(storeId)          the switcher's choice as the session's picker hint (`sessions.last_store_id`),
 *                                        only for a store the caller is a usable member of; never an authorisation
 *   acceptLegalAction({ documentIds })   the blocking re-acceptance sheet: P1's `recordReacceptance` with the context
 *                                        `reaccept`, the IP hash and the UA label; audit `auth.legal.accepted`
 *
 * Under "view as store" (a staff session with an impersonation row) both refuse: support accepts no terms on anyone's
 * behalf, and the picker hint of a support session is not the seller's.
 */
import { describeUserAgent } from "@/lib/admin-data/security";
import { audit } from "@/lib/audit";
import { userAction } from "@/lib/auth";
import { isUsableMembership, listMemberships, rememberLastStore } from "@/lib/auth/landing";
import { getRequestContext } from "@/lib/auth/request";
import { requireUserCtx } from "@/lib/auth/user-action";
import { pendingReacceptance, recordReacceptance } from "@/lib/platform/legal";
import { hashIp } from "@/lib/security/crypto";
import { SeamError } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { crossTrack, refuseUserImpersonation } from "@/components/admin/shell/action-guards";
import { AcceptLegalInput, LastStoreInput, parseInput } from "@/components/admin/shell/action-inputs";

export async function setLastStoreAction(storeId: unknown): Promise<ActionResult<null>> {
  return userAction(async (ctx) => {
    const id = parseInput(LastStoreInput, storeId);
    const { session } = await requireUserCtx();
    await refuseUserImpersonation(session, ctx.user, "setLastStoreAction", ctx.actor.ip);
    // a store the caller cannot open answers like an unknown one (no membership oracle)
    const m = (await listMemberships(ctx.user.id)).find((x) => x.storeId === id);
    if (!m || !isUsableMembership(m)) throw new SeamError("not_found");
    await rememberLastStore(ctx, id);
    return null;
  });
}

export async function acceptLegalAction(input: unknown): Promise<ActionResult<{ accepted: number }>> {
  return userAction(async (ctx) => {
    const { documentIds } = parseInput(AcceptLegalInput, input);
    const { session } = await requireUserCtx();
    await refuseUserImpersonation(session, ctx.user, "acceptLegalAction", ctx.actor.ip);
    // only documents the sheet asked this user for (P1's read; null = nothing pending, so nothing to accept)
    const pending = await pendingReacceptance(ctx.user.id);
    const asked = new Set(pending?.docs.map((d) => d.id) ?? []);
    const ids = [...new Set(documentIds)];
    if (!ids.every((id) => asked.has(id))) throw new SeamError("not_found");
    const { ip, ua } = await getRequestContext();
    let ipHash: string | null = null;
    try {
      ipHash = ip ? hashIp(ip) : null;
    } catch {
      ipHash = null;
    }
    await crossTrack(() => recordReacceptance(ctx, ids, { ipHash, uaLabel: describeUserAgent(ua || null) }));
    await audit("auth.legal.accepted", { userId: ctx.user.id, target: ctx.user.id, meta: { context: "reaccept", documents: ids.length }, ip: ctx.actor.ip });
    return { accepted: ids.length };
  });
}
