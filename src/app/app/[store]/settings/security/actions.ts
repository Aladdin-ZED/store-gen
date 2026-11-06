"use server";
/**
 * Settings → Security (P2 SHELL; platform.md PLA-§22.10.3, §18.2, §M.1; docs/STORE-SAAS.md §B.7, D12):
 * `setRequireMember2faAction({ on })`, `security.write`, through T2's `setRequireMember2fa` (only an owner with TOTP
 * turns it on; audit `store.2fa_required_changed`; the store row cache dropped). Turning it on notifies every member
 * (`security.2fa_required`, linking to their two-step setup): members without it are asked to enrol at their next
 * visit. The body is `return storeAction(…)` (lint L9).
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { setRequireMember2fa } from "@/lib/auth/store-security";
import { ACCOUNT_TWO_FACTOR_PATH } from "@/lib/auth/paths";
import { notify } from "@/lib/platform/notify";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { parseInput, Require2faInput } from "@/components/admin/shell/action-inputs";

export async function setRequireMember2faAction(input: unknown): Promise<ActionResult<{ requireMember2fa: boolean }>> {
  return storeAction("security.write", async (ctx) => {
    const { on } = parseInput(Require2faInput, input);
    const was = ctx.store.requireMember2fa;
    const r = await setRequireMember2fa(ctx, on);
    if (on && !was) await notify({ audience: "store", storeId: ctx.store.id }, "security.2fa_required", {}, { link: ACCOUNT_TWO_FACTOR_PATH, severity: "warn" });
    revalidateStore(ctx.store.handle, { path: "/settings", type: "layout" });
    return r;
  });
}
