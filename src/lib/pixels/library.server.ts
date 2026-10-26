import "server-only";
/**
 * Pixel library — reads and writes (docs/OFFERS.md §A.3). Tokens never leave this module unmasked.
 *
 *   pixelLibraryView(scope, opts)               entries + flags + health + usage + active tests (never a token)
 *   savePixelEntry(scope, input, actor)         add (≤ 100 in the UI) or edit label / token / test code
 *   removePixelEntry(scope, ref, actor)         refused while any draft, live page or export uses the pixel
 *   ensureInLibrary(scope, refs, actor)         unknown ids of a member who may manage pixels join the library (label "")
 *   enforceLibraryRule(scope, tracking, actor)  the publish rule (§A.3)
 *   unknownPixels(lib, tracking)                ids a publish would fire that the library doesn't know
 *   startPixelTest / stopPixelTest              per-page, time-boxed test windows
 *
 * Per store (docs/STORE-SAAS.md §D.10, §E.3; PIX-03, PIX-04): the library, the tokens (`tracking_secrets`,
 * keyed by pixel id inside the store) and the health are the store's settings; the library rule asks the
 * actor's membership role in THIS store (never the platform-wide `users.role`); page names, live
 * versions and test windows only ever name the store's own pages, so another store's page id answers
 * like a missing one. Writes take a `WriteScope` (D71) and are audited in the store.
 */
import { and, eq } from "drizzle-orm";
import { can, type StoreRole } from "@/lib/auth/permissions";
import { auditIn, settingsActor } from "@/lib/admin-data/store-audit";
import { LEGACY_STORE_ID } from "@/lib/admin-data/legacy-store";
import { db } from "@/lib/db/client";
import { pages, pageVersions, storeMembers } from "@/lib/db/schema";
import { systemCtx, systemScope } from "@/lib/jobs/scope";
import { ownToken, savedTestCode, type TrackingSecrets } from "@/lib/orders/conversions-core";
import { getStoreSetting, getStoreSettings, setStoreSetting } from "@/lib/settings";
import type { PixelLibraryEntry } from "@/lib/settings/schemas";
import { PIXEL_LIBRARY_UI_MAX, maskSecret } from "@/lib/settings/schemas";
import { inStore, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { ID_HELP, TEST_CODE_RE, TOKEN_RE, isMask } from "./form";
import { forgetPixelHealth, recordPixelHealth } from "./health.server";
import { PIXEL_ID_RE, PIXEL_NAMES, isServerPlatform, normalizePixelId, type PixelPlatform, type ServerPlatform } from "./ids";
import {
  LABEL_MAX,
  TEST_WINDOWS_MAX,
  activeWindows,
  findEntry,
  inUse,
  maskPixelId,
  pixelKey,
  pruneLibrary,
  trackingRefs,
  withEntry,
  withoutEntry,
  type LibraryPixel,
  type PixelLibrary,
  type PixelLibraryView,
  type PixelRef,
  type TestMinutes,
} from "./library";
import { invalidatePixelUsage, pixelUsage, usageCount } from "./usage.server";

export type PixelErrorCode =
  | "invalid_id"
  | "duplicate"
  | "pixel_limit"
  | "page_limit"
  | "token_invalid"
  | "pixel_in_use"
  | "pixel_not_in_library"
  | "no_test_code"
  | "not_live"
  | "live_changed"
  | "forbidden"
  | "not_found";

export class PixelError extends Error {
  constructor(
    readonly code: PixelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PixelError";
  }
}

const TOKEN_KEY = { meta: "metaTokens", tiktok: "tiktokTokens" } as const;
const CODE_KEY = { meta: "metaTestCodes", tiktok: "tiktokTestCodes" } as const;

export async function getLibrary(scope: StoreScope): Promise<PixelLibrary> {
  return getStoreSetting(scope, "pixel_library", { fresh: true });
}

/** Write the store's library (expired windows pruned). */
export async function saveLibrary(scope: WriteScope, lib: PixelLibrary, actor: Actor): Promise<PixelLibrary> {
  const saved = await setStoreSetting(scope, "pixel_library", pruneLibrary(lib, Date.now()), settingsActor(actor));
  invalidatePixelUsage(scope.storeId);
  return saved;
}

/** The actor's active role in the scope's store (null: no user, not a member, or suspended). */
export async function memberRole(scope: StoreScope, userId: string | null): Promise<StoreRole | null> {
  if (!userId) return null;
  const [m] = await db
    .select({ role: storeMembers.role, status: storeMembers.status })
    .from(storeMembers)
    .where(whereStore(storeMembers, scope, eq(storeMembers.userId, userId)))
    .limit(1);
  return m && m.status === "active" ? m.role : null;
}

/* ------------------------------------------------------------------ */
/* view                                                                */
/* ------------------------------------------------------------------ */

/**
 * The store's library as the admin shows it. `canCreate` (pixels.manage) decides the add / edit controls;
 * `canSeeTokens` (integrations.manage) whether token masks (••••3f9a) are included at all.
 */
export async function pixelLibraryView(scope: StoreScope, opts: { canCreate: boolean; canSeeTokens?: boolean; fresh?: boolean }): Promise<PixelLibraryView> {
  const [{ pixel_library: lib, pixel_health: health, tracking_secrets: secrets }, usage] = await Promise.all([
    getStoreSettings(scope, ["pixel_library", "pixel_health", "tracking_secrets"]),
    pixelUsage(scope, { fresh: opts.fresh }),
  ]);
  const now = Date.now();
  const testPages = [...new Set(lib.pixels.flatMap((p) => activeWindows(p, now).map((w) => w.pageId)))];
  const names = new Map<string, string>();
  for (const id of testPages) {
    const [row] = await db.select({ name: pages.name }).from(pages).where(whereStore(pages, scope, eq(pages.id, id))).limit(1);
    if (row) names.set(id, row.name);
  }
  const showTokens = opts.canSeeTokens ?? opts.canCreate;
  const pixels: LibraryPixel[] = lib.pixels.map((p) => {
    const server = isServerPlatform(p.platform);
    const token = server ? ownToken(secrets, p.platform as ServerPlatform, p.id) : "";
    return {
      platform: p.platform,
      id: p.id,
      label: p.label,
      addedAt: p.addedAt,
      server: server && !!token,
      ...(showTokens && token ? { tokenMask: maskSecret(token) } : {}),
      testCode: server && !!savedTestCode(secrets, p.platform as ServerPlatform, p.id),
      activeTests: activeWindows(p, now).map((w) => ({ pageId: w.pageId, until: w.until, pageName: names.get(w.pageId) ?? "a page" })),
      health: health[pixelKey(p.platform, p.id)] ?? null,
      usage: usageCount(usage.get(pixelKey(p.platform, p.id))),
    };
  });
  return { pixels, canCreate: opts.canCreate };
}

/* ------------------------------------------------------------------ */
/* entries                                                             */
/* ------------------------------------------------------------------ */

export interface SaveEntryInput {
  platform: PixelPlatform;
  id: string;
  label: string;
  /** "" = remove · mask "••••3f9a" = keep · new value = replace (Meta / TikTok) */
  token?: string;
  /** "" = remove · code = save (Meta / TikTok) */
  testCode?: string;
}

const cleanLabel = (s: string) =>
  s
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LABEL_MAX);

