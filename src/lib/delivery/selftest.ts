// proves: LP-03, SF-08
/**
 * The pure delivery-promise cases (P3 LANDING; landing.md LAN-§7.5 bullet 1, §7.2, §7.4, §2.1, §2.3). Imported by
 * scripts/qa/delivery-check.ts (`test:delivery`), which adds the shared fixtures of operations (the city-key parity
 * fixture and the calling-window fixture). Offline, no database, no server import.
 *
 * Instants are written in Morocco's local time through `casa()`: Africa/Casablanca is UTC+1 outside Ramadan, which
 * holds for every date used here except the Ramadan case, which states its instant in UTC on purpose.
 */
import { DEFAULT_WINDOW } from "@/lib/callcenter/defaults";
import type { EffectiveWindow } from "@/lib/callcenter/window";
import { DZ } from "@/lib/landing/copy";
import { noShopperHours, reviveWindow, shopperHoursText, weekHoursText, windowIsEmpty } from "@/lib/landing/hours";
import { MA_CITIES } from "@/lib/markets/cities-ma";
import { dayRangeText, etaText, etaWindow, etaWindowText, localParts } from "./eta";
import { fixedHolidaysAhead, holidaysReviewDue, MA_MOVABLE_HOLIDAYS, reviewWindowDays } from "./holidays-ma";
import { confirmationLeadOf, suggestedLead } from "./lead";
import { composeLine, deliverySummary, lineText, type LineInput } from "./line";
import { zoneForCity } from "./match";
import { buildZoneTable } from "./table";
import type { DeliveryZoneRow, StoreCalendar, ZoneProblem } from "./types";
import { marketCityKeys, normalizeZones, zoneProblems } from "./validate";

export type Check = (ok: boolean, name: string, detail?: unknown) => void;

const pad = (n: number) => String(n).padStart(2, "0");
/** The instant at which Casablanca's wall clock reads `ymd hh:mm` outside Ramadan (UTC+1). */
export const casa = (ymd: string, h: number, m = 0) => new Date(Date.parse(`${ymd}T${pad(h)}:${pad(m)}:00.000Z`) - 3_600_000);

/** Mon-Sat, cut-off 14:00, no holiday, no lead: the calendar most cases start from */
export const CAL: StoreCalendar = { tz: "Africa/Casablanca", workdays: [1, 2, 3, 4, 5, 6], cutoffHour: 14, holidays: [], leadDays: 0 };
const Z13 = { etaMinDays: 1, etaMaxDays: 3 };
const DASH = /[‒-―]/;
const ARABIC_DIGITS = /[٠-٩۰-۹]/;

let zoneSeq = 0;
/** A stored zone row (slug keys). */
export function zone(name: string, cities: string[], o: Partial<Omit<DeliveryZoneRow, "id" | "name" | "cities">> = {}): DeliveryZoneRow {
  return {
    id: `Z${String(++zoneSeq).padStart(25, "0")}`,
    name,
    cities: cities as DeliveryZoneRow["cities"],
    feeCents: o.feeCents ?? null,
    freeFromCents: o.freeFromCents ?? null,
    etaMinDays: o.etaMinDays ?? null,
    etaMaxDays: o.etaMaxDays ?? null,
    notServed: o.notServed ?? false,
    note: o.note ?? null,
    position: o.position ?? zoneSeq,
  };
}

export function runDeliverySelftest(check: Check): void {
  windowCases(check);
  textCases(check);
  leadGrid(check);
  lineCases(check);
  problemCases(check);
  leadSuggestionCases(check);
  holidayCases(check);
  hoursCases(check);
}

/* ------------------------------------------------------------------ */
/* LAN-§7.2 steps 1-3                                                  */
/* ------------------------------------------------------------------ */

