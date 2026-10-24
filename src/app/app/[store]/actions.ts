"use server";
/**
 * Shell-level server actions of a store's dashboard: the ⌘K search of the store on screen (ADM-02). The store
 * comes from the signed request path (the seam, D2), never from the browser.
 */
import { z } from "zod";
import { searchAdmin, type SearchHit } from "@/lib/admin-data/search";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const Query = z.string().trim().min(2).max(60);

export async function searchAction(q: string): Promise<ActionResult<SearchHit[]>> {
  return storeAction("store.read", async (ctx) => {
    const parsed = Query.safeParse(q);
    if (!parsed.success) return [];
    return searchAdmin(ctx.scope, ctx.store, parsed.data, { pages: ctx.can("pages.read"), orders: ctx.can("orders.read") });
  });
}
