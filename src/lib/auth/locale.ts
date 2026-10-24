import "server-only";
/**
 * Which language an identity page renders in (docs/STORE-SAAS.md §I.5): a signed-in user's `users.locale`, else the
 * visitor's choice on the public pages (the `__Host-sgl` preference cookie, set by the language menu), else the browser's
 * `Accept-Language` among ar / fr / en, else English. `dir="rtl"` for Arabic.
 */
import { cookies, headers } from "next/headers";
import { isAdminLocale, type AdminLocale } from "@/lib/i18n/admin";
import { IS_PROD } from "./config";

/**
 * A preference, not a credential: readable by no script that matters, never a secret. §C.9 rev 3 (SEC-13): `__Host-`
 * in production like every platform cookie (Secure, Path=/, no Domain), so a sibling store subdomain can't plant it
 * (review r1.0-t2 F7). `sg_lang`, the T2 name before the fix, is still read until the cookie is set again.
 */
export const LOCALE_COOKIE = IS_PROD ? "__Host-sgl" : "sgl";
const LEGACY_LOCALE_COOKIE = "sg_lang";
export const LOCALE_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

export const localeCookieOptions = () => ({ httpOnly: true, secure: IS_PROD, sameSite: "lax" as const, path: "/", maxAge: LOCALE_COOKIE_MAX_AGE_SEC });

/** The best of ar / fr / en in an Accept-Language header (q-values honoured), or null. Pure. */
export function localeFromAcceptLanguage(header: string | null | undefined): AdminLocale | null {
  if (!header) return null;
  const ranked = header
    .slice(0, 400)
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: tag.trim().toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((r) => r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  return ranked.map((r) => r.lang).find(isAdminLocale) ?? null;
}

/** The public pages' locale: the visitor's choice, else the browser's, else English. */
export async function publicLocale(): Promise<AdminLocale> {
  const jar = await cookies();
  const chosen = jar.get(LOCALE_COOKIE)?.value ?? jar.get(LEGACY_LOCALE_COOKIE)?.value;
  if (isAdminLocale(chosen)) return chosen;
  return localeFromAcceptLanguage((await headers()).get("accept-language")) ?? "en";
}

/** A signed-in viewer's locale: their own setting first. */
export async function viewerLocale(user: { locale: AdminLocale | null } | null): Promise<AdminLocale> {
  return user?.locale ?? (await publicLocale());
}