function windowCases(check: Check): void {
  const w = (cal: StoreCalendar, z: { etaMinDays: number; etaMaxDays: number }, at: Date) => {
    const r = etaWindow(cal, z, at);
    return r ? `${r.from}..${r.to}` : null;
  };
  const eq = (got: unknown, want: unknown, name: string) => check(got === want, name, { got, want });
  // 2026-10-28 is a Wednesday
  eq(w(CAL, Z13, casa("2026-10-28", 10)), "2026-10-29..2026-10-31", "cut-off: an order at 10:00 (before 14:00) starts the same day");
  eq(w(CAL, Z13, casa("2026-10-28", 15)), "2026-10-30..2026-11-02", "cut-off: an order at 15:00 starts the next working day (Sunday skipped)");
  eq(w(CAL, Z13, casa("2026-10-28", 14)), "2026-10-30..2026-11-02", "cut-off: 14:00 itself is after the cut-off");
  eq(w({ ...CAL, cutoffHour: null }, Z13, casa("2026-10-28", 23)), "2026-10-29..2026-10-31", "no cut-off: 23:00 still starts the same day");
  eq(w(CAL, Z13, casa("2026-10-31", 10)), "2026-11-02..2026-11-04", "a Saturday order with Mon-Sat starts on Saturday");
  eq(w(CAL, Z13, casa("2026-11-01", 10)), "2026-11-03..2026-11-05", "a Sunday order starts on Monday");
  eq(
    w({ ...CAL, holidays: ["2026-11-06", "2026-11-07"] }, { etaMinDays: 1, etaMaxDays: 2 }, casa("2026-11-05", 10)),
    "2026-11-09..2026-11-10",
    "two consecutive holidays (Fri, Sat) and a Sunday are skipped",
  );
  eq(w({ ...CAL, holidays: ["2026-10-28"] }, Z13, casa("2026-10-28", 10)), "2026-10-30..2026-11-02", "an order on a holiday starts the next working day");
  eq(w(CAL, { etaMinDays: 0, etaMaxDays: 2 }, casa("2026-10-28", 10)), "2026-10-28..2026-10-30", "min = 0: the window starts on the start day");
  eq(w(CAL, { etaMinDays: 0, etaMaxDays: 0 }, casa("2026-10-28", 10)), "2026-10-28..2026-10-28", "min = max = 0: same day");
  eq(w(CAL, { etaMinDays: 1, etaMaxDays: 2 }, casa("2026-10-30", 10)), "2026-10-31..2026-11-02", "a month crossing");
  eq(w(CAL, Z13, casa("2026-12-30", 10)), "2026-12-31..2027-01-02", "a year crossing");
  eq(w({ ...CAL, holidays: ["2027-01-01"] }, Z13, casa("2026-12-30", 10)), "2026-12-31..2027-01-04", "a year crossing over New Year's Day");
  // Ramadan 2026: Morocco runs on UTC+0 (tz data), so 23:30 UTC is still Monday 2 March in Casablanca
  const ramadan = new Date("2026-03-02T23:30:00.000Z");
  eq(localParts(ramadan, "Africa/Casablanca")?.ymd, "2026-03-02", "Ramadan: 23:30 UTC is still the same local day (offset from tz data)");
  eq(localParts(new Date("2026-02-10T23:30:00.000Z"), "Africa/Casablanca")?.ymd, "2026-02-11", "outside Ramadan: 23:30 UTC is already the next local day");
  eq(w({ ...CAL, cutoffHour: null }, Z13, ramadan), "2026-03-03..2026-03-05", "Ramadan: the window counts from the local day of the tz data");
  eq(w({ ...CAL, leadDays: 2 }, Z13, casa("2026-10-28", 10)), "2026-10-31..2026-11-03", "the confirmation lead (2 working days) moves the start before the days count");
  eq(w({ ...CAL, workdays: [1, 2, 3, 4, 5] }, Z13, casa("2026-10-30", 10)), "2026-11-02..2026-11-04", "Mon-Fri: the weekend is skipped");
  // Intl without the store's time zone: no window, the day range
  eq(w({ ...CAL, tz: "Mars/Olympus_Mons" }, Z13, casa("2026-10-28", 10)), null, "an unsupported time zone gives no window");
  eq(etaText(null, Z13, "fr", "fr-FR", casa("2026-10-28", 10)), "en 1 à 3 jours ouvrés", "no window: the text is the day range");
  eq(etaWindowText(Z13, casa("2026-10-28", 10), { ...CAL, tz: "Mars/Olympus_Mons" }, "fr"), null, "etaWindowText: null without the time zone");
}

/* ------------------------------------------------------------------ */
/* LAN-§7.2 steps 4-5: the words                                       */
/* ------------------------------------------------------------------ */

