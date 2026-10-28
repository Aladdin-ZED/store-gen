import "server-only";
/**
 * Delivery zones on the server (P3 LANDING; landing.md LAN-§7.1, §7.4, §2.1; docs/STORE-SAAS.md D68, D71, §E.6, §E.7).
 * Frozen at P0: `zoneLineFor` (the zone line every surface reads: the queue card and the call script, P4; `{eta_text}`,
 * P5; tracking, the kit, the WhatsApp order text, P3), `zonesForCheckout` (the one producer of every browser zone
 * table) and `zoneFeesFor` (slug-keyed fees for server joins). P3 adds `listZones`, `saveZones` and `calendarFor`.
 *
 * Multi-tenant (§E.3): every read takes a `StoreScope` and every predicate carries the store (`whereStore`); the one
 * write, `saveZones`, takes a `WriteCtx`, so a platform or impersonation scope can read the zones and never replace
 * them. The list is cached per store in `scopedCache("zones")` for 30 s and dropped on save (and by
 * `invalidateStore`), so one store's zones can never answer another store's lookup.
 */
import { asc } from "drizzle-orm";
import { auditFrom } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { storeLock, withNamedLock } from "@/lib/db/locks";
import { deliveryZones } from "@/lib/db/schema";
import { enqueueRenders } from "@/lib/jobs/renders";
import { DZ, type ShopperLocale } from "@/lib/landing/copy";
import { MARKET_SPECS } from "@/lib/markets/specs";
import { moneySpec } from "@/lib/markets/money";
import type { City, MarketSpec } from "@/lib/markets/types";
import type { CityKey } from "@/lib/orders/address";
import { errorSummary } from "@/lib/orders/log";
import { getStoreSetting } from "@/lib/settings";
import { scopedCache } from "@/lib/tenancy/cache";
import { getStoreById } from "@/lib/tenancy/public";
import { storeValues, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteCtx } from "@/lib/tenancy/types";
import { etaParts, etaWindow, localParts } from "./eta";
import { zoneForCity } from "./match";
import { buildZoneTable } from "./table";
import type { DeliveryZoneRow, StoreCalendar, ZoneCityKey, ZoneInput, ZoneLine, ZoneProblem, ZoneTable } from "./types";
import { marketCityKeys, normalizeZones, ZoneListSchema, zoneProblems } from "./validate";

/** stores.timezone's default (§D.4) */
const DEFAULT_TZ = "Africa/Casablanca";
const LOCALES: readonly ShopperLocale[] = ["ar", "fr", "en"];
/** `render_jobs.priority` of the zones' re-render (LAN-§7.1) */
const RENDER_PRIORITY = 6;

const zonesCache = scopedCache<DeliveryZoneRow[]>({ name: "zones", maxEntries: 2_000, ttlMs: 30_000 });

type ZoneDbRow = typeof deliveryZones.$inferSelect;
const toRow = (r: ZoneDbRow): DeliveryZoneRow => ({
  id: r.id,
  name: r.name,
  cities: [...(r.cities ?? [])],
  feeCents: r.feeCents ?? null,
  freeFromCents: r.freeFromCents ?? null,
  etaMinDays: r.etaMinDays ?? null,
  etaMaxDays: r.etaMaxDays ?? null,
  notServed: !!r.notServed,
  note: r.note ?? null,
  position: r.position,
});
/** a caller's copy: the cached list is shared */
const copyOf = (zones: readonly DeliveryZoneRow[]) => zones.map((z) => ({ ...z, cities: [...z.cities] }));

/** The market's city list (`MA_CITIES` for MA), or null for a market without one (the zones then hold "*" only). */
export function citiesOfMarket(market: string): readonly City[] | null {
  return (MARKET_SPECS as Record<string, MarketSpec | undefined>)[market]?.cities ?? null;
}

