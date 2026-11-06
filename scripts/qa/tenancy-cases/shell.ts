/**
 * Two-store attack cases of the shell track (P2 SHELL, platform.md).
 * Extension file (docs/STORE-SAAS.md §F.1, §J.2, §K.3; DES-R13), created empty at P0b (CCR X-1) and loaded by
 * scripts/qa/tenancy-check.ts (`test:tenancy`), which lists an empty `cases` as not applicable until the track merges.
 * `actions` holds the attack cases of P2's own store server actions (they join the harness's `ACTION_CASES`); P1 keeps
 * the PLA-§O.3 special cases, the shell's included, in `tenancy-cases/platform.ts`.
 *
 * Step p2-04 (reads and routes; TN-11, UX-02, SF-06). The harness already derives the new routes from the tree (every
 * attacker on A's handle gets the neutral 404, B's handle with A's ids answers like a missing id, the role matrix);
 * these cases add what only the shell knows:
 *   - the pulse of B for B's members: the frozen shape, B's own counters (the invite count is B's, an agent gets no
 *     invite key), the ETag round trip (`304`), and nothing of A;
 *   - the search of B: A's customer name, page name, order id, members' names and e-mails find nothing of A, on the
 *     route and in `searchStore`; an agent finds no member at all;
 *   - the dashboard panels of B carry nothing of A, the P0 stubs answer "unavailable" (never a made-up 0), and under
 *     A's impersonation scope the latest orders are masked (D70);
 *   - the review card, the preview links and the shell's invite count read B's own rows only;
 *   - a rename of B to A's handle is refused, and A's handle and rows are unchanged.
 *
 * Step p2-05 (server actions, PLA-§M.1). `actions` holds one attack case per P2 store action (the harness derives the
 * actions from the tree and fails on one without a case): B's members on B's path with A's records answer like
 * missing ones, A's path answers like an unknown handle, the role matrix, the impersonation refusal. The arguments
 * leave every store as the rest of the run reads it: the close names no store's handle, the rename the store's own,
 * the 2FA switch is turned off (already off), the notification ids are nobody's. Every write under a read key
 * (`store.read`, `pages.read`) is `write: false`: A's viewer (the member of both stores) holds the key, so the harness's
 * "A's viewer" step would pass the seam for real (a preview link, the recompute; and the seam's daily
 * `store_members.last_active_at` touch of that member, which the "A's rows unchanged" fingerprint counts), while it
 * checks nothing for a key the viewer holds; their impersonation refusal is proven by the special case below instead
 * (CCR r1-p2-4 §3c). Two special cases cover what the generic suite cannot:
 *   - the user actions of `src/app/app/actions.ts` (no store: the picker hint, the legal re-acceptance) and the
 *     account deletion: another store's id answers like an unknown one, nothing pending is accepted, a store id in
 *     the input is refused, and a staff session viewing A is refused without touching A;
 *   - every write P2 makes under a read key, called by staff viewing A: `impersonation_read_only`, one
 *     `platform.impersonation.write_refused` row each, A otherwise unchanged; and the 10-link cap of private previews.
 * App modules are loaded inside each case (the harness loads this file once its environment is in place).
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createRequire } from "node:module";
import type * as Compose from "@/app/api/app/[store]/pulse/compose";
import type * as Dashboard from "@/lib/admin-data/dashboard";
import type * as AddressData from "@/app/app/[store]/settings/address/data";
import type * as AuditData from "@/app/app/[store]/settings/audit/data";
import type * as PlanData from "@/app/app/[store]/settings/plan/data";
import type * as Search from "@/lib/admin-data/search";
import type * as Handles from "@/lib/tenancy/handles";
import type * as Seam from "@/lib/tenancy/seam";
import type * as ShellPulse from "@/lib/pulse/contributors/shell";
import type { StorePulse } from "@/lib/pulse/types";
import type { Fixtures, Outcome, RouteFile, StoreFx, TenancyCase, TenancyKit, TrackActionCase } from "../tenancy-check";

const nodeRequire = createRequire(__filename);
const load = <T>(id: string): T => nodeRequire(id) as T;
const route = (template: string): RouteFile => ({ file: `src/app${template}/route.ts`, template, methods: ["GET"] });
const PULSE = route("/api/app/[store]/pulse");
const SEARCH = route("/api/app/[store]/search");

/** A route answer's JSON body (null when it is not JSON). */
function bodyOf(o: { ok: boolean; value?: { body: string } }): unknown {
  if (!o.ok || !o.value) return null;
  try {
    return JSON.parse(o.value.body) as unknown;
  } catch {
    return null;
  }
}

/** The member ids of one fixture store. */
const memberIds = (kit: TenancyKit, key: "A" | "B") => new Set(Object.values(kit.fx[key].members));

