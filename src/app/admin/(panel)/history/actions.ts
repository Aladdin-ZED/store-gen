"use server";
/**
 * Version history mutations of store #1 (the legacy panel, §K.1 T4): star, restore as the page's draft, duplicate as
 * a new page. The store's write ctx comes from the seam; the repositories audit.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, fail, type ActionResult } from "@/lib/admin-data/action";
import { duplicateVersionAsPage, EditorError, restoreVersion, setVersionStarred } from "@/lib/admin-data/history";
import { legacyWriteCtx } from "@/lib/admin-data/legacy-store";

const VersionId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown version." });

export async function starVersionAction(id: string, starred: boolean): Promise<ActionResult<null>> {
  return adminAction("pages.write", async () => {
    const { scope, actor } = await legacyWriteCtx("pages.write");
    const versionId = VersionId.parse(id);
    const value = z.boolean().parse(starred);
    if (!(await setVersionStarred(scope, versionId, value, actor))) fail("This version no longer exists.");
    revalidatePath("/admin/history");
    return null;
  });
}

export async function restoreVersionAction(id: string): Promise<ActionResult<{ pageId: string }>> {
  return adminAction("pages.write", async () => {
    const { scope, actor, user } = await legacyWriteCtx("pages.write");
    try {
      const res = await restoreVersion(scope, VersionId.parse(id), user, actor);
      revalidatePath("/admin/history");
      revalidatePath("/admin/pages");
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
  return adminAction("pages.write", async () => {
    const { scope, actor } = await legacyWriteCtx("pages.write");
    const res = (await duplicateVersionAsPage(scope, VersionId.parse(id), actor)) ?? fail("This version can't be copied (it no longer exists or can't be rendered).");
    revalidatePath("/admin/history");
    revalidatePath("/admin/pages");
    return res;
  });
}
