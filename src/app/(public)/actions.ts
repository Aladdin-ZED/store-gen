"use server";
/**
 * Actions shared by the public sign-in pages (docs/STORE-SAAS.md §B.1, §I.5).
 */
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getSignedInUser } from "@/lib/auth";
import { LOCALE_COOKIE, localeCookieOptions } from "@/lib/auth/locale";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { isAdminLocale } from "@/lib/i18n/admin";
import { assertActionOrigin } from "@/lib/tenancy/seam";

/** The language menu: a preference cookie, and the account's own language when someone is signed in. */
export async function setLocaleAction(locale: unknown): Promise<void> {
  await assertActionOrigin();
  if (!isAdminLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, localeCookieOptions());
  const user = await getSignedInUser();
  if (user && user.locale !== locale) await db.update(users).set({ locale }).where(eq(users.id, user.id));
}