async function pulseCase(kit: TenancyKit): Promise<void> {
  const { fx, check, ranReal, callRoute, leaks } = kit;
  // start from B's cold caches: the shell's invite count is kept 5 s, and the suites before this one wrote B's rows
  load<typeof import("@/lib/tenancy/cache")>("@/lib/tenancy/cache").invalidateStore(fx.B.id);
  const owner = await callRoute({ userId: fx.B.members.owner }, PULSE, "GET", { store: fx.B.handle }, {});
  if (!ranReal("pulse of B for B's owner", owner)) return;
  const body = bodyOf(owner as never) as StorePulse | null;
  check("pulse of B for B's owner: 200 with the frozen shape", owner.ok && owner.value!.status === 200 && body?.v === 1 && typeof body.unread === "number" && typeof body.counts === "object", owner.ok ? owner.value!.body.slice(0, 300) : owner.error);
  check("pulse of B for B's owner: nothing of A", leaks(owner.ok ? owner.value!.body : "").length === 0, leaks(owner.ok ? owner.value!.body : ""));
  const { pendingInviteCount } = load<typeof Dashboard>("@/lib/admin-data/dashboard");
  const ownB = await kit.call({ anonymous: true }, "/", () => pendingInviteCount(kit.scope("B")));
  // a contributor later than its 50 ms leaves its keys out (a loaded test machine): absent is allowed, a wrong number is not
  check("pulse of B: membersPendingInvites, when present, is B's own open-invite count", ownB.ok && (!body || !("membersPendingInvites" in body.counts) || body.counts.membersPendingInvites === ownB.value), { pulse: body?.counts, own: ownB.value });
  check("pulse of B: the store part is B's (status, review)", body?.store.status === fx.rows.B.status && typeof body?.store.review === "string", body?.store);
  check("pulse of B for B's owner: no impersonation countdown", body?.impersonation === null);

  // the ETag round trip: the same viewer's next poll of unchanged data is a 304 without a body
  if (body) {
    const { pulseEtag } = load<typeof Compose>("@/app/api/app/[store]/pulse/compose");
    // a late contributor changes the body once (its keys left out); the poller then holds the new ETag: up to 3 polls
    let last = body;
    let again = await callRoute({ userId: fx.B.members.owner }, PULSE, "GET", { store: fx.B.handle }, {}, { headers: { "if-none-match": pulseEtag(last) } });
    for (let i = 0; i < 2 && again.ok && again.value!.status === 200; i++) {
      last = (bodyOf(again as never) as StorePulse | null) ?? last;
      again = await callRoute({ userId: fx.B.members.owner }, PULSE, "GET", { store: fx.B.handle }, {}, { headers: { "if-none-match": pulseEtag(last) } });
    }
    check("pulse of B: the next poll with the body's ETag answers 304 without a body", again.ok && again.value!.status === 304 && again.value!.body === "", again.ok ? { status: again.value!.status, body: again.value!.body.slice(0, 120) } : again.error);
    const other = await callRoute({ userId: fx.B.members.agent }, PULSE, "GET", { store: fx.B.handle }, {}, { headers: { "if-none-match": pulseEtag(body) } });
    check("pulse of B: the owner's ETag is not the agent's (per-user parts)", other.ok && other.value!.status === 200, other.ok ? other.value!.status : other.error);
  }

  const agent = await callRoute({ userId: fx.B.members.agent }, PULSE, "GET", { store: fx.B.handle }, {});
  const agentBody = bodyOf(agent as never) as StorePulse | null;
  check("pulse of B for B's agent: no invite key (members.read), never a 0", agent.ok && agent.value!.status === 200 && agentBody !== null && !("membersPendingInvites" in agentBody.counts), agentBody?.counts);

  // A gains an invite: B's pulse count does not move (read past the 5 s cache: the repository directly)
  await kit.fresh.invite(fx.A);
  const ownB2 = await kit.call({ anonymous: true }, "/", () => pendingInviteCount(kit.scope("B")));
  check("a new invite of A leaves B's invite count unchanged", ownB.ok && ownB2.ok && ownB2.value === ownB.value, { before: ownB.value, after: ownB2.value });

  // the shell contributor itself for B's viewers: B's numbers only
  load("@/app/api/app/[store]/pulse/load"); // wires the contributor's database readers (the route loaded it already)
  const { contributor } = load<typeof ShellPulse>("@/lib/pulse/contributors/shell");
  const counts = await kit.call({ anonymous: true }, "/", () => contributor.contribute(kit.scope("B"), { userId: fx.B.members.owner, role: "owner" }));
  const c = counts.ok ? (counts.value as Record<string, number>) : null;
  check("the shell contributor for B: B's counters, nothing of A", !!c && leaks(c).length === 0 && typeof c.notificationsUnreadStore === "number", counts.ok ? counts.value : counts.error);
  check("the shell contributor for B's owner: the invite count is B's own", !!c && ownB2.ok && c.membersPendingInvites === ownB2.value, { contributor: c, own: ownB2.value });
}

async function searchCase(kit: TenancyKit): Promise<void> {
  const { fx, check, ranReal, callRoute, leaks } = kit;
  const queries = [fx.A.customer.name, fx.canaries.data[0]!, fx.A.order.main, "owner-a@tenancy", "Owner A", "%%", "__"];
  const aMembers = memberIds(kit, "A");
  for (const q of queries) {
    const r = await callRoute({ userId: fx.B.members.owner }, SEARCH, "GET", { store: fx.B.handle }, { query: { q } });
    const label = `search of B for "${q.slice(0, 14)}…"`;
    if (!ranReal(label, r)) continue;
    const raw = r.ok ? r.value!.body : "";
    const found = leaks(raw, { sent: q });
    check(`${label}: 200, nothing of A`, r.ok && r.value!.status === 200 && found.length === 0, found.length ? found : raw.slice(0, 300));
    check(`${label}: no member of A`, ![...aMembers].some((id) => raw.includes(id)));
  }
  // B's owner finds B's members (the positive control), B's agent finds no member at all (members.read)
  const own = await callRoute({ userId: fx.B.members.owner }, SEARCH, "GET", { store: fx.B.handle }, { query: { q: "tenancy.test" } });
  const ownBody = bodyOf(own as never) as Search.StoreSearchResult | null;
  const memberHits = ownBody?.groups.find((g) => g.id === "shell.cmdk.group.members")?.hits ?? [];
  const bMembers = memberIds(kit, "B");
  check("B's owner finds B's members, and only B's", memberHits.length > 0 && memberHits.every((h) => bMembers.has(h.id) && !aMembers.has(h.id)), memberHits);
  check("every hit of B's search links under /app/<B>", (ownBody?.groups ?? []).every((g) => g.hits.every((h) => h.href === `/app/${fx.B.handle}` || h.href.startsWith(`/app/${fx.B.handle}/`) || h.href.startsWith(`/app/${fx.B.handle}?`))));
  const agent = await callRoute({ userId: fx.B.members.agent }, SEARCH, "GET", { store: fx.B.handle }, { query: { q: "tenancy.test" } });
  const agentBody = bodyOf(agent as never) as Search.StoreSearchResult | null;
  check("B's agent finds no member (no members.read)", agent.ok && agent.value!.status === 200 && !(agentBody?.groups ?? []).some((g) => g.id === "shell.cmdk.group.members"), agentBody);
  const short = await callRoute({ userId: fx.B.members.owner }, SEARCH, "GET", { store: fx.B.handle }, { query: { q: "a" } });
  check("a one-character query is refused (400 invalid)", short.ok && short.value!.status === 400 && /invalid/.test(short.value!.body), short.ok ? short.value : short.error);

  // the repository: B's scope with every grant, A's canaries in the query
  const { searchStore } = load<typeof Search>("@/lib/admin-data/search");
  for (const q of queries) {
    const r = await kit.call({ anonymous: true }, "/", () => searchStore(kit.scope("B"), q, { userId: fx.B.members.owner, role: "owner", locale: "en", handle: fx.B.handle, can: () => true }));
    check(`searchStore(B, "${q.slice(0, 14)}…"): nothing of A`, r.ok && leaks(r.value, { sent: q }).length === 0 && ![...aMembers].some((id) => JSON.stringify(r.value).includes(id)), r.ok ? leaks(r.value, { sent: q }) : r.error);
  }
}

