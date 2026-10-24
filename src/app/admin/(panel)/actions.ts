"use server";
/**
 * Shell-level server actions (command palette search of store #1, the legacy panel's store, §K.1 T4).
 */
import { z } from "zod";
import { legacyStoreCtx } from "@/lib/admin-data/legacy-store";
import { searchAdmin, type SearchHit } from "@/lib/admin-data/search";
import { AuthError, requireUser } from "@/lib/auth";
import { SeamError } from "@/lib/tenancy/seam";

const Query = z.string().trim().min(2).max(60);

export async function searchAction(q: string): Promise<SearchHit[]> {
  try {
    await requireUser({ throwOnFail: true });
    const parsed = Query.safeParse(q);
    if (!parsed.success) return [];
    const ctx = await legacyStoreCtx({ throwOnFail: true });
    return await searchAdmin(ctx.scope, parsed.data, { pages: ctx.can("pages.read"), orders: ctx.can("orders.read") });
  } catch (err) {
    if (err instanceof AuthError || err instanceof SeamError) return [];
    throw err;
  }
}
