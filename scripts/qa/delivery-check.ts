// proves: LP-03, SF-08
/**
 * test:delivery (P3 LANDING; landing.md LAN-§7.5, §25.1; docs/STORE-SAAS.md §J.1 row `test:delivery`, D68, D73):
 *
 *   npm run test:delivery        (tsx scripts/qa/delivery-check.ts; offline, no database, about 1 s)
 *
 * 1. The pure delivery-promise cases of src/lib/delivery/selftest.ts: the ETA window (cut-off, weekends, holidays,
 *    min = 0, month and year crossings, Ramadan in Africa/Casablanca, no time-zone support), the ar / fr / en texts,
 *    the > 21-day range, the confirmation-lead grid (one promise never broken), `dz.afterCall`, the LAN-§7.4 line,
 *    every `ZoneProblem` code, the lead suggestion, the holiday seed and reminder, the hours helpers.
 * 2. The shared city-key fixture of operations (scripts/qa/fixtures/city-key.json, P4's; D68): every slug, the
 *    key-shape case (`zoneTableKey: "value"`: `buildZoneTable(…).city` is keyed by the posted `City.value`, every
 *    value of `MA_CITIES` but "Autre"), and the browser/server parity of "Fès", "Ksar El Kébir", "Autre" and an
 *    unknown value. The file is mandatory: a missing fixture fails the run.
 * 3. The shared calling-window fixture (src/lib/callcenter/window.fixtures.ts, P4's; D73): on every case the "no
 *    hours" test agrees with the fixture's `shopperPromise`, and a `configured: false` window renders no hours text.
 *
 * The import-graph case (no add-on reaches src/lib/orders/address.ts) lands with the add-on chunks (test:landing-addons).
 * Exits 1 on any failure.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { WINDOW_FIXTURES } from "../../src/lib/callcenter/window.fixtures";
import { runDeliverySelftest, zone, CAL } from "../../src/lib/delivery/selftest";
import { zoneForCity, zoneForCityValue } from "../../src/lib/delivery/match";
import { buildZoneTable } from "../../src/lib/delivery/table";
import { noShopperHours, shopperHoursText, windowIsEmpty } from "../../src/lib/landing/hours";
import { MA_CITIES, OTHER_CITY } from "../../src/lib/markets/cities-ma";
import { cityKey } from "../../src/lib/orders/address";

const started = Date.now();
let checks = 0;
const failures: string[] = [];
function check(ok: boolean, name: string, detail?: unknown): void {
  checks++;
  if (!ok) failures.push(detail === undefined ? name : `${name}\n      ${JSON.stringify(detail)?.slice(0, 600)}`);
}

/* 1. the pure cases */
runDeliverySelftest(check);

/* 2. the city-key parity fixture */
interface CityKeyFixture {
  v: number;
  zoneTableKey: string;
  slugs: { value: string; key: string | null }[];
  zoneTable: { name: string; zones: string[][]; expect: { city: Record<string, number>; absent: string[]; star: number | null } }[];
}
const FIXTURE = path.resolve(__dirname, "fixtures", "city-key.json");
// Mandatory since the wave-1 verify (p3-10): P4's fixture is on main, so the inline fallback table is gone.
if (!existsSync(FIXTURE)) {
  console.error("✗ test:delivery: scripts/qa/fixtures/city-key.json is missing (P4's shared fixture, D68)");
  process.exit(1);
}
const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as CityKeyFixture;

check(fixture.zoneTableKey === "value", "city-key.json: the browser table is keyed by the posted City.value (zoneTableKey)", fixture.zoneTableKey);
for (const s of fixture.slugs) check(cityKey(s.value) === s.key, `city-key: cityKey("${s.value}") = ${s.key}`, cityKey(s.value));
const listed = new Set(fixture.slugs.map((s) => s.value));
check(MA_CITIES.every((c) => listed.has(c.value)), "city-key.json lists every City.value of MA_CITIES");
const values = MA_CITIES.filter((c) => c.value !== OTHER_CITY.value).map((c) => c.value);
for (const t of fixture.zoneTable) {
  const zones = t.zones.map((cities, i) => zone(`zone ${i}`, cities, { position: i }));
  const table = buildZoneTable(zones, CAL, MA_CITIES);
  for (const [value, idx] of Object.entries(t.expect.city)) check(table.city[value] === idx, `zone table (${t.name}): city["${value}"] = ${idx}`, table.city[value]);
  for (const value of t.expect.absent) check(!(value in table.city), `zone table (${t.name}): "${value}" is absent and resolves to star`);
  check(table.star === t.expect.star, `zone table (${t.name}): star = ${t.expect.star}`, table.star);
  const keys = Object.keys(table.city).sort();
  check(JSON.stringify(keys) === JSON.stringify([...values].sort()), `zone table (${t.name}): the key set is every City.value except "Autre"`, { keys: keys.length, values: values.length });
}
// "Fès picked in the form": the server (slug) and the browser (value-keyed table) find the same zone
{
  const zones = [zone("Fès", ["fes"], { etaMinDays: 1, etaMaxDays: 2 }), zone("Ksar", ["ksar-el-kebir"], { etaMinDays: 2, etaMaxDays: 3 }), zone("Reste", ["*"], { etaMinDays: 3, etaMaxDays: 5 })];
  const table = buildZoneTable(zones, CAL, MA_CITIES);
  const browser = (value: string) => zones[table.city[value] ?? table.star ?? -1]?.id ?? null;
  for (const [value, want] of [
    ["Fès", "Fès"],
    ["Ksar El Kébir", "Ksar"],
    ["Autre", "Reste"],
    ["Atlantis", "Reste"],
  ] as const) {
    const server = zoneForCityValue(zones, value);
    check(server?.name === want && browser(value) === server.id, `parity: "${value}" → ${want} on the server and in the browser table`, { server: server?.name, browser: browser(value) });
  }
  check(zoneForCity(zones, null)?.name === "Reste", "parity: a null key (\"Autre\", a typed city) → the '*' zone");
  check(cityKey("Fès") === "fes" && zoneForCity(zones, cityKey("Fès"))?.name === "Fès", "parity: the select posts \"Fès\" → cityKey = \"fes\" → the zone [\"fes\"]");
}

/* 3. the calling-window fixture */
for (const c of WINDOW_FIXTURES) {
  const at = new Date(c.at);
  const none = noShopperHours(c.window, at);
  check(none === (!c.expect.shopperPromise || windowIsEmpty(c.window, at)), `window fixture "${c.name}": noShopperHours agrees with shopperPromise`);
  if (!c.window.configured) check(none && shopperHoursText(c.window, "fr", "fr-FR", at) === null, `window fixture "${c.name}": configured: false → no hours text`);
}
check(WINDOW_FIXTURES.length > 0, "window fixture: cases present");

const ms = Date.now() - started;
if (failures.length) {
  console.error(`✗ test:delivery (LP-03, SF-08): ${failures.length} of ${checks} checks failed`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ test:delivery (LP-03, SF-08): ${checks} checks passed in ${ms} ms`);