async function dashboardCase(kit: TenancyKit): Promise<void> {
  const { fx, check, leaks } = kit;
  const D = load<typeof Dashboard>("@/lib/admin-data/dashboard");
  const ctxB = { scope: kit.scope("B"), store: fx.rows.B, can: () => true, user: { id: fx.B.members.owner } as never, membership: { role: "owner" as const, status: "active" as const } };
  const panels = await kit.call({ anonymous: true }, "/", () => D.dashboardPanels(ctxB, "28d"));
  check("dashboardPanels(B): every panel settled, nothing of A", panels.ok && leaks(panels.value).length === 0, panels.ok ? leaks(panels.value) : panels.error);
  if (panels.ok) {
    const p = panels.value!;
    const ids = memberIds(kit, "A");
    check("dashboardPanels(B): no id of A's members", ![...ids].some((id) => JSON.stringify(p).includes(id)));
    // build note item 14: a P0 stub is "unavailable", never a made-up 0
    check("dashboardPanels(B): P4's and P5's stubs answer unavailable", !p.kpis.ok && p.kpis.reason === "unavailable" && !p.funnel.ok && !p.integrations.ok && p.integrations.reason === "unavailable", { kpis: p.kpis, integrations: p.integrations });
    check("dashboardPanels(B): the latest orders are B's own", p.latestOrders.ok && !p.latestOrders.data.some((o) => o.id === fx.A.order.main || o.id === fx.A.order.failed), p.latestOrders);
    check("dashboardPanels(B): the address is B's", p.address.ok && p.address.data.storeUrl.includes(fx.B.handle) && !p.address.data.storeUrl.includes(fx.A.handle), p.address);
  }
  // a viewer without orders.read_all does not get the customer rows at all (hidden, not empty)
  const viewerCtx = { ...ctxB, can: (perm: string) => perm === "store.read" || perm === "pages.read" };
  const narrow = await kit.call({ anonymous: true }, "/", () => D.dashboardPanels(viewerCtx as never, "7d"));
  check("dashboardPanels(B) for a viewer: the latest orders are hidden", narrow.ok && !narrow.value!.latestOrders.ok && narrow.value!.latestOrders.reason === "hidden", narrow.ok ? narrow.value!.latestOrders : narrow.error);
  // staff viewing A (D70): A's own dashboard, customer fields masked
  const imp = { scope: kit.scope("A", "impersonation"), store: fx.rows.A, can: () => true };
  const masked = await kit.call({ anonymous: true }, "/", () => D.dashboardPanels(imp, "7d"));
  check("dashboardPanels(A, impersonation): no customer canary (masked)", masked.ok && leaks(masked.value, { only: ["customer"] }).length === 0, masked.ok ? leaks(masked.value, { only: ["customer"] }) : masked.error);
  check("dashboardPanels(A, impersonation): A's orders are there, masked", masked.ok && masked.value!.latestOrders.ok && masked.value!.latestOrders.data.length > 0, masked.ok ? masked.value!.latestOrders : null);

  for (const [name, fn] of [
    ["reviewState", () => D.reviewState(kit.scope("B"))],
    ["activePreviewLinks", () => D.activePreviewLinks(kit.scope("B"))],
    ["storeStatusOf", () => D.storeStatusOf(kit.scope("B"))],
    ["pendingInviteCount", () => D.pendingInviteCount(kit.scope("B"))],
    ["memberFacts", () => D.memberFacts(kit.scope("B"))],
  ] as const) {
    const r = await kit.call({ anonymous: true }, "/", fn as () => Promise<unknown>);
    check(`${name}(B): B's rows only, nothing of A`, r.ok && leaks(r.value).length === 0, r.ok ? leaks(r.value) : r.error);
  }
  const links = await kit.call({ anonymous: true }, "/", () => D.activePreviewLinks(kit.scope("B")));
  check("activePreviewLinks(B): never a page of A", links.ok && (links.value as Dashboard.PreviewLink[]).every((l) => ![fx.A.page.live, fx.A.page.draft, fx.A.page.archived].includes(l.pageId)));

  // p2-09: the streamed loaders, the store's real order count (zero-data brief, score policy) and the review card's facts
  const loaders = await kit.call({ anonymous: true }, "/", async () => {
    const { panels: l } = D.dashboardLoaders(ctxB, "7d");
    const [ever, policy, address, health] = await Promise.all([l.ordersEver, l.healthPolicy, l.address, l.health]);
    return { ever, policy, address, health };
  });
  check("dashboardLoaders(B): every streamed panel settled, nothing of A", loaders.ok && leaks(loaders.value).length === 0, loaders.ok ? leaks(loaders.value) : loaders.error);
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const { and, count, eq, ne } = load<typeof import("drizzle-orm")>("drizzle-orm");
  const realOf = async (storeId: string) =>
    Number((await db.select({ n: count() }).from(S.orders).where(and(eq(S.orders.storeId, storeId), eq(S.orders.isTest, false), ne(S.orders.sheetStatus, "disabled"))))[0]?.n ?? 0);
  const [mineB, mineA] = await Promise.all([realOf(fx.B.id), realOf(fx.A.id)]);
  const ever = await kit.call({ anonymous: true }, "/", () => D.realOrderCount(kit.scope("B")));
  check("realOrderCount(B): B's real orders, none of A's", ever.ok && ever.value === mineB && (mineA === 0 || ever.value !== mineA + mineB), { got: ever.ok ? ever.value : ever.error, mineB, mineA });
  const facts = await kit.call({ anonymous: true }, "/", () => D.reviewFacts(kit.scope("B"), { submitted: false, pages: true }));
  check(
    "reviewFacts(B): B's pages only, the pending media cap",
    facts.ok && leaks(facts.value).length === 0 && facts.value!.pages.every((pg) => ![fx.A.page.live, fx.A.page.draft, fx.A.page.archived].includes(pg.id)) && facts.value!.mediaMb > 0,
    facts.ok ? facts.value : facts.error,
  );
}