function textCases(check: Check): void {
  const now = casa("2026-10-28", 10);
  const w13 = etaWindow(CAL, Z13, now);
  const w11 = etaWindow(CAL, { etaMinDays: 1, etaMaxDays: 1 }, now);
  const want: [string, string, string][] = [
    [etaText(w13, Z13, "fr", "fr-FR", now), "entre jeu. 29 et sam. 31 oct. (estimation)", "fr range"],
    [etaText(w13, Z13, "ar", "ar-MA", now), "ما بين الخميس 29 والسبت 31 أكتوبر (تقريبي)", "ar range, ar-MA"],
    [etaText(w13, Z13, "ar", "fr-FR", now), "ما بين الخميس 29 والسبت 31 أكتوبر (تقريبي)", "ar range with the ar page's money locale (fr-FR): Arabic words, Latin digits"],
    [etaText(w13, Z13, "en", "en-US", now), "between Thu 29 and Sat 31 Oct (estimated)", "en range"],
    [etaText(w11, { etaMinDays: 1, etaMaxDays: 1 }, "fr", "fr-FR", now), "le jeu. 29 oct. (estimation)", "fr one date"],
    [etaText(w11, { etaMinDays: 1, etaMaxDays: 1 }, "ar", "ar-MA", now), "نهار الخميس 29 أكتوبر (تقريبي)", "ar one date"],
    [etaText(w11, { etaMinDays: 1, etaMaxDays: 1 }, "en", "en-US", now), "on Thu 29 Oct (estimated)", "en one date"],
  ];
  for (const [got, exp, name] of want) check(got === exp, `text: ${name}`, { got, exp });
  const cross = etaWindow(CAL, { etaMinDays: 1, etaMaxDays: 2 }, casa("2026-10-30", 10));
  check(etaText(cross, { etaMinDays: 1, etaMaxDays: 2 }, "fr", "fr-FR", now) === "entre sam. 31 oct. et lun. 2 nov. (estimation)", "text: a month crossing writes both months", etaText(cross, { etaMinDays: 1, etaMaxDays: 2 }, "fr", "fr-FR", now));
  const nov = etaWindow(CAL, { etaMinDays: 1, etaMaxDays: 2 }, casa("2026-11-13", 10));
  check(etaText(nov, { etaMinDays: 1, etaMaxDays: 2 }, "ar", "ar-MA", now).includes("نونبر"), "text: ar-MA month names (نونبر)", etaText(nov, { etaMinDays: 1, etaMaxDays: 2 }, "ar", "ar-MA", now));
  const yearCross = etaWindow(CAL, Z13, casa("2026-12-30", 10));
  check(etaText(yearCross, Z13, "fr", "fr-FR", casa("2026-12-30", 10)) === "entre jeu. 31 déc. et sam. 2 jan. (estimation)", "text: a year crossing (fr-MA abbreviates janvier as jan.)", etaText(yearCross, Z13, "fr", "fr-FR", casa("2026-12-30", 10)));
  check(ARABIC_DIGITS.test(etaText(w13, Z13, "ar", "ar-EG", now)), "text: a money locale with Arabic-Indic digits (ar-EG) prints them: the digits follow dateLocale");
  // > 21 days: the day range (the lead counted in the days)
  const far = { etaMinDays: 20, etaMaxDays: 25 };
  check(etaText(etaWindow(CAL, far, now), far, "fr", "fr-FR", now) === "en 20 à 25 jours ouvrés", "text: a window ending more than 21 days away is the day range");
  check(etaText(etaWindow({ ...CAL, leadDays: 2 }, far, now), far, "en", "en-US", now) === "in 22 to 27 working days", "text: the day range counts the lead");
  const near = { etaMinDays: 12, etaMaxDays: 14 };
  check(etaText(etaWindow(CAL, near, now), near, "fr", "fr-FR", now).startsWith("entre "), "text: a window inside 21 days keeps its dates");
  // the day phrases
  const phrases: [string, string][] = [
    [dayRangeText(0, 0, "fr"), "le jour même"],
    [dayRangeText(1, 1, "fr"), "en 1 jour ouvré"],
    [dayRangeText(3, 3, "fr"), "en 3 jours ouvrés"],
    [dayRangeText(0, 2, "fr"), "sous 2 jours ouvrés"],
    [dayRangeText(2, 4, "fr"), "en 2 à 4 jours ouvrés"],
    [dayRangeText(2, 2, "ar"), "فيومين ديال الخدمة"],
    [dayRangeText(1, 3, "ar"), "من 1 حتى 3 أيام ديال الخدمة"],
    [dayRangeText(0, 1, "en"), "within 1 working day"],
    [dayRangeText(1, 3, "en"), "in 1 to 3 working days"],
  ];
  for (const [got, exp] of phrases) check(got === exp, `phrase: "${exp}"`, got);
  // storefront's shape
  const s = etaWindowText(Z13, now, CAL, "fr", "fr-FR");
  check(!!s && s.from.toISOString() === "2026-10-29T12:00:00.000Z" && s.to.toISOString() === "2026-10-31T12:00:00.000Z", "etaWindowText: from / to at 12:00 UTC of the local days", s);
  check(s?.text === etaText(w13, Z13, "fr", "fr-FR", now), "etaWindowText: the text is etaText's");
  // no dash anywhere, every date marked
  const all = [...want.map((x) => x[0]), ...phrases.map((x) => x[0]), ...Object.values(DZ).flatMap((c) => Object.values(c).flat())];
  check(all.every((t) => !DASH.test(t)), "copy: no em or en dash in any ETA text or dz default", all.filter((t) => DASH.test(t)));
  check(want.every(([t]) => /\((estimation|تقريبي|estimated)\)$/.test(t)), "text: every date carries the estimate marker");
}

