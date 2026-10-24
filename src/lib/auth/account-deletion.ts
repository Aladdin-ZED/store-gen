import "server-only";
/**
 * `deleteUserAccount(ctx, target?)` (docs/STORE-SAAS.md §F.9 "Account deletion", rev 3 SEC-20; rev 4 PLA Q4.7):
 *
 *   self    UserCtx, no target: `/app/account/danger` (P2 in R1)
 *   staff   PlatformCtx + `users.manage` with a fresh step-up + `{ userId, reason }`: the console's user profile (P1);
 *           never oneself
 *
 * Refused with `owns_store` while the user owns a store that is not purged (close it and let deletion run, or
 * transfer it in R3) and with `is_staff` while a platform role is set (demote first, PLA-§14.1). Otherwise, in one
 * transaction: the user row is anonymised (e-mail → `deleted+<ulid>@invalid`, name emptied, phone and locale nulled,
 * an unusable password hash, 2FA cleared, `disabled = 1`), `identity_links`, `sessions`, `password_resets` and
 * `notification_reads` are deleted, `legal_acceptances` keep their proof with `ua` nulled, the user's remaining
 * (non-owner) memberships end, and `audit_log` keeps its rows with the user id. Audit `platform.user.deleted`
 * (`{ reason }`, no e-mail or name) or `auth.account.deleted` (no meta), plus `store.member.removed` in every store the
 * user left. All of it is `needs_legal_review` for the lawyer pass (§F.9).
 */
import { and, eq, ne } from "drizzle-orm";
import { audit, auditFrom } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { identityLinks, legalAcceptances, notificationReads, passwordResets, sessions, storeMembers, stores, users } from "@/lib/db/schema";
import type { PlatformCtx, UserCtx } from "@/lib/tenancy/types";
import { AuthRefusal } from "./errors";
import { getUserById, staffReason } from "./users";

const isPlatformCtx = (ctx: UserCtx | PlatformCtx): ctx is PlatformCtx => "role" in ctx && "can" in ctx;

/** A hash `verifyPassword` can never match (it does not parse; the check burns the dummy hash instead). */
const NO_PASSWORD = "!deleted";

export async function deleteAccount(ctx: UserCtx | PlatformCtx, target?: { userId: string; reason: string }): Promise<void> {
  let userId: string;
  let reason: string | null = null;
  if (isPlatformCtx(ctx)) {
    if (!ctx.can("users.manage")) throw new AuthRefusal("forbidden");
    if (!ctx.stepUpFresh) throw new AuthRefusal("step_up");
    if (!target || typeof target.userId !== "string") throw new AuthRefusal("invalid");
    if (target.userId === ctx.user.id) throw new AuthRefusal("forbidden", "auth.staff.not_yourself");
    reason = staffReason(target.reason);
    userId = target.userId;
  } else {
    if (target) throw new AuthRefusal("forbidden");
    userId = ctx.user.id;
  }

  const user = await getUserById(userId);
  if (!user || user.disabledReason === "deleted") throw new AuthRefusal("not_found");
  if (user.platformRole !== "none") throw new AuthRefusal("is_staff", "auth.account.is_staff");

  const left = await db.transaction(async (tx) => {
    // the memberships, locked: a concurrent "make owner" waits for this decision
    const memberships = await tx
      .select({ storeId: storeMembers.storeId, role: storeMembers.role, storeStatus: stores.status })
      .from(storeMembers) // tenancy: platform the user's own memberships (§F.9 account deletion)
      .innerJoin(stores, eq(stores.id, storeMembers.storeId))
      .where(eq(storeMembers.userId, userId))
      .for("update");
    if (memberships.some((m) => m.role === "owner" && m.storeStatus !== "purged")) throw new AuthRefusal("owns_store", "auth.account.owns_store");

    const now = new Date();
    await tx
      .update(users)
      .set({
        email: `deleted+${newId().toLowerCase()}@invalid`,
        name: "",
        phone: null,
        locale: null,
        passwordHash: NO_PASSWORD,
        totpEnabled: false,
        totpSecretEnc: null,
        recoveryCodes: null,
        disabled: true,
        disabledReason: "deleted",
        disabledAt: now,
      })
      .where(eq(users.id, userId));
    await tx.delete(identityLinks).where(eq(identityLinks.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(passwordResets).where(eq(passwordResets.userId, userId));
    await tx.delete(notificationReads).where(eq(notificationReads.userId, userId));
    // tenancy: platform the user's own acceptances keep their proof, without the user agent (§F.9)
    await tx.update(legalAcceptances).set({ ua: null }).where(eq(legalAcceptances.userId, userId));
    // tenancy: platform the user's remaining memberships end with the account (owners were refused above)
    await tx.delete(storeMembers).where(and(eq(storeMembers.userId, userId), ne(storeMembers.role, "owner")));
    return memberships.filter((m) => m.role !== "owner");
  });

  for (const m of left) {
    await audit("store.member.removed", {
      userId: isPlatformCtx(ctx) ? ctx.user.id : userId,
      target: userId,
      meta: { reason: "account_deleted", role: m.role, ...(isPlatformCtx(ctx) ? {} : { self: true }) },
      ip: ctx.actor.ip,
      scope: { storeId: m.storeId, actorKind: isPlatformCtx(ctx) ? "platform" : "user" },
    });
  }
  if (isPlatformCtx(ctx)) await auditFrom(ctx, "platform.user.deleted", { target: userId, meta: { reason } });
  else await audit("auth.account.deleted", { userId, target: userId, ip: ctx.actor.ip });
}
