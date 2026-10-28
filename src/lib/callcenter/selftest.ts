// proves: OP-04, OP-07, OP-13, OP-14
/**
 * The pure half of `test:ops` (P4 CALL CENTER; operations.md OPE-§O.1, §O.4), run by scripts/qa/ops-check.ts after it
 * stubs `server-only` (src/lib/orders/masking.ts is server-only). Offline, fixtures only, a fake clock throughout.
 *
 *   masking     maskPhone / maskPhonesIn / phoneLast4 (OP-07 unit)
 *   cities      cityKey / normalizeCity (fr, ar, alias, fuzzy) and the shared parity fixture
 *               scripts/qa/fixtures/city-key.json: slugs, zoneTable (through P3's real buildZoneTable), flows (OP-13)
 *   risk        explainRisk over every flag read from src/lib/orders/risk.ts's source, its texts in ar / fr / en (OP-14)
 *   window      the ISO window over ./window.fixtures.ts, snapIntoWindow, windowMinutesBetween, effectiveWindow
 *   ladder      ladderNext / keepOpenNext / rescueNext with a fake clock across the Africa/Casablanca offset changes (OP-04)
 *   priority    priorityOf (delivery lane 650 > callback 600 > new 500 > attempting 300, amount, risk, attempts, pin)
 *   iso         the ISO weekday keys 1-7 of EffectiveWindow, OpsSetting.callingWindow.days, windowOverrides[].days
 *   catalog     the ops.* keys this part renders (reasons, ship states, risk, the timeline) and its notify.ops.* texts in
 *               en / fr / ar; no em dash, no "Step n"
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildZoneTable } from "@/lib/delivery/table";
import { etaWindow } from "@/lib/delivery/eta";
import { zoneForCityValue } from "@/lib/delivery/match";
import type { DeliveryZoneRow, StoreCalendar } from "@/lib/delivery/types";
import { messages as ar } from "@/lib/i18n/admin/ar/ops";
import { messages as en } from "@/lib/i18n/admin/en/ops";
import { messages as fr } from "@/lib/i18n/admin/fr/ops";
import { t } from "@/lib/i18n/admin";
import { MA_CITIES, OTHER_CITY } from "@/lib/markets/cities-ma";
import { CITY_KEYS, cityKey, cityLabel, normalizeCity, type CityKey } from "@/lib/orders/address";
import { maskPhone, maskPhonesIn, phoneLast4 } from "@/lib/orders/masking";
import { customerHistoryOf, explainRisk, RISK_FLAGS, RISK_POINTS, riskLevel } from "@/lib/orders/risk-explain";
import { CANCEL_REASONS, CONFIRM_STATES, MONEY_STATES, RETURN_REASONS, SHIP_STATES } from "@/lib/orders/state";
import { CityKeyZ, OpsSetting, WeekRanges } from "@/lib/settings/keys/ops";
import { DEFAULT_WINDOW, RAMADAN_PRESET } from "./defaults";
import { keepOpenNext, ladderNext, nextDue, rescueNext } from "./ladder";
import { isPinned, laneOf, priorityOf } from "./priority";
import { effectiveWindow, hoursText, isCallable, isoWeekday, nextCallableAt, rangesForDay, shopperPromiseAllowed, snapIntoWindow, windowMinutesBetween, type EffectiveWindow, type IsoWeekday, type Range } from "./window";
import { DATE_LOCALES, WINDOW_FIXTURES } from "./window.fixtures";

export interface SelftestResult {
  passes: number;
  failures: string[];
  sections: Record<string, number>;
}

/* ---- type-level: the one window shape keyed by ISO weekdays 1-7 (CRIT3); a drift fails `tsc` ---- */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type IsoKeyChecks = [
  Assert<Equals<keyof EffectiveWindow["days"], IsoWeekday>>,
  Assert<Equals<keyof OpsSetting["callingWindow"]["days"], 1 | 2 | 3 | 4 | 5 | 6 | 7>>,
  Assert<Equals<keyof OpsSetting["windowOverrides"][number]["days"], 1 | 2 | 3 | 4 | 5 | 6 | 7>>,
  Assert<Equals<IsoWeekday, 1 | 2 | 3 | 4 | 5 | 6 | 7>>,
];

