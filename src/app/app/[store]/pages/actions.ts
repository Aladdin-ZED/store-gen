"use server";
/**
 * Pages screen mutations of the store on screen. Each one: storeAction(permission) (the seam: the signed request
 * path's store, the member's grant) → validate the id → mutate the store's page (another store's id answers like a
 * missing one) → audit (inside the data helpers) → revalidate the store's screens that show pages.
 *
 * P3 LANDING (landing.md LAN-§4, §6.1, §6.4 rule 7): Set as home takes only a published landing page and only in
 * `landing` mode; unpublishing the home page hands the home to the page the owner picked or to the "no page yet"
 * page; a page created in a `store`-mode shop turns `landing.inStoreMode` on with it (the LAN-§4 fallback); the two
 * attestation sheets of the builder write their audit rows here (`page.proof_attested`, `page.fact_attested`).
 *
 * Test orders (LAN-§14.1, SF-05, wave 2): `mintTestLinkAction` mints the 2-hour `?sg-test=` link of a published page
 * of this store (`pages.publish`; audit `page.test_link_created` with the member as actor); with no page id it takes
 * the store's home page when it is live, else the latest published landing page.
 */
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { archivePage, deletePage, duplicatePage, restoreArchivedPage, setHomePage, unpublishPage } from "@/lib/admin-data/pages";
import { revalidateStore } from "@/lib/admin-data/shell";
import { attestFact, attestProof } from "@/lib/landing/honesty/facts.server";
import { canBeHome } from "@/lib/landing/home.server";
import { ensureLandingInStoreMode } from "@/lib/landing/in-store-mode.server";
import { publishPage, PublishError } from "@/lib/render/publish.server";
import { mintTestLinkAs, testOrderPageId } from "@/lib/testing/links";
import { storeAction } from "@/lib/tenancy/seam";
import type { ActionResult } from "@/lib/tenancy/types";

const PageId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, { error: "Unknown page." });

const refresh = (handle: string) => revalidateStore(handle, "/pages", "", "/history");

export async function duplicatePageAction(id: string): Promise<ActionResult<{ id: string; slug: string; inStoreMode: boolean }>> {
  return storeAction("pages.write", async (ctx) => {
    const { scope, actor, store } = ctx;
    const created = (await duplicatePage(scope, PageId.parse(id), actor)) ?? fail("This page no longer exists.");
    // LAN-§4 fallback: a landing page created in a `store`-mode shop shows in the nav from now on
    const inStoreMode = await ensureLandingInStoreMode(ctx, "page_duplicated");
    refresh(store.handle);
    return { ...created, inStoreMode };
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

/**
 * Takes a page offline. When it is the store's home, `home` says where `/` goes next: another live page's id, or null
 * for the "no page yet" page (the dialog asks first, LAN-§4).
 */
export async function unpublishPageAction(id: string, home?: string | null): Promise<ActionResult<null>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    const pageId = PageId.parse(id);
    const next = typeof home === "string" ? PageId.parse(home) : null;
    if (next !== null && (next === pageId || !(await canBeHome(scope, next)))) fail("Pick a live page for your home.");
    if (!(await unpublishPage(scope, pageId, actor))) fail("This page isn't live.");
    if (store.homePageId === pageId) await setHomePage(scope, next, actor);
    refresh(store.handle);
    return null;
  });
}

/** Set as home (`landing` mode only): a published landing page of the store, or null for the "no page yet" page. */
export async function setHomePageAction(id: string | null): Promise<ActionResult<null>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    if (store.mode !== "landing") fail("Your storefront is your home in this mode.");
    const pageId = id === null ? null : PageId.parse(id);
    if (pageId !== null && !(await canBeHome(scope, pageId))) fail("Only a live page can be your home.");
    if (!(await setHomePage(scope, pageId, actor))) fail("Only a live page can be your home.");
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

/* ------------------------------------------------------------------ */
/* the builder's attestation sheets (LAN-§6.1, §6.4 rule 7; Q31)       */
/* ------------------------------------------------------------------ */

const SectionProof = z.object({ sectionId: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), type: z.enum(["reviews", "socialProof", "stats", "beforeAfter"]) });
const RatingProof = z.object({ field: z.literal("rating"), value: z.number().min(0).max(5), count: z.number().int().min(0).max(10_000_000) });
const Proof = z.union([SectionProof, RatingProof]);
const Fact = z.object({ path: z.string().regex(/^[A-Za-z0-9_.-]{1,160}$/), value: z.string().trim().min(1).max(40), text: z.string().trim().min(1).max(400) });

/**
 * `ProofAttestSheet` confirmed: "These are real … from my customers." Audit `page.proof_attested` with
 * `{ pageId, sectionId, type }` or `{ pageId, field: "rating", value, count }`.
 */
export async function attestProofAction(pageId: string, proof: z.input<typeof Proof>): Promise<ActionResult<null>> {
  return storeAction("pages.write", async ({ scope, actor }) => {
    if (!(await attestProof(scope, actor, PageId.parse(pageId), Proof.parse(proof)))) fail("This page no longer exists.");
    return null;
  });
}

/**
 * `FactAttestSheet` confirmed: "«value» is a fact about my product." Audit `page.fact_attested` with `{ pageId, path,
 * value, text, source: "owner" }` (recordFacts' row shape); the numeral must be in the text.
 */
export async function attestFactAction(pageId: string, fact: z.input<typeof Fact>): Promise<ActionResult<null>> {
  return storeAction("pages.write", async ({ scope, actor }) => {
    if (!(await attestFact(scope, actor, PageId.parse(pageId), Fact.parse(fact)))) fail("This number isn't in the text any more.");
    return null;
  });
}

/* ------------------------------------------------------------------ */
/* test orders (LAN-§14.1, SF-05)                                      */
/* ------------------------------------------------------------------ */

/**
 * "Open a test order": the page's 2-hour test link (`mintTestLink`, audit `page.test_link_created`). `pageId` null: the
 * store's home page when it is published, else its latest published landing page; none answers `not_found`.
 */
export async function mintTestLinkAction(pageId: string | null): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    const id = pageId === null ? ((await testOrderPageId(scope, store)) ?? fail("landing.testOrder.noPage")) : PageId.parse(pageId);
    const link = await mintTestLinkAs(scope, actor, id);
    return { url: link.url, expiresAt: link.expiresAt.toISOString() };
  });
}