/* ------------------------------------------------------------------ */
/* LAN-§7.2 step 7: one order, one promise                             */
/* ------------------------------------------------------------------ */

function leadGrid(check: Check): void {
  let held = 0;
  let later = 0;
  let broken: unknown = null;
  const zoneDays = Z13;
  const startOf = (cal: StoreCalendar, at: Date) => etaWindow({ ...cal, leadDays: 0 }, { etaMinDays: 0, etaMaxDays: 0 }, at)!.from;
  for (const cutoffHour of [14, null] as const) {
    for (let lead = 0; lead <= 3; lead++) {
      const cal: StoreCalendar = { ...CAL, cutoffHour, leadDays: lead };
      const plain: StoreCalendar = { ...cal, leadDays: 0 };
      for (let wd = 0; wd < 7; wd++) {
        const orderDay = `2026-11-${pad(2 + wd)}`; // Monday 2 … Sunday 8 November
        for (const orderHour of [10, 16]) {
          const orderAt = casa(orderDay, orderHour);
          const thankYou = etaWindow(cal, zoneDays, orderAt)!;
          // the last day the confirmation may start from and keep the promise: start + lead working days
          const lastOk = etaWindow({ ...plain, leadDays: lead }, { etaMinDays: 0, etaMaxDays: 0 }, orderAt)!.from;
          for (let dd = 0; dd <= 8; dd++) {
            const confDay = `2026-11-${pad(2 + wd + dd)}`;
            for (const confHour of [9, 18]) {
              const confirmedAt = casa(confDay, confHour);
              if (confirmedAt < orderAt) continue;
              const tracking = etaWindow(plain, zoneDays, confirmedAt)!;
              if (startOf(plain, confirmedAt) <= lastOk) {
                held++;
                if (!(tracking.to <= thankYou.to && tracking.from <= thankYou.from)) broken ??= { cutoffHour, lead, orderDay, orderHour, confDay, confHour, thankYou, tracking };
              } else {
                later++;
                if (!(tracking.to > thankYou.to)) broken ??= { later: true, cutoffHour, lead, orderDay, orderHour, confDay, confHour, thankYou, tracking };
              }
            }
          }
        }
      }
    }
  }
  check(broken === null, `lead grid: tracking.to ≤ thankYou.to on ${held} confirmations within the lead, and a later window on the ${later} after it`, broken);
  check(held > 300 && later > 300, "lead grid: both sides of the grid are exercised", { held, later });
}

/* ------------------------------------------------------------------ */
/* LAN-§7.4: the line                                                  */
/* ------------------------------------------------------------------ */

