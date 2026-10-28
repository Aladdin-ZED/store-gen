// proves: LP-03
/**
 * Two-store attack cases of the landing track (P3 LANDING, landing.md LAN-§7.5, §25.2).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created empty at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`). The file imports only types from the harness (it runs at load); the
 * app modules are required inside each case, once the harness has the throwaway database in place.
 *
 * Delivery zones (p3-w1-delivery-core): store A's zones never reach store B through `listZones`, `zoneLineFor`,
 * `zonesForCheckout`, `zoneFeesFor` or the lead suggestion, warm caches included; a `saveZones` run by B (with A's
 * zone ids, or an empty list) never changes A's rows; the holiday reminder's 30-day dedupe is per store. Every case
 * also checks its positive control on A, so a broken read cannot pass as "isolated".
 */
import { createRequire } from "node:module";
import type { TenancyCase, TenancyKit } from "../tenancy-check";
import type { WriteCtx, WriteScope } from "@/lib/tenancy/types";

const load = <T>(id: string): T => createRequire(__filename)(id) as T;

type Zones = typeof import("@/lib/delivery/zones.server");
type Settings = typeof import("@/lib/settings");

/** A WriteCtx of the store's owner (what `storeAction("checkout.write", …)` hands the repository). */
function ownerCtx(kit: TenancyKit, key: "A" | "B"): WriteCtx {
  const userId = kit.fx[key].members.owner;
  return {
    user: { id: userId, email: `owner-${key.toLowerCase()}@tenancy.test`, name: `Owner ${key}`, totpEnabled: false, sessionId: "tenancy-landing", platformRole: "none", locale: null, lastStoreId: kit.fx[key].id },
    store: kit.fx.rows[key],
    membership: { role: "owner", status: "active" },
    scope: kit.scope(key) as WriteScope,
    actor: { kind: "user", userId, impersonatorId: null, ip: null },
    impersonation: null,
    stepUpUntil: null,
    can: () => true,
  };
}

const zoneInput = (name: string, cities: string[], o: { fee?: number; days?: [number, number]; note?: string } = {}) => ({
  name,
  cities,
  feeCents: o.fee ?? null,
  freeFromCents: null,
  etaMinDays: o.days?.[0] ?? null,
  etaMaxDays: o.days?.[1] ?? null,
  notServed: false,
  note: o.note ?? null,
});

