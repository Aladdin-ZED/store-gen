import "server-only";
/**
 * First run (docs/STORE-SAAS.md §B.11, AUTH-13, AUTH-15): `/admin/setup` behind the gate and SETUP_TOKEN, open only
 * while no user has `platform_role = 'super_admin'`.
 *
 *   1. `bootstrapSuperAdmin`: the account with `platform_role = 'super_admin'`; the "none yet" check and the insert run
 *      under the named lock `platformLock("setup")` (§E.7), so two setups at once create one owner
 *   2. TOTP enrolment, forced by the setup page (the console stays closed without it, §B.7)
 *   3. `createSetupStore`: the owner's first store (mode landing, market MA, plan `internal`, status `active`)
 *
 * On a legacy database the store #1 conversion already made the owner `super_admin` (§D.8), so setup stays closed.
 */
import { eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { platformLock, withNamedLock } from "@/lib/db/locks";
import { storeMembers, users } from "@/lib/db/schema";
import { setupTokenSecret } from "./config";
import { AuthBusyError, AuthRefusal, FieldsError } from "./errors";
import { platformSetting } from "./platform-config";
import { auditStoreCreated, cleanStoreName, insertStoreTx, newHandleProblem } from "./stores";
import { getUserById, insertAccount, isDuplicate, prepareAccount } from "./users";
import type { MessageKey } from "@/lib/tenancy/types";

async function superAdminExists(): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.platformRole, "super_admin")).limit(1);
  return row !== undefined;
}

/** Is `/admin/setup` open? A configured SETUP_TOKEN and no super_admin yet. */
export async function setupOpen(): Promise<boolean> {
  return setupTokenSecret() !== null && !(await superAdminExists());
}

/**
 * Step 1. Null when a super_admin exists (also when another setup won the race meanwhile). Throws FieldsError for the
 * account fields, AuthBusyError when the lock or the scrypt semaphore is busy.
 */
export async function bootstrapSuperAdmin(input: { name: string; email: string; password: string }, ctx: { ip: string | null }): Promise<{ userId: string } | null> {
  if (await superAdminExists()) return null;
  // the console's own locale follows the browser until the owner picks one
  const values = await prepareAccount({ ...input, locale: "en" });
  const r = await withNamedLock(platformLock("setup"), 5, async () => {
    if (await superAdminExists()) return null;
    try {
      // the legacy role keeps today's /admin open to the owner until the R1.0 integration removes it
      await insertAccount({ ...values, locale: null, platformRole: "super_admin", role: "owner" });
    } catch (err) {
      if (err instanceof AuthRefusal || isDuplicate(err)) throw new FieldsError({ email: "auth.setup.email_taken" });
      throw err;
    }
    return { userId: values.id };
  });
  if (!r.ran) throw new AuthBusyError();
  if (r.value) await audit("auth.setup.owner_created", { userId: r.value.userId, target: r.value.userId, meta: { platformRole: "super_admin" }, ip: ctx.ip });
  return r.value;
}

/**
 * Step 3: the owner's first store, active on the `internal` plan. Only for a super_admin with TOTP who owns no store
 * yet (a second call answers `conflict`). Field problems → FieldsError (`storeName`, `handle`).
 */
export async function createSetupStore(userId: string, input: { storeName: string; handle: string }, ctx: { ip: string | null }): Promise<{ storeId: string; handle: string }> {
  const user = await getUserById(userId);
  if (!user || user.disabled || user.platformRole !== "super_admin") throw new AuthRefusal("forbidden");
  if (!user.totpEnabled) throw new AuthRefusal("forbidden", "error.platform_2fa_required");
  const [owned] = await db.select({ storeId: storeMembers.storeId }).from(storeMembers).where(eq(storeMembers.userId, userId)).limit(1); // tenancy: platform the setup owner's memberships (§B.11)
  if (owned) throw new AuthRefusal("conflict");

  const setting = await platformSetting();
  const fields: Record<string, MessageKey> = {};
  const name = cleanStoreName(input.storeName);
  if (!name) fields.storeName = "auth.signup.store_name_invalid";
  const handle = input.handle.trim().toLowerCase();
  const problem = await newHandleProblem(handle);
  if (problem) fields.handle = problem;
  if (Object.keys(fields).length || !name) throw new FieldsError(fields);

  let storeId: string;
  try {
    storeId = await db.transaction(async (tx) => {
      const created = await insertStoreTx(tx, { name, handle, mode: "landing", status: "active", market: "MA", planId: "internal", createdBy: userId, approvedBy: userId }, setting.newStore);
      return created.storeId;
    });
  } catch (err) {
    if (isDuplicate(err)) throw new FieldsError({ handle: "auth.signup.handle_unavailable" });
    throw err;
  }
  await auditStoreCreated(storeId, userId, ctx.ip, { via: "setup", status: "active", plan: "internal" });
  return { storeId, handle };
}
