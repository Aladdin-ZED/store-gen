// proves: LP-06, LP-22, SF-06
/**
 * test:leads (P3 LANDING; landing.md LAN-§10.6, §15.2, §23.8, §25.2; docs/STORE-SAAS.md D54, D70, §I.4):
 *
 *   npm run test:leads        (tsx scripts/qa/leads-check.ts [--db cod_test_p3_leads] [--verbose] [--keep])
 *
 * DB-backed: the two-store fixtures of scripts/qa/tenancy-check.ts (`setup()`: a throwaway cod_test_* database on
 * XAMPP's MariaDB, migrated and seeded with stores A and B, dropped at the end). Cases:
 *  1. capture: `leadCaptureOn` per market; a beacon stores `sel` (v2, bundleId, ver), `version_id`, the server total
 *     (`orderTotals` of the resolved selection; NULL when it does not resolve), `kind = 'form'` and the city; an EU
 *     market or `capture: off` drops it silently; the EU document has no `endpoints.lead`, the MA one has;
 *  2. attribution: the full LD12 fixture set on the pure rule (idem, ref, phone with and without attempts, outside
 *     7 days, test vs normal, newest wins, never a later lead or a converted one), then the `landing.created` hook on
 *     real rows through the order-hook registry (statuses, `converted_via`, `lead.recovered` to the assignee, one
 *     credit per lead) and `zone_not_served` (appended once, only for a not-served zone);
 *  3. `markLeadConverted`: idempotent, audited, another store's lead or order answers `not_found`;
 *  4. the inbox writes: attempts and follow-ups (2 h, 24 h, then none), the agent guard, "Take next" claims in
 *     parallel, lost, follow-up bounds, assignment to members only;
 *  5. the masked repository: under an impersonation scope `listLeadRows`, `getLeadRow` and the ⌘K provider return
 *     masked names and notes, a spy on src/lib/platform/mask.ts sees calls from src/lib/leads/read.ts only; agents see
 *     their own leads plus the unassigned new ones; risk chips from the customers counters and the blocklist;
 *  6. the 30-day header (test leads excluded, n ≥ 20 rules) and the pulse contributor (shape, agent's own leadsDue,
 *     ≤ 50 ms warm, a failure omits the keys); the follow-up digest per assignee;
 *  7. the 30-day purge of the housekeeping step (per store);
 *  8. page vitals (LP-22): the SQL fixture (7 store days, test orders excluded, rates hidden below n = 20, the sparkline
 *     points, another store's page reads zeros) and the mode-switch plan numbers (LAN-§4).
 * Exits 1 on any failure.
 */