async function zoneCases(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const Z = load<Zones>("@/lib/delivery/zones.server");
  const S = load<Settings>("@/lib/settings");
  const A = kit.scope("A");
  const B = kit.scope("B");
  const marker = `Zone A ${Date.now().toString(36)}`;
  const note = `agent note A ${Date.now().toString(36)}`;
  const leaked = (v: unknown) => JSON.stringify(v).includes(marker) || JSON.stringify(v).includes(note);

  // both stores show delivery dates: a null for B then means "no zone of B", never "zones off"
  await S.updateStoreSetting(A as WriteScope, "checkout", { zonesEnabled: true }, { id: fx.A.members.owner });
  await S.updateStoreSetting(B as WriteScope, "checkout", { zonesEnabled: true }, { id: fx.B.members.owner });

  const savedA = await Z.saveZones(ownerCtx(kit, "A"), [zoneInput(marker, ["fes", "Casablanca"], { fee: 2_500, days: [1, 2], note }), zoneInput(`${marker} rest`, ["*"], { fee: 3_900, days: [2, 4] })]);
  check("zones: saveZones(A) stores A's two zones (control)", savedA.problems.length === 0 && savedA.zones.length === 2 && savedA.zones[0]!.cities.join() === "fes,casablanca", savedA);
  const aIds = savedA.zones.map((z) => z.id);

  // reads (A's list is warm in scopedCache("zones") first)
  check("zones: listZones(A) answers A's zones (control)", (await Z.listZones(A)).length === 2);
  const bList = await Z.listZones(B);
  check("zones: listZones(B) is empty and names nothing of A", bList.length === 0 && !leaked(bList), bList);
  check("zones: listZones(B, platform scope) is empty too", (await Z.listZones(kit.scope("B", "platform"))).length === 0);

  const aLine = await Z.zoneLineFor(A, "fes" as never);
  check("zones: zoneLineFor(A, fes) is A's zone (control)", aLine?.zoneName === marker && aLine.etaText !== null, aLine);
  for (const key of ["fes", "casablanca", null] as const) {
    const line = await Z.zoneLineFor(B, key as never);
    check(`zones: zoneLineFor(B, ${key ?? "null"}) is null (B has no zone)`, line === null && !leaked(line), line);
  }
  const aTable = await Z.zonesForCheckout(A);
  check("zones: zonesForCheckout(A) is A's table (control)", aTable.zones.length === 2 && aTable.city["Fès"] === 0 && aTable.star === 1, aTable.zones);
  const bTable = await Z.zonesForCheckout(B);
  check("zones: zonesForCheckout(B) carries no zone of A", bTable.zones.length === 0 && bTable.star === null && Object.keys(bTable.city).length === 0 && !leaked(bTable), bTable.zones);
  const aFees = await Z.zoneFeesFor(A, ["fes", "agadir"] as never);
  check("zones: zoneFeesFor(A) reads A's fees (control)", JSON.stringify(aFees) === JSON.stringify({ fes: 2_500, agadir: 3_900 }), aFees);
  const bFees = await Z.zoneFeesFor(B, ["fes", "agadir"] as never);
  check("zones: zoneFeesFor(B) has no fee of A", JSON.stringify(bFees) === JSON.stringify({ fes: null, agadir: null }), bFees);

  // writes by B: A's ids, then an empty list; A's rows (and everything else of A) unchanged
  const before = await kit.snapshotA();
  const savedB = await Z.saveZones(ownerCtx(kit, "B"), [{ ...zoneInput("Zone B", ["fes"], { days: [1, 1] }), id: aIds[0] }, { ...zoneInput("Zone B2", ["rabat"]), id: aIds[1] }]);
  check("zones: saveZones(B, A's zone ids) writes B's own rows under new ids", savedB.problems.length === 0 && savedB.zones.length === 2 && savedB.zones.every((z) => !aIds.includes(z.id)), savedB.zones);
  await Z.saveZones(ownerCtx(kit, "B"), []);
  check("zones: saveZones(B, …) never changes A's data", (await kit.snapshotA()) === before);
  const aAfter = await Z.listZones(A);
  check("zones: A still has its zones with their ids", aAfter.map((z) => z.id).join() === aIds.join() && aAfter[0]!.name === marker, aAfter);
  check("zones: B's list is its own (empty after its last save)", (await Z.listZones(B)).length === 0);

  // the lead suggestion: one scoped query on A's orders
  await leadCase(kit);
  // the holiday reminder: its dedupe is per store
  await holidaysCase(kit);

  // leave both stores as the harness seeded them
  await Z.saveZones(ownerCtx(kit, "A"), []);
  await S.updateStoreSetting(A as WriteScope, "checkout", { zonesEnabled: false }, { id: fx.A.members.owner });
  await S.updateStoreSetting(B as WriteScope, "checkout", { zonesEnabled: false }, { id: fx.B.members.owner });
}

async function leadCase(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const T = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { inArray } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const L = load<typeof import("@/lib/delivery/lead.server")>("@/lib/delivery/lead.server");
  const ids: string[] = [];
  for (let i = 0; i < 30; i++) ids.push(await kit.fresh.order(fx.A));
  const confirmedAt = new Date(Date.now() + 26 * 3_600_000);
  await db.update(T.orders).set({ confirmedAt }).where(inArray(T.orders.id, ids));
  const a = await L.confirmationLeadSuggestion(kit.scope("A"));
  check("lead: confirmationLeadSuggestion(A) counts A's 30 confirmed orders (control)", a?.count === 30, a);
  const b = await L.confirmationLeadSuggestion(kit.scope("B"));
  check("lead: confirmationLeadSuggestion(B) sees none of A's orders", b === null, b);
  await db.delete(T.orders).where(inArray(T.orders.id, ids));
}

async function holidaysCase(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const H = load<typeof import("@/lib/delivery/holidays-review.server")>("@/lib/delivery/holidays-review.server");
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const T = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  // 10:00 in Casablanca (UTC+1) on a January morning: due for both stores (zones on, the year never reviewed)
  const now = new Date("2027-01-05T09:00:00.000Z");
  const a1 = await H.holidaysReviewStep(kit.scope("A"), fx.rows.A, now);
  const a2 = await H.holidaysReviewStep(kit.scope("A"), fx.rows.A, new Date(now.getTime() + 3_600_000));
  const b1 = await H.holidaysReviewStep(kit.scope("B"), fx.rows.B, now);
  check("holidays: A's reminder is raised once, then deduped for 30 days (control)", a1 === "sent" && a2 === "not_due", { a1, a2 });
  check("holidays: A's reminder never suppresses B's", b1 === "sent", b1);
  await db.delete(T.notifications).where(eq(T.notifications.kind, H.HOLIDAYS_REVIEW_KIND));
}

export const cases: TenancyCase[] = [{ name: "landing: delivery zones, lead suggestion and holiday reminder of A never reach B", run: zoneCases }];