/**
 * Add a pixel to the store's library (or edit one: the id is immutable — to move pages to another id
 * use Replace). A changed token sets the pixel's health to "unverified" until a send confirms it.
 */
export async function savePixelEntry(scope: WriteScope, input: SaveEntryInput, actor: Actor): Promise<{ created: boolean }> {
  const platform = input.platform;
  const id = normalizePixelId(platform, input.id);
  if (!PIXEL_ID_RE[platform].test(id)) throw new PixelError("invalid_id", ID_HELP[platform]);
  const lib = await getLibrary(scope);
  const existing = findEntry(lib, platform, id);
  if (!existing && lib.pixels.length >= PIXEL_LIBRARY_UI_MAX) throw new PixelError("pixel_limit", `The library takes up to ${PIXEL_LIBRARY_UI_MAX} pixels. Delete unused ones first.`);
  const entry: PixelLibraryEntry = existing
    ? { ...existing, label: cleanLabel(input.label) }
    : { platform, id, label: cleanLabel(input.label), addedAt: new Date().toISOString(), tests: [] };

  let tokenChanged = false;
  if (isServerPlatform(platform) && (input.token !== undefined || input.testCode !== undefined)) {
    const secrets = await getStoreSetting(scope, "tracking_secrets", { fresh: true });
    const next: TrackingSecrets = { ...secrets, [TOKEN_KEY[platform]]: { ...secrets[TOKEN_KEY[platform]] }, [CODE_KEY[platform]]: { ...secrets[CODE_KEY[platform]] } };
    const tokens = next[TOKEN_KEY[platform]] as Record<string, string>;
    const codes = next[CODE_KEY[platform]] as Record<string, string>;
    if (input.token !== undefined) {
      const t = input.token.trim();
      if (!t) {
        tokenChanged = !!tokens[id];
        delete tokens[id];
      } else if (isMask(t)) {
        if (!tokens[id]) throw new PixelError("token_invalid", "The saved token of this pixel is no longer there — paste it again.");
      } else {
        if (!TOKEN_RE.test(t)) throw new PixelError("token_invalid", "This doesn't look like a valid token — paste it again.");
        tokenChanged = tokens[id] !== t;
        tokens[id] = t;
      }
    }
    if (input.testCode !== undefined) {
      const c = input.testCode.replace(/\s+/g, "").toUpperCase();
      if (!c) delete codes[id];
      else if (!TEST_CODE_RE.test(c)) throw new PixelError("token_invalid", "4–20 capital letters and digits, e.g. TEST12345.");
      else codes[id] = c;
    }
    await setStoreSetting(scope, "tracking_secrets", next, settingsActor(actor));
    if (tokenChanged && tokens[id]) await recordPixelHealth(scope, [{ platform, id, state: "unverified", testMode: false }]);
    if (tokenChanged && !tokens[id]) await forgetPixelHealth(scope, [pixelKey(platform, id)]);
  }
  await saveLibrary(scope, withEntry(lib, entry), actor);
  if (!existing) await auditIn(scope, actor, "pixels.library_added", { target: pixelKey(platform, maskPixelId(id)) });
  return { created: !existing };
}