async function renameCase(kit: TenancyKit): Promise<void> {
  const { fx, check } = kit;
  const before = await kit.snapshotA();
  const r = await kit.call({ userId: fx.B.members.owner }, `/app/${fx.B.handle}/settings/address`, async () => {
    const { requireStoreMember } = load<typeof Seam>("@/lib/tenancy/seam");
    const { renameHandle } = load<typeof Handles>("@/lib/tenancy/handles");
    const ctx = await requireStoreMember({ handle: fx.B.handle, throwOnFail: true });
    return renameHandle(ctx, fx.A.handle);
  });
  const code = !r.ok ? (r.error as { code?: string } | undefined)?.code : "renamed";
  // B is new, so the 30-day rule answers first; either way A's handle never moves to B
  check("renameHandle(B → A's handle) is refused", !r.ok && (code === "unavailable" || code === "too_soon"), { code });
  const rowB = await kit.call({ anonymous: true }, "/", async () => load<typeof import("@/lib/tenancy/public")>("@/lib/tenancy/public").resolveStoreByHandle(fx.A.handle));
  check("A's handle still resolves to A", rowB.ok && (rowB.value as { id: string } | null)?.id === fx.A.id);
  check("A's rows are unchanged by the rename attempt", (await kit.snapshotA()) === before);
  // the agent of B (no domains.manage) is refused before anything is read
  const agent = await kit.call({ userId: fx.B.members.agent }, `/app/${fx.B.handle}/settings/address`, async () => {
    const { requireStoreMember } = load<typeof Seam>("@/lib/tenancy/seam");
    const { renameHandle } = load<typeof Handles>("@/lib/tenancy/handles");
    return renameHandle(await requireStoreMember({ handle: fx.B.handle, throwOnFail: true }), `b-${Date.now().toString(36)}`);
  });
  check("renameHandle by B's agent is forbidden", !agent.ok && (agent.error as { code?: string } | undefined)?.code === "forbidden", agent.ok ? "renamed" : (agent.error as { code?: string }).code);
}

/* ------------------------------------------------------------------ */
/* step p2-05: the server actions                                      */
/* ------------------------------------------------------------------ */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const newId = (): string => load<typeof import("@/lib/db/ids")>("@/lib/db/ids").newId();
/** A record made for the attack: one of A's is a canary with a same-format ghost (what `fresh` does for its own). */
function register(fx: Fixtures, store: StoreFx, id: string): string {
  if (store.key !== "A") return id;
  fx.canaries.ids.push(id);
  fx.ghosts.set(id, `01${Array.from({ length: 24 }, () => CROCKFORD[randomInt(CROCKFORD.length)]).join("")}`);
  return id;
}

/** A seller's private preview link of the store's draft (the row T3's mintPreviewToken writes). */
async function previewTokenOf(fx: Fixtures, store: StoreFx): Promise<string> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const id = newId();
  await db.insert(S.previewTokens).values({ id, storeId: store.id, pageId: store.page.draft, audience: "seller", createdBy: store.members.owner, expiresAt: new Date(Date.now() + 72 * 3_600_000) });
  return register(fx, store, id);
}

/** An open request of the store to staff (kind go_live, the row P1's createStoreRequest writes). */
async function requestOf(fx: Fixtures, store: StoreFx): Promise<string> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const id = newId();
  const signals = { v: 1, flags: [], band: "review", inputs: {}, cluster: { users: 0, banned: 0, kinds: [] }, partial: false, ms: 0 };
  await db.insert(S.signupReviews).values({ id, storeId: store.id, userId: store.members.owner, kind: "go_live", score: 0, signals: signals as never, band: "review", request: { kind: "go_live", message: null } });
  return register(fx, store, id);
}

/** The details step: the argan fixture's own prices (149.00, before 199.00), so the directions below carry them. */
const details = (store: StoreFx) => ({ category: "skincare", productName: "Huile d'argan", priceMinor: 14_900, compareAtMinor: 19_900, fact: "Flacon de 100 ml", assetIds: [store.asset.photo] });
/** "Use this design" with the store's fixture document (its photo, the typed prices). */
async function direction(store: StoreFx, fresh: Parameters<TrackActionCase["own"]>[1]) {
  const doc = (await fresh.doc(store)) as { theme: { archetype: string } };
  return [{ directionKey: doc.theme.archetype, directions: [{ id: doc.theme.archetype, label: "Direction 1", doc }] }];
}
/** An operation id of a step-up action (a new one per call: the replays never spend the owner's). */
const opId = () => `op-${randomBytes(9).toString("base64url")}`;
/** No notification has this id: marking it reads nothing and writes nothing (the role matrix runs as A's members too). */
const NO_NOTIFICATION = [Number.MAX_SAFE_INTEGER - 7];

const REVIEW = "src/app/app/[store]/review-actions.ts";
const HEALTH = "src/app/app/[store]/health-actions.ts";
const NOTIFY = "src/app/app/[store]/notifications/actions.ts";
const WELCOME = "src/app/app/[store]/welcome/actions.ts";
const GENERAL = "src/app/app/[store]/settings/general/actions.ts";
const ADDRESS = "src/app/app/[store]/settings/address/actions.ts";
const SECURITY = "src/app/app/[store]/settings/security/actions.ts";
const PLAN = "src/app/app/[store]/settings/plan/actions.ts";
const DANGER = "src/app/app/[store]/settings/danger/actions.ts";

