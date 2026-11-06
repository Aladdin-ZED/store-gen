"use server";
/**
 * Settings → Address (P2 SHELL; platform.md PLA-§22.10.2, §M.1; docs/STORE-SAAS.md §C.7, ENGC-30): `renameHandleAction`,
 * `domains.manage`, through P2's `renameHandle` (the member's own scope; once per 30 days counted from the creation or
 * the last rename, the conversion's free rename honoured once; format, reserved and brand checks; the old handle
 * redirects 12 months; live pages re-rendered at the new address). Its `HandleError` codes are the seam's mapping:
 * `handle_format` / `handle_reserved` / `handle_protected` / … (`invalid` with the problem), `handle_unavailable`,
 * `handle_too_soon`, `conflict`, each with its `error.<code>` sentence. The body is `return storeAction(…)` (lint L9).
 */
import { revalidateStore } from "@/lib/admin-data/shell";
import { renameHandle } from "@/lib/tenancy/handles";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { parseInput, RenameHandleInput } from "@/components/admin/shell/action-inputs";

export async function renameHandleAction(input: unknown): Promise<ActionResult<{ handle: string; href: string }>> {
  return storeAction("domains.manage", async (ctx) => {
    const { handle } = parseInput(RenameHandleInput, input);
    await renameHandle(ctx, handle);
    // the old dashboard path redirects too; the new one is where the client goes next
    revalidateStore(ctx.store.handle, { path: "", type: "layout" });
    return { handle, href: appHref(handle, "/settings/address") };
  });
}