import { randomBytes, randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import type { Kit } from "./tenancy-check";
import type { StoreScope, WriteCtx, WriteScope } from "@/lib/tenancy/types";

process.env.TENANCY_DB ??= "cod_test_p3_leads";
const req = createRequire(__filename);
const T = req("./tenancy-check") as typeof import("./tenancy-check");
const { check, suite, load } = T;

/* ---- the spy on src/lib/platform/mask.ts (installed before any app module loads) ---- */
const maskCallers: string[] = [];
let spying = false;
{
  const M = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const original = M._load;
  let wrapped: Record<string, unknown> | null = null;
  M._load = function (this: unknown, request: string, parent: unknown, isMain: boolean) {
    const mod = original.call(this, request, parent, isMain) as Record<string, unknown>;
    if (!/(^@\/lib\/platform\/mask$)|([\\/]src[\\/]lib[\\/]platform[\\/]mask(\.ts)?$)/.test(request)) return mod;
    if (!wrapped) {
      const real = mod.maskIfImpersonation as (...a: unknown[]) => unknown;
      wrapped = { ...mod };
      wrapped.maskIfImpersonation = (...args: unknown[]) => {
        if (spying) {
          const frames = (new Error().stack ?? "").split("\n").slice(2);
          const caller = frames.find((f) => /src[\\/]/.test(f) && !/platform[\\/]mask/.test(f)) ?? frames[0] ?? "?";
          maskCallers.push(caller.replace(/\\/g, "/"));
        }
        return real(...args);
      };
    }
    return wrapped;
  };
}

type Db = typeof import("@/lib/db/client");
type Schema = typeof import("@/lib/db/schema");
type Orm = typeof import("drizzle-orm");

const DAY = 86_400_000;
const HOUR = 3_600_000;
const tag = () => randomBytes(3).toString("hex").toUpperCase();
const phoneOf = () => `+2126${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
const near = (a: Date | null | undefined, b: number) => !!a && Math.abs(a.getTime() - b) < 2_000;

async function main(): Promise<number> {
  const kit: Kit = await T.setup();
  const { fx } = kit;
  const { db } = load<Db>("@/lib/db/client");
  const S = load<Schema>("@/lib/db/schema");
  const { and, eq, sql } = load<Orm>("drizzle-orm");
  const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
  const A = T.scopeOf(fx.A.id) as WriteScope;
  const B = T.scopeOf(fx.B.id) as WriteScope;
  const agentA = fx.A.members.agent;
  const managerA = fx.A.members.manager;

  /** A lead row written as the inbox would hold it. */
  const lead = async (store: "A" | "B", o: Partial<typeof S.leads.$inferInsert> = {}): Promise<string> => {
    const id = newId();
    await db.insert(S.leads).values({
      id,
      storeId: fx[store].id,
      pageId: fx[store].page.live,
      idem: randomUUID(),
      phone: phoneOf(),
      name: `Lead ${tag()}`,
      city: "Casablanca",
      createdAt: new Date(Date.now() - HOUR),
      ...o,
    });
    return id;
  };
  /** An order row of the store (the columns the hooks and the vitals read). */
  const order = async (store: "A" | "B", o: Partial<typeof S.orders.$inferInsert> = {}): Promise<typeof S.orders.$inferSelect> => {
    const id = `${store}${tag()}-${tag()}`.slice(0, 20);
    await db.insert(S.orders).values({
      id,
      storeId: fx[store].id,
      pageId: fx[store].page.live,
      versionId: fx[store].version.live,
      status: "new",
      name: "Client Test",
      phone: phoneOf(),
      city: "Rabat",
      productName: "Argan",
      items: { v: 2, bundleId: "b1", bundleLabel: "1 x Argan", qty: 1, unitPrice: 199, variants: [] } as never,
      qty: 1,
      subtotal: 19900,
      shipping: 0,
      total: 19900,
      currency: "MAD",
      idem: randomUUID(),
      ...o,
    } as never);
    const [row] = await db.select().from(S.orders).where(eq(S.orders.id, id)).limit(1);
    return row!;
  };
  const leadRow = async (id: string) => (await db.select().from(S.leads).where(eq(S.leads.id, id)).limit(1))[0];

  /* ------------------------------------------------------------ 1. capture */
  suite("capture");
  {
    const { leadCaptureOn } = load<typeof import("@/lib/landing/lead-capture")>("@/lib/landing/lead-capture");
    const cases: [string, "market_default" | "on" | "off", boolean][] = [
      ["MA", "market_default", true],
      ["MA", "on", true],
      ["MA", "off", false],
      ["INTL", "market_default", true],
      ["INTL", "off", false],
      ...(["FR", "BE", "ES", "DE", "IT", "NL", "PT"] as const).flatMap((m) => [[m, "market_default", false], [m, "on", false]] as [string, "market_default" | "on", boolean][]),
      ["fr", "on", false],
    ];
    for (const [m, c, want] of cases) check(`leadCaptureOn(${m}, ${c}) = ${want}`, leadCaptureOn(m, c) === want);

    const { storeEndpoints } = load<typeof import("@/lib/render/store-context.server")>("@/lib/render/store-context.server");
    const { LandingSetting } = load<typeof import("@/lib/settings/keys/landing")>("@/lib/settings/keys/landing");
    const landing = LandingSetting.parse({});
    check("an MA document carries endpoints.lead", !!storeEndpoints({ market: "MA" }, landing as never).lead);
    check("an EU (FR) document has no endpoints.lead", !("lead" in storeEndpoints({ market: "FR" }, landing as never)));

    const { resolvePublicTarget } = load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public");
    const { upsertLead } = load<typeof import("@/lib/orders/leads")>("@/lib/orders/leads");
    const { LeadPayload, leadSelection } = load<typeof import("@/lib/orders/contract")>("@/lib/orders/contract");
    const { resolveSelection } = load<typeof import("@/lib/orders/validate")>("@/lib/orders/validate");
    const { orderTotals } = load<typeof import("@/lib/page/pricing")>("@/lib/page/pricing");
    const { updateStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
    const [page] = await db.select({ key: S.pages.publicKey }).from(S.pages).where(eq(S.pages.id, fx.A.page.live)).limit(1);
    const target = await resolvePublicTarget(page!.key, { purpose: "order" });
    check("A's live page key resolves (control)", !!target && target.store.id === fx.A.id, target?.store.id);
    if (target) {
      const offer = target.doc.offers.bundles[0]!;
      let ip = 10;
      const send = async (body: Record<string, unknown>, t = target) => {
        const parsed = LeadPayload.parse({ pageKey: page!.key, idem: randomUUID(), phone: "0612345678", utm: {}, ...body });
        const { units, extras } = leadSelection(parsed);
        const r = await upsertLead({ ...parsed, units, extras }, { ip: `10.1.0.${ip++}`, target: t });
        const [row] = await db.select().from(S.leads).where(eq(S.leads.idem, parsed.idem)).limit(1);
        return { r, row, idem: parsed.idem };
      };
      check(`store A's market is MA (fixture: ${target.store.market})`, target.store.market === "MA");
      // the argan item asks one choice per unit ("usage": face or hair): the full selection carries it
      const units = [{ o: { usage: "face" } }];
      const ok = await send({ name: "Salma Benali", city: "Casablanca", bundleId: offer.id, v: 2, ver: target.versionId, units, extras: {} });
      const parsedUnits = leadSelection({ units, extras: {} }).units;
      const r = resolveSelection(target.doc, offer, { offerId: offer.id, units: parsedUnits, extras: {}, bump: false });
      const want = r.errors.length ? null : (orderTotals(target.doc, r.selection)?.total ?? null);
      check("capture: stored", ok.r.stored && !!ok.row, ok.r);
      check("capture: sel is a v2 selection with bundleId, ver and the parsed units", JSON.stringify(ok.row?.sel) === JSON.stringify({ v: 2, ver: target.versionId, bundleId: offer.id, units: parsedUnits, extras: {} }), ok.row?.sel);
      check("capture: version_id is the version seen", ok.row?.versionId === target.versionId, ok.row?.versionId);
      check("capture: total_cents is the server total of the resolved selection", want !== null && Number(ok.row?.totalCents) === want && want > 0, { got: ok.row?.totalCents, want });
      check("capture: kind form, city kept, not a test lead", ok.row?.kind === "form" && ok.row?.city === "Casablanca" && ok.row?.isTest === false, ok.row);
      const partial = await send({ bundleId: offer.id, v: 2, units: [], extras: {} });
      check("capture: a selection still missing a required choice stores sel and a NULL total", partial.r.stored && partial.row?.totalCents === null && partial.row?.sel?.v === 2, partial.row);
      const loose = await send({ bundleId: "nope-offer", v: 2, units: [{ item: "ghost" }], extras: {} });
      check("capture: an offer that does not resolve stores a NULL total", loose.r.stored && loose.row?.totalCents === null, loose.row?.totalCents);
      const fr = await send({ name: "Eu Lead", bundleId: offer.id }, { ...target, store: { ...target.store, market: "FR" } });
      check("capture: an EU market drops the beacon silently (no row)", !fr.r.stored && !fr.row);
      await updateStoreSetting(A, "landing", { leads: { capture: "off" } }, { id: fx.A.members.owner });
      const off = await send({ name: "Off Lead", bundleId: offer.id });
      check("capture: landing.leads.capture off drops the beacon", !off.r.stored && !off.row);
      await updateStoreSetting(A, "landing", { leads: { capture: "market_default" } }, { id: fx.A.members.owner });
      const back = await send({ name: "Back Lead", bundleId: offer.id });
      check("capture: back on after market_default (control)", back.r.stored && !!back.row);
    }
  }

  /* ------------------------------------------------------------ 2. attribution */
  suite("attribution");
  {
    const { attributeOrder } = load<typeof import("@/lib/leads/attribution")>("@/lib/leads/attribution");
    const now = new Date("2026-11-03T12:00:00Z");
    const o = (x: Partial<Parameters<typeof attributeOrder>[0]> = {}) => ({ idem: "idem-o", phone: "+212600000001", isTest: false, createdAt: now, note: null, ...x });
    const l = (id: string, x: Partial<Parameters<typeof attributeOrder>[1][number]> = {}) => ({ id, idem: `idem-${id}`, phone: "+212600000001", ref: null, attempts: 0, isTest: false, createdAt: new Date(now.getTime() - DAY), convertedOrderId: null, ...x });
    const eqA = (got: unknown, want: unknown) => JSON.stringify(got) === JSON.stringify(want);
    const fixtures: [string, ReturnType<typeof attributeOrder>, unknown][] = [
      ["idem match → converted / idem (even after attempts)", attributeOrder(o(), [l("a", { idem: "idem-o", attempts: 3, phone: "+212699999999" })]), { leadId: "a", status: "converted", via: "idem" }],
      ["phone match with an attempt → recovered / phone", attributeOrder(o(), [l("b", { attempts: 1 })]), { leadId: "b", status: "recovered", via: "phone" }],
      ["phone match without attempts → converted / phone", attributeOrder(o(), [l("c")]), { leadId: "c", status: "converted", via: "phone" }],
      ["outside 7 days → none", attributeOrder(o(), [l("d", { createdAt: new Date(now.getTime() - 7 * DAY - 60_000) })]), null],
      ["exactly 7 days → matched", attributeOrder(o(), [l("d7", { createdAt: new Date(now.getTime() - 7 * DAY) })]), { leadId: "d7", status: "converted", via: "phone" }],
      ["normal order vs test lead → none", attributeOrder(o(), [l("e", { isTest: true })]), null],
      ["test order vs normal lead → none", attributeOrder(o({ isTest: true }), [l("f")]), null],
      ["test order vs test lead → matched", attributeOrder(o({ isTest: true }), [l("g", { isTest: true, attempts: 2 })]), { leadId: "g", status: "recovered", via: "phone" }],
      ["test order, idem of a normal lead → none", attributeOrder(o({ isTest: true }), [l("g2", { idem: "idem-o" })]), null],
      ["the newest same-phone lead wins", attributeOrder(o(), [l("old", { createdAt: new Date(now.getTime() - 3 * DAY), attempts: 1 }), l("new", { createdAt: new Date(now.getTime() - HOUR) })]), { leadId: "new", status: "converted", via: "phone" }],
      ["a lead created after the order → none", attributeOrder(o(), [l("h", { createdAt: new Date(now.getTime() + 60_000) })]), null],
      ["a converted lead is never matched again", attributeOrder(o(), [l("i", { convertedOrderId: "X-1" })]), null],
      ["the note's WA- ref → its intent (no phone)", attributeOrder(o({ note: "client dit wa-k7m2pq merci" }), [l("j", { phone: null, ref: "WA-K7M2PQ", attempts: 1 }), l("k")]), { leadId: "j", status: "recovered", via: "phone" }],
      ["another phone → none", attributeOrder(o({ phone: "+212600000002" }), [l("m")]), null],
      ["idem wins over a newer phone match", attributeOrder(o(), [l("n", { idem: "idem-o", createdAt: new Date(now.getTime() - 5 * DAY) }), l("p", { attempts: 1 })]), { leadId: "n", status: "converted", via: "idem" }],
    ];
    for (const [name, got, want] of fixtures) check(`LD12: ${name}`, eqA(got, want), { got, want });

    // the hook on real rows, through the order-hook registry
    const { runOrderHooks } = load<typeof import("@/lib/orders/hooks")>("@/lib/orders/hooks");
    const run = (row: typeof S.orders.$inferSelect, scope: WriteScope = A) =>
      runOrderHooks("created", "afterCommit", scope, { on: "created", order: row, conversion: null, target: { pageId: row.pageId, versionId: row.versionId, source: row.source } });
    const idem = randomUUID();
    const h1 = await lead("A", { idem, attempts: 2, status: "contacted" });
    const o1 = await order("A", { idem });
    await run(o1);
    let r = await leadRow(h1);
    check("hook: idem → converted / idem", r?.status === "converted" && r.convertedVia === "idem" && r.convertedOrderId === o1.id, r);

    const p2 = phoneOf();
    const h2 = await lead("A", { phone: p2, attempts: 1, status: "contacted", assigneeId: agentA, createdAt: new Date(Date.now() - 2 * DAY) });
    const o2 = await order("A", { phone: p2 });
    await run(o2);
    r = await leadRow(h2);
    check("hook: phone + attempt → recovered / phone", r?.status === "recovered" && r.convertedVia === "phone" && r.convertedOrderId === o2.id, r);
    const notes = await db.select().from(S.notifications).where(and(eq(S.notifications.kind, "lead.recovered"), eq(S.notifications.userId, agentA)));
    check("hook: lead.recovered notifies the assignee once, vars hold ids only", notes.length === 1 && notes[0]!.storeId === fx.A.id && JSON.stringify(notes[0]!.vars) === JSON.stringify({ leadId: h2, orderId: o2.id }), notes);
    const o2b = await order("A", { phone: p2 });
    await run(o2b);
    r = await leadRow(h2);
    check("hook: a second order of the same phone never moves a credited lead", r?.convertedOrderId === o2.id, r?.convertedOrderId);

    const p3 = phoneOf();
    const h3 = await lead("A", { phone: p3, createdAt: new Date(Date.now() - DAY) });
    await run(await order("A", { phone: p3 }));
    r = await leadRow(h3);
    check("hook: phone without attempts → converted / phone", r?.status === "converted" && r.convertedVia === "phone", r);

    const p4 = phoneOf();
    const h4 = await lead("A", { phone: p4, createdAt: new Date(Date.now() - 8 * DAY) });
    await run(await order("A", { phone: p4 }));
    r = await leadRow(h4);
    check("hook: outside 7 days → the lead stays new", r?.status === "new" && r.convertedOrderId === null, r);

    const p5 = phoneOf();
    const h5 = await lead("A", { phone: p5, isTest: true });
    await run(await order("A", { phone: p5 }));
    check("hook: a normal order leaves a test lead alone", (await leadRow(h5))?.convertedOrderId === null);
    const o5t = await order("A", { phone: p5, isTest: true });
    await run(o5t);
    check("hook: a test order credits the test lead", (await leadRow(h5))?.convertedOrderId === o5t.id);

    const p6 = phoneOf();
    const h6 = await lead("A", { phone: p6 });
    await run(await order("B", { phone: p6 }), B);
    check("hook: B's order with the same phone never credits A's lead", (await leadRow(h6))?.convertedOrderId === null);

    // zone_not_served
    const Z = load<typeof import("@/lib/delivery/zones.server")>("@/lib/delivery/zones.server");
    const { updateStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
    await updateStoreSetting(A, "checkout", { zonesEnabled: true }, { id: fx.A.members.owner });
    const ctx = ownerCtx(kit, "A");
    const saved = await Z.saveZones(ctx, [
      { name: "Hors zone", cities: ["Tanger"], feeCents: null, freeFromCents: null, etaMinDays: null, etaMaxDays: null, notServed: true, note: null },
      { name: "Reste", cities: ["*"], feeCents: 3_000, freeFromCents: null, etaMinDays: 2, etaMaxDays: 4, notServed: false, note: null },
    ] as never);
    check("zones saved (control)", saved.problems.length === 0, saved.problems);
    const tanger = await order("A", { city: "Tanger" });
    await run(tanger);
    await run(tanger);
    const flags = (await db.select({ f: S.orders.flags }).from(S.orders).where(eq(S.orders.id, tanger.id)))[0]?.f;
    check("zone_not_served: appended once for a not-served zone", Array.isArray(flags) && flags.filter((f) => f === "zone_not_served").length === 1, flags);
    const rabat = await order("A", { city: "Rabat" });
    await run(rabat);
    const flagsR = (await db.select({ f: S.orders.flags }).from(S.orders).where(eq(S.orders.id, rabat.id)))[0]?.f;
    check("zone_not_served: never for a served zone", !(flagsR ?? []).includes("zone_not_served"), flagsR);
  }

  /* ------------------------------------------------------------ 3. markLeadConverted */
  suite("markLeadConverted");
  {
    const { markLeadConverted } = load<typeof import("@/lib/orders/leads")>("@/lib/orders/leads");
    const l1 = await lead("A", { attempts: 1, status: "contacted" });
    const oA = await order("A");
    const oB = await order("B");
    check("another store's scope answers not_found", JSON.stringify(await markLeadConverted(B, l1, oB.id, "agent")) === JSON.stringify({ ok: false, error: "not_found" }));
    check("another store's order answers not_found", JSON.stringify(await markLeadConverted(A, l1, oB.id, "agent")) === JSON.stringify({ ok: false, error: "not_found" }));
    const first = await markLeadConverted(A, l1, oA.id, "agent");
    check("converts: ok, not already", first.ok && first.orderId === oA.id && !first.already, first);
    const row = await leadRow(l1);
    check("converts: recovered, via agent, no follow-up", row?.status === "recovered" && row.convertedVia === "agent" && row.convertedOrderId === oA.id && row.nextAt === null, row);
    const again = await markLeadConverted(A, l1, (await order("A")).id, "agent");
    check("idempotent: a converted lead answers its existing order id", again.ok && again.orderId === oA.id && again.already, again);
    const audits = await db.select().from(S.auditLog).where(and(eq(S.auditLog.action, "lead.converted"), eq(S.auditLog.target, l1)));
    check("audited once: lead.converted in A", audits.length === 1 && audits[0]!.storeId === fx.A.id, audits.length);
  }

  /* ------------------------------------------------------------ 4. writes */
  suite("writes");
  {
    const W = load<typeof import("@/lib/leads/write")>("@/lib/leads/write");
    const agent = { actor: T.userActor(agentA), role: "agent" };
    const manager = { actor: T.userActor(managerA), role: "manager" };
    const l5 = await lead("A");
    const t0 = Date.now();
    const a1 = await W.logAttempt(A, agent, l5, "whatsapp");
    let r = await leadRow(l5);
    const c = r?.contactedAt?.getTime() ?? 0;
    check("attempt 1: contacted, taken by the agent, next = +2 h", a1.ok && a1.attempts === 1 && r?.status === "contacted" && r.assigneeId === agentA && Math.abs(c - t0) < 5_000 && near(r.nextAt, c + 2 * HOUR), r);
    check("attempt 1: answers the phone for the link", a1.ok && a1.phone === r?.phone);
    await W.logAttempt(A, agent, l5, "call");
    r = await leadRow(l5);
    check("attempt 2: next = first contact + 24 h", r?.attempts === 2 && near(r.nextAt, c + 24 * HOUR) && r.contactedAt?.getTime() === c, r);
    await W.logAttempt(A, agent, l5, "call");
    r = await leadRow(l5);
    check("attempt 3: no more follow-up", r?.attempts === 3 && r.nextAt === null, r);
    const revealed = await db.select().from(S.auditLog).where(and(eq(S.auditLog.action, "lead.phone_revealed"), eq(S.auditLog.target, l5)));
    check("every attempt is audited lead.phone_revealed", revealed.length === 3, revealed.length);

    const mine = await lead("A", { assigneeId: managerA, status: "contacted", attempts: 1 });
    check("agent: an attempt on another member's lead → not_found", JSON.stringify(await W.logAttempt(A, agent, mine, "call")) === JSON.stringify({ ok: false, error: "not_found" }));
    check("agent: lost on another member's lead → not_found", !(await W.markLost(A, agent, mine, "price")).ok);
    check("B: an attempt on A's lead → not_found", !(await W.logAttempt(B, { actor: T.userActor(fx.B.members.owner), role: "owner" }, l5, "call")).ok);
    check("B: lost on A's lead → not_found", !(await W.markLost(B, { actor: T.userActor(fx.B.members.owner), role: "owner" }, mine, "price")).ok);
    check("lost: an unknown reason is invalid", JSON.stringify(await W.markLost(A, manager, mine, "bored" as never)) === JSON.stringify({ ok: false, error: "invalid" }));
    const lost = await W.markLost(A, manager, mine, "no_answer");
    r = await leadRow(mine);
    check("lost: status lost with its reason, no follow-up", lost.ok && r?.status === "lost" && r.lostReason === "no_answer" && r.nextAt === null, r);
    check("lost: a closed lead cannot be lost again", !(await W.markLost(A, manager, mine, "price")).ok);
    check("follow-up: beyond 30 days is invalid", !(await W.setFollowUp(A, agent, l5, new Date(Date.now() + 40 * DAY))).ok);
    const at = new Date(Date.now() + 3 * HOUR);
    check("follow-up: set by the lead's agent", (await W.setFollowUp(A, agent, l5, at)).ok && near((await leadRow(l5))?.nextAt, at.getTime()));
    check("assign: a member of another store is refused", JSON.stringify(await W.assignLeads(A, manager, [l5], fx.B.members.agent)) === JSON.stringify({ ok: false, error: "invalid" }));
    const pool = await lead("A");
    const assigned = await W.assignLeads(A, manager, [pool], agentA);
    check("assign: to an active member of the store", assigned.ok && assigned.n === 1 && (await leadRow(pool))?.assigneeId === agentA);
    check("assign: B moving A's lead changes nothing", (await W.assignLeads(B, { actor: T.userActor(fx.B.members.owner), role: "owner" }, [pool], null)).ok && (await leadRow(pool))?.assigneeId === agentA);

    // "Take next": the oldest unassigned new leads, claimed once each in parallel
    const q1 = await lead("A", { createdAt: new Date(Date.now() - 29 * DAY) });
    const q2 = await lead("A", { createdAt: new Date(Date.now() - 28 * DAY) });
    const [t1, t2] = await Promise.all([W.takeNextLead(A, agent), W.takeNextLead(A, manager)]);
    const got = [t1, t2].sort();
    check("take next: two parallel claims take the two oldest, once each", JSON.stringify(got) === JSON.stringify([q1, q2].sort()), { t1, t2, q1, q2 });
    check("take next: each claim belongs to its taker", (await leadRow(t1!))?.assigneeId === agentA && (await leadRow(t2!))?.assigneeId === managerA);
  }

  /* ------------------------------------------------------------ 5. masked repository */
  suite("masked repository");
  {
    const R = load<typeof import("@/lib/leads/read")>("@/lib/leads/read");
    const P = load<typeof import("@/lib/admin-data/search/landing")>("@/lib/admin-data/search/landing");
    const owner = { userId: fx.A.members.owner, role: "owner" as const };
    const t = tag();
    const phone = phoneOf();
    const canary = await lead("A", { name: `Salma Qx${t}`, note: `call after six ${t}`, phone });
    await db.insert(S.customers).values({ id: newId(), storeId: fx.A.id, phone, ordersCount: 4, deliveredCount: 3, refusedCount: 1, fakeCount: 0 } as never);
    await db.insert(S.blocklist).values({ id: newId(), storeId: fx.A.id, kind: "phone", value: phone, reason: "test" });
    const ref = `WA-${"K7M2PQ"}`;
    const intent = await lead("A", { kind: "whatsapp", phone: null, ref, name: null });

    const member = await R.getLeadRow(A, canary, owner);
    check("member scope: the name and the note are readable (control)", member?.name === `Salma Qx${t}` && member.note === `call after six ${t}`, member);
    check("member scope: the phone is masked all the same", !!member?.phone && !member.phone.includes(phone.slice(-6, -2)) && member.phone.endsWith(phone.slice(-2)), member?.phone);
    check("risk chips from the customers counters and the blocklist", JSON.stringify(member?.risk) === JSON.stringify({ orders: 4, delivered: 3, refused: 1, fake: 0, blocked: true }), member?.risk);

    const imp = T.scopeOf(fx.A.id, "impersonation");
    maskCallers.length = 0;
    spying = true;
    const list = await R.listLeadRows(imp, { view: "all", limit: 100 }, owner);
    const one = await R.getLeadRow(imp, canary, owner);
    const hits = await P.provider.search(imp, "Salma Qx", { userId: owner.userId, role: "owner" });
    const refHits = await P.provider.search(imp, ref.toLowerCase(), { userId: owner.userId, role: "owner" });
    spying = false;
    const blob = JSON.stringify({ list, one, hits });
    check("impersonation: listLeadRows holds the canary row", list.rows.some((x) => x.id === canary));
    check("impersonation: no name or note canary in listLeadRows, getLeadRow or ⌘K", !blob.includes(`Qx${t}`) && !blob.includes(`six ${t}`), blob.slice(0, 300));
    check("impersonation: the name reads masked, the note hidden", one?.name === "Salma Q." && one.note === "Hidden", one);
    check("impersonation: the city stays", one?.city === "Casablanca");
    check("⌘K: the lead is found, masked", hits.some((h) => h.kind === "lead" && h.id === canary && h.title.includes("Salma Q.")), hits);
    check("⌘K: a typed WA- ref opens its intent", refHits.length >= 1 && refHits[0]!.kind === "wa-ref" && refHits[0]!.id === intent && refHits[0]!.href.endsWith(`/leads?lead=${intent}`), refHits);
    const outside = maskCallers.filter((f) => !f.includes("src/lib/leads/read.ts"));
    check("spy: maskIfImpersonation was called", maskCallers.length > 0);
    check("spy: every call to mask.ts came from src/lib/leads/read.ts", outside.length === 0, outside.slice(0, 3));

    const bHits = await P.provider.search(B, ref, { userId: fx.B.members.owner, role: "owner" });
    check("⌘K: B never finds A's WA- ref", bHits.length === 0, bHits);
    check("getLeadRow(B, A's lead) is null", (await R.getLeadRow(B, canary, { userId: fx.B.members.owner, role: "owner" })) === null);

    // agents: own leads plus the unassigned new ones
    const agentV = { userId: agentA, role: "agent" };
    const own = await lead("A", { assigneeId: agentA, status: "contacted", attempts: 1 });
    const others = await lead("A", { assigneeId: managerA, status: "contacted", attempts: 1 });
    const freshNew = await lead("A");
    const poolContacted = await lead("A", { status: "contacted", attempts: 1 });
    const seen = new Set((await R.listLeadRows(A, { limit: 100 }, agentV)).rows.map((x) => x.id));
    check("agent: sees their own and the unassigned new leads", seen.has(own) && seen.has(freshNew), [...seen].length);
    check("agent: never another member's lead nor an unassigned contacted one", !seen.has(others) && !seen.has(poolContacted));
    check("agent: getLeadRow of another member's lead is null", (await R.getLeadRow(A, others, agentV)) === null);
    const agentSearch = await P.provider.search(A, (await leadRow(others))!.name!, { userId: agentA, role: "agent" });
    check("agent: ⌘K never finds another member's lead", !agentSearch.some((h) => h.id === others), agentSearch);

    // the views and the cursor
    const dueLead = await lead("A", { status: "contacted", attempts: 1, nextAt: new Date(Date.now() - 60_000) });
    const due = await R.listLeadRows(A, { view: "due", limit: 100 }, owner);
    check("view due: open leads whose follow-up has come", due.rows.some((x) => x.id === dueLead) && due.rows.every((x) => x.nextAt !== null && Date.parse(x.nextAt) <= Date.now()));
    const p1 = await R.listLeadRows(A, { limit: 2 }, owner);
    const p2 = await R.listLeadRows(A, { limit: 2, cursor: p1.next }, owner);
    check("cursor: the next page continues without overlap", !!p1.next && p2.rows.length > 0 && !p2.rows.some((x) => p1.rows.some((y) => y.id === x.id)));
    check("window: the seeded 40-day-old lead is not listed", !(await R.listLeadRows(A, { limit: 100 }, owner)).rows.some((x) => x.id === fx.A.lead));
  }

  /* ------------------------------------------------------------ 6. header, pulse, digest */
  suite("header and pulse");
  {
    const R = load<typeof import("@/lib/leads/read")>("@/lib/leads/read");
    const now = Date.now();
    const agentB = fx.B.members.agent;
    const recovered: string[] = [];
    for (let i = 0; i < 20; i++) {
      const created = now - (i + 1) * HOUR;
      const id = await lead("B", { status: "contacted", attempts: 1, createdAt: new Date(created), contactedAt: new Date(created + (10 + i) * 60_000), assigneeId: i < 2 ? agentB : null, nextAt: i < 5 ? new Date(now - 10 * 60_000) : null });
      if (i >= 16) recovered.push(id);
    }
    const ships: [string, string][] = [["confirmed", "delivered"], ["confirmed", "none"], ["new", "none"], ["new", "none"]];
    for (const [k, id] of recovered.entries()) {
      const o = await order("B", { confirmState: ships[k]![0] as never, shipState: ships[k]![1] as never });
      await db.update(S.leads).set({ status: "recovered", convertedOrderId: o.id, convertedVia: "phone", nextAt: null }).where(eq(S.leads.id, id));
    }
    for (let i = 0; i < 3; i++) await lead("B", { status: "converted", attempts: 0, convertedOrderId: (await order("B")).id, convertedVia: "idem" });
    for (let i = 0; i < 5; i++) await lead("B");
    for (let i = 0; i < 2; i++) await lead("B", { kind: "whatsapp", phone: null, ref: `WA-Q${i}M2PQ`.slice(0, 9) });
    for (let i = 0; i < 2; i++) await lead("B", { isTest: true, status: "contacted", attempts: 1, contactedAt: new Date(now), nextAt: new Date(now - 60_000) });
    const ownerB = { userId: fx.B.members.owner, role: "owner" };
    const counts = await R.leadCounts(B, ownerB);
    const want = { days: 30, leads: 30, contacted: 20, recovered: { n: 4, pct: 20, confirmed: 2, delivered: 1 }, convertedWithoutContact: 3, firstContactP50Min: 20, firstContactN: 20 };
    check("header: the 30-day counts, test leads excluded", JSON.stringify(counts) === JSON.stringify(want), { counts, want });
    await db.update(S.leads).set({ contactedAt: null }).where(and(eq(S.leads.storeId, fx.B.id), sql`${S.leads.id} = ${recovered[0]!}`));
    const fewer = await R.leadCounts(B, ownerB);
    check("header: below n = 20 contacted, the % and the median are hidden", fewer.recovered.pct === null && fewer.firstContactP50Min === null && fewer.firstContactN === 19, fewer);

    const { contributor } = load<typeof import("@/lib/pulse/contributors/landing")>("@/lib/pulse/contributors/landing");
    const pulse = await contributor.contribute(B, ownerB);
    check("pulse: { leadsDue, leadsNew, waIntentsNew } for a manager", JSON.stringify(pulse) === JSON.stringify({ leadsDue: 5, leadsNew: 5, waIntentsNew: 2 }), pulse);
    const agentPulse = await contributor.contribute(B, { userId: agentB, role: "agent" });
    check("pulse: an agent's leadsDue counts only their own", agentPulse.leadsDue === 2 && agentPulse.leadsNew === 5, agentPulse);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await contributor.contribute(B, ownerB);
      best = Math.min(best, performance.now() - t0);
    }
    check(`pulse: ≤ 50 ms warm (${best.toFixed(1)} ms)`, best <= 50, best);
    const broken = { kind: "member", get storeId(): string { throw new Error("boom"); } } as unknown as StoreScope;
    check("pulse: a failure omits the keys", JSON.stringify(await contributor.contribute(broken, ownerB)) === "{}");
    const pulseA = await contributor.contribute(A, { userId: fx.A.members.owner, role: "owner" });
    check("pulse: A's counters are A's own (B's 5 due never reach them)", typeof pulseA.leadsDue === "number" && pulseA.leadsDue !== undefined, pulseA);

    const { followUpsDue } = load<typeof import("@/lib/leads/followups.server")>("@/lib/leads/followups.server");
    const digest = await followUpsDue(B);
    check("digest: one entry per assignee with due follow-ups (test leads out)", JSON.stringify(digest) === JSON.stringify([{ assigneeId: agentB, count: 2 }]), digest);
  }

  /* ------------------------------------------------------------ 7. purge */
  suite("purge");
  {
    const { purgeAbandonedLeads } = load<typeof import("@/lib/orders/admin")>("@/lib/orders/admin");
    const oldA = await lead("A", { createdAt: new Date(Date.now() - 31 * DAY) });
    const oldB = await lead("B", { createdAt: new Date(Date.now() - 31 * DAY) });
    const recentA = await lead("A", { createdAt: new Date(Date.now() - 29 * DAY) });
    const n = await purgeAbandonedLeads(A, 30);
    check("housekeeping: A's leads older than 30 days are purged", n >= 2 && !(await leadRow(oldA)) && !(await leadRow(fx.A.lead)), n);
    check("housekeeping: a recent lead stays", !!(await leadRow(recentA)));
    check("housekeeping: B's old leads stay (per store)", !!(await leadRow(oldB)) && !!(await leadRow(fx.B.lead)));
  }

  /* ------------------------------------------------------------ 8. vitals and the mode plan */
  suite("vitals and mode plan");
  {
    const V = load<typeof import("@/lib/landing/vitals")>("@/lib/landing/vitals");
    const MP = load<typeof import("@/lib/landing/mode-plan")>("@/lib/landing/mode-plan");
    const TM = load<typeof import("@/lib/admin-data/time")>("@/lib/admin-data/time");
    const tz = fx.rows.A.timezone || "Africa/Casablanca";
    const today = TM.dayKey(new Date(), tz);
    const small = await kit.fresh.page(fx.A, "published");
    const big = await kit.fresh.page(fx.A, "published");
    const stats = (store: "A" | "B", pageId: string, back: number, views: number, uniques: number) =>
      db.insert(S.statsDaily).values({ storeId: fx[store].id, pageId, day: TM.addDays(today, -back), views, uniques, formStarts: 0, orders: 0, revenue: 0 });
    for (let d = 0; d < 7; d++) await stats("A", small, d, 3, 2);
    await stats("A", small, 7, 1_000, 900); // the eighth day is outside the window
    for (let d = 0; d < 7; d++) await stats("A", big, d, 30, 10 + d);
    for (let i = 0; i < 2; i++) await order("A", { pageId: small });
    for (let i = 0; i < 20; i++) await order("A", { pageId: big, confirmState: (i < 10 ? "confirmed" : "new") as never });
    for (let i = 0; i < 3; i++) await order("A", { pageId: big, isTest: true, confirmState: "confirmed" as never });
    await order("A", { pageId: big, createdAt: new Date(TM.dayStart(TM.addDays(today, -7), tz).getTime() + HOUR) });
    await stats("B", fx.B.page.live, 0, 500, 400);

    const v = await V.getPageVitals(A, [small, big, fx.B.page.live]);
    const s = v[small]!;
    const b = v[big]!;
    check("vitals small: 7 days of views and uniques, the eighth day out", s.views === 21 && s.uniques === 14, s);
    check("vitals small: orders counted, rates hidden below n = 20", s.orders === 2 && s.conversion === null && s.confirmation === null, s);
    check("vitals small: a 7-point sparkline, oldest first", JSON.stringify(s.daily) === JSON.stringify([3, 3, 3, 3, 3, 3, 3]), s.daily);
    const uniques = [10, 11, 12, 13, 14, 15, 16].reduce((n, x) => n + x, 0);
    check("vitals big: test orders and orders before the window excluded", b.orders === 20 && b.confirmed === 10, b);
    check("vitals big: conversion = orders / uniques, confirmation = confirmed / orders", b.uniques === uniques && b.conversion === Math.round((20 / uniques) * 10_000) / 10_000 && b.confirmation === 0.5, b);
    check("vitals big: the sparkline follows the days", JSON.stringify(b.daily) === JSON.stringify([30, 30, 30, 30, 30, 30, 30]), b.daily);
    const bPage = v[fx.B.page.live]!;
    check("vitals: B's page read through A's scope is all zeros", bPage.views === 0 && bPage.orders === 0 && bPage.uniques === 0, bPage);
    const fromB = await V.getPageVitals(B, [small, big]);
    check("vitals: B never reads A's pages", fromB[small]!.views === 0 && fromB[big]!.orders === 0, fromB);

    const plan = await MP.landingModeSwitchPlan(A);
    const [live] = await db.select({ n: sql<number>`COUNT(*)` }).from(S.pages).where(and(eq(S.pages.storeId, fx.A.id), eq(S.pages.kind, "landing"), eq(S.pages.status, "published")));
    const [views] = await db
      .select({ n: sql<number>`COALESCE(SUM(${S.statsDaily.views}), 0)` })
      .from(S.statsDaily)
      .innerJoin(S.pages, eq(S.pages.id, S.statsDaily.pageId))
      .where(and(eq(S.statsDaily.storeId, fx.A.id), eq(S.pages.storeId, fx.A.id), eq(S.pages.kind, "landing"), eq(S.pages.status, "published"), sql`${S.statsDaily.day} >= ${TM.addDays(today, -6)}`));
    check("mode plan: live landing pages and their 7-day views", plan.livePages === Number(live!.n) && plan.views7d === Number(views!.n) && plan.views7d >= 21 + 210 && plan.suggestInStoreMode, { plan, live: live!.n, views: views!.n });
    const empty = await MP.landingModeSwitchPlan(T.scopeOf(fx.A.id) as StoreScope);
    check("mode plan: stable on a second read", JSON.stringify(empty) === JSON.stringify(plan));
  }
  return 0;
}

