/**
 * Two-store attack cases of the integrations track (P5 INTEGRATIONS, operations.md OPE-§O.2 `test:tenancy` row).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created empty at P0 and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty file as not applicable until the track merges.
 * Case files import only types from the harness (it runs at load); the app modules are loaded inside each case, once
 * the harness has put the throwaway database in place.
 *
 * R1 P5 step 1, the template repository and the template values (src/lib/integrations/whatsapp/templates.server.ts,
 * src/lib/integrations/templates.ts): B never resolves, lists, overwrites or resets A's rows, a page of A is
 * `not_found` from B, an AI draft of A is never served to A's agents, and template values never read A's data.
 *
 * R1 P5 step 2, integration health (src/lib/integrations/{health,deliveries}.ts, src/lib/sheets/history.ts, the pulse
 * contributor): B's deliveries log never lists A's rows, also filtered on A's ids and kinds (OPE-§28.3 (3));
 * `integrationHealth`, `sheetsBacklog`, `syncFailedCount`, the run history and the pulse never count A; A's own rows
 * carry no phone, name or sealed payload (OPE-§28.3 (4)).
 *
 * R1 P5 step 4, the Sheets push (src/lib/sheets/push.ts `pushStore`): B's run never reads, appends, marks or calls A's
 * orders or A's sheet, even when B's sheet names A's order; B's config pointing at A's spreadsheet is unbound for B and
 * makes no call (SHT-02, SHT-05, OPE-§19.2).
 *
 * R1 P5 step 5, the bindings and the pull (src/lib/sheets/{connect,pull}.ts): B pasting A's spreadsheet, or verifying a
 * proof for it, gets the one generic refusal before any Google call and never holds A's binding; B's sheet naming A's
 * order ids (every pulled cell filled) moves, notes or relabels none of A's orders, and the pull's reads and writes under
 * B's scope never reach A's rows (OPE-§19.3, §19.6, SHT-05).
 *
 * R1 P5 step 6, server ad events (src/lib/orders/conversions.ts, src/lib/jobs/handlers/capi.ts): B's creation path and
 * B's int.capi hook named with A's order enqueue nothing and never read, seal or clear A's capi_ctx; B never opens A's
 * sealed context; B's purge never touches A's rows; B's conversions change never lists A's pages; a `capi` item of
 * store B naming A's pixel id signs with B's token only (A's token never leaves A); B replaying A's outbox id is
 * not_found (P8's `replay`: not applicable while it is the P0 stub).
 */
import { createRequire } from "node:module";
import type { TenancyCase, TenancyKit } from "../tenancy-check";
import type { PullDecision } from "@/lib/sheets/plan";
import type { WriteScope } from "@/lib/tenancy/types";

const nodeRequire = createRequire(__filename);
const load = <T>(id: string): T => nodeRequire(id) as T;

type Repo = typeof import("@/lib/integrations/whatsapp/templates.server");

/** A's own override of the confirm template: a canary body that must never reach B. */
const A_BODY = "Bonjour {customer_first_name}, A-ONLY-TEMPLATE-CANARY {order_id}.";
const A_PAGE_BODY = "Salam {customer_first_name}, A-PAGE-TEMPLATE-CANARY {order_id}.";
const A_DRAFT_BODY = "A-DRAFT-TEMPLATE-CANARY {order_id}";
/** OPE-§19.3: the one answer to a spreadsheet another store holds (no hint of which store) */
const GENERIC_REFUSAL = "This sheet can't be connected. Create a new Google Sheet for this store.";
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });

/** The member scopes of the harness are write scopes at run time (kind "member", D71). */
const write = (kit: TenancyKit, store: "A" | "B") => kit.scope(store) as WriteScope;

async function seedA(kit: TenancyKit, repo: Repo): Promise<{ store: string; page: string }> {
  const a = write(kit, "A");
  const owner = kit.fx.A.members.owner;
  const store = await repo.saveTemplate(a, { channel: "whatsapp", kind: "confirm", locale: "fr", name: "A store", body: A_BODY }, { userId: owner });
  const page = await repo.saveTemplate(a, { channel: "whatsapp", kind: "confirm", locale: "fr", pageId: kit.fx.A.page.live, name: "A page", body: A_PAGE_BODY }, { userId: owner });
  kit.check("templates: A saves its every-page and page overrides", store.ok && page.ok, { store, page });
  return { store: store.ok ? store.id : "", page: page.ok ? page.id : "" };
}

