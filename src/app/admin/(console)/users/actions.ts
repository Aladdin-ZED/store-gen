"use server";
/**
 * People actions of the console (P1 CONSOLE; platform.md PLA-§11.2, §M.1, PD81). A platform action file (lint L9):
 * every export is `return platformAction("users.manage", fn, { stepUp: true })`; `p:users:manage:<staffId>` 30/h
 * (src/lib/platform/people.ts). Each write takes the sheet's `opId` and ends with `refresh()`.
 *
 *   await banUserAction({ userId, reason, note, suspendStores: true, opId });
 *   await deleteUserAction({ userId, reason, typedEmail, opId });   // the user's e-mail typed (checked here)
 */
import { FieldsError } from "@/lib/auth/errors";
import { getUserById } from "@/lib/auth/users";
import { done, opOf, withOp } from "@/lib/platform/op-dedupe";
import { banPerson, createPersonResetLink, deletePerson, resetPersonTwoFactor, signOutPerson, unbanPerson, type DeleteResult } from "@/lib/platform/people";
import { addNote } from "@/lib/platform/notes";
import { platformAction } from "@/lib/platform/seam";
import type { ActionResult } from "@/lib/tenancy/types";

type Op = { opId?: string };
type Target = { userId: string };

/** `users.manage` ↑: ban (sessions end; optionally suspending the stores the person owns alone). */
export async function banUserAction(input: Target & { reason: string; note?: string; suspendStores?: boolean } & Op): Promise<ActionResult<{ banned: true; suspended: string[]; skipped: string[] }>> {
  return platformAction("users.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await banPerson(ctx, input))), { stepUp: true });
}

/** `users.manage` ↑: lift a ban. */
export async function unbanUserAction(input: Target & { note?: string } & Op): Promise<ActionResult<{ unbanned: true }>> {
  return platformAction(
    "users.manage",
    (ctx) =>
      withOp(ctx, opOf(input), async () => {
        await unbanPerson(ctx, input);
        return done({ unbanned: true as const });
      }),
    { stepUp: true },
  );
}

/** `users.manage` ↑: the person's 2FA is reset (they enrol again at the next sign-in). */
export async function resetUser2faAction(input: Target & { reason: string } & Op): Promise<ActionResult<{ reset: true }>> {
  return platformAction(
    "users.manage",
    (ctx) =>
      withOp(ctx, opOf(input), async () => {
        await resetPersonTwoFactor(ctx, input);
        return done({ reset: true as const });
      }),
    { stepUp: true },
  );
}

/** `users.manage` ↑: a one-time password reset link, shown once (shared by WhatsApp by the staff member). */
export async function createResetLinkAction(input: Target & { reason: string } & Op): Promise<ActionResult<{ url: string; expiresAt: string; waTo: string | null }>> {
  return platformAction("users.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await createPersonResetLink(ctx, input))), { stepUp: true });
}

/** `users.manage` ↑: every session of the person ends. */
export async function signOutUserAction(input: Target & { reason: string } & Op): Promise<ActionResult<{ sessions: number }>> {
  return platformAction("users.manage", (ctx) => withOp(ctx, opOf(input), async () => done(await signOutPerson(ctx, input))), { stepUp: true });
}

/**
 * `users.manage` ↑ (PD81): T2's `deleteUserAccount` with a reason and the person's e-mail typed in full (compared here,
 * case-insensitively); `owns_store` and `is_staff` come back as data with the stores to close first.
 */
export async function deleteUserAction(input: Target & { reason: string; note?: string; typedEmail: string } & Op): Promise<ActionResult<DeleteResult>> {
  return platformAction(
    "users.manage",
    (ctx) =>
      withOp(ctx, opOf(input), async () => {
        const user = typeof input?.userId === "string" ? await getUserById(input.userId) : null;
        const typed = typeof input?.typedEmail === "string" ? input.typedEmail.trim().toLowerCase() : "";
        if (!user || !typed || typed !== user.email.trim().toLowerCase()) throw new FieldsError({ typedEmail: "console.users.delete.typed_mismatch" });
        return done(await deletePerson(ctx, input));
      }),
    { stepUp: true },
  );
}

/** `stores.notes` (PLA-§11.2 Notes tab, §7.12): a note on the person (≤ 4,000 characters, ≤ 20 mentions); edit, pin and delete are the store notes' actions (by note id). */
export async function addUserNoteAction(input: Target & { body: string; kind?: "note" | "decision" | "warning"; pinned?: boolean; mentions?: string[] } & Op): Promise<ActionResult<{ id: string }>> {
  return platformAction("stores.notes", (ctx) => withOp(ctx, opOf(input), async () => done(await addNote(ctx, { ...input, userId: typeof input?.userId === "string" ? input.userId : "", storeId: undefined }))));
}
