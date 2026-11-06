/**
 * Times and amounts of the integrations hub, in the viewer's language (isomorphic, pure). Latin digits in every
 * locale (the admin's numbers, §I.5): Arabic formats through `ar-MA`. Kind and state words come from the catalog.
 */
import type { AdminLocale, MessageKey } from "@/lib/i18n/admin";

const INTL: Record<AdminLocale, string> = { en: "en-GB", fr: "fr-FR", ar: "ar-MA-u-nu-latn" };
export const intlLocale = (l: AdminLocale) => INTL[l];

const rtf = new Map<AdminLocale, Intl.RelativeTimeFormat>();
const rel = (l: AdminLocale) => rtf.get(l) ?? rtf.set(l, new Intl.RelativeTimeFormat(INTL[l], { numeric: "auto", style: "short" })).get(l)!;

/** "5 min ago" / "in 4 min" from `iso` against `now`. */
export function relTime(iso: string, locale: AdminLocale, now: number): string {
  const s = Math.round((Date.parse(iso) - now) / 1000);
  const a = Math.abs(s);
  if (a < 45) return rel(locale).format(0, "second");
  if (a < 3600) return rel(locale).format(Math.round(s / 60), "minute");
  if (a < 86_400) return rel(locale).format(Math.round(s / 3600), "hour");
  return rel(locale).format(Math.round(s / 86_400), "day");
}

/** How long something has waited: "12 min", "3 h", "2 d". */
export function age(iso: string, locale: AdminLocale, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const unit = (n: number, u: "minute" | "hour" | "day") => new Intl.NumberFormat(INTL[locale], { style: "unit", unit: u, unitDisplay: "short" }).format(n);
  if (min < 60) return unit(min, "minute");
  if (min < 48 * 60) return unit(Math.round(min / 60), "hour");
  return unit(Math.round(min / 1440), "day");
}

/** "12 Nov, 14:05" in the store's time zone. */
export function clock(iso: string, locale: AdminLocale, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL[locale], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}

/** Integer cents as the store's currency. */
export function money(cents: number, currency: string, locale: AdminLocale): string {
  return new Intl.NumberFormat(INTL[locale], { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

export const num = (n: number, locale: AdminLocale) => new Intl.NumberFormat(INTL[locale]).format(n);

/** The display name of a pixel platform (a brand, never translated). */
export function platformName(p: string | null): string {
  if (p === "meta") return "Meta";
  if (p === "tiktok") return "TikTok";
  if (p === "snap" || p === "snapchat") return "Snapchat";
  if (p === "google") return "Google";
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : "";
}

/** The state tones of §I.6: success, warn (yellow, hue ≥ 90), destructive, neutral. */
export type HubTone = "success" | "warn" | "danger" | "neutral";

export const TONE_CHIP: Record<HubTone, { chip: string; dot: string }> = {
  success: { chip: "bg-success/10 text-success-ink ring-success/25", dot: "bg-success" },
  warn: { chip: "bg-warn/15 text-warn-ink ring-warn/40", dot: "bg-warn" },
  danger: { chip: "bg-destructive/10 text-destructive ring-destructive/25", dot: "bg-destructive" },
  neutral: { chip: "bg-foreground/[0.05] text-foreground/70 ring-foreground/10", dot: "bg-foreground/35" },
};

export const HEALTH_TONE: Record<string, HubTone> = { ok: "success", warn: "warn", failing: "danger", off: "neutral", new: "neutral" };
export const DELIVERY_TONE: Record<string, HubTone> = { pending: "neutral", running: "neutral", done: "success", dead: "danger", cancelled: "neutral", queued: "neutral" };

export const kindKey = (kind: string): MessageKey => `int.health.kind.${kind}`;
