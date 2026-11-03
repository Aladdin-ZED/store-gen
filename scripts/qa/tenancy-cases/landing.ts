// proves: LP-03, LP-02, SF-03, LP-06, LP-20, LP-22, SF-06, LP-05
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
 *
 * Leads, attribution, vitals and slug history (p3-w1-leads-server): B's inbox reads (`listLeadRows`, `getLeadRow`,
 * `leadCounts`, the ⌘K provider, the pulse) hold nothing of A; B's writes on A's lead ids (attempt, assign, lost,
 * follow-up, take next, `markLeadConverted`) leave A byte-identical; an impersonation of A reads A's lead masked; B's
 * order with A's lead's phone and idem never credits A's lead (the `landing.created` hook); `getPageVitals(B, A's
 * pages)` reads zeros; an old slug 308s with a byte-identical query, a reused slug serves the new page, and store B's
 * identical old slug never redirects to A.
 *
 * Order tracking (p3-w1-tracking): store B's host reads A's order by no proof (lookup, proof, signed link, request,
 * intent: the uniform not_found, nothing written on A's order); A's signed link under B's handle answers 404 with
 * nothing of A; B's scope loads nothing of A's order. Each case checks its positive control on A's own host.
 */
import { randomBytes, randomUUID } from "node:crypto";
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

type LeadsRead = typeof import("@/lib/leads/read");
type LeadsWrite = typeof import("@/lib/leads/write");

async function leadCases(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const T = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const R = load<LeadsRead>("@/lib/leads/read");
  const W = load<LeadsWrite>("@/lib/leads/write");
  const L = load<typeof import("@/lib/orders/leads")>("@/lib/orders/leads");
  const P = load<typeof import("@/lib/admin-data/search/landing")>("@/lib/admin-data/search/landing");
  const PU = load<typeof import("@/lib/pulse/contributors/landing")>("@/lib/pulse/contributors/landing");
  const HK = load<typeof import("@/lib/orders/hooks")>("@/lib/orders/hooks");
  const V = load<typeof import("@/lib/landing/vitals")>("@/lib/landing/vitals");
  const MP = load<typeof import("@/lib/landing/mode-plan")>("@/lib/landing/mode-plan");
  const A = kit.scope("A") as WriteScope;
  const B = kit.scope("B") as WriteScope;
  const ownerA = { userId: fx.A.members.owner, role: "owner" as const };
  const ownerB = { userId: fx.B.members.owner, role: "owner" as const };
  const byB = { actor: { kind: "user" as const, userId: fx.B.members.owner, impersonatorId: null, ip: null }, role: "owner" };
  const c = fx.A.customer;

  // A's fresh lead (inside the 30-day window) carries A's customer canaries; B gets its own control lead
  const leadA = newId();
  const idemA = `${newId()}-lead-a`.slice(0, 36);
  const ref = "WA-T3NMQ7";
  await db.insert(T.leads).values({ id: leadA, storeId: fx.A.id, pageId: fx.A.page.live, idem: idemA, phone: c.phone, name: c.name, city: c.city, note: c.note, status: "contacted", attempts: 1, contactedAt: new Date(), nextAt: new Date(Date.now() - 60_000), assigneeId: fx.A.members.agent, createdAt: new Date(Date.now() - 3_600_000) });
  const intentA = newId();
  await db.insert(T.leads).values({ id: intentA, storeId: fx.A.id, pageId: fx.A.page.live, idem: `${newId()}-intent`.slice(0, 36), phone: null, kind: "whatsapp", ref, createdAt: new Date() });
  const leadB = newId();
  await db.insert(T.leads).values({ id: leadB, storeId: fx.B.id, pageId: fx.B.page.live, idem: `${newId()}-lead-b`.slice(0, 36), phone: fx.B.customer.phone, name: "Control B", city: "Rabat", createdAt: new Date() });

  // reads
  const aRows = await R.listLeadRows(A, { limit: 100 }, ownerA);
  check("leads: listLeadRows(A) lists A's lead (control)", aRows.rows.some((r) => r.id === leadA && r.name === c.name));
  const bRows = await R.listLeadRows(B, { limit: 100 }, ownerB);
  check("leads: listLeadRows(B) holds none of A's leads", !bRows.rows.some((r) => r.id === leadA || r.id === intentA) && bRows.rows.some((r) => r.id === leadB) && kit.leaks(bRows).length === 0, kit.leaks(bRows));
  check("leads: getLeadRow(B, A's lead) is null", (await R.getLeadRow(B, leadA, ownerB)) === null);
  const bCounts = await R.leadCounts(B, ownerB);
  const aCounts = await R.leadCounts(A, ownerA);
  check("leads: B's 30-day header counts B's leads only", bCounts.leads >= 1 && bCounts.contacted === 0 && aCounts.contacted >= 1, { a: aCounts.contacted, b: bCounts.contacted });
  for (const [label, q] of [["customer name", c.name], ["WA- ref", ref], ["phone digits", c.phone.slice(-8)]] as const) {
    const hits = await P.provider.search(B, q, ownerB);
    check(`leads: ⌘K of B for A's ${label} finds nothing of A`, !hits.some((h) => h.id === leadA || h.id === intentA) && kit.leaks(hits).length === 0, hits);
  }
  const pulseB = await PU.contributor.contribute(B, ownerB);
  check("leads: B's pulse never counts A's due lead or intent", pulseB.leadsDue === 0 && pulseB.waIntentsNew === 0, pulseB);

  // impersonation of A: A's lead, masked
  const imp = kit.scope("A", "impersonation");
  const impRows = await R.listLeadRows(imp, { limit: 100 }, ownerA);
  const impOne = await R.getLeadRow(imp, leadA, ownerA);
  const impHits = await P.provider.search(imp, c.name.split(" ")[0]!, ownerA);
  check("leads: an impersonation of A reads A's lead (control)", impRows.rows.some((r) => r.id === leadA) && impOne?.id === leadA && impHits.some((h) => h.id === leadA));
  const impLeaks = kit.leaks({ impRows, impOne, impHits }, { only: ["customer"] });
  check("leads: under impersonation no customer canary in rows, the lead or ⌘K", impLeaks.length === 0, impLeaks);

  // writes by B on A's ids
  const before = await kit.snapshotA();
  const tries = {
    attempt: await W.logAttempt(B, byB, leadA, "whatsapp"),
    assign: await W.assignLeads(B, byB, [leadA, intentA], fx.B.members.agent),
    lost: await W.markLost(B, byB, leadA, "price"),
    followUp: await W.setFollowUp(B, byB, leadA, null),
    take: await W.takeNextLead(B, byB),
    converted: await L.markLeadConverted(B, leadA, fx.A.order.main, "agent"),
    convertedOwnOrder: await L.markLeadConverted(B, leadA, fx.B.order.main, "agent"),
  };
  check(
    "leads: B's writes on A's lead ids answer not_found or touch nothing",
    !tries.attempt.ok && (tries.assign.ok ? tries.assign.n === 0 : true) && !tries.lost.ok && !tries.followUp.ok && tries.take !== leadA && tries.take !== intentA && !tries.converted.ok && !tries.convertedOwnOrder.ok,
    tries,
  );
  check("leads: A is byte-identical after B's writes", (await kit.snapshotA()) === before);

  // attribution: B's order with A's lead's phone and idem never credits A's lead
  const orderB = `B${newId().slice(0, 7)}-${newId().slice(0, 8)}`.slice(0, 20);
  await db.insert(T.orders).values({
    id: orderB,
    storeId: fx.B.id,
    pageId: fx.B.page.live,
    versionId: fx.B.version.live,
    status: "new",
    name: "Client B",
    phone: c.phone,
    city: "Rabat",
    productName: "Argan",
    items: { v: 2, bundleId: "b1", bundleLabel: "1 x Argan", qty: 1, unitPrice: 199, variants: [] } as never,
    qty: 1,
    subtotal: 19900,
    shipping: 0,
    total: 19900,
    currency: "MAD",
    idem: idemA,
  } as never);
  const [rowB] = await db.select().from(T.orders).where(eq(T.orders.id, orderB)).limit(1);
  await HK.runOrderHooks("created", "afterCommit", B, { on: "created", order: rowB!, conversion: null, target: { pageId: rowB!.pageId, versionId: rowB!.versionId, source: rowB!.source } });
  const [after] = await db.select({ o: T.leads.convertedOrderId, s: T.leads.status }).from(T.leads).where(eq(T.leads.id, leadA)).limit(1);
  check("attribution: B's order (A's phone, A's idem) never credits A's lead", after?.o === null && after.s === "contacted", after);

  // vitals and the mode plan
  const vB = await V.getPageVitals(B, [fx.A.page.live]);
  const vA = await V.getPageVitals(A, [fx.A.page.live]);
  check("vitals: getPageVitals(B, A's page) reads zeros", vB[fx.A.page.live]?.views === 0 && vB[fx.A.page.live]?.orders === 0, vB);
  check("vitals: getPageVitals(A, A's page) counts A's orders (control)", (vA[fx.A.page.live]?.orders ?? 0) >= 1, vA);
  const planA = await MP.landingModeSwitchPlan(A);
  const planB = await MP.landingModeSwitchPlan(B);
  check("mode plan: each store counts its own live landing pages", planA.livePages >= 1 && planB.livePages >= 1 && planB.views7d >= 0, { planA, planB });

  // leave both stores as the harness seeded them
  await db.delete(T.orders).where(eq(T.orders.id, orderB));
  for (const id of [leadA, intentA, leadB]) await db.delete(T.leads).where(eq(T.leads.id, id));
}

