/**
 * Moroccan public holidays the delivery calendar offers (P3 LANDING; landing.md LAN-§7.2 "holiday seed", §7.3).
 * Pure data, isomorphic. Nothing here is ever applied without the owner's tap: the calendar card offers the fixed
 * dates of the next 12 months as one-tap additions and shows the movable ones as empty slots.
 *
 * Every fixed date is to be verified yearly against an official calendar (`verify: "yearly"`); Unity Day (10-31) is
 * newer and `unverified`. The movable religious holidays (Eid al-Fitr, Eid al-Adha, 1 Muharram, Mawlid) depend on the
 * moon sighting and are NEVER pre-filled: the editor shows their names with "add them when announced".
 */

export interface FixedHoliday {
  /** MM-DD */
  md: string;
  id: string;
  label: { ar: string; fr: string; en: string };
  verify: "yearly" | "unverified";
}

export interface MovableHoliday {
  id: string;
  label: { ar: string; fr: string; en: string };
}

export const MA_FIXED_HOLIDAYS: readonly FixedHoliday[] = [
  { md: "01-01", id: "new-year", label: { ar: "رأس السنة الميلادية", fr: "Nouvel An", en: "New Year's Day" }, verify: "yearly" },
  { md: "01-11", id: "independence-manifesto", label: { ar: "ذكرى تقديم وثيقة الاستقلال", fr: "Manifeste de l'Indépendance", en: "Independence Manifesto Day" }, verify: "yearly" },
  { md: "01-14", id: "yennayer", label: { ar: "رأس السنة الأمازيغية", fr: "Nouvel An amazigh (Yennayer)", en: "Amazigh New Year (Yennayer)" }, verify: "yearly" },
  { md: "05-01", id: "labour-day", label: { ar: "عيد الشغل", fr: "Fête du Travail", en: "Labour Day" }, verify: "yearly" },
  { md: "07-30", id: "throne-day", label: { ar: "عيد العرش", fr: "Fête du Trône", en: "Throne Day" }, verify: "yearly" },
  { md: "08-14", id: "oued-eddahab", label: { ar: "ذكرى استرجاع وادي الذهب", fr: "Allégeance d'Oued Eddahab", en: "Oued Eddahab Day" }, verify: "yearly" },
  { md: "08-20", id: "king-and-people", label: { ar: "ذكرى ثورة الملك والشعب", fr: "Révolution du Roi et du Peuple", en: "Revolution of the King and the People" }, verify: "yearly" },
  { md: "08-21", id: "youth-day", label: { ar: "عيد الشباب", fr: "Fête de la Jeunesse", en: "Youth Day" }, verify: "yearly" },
  { md: "10-31", id: "unity-day", label: { ar: "عيد الوحدة", fr: "Fête de l'Unité", en: "Unity Day" }, verify: "unverified" },
  { md: "11-06", id: "green-march", label: { ar: "ذكرى المسيرة الخضراء", fr: "Marche Verte", en: "Green March Day" }, verify: "yearly" },
  { md: "11-18", id: "independence-day", label: { ar: "عيد الاستقلال", fr: "Fête de l'Indépendance", en: "Independence Day" }, verify: "yearly" },
];

export const MA_MOVABLE_HOLIDAYS: readonly MovableHoliday[] = [
  { id: "eid-al-fitr", label: { ar: "عيد الفطر", fr: "Aïd el-Fitr", en: "Eid al-Fitr" } },
  { id: "eid-al-adha", label: { ar: "عيد الأضحى", fr: "Aïd el-Adha", en: "Eid al-Adha" } },
  { id: "hijri-new-year", label: { ar: "فاتح محرم", fr: "Nouvel An de l'Hégire (1er Muharram)", en: "Islamic New Year (1 Muharram)" } },
  { id: "mawlid", label: { ar: "عيد المولد النبوي", fr: "Aïd al-Mawlid", en: "Mawlid" } },
];

/**
 * The fixed holidays of the 12 months starting at `fromYmd` (YYYY-MM-DD, store-local today), in date order:
 * `{ ymd, holiday }` for each date d with fromYmd ≤ d < fromYmd + 1 year.
 */
export function fixedHolidaysAhead(fromYmd: string): { ymd: string; holiday: FixedHoliday }[] {
  const year = Number(fromYmd.slice(0, 4));
  const until = `${year + 1}${fromYmd.slice(4)}`;
  const out: { ymd: string; holiday: FixedHoliday }[] = [];
  for (const y of [year, year + 1]) {
    for (const h of MA_FIXED_HOLIDAYS) {
      const ymd = `${y}-${h.md}`;
      if (ymd >= fromYmd && ymd < until) out.push({ ymd, holiday: h });
    }
  }
  return out.sort((a, b) => a.ymd.localeCompare(b.ymd));
}

/* ------------------------------------------------------------------ */
/* the yearly reminder (`delivery.holidays_review`, LAN-§7.2, §23.4)   */
/* ------------------------------------------------------------------ */

/** the reminder repeats at most once in this many days */
export const HOLIDAYS_REVIEW_EVERY_DAYS = 30;
/** store-local hours the reminder may be raised in (from 08:00, never at night) */
const REVIEW_FROM_HOUR = 8;
const REVIEW_UNTIL_HOUR = 21;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ymdPlus = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

/** The store-local dates of the last `HOLIDAYS_REVIEW_EVERY_DAYS` days, `today` included (the reminder's dedupe window). */
export function reviewWindowDays(today: string): string[] {
  return Array.from({ length: HOLIDAYS_REVIEW_EVERY_DAYS }, (_, i) => ymdPlus(today, -i));
}

/**
 * Whether the holiday reminder is due for one store now: the store shows delivery dates (`checkout.zonesEnabled`, the
 * only promise the holidays shape), its holidays are not reviewed for the current year (null = never; January is
 * always such a month until the owner taps "I reviewed the holidays for <year>"), it is between 08:00 and 21:00 store
 * time, and no reminder went out in the last 30 days (`sentDays`: the dates of the window that already carry one).
 */
export function holidaysReviewDue(i: {
  zonesEnabled: boolean;
  reviewedYear: number | null;
  /** store-local today and hour (`localParts(now, tz)`) */
  local: { ymd: string; hour: number };
  sentDays: readonly string[];
}): { due: false } | { due: true; year: number } {
  const year = Number(i.local.ymd.slice(0, 4));
  if (!i.zonesEnabled || i.local.hour < REVIEW_FROM_HOUR || i.local.hour >= REVIEW_UNTIL_HOUR) return { due: false };
  if (i.reviewedYear !== null && i.reviewedYear >= year) return { due: false };
  const recent = new Set(reviewWindowDays(i.local.ymd));
  return i.sentDays.some((d) => recent.has(d)) ? { due: false } : { due: true, year };
}