export const actions: TrackActionCase[] = [
  // the In-review card (store.read + owner): both fixture stores are active, so the body answers review_closed
  { file: REVIEW, name: "submitForReviewAction", area: "settings", path: "", permission: ["store.read"], write: false, victim: () => [{ sells: "Huile d'argan", link: "instagram.com/atlas", whatsapp: "+212612345678" }], own: () => [{ sells: "Linge de maison", link: null, whatsapp: null }] },
  { file: REVIEW, name: "answerReviewQuestionAction", area: "settings", path: "", permission: ["store.read"], write: false, victim: () => [{ answer: "Nous vendons de l'huile d'argan." }], own: () => [{ answer: "Du linge de maison." }] },
  { file: REVIEW, name: "submitAppealAction", area: "settings", path: "", permission: ["store.read"], write: false, victim: () => [{ message: "Merci de revoir la décision." }], own: () => [{ message: "Merci de revoir." }] },
  // private preview links (pages.read): A's draft is a missing page in B; A's viewer may mint in A, hence write: false
  { file: REVIEW, name: "mintPreviewLinkAction", area: "pages", path: "/pages", permission: ["pages.read"], write: false, victim: (fx) => [{ pageId: fx.A.page.draft }], own: (fx) => [{ pageId: fx.B.page.draft }] },
  { file: REVIEW, name: "revokePreviewLinkAction", area: "pages", path: "/pages", permission: ["pages.read"], write: false, victim: async (fx) => [{ tokenId: await previewTokenOf(fx, fx.A) }], own: async (fx) => [{ tokenId: await previewTokenOf(fx, fx.B) }] },
  // Store Health (P1's snooze stubs answer unavailable until P1 merges)
  { file: HEALTH, name: "snoozeHealthIssueAction", area: "settings", path: "", permission: ["health.snooze"], write: true, victim: () => [{ issueId: "landing:no_live_page" }], own: () => [{ issueId: "shell:setup_whatsapp" }] },
  { file: HEALTH, name: "unsnoozeHealthIssueAction", area: "settings", path: "", permission: ["health.snooze"], write: true, victim: () => [{ issueId: "landing:no_live_page" }], own: () => [{ issueId: "shell:setup_whatsapp" }] },
  // a read key that marks the store dirty: A's viewer may recompute A, hence write: false (the special case covers it)
  { file: HEALTH, name: "recomputeHealthAction", area: "settings", path: "", permission: ["store.read"], write: false, victim: () => [], own: () => [] },
  { file: NOTIFY, name: "markNotificationsReadAction", area: "settings", path: "/notifications", permission: ["store.read"], write: false, victim: () => [NO_NOTIFICATION], own: () => [NO_NOTIFICATION] },
  // step p2-07: the bell's read (no argument; the reader is the seam's member of the path's store, so A's rows never answer on B's path)
  { file: NOTIFY, name: "bellNotificationsAction", area: "settings", path: "", permission: ["store.read"], write: false, victim: () => [], own: () => [] },
  // onboarding: A's photo and A's document are missing ones in B
  { file: WELCOME, name: "saveOnboardingDetailsAction", area: "generate", path: "/welcome", permission: ["pages.write"], write: true, victim: (fx) => [details(fx.A)], own: (fx) => [details(fx.B)] },
  { file: WELCOME, name: "useDirectionAction", area: "generate", path: "/welcome", permission: ["pages.write", "ai.use"], write: true, victim: (fx, fresh) => direction(fx.A, fresh), own: (fx, fresh) => direction(fx.B, fresh) },
  { file: WELCOME, name: "reportRevealAction", area: "generate", path: "/welcome", permission: ["store.read"], write: false, victim: () => [{ paintedAt: new Date().toISOString() }], own: () => [{ paintedAt: new Date().toISOString() }] },
  { file: WELCOME, name: "saveOnboardingContactAction", area: "settings", path: "/welcome", permission: ["settings.write"], write: true, victim: () => [{ whatsapp: "+212 6 12 34 56 78" }], own: () => [{ whatsapp: "+212698765432" }] },
  { file: WELCOME, name: "skipOnboardingAction", area: "generate", path: "/welcome", permission: ["store.read"], write: false, victim: () => [], own: () => [] },
  // settings: every argument leaves the store as it was (its own locale, mode and handle; 2FA off)
  { file: GENERAL, name: "saveGeneralAction", area: "settings", path: "/settings/general", permission: ["settings.write"], write: true, victim: (fx) => [{ defaultLocale: fx.rows.A.defaultLocale }], own: (fx) => [{ defaultLocale: fx.rows.B.defaultLocale }] },
  { file: GENERAL, name: "modeSwitchPlanAction", area: "settings", path: "/settings/general", permission: ["store.mode"], write: false, victim: () => [], own: () => [] },
  { file: GENERAL, name: "setStoreModeAction", area: "settings", path: "/settings/general", permission: ["store.mode"], write: true, victim: () => [{ mode: "landing" }], own: () => [{ mode: "landing" }] },
  { file: ADDRESS, name: "renameHandleAction", area: "settings", path: "/settings/address", permission: ["domains.manage"], write: true, victim: (fx) => [{ handle: fx.A.handle }], own: (fx) => [{ handle: fx.B.handle }] },
  { file: SECURITY, name: "setRequireMember2faAction", area: "settings", path: "/settings/security", permission: ["security.write"], write: true, victim: () => [{ on: false }], own: () => [{ on: false }] },
  // requests to staff (P1's stubs answer unavailable until P1 merges); A's open request is a missing one in B
  { file: PLAN, name: "createStoreRequestAction", area: "settings", path: "/settings/plan", permission: ["billing.manage"], write: true, victim: () => [{ kind: "go_live", message: "Prêt à vendre." }], own: () => [{ kind: "go_live", message: null }] },
  { file: PLAN, name: "withdrawStoreRequestAction", area: "settings", path: "/settings/plan", permission: ["billing.manage"], write: true, victim: async (fx) => [{ requestId: await requestOf(fx, fx.A) }], own: async (fx) => [{ requestId: await requestOf(fx, fx.B) }] },
  // the danger zone: the close names no store's handle (a typed-handle refusal is the body's answer), the reopen of an
  // active store is refused by T1's rule, the leave acts on the caller's own membership
  { file: DANGER, name: "requestStoreExportAction", area: "exports", path: "/settings/danger", permission: ["store.export"], write: true, victim: () => [{ opId: opId() }], own: () => [{ opId: opId() }] },
  { file: DANGER, name: "closeOwnStoreAction", area: "settings", path: "/settings/danger", permission: ["store.close"], write: true, victim: () => [{ confirm: "not-this-store", opId: opId() }], own: () => [{ confirm: "not-this-store", opId: opId() }] },
  { file: DANGER, name: "reopenOwnStoreAction", area: "settings", path: "/settings/danger", permission: ["store.read", "store.close"], write: false, victim: () => [], own: () => [] },
  { file: DANGER, name: "leaveStoreAction", area: "team", path: "/settings/danger", permission: ["store.read"], write: true, victim: () => [], own: () => [], self: true },
];

