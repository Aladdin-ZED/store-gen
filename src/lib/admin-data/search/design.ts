import "server-only";
/**
 * ⌘K search provider of the design track (P6 DESIGN; design.md DES-§15.5, SP-1; docs/STORE-SAAS.md §I.3, §K.3; LAN
 * Q18). Imported by src/lib/admin-data/search/registry.ts. Pages by design tags: the store's own `chosen` and
 * `published` genome rows (one per page, newest first), matched on their chip labels in the viewer's locale (layout,
 * type pairing, colour strategy, photo treatment) and on the page name. ≤ 8 hits, one scoped query plus the viewer's
 * locale and the store's handle, inside the 120 ms provider budget. No customer data: a hit names a page of the store.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { designGenomes, pages, stores, users } from "@/lib/db/schema";
import { chipText, explainGenome } from "@/lib/design/explain";
import { unpackGenome } from "@/lib/design/genome";
import type { Locale } from "@/lib/page/schema";
import { whereStore } from "@/lib/tenancy/sql";
import { appHref } from "@/lib/urls";
import type { SearchHit, SearchProvider } from "./types";

const HITS_MAX = 8;
const ROWS_MAX = 120;

/** Case- and accent-insensitive text for matching (Arabic letters kept as they are, tatweel and marks dropped). */
export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟـ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const asLocale = (v: string | null | undefined): Locale => (v === "ar" || v === "fr" ? v : "en");

export async function searchDesign(scope: Parameters<SearchProvider["search"]>[0], q: string, viewer: Parameters<SearchProvider["search"]>[2]): Promise<SearchHit[]> {
  const needle = fold(q);
  if (needle.length < 2) return [];
  const [rows, [user], [store]] = await Promise.all([
    db
      .select({ pageId: designGenomes.pageId, genome: designGenomes.genome, name: pages.name })
      .from(designGenomes)
      .innerJoin(pages, and(eq(pages.id, designGenomes.pageId), eq(pages.storeId, designGenomes.storeId)))
      .where(whereStore(designGenomes, scope, eq(designGenomes.kind, "page"), inArray(designGenomes.source, ["chosen", "published"])))
      .orderBy(desc(designGenomes.createdAt), desc(designGenomes.id))
      .limit(ROWS_MAX),
    db.select({ locale: users.locale }).from(users).where(eq(users.id, viewer.userId)).limit(1),
    db.select({ handle: stores.handle }).from(stores).where(eq(stores.id, scope.storeId)).limit(1),
  ]);
  if (!store?.handle) return [];
  const locale = asLocale(user?.locale);
  const words = needle.split(" ");
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const r of rows) {
    if (!r.pageId || seen.has(r.pageId)) continue;
    seen.add(r.pageId);
    let chips: string[];
    try {
      chips = explainGenome(unpackGenome(r.genome), { locale }).chips.map((c) => chipText(c, locale));
    } catch {
      continue;
    }
    const hay = fold([r.name, ...chips].join(" "));
    if (!words.every((w) => hay.includes(w))) continue;
    hits.push({ id: r.pageId, kind: "page", title: r.name, subtitle: chips.join(" · "), href: appHref(store.handle, `/pages/${r.pageId}/edit`), group: "design.search.group" });
    if (hits.length >= HITS_MAX) break;
  }
  return hits;
}

export const provider: SearchProvider = {
  id: "design",
  kinds: ["page"],
  search: searchDesign,
};
