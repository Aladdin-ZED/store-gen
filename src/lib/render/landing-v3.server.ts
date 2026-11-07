import "server-only";
/**
 * LP-16 "Charge delivery by city" on landing pages, the server side (core D75, §K.4 R2 contract step C2-B2; landing.md
 * LAN-§20.4, LD25; storefront.md STO-§15.9). Maintainer-owned (§K.3): the publish, the re-render, the test render, the
 * order API and the export read it; S1's attach flow and the landing editor's Offers tab write the toggle through
 * `setChargeByCity` (never the column directly).
 *
 *   chargesByCity(scope, pageId)              the page's toggle (`pages.attach_opts.chargeByCity`; false before R2)
 *   setChargeByCity(scope, pageId, on)        the toggle seam (S1's attach flow: on for a landing created from a
 *                                             product in `both` mode; the Offers tab switch); the next publish renders it
 *   landingRenderExtras(scope, page, runtime) the render options of a landing document: `zones` (config v3, the
 *                                             `landing-v3` chunk) and `productKey` (an attached page's content ids)
 *   landingShippingZone(scope, versionId, city)  the order API's zone for a runtime_v 3 version, else undefined (the
 *                                             flat page fee, today's rule)
 *
 * A publish renders v3 while the toggle is on; an in-place re-render keeps the live version's runtime (v3 stays v3 with
 * the store's current zones, v2 stays v2), so `runtime_v` always describes the bytes an open tab posts against. Every
 * entry point answers its R1 value while `releaseOn("R2")` is false: no R1 page charges by city.
 */
import { and, eq } from "drizzle-orm";
import { releaseOn } from "@/lib/auth/permissions";
import { zoneFeeOfRow, type ZoneFee } from "@/lib/catalog/delivery";
import { db } from "@/lib/db/client";
import { pages, products, type AttachOpts } from "@/lib/db/schema";
import { zoneForCityValue } from "@/lib/delivery/match";
import type { ZoneTable } from "@/lib/delivery/types";
import { listZones, zonesForCheckout } from "@/lib/delivery/zones.server";
import { versionRuntimeV } from "@/lib/orders/resolve";
import { byId, whereStore } from "@/lib/tenancy/sql";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";

/** The runtime contract a "charge delivery by city" version publishes with (`page_versions.runtime_v`). */
export const RUNTIME_V_ZONES = 3;

/** Does this landing page of the store charge delivery by city (its next publish renders runtime_v 3)? */
export async function chargesByCity(scope: StoreScope, pageId: string): Promise<boolean> {
  if (!releaseOn("R2")) return false;
  const [row] = await db.select({ opts: pages.attachOpts }).from(pages).where(and(byId(pages, scope, pageId), eq(pages.kind, "landing"))).limit(1);
  return row?.opts?.chargeByCity === true;
}

/**
 * The "Charge delivery by city" toggle of a landing page of the store (LAN-§20.4; S1's attach flow, the Offers tab).
 * Writes `attach_opts.chargeByCity` only, keeping the attach keys; on an unattached page without options the attach
 * keys are written with their unattached meaning (indexable, names and photos the page's own). Takes effect at the next
 * publish. False when the page is not a landing of the store.
 */
export async function setChargeByCity(scope: WriteScope, pageId: string, on: boolean): Promise<boolean> {
  const [row] = await db.select({ opts: pages.attachOpts }).from(pages).where(and(byId(pages, scope, pageId), eq(pages.kind, "landing"))).limit(1);
  if (!row) return false;
  const base: AttachOpts = row.opts ?? { v: 1, indexable: true, keepNames: true, keepPhotos: true };
  const next: AttachOpts = { ...base, chargeByCity: on };
  if (!on) delete next.chargeByCity;
  await db.update(pages).set({ attachOpts: next }).where(and(byId(pages, scope, pageId), eq(pages.kind, "landing")));
  return true;
}

/**
 * The R2 render options of a landing document (spread into `renderLandingHtml`'s options; `{}` in R1, so today's
 * bytes): `zones` when the document runs on runtime_v 3 (`runtime` = "publish": the page's toggle; a number: the live
 * version's runtime_v, kept by a re-render or a test render), `productKey` when the page is attached to a product.
 */
export async function landingRenderExtras(scope: StoreScope, pageId: string, runtime: "publish" | number | null): Promise<{ zones?: ZoneTable; productKey?: string }> {
  if (!releaseOn("R2")) return {};
  const [page] = await db.select({ productId: pages.productId }).from(pages).where(byId(pages, scope, pageId)).limit(1);
  const v3 = runtime === "publish" ? await chargesByCity(scope, pageId) : runtime === RUNTIME_V_ZONES;
  const [zones, productKey] = await Promise.all([v3 ? zonesForCheckout(scope) : undefined, page?.productId ? productKeyOf(scope, page.productId) : undefined]);
  return { ...(zones ? { zones } : {}), ...(productKey ? { productKey } : {}) };
}

async function productKeyOf(scope: StoreScope, productId: string): Promise<string | undefined> {
  const [row] = await db.select({ key: products.publicKey }).from(products).where(whereStore(products, scope, eq(products.id, productId))).limit(1);
  return row?.key;
}

/**
 * The zone an order (or a WhatsApp order intent) of a `runtime_v = 3` version is priced with (LAN-§20.4: `zoneForCityValue`
 * over the store's zones, the posted `City.value`; `landingZoneFee` then applies the one rule), or undefined for any
 * other version: the flat page fee, today's rule. `{ zone: null }` = no zone for this city (the page fee applies).
 */
export async function landingShippingZone(scope: StoreScope, versionId: string, city: unknown): Promise<{ zone: ZoneFee | null } | undefined> {
  if (!releaseOn("R2") || (await versionRuntimeV(scope, versionId)) !== RUNTIME_V_ZONES) return undefined;
  const row = zoneForCityValue(await listZones(scope), typeof city === "string" ? city.trim().slice(0, 120) : "");
  return { zone: row ? zoneFeeOfRow(row) : null };
}
