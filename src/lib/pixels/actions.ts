"use server";
/**
 * Pixel library actions of the store on screen (docs/STORE-SAAS.md §I.1 `/app/<h>/integrations/pixels`; docs/OFFERS.md
 * §A.3): the library view, entries, usage, Replace / Remove on pages, the pixels-only live update, per-page test
 * windows and "Send test event". Tokens never leave the server unmasked. Used by the pixels screen, the pages list,
 * the builder and the generator, all under `/app/<handle>`.
 *
 * Every action is `storeAction(permission, …)`: the store comes from the signed request path (the seam), never from
 * the browser. The role checks are the store's matrix (`pixels.manage` for library ids, `integrations.manage` for
 * tokens and test codes, PIX-03) and page ids are the store's own (another store's id = not found, PIX-04).
 */
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { fail } from "@/lib/admin-data/action";
import { platformBrandName } from "@/lib/admin-data/brand";
import { revalidateStore } from "@/lib/admin-data/shell";
import { affected } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { pages } from "@/lib/db/schema";
import { ownToken, savedTestCode, sendTestEvent, type TestEventResult } from "@/lib/orders/conversions-core";
import type { Tracking } from "@/lib/page/schema";
import { TEST_CODE_RE, TOKEN_RE, isMask } from "@/lib/pixels/form";
import { recordPixelHealth } from "@/lib/pixels/health.server";
import { PIXEL_ID_RE, PIXEL_LIMIT, PIXEL_PLATFORMS, SERVER_PLATFORMS, normalizePixelId, type PixelPlatform } from "@/lib/pixels/ids";
import { TEST_MINUTES, findEntry, idsOnly, trackingRefs, type PixelLibraryView, type TestMinutes } from "@/lib/pixels/library";
import {
  PixelError,
  ensureInLibrary,
  entrySetsSecret,
  getLibrary,
  liveTracking,
  pixelLibraryView,
  removePixelEntry,
  savePixelEntry,
  startPixelTest,
  stopPixelTest,
} from "@/lib/pixels/library.server";
import { emptySummary, type StorePixelSummary } from "@/lib/pixels/summary";
import { trackingIds, withTrackingIds } from "@/lib/pixels/tracking";
import { invalidatePixelUsage, livePagePixels, pixelUsageOf, recentPagesWithPixels, type LivePagePixels, type PixelPageUse, type RecentPagePixels } from "@/lib/pixels/usage.server";
import { PublishError, publishTrackingOnly } from "@/lib/render/publish.server";
import { getStoreSetting, getStoreSettings } from "@/lib/settings";
import { requireStepUp, storeAction } from "@/lib/tenancy/seam";
import { byId } from "@/lib/tenancy/sql";
import type { ActionResult, StoreCtx, WritePermission } from "@/lib/tenancy/types";
import { storeUrl } from "@/lib/urls";

const Platform = z.enum(PIXEL_PLATFORMS);
const ServerPlatformSchema = z.enum(SERVER_PLATFORMS);
const PageIdSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const RawId = z.string().max(80);

/** PixelError / PublishError → the action's message. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PixelError || err instanceof PublishError) fail(err.message);
    throw err;
  }
}

const refresh = (store: { id: string; handle: string }) => {
  invalidatePixelUsage(store.id);
  revalidateStore(store.handle, "/integrations/pixels", "/pages");
};

/** The library as this member may see it: add / edit with pixels.manage, token masks only with integrations.manage. */
const viewOf = (ctx: StoreCtx, opts: { fresh?: boolean } = {}) =>
  pixelLibraryView(ctx.scope, { canCreate: ctx.can("pixels.manage"), canSeeTokens: ctx.can("integrations.manage"), fresh: opts.fresh });

/* ------------------------------------------------------------------ */
/* library                                                             */
/* ------------------------------------------------------------------ */

/** Entries + flags (server token, test code saved, active tests) + health + usage. Never a token. */
export async function pixelLibraryAction(): Promise<ActionResult<PixelLibraryView>> {
  return storeAction("pages.read", async (ctx) => viewOf(ctx));
}

const EntryInput = z.object({
  platform: Platform,
  id: RawId,
  label: z.string().max(120).default(""),
  token: z.string().max(600).optional(),
  testCode: z.string().max(40).optional(),
});

/** The keys an entry save needs: a token or a test code is an integration secret (sensitive), on top of pixels.manage. */
function entryKeys(input: unknown): WritePermission[] {
  const peek = EntryInput.safeParse(input);
  const secret = !peek.success || peek.data.token !== undefined || peek.data.testCode !== undefined;
  return secret ? ["pixels.manage", "integrations.manage"] : ["pixels.manage"];
}