/** An action's refusal code (`{ ok: false, error }`), "threw", or null when it answered `ok: true`. */
function codeOf(o: Outcome): string | null {
  if (!o.ok) return "threw";
  const v = o.value as { ok?: boolean; error?: unknown } | null;
  return v && typeof v === "object" && v.ok === false ? String(v.error) : null;
}

/** A staff session viewing `store` (T2's seam, a real session row), as the harness's impersonation suite starts one. */
async function viewAs(kit: TenancyKit, store: StoreFx): Promise<string | null> {
  const { db } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const S = load<typeof import("@/lib/db/schema")>("@/lib/db/schema");
  const token = randomBytes(32).toString("base64url");
  await db.insert(S.sessions).values({ id: createHash("sha256").update(token, "utf8").digest("hex"), userId: kit.fx.staff.id, mfaPassed: true, expiresAt: new Date(Date.now() + 3_600_000), stepUpAt: new Date() });
  const r = await kit.call({ sessionToken: token }, "/admin", async () => {
    const { requirePlatform } = load<typeof import("@/lib/platform/seam")>("@/lib/platform/seam");
    const { startImpersonation } = load<typeof import("@/lib/platform/impersonation")>("@/lib/platform/impersonation");
    const ctx = await requirePlatform({ permission: "stores.impersonate", throwOnFail: true });
    return startImpersonation(ctx, { storeId: store.id, reason: "ticket", ticketRef: "TENANCY-SHELL", minutes: 15 });
  });
  if (!kit.ranReal(`staff starts a view of ${store.key} (shell cases)`, r)) return null;
  kit.check(`staff starts a view of ${store.key} (shell cases)`, r.ok, r.error);
  return r.ok ? token : null;
}

/** The store's audit rows after `afterId` (id, action, user). */
async function auditAfter(storeId: string, afterId: number): Promise<{ id: number; action: string; user_id: string | null }[]> {
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const [rows] = (await pool().query("SELECT id, action, user_id FROM audit_log WHERE store_id = ? AND id > ? ORDER BY id", [storeId, afterId])) as unknown as [{ id: number; action: string; user_id: string | null }[]];
  return rows;
}
/**
 * A fingerprint of the store's rows without its audit log (the harness's `snapshot`, minus `audit_log`): what a
 * refused write may add is its audit row only, which the caller counts separately.
 */
async function rowsSansAudit(storeId: string): Promise<string> {
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const p = pool();
  const [tables] = (await p.query("SELECT TABLE_NAME AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'store_id' AND TABLE_NAME <> 'audit_log' ORDER BY TABLE_NAME")) as unknown as [{ t: string }[]];
  const h = createHash("sha256");
  for (const { t } of tables) {
    const [rows] = (await p.query("SELECT * FROM ?? WHERE store_id = ?", [t, storeId])) as unknown as [unknown[]];
    h.update(`${t}:${rows.map((r) => JSON.stringify(r)).sort().join("\n")}\n`);
  }
  const [store] = (await p.query("SELECT * FROM stores WHERE id = ?", [storeId])) as unknown as [unknown[]];
  const [buckets] = (await p.query("SELECT bucket FROM rate_limits WHERE bucket LIKE ? ORDER BY bucket", [`%${storeId}%`])) as unknown as [unknown[]];
  return h.update(JSON.stringify(store)).update(JSON.stringify(buckets)).digest("hex");
}

async function auditTop(storeId: string | null): Promise<number> {
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const [rows] = (await pool().query(storeId ? "SELECT COALESCE(MAX(id), 0) AS top FROM audit_log WHERE store_id = ?" : "SELECT COALESCE(MAX(id), 0) AS top FROM audit_log", storeId ? [storeId] : [])) as unknown as [{ top: number }[]];
  return Number(rows[0]!.top);
}

