"use server";
/**
 * Shell-level server actions of a store's dashboard: the ⌘K search of the store on screen (ADM-02, UX-02). The store
 * comes from the signed request path (the seam, D2), never from the browser. Until the palette's rework (p2-08) calls
 * `GET /api/app/<h>/search` itself, this action answers the same search as one flat list.
 */
import { flatHits, SearchQuery } from "@/app/api/app/[store]/search/run";
import { searchStore, searchViewerOf, type SearchHit } from "@/lib/admin-data/search";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

export async function searchAction(q: string): Promise<ActionResult<SearchHit[]>> {
  return storeAction("store.read", async (ctx) => {
    const parsed = SearchQuery.safeParse(q);
    if (!parsed.success) return [];
    return flatHits(await searchStore(ctx.scope, parsed.data, await searchViewerOf(ctx)));
  });
}