/** The store's zones in `position` order. */
export async function listZones(scope: StoreScope): Promise<DeliveryZoneRow[]> {
  const zones = await zonesCache.getOrLoad(scope.storeId, "list", async () => {
    const rows = await db
      .select()
      .from(deliveryZones)
      .where(whereStore(deliveryZones, scope))
      .orderBy(asc(deliveryZones.position), asc(deliveryZones.id));
    return rows.map(toRow);
  });
  return copyOf(zones);
}

/**
 * The store's delivery calendar (`checkout.calendar` in `stores.timezone`, default Africa/Casablanca). `leadDays`
 * (OPS-12): `confirmationLeadDays ?? 0` before the call when the store confirms by phone, 0 after it or without a
 * confirmation call.
 */
export async function calendarFor(scope: StoreScope, opts: { stage?: "before_call" | "after_call" } = {}): Promise<StoreCalendar> {
  const [checkout, store] = await Promise.all([getStoreSetting(scope, "checkout"), getStoreById(scope.storeId)]);
  const c = checkout.calendar;
  const leadDays = opts.stage === "after_call" || !checkout.confirmationCall ? 0 : (c.confirmationLeadDays ?? 0);
  return { tz: store?.timezone || DEFAULT_TZ, workdays: [...c.workdays].sort((a, b) => a - b), cutoffHour: c.cutoffHour, holidays: [...c.holidays].sort(), leadDays };
}

/**
 * The zone line of a city (null key: "Autre" / unknown → the "*" zone). `stage` "before_call" (default) applies the
 * confirmation lead and adds "après confirmation par téléphone" when the store confirms by phone; "after_call"
 * (tracking, `{eta_text}` once confirmed) uses 0 and `at = confirmed_at` (OPS-12). Null when the store shows no
 * delivery dates (`checkout.zonesEnabled` off) or no zone covers the city: no promise anywhere.
 */
export async function zoneLineFor(scope: StoreScope, cityKey: CityKey | null, at?: Date, opts?: { stage: "before_call" | "after_call" }): Promise<ZoneLine | null> {
  const stage = opts?.stage ?? "before_call";
  const [checkout, zones] = await Promise.all([getStoreSetting(scope, "checkout"), listZones(scope)]);
  if (!checkout.zonesEnabled) return null;
  const zone = zoneForCity(zones, cityKey);
  if (!zone) return null;
  const base = { zoneId: zone.id, zoneName: zone.name };
  if (zone.notServed) return { ...base, notServed: true, eta: null, etaText: null, feeCents: null };
  if (zone.etaMinDays === null || zone.etaMaxDays === null) return { ...base, notServed: false, eta: null, etaText: null, feeCents: zone.feeCents };
  const [cal, store] = await Promise.all([calendarFor(scope, { stage }), getStoreById(scope.storeId)]);
  const now = at ?? new Date();
  const days = { etaMinDays: zone.etaMinDays, etaMaxDays: zone.etaMaxDays };
  const eta = etaWindow(cal, days, now);
  const afterCall = stage === "before_call" && checkout.confirmationCall;
  const etaText = {} as Record<ShopperLocale, string>;
  for (const l of LOCALES) {
    const c = DZ[l];
    const p = etaParts(eta, days, l, moneySpec(store?.currency || "MAD", l).locale, now);
    etaText[l] = `${p.text}${afterCall ? `${c.comma}${c.afterCall}` : ""}${p.dated ? ` ${c.estimated}` : ""}`;
  }
  return { ...base, notServed: false, eta, etaText, feeCents: zone.feeCents };
}

/**
 * The value-keyed `ZoneTable` of the store (`buildZoneTable` over `listZones`, the pre-call calendar and the market's
 * cities): the one producer of `lp-assist.dz`, `#sg-config.checkout.zones` (R2) and the `landing-v3` config. Past
 * holidays are dropped; every coming one is kept (at most 60, the setting's own cap), so a page that stays live for
 * months still skips them. Built whatever `checkout.zonesEnabled` says: the consumers decide whether to embed it.
 */
