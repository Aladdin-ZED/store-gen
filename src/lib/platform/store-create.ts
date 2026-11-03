import "server-only";
/**
 * Store creation from the console (platform.md PLA-§6.2, core §A.5.1 "console create internal store"; `stores.create`):
 * internal and partner stores made by staff at `/admin/stores/new`.
 *
 *   const r = await createStore(ctx, { name, handle, mode, market, currency, timezone, plan, ownerEmail, note });
 *   // { storeId, handle } | FieldsError({ name | handle | ownerEmail | note: key })
 *
 * The rows are the core's: T2's `insertStoreTx` (src/lib/auth/stores.ts, read-only here) writes the `stores` row
 * (status `active`, `approved_by` = the staff member) and the owner membership through the seam's new-store scope, the
 * same path `/admin/setup/store` and every signup take, so the creation paths never drift. In the same transaction
 * the store gets its approved `signup_reviews` row (`reason_code = "console_created"`, the queue's bookkeeping, P1's
 * table) through that same scope. Then `store.created { via: "console" }` is audited in the store.
 *
 * Protected terms (PD70, D76): staff may use one, but each field that matches exactly needs the staff note (the
 * override is the caller's, `checkBrandTerms` gives the same verdict to staff). The handle's reserved list and its
 * quarantine always apply; a protected handle is allowed with the note.
 */
import { z } from "zod";
import { audit } from "@/lib/audit";
import { FieldsError } from "@/lib/auth/errors";
import { platformSetting } from "@/lib/auth/platform-config";
import { cleanStoreName, insertStoreTx } from "@/lib/auth/stores";
import { getUserByEmail, getUserById, isDuplicate } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { plans, signupReviews, type SignupSignals } from "@/lib/db/schema";
import { handleIsFree, loadHandleLists } from "@/lib/db/store-handles";
import { MARKETS } from "@/lib/page/schema";
import { handleProblem, isHandle } from "@/lib/tenancy/handles";
import { storeValues } from "@/lib/tenancy/sql";
import type { MessageKey, PlatformCtx, WriteScope } from "@/lib/tenancy/types";
import { eq } from "drizzle-orm";
import { AuthRefusal } from "@/lib/auth/errors";
import { checkBrandTerms } from "./brand-check";
import { invalidateQueueSnapshot } from "./queue-cache";

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const CreateStoreInput = z.object({
  name: z.string().max(200),
  handle: z.string().trim().toLowerCase().max(64),
  mode: z.enum(["landing", "store", "both"]).default("landing"),
  market: z.enum(MARKETS).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  timezone: z.string().trim().max(40).refine(validZone, "invalid time zone").optional(),
  plan: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/)
    .default("internal"),
  /** an existing user by exact e-mail; default the staff member */
  ownerEmail: z.string().trim().toLowerCase().max(191).optional(),
  /** required when a field carries a protected term (PD70) */
  note: z.string().trim().max(500).optional(),
});
export type CreateStoreInput = z.input<typeof CreateStoreInput>;

/**
 * The review row's signals of a console-made store: no flag, no score, the inputs the console knows. `via` is
 * "console" (CCR r1-p1-7 item 1 adds it to `SignupSignals.inputs.via`; the row's `reason_code` already says so).
 */
