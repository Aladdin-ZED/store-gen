/**
 * ⌘K search provider of the landing track (P3 LANDING, landing.md LAN-§23.9; core §I.3).
 * Extension file (docs/STORE-SAAS.md §I.3, §K.3; LAN Q18), created at P0 and imported by
 * src/lib/admin-data/search/registry.ts; the track never edits the registry.
 *
 * Kinds (wave 1): `wa-ref` (a typed `WA-XXXXXX` opens its intent), `lead` (phone digits or a name prefix) and `page`
 * (slug or title). Lead and ref hits come from the lead read repository (src/lib/leads/read.ts `searchLeads`), so they
 * are masked under impersonation (D70) and an agent finds only the leads they see. Pages are the store's own, archived
 * ones left out. Campaign and short-link kinds arrive with wave 2. Within the 120 ms budget of the registry.
 */
import { desc, like, ne, or } from "drizzle-orm";
import { likeEscape } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { searchLeads } from "@/lib/leads/read";
import { getStoreById } from "@/lib/tenancy/public";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";
import type { SearchHit, SearchProvider } from "./types";

const PAGE_LIMIT = 5;

async function pageHits(scope: StoreScope, q: string, handle: string): Promise<SearchHit[]> {
  if (q.length < 2) return [];
  const pattern = `%${likeEscape(q.toLowerCase())}%`;
  const rows = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, status: pages.status })
    .from(pages)
    .where(whereStore(pages, scope, ne(pages.status, "archived"), or(like(pages.slug, pattern), like(pages.name, `%${likeEscape(q)}%`))))
    .orderBy(desc(pages.updatedAt))
    .limit(PAGE_LIMIT);
  return rows.map((p) => ({ id: p.id, kind: "page", title: p.name, subtitle: `/${p.slug}`, href: `/app/${handle}/pages/${p.id}/edit`, group: "landing.search.group.pages" }));
}

export const provider: SearchProvider = {
  id: "landing",
  kinds: ["lead", "wa-ref", "page"],
  async search(scope, q, viewer) {
    const text = q.trim().slice(0, 80);
    if (!text) return [];
    const store = await getStoreById(scope.storeId);
    if (!store) return [];
    const [found, pagesFound] = await Promise.all([searchLeads(scope, text, viewer), pageHits(scope, text, store.handle)]);
    const leadHits: SearchHit[] = found.rows.map((l) => ({
      id: l.id,
      kind: found.byRef ? "wa-ref" : "lead",
      title: [l.ref, l.name ?? l.phone ?? ""].filter(Boolean).join(" · "),
      subtitle: [l.city, l.selection].filter(Boolean).join(" · ") || undefined,
      href: `/app/${store.handle}/leads?lead=${l.id}`,
      group: "landing.search.group.leads",
    }));
    return [...leadHits, ...pagesFound];
  },
};
