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
 * App modules are loaded inside each case (the harness loads this file once its environment is in place).
 */
import { createRequire } from "node:module";
import type * as Compose from "@/app/api/app/[store]/pulse/compose";
import type * as Dashboard from "@/lib/admin-data/dashboard";
import type * as Search from "@/lib/admin-data/search";
import type * as Handles from "@/lib/tenancy/handles";
import type * as Seam from "@/lib/tenancy/seam";
import type * as ShellPulse from "@/lib/pulse/contributors/shell";
import type { StorePulse } from "@/lib/pulse/types";
import type { RouteFile, TenancyCase, TenancyKit, TrackActionCase } from "../tenancy-check";

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

export const cases: TenancyCase[] = [
  { name: "shell: the pulse (SF-06)", run: pulseCase },
  { name: "shell: the ⌘K search (UX-02)", run: searchCase },
  { name: "shell: the dashboard reads", run: dashboardCase },
  { name: "shell: the handle rename", run: renameCase },
];

export const actions: TrackActionCase[] = [];
