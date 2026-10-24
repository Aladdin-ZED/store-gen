import "server-only";
/**
 * `/app/account` profile (docs/STORE-SAAS.md §B.1, §I.5; PLA-§22.5): the signed-in user's own name, phone and admin
 * interface language. The e-mail is read-only in R1 (it is the invite binding of D10 and the sign-in name).
 *
 *   export async function updateProfileAction(input: unknown) { return userAction((ctx) => updateOwnProfile(ctx, input)); }
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import type { MessageKey, UserCtx } from "@/lib/tenancy/types";
import { FieldsError } from "./errors";
import { NameInput, getUserById, parseAccountPhone } from "./users";

const ProfileInput = z.object({
  name: z.string().max(400),
  phone: z.string().max(64).optional(),
  locale: z.enum(["ar", "fr", "en"]),
});

export interface Profile {
  name: string;
  email: string;
  phone: string | null;
  locale: "ar" | "fr" | "en" | null;
}

export async function getOwnProfile(ctx: UserCtx): Promise<Profile> {
  const row = await getUserById(ctx.user.id);
  const locale = row?.locale === "ar" || row?.locale === "fr" || row?.locale === "en" ? row.locale : null;
  return { name: row?.name ?? ctx.user.name, email: row?.email ?? ctx.user.email, phone: row?.phone ?? null, locale };
}

/** Throws FieldsError (`name`, `phone`, `locale` → message keys). */
export async function updateOwnProfile(ctx: UserCtx, input: unknown): Promise<Profile> {
  const parsed = ProfileInput.safeParse(input);
  if (!parsed.success) throw new FieldsError({ [String(parsed.error.issues[0]?.path[0] ?? "name")]: "error.invalid" });
  const fields: Record<string, MessageKey> = {};
  const name = NameInput.safeParse(parsed.data.name);
  if (!name.success) fields.name = "auth.name_invalid";
  let phone: string | null = null;
  try {
    phone = parseAccountPhone(parsed.data.phone);
  } catch (err) {
    if (!(err instanceof FieldsError)) throw err;
    Object.assign(fields, err.fields);
  }
  if (Object.keys(fields).length || !name.success) throw new FieldsError(fields);
  await db.update(users).set({ name: name.data, phone, locale: parsed.data.locale }).where(eq(users.id, ctx.user.id));
  await audit("auth.user.profile_updated", { userId: ctx.user.id, target: ctx.user.id, meta: { locale: parsed.data.locale, phone: phone !== null }, ip: ctx.actor.ip });
  return { name: name.data, email: ctx.user.email, phone, locale: parsed.data.locale };
}

/**
 * The language menu's account half (review r1.0-t2 F9, §E.3 rule 7: src/app holds no db import): the signed-in
 * user's own `users.locale`, only when it changes.
 */
export async function updateOwnLocale(user: { id: string; locale: "ar" | "fr" | "en" | null }, locale: "ar" | "fr" | "en"): Promise<void> {
  if (user.locale === locale) return;
  await db.update(users).set({ locale }).where(eq(users.id, user.id));
}
