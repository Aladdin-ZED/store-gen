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
 */
import { createRequire } from "node:module";
import type { TenancyCase, TenancyKit } from "../tenancy-check";
import type { WriteScope } from "@/lib/tenancy/types";

const nodeRequire = createRequire(__filename);
const load = <T>(id: string): T => nodeRequire(id) as T;

type Repo = typeof import("@/lib/integrations/whatsapp/templates.server");

/** A's own override of the confirm template: a canary body that must never reach B. */
const A_BODY = "Bonjour {customer_first_name}, A-ONLY-TEMPLATE-CANARY {order_id}.";
const A_PAGE_BODY = "Salam {customer_first_name}, A-PAGE-TEMPLATE-CANARY {order_id}.";
const A_DRAFT_BODY = "A-DRAFT-TEMPLATE-CANARY {order_id}";

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
];