function consoleSignals(ownerEmail: string, market: string, mode: "landing" | "store" | "both", locale: "ar" | "fr" | "en"): SignupSignals {
  return {
    v: 1,
    flags: [],
    band: "fast",
    inputs: { emailDomain: ownerEmail.split("@")[1] ?? "", phoneCountry: null, market, mode, locale, uaLabel: "console", turnstile: "off", formMs: null, via: "console" as SignupSignals["inputs"]["via"] },
    cluster: { users: 0, banned: 0, kinds: [] },
    partial: false,
    ms: 0,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The approved review row of the new store, on the creator scope of the same transaction. */
async function insertReviewTx(tx: Tx, scope: WriteScope, row: Omit<typeof signupReviews.$inferInsert, "storeId">): Promise<void> {
  await tx.insert(signupReviews).values(storeValues(scope, row));
}

/** `stores.create`: an active store with its owner, its approved review row, audited `store.created { via: "console" }`. */
export async function createStore(ctx: PlatformCtx, input: unknown): Promise<{ storeId: string; handle: string }> {
  if (!ctx.can("stores.create")) throw new AuthRefusal("forbidden");
  const parsed = CreateStoreInput.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, MessageKey> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "name")] ??= "console.store_new.invalid";
    throw new FieldsError(fields);
  }
  const v = parsed.data;
  const fields: Record<string, MessageKey> = {};
  const note = v.note ?? "";

  // name: the signup's cleaning, then the live brand check (an exact term needs the note)
  const name = cleanStoreName(v.name);
  if (!name) fields.name = "auth.signup.store_name_invalid";
  const nameVerdict = name ? await checkBrandTerms("store_name", name) : "ok";
  if (nameVerdict === "exact" && !note) fields.note = "console.store_new.brand_note_required";

  // handle: format and reserved always; a protected term with the note; free (current handles and the quarantine)
  const handle = v.handle;
  if (!isHandle(handle)) fields.handle = "auth.signup.handle_format";
  else {
    const lists = await loadHandleLists();
    const problem = handleProblem(handle, { allowProtected: true }, lists);
    if (problem === "format") fields.handle = "auth.signup.handle_format";
    else if (problem) fields.handle = "auth.signup.handle_unavailable";
    else if (!(await handleIsFree(handle, null))) fields.handle = "auth.signup.handle_unavailable";
    else if ((handleProblem(handle, {}, lists) === "protected" || (await checkBrandTerms("handle", handle)) === "exact") && !note) fields.note = "console.store_new.brand_note_required";
  }

  // the plan exists and is not retired
  const [plan] = await db.select({ id: plans.id, status: plans.status }).from(plans).where(eq(plans.id, v.plan)).limit(1);
  if (!plan || plan.status === "retired") fields.plan = "console.store_new.plan_invalid";

  // the owner: an existing, not banned, not deleted user; default the staff member
  const owner = v.ownerEmail ? await getUserByEmail(v.ownerEmail) : await getUserById(ctx.user.id);
  if (!owner || owner.disabled) fields.ownerEmail = "console.store_new.owner_unknown";

  if (Object.keys(fields).length || !name || !owner) throw new FieldsError(fields);

  const setting = await platformSetting();
  const market = v.market ?? setting.newStore.market;
  const defaults = { ...setting.newStore, currency: v.currency ?? setting.newStore.currency, timezone: v.timezone ?? setting.newStore.timezone };
  const now = new Date();
  let storeId: string;
  try {
    storeId = await db.transaction(async (tx) => {
      const created = await insertStoreTx(tx, { name, handle, mode: v.mode, status: "active", market, planId: plan!.id, createdBy: owner.id, approvedBy: ctx.user.id }, defaults);
      await insertReviewTx(tx, created.scope, {
          id: newId(),
          userId: owner.id,
          kind: "signup" as const,
          score: 0,
          signals: consoleSignals(owner.email, market, v.mode, defaults.defaultLocale),
          band: "fast" as const,
          status: "approved" as const,
          decidedBy: ctx.user.id,
          decidedAt: now,
          reasonCode: "console_created",
          ...(note ? { reasonNote: note.slice(0, 500) } : {}),
      });
      return created.storeId;
    });
  } catch (err) {
    if (isDuplicate(err)) throw new FieldsError({ handle: "auth.signup.handle_unavailable" });
    throw err;
  }
  invalidateQueueSnapshot();
  await audit("store.created", {
    userId: ctx.user.id,
    target: storeId,
    meta: { via: "console", status: "active", plan: plan!.id, mode: v.mode, market, owner: owner.id === ctx.user.id ? "self" : "user", ...(nameVerdict !== "ok" ? { brand: nameVerdict } : {}), ...(note ? { hasNote: true } : {}) },
    ip: ctx.actor.ip,
    scope: { storeId, actorKind: "platform" },
  });
  return { storeId, handle };
}
