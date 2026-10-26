"use server";
/**
 * Version history mutations of the store on screen: star, restore as the page's draft, duplicate as a new page. The
 * store's write ctx comes from the seam (the signed request path); the repositories audit. Another store's version
 * id answers like a missing one (ADM-20).
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { duplicateVersionAsPage, EditorError, restoreVersion, setVersionStarred } from "@/lib/admin-data/history";
import { revalidateStore } from "@/lib/admin-data/shell";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const VersionId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown version." });

export async function starVersionAction(id: string, starred: boolean): Promise<ActionResult<null>> {
  return storeAction("pages.write", async ({ scope, actor, store }) => {
    const versionId = VersionId.parse(id);
    const value = z.boolean().parse(starred);
    if (!(await setVersionStarred(scope, versionId, value, actor))) fail("This version no longer exists.");
    revalidateStore(store.handle, "/history");
    return null;
  });
}

export async function restoreVersionAction(id: string): Promise<ActionResult<{ pageId: string }>> {
  return storeAction("pages.write", async ({ scope, actor, user, store }) => {
    try {
      const res = await restoreVersion(scope, VersionId.parse(id), user, actor);
      revalidateStore(store.handle, "/history", "/pages");
      return res;
    } catch (err) {
      if (err instanceof EditorError) {
        return fail(err.code === "conflict" ? "This page changed a moment ago (it may be open in the builder). Try again." : err.message);
      }
      throw err;
    }
  });
}

export async function duplicateVersionAction(id: string): Promise<ActionResult<{ id: string; slug: string }>> {
  return storeAction("pages.write", async ({ scope, actor, store }) => {
    const res = (await duplicateVersionAsPage(scope, VersionId.parse(id), actor)) ?? fail("This version can't be copied (it no longer exists or can't be rendered).");
    revalidateStore(store.handle, "/history", "/pages");
    return res;
  });
}