/**
 * Add (≤ 100) or edit a pixel: label, token ("" remove · mask keep · new replace), test code. Planting or replacing a
 * token or a test code is a secret write under integrations.manage: a fresh step-up first (§B.7, SEC-17), named on
 * the `integrations.conversions.changed` row. A label edit, a kept mask or a removal needs none.
 */
export async function savePixelEntryAction(input: z.input<typeof EntryInput>): Promise<ActionResult<{ created: boolean; view: PixelLibraryView }>> {
  return storeAction(entryKeys(input), async (ctx) => {
    const v = EntryInput.parse(input);
    const stepUp = entrySetsSecret(v) ? requireStepUp(ctx) : undefined;
    const res = await guarded(() => savePixelEntry(ctx.scope, v, ctx.actor, { stepUp }));
    refresh(ctx.store);
    return { created: res.created, view: await viewOf(ctx, { fresh: true }) };
  });
}

/** Delete a pixel (refused `pixel_in_use` while any draft, live page or export uses it). */
export async function removePixelEntryAction(input: { platform: PixelPlatform; id: string }): Promise<ActionResult<{ view: PixelLibraryView }>> {
  // removing a pixel deletes its token and test code too
  return storeAction(["pixels.manage", "integrations.manage"], async (ctx) => {
    const v = z.object({ platform: Platform, id: RawId }).parse(input);
    await guarded(() => removePixelEntry(ctx.scope, v, ctx.actor));
    refresh(ctx.store);
    return { view: await viewOf(ctx, { fresh: true }) };
  });
}

/** The pages (and exports) using one pixel. */
export async function pixelUsageAction(input: { platform: PixelPlatform; id: string }): Promise<ActionResult<PixelPageUse[]>> {
  return storeAction("settings.read", async ({ scope }) => {
    const v = z.object({ platform: Platform, id: RawId }).parse(input);
    return pixelUsageOf(scope, v.platform, v.id);
  });
}

/* ------------------------------------------------------------------ */
/* Replace on pages… / Remove from pages…                              */
/* ------------------------------------------------------------------ */

const ReplaceInput = z.object({
  platform: Platform,
  from: RawId,
  /** null = detach (remove from the pages) */
  to: RawId.nullable(),
  pageIds: z.array(PageIdSchema).min(1).max(1000),
  /** also update live pages now (pixels only) */
  live: z.boolean(),
});

export interface ReplacePageResult {
  pageId: string;
  name: string;
  draft: "ok" | "unchanged" | "conflict" | "not_found";
  live: "ok" | "unchanged" | "not_live" | "error" | "skipped";
  error?: string;
}

/** `from` replaced by `to` (or removed) at the same position; `to` already there → `from` just goes. */
function swapIds(ids: readonly string[], from: string, to: string | null): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (id !== from) {
      if (!out.includes(id)) out.push(id);
      continue;
    }
    if (to && !ids.includes(to) && !out.includes(to)) out.push(to);
  }
  return out;
}

export async function replacePixelAction(
  input: z.input<typeof ReplaceInput>,
): Promise<ActionResult<{ results: ReplacePageResult[]; reexport: { pageId: string; name: string; exports: number }[] }>> {
  return storeAction("pages.write", async (ctx) => {
    const { scope, actor } = ctx;
    const v = ReplaceInput.parse(input);
    const from = normalizePixelId(v.platform, v.from);
    const to = v.to === null ? null : normalizePixelId(v.platform, v.to);
    if (!PIXEL_ID_RE[v.platform].test(from)) fail("Choose the pixel to replace.");
    if (to !== null && !PIXEL_ID_RE[v.platform].test(to)) fail("This new pixel ID isn't valid.");
    if (to === from) fail("Choose a different pixel.");
    if (v.live && !ctx.can("pages.publish")) fail("Your role can't update live pages. Untick “Also update live pages now”.");
    if (to !== null && !findEntry(await getLibrary(scope), v.platform, to)) {
      if (!ctx.can("pixels.manage")) fail("Only owners can add new pixels. Pick one from the library.");
      await ensureInLibrary(scope, [{ platform: v.platform, id: to }], actor);
    }

    const results: ReplacePageResult[] = [];
    for (const pageId of v.pageIds) {
      const r: ReplacePageResult = { pageId, name: "", draft: "unchanged", live: v.live ? "unchanged" : "skipped" };
      results.push(r);
      // draft: compare-and-swap on its stamp (an editor saving meanwhile wins: "conflict")
      const [row] = await db.select({ name: pages.name, draft: pages.draft, updatedAt: pages.updatedAt, status: pages.status }).from(pages).where(byId(pages, scope, pageId)).limit(1);
      if (!row) {
        r.draft = "not_found";
        r.live = v.live ? "not_live" : "skipped";
        continue;
      }
      r.name = row.name;
      const draft = row.draft as unknown as Record<string, unknown> | null;
      const current = (draft?.tracking ?? {}) as Tracking;
      const ids = trackingIds(current, v.platform);
      if (draft && ids.includes(from)) {
        const nextIds = swapIds(ids, from, to);
        const nextTracking: Tracking = withTrackingIds(current, v.platform, nextIds.slice(0, PIXEL_LIMIT[v.platform]));
        delete nextTracking.copiedFrom;
        if (trackingRefs(nextTracking).length) delete nextTracking.none;
        const stamp = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
        const res = await db
          .update(pages)
          .set({ draft: { ...(draft as object), tracking: nextTracking } as never, updatedAt: stamp })
          .where(and(byId(pages, scope, pageId), eq(pages.updatedAt, row.updatedAt)));
        r.draft = affected(res) === 1 ? "ok" : "conflict";
      }
      if (!v.live) continue;
      const live = await liveTracking(scope, pageId);
      if (!live) {
        r.live = "not_live";
        continue;
      }
      const liveIdsList = trackingIds(live.tracking, v.platform);
      if (!liveIdsList.includes(from)) continue;
      const nextLive = withTrackingIds(idsOnly(live.tracking), v.platform, swapIds(liveIdsList, from, to).slice(0, PIXEL_LIMIT[v.platform]));
      try {
        // looked up again in the store, with the store's library rule for this actor (CCR r1.0-t4-11 item 2)
        await publishTrackingOnly(scope, pageId, nextLive, live.versionId, { actor, patchDraft: false });
        r.live = "ok";
      } catch (err) {
        r.live = "error";
        r.error = err instanceof PublishError || err instanceof PixelError ? err.message : "Couldn't update the live page.";
        if (!(err instanceof PublishError || err instanceof PixelError)) console.error("[pixels] replace live failed:", err instanceof Error ? err.message : err);
      }
    }
    refresh(ctx.store);
    const reexport = (await pixelUsageOf(scope, v.platform, from)).filter((u) => u.exports > 0).map((u) => ({ pageId: u.pageId, name: u.name, exports: u.exports }));
    return { results, reexport };
  });
}

