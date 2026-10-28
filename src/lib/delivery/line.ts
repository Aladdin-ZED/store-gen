/**
 * The delivery line on landing pages (P3 LANDING; landing.md LAN-§7.4, LD4, LD5; docs/STORE-SAAS.md D68). Pure and
 * isomorphic: the `assist` add-on composes the line in the shopper's browser at its own `now`, and the server renders
 * the same composer's general line as the no-JS fallback, so a page never says two things. It reads only the
 * value-keyed `ZoneTable` (`table.city[value] ?? table.star`; the browser never computes a slug) and never imports
 * src/lib/orders/address.ts.
 *
 * The fee is always the page's own fee for the checked offer (`offers.shippingFee`, a free offer), formatted by the
 * caller; a zone fee is never shown on a landing page in R1 (LD4: zone fees are charged by store checkout from R2).
 *
 * | state        | when                                              | line                                                     |
 * |--------------|---------------------------------------------------|----------------------------------------------------------|
 * | `general`    | no city yet, or a text-mode city field            | "Livraison en 1 à 3 jours ouvrés selon la ville · 35 DH" |
 * | `dated`      | the city's zone (or "*") has days                 | "Livraison à Fès : entre … et …, après … (estimation) · …" |
 * | `undated`    | the city's zone has no days                       | "Livraison à Fès · 35 DH"                                |
 * | `not_served` | the city's zone is not served                     | "Nous ne livrons pas encore à Fès." + WhatsApp           |
 * | `none`       | no zone and no "*" zone, or nothing to say        | no line (no promise)                                     |
 */
import { DZ, fill, fillCity, type ShopperLocale } from "@/lib/landing/copy";
import { OTHER_CITY } from "@/lib/markets/cities-ma";
import { dayRangeText, etaParts, etaWindow } from "./eta";
import type { DeliveryZoneRow, ZoneTable } from "./types";

/** The page's fee for the checked offer: free (a free offer or `shippingFee` 0), or its formatted amount. */
export type PageFee = { free: true } | { free: false; text: string };

export interface LineInput {
  table: Pick<ZoneTable, "zones" | "city" | "star" | "cal">;
  /** the city picked in the `<select>`: its posted `City.value` and its option text; null before a pick */
  city: { value: string; label: string } | null;
  /** a text-mode city field: the general line only (LAN-§7.4) */
  textMode?: boolean;
  locale: ShopperLocale;
  /** the page's money locale (digits) */
  dateLocale: string;
  now: Date;
  /** `checkout.confirmationCall`: pre-call surfaces add `dz.afterCall` */
  confirmationCall: boolean;
  fee: PageFee | null;
  /** wa.me digits when the store has a WhatsApp number and `checkout.notServed.whatsapp`; else null */
  whatsapp: string | null;
}

export type DeliveryLine =
  | { state: "none" }
  | {
      state: "general" | "dated" | "undated";
      /** the words before the marker */
      lead: string;
      /** "(estimation)": muted, only after real dates */
      marker: string | null;
      /** the fee, after " · " */
      tail: string | null;
    }
  | { state: "not_served"; lead: string; cta: { label: string; href: string } | null };

const feeText = (fee: PageFee | null, locale: ShopperLocale) => (fee === null ? null : fee.free ? DZ[locale].free : fee.text);

/** The served zones' working-day bounds with the confirmation lead added, or null when no served zone has days. */
export function generalRange(zones: readonly { d: readonly [number, number] | null; ns: boolean }[], leadDays: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const z of zones) {
    if (z.ns || !z.d) continue;
    lo = Math.min(lo, z.d[0]);
    hi = Math.max(hi, z.d[1]);
  }
  return Number.isFinite(lo) ? [lo + leadDays, hi + leadDays] : null;
}

/** The line of LAN-§7.4's state table for the current pick. */
export function composeLine(i: LineInput): DeliveryLine {
  const c = DZ[i.locale];
  const tail = feeText(i.fee, i.locale);
  if (!i.city || i.textMode) {
    const range = generalRange(i.table.zones, i.table.cal.leadDays);
    if (!range) return { state: "none" };
    return { state: "general", lead: fill(c.general, { days: dayRangeText(range[0], range[1], i.locale) }), marker: null, tail };
  }
  const idx = i.table.city[i.city.value] ?? i.table.star;
  const zone = idx === null || idx === undefined ? undefined : i.table.zones[idx];
  if (!zone) return { state: "none" };
  const other = i.city.value === OTHER_CITY.value || !i.city.label.trim();
  const city = i.city.label.trim();
  if (zone.ns) {
    const text = other ? c.notServedTextOther : fillCity(c.notServedText, { city });
    return {
      state: "not_served",
      lead: other ? c.notServedOther : fillCity(c.notServed, { city }),
      cta: i.whatsapp ? { label: c.notServedCta, href: `https://wa.me/${i.whatsapp}?text=${encodeURIComponent(text)}` } : null,
    };
  }
  if (!zone.d) {
    if (other && tail === null) return { state: "none" };
    return { state: "undated", lead: other ? c.deliveryOnly : fillCity(c.cityOnly, { city }), marker: null, tail };
  }
  const days = { etaMinDays: zone.d[0], etaMaxDays: zone.d[1] };
  const p = etaParts(etaWindow(i.table.cal, days, i.now), days, i.locale, i.dateLocale, i.now);
  const dates = i.confirmationCall ? `${p.text}${c.comma}${c.afterCall}` : p.text;
  return { state: "dated", lead: other ? fill(c.cityless, { dates }) : fillCity(c.city, { city, dates }), marker: p.dated ? c.estimated : null, tail };
}

/** The line as one string (the server fallback, the editor's live card, tests). */
export function lineText(line: DeliveryLine): string | null {
  if (line.state === "none") return null;
  if (line.state === "not_served") return line.lead;
  return `${line.lead}${line.marker ? ` ${line.marker}` : ""}${line.tail ? ` · ${line.tail}` : ""}`;
}

/**
 * The server fallback summary (LAN-§7.1): the general working-day range over the served zones with days ("en 1 à 3
 * jours ouvrés", the lead included when given) and the page's own fee text, each null when unset. Never a zone fee.
 */
export function deliverySummary(
  zones: readonly DeliveryZoneRow[],
  locale: ShopperLocale,
  opts: { leadDays?: number; fee?: PageFee | null } = {},
): { etaText: string | null; feeText: string | null } {
  const range = generalRange(
    zones.map((z) => ({ d: z.etaMinDays !== null && z.etaMaxDays !== null ? ([z.etaMinDays, z.etaMaxDays] as const) : null, ns: z.notServed })),
    opts.leadDays ?? 0,
  );
  return { etaText: range ? dayRangeText(range[0], range[1], locale) : null, feeText: feeText(opts.fee ?? null, locale) };
}
