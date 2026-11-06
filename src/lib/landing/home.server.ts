import "server-only";
/**
 * Set as home (P3 LANDING; landing.md LAN-§4, core §A.2): in `landing` mode the store's `/` is `stores.home_page_id`,
 * a **published landing** page of the store, or the branded "no page yet" page (null). Unpublishing the home page
 * hands the home to another live page the owner picks, or to the "no page yet" page they confirmed. In `store` and
 * `both` modes the storefront owns `/` and the row menu hides the action.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { whereStore } from "@/lib/tenancy/sql";
import type { StoreScope } from "@/lib/tenancy/types";

const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Can `id` be the store's home: a published landing page of the scope's store (another store's id: false). */
export async function canBeHome(scope: StoreScope, id: string): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  const [row] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(whereStore(pages, scope, and(eq(pages.id, id), eq(pages.status, "published"), eq(pages.kind, "landing"))))
    .limit(1);
  return !!row;
}
