// proves: LP-03, LP-02, SF-03
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
 *
 * The honesty gate and Store Health (p3-w1-gate-checklist-health): store A's attested facts and proof, zones and
 * policies are never read for store B's gate (`loadLandingGateInputs`), not even when B names A's page id; B's
 * attestation on A's page writes nothing; the health facts of B (`loadLandingHealthFacts`) hold none of A's live
 * pages, attestations or leads; the publish listener's `page.countdown_extended` row lands in the publishing store.
 */
import { createRequire } from "node:module";
import type { TenancyCase, TenancyKit } from "../tenancy-check";
import type { WriteCtx, WriteScope } from "@/lib/tenancy/types";

const load = <T>(id: string): T => createRequire(__filename)(id) as T;

type Zones = typeof import("@/lib/delivery/zones.server");
type Settings = typeof import("@/lib/settings");
type Gate = typeof import("@/lib/render/prepublish/landing");
type Facts = typeof import("@/lib/landing/honesty/facts.server");
type Health = typeof import("@/lib/health/rules/landing");

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

async function gateCases(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const S = load<Settings>("@/lib/settings");
  const Z = load<Zones>("@/lib/delivery/zones.server");
  const G = load<Gate>("@/lib/render/prepublish/landing");
  const F = load<Facts>("@/lib/landing/honesty/facts.server");
  const H = load<Health>("@/lib/health/rules/landing");
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const T = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { and, eq, inArray } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const A = kit.scope("A") as WriteScope;
  const B = kit.scope("B") as WriteScope;
  const ctxA = ownerCtx(kit, "A");
  const ctxB = ownerCtx(kit, "B");
  const pageA = await kit.fresh.page(fx.A, "published");
  const pageB = await kit.fresh.page(fx.B, "published");
  const docOf = async (id: string) => (await db.select({ d: T.pages.draft }).from(T.pages).where(eq(T.pages.id, id)).limit(1))[0]!.d;
  const docA = await docOf(pageA);
  const docB = await docOf(pageB);
  const reviewedAt = new Date().toISOString();

  // A: reviewed policies (7-day returns), zones on with one zone, an attested fact and an attested proof section
  await S.updateStoreSetting(A, "policies", { returns: { accepted: true, windowDays: 7 }, reviewedAt }, { id: fx.A.members.owner });
  await S.updateStoreSetting(A, "checkout", { zonesEnabled: true }, { id: fx.A.members.owner });
  await Z.saveZones(ctxA, [zoneInput("Zone gate A", ["fes"], { fee: 2_500, days: [1, 2] })]);
  const factOk = await F.attestFact(A, ctxA.actor, pageA, { path: "product.description", value: "37", text: "Flacon de 37 ml" });
  const proofOk = await F.attestProof(A, ctxA.actor, pageA, { sectionId: "reviewsgate", type: "reviews" });
  check("gate: A attests a fact and a proof section on its page (control)", factOk && proofOk, { factOk, proofOk });

  const inA = await G.loadLandingGateInputs(A, pageA, docA);
  check(
    "gate: loadLandingGateInputs(A) reads A's policies, zones, attested fact and proof (control)",
    inA.policies.returns.accepted === true && inA.zones.length === 1 && inA.attestedFacts.has("37") && inA.attested.has("reviewsgate") && inA.live !== null,
    { returns: inA.policies.returns, zones: inA.zones.length, facts: [...inA.attestedFacts], attested: [...inA.attested] },
  );
  const leakedA = (v: LandingInputs) => v.policies.returns.accepted === true || v.zones.some((z) => z.name === "Zone gate A") || v.attestedFacts.has("37") || v.attested.has("reviewsgate");
  const inB = await G.loadLandingGateInputs(B, pageB, docB);
  check("gate: loadLandingGateInputs(B) reads none of A's facts, zones or policies", !leakedA(inB) && inB.zones.length === 0 && !inB.policies.reviewedAt, { zones: inB.zones.length, reviewedAt: inB.policies.reviewedAt });
  const cross = await G.loadLandingGateInputs(B, pageA, docA);
  check("gate: B naming A's page id gets nothing of A (no attestation, no live version)", !leakedA(cross) && cross.attested.size === 0 && cross.attestedFacts.size === 0 && cross.live === null && cross.gen === null, {
    attested: [...cross.attested],
    facts: [...cross.attestedFacts],
    live: cross.live,
  });
  // the gate's verdict follows: A's "retour sous 7 jours" is backed in A, not when B judges the same document
  const claim = { ...docB, product: { ...docB.product, description: "Retour sous 7 jours si la taille ne va pas." } };
  const ctxGate = (scope: WriteScope, store: typeof fx.rows.A, pageId: string) => ({ scope, store, pageId, doc: claim, prev: null, theme: undefined as never, assets: new Map(), actor: ctxA.actor, now: new Date(), mode: "block" as const });
  const itemsA = G.landingGateItems(ctxGate(A, fx.rows.A, pageA), await G.loadLandingGateInputs(A, pageA, claim));
  const itemsB = G.landingGateItems(ctxGate(B, fx.rows.B, pageB), await G.loadLandingGateInputs(B, pageB, claim));
  const onClaim = (items: typeof itemsA) => items.filter((i) => i.id === "honesty:promise" && i.field === "product.description");
  check("gate: A's return policy backs the claim in A only", onClaim(itemsA).length === 0 && onClaim(itemsB).length === 1, { a: onClaim(itemsA), b: onClaim(itemsB) });

  // the library's fixture page (sample proof, library figures) is refused; the harness helper of CCR r1-p3-4 publishes
  // it with the gate passed through, then the gate is back
  const PUB = load<typeof import("@/lib/render/publish.server")>("@/lib/render/publish.server");
  const LF = load<typeof import("@/lib/render/prepublish/landing.fixtures")>("@/lib/render/prepublish/landing.fixtures");
  const library = await kit.fresh.page(fx.A);
  const codeOf = (p: Promise<unknown>) => p.then(() => "published", (e: unknown) => (e as { code?: string })?.code ?? String(e));
  const first = await codeOf(PUB.publishPage(A, library, { actor: ctxA.actor }));
  const through = await codeOf(LF.withoutLandingGate(() => PUB.publishPage(A, library, { actor: ctxA.actor })));
  const after = await codeOf(PUB.publishPage(A, library, { actor: ctxA.actor }));
  check("gate: the library's fixture page is refused, published through withoutLandingGate, refused again after", first === "honesty_blocked" && through === "published" && after === "honesty_blocked", { first, through, after });

  // writes by B on A's page: nothing
  const before = await kit.snapshotA();
  const bProof = await F.attestProof(B, ctxB.actor, pageA, { sectionId: "reviewsgate", type: "reviews" });
  const bFact = await F.attestFact(B, ctxB.actor, pageA, { path: "product.description", value: "37", text: "Flacon de 37 ml" });
  check("gate: B's attestations on A's page are refused and change nothing of A", !bProof && !bFact && (await kit.snapshotA()) === before, { bProof, bFact });

  // the publish listener audits a countdown moved later in the publishing store only
  const running = new Date(Date.now() + 86_400_000).toISOString();
  const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const withEnd = (iso: string) => ({ ...docA, offers: { ...docA.offers, urgency: { ...docA.offers.urgency, countdownEnd: iso } } });
  await G.landingPublishListener({ ...ctxGate(A, fx.rows.A, pageA), doc: withEnd(later), prev: withEnd(running), versionId: "VERSIONGATEAAAAAAAAAAAAAAA", event: "published" });
  const extended = await db.select({ storeId: T.auditLog.storeId }).from(T.auditLog).where(and(eq(T.auditLog.action, "page.countdown_extended"), eq(T.auditLog.target, pageA)));
  check("gate: page.countdown_extended is written once, in A", extended.length === 1 && extended[0]!.storeId === fx.A.id, extended);

  // Store Health: B's facts hold none of A's pages, attestations or leads
  const hA = await H.loadLandingHealthFacts(kit.scope("A"), { store: fx.rows.A, now: new Date() });
  const hB = await H.loadLandingHealthFacts(kit.scope("B"), { store: fx.rows.B, now: new Date() });
  check("health: A's facts list A's live page with its attestation (control)", hA.storeId === fx.A.id && hA.live.some((p) => p.id === pageA && p.attested.includes("reviewsgate")), hA.live.map((p) => p.id));
  check("health: B's facts hold none of A's live pages or attestations", hB.storeId === fx.B.id && !hB.live.some((p) => p.id === pageA || p.attested.includes("reviewsgate")) && hB.live.some((p) => p.id === pageB), hB.live.map((p) => p.id));
  check("health: B's zones and settings are B's", hB.zones.count === 0 && !hB.zones.enabled);

  // leave both stores as the harness seeded them
  await db.delete(T.auditLog).where(and(inArray(T.auditLog.action, ["page.fact_attested", "page.proof_attested", "page.countdown_extended"]), inArray(T.auditLog.target, [pageA, pageB])));
  await Z.saveZones(ctxA, []);
  await S.updateStoreSetting(A, "checkout", { zonesEnabled: false }, { id: fx.A.members.owner });
  await S.updateStoreSetting(A, "policies", { returns: { accepted: null, windowDays: null }, reviewedAt: null }, { id: fx.A.members.owner });
}

type LandingInputs = Awaited<ReturnType<Gate["loadLandingGateInputs"]>>;

export const cases: TenancyCase[] = [
  { name: "landing: delivery zones, lead suggestion and holiday reminder of A never reach B", run: zoneCases },
  { name: "landing: A's attested facts, proof, zones and policies never reach B's gate or Store Health", run: gateCases },
];
