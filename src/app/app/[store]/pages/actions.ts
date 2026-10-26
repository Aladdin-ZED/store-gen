"use server";
/**
 * Pages screen mutations of the store on screen. Each one: storeAction(permission) (the seam: the signed request
 * path's store, the member's grant) → validate the id → mutate the store's page (another store's id answers like a
 * missing one) → audit (inside the data helpers) → revalidate the store's screens that show pages.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { archivePage, deletePage, duplicatePage, restoreArchivedPage, setHomePage, unpublishPage } from "@/lib/admin-data/pages";
import { revalidateStore } from "@/lib/admin-data/shell";
import { publishPage, PublishError } from "@/lib/render/publish.server";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const PageId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown page." });

const refresh = (handle: string) => revalidateStore(handle, "/pages", "", "/history");

export async function duplicatePageAction(id: string): Promise<ActionResult<{ id: string; slug: string }>> {
  return storeAction("pages.write", async ({ scope, actor, store }) => {
    const created = (await duplicatePage(scope, PageId.parse(id), actor)) ?? fail("This page no longer exists.");
    refresh(store.handle);
    return created;
  });
}

export async function publishPageAction(id: string): Promise<ActionResult<{ slug: string; warnings: number; skippedSections: number }>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    try {
      // the store's publish (T3, §E.2): the page is looked up in the scope's store, audited there
      const res = await publishPage(scope, PageId.parse(id), { actor });
      refresh(store.handle);
      return { slug: res.slug, warnings: res.issues.length, skippedSections: res.renderIssues.length };
    } catch (err) {
      if (err instanceof PublishError) {
        const first = err.issues.find((i) => i.level === "error");
        return fail(first ? `${err.message} (${first.path}: ${first.message})` : err.message);
      }
      throw err;
    }
  });
}

export async function unpublishPageAction(id: string): Promise<ActionResult<null>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    if (!(await unpublishPage(scope, PageId.parse(id), actor))) fail("This page isn't live.");
    refresh(store.handle);
    return null;
  });
}

export async function setHomePageAction(id: string | null): Promise<ActionResult<null>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    if (!(await setHomePage(scope, id === null ? null : PageId.parse(id), actor))) fail("Archived pages can't be the home page.");
    refresh(store.handle);
    return null;
  });
}

export async function archivePageAction(id: string): Promise<ActionResult<null>> {
  return storeAction("pages.write", async ({ scope, actor, store }) => {
    if (!(await archivePage(scope, PageId.parse(id), actor))) fail("This page is already archived.");
    refresh(store.handle);
    return null;
  });
}

export async function restorePageAction(id: string): Promise<ActionResult<null>> {
  return storeAction("pages.write", async ({ scope, actor, store }) => {
    if (!(await restoreArchivedPage(scope, PageId.parse(id), actor))) fail("This page isn't archived.");
    refresh(store.handle);
    return null;
  });
}

export async function deletePageAction(id: string): Promise<ActionResult<null>> {
  return storeAction("pages.write", async ({ scope, actor, store }) => {
    if (!(await deletePage(scope, PageId.parse(id), actor))) fail("This page no longer exists.");
    refresh(store.handle);
    return null;
  });
}
