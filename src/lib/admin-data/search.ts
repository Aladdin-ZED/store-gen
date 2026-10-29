import "server-only";
/**
 * The store's ⌘K search (P2 SHELL; platform.md PLA-§22.13, UX-02; docs/STORE-SAAS.md §I.3, ADM-02): what
 * `GET /api/app/<h>/search?q=` answers. One store, the one in the URL: every provider receives the store's scope and
 * the viewer, so a member of B never finds A's pages, orders or customers (the attack suite proves it).
 *
 *   const { groups, slow } = await searchStore(ctx.scope, q, await searchViewerOf(ctx));
 *
 * The providers are the tracks' (`src/lib/admin-data/search/<track>.ts`, registered at P0: P3 pages, `WA-` refs and
 * leads; P4 orders and customers, masked and agent-restricted; P6 design tags) plus the shell's own, here: the
 * settings sections the viewer may open and, with `members.read`, the team's members. The shell never searches
 * customer data. Each provider has `SEARCH_BUDGET_MS`; a later one is dropped and named in `slow`, never awaited
 * (`runSearchProviders`, the pure part beside the route, with the shell's matching). R1.0's cross-table LIKE search is
 * gone.
 */
import { flatHits, memberHits, runSearchProviders, settingHits, type SearchViewer, type StoreSearchResult } from "@/app/api/app/[store]/search/run";
import type { StorePermission } from "@/lib/auth/permissions";
import { viewerLocale } from "@/lib/auth/locale";
import { logError } from "@/lib/orders/log";
import { listMembersByScope } from "@/lib/tenancy/invites";
import type { StoreCtx, StoreRow, StoreScope } from "@/lib/tenancy/types";
import { appHref } from "@/lib/urls";
import { SEARCH_BUDGET_MS, SEARCH_PROVIDERS, type SearchHit, type SearchProvider } from "./search/registry";

export type { SearchHit } from "./search/types";
export type { SearchGroup, SearchViewer, SlowProvider, StoreSearchResult } from "@/app/api/app/[store]/search/run";

/** A member's search identity: their membership's role and grants, their language. */
export async function searchViewerOf(ctx: Pick<StoreCtx, "user" | "membership" | "store" | "can">): Promise<SearchViewer> {
  return { userId: ctx.user.id, role: ctx.membership.role, locale: await viewerLocale(ctx.user), handle: ctx.store.handle, can: (p) => ctx.can(p) };
}

/** The shell's provider for one viewer (it needs their grants and language, which the frozen provider viewer lacks). */
function shellProvider(viewer: SearchViewer): SearchProvider {
  return {
    id: "shell",
    kinds: ["setting", "member"],
    search: async (scope, q) => {
      const settings = settingHits(viewer, q);
      if (!viewer.can("members.read")) return settings;
      return [...settings, ...memberHits(await listMembersByScope(scope), viewer, q)];
    },
  };
}

/** Every provider for one store and query, in parallel within the budget; hits grouped for the palette. */
export async function searchStore(scope: StoreScope, q: string, viewer: SearchViewer, opts: { budgetMs?: number } = {}): Promise<StoreSearchResult> {
  const providers = [shellProvider(viewer), ...SEARCH_PROVIDERS];
  const { result, failures } = await runSearchProviders(providers, scope, q, { userId: viewer.userId, role: viewer.role }, { budgetMs: opts.budgetMs ?? SEARCH_BUDGET_MS, home: appHref(viewer.handle) });
  for (const f of failures) if (f.reason === "error") logError(`search:${f.id}`, f.detail ?? "error");
  return result;
}

/**
 * @deprecated R1.0's flat search, now `searchStore` with the least viewer (role "viewer", no member search). Kept only
 * because the maintainer's tenancy harness calls it (CCR r1-p2-3 moves the harness to `searchStore`).
 */
export async function searchAdmin(scope: StoreScope, store: Pick<StoreRow, "handle">, q: string, opts: { pages: boolean; orders: boolean }): Promise<SearchHit[]> {
  const grants = new Set<StorePermission>([...(opts.pages ? (["pages.read"] as const) : []), ...(opts.orders ? (["orders.read"] as const) : [])]);
  const viewer: SearchViewer = { userId: "", role: "viewer", locale: "en", handle: store.handle, can: (p) => grants.has(p) };
  return flatHits(await searchStore(scope, q, viewer));
}