function lineCases(check: Check): void {
  const zones = [
    zone("Casablanca", ["casablanca"], { etaMinDays: 1, etaMaxDays: 1, feeCents: 2_000 }),
    zone("Grandes villes", ["fes", "rabat", "ksar-el-kebir"], { etaMinDays: 1, etaMaxDays: 3, feeCents: 3_000 }),
    zone("Sud", ["dakhla"], { notServed: true }),
    zone("Sans délai", ["agadir"], { feeCents: 4_000 }),
    zone("Reste du Maroc", ["*"], { etaMinDays: 2, etaMaxDays: 4 }),
  ];
  const table = buildZoneTable(zones, CAL, MA_CITIES);
  const base: LineInput = { table, city: null, locale: "fr", dateLocale: "fr-FR", now: casa("2026-10-28", 10), confirmationCall: true, fee: { free: false, text: "35 DH" }, whatsapp: "212600000000" };
  const line = (i: Partial<LineInput>) => composeLine({ ...base, ...i });
  const cases: [string, Partial<LineInput>, string | null, string][] = [
    ["general", {}, "Livraison en 1 à 4 jours ouvrés selon la ville · 35 DH", "no city yet: the served range, the page fee"],
    ["dated", { city: { value: "Fès", label: "Fès" } }, "Livraison à Fès : entre jeu. 29 et sam. 31 oct., après confirmation par téléphone (estimation) · 35 DH", "a city in a zone with days"],
    ["dated", { city: { value: "Casablanca", label: "Casablanca" }, fee: { free: true } }, "Livraison à Casablanca : le jeu. 29 oct., après confirmation par téléphone (estimation) · livraison gratuite", "a free offer: 'livraison gratuite', never the zone fee"],
    ["dated", { city: { value: "Fès", label: "Fès" }, confirmationCall: false }, "Livraison à Fès : entre jeu. 29 et sam. 31 oct. (estimation) · 35 DH", "no confirmation call: no dz.afterCall"],
    ["undated", { city: { value: "Agadir", label: "Agadir" } }, "Livraison à Agadir · 35 DH", "a zone without days"],
    ["not_served", { city: { value: "Dakhla", label: "Dakhla" } }, "Nous ne livrons pas encore à Dakhla.", "a not-served zone"],
    ["dated", { city: { value: "Autre", label: "Autre ville" } }, "Livraison entre ven. 30 oct. et lun. 2 nov., après confirmation par téléphone (estimation) · 35 DH", "'Autre' → the '*' zone, no city name"],
    ["dated", { city: { value: "Tanger", label: "Tanger" } }, "Livraison à Tanger : entre ven. 30 oct. et lun. 2 nov., après confirmation par téléphone (estimation) · 35 DH", "a city outside every zone → the '*' zone"],
    ["general", { city: { value: "Fès", label: "Fès" }, textMode: true }, "Livraison en 1 à 4 jours ouvrés selon la ville · 35 DH", "a text-mode city field: the general line only"],
    ["general", { fee: null }, "Livraison en 1 à 4 jours ouvrés selon la ville", "no fee known: no fee part"],
  ];
  for (const [state, input, text, name] of cases) {
    const l = line(input);
    check(l.state === state && lineText(l) === text, `line: ${name}`, { state: l.state, text: lineText(l) });
  }
  const ns = line({ city: { value: "Dakhla", label: "Dakhla" } });
  check(ns.state === "not_served" && ns.cta?.href === "https://wa.me/212600000000?text=Bonjour%2C%20livrez-vous%20%C3%A0%20Dakhla%20%3F", "line: the not-served WhatsApp link carries the city question", ns);
  const nsNoWa = line({ city: { value: "Dakhla", label: "Dakhla" }, whatsapp: null });
  check(nsNoWa.state === "not_served" && nsNoWa.cta === null, "line: no WhatsApp number → no button (the submit stays)");
  const dated = line({ city: { value: "Fès", label: "Fès" } });
  check(dated.state === "dated" && dated.marker === "(estimation)" && !dated.lead.includes("(estimation)"), "line: the marker is its own (muted) part");
  // no '*' zone: a city outside every zone has no line
  const noStar = buildZoneTable(zones.slice(0, 4), CAL, MA_CITIES);
  check(line({ table: noStar, city: { value: "Tanger", label: "Tanger" } }).state === "none", "line: outside every zone and no '*' zone → no line");
  check(line({ table: noStar, city: { value: "Autre", label: "Autre ville" } }).state === "none", "line: 'Autre' without a '*' zone → no line");
  // nothing to say
  const silent = buildZoneTable([zone("Sans délai", ["agadir"])], CAL, MA_CITIES);
  check(line({ table: silent }).state === "none", "line: no zone has days → no general line (the fallback is hidden)");
  // the lead counts in the general range and the dates
  const leadTable = buildZoneTable(zones, { ...CAL, leadDays: 1 }, MA_CITIES);
  check(lineText(line({ table: leadTable })) === "Livraison en 2 à 5 jours ouvrés selon la ville · 35 DH", "line: the confirmation lead is included in the general range", lineText(line({ table: leadTable })));
  check(lineText(line({ table: leadTable, city: { value: "Fès", label: "Fès" } }))?.startsWith("Livraison à Fès : entre ven. 30 oct. et lun. 2 nov.") === true, "line: the confirmation lead moves the dates", lineText(line({ table: leadTable, city: { value: "Fès", label: "Fès" } })));
  // ar and en
  check(lineText(line({ locale: "ar", dateLocale: "fr-FR", city: { value: "Fès", label: "فاس" }, fee: { free: true } })) === "التوصيل لـفاس: ما بين الخميس 29 والسبت 31 أكتوبر، بعد التأكيد بالتيليفون (تقريبي) · التوصيل بالمجان", "line: ar", lineText(line({ locale: "ar", dateLocale: "fr-FR", city: { value: "Fès", label: "فاس" }, fee: { free: true } })));
  check(lineText(line({ locale: "en", dateLocale: "en-US", city: { value: "Fès", label: "Fez" } })) === "Delivery to Fez: between Thu 29 and Sat 31 Oct, after we confirm by phone (estimated) · 35 DH", "line: en", lineText(line({ locale: "en", dateLocale: "en-US", city: { value: "Fès", label: "Fez" } })));
  const arNs = line({ locale: "ar", city: { value: "Dakhla", label: "الداخلة" } });
  check(lineText(arNs) === "مازال ما كنوصلوش للداخلة." && arNs.state === "not_served" && decodeURIComponent(arNs.cta!.href.split("text=")[1]!) === "السلام عليكم، واش كتوصلو للداخلة؟", "line: ar contracts لـ + الـ (للداخلة), in the line and the WhatsApp text", arNs);
  check(lineText(line({ locale: "ar", city: { value: "Agadir", label: "أكادير" } })) === "التوصيل لـأكادير · 35 DH", "line: ar keeps لـ before a name without the article");
  // the server summary: the range and the page's fee only
  const sum = deliverySummary(zones, "fr", { fee: { free: false, text: "35 DH" } });
  check(sum.etaText === "en 1 à 4 jours ouvrés" && sum.feeText === "35 DH", "deliverySummary: the served range and the page fee", sum);
  const noFee = deliverySummary(zones, "fr");
  check(noFee.feeText === null, "deliverySummary: never a zone fee (no page fee → null)", noFee);
  check(deliverySummary([zone("x", ["fes"], { notServed: true })], "fr").etaText === null, "deliverySummary: no served zone with days → null");
}