/** Delete a pixel from the store's library (and its secrets and health) — only once nothing of the store uses it. */
export async function removePixelEntry(scope: WriteScope, ref: PixelRef, actor: Actor): Promise<void> {
  const lib = await getLibrary(scope);
  if (!findEntry(lib, ref.platform, ref.id)) throw new PixelError("not_found", "This pixel is no longer in the library.");
  const usage = usageCount((await pixelUsage(scope, { fresh: true })).get(pixelKey(ref.platform, ref.id)));
  if (inUse(usage)) {
    throw new PixelError(
      "pixel_in_use",
      `Still used on ${usage.pages} page${usage.pages === 1 ? "" : "s"}${usage.exports ? ` and ${usage.exports} export${usage.exports === 1 ? "" : "s"}` : ""}. Remove it from them first.`,
    );
  }
  if (isServerPlatform(ref.platform)) {
    const secrets = await getStoreSetting(scope, "tracking_secrets", { fresh: true });
    const tokens = { ...secrets[TOKEN_KEY[ref.platform]] };
    const codes = { ...secrets[CODE_KEY[ref.platform]] };
    if (ref.id in tokens || ref.id in codes) {
      delete tokens[ref.id];
      delete codes[ref.id];
      await setStoreSetting(scope, "tracking_secrets", { ...secrets, [TOKEN_KEY[ref.platform]]: tokens, [CODE_KEY[ref.platform]]: codes }, settingsActor(actor));
    }
  }
  await saveLibrary(scope, withoutEntry(lib, ref.platform, ref.id), actor);
  await forgetPixelHealth(scope, [pixelKey(ref.platform, ref.id)]);
  await auditIn(scope, actor, "pixels.library_removed", { target: pixelKey(ref.platform, maskPixelId(ref.id)) });
}

/* ------------------------------------------------------------------ */
/* library rule (publish, pixels-only update, replace)                 */
/* ------------------------------------------------------------------ */

/** Pixels of a tracking value the library doesn't know. */
export function unknownPixels(lib: PixelLibrary, tracking: Partial<Record<string, unknown>> | null | undefined): PixelRef[] {
  return trackingRefs(tracking).filter((r) => !findEntry(lib, r.platform, r.id));
}

/** Add unknown ids to the store's library with label "" (the caller checked pixels.manage). */
export async function ensureInLibrary(scope: WriteScope, refs: readonly PixelRef[], actor: Actor): Promise<void> {
  if (!refs.length) return;
  let lib = await getLibrary(scope);
  const at = new Date().toISOString();
  let added = 0;
  for (const r of refs) {
    if (findEntry(lib, r.platform, r.id)) continue;
    lib = withEntry(lib, { platform: r.platform, id: r.id, label: "", addedAt: at, tests: [] });
    added++;
  }
  if (added) await saveLibrary(scope, lib, actor);
}

/**
 * The library rule (§A.3): ids not in the store's library are refused (`pixel_not_in_library`) unless the
 * actor's role in this store may manage pixels (pixels.manage) — then they join the library. Customer
 * hashes (advanced matching) can only reach pixels an owner registered in the store.
 */
export async function enforceLibraryRule(scope: WriteScope, tracking: Partial<Record<string, unknown>> | null | undefined, actor: Actor): Promise<void>;
/** @deprecated today's store-less publish path (store #1, the legacy panel); T3 moves it to the scoped form (CCR r1.0-t4-2) */
export async function enforceLibraryRule(tracking: Partial<Record<string, unknown>> | null | undefined, userId: string, ip?: string | null): Promise<void>;
export async function enforceLibraryRule(
  ...args: [WriteScope, Partial<Record<string, unknown>> | null | undefined, Actor] | [Partial<Record<string, unknown>> | null | undefined, string, (string | null)?]
): Promise<void> {
  if (typeof args[1] === "string") {
    const [tracking, userId, ip] = args as [Partial<Record<string, unknown>> | null | undefined, string, (string | null)?];
    // the legacy single-tenant publish is store #1's (§D.8 S1); removed with its caller at the R1.0 integration
    const scope = systemScope(systemCtx("pixels.library_rule"), LEGACY_STORE_ID);
    return libraryRule(scope, tracking, { kind: "user", userId, impersonatorId: null, ip: ip ?? null });
  }
  const [scope, tracking, actor] = args as [WriteScope, Partial<Record<string, unknown>> | null | undefined, Actor];
  return libraryRule(scope, tracking, actor);
}