export function runCallcenterSelftest(): SelftestResult {
  let passes = 0;
  const failures: string[] = [];
  const sections: Record<string, number> = {};
  let section = "";
  const eq = (name: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
      passes++;
      sections[section] = (sections[section] ?? 0) + 1;
    } else failures.push(`[${section}] ${name}\n    got:  ${a}\n    want: ${e}`);
  };
  const ok = (name: string, cond: boolean, detail?: unknown) => eq(name + (detail !== undefined && !cond ? ` (${JSON.stringify(detail)})` : ""), cond, true);
  const iso = (d: Date | "exhausted") => (d === "exhausted" ? d : d.toISOString());
  const TZ = "Africa/Casablanca";

  /* ------------------------------------------------------------------ */
  section = "masking";
  {
    eq("Morocco mobile", maskPhone("+212612345678"), "06 •• •• 56 78");
    eq("Morocco landline", maskPhone("+212522123456"), "05 •• •• 34 56");
    eq("France: international, the trunk 0 not shown", maskPhone("+33612345678"), "+33 6 •• •• 56 78");
    eq("United States: the first two national digits", maskPhone("+14155552671"), "+1 41• ••• 2671");
    eq("United Kingdom", maskPhone("+447911123456"), "+44 7••• ••3456");
    eq("Eastern-Arabic digits", maskPhone("+٢١٢٦١٢٣٤٥٦٧٨"), "06 •• •• 56 78");
    eq("an unparsable value keeps only its last 4", maskPhone("12345678"), "••••5678");
    eq("a national number without a country is plain digits", maskPhone("0612345678"), "••••••5678");
    eq("an empty value", maskPhone(""), "••••");
    eq("phoneLast4", phoneLast4("+212612345678"), "5678");
    for (const n of ["+212612345678", "+33612345678", "+14155552671", "+447911123456", "+212700000001"]) {
      const hidden = [...maskPhone(n)].filter((c) => c === "•").length;
      ok(`${n}: at least 4 digits hidden`, hidden >= 4, maskPhone(n));
    }
    const text = "Appeler 06 12 34 56 78 ou +212 6-12-34-56-78, sinon 0612345678 / 00212612345679. Ref 2026-10-28, total 349.00, cmd 4F7K2.";
    eq("free text: national, E.164, compact and 00-prefixed forms; dates, amounts and ids untouched", maskPhonesIn(text, "MA"), "Appeler 06 •• •• 56 78 ou 06 •• •• 56 78, sinon 06 •• •• 56 78 / 06 •• •• 56 79. Ref 2026-10-28, total 349.00, cmd 4F7K2.");
    eq("Eastern-Arabic digits inside Arabic text", maskPhonesIn("رقمو ٠٦١٢٣٤٥٦٧٨ عافاك", "MA"), "رقمو 06 •• •• 56 78 عافاك");
    eq("a foreign number in a Moroccan store", maskPhonesIn("WhatsApp +33 6 12 34 56 78 (France)", "MA"), "WhatsApp +33 6 •• •• 56 78 (France)");
    eq("the country code typed without +", maskPhonesIn("tel 212612345678", "MA"), "tel 06 •• •• 56 78");
    eq("a US number in parentheses", maskPhonesIn("call +1 (415) 555-2671 now", "US"), "call +1 41• ••• 2671 now");
    eq("dates, times and amounts stay", maskPhonesIn("Livrer le 05.11.2026 10h, montant 1 250,00 MAD, colis 2", "MA"), "Livrer le 05.11.2026 10h, montant 1 250,00 MAD, colis 2");
    const odd = maskPhonesIn("num +999 1234 5678 90", "MA");
    ok("any other +run of 9-15 digits keeps only its last 4", odd.endsWith("78 90") && !/\d{3}/.test(odd.replace(/78 90$/, "")), odd);
    eq("no digits", maskPhonesIn("Rappeler demain matin", "MA"), "Rappeler demain matin");
    eq("empty text", maskPhonesIn("", "MA"), "");
  }

  /* ------------------------------------------------------------------ */
  section = "cities";
  {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), "scripts", "qa", "fixtures", "city-key.json"), "utf8")) as {
      slugs: { value: string; key: string | null; fr: string; en?: string; ar: string }[];
      zoneTable: { name: string; zones: string[][]; expect: { city: Record<string, number>; absent: string[]; star: number } }[];
      flows: { name: string; posted: string; zones: { cities: string[]; etaMinDays: number; etaMaxDays: number }[]; expect: { city: string; cityKey: string | null; zoneIndex: number | null; tableIndex: number | null; eta: boolean } }[];
    };
    // slugs: every City.value and its fr / en / ar spellings → one key
    const values = new Set(fixture.slugs.map((s) => s.value));
    ok("the fixture lists every City.value of cities-ma.ts", MA_CITIES.every((c) => values.has(c.value)), MA_CITIES.filter((c) => !values.has(c.value)).map((c) => c.value));
    let spelled = 0;
    for (const s of fixture.slugs) {
      eq(`cityKey(${s.value})`, cityKey(s.value), s.key);
      for (const spelling of [s.value, s.fr, s.en, s.ar].filter((x): x is string => !!x)) {
        const m = normalizeCity(spelling, "MA");
        if (s.key === null) eq(`normalizeCity(${spelling}) is the other-city entry`, [m.key, m.value, m.confidence], [null, OTHER_CITY.value, "exact"]);
        else eq(`normalizeCity(${spelling})`, [m.key, m.confidence, m.value], [s.key, "exact", s.value]);
        spelled++;
      }
    }
    ok("every spelling was checked", spelled >= fixture.slugs.length * 3, spelled);
    eq("CITY_KEYS = the fixture's keys, each once", [...CITY_KEYS].sort(), [...new Set(fixture.slugs.map((s) => s.key).filter((k): k is string => k !== null))].sort());
    eq("CITY_KEYS has no duplicate (cities-ma.ts lists Midelt twice)", CITY_KEYS.length, new Set(CITY_KEYS).size);
    ok("every key is a valid ops.cityAliases / zone slug", CITY_KEYS.every((k) => CityKeyZ.safeParse(k).success));
    // zoneTable: P3's real builder (p0-report: buildZoneTable is real), keyed by the posted City.value
    const cal: StoreCalendar = { tz: TZ, workdays: [1, 2, 3, 4, 5, 6], cutoffHour: null, holidays: [], leadDays: 0 };
    const rows = (zones: { cities: string[]; etaMinDays?: number; etaMaxDays?: number }[]): DeliveryZoneRow[] =>
      zones.map((z, i) => ({ id: `z${i}`, name: `Zone ${i}`, cities: z.cities as DeliveryZoneRow["cities"], feeCents: 3_500, freeFromCents: null, etaMinDays: z.etaMinDays ?? 1, etaMaxDays: z.etaMaxDays ?? 3, notServed: false, note: null, position: i }));
    for (const c of fixture.zoneTable) {
      const table = buildZoneTable(rows(c.zones.map((cities) => ({ cities }))), cal, MA_CITIES);
      for (const [value, index] of Object.entries(c.expect.city)) eq(`${c.name}: city[${value}]`, table.city[value], index);
      for (const value of c.expect.absent) eq(`${c.name}: ${value} absent`, Object.hasOwn(table.city, value), false);
      eq(`${c.name}: star`, table.star, c.expect.star);
      eq(`${c.name}: keyed by every City.value but Autre`, Object.keys(table.city).sort(), MA_CITIES.filter((x) => x.value !== OTHER_CITY.value).map((x) => x.value).filter((v, i, a) => a.indexOf(v) === i).sort());
      ok(`${c.name}: no slug as a key`, Object.keys(table.city).every((k) => !(CITY_KEYS as readonly string[]).includes(k)));
    }
    // flows: a city picked in the form → stored value, key, zone, ETA
    const now = new Date("2026-11-02T10:00:00.000Z");
    for (const f of fixture.flows) {
      const zones = rows(f.zones);
      const zone = zoneForCityValue(zones, f.posted);
      const table = buildZoneTable(zones, cal, MA_CITIES);
      eq(`${f.name}: the stored city`, f.posted, f.expect.city);
      eq(`${f.name}: city_key`, cityKey(f.posted), f.expect.cityKey);
      eq(`${f.name}: the zone`, zone ? zones.indexOf(zone) : null, f.expect.zoneIndex);
      eq(`${f.name}: the browser table`, Object.hasOwn(table.city, f.posted) ? table.city[f.posted] : null, f.expect.tableIndex);
      eq(`${f.name}: an ETA window`, zone ? etaWindow(cal, { etaMinDays: zone.etaMinDays!, etaMaxDays: zone.etaMaxDays! }, now) !== null : false, f.expect.eta);
    }
    // normalizeCity beyond the list's own spellings
    const n = (input: string, aliases?: Record<string, CityKey>) => {
      const m = normalizeCity(input, "MA", aliases);
      return [m.key, m.confidence, m.suggestions.map((s) => s.key)];
    };
    eq("casa (built-in alias)", n("casa"), ["casablanca", "alias", []]);
    eq("  CASA  (alias, folded)", n("  CASA  "), ["casablanca", "alias", []]);
    eq("Fes without the accent", n("Fes"), ["fes", "exact", []]);
    eq("FEZ (English)", n("FEZ"), ["fes", "exact", []]);
    eq("فاس", n("فاس"), ["fes", "exact", []]);
    eq("فَاس (tashkeel)", n("فَاس"), ["fes", "exact", []]);
    eq("فـــاس (tatweel)", n("فـــاس"), ["fes", "exact", []]);
    eq("دار البيضاء (the leading ال ignored)", n("دار البيضاء"), ["casablanca", "exact", []]);
    eq("الدارالبيضاء (no space)", n("الدارالبيضاء"), ["casablanca", "exact", []]);
    eq("قنيطره (ة typed ه, no ال)", n("قنيطره"), ["kenitra", "exact", []]);
    eq("اكادير (أ typed ا)", n("اكادير"), ["agadir", "exact", []]);
    eq("Ksar el kebir, other case and spacing", n("ksar  el-kebir"), ["ksar-el-kebir", "exact", []]);
    eq("M'diq / Mdiq", [n("M'diq")[0], n("Mdiq")[0]], ["m-diq", "m-diq"]);
    eq("a store alias", n("Dar Bida", { "dar bida": "casablanca" as CityKey }), ["casablanca", "alias", []]);
    eq("a store alias to an unknown key is ignored", n("Atlantide", { atlantide: "atlantis" as CityKey }), [null, "none", []]);
    eq("Kenitraa (8 letters, ≤ 2): a suggestion only", n("Kenitraa"), [null, "fuzzy", ["kenitra"]]);
    eq("Rabbat (6 letters, ≤ 1)", n("Rabbat"), [null, "fuzzy", ["rabat"]]);
    eq("Tanjer", n("Tanjer"), [null, "fuzzy", ["tanger"]]);
    eq("Fess (4 letters, ≤ 1)", n("Fess"), [null, "fuzzy", ["fes"]]);
    eq("Agadirr", n("Agadirr"), [null, "fuzzy", ["agadir"]]);
    eq("a fuzzy match never fills the key or the value", (() => {
      const m = normalizeCity("Kenitraa", "MA");
      return [m.key, m.value];
    })(), [null, null]);
    eq("suggestion labels are the stored value", normalizeCity("Kenitraa", "MA").suggestions, [{ key: "kenitra", label: "Kénitra" }]);
    eq("3 letters: no fuzzy", n("Fsz"), [null, "none", []]);
    eq("Arabic: no fuzzy", n("فاص"), [null, "none", []]);
    eq("Autre", normalizeCity("Autre", "MA"), { key: null, value: "Autre", confidence: "exact", suggestions: [] });
    eq("Other city", normalizeCity("Other city", "MA"), { key: null, value: "Autre", confidence: "exact", suggestions: [] });
    eq("a market without a city list", normalizeCity("Paris", "FR"), { key: null, value: null, confidence: "none", suggestions: [] });
    eq("an empty input", normalizeCity("   ", "MA"), { key: null, value: null, confidence: "none", suggestions: [] });
    eq("cityLabel fes", (["fr", "en", "ar"] as const).map((l) => cityLabel("fes" as CityKey, l)), ["Fès", "Fez", "فاس"]);
    eq("cityLabel without an English spelling", cityLabel("casablanca" as CityKey, "en"), "Casablanca");
    eq("cityKey of a free-text city", cityKey("Ain Sebaa"), null);
  }

  /* ------------------------------------------------------------------ */
  section = "risk";
  {
    // every flag of scoreRisk, read from risk.ts's source (a new flag fails here until it has a sentence)
    const src = readFileSync(join(process.cwd(), "src", "lib", "orders", "risk.ts"), "utf8");
    const added = [...src.matchAll(/add\("([a-z_]+)",\s*([^)]*)\)/g)].map((m) => ({ flag: m[1]!, points: m[2]!.trim() }));
    const pushed = [...src.matchAll(/flags\.push\("([a-z_]+)"\)/g)].map((m) => m[1]!);
    eq("the negative flags of risk.ts = RISK_FLAGS", [...new Set(added.map((a) => a.flag))].sort(), [...RISK_FLAGS].sort());
    eq("the positive flag of risk.ts", pushed, ["returning_customer"]);
    for (const a of added) if (/^\d+$/.test(a.points)) eq(`points of ${a.flag} = risk.ts`, RISK_POINTS[a.flag as keyof typeof RISK_POINTS], Number(a.points));
    const catalogs = { en, fr, ar } as Record<"en" | "fr" | "ar", Partial<Record<string, string>>>;
    for (const flag of [...added.map((a) => a.flag), ...pushed]) {
      for (const l of ["en", "fr", "ar"] as const) ok(`ops.risk.${flag} in ${l}`, !!catalogs[l][`ops.risk.${flag}`]);
    }
    for (const k of ["ops.risk.check", "ops.risk.high", "ops.risk.calibration", "ops.risk.history_bad_nocount", "ops.risk.returning_customer_nocount"]) {
      for (const l of ["en", "fr", "ar"] as const) ok(`${k} in ${l}`, !!catalogs[l][k]);
    }
    eq("levels", [0, 49, 50, 69, 70, 100].map(riskLevel), ["low", "low", "check", "check", "high", "high"]);
    const r = explainRisk(85, ["fast", "no_origin", "bot_ua", "captcha_missing", "duplicate", "made_up_flag"], null);
    eq("the top three by points, ties in risk.ts's order, unknown flags skipped", r.reasons.map((x) => [x.flag, x.points]), [
      ["bot_ua", 40],
      ["duplicate", 40],
      ["captcha_missing", 20],
    ]);
    eq("level of 85", r.level, "high");
    const h = explainRisk(60, ["history_bad", "fast"], { bad: 4, delivered: 0 });
    eq("history_bad: n from this store's row, points 15 × n capped at 45", [h.reasons[0]!.points, h.reasons[0]!.text], [45, { key: "ops.risk.history_bad", vars: { n: 4 } }]);
    eq("history_bad without a customer row: no number", explainRisk(60, ["history_bad"], null).reasons[0]!.text, { key: "ops.risk.history_bad_nocount" });
    eq("history_bad with a zero count: no number", explainRisk(60, ["history_bad"], { bad: 0, delivered: 2 }).reasons[0]!.text, { key: "ops.risk.history_bad_nocount" });
    eq("returning customer, the positive line", explainRisk(0, ["returning_customer"], { bad: 0, delivered: 3 }).positive, { key: "ops.risk.returning_customer", vars: { n: 3 } });
    eq("returning customer without a row", explainRisk(0, ["returning_customer"], null).positive, { key: "ops.risk.returning_customer_nocount" });
    eq("no positive line without the flag", explainRisk(10, ["fast"], { bad: 0, delivered: 5 }).positive, null);
    eq("the honeypot ranks first", explainRisk(100, ["fast", "honeypot", "too_fast", "bot_ua"], null).reasons.map((x) => x.flag), ["honeypot", "bot_ua", "too_fast"]);
    eq("customerHistoryOf", customerHistoryOf({ fakeCount: 1, returnedCount: 2, cancelledCount: 3, deliveredCount: 4 }), { bad: 6, delivered: 4 });
    // every sentence renders in the three languages without a leftover placeholder
    for (const l of ["en", "fr", "ar"] as const) {
      for (const flag of RISK_FLAGS) {
        const s = t(`ops.risk.${flag}`, { n: 2 }, l);
        ok(`ops.risk.${flag} renders in ${l}`, s.length > 0 && !s.includes("{") && !s.startsWith("ops."), s);
      }
      eq(`history_bad plural (${l}, n = 1)`, t("ops.risk.history_bad", { n: 1 }, l).includes("1"), true);
    }
    eq("en plural: one", t("ops.risk.history_bad", { n: 1 }, "en"), "This number had 1 order that did not arrive");
    eq("fr plural: other", t("ops.risk.history_bad", { n: 3 }, "fr"), "Ce numéro a eu 3 commandes non abouties");
    eq("calibration", t("ops.risk.calibration", { share: "38%", n: 52 }, "en"), "In your store, orders like this one ended fake, cancelled or unreachable 38% of the time (52 orders)");
  }

  /* ------------------------------------------------------------------ */
  section = "window";
  {
    for (const c of WINDOW_FIXTURES) {
      const now = new Date(c.at);
      const call = isCallable(now, c.window);
      eq(`${c.name}: open`, call.open, c.expect.open);
      eq(`${c.name}: opensAt`, call.open ? null : call.opensAt?.toISOString() ?? null, c.expect.opensAt);
      eq(`${c.name}: nextCallableAt`, nextCallableAt(now, c.window).toISOString(), c.expect.nextCallableAt);
      eq(`${c.name}: snapIntoWindow = nextCallableAt`, snapIntoWindow(now, c.window).toISOString(), c.expect.nextCallableAt);
      eq(`${c.name}: shopper promise`, shopperPromiseAllowed(c.window), c.expect.shopperPromise);
      if (c.expect.isoWeekday) eq(`${c.name}: isoWeekday`, isoWeekday(now, c.window.tz), c.expect.isoWeekday);
      for (const l of ["fr", "ar", "en"] as const) {
        const h = hoursText(c.window, l, DATE_LOCALES[l], now);
        if (c.expect.hoursText?.[l] !== undefined) eq(`${c.name}: hoursText ${l}`, h, c.expect.hoursText[l]);
        if (c.expect.confirmHours?.[l] !== undefined) eq(`${c.name}: confirm_hours ${l}`, shopperPromiseAllowed(c.window) ? h : "", c.expect.confirmHours[l]);
      }
    }
    ok("the fixture covers configured: false, a Ramadan override, a crossing range, a closed date and both offsets", [
      WINDOW_FIXTURES.some((c) => !c.window.configured),
      WINDOW_FIXTURES.some((c) => c.window.overrides.length > 0),
      WINDOW_FIXTURES.some((c) => Object.values(c.window.days).some((rs) => rs.some((r) => r.to < r.from))),
      WINDOW_FIXTURES.some((c) => c.window.closedDates.length > 0),
      WINDOW_FIXTURES.some((c) => c.at.startsWith("2026-02-15")) && WINDOW_FIXTURES.some((c) => c.at.startsWith("2026-03-22")),
    ].every(Boolean));
    eq("DEFAULT_WINDOW.days[5] is Friday's (09:30-12:15)", DEFAULT_WINDOW.days[5], [{ from: "09:30", to: "12:15" }, { from: "14:30", to: "21:00" }]);
    eq("isoWeekday Mon 2 … Sun 8 November 2026", [2, 3, 4, 5, 6, 7, 8].map((d) => isoWeekday(new Date(`2026-11-0${d}T12:00:00Z`), TZ)), [1, 2, 3, 4, 5, 6, 7]);
    eq("DEFAULT_WINDOW keys are exactly 1-7", Object.keys(DEFAULT_WINDOW.days).sort(), ["1", "2", "3", "4", "5", "6", "7"]);

    // a window with no range at all: isCallable answers opensAt null, nextCallableAt throws, snap keeps t
    const empty: EffectiveWindow = { tz: TZ, days: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }, closedDates: [], overrides: [], openOverrideUntil: null, configured: true };
    const t0 = new Date("2026-11-02T10:00:00.000Z");
    eq("no range anywhere: opensAt null", isCallable(t0, empty), { open: false, opensAt: null });
    eq("no range anywhere: nextCallableAt throws a RangeError", (() => {
      try {
        nextCallableAt(t0, empty);
        return "no throw";
      } catch (e) {
        return e instanceof RangeError;
      }
    })(), true);
    eq("no range anywhere: snapIntoWindow keeps t", snapIntoWindow(t0, empty).toISOString(), t0.toISOString());
    eq("no range anywhere: hoursText is empty", hoursText(empty, "fr", "fr-MA", t0), "");

    // rangesForDay: override wins inside its dates, a closed date has none
    const ram: EffectiveWindow = { ...empty, days: DEFAULT_WINDOW.days, overrides: [{ label: "R", from: "2027-02-08", to: "2027-03-09", days: { 1: RAMADAN_PRESET, 2: RAMADAN_PRESET, 3: RAMADAN_PRESET, 4: RAMADAN_PRESET, 5: RAMADAN_PRESET, 6: RAMADAN_PRESET, 7: RAMADAN_PRESET } }], closedDates: ["2027-02-20"] };
    eq("rangesForDay inside the override", rangesForDay("2027-02-10", ram), RAMADAN_PRESET);
    eq("rangesForDay the day before the override", rangesForDay("2027-02-07", ram), DEFAULT_WINDOW.days[7]);
    eq("rangesForDay on a closed date inside the override", rangesForDay("2027-02-20", ram), []);

    // windowMinutesBetween (the first-touch KPI, OD17)
    const fresh: EffectiveWindow = { tz: TZ, days: DEFAULT_WINDOW.days, closedDates: [], overrides: [], openOverrideUntil: null, configured: false };
    const wm = (a: string, b: string, w: EffectiveWindow = fresh) => windowMinutesBetween(new Date(a), new Date(b), w);
    eq("Monday 08:00 → 15:00 local: 210 + 30 window minutes", wm("2026-11-02T07:00:00Z", "2026-11-02T14:00:00Z"), 240);
    eq("a night order: Sunday 22:00 → Monday 09:45 local is 15 window minutes", wm("2026-11-08T21:00:00Z", "2026-11-09T08:45:00Z"), 15);
    eq("Friday 12:00 → 15:00 local: 15 + 30", wm("2026-11-06T11:00:00Z", "2026-11-06T14:00:00Z"), 45);
    eq("b before a: 0", wm("2026-11-02T14:00:00Z", "2026-11-02T07:00:00Z"), 0);
    eq("a Ramadan night range crossing midnight: 180 + 60", wm("2027-02-10T21:00:00Z", "2027-02-11T11:00:00Z", { ...fresh, overrides: ram.overrides }), 240);
    eq("a closed date counts nothing", wm("2026-11-06T00:00:00Z", "2026-11-07T00:00:00Z", { ...fresh, closedDates: ["2026-11-06"] }), 0);
    eq("the Sunday the clocks go back: 210 + 390", wm("2026-02-14T23:00:00Z", "2026-02-15T23:00:00Z"), 600);
    const overlap: EffectiveWindow = { ...fresh, days: { ...fresh.days, 1: [{ from: "09:00", to: "12:00" }, { from: "11:00", to: "13:00" }] } };
    eq("overlapping ranges count once", wm("2026-11-02T07:00:00Z", "2026-11-02T13:00:00Z", overlap), 240);
    eq("\"Open calls now\" is not window time", wm("2026-11-02T20:30:00Z", "2026-11-02T22:30:00Z", { ...fresh, openOverrideUntil: "2026-11-02T23:00:00.000Z" }), 0);

    // effectiveWindow: the ops setting + the store time zone → the one type
    const defaults = OpsSetting.parse({});
    eq("effectiveWindow of a fresh ops setting", effectiveWindow(defaults, TZ), fresh);
    eq("saved once: configured", effectiveWindow({ ...defaults, callingWindow: { ...defaults.callingWindow, savedAt: "2026-10-27T10:00:00.000Z" } }, TZ).configured, true);

    // hoursText's digits follow dateLocale's numbering system
    const arab = new Intl.NumberFormat("ar-EG").format(1) !== "1";
    eq("hoursText with Arabic-Indic digits when dateLocale asks for them", hoursText(fresh, "ar", "ar-EG-u-nu-arab", new Date("2026-11-02T09:00:00Z")), arab || new Intl.NumberFormat("ar-EG-u-nu-arab").format(1) !== "1" ? "٠٩:٣٠-١٣:٠٠، ١٤:٣٠-٢١:٠٠" : "09:30-13:00، 14:30-21:00");
    eq("hoursText in a locale the admin does not ship", hoursText(fresh, "es", "es-ES", new Date("2026-11-02T09:00:00Z")), "09:30-13:00, 14:30-21:00");
  }

  /* ------------------------------------------------------------------ */
  section = "ladder";
  {
    const ops = OpsSetting.parse({});
    const at = (s: string) => new Date(s);
    const L = (n: number, now: string, o = ops) => iso(ladderNext(n, at(now), o, TZ));
    eq("attempt 1 (Mon 10:00): +1 h → 11:00", L(1, "2026-11-02T09:00:00Z"), "2026-11-02T10:00:00.000Z");
    eq("attempt 1 (Mon 12:30): +1 h lands in the lunch break → 14:30", L(1, "2026-11-02T11:30:00Z"), "2026-11-02T13:30:00.000Z");
    eq("attempt 2 (Mon 19:00): +3 h is after 21:00 → Tue 09:30", L(2, "2026-11-02T18:00:00Z"), "2026-11-03T08:30:00.000Z");
    eq("attempt 3 (Mon 10:00): next day 11:00", L(3, "2026-11-02T09:00:00Z"), "2026-11-03T10:00:00.000Z");
    eq("attempt 4 (Mon 10:00): 18:30 today (≥ 1 h away)", L(4, "2026-11-02T09:00:00Z"), "2026-11-02T17:30:00.000Z");
    eq("attempt 4 (Mon 18:00): 18:30 is under the 1 h gap → Tue 18:30", L(4, "2026-11-02T17:00:00Z"), "2026-11-03T17:30:00.000Z");
    eq("attempt 5: next day 11:00", L(5, "2026-11-03T15:00:00Z"), "2026-11-04T10:00:00.000Z");
    eq("attempt 6: the ladder is exhausted", L(6, "2026-11-03T15:00:00Z"), "exhausted");
    const closedFriday = { ...ops, callingWindow: { ...ops.callingWindow, closedDates: ["2026-11-06"] } };
    eq("attempt 3 (Thu 10:00) skips a closed Friday → Sat 11:00", L(3, "2026-11-05T09:00:00Z", closedFriday), "2026-11-07T10:00:00.000Z");
    eq("attempt 1 on the eve of a closed day: +1 h at Thu 20:30 → Sat 09:30", L(1, "2026-11-05T19:30:00Z", closedFriday), "2026-11-07T08:30:00.000Z");
    // the fake clock across the Africa/Casablanca offset changes: the wall-clock hour of the step holds
    eq("next day 11:00 across the switch to UTC+0 (Sat 14 Feb → Sun 15 Feb)", L(3, "2026-02-14T09:00:00Z"), "2026-02-15T11:00:00.000Z");
    eq("+3 h at Sat 21 March 20:00 (UTC+0) → Sun 22 March 09:30 (UTC+1)", L(2, "2026-03-21T20:00:00Z"), "2026-03-22T08:30:00.000Z");
    eq("18:30 on the Sunday the clocks go forward", L(4, "2026-03-22T09:00:00Z"), "2026-03-22T17:30:00.000Z");
    const ramadan = { ...ops, callingWindow: { ...ops.callingWindow, savedAt: "2027-01-10T10:00:00.000Z" }, windowOverrides: [{ label: "Ramadan", from: "2027-02-08", to: "2027-03-09", days: { 1: RAMADAN_PRESET, 2: RAMADAN_PRESET, 3: RAMADAN_PRESET, 4: RAMADAN_PRESET, 5: RAMADAN_PRESET, 6: RAMADAN_PRESET, 7: RAMADAN_PRESET } }] };
    eq("Ramadan hours: +1 h at 16:30 → the night range 21:30", L(1, "2027-02-10T16:30:00Z", ramadan), "2027-02-10T21:30:00.000Z");
    eq("Ramadan hours: +1 h at 00:00 stays in the range crossing midnight", L(1, "2027-02-10T23:00:00Z", { ...ramadan, ladder: [{ kind: "after", minutes: 60 }] }), "2027-02-11T00:00:00.000Z");
    eq("an edited ladder: `at` with a 0 gap", L(1, "2026-11-02T09:00:00Z", { ...ops, ladder: [{ kind: "at", time: "10:00", minGapMinutes: 0 }] }), "2026-11-02T09:00:00.000Z");
    // keep_open (OPE-§6.3): one try a day at the last step's hour for keepOpenDays after the first attempt
    const keep = { ...ops, unreachable: "keep_open" as const, keepOpenDays: 7 };
    const first = at("2026-11-02T09:00:00Z");
    eq("keep_open: after the ladder, the next open day at 11:00", iso(nextDue(6, first, at("2026-11-06T10:00:00Z"), keep, TZ)), "2026-11-07T10:00:00.000Z");
    eq("keep_open: past keepOpenDays → exhausted", iso(nextDue(7, first, at("2026-11-08T10:00:00Z"), keep, TZ)), "exhausted");
    eq("close: after the ladder → exhausted", iso(nextDue(6, first, at("2026-11-06T10:00:00Z"), ops, TZ)), "exhausted");
    eq("nextDue inside the ladder = ladderNext (10:00 + 3 h = 13:00, the exclusive end → 14:30)", iso(nextDue(2, first, at("2026-11-02T09:00:00Z"), keep, TZ)), "2026-11-02T13:30:00.000Z");
    eq("keepOpenNext with an `after` last step: the next open day's opening", iso(keepOpenNext(first, at("2026-11-03T10:00:00Z"), { ...keep, ladder: [{ kind: "after", minutes: 60 }] }, TZ)), "2026-11-04T08:30:00.000Z");
    // the delivery lane (OPE-§6.1a)
    eq("rescue: the first no-answer → +retryMinutes", iso(rescueNext(1, 1, at("2026-11-02T09:00:00Z"), ops, TZ)), "2026-11-02T10:00:00.000Z");
    eq("rescue: the second → the next open day 11:00", iso(rescueNext(2, 2, at("2026-11-02T09:00:00Z"), ops, TZ)), "2026-11-03T10:00:00.000Z");
    eq("rescue: maxCalls made → exhausted", iso(rescueNext(3, 3, at("2026-11-02T09:00:00Z"), ops, TZ)), "exhausted");
    eq("rescue: +retryMinutes after 21:00 snaps to the next opening", iso(rescueNext(1, 1, at("2026-11-02T19:30:00Z"), ops, TZ)), "2026-11-03T08:30:00.000Z");
  }

  /* ------------------------------------------------------------------ */
  section = "priority";
  {
    const p = (confirm: "new" | "attempting" | "callback" | "confirmed", ship: "none" | "attempt_failed" | "postponed" | "to_pack" = "none", over: Partial<Parameters<typeof priorityOf>[0]> = {}) =>
      priorityOf({ states: { confirm, ship }, totalCents: 0, risk: 0, attempts: 0, ...over });
    eq("bases: delivery 650 > callback 600 > new 500 > attempting 300", [p("confirmed", "attempt_failed"), p("callback"), p("new"), p("attempting")], [650, 600, 500, 300]);
    eq("postponed sits in the delivery lane", laneOf({ confirm: "confirmed", ship: "postponed" }), "delivery");
    eq("a confirmed order moving normally has no lane (base 0)", [laneOf({ confirm: "confirmed", ship: "to_pack" }), p("confirmed", "to_pack")], [null, 0]);
    eq("amount: +5 per 100 of currency, at most +100", [0, 9_999, 10_000, 59_999, 2_000_000].map((totalCents) => p("new", "none", { totalCents })), [500, 500, 505, 525, 600]);
    eq("risk: 49 → 0, 50 → −50, 69 → −50, 70 → −150", [49, 50, 69, 70].map((risk) => p("new", "none", { risk })), [500, 450, 450, 350]);
    eq("attempts: −40 each, at most −200", [1, 5, 9].map((attempts) => p("new", "none", { attempts })), [460, 300, 300]);
    eq("pinned ⇔ stored priority ≥ 1000", [p("new", "none", { priority: 999 }), p("new", "none", { priority: 1000 }), p("new", "none", { priority: 1_640 })], [500, 1_500, 1_500]);
    eq("isPinned", [isPinned(999), isPinned(1000)], [false, true]);
    ok("a pinned attempting order outranks an unpinned rescue", p("attempting", "none", { priority: 1000 }) > p("confirmed", "attempt_failed"));
  }

  /* ------------------------------------------------------------------ */
  section = "iso";
  {
    const defaults = OpsSetting.parse({});
    eq("ops.callingWindow.days: exactly the keys 1-7", Object.keys(defaults.callingWindow.days).sort(), ["1", "2", "3", "4", "5", "6", "7"]);
    const week: Record<string, Range[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
    eq("WeekRanges accepts the seven ISO keys", WeekRanges.safeParse(week).success, true);
    eq("WeekRanges refuses a 0-based key", WeekRanges.safeParse({ ...week, 0: [] }).success, false);
    eq("WeekRanges refuses a missing Sunday (7)", WeekRanges.safeParse({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }).success, false);
    eq("WeekRanges refuses an array", WeekRanges.safeParse([[], [], [], [], [], [], []]).success, false);
    const override = (from: string, to: string) => ({ label: "x", from, to, days: week });
    eq("windowOverrides: non-overlapping accepted", OpsSetting.safeParse({ windowOverrides: [override("2027-02-08", "2027-03-09"), override("2027-03-10", "2027-03-12")] }).success, true);
    eq("windowOverrides: overlapping refused", OpsSetting.safeParse({ windowOverrides: [override("2027-02-08", "2027-03-09"), override("2027-03-09", "2027-03-12")] }).success, false);
    eq("cityAliases: 200 accepted, 201 refused", [200, 201].map((n) => OpsSetting.safeParse({ cityAliases: Object.fromEntries(Array.from({ length: n }, (_, i) => [`alias ${i}`, "casablanca"])) }).success), [true, false]);
    ok("every fixture window uses the ISO keys", WINDOW_FIXTURES.every((c) => Object.keys(c.window.days).sort().join() === "1,2,3,4,5,6,7" && c.window.overrides.every((o) => Object.keys(o.days).sort().join() === "1,2,3,4,5,6,7")));
    eq("the default ladder (reasoned starting value)", defaults.ladder.length, 5);
  }

  /* ------------------------------------------------------------------ */
  section = "catalog";
  {
    const all = { en, fr, ar } as Record<"en" | "fr" | "ar", Partial<Record<string, string>>>;
    const need = [
      ...CANCEL_REASONS.map((r) => `ops.reason.${r}`),
      ...RETURN_REASONS.map((r) => `ops.reason.return.${r}`),
      "ops.reason.return.none",
      ...SHIP_STATES.map((s) => `ops.ship.${s}`),
      // the timeline (OPE-§4.1, agents read it) and the notifications (OD45) are trilingual in R1
      ...Object.keys(en).filter((k) => k.startsWith("ops.tl.") || k.startsWith("notify.ops.")),
      ...CONFIRM_STATES.map((s) => `ops.tl.state_changed.confirm.${s}`),
      ...SHIP_STATES.map((s) => `ops.tl.state_changed.ship.${s}`),
      ...MONEY_STATES.map((s) => `ops.tl.state_changed.money.${s}`),
    ];
    for (const l of ["en", "fr", "ar"] as const) {
      const missing = need.filter((k) => !all[l][k]);
      eq(`reasons, ship states, timeline and notifications complete in ${l}`, missing, []);
      const extra = Object.keys(all[l]).filter((k) => !(k in en));
      eq(`${l}: no key outside the English reference`, extra, []);
      const bad = Object.entries(all[l]).filter(([, v]) => !v || v.includes("—") || /\bStep \d/i.test(v) || /!/.test(v));
      eq(`${l}: no empty value, em dash, "Step n" or exclamation mark`, bad.map(([k]) => k), []);
      eq(`${l}: every key under ops. (or notify.ops., D67)`, Object.keys(all[l]).filter((k) => !k.startsWith("ops.") && !k.startsWith("notify.ops.")), []);
    }
    eq("the §6.4 picker codes in English, verbatim", CANCEL_REASONS.filter((r) => r !== "blocked" && r !== "attempts_exhausted").map((r) => en[`ops.reason.${r}` as keyof typeof en]), [
      "Changed their mind",
      "Price",
      "Ordered by mistake",
      "Bought elsewhere",
      "Says they didn't order",
      "Wrong number",
      "Outside delivery area",
      "Delivery too slow",
      "Wants to see the product first",
      "Asked to cancel",
      "Other",
    ]);
  }

  return { passes, failures, sections };
}
