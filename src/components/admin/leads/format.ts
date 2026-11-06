/**
 * Display helpers of the lead inbox (P3 LANDING; LAN-§10.3): numbers, money and ages in the viewer's language (Latin
 * digits in Arabic, as the rest of the admin), the status tones (no orange: blue, violet, green, emerald, neutral) and
 * the text of a refused action. Isomorphic and pure.
 */
import type { AdminLocale } from "@/lib/i18n/admin";
import { formatMoney } from "@/lib/markets/money";
import type { LeadStatus } from "@/lib/leads/types";

export const intlLocale = (locale: AdminLocale): string => (locale === "ar" ? "ar-MA-u-nu-latn" : locale === "fr" ? "fr-FR" : "en-GB");

export function intFmt(locale: AdminLocale): Intl.NumberFormat {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
}

/** cents → "249,00 MAD" in the viewer's language */
export function moneyText(cents: number | null, currency: string, locale: AdminLocale): string | null {
  return cents === null ? null : formatMoney(cents / 100, currency, locale);
}

/** "12 min", "3 h", "2 d" since `iso` (the shortest unit that reads naturally) */
export function ageText(iso: string, now: number, locale: AdminLocale): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const [value, unit] = min < 60 ? [Math.max(1, min), "minute"] : min < 48 * 60 ? [Math.round(min / 60), "hour"] : [Math.round(min / 1440), "day"];
  return new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit, unitDisplay: "short" }).format(value);
}

/** A date and time in the store's zone ("6 Nov, 14:05") */
export function whenText(iso: string, timeZone: string, locale: AdminLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

export const STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
  contacted: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300",
  recovered: "bg-green-500/10 text-green-700 ring-green-500/20 dark:text-green-300",
  converted: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
  lost: "bg-foreground/[0.05] text-foreground/60 ring-foreground/10",
};

/** The text of a refused action: its message key, else its code's message, else the generic failure. */
export function failText(res: { error: string; message?: string }, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (res.message) return t(res.message);
  const key = `error.${res.error}`;
  const text = t(key);
  return text === key ? t("landing.common.failed") : text;
}
