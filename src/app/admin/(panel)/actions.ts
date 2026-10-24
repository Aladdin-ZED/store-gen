"use server";
/**
 * Shell-level server actions (command palette search).
 */
import { z } from "zod";
import { AuthError, can, hasAdminAccess, requireUser } from "@/lib/auth";
import { searchAdmin, type SearchHit } from "@/lib/admin-data/search";

const Query = z.string().trim().min(2).max(60);

export async function searchAction(q: string): Promise<SearchHit[]> {
  try {
    // CCR r1.0-t2-8 (maintainer, until T4's conversion): requireUser() no longer implies the admin gate, and an action
    // is reachable by its id from any page, so the cross-store search checks the gate itself
    if (!(await hasAdminAccess())) return [];
    const user = await requireUser({ throwOnFail: true });
    const parsed = Query.safeParse(q);
    if (!parsed.success) return [];
    return await searchAdmin(parsed.data, { pages: can(user.role, "pages.read"), orders: can(user.role, "orders.read") });
  } catch (err) {
    if (err instanceof AuthError) return [];
    throw err;
  }
}
