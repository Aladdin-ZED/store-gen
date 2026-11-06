/**
 * Dates and numbers of the tracking page (P3 LANDING; landing.md LAN-§9.4, LD38). Pure and isomorphic: Latin digits
 * on every page (the money rule), the store's time zone, the shopper's language.
 *
 *   trackDay("2026-10-30T09:12:00Z", "fr", "Africa/Casablanca")      "jeu. 30 oct."
 *   trackMoment("2026-10-30T09:12:00Z", "fr", "Africa/Casablanca")   "jeu. 30 oct., 10:12"
 *   maskPhoneLast4("+212612345678")                                   "•• •• 56 78"
 */
import type { ShopperLocale } from "@/lib/landing/copy";

const TAG: Record<ShopperLocale, string> = { ar: "ar-MA", fr: "fr-FR", en: "en-GB" };

function format(iso: string, locale: ShopperLocale, tz: string, time: boolean): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", numberingSystem: "latn", ...(time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}) };
  try {
    return new Intl.DateTimeFormat(TAG[locale], { ...opts, timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat(TAG[locale], { ...opts, timeZone: "UTC" }).format(d);
  }
}

/** The day of an instant in the store's time zone: "jeu. 30 oct." / "الخميس 30 أكتوبر" / "Thu 30 Oct". */
export function trackDay(iso: string, locale: ShopperLocale, tz: string): string {
  return format(iso, locale, tz, false);
}

/** The day and the time: "jeu. 30 oct., 10:12". */
export function trackMoment(iso: string, locale: ShopperLocale, tz: string): string {
  return format(iso, locale, tz, true);
}

/** The phone as the page may show it: the last 4 digits only ("•• •• 56 78"). */
export function maskPhoneLast4(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const last = d.length >= 4 ? d.slice(-4) : "••••";
  return `•• •• ${last.slice(0, 2)} ${last.slice(2)}`;
}

/** The first word of the name the shopper typed (≤ 40 characters), or null. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const clean = first.replace(/[\u0000-\u001f\u007f<>]/g, "").slice(0, 40);
  return clean || null;
}