export const cases: TenancyCase[] = [
  {
    name: "templates: B never resolves or lists A's rows",
    async run(kit) {
      const repo = load<Repo>("@/lib/integrations/whatsapp/templates.server");
      const ids = await seedA(kit, repo);
      const a = kit.scope("A");
      const b = kit.scope("B");
      const own = await repo.resolveTemplate(a, { channel: "whatsapp", kind: "confirm", locale: "fr", pageId: kit.fx.A.page.live });
      kit.check("templates: A resolves its page override", own?.source === "page" && own.id === ids.page, own);
      const ownStore = await repo.resolveTemplate(a, { channel: "whatsapp", kind: "confirm", locale: "fr" });
      kit.check("templates: A resolves its every-page override", ownStore?.source === "store" && ownStore.id === ids.store, ownStore);
      // B asks for the same slot, even with A's page id: the built-in, never A's text
      const answers: unknown[] = [];
      for (const pageId of [kit.fx.A.page.live, kit.fx.B.page.live, null]) {
        const got = await repo.resolveTemplate(b, { channel: "whatsapp", kind: "confirm", locale: "fr", pageId });
        answers.push(got);
        kit.check(`templates: B resolves the built-in (page ${pageId === null ? "none" : pageId === kit.fx.A.page.live ? "of A" : "of B"})`, got?.source === "builtin" && !got.body.includes("CANARY"), got);
      }
      const listed = await repo.listTemplates(b, { includeDrafts: true });
      answers.push(listed);
      kit.check("templates: B's list holds none of A's rows", !listed.some((r) => r.id === ids.store || r.id === ids.page || r.body.includes("CANARY")), listed);
      kit.check("templates: B's answers carry no canary of A", kit.leaks(answers).length === 0 && !JSON.stringify(answers).includes(kit.fx.A.page.live), kit.leaks(answers));
    },
  },
  {
    name: "templates: B cannot overwrite or reset A's rows",
    async run(kit) {
      const repo = load<Repo>("@/lib/integrations/whatsapp/templates.server");
      const b = write(kit, "B");
      const onPageOfA = await repo.saveTemplate(b, { channel: "whatsapp", kind: "confirm", locale: "fr", pageId: kit.fx.A.page.live, name: "B", body: "B {order_id}" }, { userId: kit.fx.B.members.owner });
      kit.check("templates: a page of A is not_found from B", !onPageOfA.ok && onPageOfA.error === "not_found", onPageOfA);
      const reset = await repo.resetTemplate(b, { channel: "whatsapp", kind: "confirm", locale: "fr", pageId: kit.fx.A.page.live });
      const resetEvery = await repo.resetTemplate(b, { channel: "whatsapp", kind: "confirm", locale: "fr" });
      kit.check("templates: B's reset deletes none of A's rows", reset.deleted === 0 && resetEvery.deleted === 0, { reset, resetEvery });
      // B's own save of the same slot is B's row, and A still reads its own text
      const mine = await repo.saveTemplate(b, { channel: "whatsapp", kind: "confirm", locale: "fr", name: "B", body: "B-ONLY {order_id}" }, { userId: kit.fx.B.members.owner });
      const stillA = await repo.resolveTemplate(kit.scope("A"), { channel: "whatsapp", kind: "confirm", locale: "fr" });
      kit.check("templates: B's save of the same slot leaves A's text", mine.ok && mine.created && !!stillA?.body.includes("A-ONLY-TEMPLATE-CANARY"), { mine, stillA });
      const bRead = await repo.resolveTemplate(kit.scope("B"), { channel: "whatsapp", kind: "confirm", locale: "fr" });
      kit.check("templates: B reads its own row", bRead?.source === "store" && bRead.body === "B-ONLY {order_id}", bRead);
      await repo.resetTemplate(b, { channel: "whatsapp", kind: "confirm", locale: "fr" });
    },
  },
  {
    name: "templates: an AI draft of A is never served to A's agents (AI-15)",
    async run(kit) {
      const repo = load<Repo>("@/lib/integrations/whatsapp/templates.server");
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const { messageTemplates } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { storeValues } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
      const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
      const a = write(kit, "A");
      const id = newId();
      await db.insert(messageTemplates).values(
        storeValues(a, { id, channel: "whatsapp" as const, kind: "missed_call", locale: "ar", pageId: kit.fx.A.page.live, name: "AI draft", body: A_DRAFT_BODY, status: "draft" as const, source: "ai" as const, promptVersion: "p1" }),
      );
      const served = await repo.resolveTemplate(kit.scope("A"), { channel: "whatsapp", kind: "missed_call", locale: "ar", pageId: kit.fx.A.page.live });
      kit.check("templates: the draft is not served, the built-in is", served?.source === "builtin" && served.id === "builtin:missed_call:ar", served);
      const editor = await repo.listTemplates(kit.scope("A"), { kind: "missed_call", includeDrafts: true });
      const agentsList = await repo.listTemplates(kit.scope("A"), { kind: "missed_call" });
      kit.check("templates: the editor's Suggested lane lists it, the default list does not", editor.some((r) => r.id === id && r.status === "draft") && !agentsList.some((r) => r.id === id), { editor, agentsList });
      const fromB = await repo.listTemplates(kit.scope("B"), { kind: "missed_call", includeDrafts: true });
      kit.check("templates: B never lists A's draft", !fromB.some((r) => r.id === id));
    },
  },
  {
    name: "templates: template values never read another store's data",
    async run(kit) {
      const { orderTemplateValues } = load<typeof import("@/lib/integrations/templates")>("@/lib/integrations/templates");
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const { orders } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { byId } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
      const [orderA] = await db.select().from(orders).where(byId(orders, kit.scope("A"), kit.fx.A.order.main)).limit(1);
      kit.check("templates: A's order row is there", !!orderA);
      if (!orderA) return;
      const own = await orderTemplateValues(kit.scope("A"), orderA, { firstName: "Samira Idrissi", locale: "fr" });
      kit.check("templates: A's values name A's order and store", own.order_id === orderA.id && own.store_name === kit.fx.A.name && own.agent_first_name === "Samira", own);
      const crossed = await orderTemplateValues(kit.scope("B"), orderA, { firstName: "Karim", locale: "fr" });
      kit.check("templates: A's order under B's scope answers no value", Object.keys(crossed).length === 0, crossed);
      const own2 = JSON.stringify(own);
      kit.check("templates: A's values carry nothing of B", !own2.includes(kit.fx.B.name) && !own2.includes(kit.fx.B.handle));

      // the upsell comes from the order's own version doc, read through the store's scope (`$.offers.upsell` only)
      const { pageVersions } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { storeValues } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
      const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
      const a = write(kit, "A");
      const versionId = newId();
      await db.insert(pageVersions).values(
        storeValues(a, { id: versionId, pageId: kit.fx.A.page.live, kind: "save" as const, doc: { offers: { upsell: { enabled: true, title: "Savon noir 200 g", price: 59 } } } as never, checksum: "0".repeat(64) }),
      );
      try {
        const noTaken = { ...orderA, versionId, items: { ...orderA.items, upsell: undefined } };
        const withUpsell = await orderTemplateValues(kit.scope("A"), noTaken, { firstName: null, locale: "fr" });
        kit.check("templates: the upsell of the order's version doc", withUpsell.upsell_title === "Savon noir 200 g" && !!withUpsell.upsell_price?.includes("59"), withUpsell);
        const taken = await orderTemplateValues(kit.scope("A"), { ...noTaken, items: { ...orderA.items, upsell: { title: "Savon noir 200 g", price: 59 } } }, { firstName: null, locale: "fr" });
        kit.check("templates: an upsell already taken is not offered again", !("upsell_title" in taken), taken);
        const [orderB] = await db.select().from(orders).where(byId(orders, kit.scope("B"), kit.fx.B.order.main)).limit(1);
        const foreignDoc = orderB ? await orderTemplateValues(kit.scope("B"), { ...orderB, versionId, items: { ...orderB.items, upsell: undefined } }, { firstName: null, locale: "fr" }) : null;
        kit.check("templates: B's order naming A's version id reads no upsell", !!foreignDoc && foreignDoc.order_id === orderB!.id && !("upsell_title" in foreignDoc), foreignDoc);
      } finally {
        await db.delete(pageVersions).where(byId(pageVersions, a, versionId));
      }
    },
  },
  {
    name: "integrations health: B's reads never list or count A's rows (OPE-§28.3 (3), §27.3)",
    async run(kit) {
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const { cronCursors, integrationStatus, orders, outbox } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { byId, inStore, storeValues, whereStore } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
      const { newId } = load<typeof import("@/lib/db/ids")>("@/lib/db/ids");
      const { eq, inArray } = load<typeof import("drizzle-orm")>("drizzle-orm");
      const health = load<typeof import("@/lib/integrations/health")>("@/lib/integrations/health");
      const { listDeliveries } = load<typeof import("@/lib/integrations/deliveries")>("@/lib/integrations/deliveries");
      const history = load<typeof import("@/lib/sheets/history")>("@/lib/sheets/history");
      const { contributor } = load<typeof import("@/lib/pulse/contributors/integrations")>("@/lib/pulse/contributors/integrations");
      const a = write(kit, "A");
      const b = kit.scope("B");
      const owner = { userId: kit.fx.B.members.owner, role: "owner" };

      // B's own answers before A's rows exist
      const before = {
        health: await health.integrationHealth(b),
        backlog: await health.sheetsBacklog(b),
        failed: await health.syncFailedCount(b),
        dead: await health.deadDeliveryCount(b),
        list: await listDeliveries(b, {}),
      };

      // A's rows: a failing pixel and Telegram, dead deliveries carrying canaries, a failed sheet row, a run
      const pixelA = "meta:555555555555555";
      await db.insert(integrationStatus).values([
        storeValues(a, { kind: "capi" as const, targetId: pixelA, state: "failing" as const, failures: 9, lastErrorCode: "token_revoked", lastErrorAt: new Date() }),
        storeValues(a, { kind: "telegram" as const, targetId: "", state: "failing" as const, failures: 1, lastErrorCode: "chat_not_found", lastErrorAt: new Date() }),
      ]);
      const deadIds = [newId(), newId(), newId()];
      await db.insert(outbox).values(
        deadIds.map((id, i) =>
          storeValues(a, {
            id,
            kind: (i === 2 ? "telegram" : "capi") as "capi" | "telegram",
            topic: i === 2 ? "new_order" : "Purchase",
            targetId: i === 2 ? "chat" : pixelA,
            dedupeKey: `capi:${pixelA}:${kit.fx.A.order.main}:A-CANARY-${id}`,
            payload: JSON.stringify({ canary: "A-SEALED-PAYLOAD-CANARY", phone: kit.fx.A.customer.phone, name: kit.fx.A.customer.name }),
            encrypted: true,
            state: "dead" as const,
            attempts: 7,
            lastStatus: 400,
            lastError: `refused ${kit.fx.A.customer.phone}`,
          }),
        ),
      );
      const [mainBefore] = await db.select({ sheetStatus: orders.sheetStatus }).from(orders).where(byId(orders, a, kit.fx.A.order.main)).limit(1);
      await db.update(orders).set({ sheetStatus: "failed" }).where(byId(orders, a, kit.fx.A.order.main));
      await history.recordSheetsRun(a, { at: new Date().toISOString(), ms: 9, appended: 4, updated: 0, pulled: 0, calls: 1, ok: false, error: "sheet_not_shared" });
      try {
        const ownA = await listDeliveries(kit.scope("A"), { state: "dead" });
        kit.check("deliveries: A lists its own dead rows", deadIds.every((id) => ownA.rows.some((r) => r.id === id)), ownA.rows.map((r) => r.id));
        kit.check(
          "deliveries: A's own rows carry no phone, name or sealed payload",
          kit.leaks(ownA, { only: ["customer"] }).length === 0 && !JSON.stringify(ownA).includes("A-SEALED-PAYLOAD-CANARY"),
          kit.leaks(ownA),
        );

        const answers: unknown[] = [];
        const listB = await listDeliveries(b, {});
        answers.push(listB);
        kit.check("deliveries: B's log never lists A's rows", !listB.rows.some((r) => deadIds.includes(r.id)) && JSON.stringify(listB.rows) === JSON.stringify(before.list.rows), listB.rows.map((r) => r.id));
        for (const q of [{ kind: "capi" as const }, { state: "dead" as const }, { kind: "telegram" as const, state: "dead" as const }, { after: `2.${deadIds[0]}` }, { after: `10.${deadIds[2]}` }]) {
          const got = await listDeliveries(b, q);
          answers.push(got);
          kit.check(`deliveries: B filtered on A's ids or kinds lists none of A's rows (${JSON.stringify(q)})`, !got.rows.some((r) => deadIds.includes(r.id)), got.rows.map((r) => r.id));
        }

        const healthB = await health.integrationHealth(b);
        answers.push(healthB);
        kit.check("integrationHealth: B never reads A's targets", JSON.stringify(healthB) === JSON.stringify(before.health) && !healthB.some((r) => r.targetId === pixelA), healthB);
        const backlogB = await health.sheetsBacklog(b);
        answers.push(backlogB);
        kit.check("sheetsBacklog: B never counts A's orders or runs", JSON.stringify(backlogB) === JSON.stringify(before.backlog), { before: before.backlog, after: backlogB });
        const failedB = await health.syncFailedCount(b);
        kit.check("syncFailedCount: B never counts A's failed rows or dead deliveries", failedB === before.failed, { before: before.failed, after: failedB });
        kit.check("deadDeliveryCount: B never counts A's", (await health.deadDeliveryCount(b)) === before.dead);
        kit.check("syncFailedCount: A counts its own", (await health.syncFailedCount(kit.scope("A"))) >= 4);
        const pulseB = await contributor.contribute(b, owner);
        answers.push(pulseB);
        kit.check("pulse: B's syncFailed never counts A's rows", !("syncFailed" in pulseB) || pulseB.syncFailed === before.failed, pulseB);
        const runsB = await history.sheetsRunHistory(b);
        answers.push(runsB);
        kit.check("run history: B never reads A's runs", !runsB.some((r) => r.appended === 4 && r.error === "sheet_not_shared" && r.ms === 9), runsB);
        const text = JSON.stringify(answers);
        kit.check("integrations health: B's answers carry no canary of A", kit.leaks(answers).length === 0 && !text.includes("A-CANARY") && !text.includes(pixelA), kit.leaks(answers));
      } finally {
        await db.delete(outbox).where(whereStore(outbox, a, inArray(outbox.id, deadIds)));
        await db.delete(integrationStatus).where(inStore(integrationStatus, a));
        if (mainBefore) await db.update(orders).set({ sheetStatus: mainBefore.sheetStatus }).where(byId(orders, a, kit.fx.A.order.main));
        await db.delete(cronCursors).where(eq(cronCursors.job, `sheets.push:${kit.fx.A.id}`));
      }
    },
  },
  {
    name: "sheets push: B's run never touches A's orders or A's sheet (IN-01, SHT-02)",
    async run(kit) {
      const push = load<typeof import("@/lib/sheets/push")>("@/lib/sheets/push");
      const client = load<typeof import("@/lib/sheets/client")>("@/lib/sheets/client");
      const config = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
      const { getStoreSetting, setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const { orders } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { byId } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
      const a = write(kit, "A");
      const b = write(kit, "B");
      const sheetA = await config.getSheetsConfig(a);
      const sheetB = await config.getSheetsConfig(b);
      if (!sheetA || !sheetB) {
        kit.check("sheets push: both stores have a connected sheet", false, { sheetA, sheetB });
        return;
      }
      kit.check("sheets push: each store's sheet is bound to it alone", (await config.sheetBound(a, sheetA.spreadsheetId)) && (await config.sheetBound(b, sheetB.spreadsheetId)) && !(await config.sheetBound(b, sheetA.spreadsheetId)));

      // A's order made due (pending) and B's too; B's sheet answers a row naming A's order (ids are customer-visible)
      const keep = async (scope: WriteScope, id: string) => (await db.select({ s: orders.sheetStatus, a: orders.sheetAttempts, d: orders.sheetDirty, e: orders.sheetError }).from(orders).where(byId(orders, scope, id)).limit(1))[0];
      const prevA = await keep(a, kit.fx.A.order.main);
      const prevB = await keep(b, kit.fx.B.order.main);
      await db.update(orders).set({ sheetStatus: "pending" }).where(byId(orders, a, kit.fx.A.order.main));
      await db.update(orders).set({ sheetStatus: "pending", sheetAttempts: 1 }).where(byId(orders, b, kit.fx.B.order.main));
      const called: string[] = [];
      const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });
      client.setGapiDoubleForTests(async (call) => {
        called.push(call.path.split("?")[0] ?? "");
        if (call.path.includes(":batchGet")) return json({ valueRanges: [{}, { values: [[kit.fx.A.order.main, "", "Nouvelle"]] }] });
        return json({ updates: { updatedRows: 1 } });
      });
      const prevSettingB = await getStoreSetting(b, "sheets", { fresh: true });
      try {
        const before = await kit.snapshotA();
        const run = await push.pushStore(b, { maxCalls: 3, force: true, trigger: "manual" });
        const ownB = `/${encodeURIComponent(sheetB.spreadsheetId)}`;
        kit.check("sheets push: B's run calls B's sheet only", called.length > 0 && called.every((p) => p.startsWith(`${ownB}/`)), called);
        kit.check("sheets push: B's run appends B's own order", run.appended === 1 && (await keep(b, kit.fx.B.order.main))?.s === "synced", run);
        kit.check("sheets push: A's orders are not read, appended or marked by B's run", (await kit.snapshotA()) === before && (await keep(a, kit.fx.A.order.main))?.s === "pending");
        const sent = JSON.stringify(called);
        kit.check("sheets push: nothing of A reaches B's calls", !sent.includes(kit.fx.A.order.main) && !sent.includes(sheetA.spreadsheetId), called);

        // B's settings naming A's spreadsheet (a pasted id written past the binding): unbound for B, so no call at all
        await setStoreSetting(b, "sheets", { ...prevSettingB, spreadsheetId: sheetA.spreadsheetId, enabled: true }, { id: kit.fx.B.members.owner });
        await db.update(orders).set({ sheetStatus: "pending" }).where(byId(orders, b, kit.fx.B.order.main));
        called.length = 0;
        const crossed = await push.pushStore(b, { maxCalls: 3, force: true, trigger: "manual" });
        kit.check("sheets push: B configured with A's spreadsheet is unbound and calls nothing", crossed.skipped === "unbound" && called.length === 0 && (await kit.snapshotA()) === before, { crossed, called });
      } finally {
        client.setGapiDoubleForTests(null);
        await setStoreSetting(b, "sheets", prevSettingB, { id: kit.fx.B.members.owner });
        if (prevA) await db.update(orders).set({ sheetStatus: prevA.s, sheetAttempts: prevA.a, sheetDirty: prevA.d, sheetError: prevA.e }).where(byId(orders, a, kit.fx.A.order.main));
        if (prevB) await db.update(orders).set({ sheetStatus: prevB.s, sheetAttempts: prevB.a, sheetDirty: prevB.d, sheetError: prevB.e }).where(byId(orders, b, kit.fx.B.order.main));
      }
    },
  },
  {
    name: "sheets bindings: B can never connect A's spreadsheet (IN-01, OPE-§19.3, TENANCY-MAP §7.7)",
    async run(kit) {
      const connect = load<typeof import("@/lib/sheets/connect")>("@/lib/sheets/connect");
      const config = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
      const client = load<typeof import("@/lib/sheets/client")>("@/lib/sheets/client");
      const { proofHash } = load<typeof import("@/lib/sheets/proof")>("@/lib/sheets/proof");
      const { getStoreSetting, setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
      const a = write(kit, "A");
      const b = write(kit, "B");
      const sheetA = await config.getSheetsConfig(a);
      if (!sheetA) {
        kit.check("sheets bindings: A has a connected sheet", false);
        return;
      }
      const ownerB = { kind: "user" as const, userId: kit.fx.B.members.owner, impersonatorId: null, ip: null };
      const how = { currency: "MAD", stepUp: "totp" as const };
      const code = "SG-7K2QX9M4TB";
      const called: string[] = [];
      // the worst case: A's spreadsheet title even carries the code B made up
      client.setGapiDoubleForTests(async (call) => {
        called.push(call.path.split("?")[0] ?? "");
        return json({ properties: { title: `Orders ${code}` }, sheets: [{ properties: { sheetId: 0, title: "Commandes" } }] });
      });
      const prevB = await getStoreSetting(b, "sheets", { fresh: true });
      const answers: unknown[] = [];
      const said = (e: unknown) => (e instanceof config.SheetBindingConflict ? e.message : `other: ${e instanceof Error ? e.message : String(e)}`);
      try {
        const started = await connect.startSheetConnect(b, `https://docs.google.com/spreadsheets/d/${sheetA.spreadsheetId}/edit#gid=0`, ownerB, how).then((r) => `resolved ${r.kind}`, said);
        answers.push(started);
        kit.check("sheets bindings: B pasting A's spreadsheet → the one generic refusal, before any Google call", started === GENERIC_REFUSAL && called.length === 0, { started, called });
        kit.check("sheets bindings: the refusal saves no proof for B", (await getStoreSetting(b, "sheets", { fresh: true })).pending === null);
        // a proof for A's spreadsheet written into B's setting past startSheetConnect: the verify's INSERT finds A's key
        const pending = { spreadsheetId: sheetA.spreadsheetId, sheetId: null, codeHash: proofHash(code), expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
        await setStoreSetting(b, "sheets", { ...prevB, pending }, { id: kit.fx.B.members.owner });
        const verified = await connect.verifySheetConnect(b, ownerB, how).then(() => "resolved", said);
        answers.push(verified);
        kit.check(
          "sheets bindings: B's verify of A's spreadsheet (the duplicate key) → the same generic refusal, the proof dropped",
          verified === GENERIC_REFUSAL && (await getStoreSetting(b, "sheets", { fresh: true })).pending === null,
          verified,
        );
        kit.check("sheets bindings: B's verify read the titles only (no tab set up, no cell written)", called.every((p) => !p.includes(":batchUpdate") && !p.includes("/values")), called);
        kit.check(
          "sheets bindings: A's spreadsheet stays A's alone; B keeps its own sheet",
          (await config.sheetBound(a, sheetA.spreadsheetId)) && !(await config.sheetBound(b, sheetA.spreadsheetId)) && (await config.getSheetsConfig(b))?.spreadsheetId === prevB.spreadsheetId,
        );
        const text = JSON.stringify(answers);
        kit.check("sheets bindings: the refusal names nothing of A", kit.leaks(answers).length === 0 && !text.includes(kit.fx.A.handle) && !text.includes(kit.fx.A.name), kit.leaks(answers));
      } finally {
        client.setGapiDoubleForTests(null);
        await setStoreSetting(b, "sheets", prevB, { id: kit.fx.B.members.owner });
      }
    },
  },
  {
    name: "sheets pull: B's sheet naming A's orders moves none of them (IN-01, SHT-05, OPE-§19.6)",
    async run(kit) {
      const push = load<typeof import("@/lib/sheets/push")>("@/lib/sheets/push");
      const pull = load<typeof import("@/lib/sheets/pull")>("@/lib/sheets/pull");
      const client = load<typeof import("@/lib/sheets/client")>("@/lib/sheets/client");
      const config = load<typeof import("@/lib/sheets/config")>("@/lib/sheets/config");
      const { statusLabel } = load<typeof import("@/lib/sheets/row")>("@/lib/sheets/row");
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const { orders } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { byId } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
      const b = write(kit, "B");
      const idA = kit.fx.A.order.main;
      const idB = kit.fx.B.order.main;
      const sheetB = await config.getSheetsConfig(b);
      if (!sheetB) {
        kit.check("sheets pull: B has a connected sheet", false);
        return;
      }
      const keep = async (id: string) => (await db.select({ s: orders.sheetStatus, l: orders.sheetLabel, d: orders.sheetDirty }).from(orders).where(byId(orders, b, id)).limit(1))[0];
      const prevB = await keep(idB);
      await db.update(orders).set({ sheetStatus: "synced", sheetLabel: "new", sheetDirty: 0 }).where(byId(orders, b, idB));
      // P4's calls as spies (their real bodies scope by store too; the point here is that P5 never makes the call)
      const applied: string[] = [];
      const evented: string[] = [];
      pull.setPullDoubleForTests({
        applyExternalStatus: async (_scope, id) => {
          applied.push(id);
          return { ok: true, changed: false, noop: true };
        },
        appendOrderEvent: async (_scope, id) => {
          evented.push(id);
          return { ok: false, error: "not_found" };
        },
      });
      // B's sheet: a row naming A's order (ids are customer-visible) with every pulled cell filled, then B's own row
      const header = ["Agent", "Note agent", "Tracking", "Transporteur"];
      const rows = [
        [idA, "", statusLabel("cancelled"), ...Array<string>(10).fill(""), "Samira", "A-NOTE-CANARY", "A-TRK-CANARY", "A-CARRIER-CANARY"],
        [idB, "", statusLabel("confirmed")],
      ];
      const called: string[] = [];
      client.setGapiDoubleForTests(async (call) => {
        called.push(call.path.split("?")[0] ?? "");
        return call.path.includes(":batchGet") ? json({ valueRanges: [{ values: [header] }, { values: rows }] }) : json({});
      });
      try {
        const before = await kit.snapshotA();
        // twice: the first read learns the header, the second also reads the optional cells
        const r1 = await push.pushStore(b, { maxCalls: 1, pullOnly: true, forcePull: true, trigger: "manual" });
        await push.pushStore(b, { maxCalls: 1, pullOnly: true, forcePull: true, trigger: "manual" });
        kit.check("sheets pull: B's pull read B's sheet and handled B's own order", r1.seen === 2 && applied.includes(idB), { r1, applied });
        kit.check("sheets pull: A's order named in B's sheet reaches no call and no write", !applied.includes(idA) && !evented.includes(idA) && (await kit.snapshotA()) === before, { applied, evented });
        kit.check("sheets pull: B's pull calls B's sheet only", called.length > 0 && called.every((p) => p.startsWith(`/${encodeURIComponent(sheetB.spreadsheetId)}/`)), called);
        const selected = await pull.selectPullOrders(b, [idA], new Set([idA]));
        kit.check("sheets pull: selectPullOrders under B's scope never returns A's order", selected.length === 0, selected);
        // decisions naming A's order, applied under B's scope: every write is whereStore, so none lands
        const src = { kind: "sheet" as const, ref: "row:2" };
        const forged: PullDecision[] = [
          { kind: "status", orderId: idA, row: 2, label: "cancelled", ext: { legacy: "cancelled" }, src },
          { kind: "label", orderId: idA, row: 2, sheetLabel: "cancelled" },
          { kind: "agent", orderId: idA, row: 2, label: "Samira", confirmedBy: null },
          { kind: "note", orderId: idA, row: 2, text: "A-NOTE-CANARY", cellHash: "0123456789abcdef" },
          { kind: "tracking", orderId: idA, row: 2, trackingRef: "A-TRK-CANARY", src },
          { kind: "carrier", orderId: idA, row: 2, carrierLabel: "A-CARRIER-CANARY" },
        ];
        const res = await pull.applyPullDecisions(b, forged, { agentLabels: {} });
        kit.check("sheets pull: decisions naming A's order under B's scope change nothing of A", res.pulled === 0 && (await kit.snapshotA()) === before, res);
      } finally {
        pull.setPullDoubleForTests(null);
        client.setGapiDoubleForTests(null);
        if (prevB) await db.update(orders).set({ sheetStatus: prevB.s, sheetLabel: prevB.l, sheetDirty: prevB.d }).where(byId(orders, b, idB));
      }
    },
  },
  {
    name: "capi: B's creation path, hook, purge and conversions change never read or change A's orders or pages",
    async run(kit) {
      const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
      const { orders } = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
      const { byId } = load<typeof import("@/lib/tenancy/sql")>("@/lib/tenancy/sql");
      const { setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
      const conversions = load<typeof import("@/lib/orders/conversions")>("@/lib/orders/conversions");
      const a = write(kit, "A");
      const b = write(kit, "B");
      const idA = kit.fx.A.order.main;
      const [rowA] = await db.select({ ctx: orders.capiCtx }).from(orders).where(byId(orders, a, idA));
      const prevCtx = rowA?.ctx ?? null;
      const enqueued: { storeId: string; keys: string[] }[] = [];
      conversions.setCapiDoubleForTests({
        enqueue: async (scope, items) => (enqueued.push({ storeId: scope === "platform" ? "platform" : scope.storeId, keys: items.map((i) => i.dedupeKey) }), { inserted: items.length, duplicates: 0 }),
        drainOutbox: async () => ({ ms: 0, claimed: 0, done: 0, retried: 0, dead: 0, more: false }),
        enqueueRenders: async (_s, ids) => ({ enqueued: ids === "all-live" ? 0 : ids.length }),
        appendOrderEvent: async () => ({ ok: true, id: 1 }),
      });
      try {
        // A's order carries a sealed context of A's
        const conv = { purchaseTrigger: "confirmed", pageOverrides: {}, customEvents: true, manualOrders: false } as const;
        await setStoreSetting(a, "conversions", conv as never, { kind: "system" } as never);
        await setStoreSetting(b, "conversions", conv as never, { kind: "system" } as never);
        const ctxA = conversions.sealCapiContext(a, {
          v: 1,
          pageId: kit.fx.A.page.live,
          source: "live",
          currency: "MAD",
          qty: 1,
          contentId: "A-CONTENT-CANARY",
          contentName: "A",
          country: "MA",
          client: { ip: "105.66.1.2", ua: null },
          sourceUrl: null,
          pixels: { meta: ["555555555555555"], tiktok: [] },
          itemsHash: "x",
        });
        await db.update(orders).set({ capiCtx: ctxA }).where(byId(orders, a, idA));
        const before = await kit.snapshotA();
        kit.check("capi: B never opens A's sealed context", conversions.openCapiContext(b, ctxA) === null);

        // B's creation path with A's order id: the order is not B's, so nothing is read, enqueued or sealed
        const conversion = {
          orderId: idA,
          eventId: idA,
          pageId: kit.fx.A.page.live,
          source: "live" as const,
          time: new Date(),
          value: 1,
          currency: "MAD",
          qty: 1,
          contentId: "x",
          contentName: "x",
          customer: { phone: "+212600000099", email: null, name: "B", city: null, country: "MA" },
          client: { ip: null, ua: null },
          sourceUrl: null,
          pixels: { meta: ["555555555555555"], tiktok: [] },
          risk: 0,
        };
        const created = await conversions.conversionsAtCreation(b, conversion);
        kit.check("capi: B's creation path with A's order id enqueues and seals nothing", created.enqueued === 0 && !created.sealed && enqueued.length === 0, { created, enqueued });

        // B's int.capi hook with A's order id: the read is B's, so A's order is absent; its context stays
        const snap = { id: idA, rev: 1, status: "confirmed", states: { confirm: "confirmed", ship: "delivered", money: "unpaid" }, isTest: false, customerId: null, assigneeId: null, cityKey: null, totalCents: 100 };
        const e = {
          on: "transition" as const,
          before: { ...snap, states: { confirm: "new", ship: "none", money: "unpaid" } },
          after: snap,
          moves: [
            { axis: "confirm" as const, from: "new" as const, to: "confirmed" as const },
            { axis: "ship" as const, from: "in_transit" as const, to: "delivered" as const },
          ],
          actor: { kind: "user" as const, userId: kit.fx.B.members.owner },
          source: "ui" as const,
        };
        const hooked = await db.transaction((tx) => conversions.enqueueTransitionConversions(b, e as never, tx));
        kit.check("capi: B's hook with A's order id enqueues nothing and clears nothing", hooked.enqueued === 0 && !hooked.cleared && enqueued.length === 0, hooked);

        // B's purge and B's conversions change
        const purged = await conversions.purgeCapiContexts(b, { now: Date.now() + 365 * 86_400_000 });
        const change = await conversions.applyConversionsChange(b, conv as never, { ...conv, purchaseTrigger: "order" } as never, { kind: "system" } as never);
        kit.check("capi: B's purge never clears A's contexts", (await db.select({ c: orders.capiCtx }).from(orders).where(byId(orders, a, idA)))[0]?.c === ctxA, purged);
        kit.check("capi: B's conversions change never lists A's pages", !change.pages.includes(kit.fx.A.page.live), change);
        kit.check("capi: A's rows are unchanged by every B call above", (await kit.snapshotA()) === before);
      } finally {
        conversions.setCapiDoubleForTests(null);
        await db.update(orders).set({ capiCtx: prevCtx }).where(byId(orders, a, idA));
      }
    },
  },
  {
    name: "capi: a capi item of B naming A's pixel id signs with B's token only; B replaying A's outbox id",
    async run(kit) {
      const { setStoreSetting } = load<typeof import("@/lib/settings")>("@/lib/settings");
      const handler = load<typeof import("@/lib/jobs/handlers/capi")>("@/lib/jobs/handlers/capi");
      const conversions = load<typeof import("@/lib/orders/conversions")>("@/lib/orders/conversions");
      const a = write(kit, "A");
      const b = write(kit, "B");
      const PIXEL = "666666666666666";
      const TOKEN_A = "EAAG-A-ONLY-TOKEN-CANARY";
      await setStoreSetting(a, "tracking_secrets", { metaTokens: { [PIXEL]: TOKEN_A } } as never, { kind: "system" } as never);
      await setStoreSetting(b, "tracking_secrets", { metaTokens: {} } as never, { kind: "system" } as never);
      conversions.setCapiDoubleForTests({ appendOrderEvent: async () => ({ ok: true, id: 1 }) });
      const realFetch = globalThis.fetch;
      const bodies: string[] = [];
      globalThis.fetch = (async (_u: string | URL, init?: RequestInit) => (bodies.push(String(init?.body ?? "")), json({ events_received: 1 }))) as typeof fetch;
      try {
        const time = new Date().toISOString();
        const conversion = {
          orderId: kit.fx.A.order.main,
          eventId: kit.fx.A.order.main,
          pageId: kit.fx.A.page.live,
          source: "live",
          time,
          value: 1,
          currency: "MAD",
          qty: 1,
          contentId: "x",
          contentName: "x",
          customer: { phone: "+212600000099", email: null, name: "B", city: null, country: "MA" },
          client: { ip: null, ua: null },
          sourceUrl: "https://b.example/",
          pixels: { meta: [PIXEL], tiktok: [] },
        };
        const item = {
          id: "01JQAAAAAAAAAAAAAAAAAAAAAA",
          storeId: kit.fx.B.id,
          kind: "capi" as const,
          topic: "Purchase",
          targetId: `meta:${PIXEL}`,
          dedupeKey: `capi:meta:${PIXEL}:${kit.fx.A.order.main}:Purchase`,
          payload: { platform: "meta", pixelId: PIXEL, event: "Purchase", eventId: kit.fx.A.order.main, eventTime: time, ctx: "created", conversion },
          attempts: 0,
          createdAt: new Date(),
        };
        const r = await handler.sendCapiItem(item);
        kit.check("capi handler: B's item naming A's pixel finds no token of B's: done, nothing sent, A's token never used", r.ok && bodies.length === 0, { r, n: bodies.length });
      } finally {
        globalThis.fetch = realFetch;
        conversions.setCapiDoubleForTests(null);
      }
      // OPE-§28.1: B replaying A's outbox id answers not_found; replay is P8's (the P0 stub until the P8 merge)
      kit.notApplicable("capi replay: B replaying A's outbox id → not_found", "P8's replay is the P0 stub until the P8 merge; step 8's replay action carries this case");
    },
  },
];