/* ------------------------------------------------------------------ */
/* LAN-§2.1: the invariants                                            */
/* ------------------------------------------------------------------ */

function problemCases(check: Check): void {
  const keys = marketCityKeys(MA_CITIES);
  const z = (name: string, cities: string[], o: Partial<{ feeCents: number | null; freeFromCents: number | null; etaMinDays: number | null; etaMaxDays: number | null; notServed: boolean }> = {}) => ({
    name,
    cities,
    feeCents: o.feeCents ?? null,
    freeFromCents: o.freeFromCents ?? null,
    etaMinDays: o.etaMinDays ?? null,
    etaMaxDays: o.etaMaxDays ?? null,
    notServed: o.notServed ?? false,
  });
  const codes = (ps: ZoneProblem[]) => ps.map((p) => p.code).join(",");
  const ok = [z("Casablanca", ["casablanca"], { etaMinDays: 1, etaMaxDays: 1, feeCents: 2_000 }), z("Reste", ["*"], { etaMinDays: 2, etaMaxDays: 4 })];
  check(zoneProblems(ok, keys).length === 0, "problems: a valid list has none");
  const table: [string, ReturnType<typeof z>[], string][] = [
    ["city_twice", [z("A", ["fes"]), z("B", ["rabat", "fes"])], "city_twice"],
    ["star_twice", [z("A", ["*"]), z("B", ["*"])], "star_twice"],
    ["eta_order", [z("A", ["fes"], { etaMinDays: 4, etaMaxDays: 2 })], "eta_order"],
    ["eta_order (> 30)", [z("A", ["fes"], { etaMinDays: 1, etaMaxDays: 31 })], "eta_order"],
    ["eta_half", [z("A", ["fes"], { etaMinDays: 1 })], "eta_half"],
    ["not_served_values (fee)", [z("A", ["fes"], { notServed: true, feeCents: 1_000 })], "not_served_values"],
    ["not_served_values (days)", [z("A", ["fes"], { notServed: true, etaMinDays: 1, etaMaxDays: 2 })], "not_served_values"],
    ["unknown_city (a City.value stored as is)", [z("A", ["Fès"])], "unknown_city"],
    ["unknown_city (\"Autre\" is the '*' zone)", [z("A", ["Autre"])], "unknown_city"],
    ["unknown_city (not in the market list)", [z("A", ["paris"])], "unknown_city"],
    ["too_many", Array.from({ length: 41 }, (_, i) => z(`Z${i}`, [])), "too_many"],
  ];
  for (const [name, list, want] of table) check(codes(zoneProblems(list, keys)) === want, `problems: ${name}`, codes(zoneProblems(list, keys)));
  check(zoneProblems([z("A", ["fes"])], new Set()).some((p) => p.code === "unknown_city"), "problems: a market without a city list accepts only '*'");
  // normalisation: values become keys before the invariants, so the editor's keys and an import's values both pass
  const norm = normalizeZones([{ cities: ["Fès", "fes", "Ksar El Kébir", "*", " rabat ", "Atlantis"] }], keys);
  check(JSON.stringify(norm[0]!.cities) === JSON.stringify(["fes", "ksar-el-kebir", "*", "rabat", "Atlantis"]), "normalize: values → keys, duplicates collapsed, unknowns kept for the check", norm[0]!.cities);
  check(codes(zoneProblems(normalizeZones([z("A", ["Fès", "Meknès"])], keys), keys)) === "", "normalize: City.values from an import pass once normalised");
  check(codes(zoneProblems(normalizeZones([z("A", ["Atlantis"])], keys), keys)) === "unknown_city", "normalize: a value of no list stays unknown_city");
  check(keys.size === MA_CITIES.length - 1 && !keys.has("autre"), "the market keys are every city of MA_CITIES except 'Autre'", keys.size);
}

