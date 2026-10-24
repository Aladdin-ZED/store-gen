import "server-only";
/**
 * "Require two-step verification for members" (docs/STORE-SAAS.md §B.7, D12; store Settings → Security, `security.write`).
 * Only an owner who has TOTP can turn it on (an owner without it would lock themselves out of their own dashboard);
 * any holder of `security.write` can turn it off. While on, `requireStoreMember` sends every member without TOTP to
 * the enrolment page. Audit `store.2fa_required_changed`; the store row cache is dropped so the next request sees it.
 *
 *   export async function saveRequire2fa(on: boolean) { return storeAction("security.write", (ctx) => setRequireMember2fa(ctx, on)); }
 */
import { eq } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { invalidateStore } from "@/lib/tenancy/cache";
import type { WriteCtx } from "@/lib/tenancy/types";
import { AuthRefusal } from "./errors";

export async function setRequireMember2fa(ctx: WriteCtx, on: boolean): Promise<{ requireMember2fa: boolean }> {
  if (typeof on !== "boolean") throw new AuthRefusal("invalid");
  if (on && (ctx.membership.role !== "owner" || !ctx.user.totpEnabled)) throw new AuthRefusal("forbidden", "store.security.2fa_owner_only");
  if (ctx.store.requireMember2fa === on) return { requireMember2fa: on };
  await db.update(stores).set({ requireMember2fa: on }).where(eq(stores.id, ctx.scope.storeId));
  invalidateStore(ctx.scope.storeId);
  await auditFrom(ctx, "store.2fa_required_changed", { target: ctx.store.id, meta: { from: ctx.store.requireMember2fa, to: on } });
  return { requireMember2fa: on };
}