async function slugCases(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const T = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { and, eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const SL = load<typeof import("@/lib/landing/slugs")>("@/lib/landing/slugs");
  const RC = load<typeof import("@/lib/render/cache.server")>("@/lib/render/cache.server");
  const A = kit.scope("A") as WriteScope;
  const B = kit.scope("B") as WriteScope;
  const route = { file: "src/app/s/[store]/[slug]/route.ts", template: "/s/[store]/[slug]", methods: ["GET"] };
  const get = async (store: "A" | "B", slug: string, query: Record<string, string> = {}) => {
    const o = await kit.callRoute({ anonymous: true }, route, "GET", { store: fx[store].handle, slug }, { query });
    return o.ok ? o.value! : null;
  };
  const query = { utm_source: "meta ads", utm_campaign: "été-26", b: "1" };
  const search = `?${new URLSearchParams(query).toString()}`;

  // A's seeded old slug of its live page ("argan")
  const [old] = await db
    .select({ slug: T.pageSlugHistory.slug })
    .from(T.pageSlugHistory)
    .where(and(eq(T.pageSlugHistory.storeId, fx.A.id), eq(T.pageSlugHistory.pageId, fx.A.page.live)))
    .limit(1);
  check("slugs: A's live page has an old slug (control)", !!old);
  if (!old) return;
  const moved = await get("A", old.slug, query);
  check("slugs: an old slug 308s to the page's slug with a byte-identical query", moved?.status === 308 && (moved.location ?? "").endsWith(`/argan${search}`) && (moved.location ?? "").includes(fx.A.handle), {
    status: moved?.status,
    location: moved?.location,
    search,
  });
  const onB = await get("B", old.slug, query);
  check("slugs: A's old slug on B's address is B's 404, never a redirect into A", onB?.status === 404 && !(onB.location ?? "").includes(fx.A.handle), { status: onB?.status, location: onB?.location });

  // the same old slug in both stores: each store redirects to its own page
  const pageA = await kit.fresh.page(fx.A, "published");
  const pageB = await kit.fresh.page(fx.B, "published");
  await SL.recordSlugMove(A, pageA, "dual-old-slug");
  await SL.recordSlugMove(B, pageB, "dual-old-slug");
  const slugOf = async (id: string) => (await db.select({ s: T.pages.slug }).from(T.pages).where(eq(T.pages.id, id)).limit(1))[0]!.s;
  const dualA = await get("A", "dual-old-slug");
  const dualB = await get("B", "dual-old-slug");
  check("slugs: A's identical old slug redirects to A's page", dualA?.status === 308 && (dualA.location ?? "").endsWith(`/${await slugOf(pageA)}`) && (dualA.location ?? "").includes(fx.A.handle), dualA?.location);
  check(
    "slugs: B's identical old slug redirects to B's page, never to A",
    dualB?.status === 308 && (dualB.location ?? "").endsWith(`/${await slugOf(pageB)}`) && (dualB.location ?? "").includes(fx.B.handle) && !(dualB.location ?? "").includes(fx.A.handle),
    dualB?.location,
  );

  // a reused slug serves the new page: A's fresh page (given the stored documents a served version holds) takes A's old address
  const [pub] = await db.select({ v: T.pages.publishedVersionId }).from(T.pages).where(eq(T.pages.id, pageA)).limit(1);
  const marker = `reused ${pageA}`;
  await db
    .update(T.pageVersions)
    .set({ html: `<!doctype html><title>${marker}</title><p>${marker}</p>`, csp: "default-src 'none'", etag: `"${pageA.toLowerCase()}"`, thankYouHtml: "<!doctype html><p>merci</p>", thankYouCsp: "default-src 'none'" })
    .where(eq(T.pageVersions.id, pub!.v!));
  await db.update(T.pages).set({ slug: old.slug }).where(eq(T.pages.id, pageA));
  await SL.releaseOldSlug(A, old.slug);
  // what the slug-move action does after its write: the store's render entries go (the 404 above was cached)
  RC.invalidateStoreRender(fx.A.id);
  const reused = await get("A", old.slug, query);
  check("slugs: a reused old slug serves the new page (200, its HTML, no redirect)", reused?.status === 200 && !reused.location && reused.body.includes(marker), { status: reused?.status, location: reused?.location });
  const stillB = await get("B", "dual-old-slug");
  check("slugs: A's release never touched B's history", stillB?.status === 308);

  // leave both stores as the harness seeded them
  await db.update(T.pages).set({ slug: `p-${pageA.toLowerCase()}`, status: "archived" }).where(eq(T.pages.id, pageA));
  await db.update(T.pages).set({ status: "archived" }).where(eq(T.pages.id, pageB));
  await db.insert(T.pageSlugHistory).values({ storeId: fx.A.id, slug: old.slug, pageId: fx.A.page.live, until: new Date(Date.now() + 300 * 86_400_000), hits: 0, createdAt: new Date() });
  await db.delete(T.pageSlugHistory).where(eq(T.pageSlugHistory.slug, "dual-old-slug"));
  RC.invalidateStoreRender(fx.A.id);
  RC.invalidateStoreRender(fx.B.id);
}

async function trackCases(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const T = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { and, eq } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const { newOrderId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const API = load<typeof import("@/lib/tracking/api.server")>("@/lib/tracking/api.server");
  const V = load<typeof import("@/lib/tracking/view.server")>("@/lib/tracking/view.server");
  const P = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
  const env = process.env as Record<string, string | undefined>;
  const saved = { root: env.STORE_ROOT_DOMAIN, key: env.EDGE_KEY };
  const edgeKey = randomBytes(32).toString("hex");
  const ip = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

  // A's order (a fixture id of its own: the tracking ids are "<2-8 capitals>-<base 36>")
  const id = newOrderId("TRK");
  const phone = `+2126${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const idem = randomUUID();
  await db.insert(T.orders).values({
    id, storeId: fx.A.id, pageId: fx.A.page.live, versionId: fx.A.version.live, status: "new", name: "Track A", phone, city: "Rabat", address: "A street 1",
    productName: "Argan A", items: { v: 2, bundleId: "b1", bundleLabel: "1 x Argan", qty: 1, unitPrice: 199, variants: [] } as never, qty: 1, subtotal: 199, shipping: 0, total: 199, currency: "MAD", idem,
  } as never);
  const s = P.signTrackLink(fx.A.id, id);
  const post = async (body: unknown, h: string) => {
    const res = await API.handleTrackApi(
      new Request(`https://${h}/api/public/track`, {
        method: "POST",
        headers: { "x-sg-host": h, "x-sg-edge": edgeKey, "x-sg-ip": ip(), "x-sg-proto": "https", "x-sg-worker": "w-tenancy", "x-sg-ts": String(Date.now()), origin: `https://${h}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, text: await res.text() };
  };
  const hostA = `${fx.A.handle}.shops.test`;
  const hostB = `${fx.B.handle}.shops.test`;
  const proofs = [
    { op: "lookup", o: id, last4: phone.slice(-4) },
    { op: "proof", o: id, k: idem },
    { op: "signed", o: id, s },
    { op: "request", o: id, auth: { s }, kind: "cancel" },
    { op: "intent", o: id, k: idem, kind: "confirm_whatsapp" },
  ];
  env.STORE_ROOT_DOMAIN = "shops.test";
  env.EDGE_KEY = edgeKey;
  try {
    const own = await post(proofs[0], hostA);
    check("tracking: A's own host opens A's order (control)", own.status === 200, own);
    for (const body of proofs) {
      const r = await post(body, hostB);
      check(`tracking: B's host, ${body.op} with A's proof: the uniform not_found`, r.status === 404 && r.text === '{"ok":false,"error":"not_found"}', r);
    }
  } finally {
    if (saved.root === undefined) delete env.STORE_ROOT_DOMAIN;
    else env.STORE_ROOT_DOMAIN = saved.root;
    if (saved.key === undefined) delete env.EDGE_KEY;
    else env.EDGE_KEY = saved.key;
  }
  const written = await db.select().from(T.orderEvents).where(and(eq(T.orderEvents.storeId, fx.A.id), eq(T.orderEvents.orderId, id)));
  check("tracking: nothing written on A's order from B's host", written.length === 0, written);

  const route = { file: "src/app/s/[store]/track/route.ts", template: "/s/[store]/track", methods: ["GET"] };
  const onA = await kit.callRoute({ anonymous: true }, route, "GET", { store: fx.A.handle }, { query: { o: id, s } });
  check("tracking: A's signed link under A's handle renders the status (control)", onA.ok && onA.value!.status === 200 && onA.value!.body.includes(id), onA.ok ? onA.value!.status : onA);
  const onB = await kit.callRoute({ anonymous: true }, route, "GET", { store: fx.B.handle }, { query: { o: id, s } });
  check(
    "tracking: A's signed link under B's handle answers 404 with nothing of A",
    onB.ok && onB.value!.status === 404 && !onB.value!.body.includes("Argan A") && !onB.value!.body.includes(fx.A.handle),
    onB.ok ? onB.value!.status : onB,
  );
  check("tracking: B's scope loads nothing of A's order", (await V.loadTrackOrder(kit.scope("B"), id)) === null);
}

export const cases: TenancyCase[] = [
  { name: "landing: delivery zones, lead suggestion and holiday reminder of A never reach B", run: zoneCases },
  { name: "landing: A's attested facts, proof, zones and policies never reach B's gate or Store Health", run: gateCases },
  { name: "landing: A's leads, their attribution, vitals and mode plan never reach B; impersonation reads them masked", run: leadCases },
  { name: "landing: slug history 308s with the raw query, a reused slug serves the new page, B never redirects into A", run: slugCases },
  { name: "landing: B's host reads A's order by no tracking proof; A's signed link under B's handle answers 404", run: trackCases },
];