/* ------------------------------------------------------------------ */
/* builder: the page's pixels, pixels-only live update, test windows   */
/* ------------------------------------------------------------------ */

export interface PagePixelsState {
  library: PixelLibraryView;
  /** the live version's pixels (null: not live) */
  live: { versionId: string; tracking: Tracking } | null;
  canPublish: boolean;
}

/** What the builder's pixels section and the publish block need about one page. */
export async function pagePixelsAction(pageId: string): Promise<ActionResult<PagePixelsState>> {
  return storeAction("pages.read", async (ctx) => {
    const id = PageIdSchema.parse(pageId);
    const [library, live] = await Promise.all([viewOf(ctx), liveTracking(ctx.scope, id)]);
    return {
      library,
      live: live ? { versionId: live.versionId, tracking: { ...idsOnly(live.tracking), ...(live.tracking.none === true ? { none: true as const } : {}) } } : null,
      canPublish: ctx.can("pages.publish"),
    };
  });
}

/** Publish the draft's current pixels alone onto the live version ("Update live page now"). */
export async function applyLiveTrackingAction(input: { pageId: string; baseVersionId: string }): Promise<ActionResult<{ versionId: string; live: Tracking }>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    const v = z.object({ pageId: PageIdSchema, baseVersionId: PageIdSchema }).parse(input);
    const [row] = await db.select({ draft: pages.draft }).from(pages).where(byId(pages, scope, v.pageId)).limit(1);
    if (!row) fail("This page no longer exists.");
    const tracking = ((row!.draft as unknown as { tracking?: Tracking } | null)?.tracking ?? {}) as Tracking;
    const res = await guarded(() => publishTrackingOnly(scope, v.pageId, tracking, v.baseVersionId, { actor }));
    refresh(store);
    return { versionId: res.versionId, live: idsOnly(tracking) };
  });
}

const TestInput = z.object({ pageId: PageIdSchema, platform: ServerPlatformSchema, id: RawId, minutes: z.number().int() });

/** Test this page: the pixel's server events of THIS page carry its test code for 30 / 60 / 120 min. */
export async function startPixelTestAction(input: z.input<typeof TestInput>): Promise<ActionResult<{ until: string }>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    const v = TestInput.parse(input);
    if (!(TEST_MINUTES as readonly number[]).includes(v.minutes)) fail("Choose 30, 60 or 120 minutes.");
    const res = await guarded(() => startPixelTest(scope, { ...v, id: normalizePixelId(v.platform, v.id), minutes: v.minutes as TestMinutes }, actor));
    revalidateStore(store.handle, "/integrations/pixels");
    return res;
  });
}