export async function zonesForCheckout(scope: StoreScope): Promise<ZoneTable> {
  const [zones, cal, store] = await Promise.all([listZones(scope), calendarFor(scope), getStoreById(scope.storeId)]);
  const today = localParts(new Date(), cal.tz)?.ymd;
  const holidays = today ? cal.holidays.filter((d) => d >= today) : [...cal.holidays];
  return buildZoneTable(zones, { ...cal, holidays }, citiesOfMarket(store?.market ?? "") ?? []);
}

/** Slug-keyed fees for server joins (P1's `zones.feeMismatchTop5`, the checklist); never the browser table. */
export async function zoneFeesFor(scope: StoreScope, keys: readonly CityKey[]): Promise<Record<CityKey, number | null>> {
  const zones = await listZones(scope);
  const out = {} as Record<CityKey, number | null>;
  for (const key of keys) out[key] = zoneForCity(zones, key)?.feeCents ?? null;
  return out;
}

/**
 * Replaces every zone of the store (LAN-§2.1): the cities are normalised to keys (`cityKey`), the invariants run, and
 * only a list without problems is written, in one transaction under `storeLock(storeId, "zones")` (1 s; another save
 * holding it answers `busy`). A zone keeps its id when it names a zone of this store; any other id is replaced, so an
 * id of another store can neither collide nor be overwritten. Audited `store.delivery.updated` with counts only; every
 * live page is queued for a `store_info` re-render so the fallback line follows (a queue failure is logged and never
 * undoes the save). Malformed input throws (the action parses `ZoneListSchema` first).
 */
export async function saveZones(ctx: WriteCtx, input: readonly ZoneInput[]): Promise<{ zones: DeliveryZoneRow[]; problems: ZoneProblem[]; busy?: true }> {
  const { scope } = ctx;
  const keys = marketCityKeys(citiesOfMarket(ctx.store.market));
  const zones = normalizeZones(ZoneListSchema.parse(input), keys);
  const problems = zoneProblems(zones, keys);
  if (problems.length) return { zones: await listZones(scope), problems };

  const r = await withNamedLock(storeLock(scope.storeId, "zones"), 1, async () => {
    const current = await db.select({ id: deliveryZones.id, createdAt: deliveryZones.createdAt }).from(deliveryZones).where(whereStore(deliveryZones, scope));
    const created = new Map(current.map((z) => [z.id, z.createdAt]));
    const used = new Set<string>();
    const now = new Date();
    const ids = zones.map((z) => {
      const id = z.id && created.has(z.id) && !used.has(z.id) ? z.id : newId();
      used.add(id);
      return id;
    });
    await db.transaction(async (tx) => {
      await tx.delete(deliveryZones).where(whereStore(deliveryZones, scope));
      if (!zones.length) return;
      await tx.insert(deliveryZones).values(
        zones.map((z, position) =>
          storeValues(scope, {
            id: ids[position]!,
            name: z.name,
            cities: z.cities as ZoneCityKey[],
            feeCents: z.feeCents,
            freeFromCents: z.freeFromCents,
            etaMinDays: z.etaMinDays,
            etaMaxDays: z.etaMaxDays,
            notServed: z.notServed,
            note: z.note,
            position,
            updatedBy: ctx.user.id,
            createdAt: created.get(ids[position]!) ?? now,
            updatedAt: now,
          }),
        ),
      );
    });
  });
  if (!r.ran) return { zones: await listZones(scope), problems: [], busy: true };
  zonesCache.delete(scope.storeId);

  await auditFrom(ctx, "store.delivery.updated", {
    meta: {
      zones: zones.length,
      cities: zones.reduce((n, z) => n + z.cities.filter((c) => c !== "*").length, 0),
      star: zones.some((z) => z.cities.includes("*")),
      notServed: zones.filter((z) => z.notServed).length,
      withDays: zones.filter((z) => z.etaMinDays !== null).length,
    },
  });
  try {
    await enqueueRenders(scope, "all-live", "store_info", RENDER_PRIORITY);
  } catch (err) {
    console.error("[delivery] saveZones: live pages not queued for a re-render:", errorSummary(err));
  }
  return { zones: await listZones(scope), problems: [] };
}