/** `src/app/app/actions.ts` (userAction, no store) and the account deletion: nothing of A, nothing under a support view. */
async function userActionsCase(kit: TenancyKit): Promise<void> {
  const { fx, check, call, ranReal } = kit;
  const APP = load<typeof import("@/app/app/actions")>("@/app/app/actions");
  const ACC = load<typeof import("@/app/app/account/actions")>("@/app/app/account/actions");
  const { pool } = load<typeof import("@/lib/db/client")>("@/lib/db/client");
  const sessionId = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
  const lastStore = async (token: string) => {
    const [rows] = (await pool().query("SELECT last_store_id FROM sessions WHERE id = ?", [sessionId(token)])) as unknown as [{ last_store_id: string | null }[]];
    return rows[0]?.last_store_id ?? null;
  };
  const before = await kit.snapshotA();
  const asB = { sessionToken: fx.B.ownerToken };
  const ghostStore = `01${Array.from({ length: 24 }, () => CROCKFORD[randomInt(CROCKFORD.length)]).join("")}`;

  // the picker hint: A is not B's owner's store (the answer of an unknown id, nothing remembered); B is
  const onA = await call(asB, "/app", () => APP.setLastStoreAction(fx.A.id));
  const onGhost = await call(asB, "/app", () => APP.setLastStoreAction(ghostStore));
  if (ranReal("setLastStoreAction(A) as B's owner", onA, onGhost)) {
    check("setLastStoreAction(A's id) as B's owner: not_found, as an unknown id", codeOf(onA) === "not_found" && codeOf(onGhost) === "not_found", { onA: onA.value, onGhost: onGhost.value });
    check("…nothing remembered for B's owner", (await lastStore(fx.B.ownerToken)) !== fx.A.id);
  }
  const own = await call(asB, "/app", () => APP.setLastStoreAction(fx.B.id));
  if (ranReal("setLastStoreAction(B) as B's owner", own)) check("setLastStoreAction(B's id) as B's owner: remembered", codeOf(own) === null && (await lastStore(fx.B.ownerToken)) === fx.B.id, own.value);
  const junk = await call(asB, "/app", () => APP.setLastStoreAction({ storeId: fx.A.id }));
  check("setLastStoreAction with a non-id: invalid", codeOf(junk) === "invalid", junk.value);

  // the re-acceptance: only documents pending for this user (none before P1's publisher exists)
  const topAll = await auditTop(null);
  const legal = await call(asB, "/app", () => APP.acceptLegalAction({ documentIds: [newId()] }));
  if (ranReal("acceptLegalAction as B's owner", legal)) check("acceptLegalAction of a document not pending: not_found, nothing recorded", codeOf(legal) === "not_found", legal.value);
  const extra = await call(asB, "/app", () => APP.acceptLegalAction({ documentIds: [newId()], storeId: fx.A.id }));
  check("acceptLegalAction with a store id in its input: invalid (strict schema)", codeOf(extra) === "invalid", extra.value);
  const [accepted] = (await pool().query("SELECT COUNT(*) AS n FROM audit_log WHERE id > ? AND action = 'auth.legal.accepted'", [topAll])) as unknown as [{ n: number }[]];
  check("…no auth.legal.accepted row", Number(accepted[0]!.n) === 0);

  // the profile's language: the enum only
  const zz = await call(asB, "/app/account", () => ACC.updateProfileAction({ name: "Owner B", locale: "zz" }));
  check("updateProfileAction with locale 'zz': invalid", codeOf(zz) === "invalid", zz.value);

  check("A's rows unchanged by B's owner's user actions", (await kit.snapshotA()) === before);

  // a staff session viewing A: every user action refused (audited without a store), A unchanged
  const token = await viewAs(kit, fx.A);
  if (token) {
    const view = { sessionToken: token };
    const viewed = await kit.snapshotA();
    const topA = await auditTop(fx.A.id);
    for (const [name, run] of [
      ["setLastStoreAction", () => APP.setLastStoreAction(fx.A.id)],
      ["acceptLegalAction", () => APP.acceptLegalAction({ documentIds: [newId()] })],
      ["deleteMyAccountAction", () => ACC.deleteMyAccountAction({ confirm: "delete", expected: "delete" })],
    ] as const) {
      const r = await call(view, `/app/${fx.A.handle}`, run as () => Promise<unknown>);
      if (ranReal(`${name} · staff viewing A`, r)) check(`${name} · staff viewing A: impersonation_read_only`, codeOf(r) === "impersonation_read_only", r.value);
    }
    check("…no audit row in A from the account refusals (they name no store)", (await auditAfter(fx.A.id, topA)).length === 0);
    const [staff] = (await pool().query("SELECT disabled FROM users WHERE id = ?", [fx.staff.id])) as unknown as [{ disabled: number }[]];
    check("…the staff account still exists", Number(staff[0]?.disabled ?? 1) === 0);
    check("…A's rows unchanged by the refused account actions", (await kit.snapshotA()) === viewed);
  }
}