/* ------------------------------------------------------------------ */
/* LAN-§7.3: the confirmation-lead suggestion                          */
/* ------------------------------------------------------------------ */

function leadSuggestionCases(check: Check): void {
  const eq = (got: unknown, want: unknown, name: string) => check(got === want, `lead: ${name}`, { got, want });
  eq(confirmationLeadOf(casa("2026-10-28", 10), casa("2026-10-28", 16), CAL), 0, "confirmed the same day = 0");
  eq(confirmationLeadOf(casa("2026-10-28", 10), casa("2026-10-29", 11), CAL), 1, "confirmed the next working day = 1");
  eq(confirmationLeadOf(casa("2026-10-28", 16), casa("2026-10-29", 11), CAL), 0, "ordered after the cut-off, confirmed on the start day = 0");
  eq(confirmationLeadOf(casa("2026-10-31", 10), casa("2026-11-02", 10), CAL), 1, "Saturday → Monday = 1 working day (Sunday skipped)");
  eq(confirmationLeadOf(casa("2026-11-01", 10), casa("2026-11-02", 10), CAL), 0, "a Sunday order confirmed Monday (its start day) = 0");
  eq(confirmationLeadOf(casa("2026-10-28", 10), casa("2026-11-03", 10), CAL), 5, "Wednesday → next Tuesday = 5");
  eq(confirmationLeadOf(casa("2026-10-28", 10), casa("2026-10-28", 10), { ...CAL, tz: "Mars/Olympus_Mons" }), null, "an unsupported time zone → null");
  eq(suggestedLead([0, 0, 1, 1, 1, 2, 5]), 1, "the median (nearest rank)");
  eq(suggestedLead([3, 4, 5, 6]), 3, "capped at 3 (the setting's maximum)");
  eq(suggestedLead([]), null, "no orders → no suggestion");
}

/* ------------------------------------------------------------------ */
/* LAN-§7.2: the holiday seed and the yearly reminder                  */
/* ------------------------------------------------------------------ */