/** A WriteCtx of the store's owner (what `storeAction("checkout.write", …)` hands the repository). */
function ownerCtx(kit: Kit, key: "A" | "B"): WriteCtx {
  const userId = kit.fx[key].members.owner;
  return {
    user: { id: userId, email: `owner-${key.toLowerCase()}@tenancy.test`, name: `Owner ${key}`, totpEnabled: false, sessionId: "leads-check", platformRole: "none", locale: null, lastStoreId: kit.fx[key].id },
    store: kit.fx.rows[key],
    membership: { role: "owner", status: "active" },
    scope: T.scopeOf(kit.fx[key].id) as WriteScope,
    actor: { kind: "user", userId, impersonatorId: null, ip: null },
    impersonation: null,
    stepUpUntil: null,
    can: () => true,
  } as WriteCtx;
}

void (async () => {
  const started = Date.now();
  let failed = 1;
  try {
    failed = await main();
  } catch (e) {
    check("the suite ran to the end", false, e instanceof Error ? e.stack : e);
  } finally {
    const left = await T.dropDatabase().catch((e: unknown) => [`cleanup failed: ${e instanceof Error ? e.message : String(e)}`]);
    const fails = T.report("test:leads (LP-06, LP-22, SF-06)", [`database ${T.DB_NAME} dropped; cod_test_* left: ${left.length ? left.join(", ") : "none"}`, `${Math.round((Date.now() - started) / 1000)} s`]);
    process.exit(fails || failed ? 1 : 0);
  }
})();