export async function stopPixelTestAction(input: { pageId: string; platform: "meta" | "tiktok"; id: string }): Promise<ActionResult<null>> {
  return storeAction("pages.publish", async ({ scope, actor, store }) => {
    const v = z.object({ pageId: PageIdSchema, platform: ServerPlatformSchema, id: RawId }).parse(input);
    await guarded(() => stopPixelTest(scope, { ...v, id: normalizePixelId(v.platform, v.id) }, actor));
    revalidateStore(store.handle, "/integrations/pixels");
    return null;
  });
}

/** Live pixels of every live page (Pages list chips and the "No pixel" filter), with labels. */
export async function pagesPixelsAction(): Promise<ActionResult<{ pages: Record<string, LivePagePixels>; labels: Record<string, string> }>> {
  return storeAction("pages.read", async ({ scope }) => {
    const [byPage, lib] = await Promise.all([livePagePixels(scope), getStoreSetting(scope, "pixel_library")]);
    const labels: Record<string, string> = {};
    for (const p of lib.pixels) if (p.label) labels[`${p.platform}:${p.id}`] = p.label;
    return { pages: byPage, labels };
  });
}

/** The library + the 8 most recent pages with pixels ("Same as…"): the wizard's tracking step. */
export async function wizardPixelsAction(): Promise<ActionResult<{ library: PixelLibraryView; recent: RecentPagePixels[] }>> {
  return storeAction("pages.read", async (ctx) => {
    const [library, recent] = await Promise.all([viewOf(ctx), recentPagesWithPixels(ctx.scope, 8)]);
    return { library, recent };
  });
}

/* ------------------------------------------------------------------ */
/* Send test event                                                     */
/* ------------------------------------------------------------------ */

const SendTestInput = z.object({
  platform: ServerPlatformSchema,
  id: RawId,
  /** typed token, or "" / mask = the stored one */
  token: z.string().max(600).default(""),
  /** typed code, or "" = the stored one */
  testCode: z.string().max(40).default(""),
});

/** An absolute page URL for Meta's website events: the store's address, else the host serving the admin. */
async function testEventUrl(storePageUrl: string): Promise<string | null> {
  if (/^https?:\/\//.test(storePageUrl)) return storePageUrl;
  const host = (await headers()).get("host") ?? "";
  return /^[a-z0-9.-]+(:[0-9]{1,5})?$/i.test(host) ? `https://${host}${storePageUrl.startsWith("/") ? storePageUrl : "/"}` : null;
}

/**
 * Send a synthetic Purchase with the platform's test event code (it shows in Events Manager → Test
 * events and never counts in reports). Also writes the pixel's health.
 */
export async function sendPixelTestAction(input: z.input<typeof SendTestInput>): Promise<ActionResult<TestEventResult>> {
  return storeAction("integrations.manage", async ({ scope, store }) => {
    const v = SendTestInput.parse(input);
    const pixelId = normalizePixelId(v.platform, v.id);
    if (!PIXEL_ID_RE[v.platform].test(pixelId)) fail("Enter a valid pixel ID first.");
    const { tracking_secrets: secrets, defaults } = await getStoreSettings(scope, ["tracking_secrets", "defaults"]);
    const typedCode = v.testCode.replace(/\s+/g, "").toUpperCase();
    const code = typedCode || savedTestCode(secrets, v.platform, pixelId);
    if (!TEST_CODE_RE.test(code)) fail("Add the test event code from Events Manager → Test events first.");
    const typed = v.token.trim();
    const token = !typed || isMask(typed) ? ownToken(secrets, v.platform, pixelId) : typed;
    if (!token) fail(v.platform === "meta" ? "Add the Conversions API token first." : "Add the Events API access token first.");
    if (!TOKEN_RE.test(token)) fail("This doesn't look like a valid token. Paste it again.");
    const res = await sendTestEvent({
      platform: v.platform,
      pixelId,
      token,
      testCode: code,
      // the store's address, not the platform's (PIX-08)
      siteUrl: await testEventUrl(storeUrl(store)),
      currency: store.currency,
      country: defaults.phoneCountry,
      brand: await platformBrandName(),
    });
    // health describes the STORED token: only when the stored one was used
    if (token === ownToken(secrets, v.platform, pixelId)) {
      await recordPixelHealth(scope, [{ platform: v.platform, id: pixelId, state: res.ok ? "ok" : "refused", code: res.code, testMode: true }]);
      revalidateStore(store.handle, "/integrations/pixels");
    }
    return res;
  });
}

/* ------------------------------------------------------------------ */
/* deprecated                                                          */
/* ------------------------------------------------------------------ */

/**
 * @deprecated store-wide pixels are gone (§A): answers an empty summary so the old wizard step
 * pre-ticks nothing and copies nothing. Use pixelLibraryAction().
 */
export async function storePixelSummaryAction(): Promise<ActionResult<StorePixelSummary>> {
  return storeAction("pages.read", async () => emptySummary());
}

export type { PixelPageUse, LivePagePixels, RecentPagePixels };