function holidayCases(check: Check): void {
  const ahead = fixedHolidaysAhead("2026-10-28");
  check(ahead.length === 11 && ahead[0]!.ymd === "2026-10-31" && ahead.at(-1)!.ymd === "2027-08-21", "holidays: the 11 fixed dates of the next 12 months, in order", ahead.map((h) => h.ymd));
  check(ahead.find((h) => h.ymd === "2026-10-31")?.holiday.verify === "unverified" && ahead.filter((h) => h.holiday.verify === "yearly").length === 10, "holidays: 10-31 is unverified, the others are 'verify yearly'");
  check(ahead.every((h) => !MA_MOVABLE_HOLIDAYS.some((m) => m.id === h.holiday.id)) && MA_MOVABLE_HOLIDAYS.length === 4, "holidays: the movable holidays are never pre-filled");
  const base = { zonesEnabled: true, reviewedYear: null as number | null, local: { ymd: "2027-01-05", hour: 9 }, sentDays: [] as string[] };
  const due = (o: Partial<typeof base>) => holidaysReviewDue({ ...base, ...o }).due;
  check(due({}), "reminder: due in January when the year is not reviewed");
  check(!due({ reviewedYear: 2027 }), "reminder: not due once the current year is reviewed");
  check(due({ reviewedYear: 2026, local: { ymd: "2027-06-10", hour: 10 } }), "reminder: due whenever the reviewed year is behind");
  check(!due({ zonesEnabled: false }), "reminder: not for a store that shows no delivery dates");
  check(!due({ local: { ymd: "2027-01-05", hour: 7 } }) && due({ local: { ymd: "2027-01-05", hour: 8 } }), "reminder: from 08:00 store time");
  check(!due({ sentDays: ["2026-12-07"] }), "reminder: not twice within 30 days (sent 29 days ago)");
  check(due({ sentDays: ["2026-12-06"] }), "reminder: due again 30 days later");
  check(reviewWindowDays("2027-01-05").length === 30 && reviewWindowDays("2027-01-05")[29] === "2026-12-07", "reminder: the dedupe window is the last 30 local days");
}

/* ------------------------------------------------------------------ */
/* LAN-§2.3: the hours helpers (on operations' window functions)       */
/* ------------------------------------------------------------------ */

function hoursCases(check: Check): void {
  const now = casa("2026-11-02", 10); // a Monday
  const fresh: EffectiveWindow = { tz: "Africa/Casablanca", days: DEFAULT_WINDOW.days, closedDates: [], overrides: [], openOverrideUntil: null, configured: false };
  const saved: EffectiveWindow = { ...fresh, configured: true };
  check(noShopperHours(fresh, now) && shopperHoursText(fresh, "fr", "fr-FR", now) === null, "hours: configured: false → noShopperHours, no hours text");
  check(!noShopperHours(saved, now), "hours: a saved window with ranges → hours may be told");
  const fr = weekHoursText(saved, "fr", "fr-FR", now);
  check(fr === "lun.-jeu., sam., dim. 09:30-13:00, 14:30-21:00 · ven. 09:30-12:15, 14:30-21:00", "hours: weekHoursText groups equal days (fr)", fr);
  check(shopperHoursText(saved, "fr", "fr-FR", now) === fr, "hours: shopperHoursText = weekHoursText once saved");
  check(weekHoursText(fresh, "en", "en-US", now).startsWith("Mon-Thu, Sat, Sun 09:30-13:00"), "hours: weekHoursText always renders (the admin's starting-hours line)", weekHoursText(fresh, "en", "en-US", now));
  const ar = weekHoursText(saved, "ar", "fr-FR", now);
  check(ar === "الاثنين-الخميس، السبت، الأحد 09:30-13:00، 14:30-21:00 · الجمعة 09:30-12:15، 14:30-21:00", "hours: ar uses the Arabic comma", ar);
  check(!DASH.test(fr) && !DASH.test(ar), "hours: no em or en dash");
  const closed = { ...saved, closedDates: Array.from({ length: 14 }, (_, i) => `2026-11-${pad(2 + i)}`) };
  check(windowIsEmpty(closed, now) && noShopperHours(closed, now), "hours: 14 closed days → empty → no hours");
  check(!windowIsEmpty({ ...closed, closedDates: closed.closedDates.slice(0, 13) }, now), "hours: a range on day 14 → not empty");
  const never = { ...saved, days: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } };
  check(windowIsEmpty(never, now), "hours: a week without ranges → empty");
  // the baked thank-you window (LAN-§8.2)
  const revived = reviveWindow(JSON.parse(JSON.stringify(saved)));
  check(JSON.stringify(revived) === JSON.stringify(saved), "reviveWindow: JSON of a saved window round-trips", revived);
  check(reviveWindow(JSON.parse(JSON.stringify(fresh))) === null, "reviveWindow: an unsaved window is never revived");
  check(reviveWindow({ ...saved, closedDates: ["tomorrow"] }) === null && reviveWindow("x") === null && reviveWindow({ ...saved, days: [[]] }) === null, "reviveWindow: malformed JSON → null");
  check(zoneForCity([zone("x", ["*"])], null)?.name === "x", "match: null → the '*' zone");
}
