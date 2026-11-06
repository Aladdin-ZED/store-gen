/**
 * The view-as start sheet's notice preview (platform.md PLA-§10.1): pure and isomorphic. The server renders the store's
 * `store.impersonation_started` notification in its default locale with two stand-ins for the window
 * (src/lib/platform/profile/header.ts `viewAsNotice`); the sheet fills them with "now" and "now + the chosen minutes",
 * formatted like the notification centre formats an ISO instant (notify-kinds.ts `displayVar`: medium date, short
 * time, the store's time zone, Latin digits in Arabic).
 *
 *   fillNoticeWindow(body, new Date(), 30, "fr", "Africa/Casablanca")   // "… De 5 nov. 2026, 14:02 à 5 nov. 2026, 14:32 …"
 */

export const NOTICE_FROM = "%%FROM%%";
export const NOTICE_TO = "%%TO%%";

/** notify-kinds.ts INTL_LOCALE */
const INTL: Record<string, string> = { en: "en-GB", fr: "fr-FR", ar: "ar-MA-u-nu-latn" };

export function noticeTime(at: Date, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(INTL[locale] ?? "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(at);
  } catch {
    return at.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function fillNoticeWindow(text: string, now: Date, minutes: number, locale: string, timeZone: string): string {
  const to = new Date(now.getTime() + minutes * 60_000);
  return text.replaceAll(NOTICE_FROM, noticeTime(now, locale, timeZone)).replaceAll(NOTICE_TO, noticeTime(to, locale, timeZone));
}