/** Every write P2 makes under a read key: staff viewing A is refused, audited once per call, A otherwise unchanged. */
async function readKeyWritesCase(kit: TenancyKit): Promise<void> {
  const { fx, check, call, ranReal } = kit;
  const R = load<typeof import("@/app/app/[store]/review-actions")>("@/app/app/[store]/review-actions");
  const H = load<typeof import("@/app/app/[store]/health-actions")>("@/app/app/[store]/health-actions");
  const N = load<typeof import("@/app/app/[store]/notifications/actions")>("@/app/app/[store]/notifications/actions");
  const W = load<typeof import("@/app/app/[store]/welcome/actions")>("@/app/app/[store]/welcome/actions");
  const D = load<typeof import("@/app/app/[store]/settings/danger/actions")>("@/app/app/[store]/settings/danger/actions");
  const T = load<typeof import("@/app/app/[store]/team/actions")>("@/app/app/[store]/team/actions");
  const tokenA = await previewTokenOf(fx, fx.A);
  const token = await viewAs(kit, fx.A);
  if (!token) return;
  const view = { sessionToken: token };
  const before = await rowsSansAudit(fx.A.id);
  const top = await auditTop(fx.A.id);
  const calls = [
    ["submitForReviewAction", () => R.submitForReviewAction({ sells: "x", link: null, whatsapp: null })],
    ["answerReviewQuestionAction", () => R.answerReviewQuestionAction({ answer: "x" })],
    ["submitAppealAction", () => R.submitAppealAction({ message: "x" })],
    ["mintPreviewLinkAction", () => R.mintPreviewLinkAction({ pageId: fx.A.page.draft })],
    ["revokePreviewLinkAction", () => R.revokePreviewLinkAction({ tokenId: tokenA })],
    ["recomputeHealthAction", () => H.recomputeHealthAction()],
    ["markNotificationsReadAction", () => N.markNotificationsReadAction("all")],
    ["reportRevealAction", () => W.reportRevealAction({ paintedAt: new Date().toISOString() })],
    ["skipOnboardingAction", () => W.skipOnboardingAction()],
    ["reopenOwnStoreAction", () => D.reopenOwnStoreAction()],
    ["leaveStoreAction (danger)", () => D.leaveStoreAction()],
    ["leaveStoreAction (team)", () => T.leaveStoreAction()],
  ] as const;
  let refused = 0;
  for (const [name, run] of calls) {
    const r = await call(view, `/app/${fx.A.handle}`, run as () => Promise<unknown>);
    if (!ranReal(`${name} · staff viewing A`, r)) continue;
    const ok = codeOf(r) === "impersonation_read_only";
    if (ok) refused++;
    check(`${name} · staff viewing A: impersonation_read_only (a write under a read key)`, ok, r.value);
  }
  const rows = await auditAfter(fx.A.id, top);
  check(
    `…A's audit gained one write_refused row of the staff member per call (${refused})`,
    rows.length === refused && rows.every((r) => r.action === "platform.impersonation.write_refused" && r.user_id === fx.staff.id),
    rows.slice(0, 6),
  );
  check("…A's rows otherwise unchanged (the preview link still open, no recompute bucket, no read mark)", (await rowsSansAudit(fx.A.id)) === before);

  // the 10-link cap of private previews (PLA-§L): B's owner mints until refused, revokes one, mints again
  const B = { userId: fx.B.members.owner };
  const path = `/app/${fx.B.handle}/pages`;
  const { activePreviewLinks } = load<typeof Dashboard>("@/lib/admin-data/dashboard");
  const active = await call({ anonymous: true }, "/", () => activePreviewLinks(kit.scope("B")));
  const start = active.ok ? (active.value as unknown[]).length : 0;
  let minted: string[] = [];
  let capped: Outcome | null = null;
  for (let i = start; i <= 10; i++) {
    const r = await call(B, path, () => R.mintPreviewLinkAction({ pageId: fx.B.page.draft }));
    if (codeOf(r) === null) minted = [...minted, ((r.value as { data: { tokenId: string } }).data.tokenId)];
    else {
      capped = r;
      break;
    }
  }
  check("the 11th active preview link of a store is refused (preview_links_max)", capped !== null && codeOf(capped) === "preview_links_max", { start, minted: minted.length, capped: capped?.value });
  const victim = minted[0];
  if (victim) {
    const revoked = await call(B, path, () => R.revokePreviewLinkAction({ tokenId: victim }));
    const again = await call(B, path, () => R.mintPreviewLinkAction({ pageId: fx.B.page.draft }));
    check("…after a revoke, one more link is minted", codeOf(revoked) === null && codeOf(again) === null, { revoked: revoked.value, again: again.value });
    const twice = await call(B, path, () => R.revokePreviewLinkAction({ tokenId: victim }));
    check("…a revoked link revoked again answers not_found", codeOf(twice) === "not_found", twice.value);
  }
}
/** p2-10: the settings pages' reads (plan, address, audit) answer the scope's own store only. */
async function settingsReadsCase(kit: TenancyKit): Promise<void> {
  const { fx, check, leaks } = kit;
  const Plan = load<typeof PlanData>("@/app/app/[store]/settings/plan/data");
  const Address = load<typeof AddressData>("@/app/app/[store]/settings/address/data");
  const Audit = load<typeof AuditData>("@/app/app/[store]/settings/audit/data");
  const D = load<typeof Dashboard>("@/lib/admin-data/dashboard");
  const scopeB = kit.scope("B");
  const plan = await kit.call({ anonymous: true }, "/settings/plan", () => Plan.planFacts(scopeB, fx.rows.B));
  check("planFacts(B): nothing of A", plan.ok && leaks(plan.value).length === 0, plan.ok ? leaks(plan.value) : plan.error);
  const rename = await kit.call({ anonymous: true }, "/settings/address", () => Address.renameFacts(scopeB, new Date()));
  check("renameFacts(B): answers for B (store #1's grant only for store #1)", rename.ok && rename.value!.freeRename === false, rename.ok ? rename.value : rename.error);
  const renders = await kit.call({ anonymous: true }, "/settings/address", () => Address.addressRenders(scopeB));
  check("addressRenders(B): a count, 0 while P8's queue is a stub", renders.ok && typeof renders.value === "number", renders.ok ? renders.value : renders.error);
  const address = await kit.call({ anonymous: true }, "/settings/address", () => D.addressFacts(scopeB, fx.rows.B));
  check("addressFacts(B): B's address, never A's", address.ok && address.value!.storeUrl.includes(fx.B.handle) && !address.value!.storeUrl.includes(fx.A.handle), address.ok ? address.value : address.error);
  const ctxB = { scope: scopeB, store: fx.rows.B, can: () => true, user: { id: fx.B.members.owner } as never, membership: { role: "owner" as const, status: "active" as const } };
  const audit = await kit.call({ anonymous: true }, "/settings/audit", () => Audit.auditViewPage(ctxB as never, {}));
  check("auditViewPage(B): B's rows only, nothing of A", audit.ok && leaks(audit.value).length === 0, audit.ok ? leaks(audit.value) : audit.error);
  const filtered = await kit.call({ anonymous: true }, "/settings/audit", () => Audit.auditViewPage(ctxB as never, { actorKind: "platform", area: "platform", from: new Date(Date.now() - 86_400_000) }));
  check("auditViewPage(B) with filters: nothing of A", filtered.ok && leaks(filtered.value).length === 0, filtered.ok ? leaks(filtered.value) : filtered.error);
}

export const cases: TenancyCase[] = [
  { name: "shell: the pulse (SF-06)", run: pulseCase },
  { name: "shell: the ⌘K search (UX-02)", run: searchCase },
  { name: "shell: the dashboard reads", run: dashboardCase },
  { name: "shell: the settings pages' reads (p2-10)", run: settingsReadsCase },
  { name: "shell: the handle rename", run: renameCase },
  { name: "shell: the user actions (no store)", run: userActionsCase },
  { name: "shell: writes under a read key, and the preview-link cap", run: readKeyWritesCase },
];

