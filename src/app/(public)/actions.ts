"use server";
/**
 * Actions shared by the public sign-in pages (docs/STORE-SAAS.md §B.1, §I.5).
 */
import { cookies } from "next/headers";
import { getSignedInUser } from "@/lib/auth";
import { LOCALE_COOKIE, localeCookieOptions } from "@/lib/auth/locale";
import { updateOwnLocale } from "@/lib/auth/profile";
import { isAdminLocale } from "@/lib/i18n/admin";
import { assertActionOrigin } from "@/lib/tenancy/seam";

/** The language menu: a preference cookie, and the account's own language when someone is signed in. */
export async function setLocaleAction(locale: unknown): Promise<void> {
  await assertActionOrigin();
  if (!isAdminLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, localeCookieOptions());
  const user = await getSignedInUser();
  if (user) await updateOwnLocale(user, locale);
}
