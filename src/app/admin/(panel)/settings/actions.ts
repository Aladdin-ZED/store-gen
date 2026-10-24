"use server";
/**
 * Settings mutations. Values are validated by the settings registry schemas (setSetting /
 * updateSetting throw ZodError → field message), audited by the settings layer, and secrets are
 * only ever replaced — masked values coming back from a form keep the stored secret.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, fail, type ActionResult } from "@/lib/admin-data/action";
import { legacyReadCtx } from "@/lib/admin-data/legacy-store";
import { auditPage, AUDIT_AREAS, revokeDeviceSession, temporaryPassword, type AuditRow } from "@/lib/admin-data/security";
import {
  can,
  changePassword,
  createUser,
  isRole,
  resetUserPassword,
  resetUserTwoFactor,
  revokeOtherSessions,
  setUserDisabled,
  setUserRole,
} from "@/lib/auth";
import { invalidatePublished } from "@/lib/render/cache.server";
import { getSetting, isMaskedSecret, redactSetting, setSetting, updateSetting, type SettingInput } from "@/lib/settings";

function refreshSettings() {
  revalidatePath("/admin/settings", "layout");
  revalidatePath("/admin");
}

/* ------------------------------------------------------------------ */
/* store / market / pixels / ai / anti-spam                            */
/* ------------------------------------------------------------------ */

export async function saveStoreAction(input: SettingInput<"store">): Promise<ActionResult<null>> {
  return adminAction("settings.write", async ({ actor }) => {
    await setSetting("store", input, actor);
    // legal pages and footers read the store identity at request time
    invalidatePublished();
    refreshSettings();
    return null;
  });
}

export async function saveDefaultsAction(input: SettingInput<"defaults">): Promise<ActionResult<null>> {
  return adminAction("settings.write", async ({ actor }) => {
    await setSetting("defaults", input, actor);
    refreshSettings();
    return null;
  });
}

export async function saveAiAction(input: SettingInput<"ai">): Promise<ActionResult<null>> {
  return adminAction("settings.write", async ({ actor }) => {
    await setSetting("ai", input, actor);
    refreshSettings();
    revalidatePath("/admin/media");
    return null;
  });
}

export async function saveTurnstileAction(input: Partial<SettingInput<"turnstile">>): Promise<ActionResult<{ siteKey?: string; secretKey?: string }>> {
  return adminAction("settings.write", async ({ actor }) => {
    // both keys or none: check the merged result before writing anything
    const current = await getSetting("turnstile", { fresh: true });
    const pick = (next: string | undefined, stored: string | undefined) => (next === undefined || isMaskedSecret(next) ? stored : next.trim() || undefined);
    if (!!pick(input.siteKey, current.siteKey) !== !!pick(input.secretKey, current.secretKey)) {
      fail("Add both keys — the site key and the secret key work together.");
    }
    const saved = await updateSetting("turnstile", input, actor);
    refreshSettings();
    return redactSetting("turnstile", saved);
  });
}

/* ------------------------------------------------------------------ */
/* own account                                                         */
/* ------------------------------------------------------------------ */

const PasswordChange = z
  .object({
    current: z.string().min(1, { error: "Enter your current password." }).max(200),
    next: z.string().min(1, { error: "Choose a new password." }).max(200),
    confirm: z.string().max(200),
  })
  .refine((v) => v.next === v.confirm, { error: "The two new passwords don't match.", path: ["confirm"] });

export async function changePasswordAction(input: { current: string; next: string; confirm: string }): Promise<ActionResult<null>> {
  return adminAction(null, async () => {
    const v = PasswordChange.parse(input);
    await changePassword(v.current, v.next);
    revalidatePath("/admin/settings/security");
    return null;
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult<null>> {
  return adminAction(null, async ({ user, actor }) => {
    if (sessionId === user.sessionId) fail("Use “Sign out” to end this session.");
    if (!(await revokeDeviceSession(user.id, z.string().parse(sessionId), actor))) fail("That session has already ended.");
    revalidatePath("/admin/settings/security");
    return null;
  });
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<{ count: number }>> {
  return adminAction(null, async () => {
    const count = await revokeOtherSessions();
    revalidatePath("/admin/settings/security");
    return { count };
  });
}

/* ------------------------------------------------------------------ */
/* team (owner)                                                        */
/* ------------------------------------------------------------------ */

const UserId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown user." });
const Role = z.custom<"owner" | "editor" | "agent">((v) => isRole(v), { error: "Unknown role." });
const Invite = z.object({
  name: z.string().trim().min(1, { error: "Enter a name." }).max(120),
  email: z.email({ error: "Enter a valid email address." }).max(191),
  role: Role,
});

export async function inviteUserAction(input: { name: string; email: string; role: string }): Promise<ActionResult<{ email: string; password: string }>> {
  return adminAction("users.manage", async ({ actor }) => {
    const v = Invite.parse(input);
    const password = temporaryPassword();
    const created = await createUser({ email: v.email, name: v.name, role: v.role, password }, actor);
    revalidatePath("/admin/settings/team");
    return { email: created.email, password };
  });
}

export async function setUserRoleAction(userId: string, role: string): Promise<ActionResult<null>> {
  return adminAction("users.manage", async ({ user, actor }) => {
    const id = UserId.parse(userId);
    if (id === user.id) fail("You can't change your own role — ask another owner.");
    await setUserRole(actor, id, Role.parse(role));
    revalidatePath("/admin/settings/team");
    return null;
  });
}

export async function setUserDisabledAction(userId: string, disabled: boolean): Promise<ActionResult<null>> {
  return adminAction("users.manage", async ({ user, actor }) => {
    const id = UserId.parse(userId);
    if (id === user.id) fail("You can't disable your own account.");
    await setUserDisabled(actor, id, z.boolean().parse(disabled));
    revalidatePath("/admin/settings/team");
    return null;
  });
}

export async function resetUserPasswordAction(userId: string): Promise<ActionResult<{ password: string }>> {
  return adminAction("users.manage", async ({ user, actor }) => {
    const id = UserId.parse(userId);
    if (id === user.id) fail("Change your own password in Security.");
    const password = temporaryPassword();
    await resetUserPassword(actor, id, password);
    revalidatePath("/admin/settings/team");
    return { password };
  });
}

/** Turns off another member's two-step verification (lost phone / unknown authenticator) and signs them out. */
export async function resetUserTwoFactorAction(userId: string): Promise<ActionResult<null>> {
  return adminAction("users.manage", async ({ user, actor }) => {
    const id = UserId.parse(userId);
    if (id === user.id) fail("Turn off your own two-step verification in Security.");
    await resetUserTwoFactor(actor, id);
    revalidatePath("/admin/settings/team");
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* audit log (owner)                                                   */
/* ------------------------------------------------------------------ */

export async function loadAuditAction(opts: { beforeId?: number; area?: string }): Promise<ActionResult<{ items: AuditRow[]; nextBefore: number | null }>> {
  return adminAction("users.manage", async () => {
    const parsed = z
      .object({ beforeId: z.number().int().positive().optional(), area: z.enum(AUDIT_AREAS).optional() })
      .parse({ beforeId: opts.beforeId, area: opts.area || undefined });
    const { scope } = await legacyReadCtx("audit.read");
    return auditPage(scope, { ...parsed, limit: 50 });
  });
}