async function libraryRule(scope: WriteScope, tracking: Partial<Record<string, unknown>> | null | undefined, actor: Actor): Promise<void> {
  const unknown = unknownPixels(await getLibrary(scope), tracking);
  if (!unknown.length) return;
  const role = actor.kind === "user" ? await memberRole(scope, actor.userId) : null;
  if (role && can(role, "pixels.manage")) {
    await ensureInLibrary(scope, unknown, actor);
    return;
  }
  const list = unknown.map((r) => `${PIXEL_NAMES[r.platform]} ${maskPixelId(r.id)}`).join(", ");
  throw new PixelError("pixel_not_in_library", `${list} ${unknown.length === 1 ? "is" : "are"} not in the pixel library. Ask an owner to add ${unknown.length === 1 ? "it" : "them"} in Settings → Pixels, or remove ${unknown.length === 1 ? "it" : "them"} from this page.`);
}

/* ------------------------------------------------------------------ */
/* test windows                                                        */
/* ------------------------------------------------------------------ */

/** The tracking of the store's page's live version (raw), or null when not live (or not the store's page). */
export async function liveTracking(scope: StoreScope, pageId: string): Promise<{ versionId: string; tracking: Record<string, unknown> } | null> {
  const [row] = await db
    .select({ versionId: pageVersions.id, doc: pageVersions.doc })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), inStore(pageVersions, scope)))
    .where(whereStore(pages, scope, eq(pages.id, pageId), eq(pages.status, "published")))
    .limit(1);
  if (!row) return null;
  const t = (row.doc as { tracking?: unknown } | null)?.tracking;
  return { versionId: row.versionId, tracking: t && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : {} };
}

/** Open (or extend) a test window of a pixel for one of the store's live pages. */
export async function startPixelTest(scope: WriteScope, input: { pageId: string; platform: ServerPlatform; id: string; minutes: TestMinutes }, actor: Actor): Promise<{ until: string }> {
  const secrets = await getStoreSetting(scope, "tracking_secrets", { fresh: true });
  if (!savedTestCode(secrets, input.platform, input.id)) throw new PixelError("no_test_code", "Save this pixel's test event code first (Settings → Pixels → Edit token & test code).");
  const live = await liveTracking(scope, input.pageId);
  if (!live || !trackingRefs(live.tracking).some((r) => r.platform === input.platform && r.id === input.id)) {
    throw new PixelError("not_live", "This pixel isn't on the live page yet. Publish the page (or update its live pixels) first.");
  }
  const lib = await getLibrary(scope);
  const entry = findEntry(lib, input.platform, input.id);
  if (!entry) throw new PixelError("pixel_not_in_library", "This pixel is not in the library.");
  const now = Date.now();
  const until = new Date(now + input.minutes * 60_000).toISOString();
  const others = activeWindows(entry, now).filter((w) => w.pageId !== input.pageId);
  if (others.length >= TEST_WINDOWS_MAX) throw new PixelError("page_limit", `This pixel already tests on ${TEST_WINDOWS_MAX} pages. Stop one first.`);
  await saveLibrary(scope, withEntry(lib, { ...entry, tests: [...others, { pageId: input.pageId, until }] }), actor);
  await auditIn(scope, actor, "pixels.test_started", { target: input.pageId, meta: { pixel: pixelKey(input.platform, maskPixelId(input.id)), minutes: input.minutes } });
  return { until };
}

export async function stopPixelTest(scope: WriteScope, input: { pageId: string; platform: ServerPlatform; id: string }, actor: Actor): Promise<void> {
  const lib = await getLibrary(scope);
  const entry = findEntry(lib, input.platform, input.id);
  if (!entry) return;
  const tests = activeWindows(entry, Date.now()).filter((w) => w.pageId !== input.pageId);
  if (tests.length === entry.tests.length) return;
  await saveLibrary(scope, withEntry(lib, { ...entry, tests }), actor);
  await auditIn(scope, actor, "pixels.test_stopped", { target: input.pageId, meta: { pixel: pixelKey(input.platform, maskPixelId(input.id)) } });
}

export { invalidatePixelUsage };
