/**
 * The delivery editor's model (landing.md LAN-§7.3, §2.1): the data the page hands the editor, the zone list as the
 * browser edits it, the starter zones, the folded city search and the `ZoneProblem` sentences. Isomorphic and pure.
 *
 * A zone made in the browser carries a temporary id ("new-…") until the save answers with the server's list; only
 * a real id (a ULID of this store's zone) is sent back, so `saveZones` keeps identities and replaces anything else.
 */
import type { DeliveryZoneRow, ZoneCityKey, ZoneInput, ZoneProblem } from "@/lib/delivery/types";
import { formatMoney } from "@/lib/markets/info";
import type { CheckoutSetting } from "@/lib/settings/keys/checkout";
import type { ShopperLocale } from "@/lib/landing/copy";

export interface CityRow {
  /** the `CityKey` slug: what the client posts */
  key: string;
  /** the posted `City.value` ("Fès"): what a landing form sends */
  value: string;
  fr: string;
  ar: string;
  en?: string;
  major: boolean;
}

export interface DeliveryEditorData {
  canWrite: boolean;
  /** `settings.write`: the typical-days field of markets without a city list */
  canWritePolicies: boolean;
  market: string;
  hasCityList: boolean;
  zones: DeliveryZoneRow[];
  cities: CityRow[];
  checkout: {
    zonesEnabled: boolean;
    lineOnLanding: boolean;
    confirmationCall: boolean;
    notServedWhatsapp: boolean;
    calendar: CheckoutSetting["calendar"];
  };
  tz: string;
  /** store-local YYYY-MM-DD */
  today: string;
  suggestion: { days: number; count: number } | null;
  /** the store's first page locale: the live card speaks it */
  pageLocale: ShopperLocale;
  currency: string;
  moneyLocale: string;
  /** `defaults.shippingFee` (major units): the fee a new page starts with, null when not set */
  pageFee: number | null;
  /** wa.me digits of the store, null without */
  whatsapp: string | null;
  typicalDays: [number, number] | null;
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
let seq = 0;
export const tempId = (): string => `new-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const STAR = "*";

/** The list as `saveZones` takes it (position = list order). */
export function toInputs(zones: readonly DeliveryZoneRow[]): ZoneInput[] {
  return zones.map((z) => ({
    ...(ULID.test(z.id) ? { id: z.id } : {}),
    name: z.name.trim() || "Zone",
    cities: [...z.cities],
    feeCents: z.notServed ? null : z.feeCents,
    freeFromCents: z.notServed ? null : z.freeFromCents,
    etaMinDays: z.notServed ? null : z.etaMinDays,
    etaMaxDays: z.notServed ? null : z.etaMaxDays,
    notServed: z.notServed,
    note: z.note?.trim() || null,
  }));
}

export function blankZone(name: string, cities: string[] = []): DeliveryZoneRow {
  return { id: tempId(), name, cities: cities as ZoneCityKey[], feeCents: null, freeFromCents: null, etaMinDays: null, etaMaxDays: null, notServed: false, note: null, position: 0 };
}

/**
 * "Start with 3 zones" (LAN-§7.3): Casablanca alone, the other major cities, and every other city ("*"), all with no
 * days and no fee: nothing reaches a shopper until the owner types them.
 */
export function starterZones(cities: readonly CityRow[], names: { casa: string; major: string; rest: string }): DeliveryZoneRow[] {
  const casa = cities.find((c) => c.key === "casablanca");
  const major = cities.filter((c) => c.major && c.key !== "casablanca").map((c) => c.key);
  return [...(casa ? [blankZone(names.casa, [casa.key])] : []), blankZone(names.major, major), blankZone(names.rest, [STAR])];
}

/** Moves `keys` into zone `to` (null: no zone), out of every other zone. */
export function moveCities(zones: readonly DeliveryZoneRow[], keys: readonly string[], to: string | null): DeliveryZoneRow[] {
  const set = new Set<string>(keys);
  return zones.map((z) => {
    const kept = z.cities.filter((c) => !set.has(c));
    return z.id === to ? { ...z, cities: [...kept, ...(keys as ZoneCityKey[])] } : kept.length === z.cities.length ? z : { ...z, cities: kept };
  });
}

/** The zone that lists a city key (never the "*" zone: that one only catches what no zone lists). */
export function zoneOfCity(zones: readonly DeliveryZoneRow[], key: string): DeliveryZoneRow | null {
  return zones.find((z) => (z.cities as readonly string[]).includes(key)) ?? null;
}

/** Folded text for the city search: no case, no Latin accents, Arabic alef / ya / ta marbuta and tashkeel unified. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function cityMatches(c: CityRow, q: string): boolean {
  if (!q) return true;
  const hay = fold(`${c.fr} ${c.ar} ${c.en ?? ""} ${c.key}`);
  return q.split(" ").every((w) => hay.includes(w));
}

export const centsText = (cents: number, currency: string, locale: string): string => formatMoney(cents / 100, currency, locale);

/** The message key and vars of a server `ZoneProblem` (LAN-§7.1): shown on the zone's card, never as a toast alone. */
export function problemMessage(p: ZoneProblem, cityLabel: (key: string) => string): { key: string; vars: Record<string, string> } {
  const vars: Record<string, string> = { zone: p.zone ?? "", city: p.city ? cityLabel(p.city) : "" };
  return { key: `landing.dz.problem.${p.code}`, vars };
}
