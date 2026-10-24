import "server-only";
/**
 * Pixel library — reads and writes (docs/OFFERS.md §A.3). Tokens never leave this module unmasked.
 *
 *   pixelLibraryView(user)            entries + flags + health + usage + active tests (never a token)
 *   savePixelEntry(input, actor)      add (≤ 100 in the UI) or edit label / token / test code
 *   removePixelEntry(ref, actor)      refused while any draft, live page or export uses the pixel
 *   ensureInLibrary(refs, actor)      owners' unknown ids join the library (label "")
 *   unknownPixels(tracking)           ids a publish would fire that the library doesn't know
 *   startPixelTest / stopPixelTest    per-page, time-boxed test windows
 */
import { and, eq } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { legacyCan as can, type Role } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { pages, pageVersions, users } from "@/lib/db/schema";
import { ownToken, savedTestCode, type TrackingSecrets } from "@/lib/orders/conversions-core";
import { getSetting, getSettings, setSetting, type SettingsActor } from "@/lib/settings";
import type { PixelLibraryEntry } from "@/lib/settings/schemas";
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
import { PIXEL_LIBRARY_UI_MAX, maskSecret } from "@/lib/settings/schemas";

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

export async function getLibrary(): Promise<PixelLibrary> {
  return getSetting("pixel_library", { fresh: true });
}

/** Write the library (expired windows pruned). */
export async function saveLibrary(lib: PixelLibrary, actor: SettingsActor | undefined): Promise<PixelLibrary> {
  return setSetting("pixel_library", pruneLibrary(lib, Date.now()), actor);
}

/** The role of a user id (null when unknown or disabled). */
export async function roleOf(userId: string): Promise<Role | null> {
  const [u] = await db.select({ role: users.role, disabled: users.disabled }).from(users).where(eq(users.id, userId)).limit(1);
  return u && !u.disabled ? u.role : null;
}

/* ------------------------------------------------------------------ */
/* view                                                                */
/* ------------------------------------------------------------------ */

export async function pixelLibraryView(opts: { canCreate: boolean; fresh?: boolean }): Promise<PixelLibraryView> {
  const [{ pixel_library: lib, pixel_health: health, tracking_secrets: secrets }, usage] = await Promise.all([
    getSettings(["pixel_library", "pixel_health", "tracking_secrets"]),
    pixelUsage({ fresh: opts.fresh }),
  ]);
  const now = Date.now();
  const testPages = new Set(lib.pixels.flatMap((p) => activeWindows(p, now).map((w) => w.pageId)));
  const names = new Map<string, string>();
  if (testPages.size) {
    for (const id of testPages) {
      const [row] = await db.select({ name: pages.name }).from(pages).where(eq(pages.id, id)).limit(1);
      if (row) names.set(id, row.name);
    }
  }
  const pixels: LibraryPixel[] = lib.pixels.map((p) => {
    const server = isServerPlatform(p.platform);
    return {
      platform: p.platform,
      id: p.id,
      label: p.label,
      addedAt: p.addedAt,
      server: server && !!ownToken(secrets, p.platform as ServerPlatform, p.id),
      ...(opts.canCreate && server && ownToken(secrets, p.platform as ServerPlatform, p.id) ? { tokenMask: maskSecret(ownToken(secrets, p.platform as ServerPlatform, p.id)) } : {}),
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
 * Add a pixel (or edit one: the id is immutable — to move pages to another id use Replace). A
 * changed token sets the pixel's health to "unverified" until a send confirms it.
 */
export async function savePixelEntry(input: SaveEntryInput, actor: SettingsActor): Promise<{ created: boolean }> {
  const platform = input.platform;
  const id = normalizePixelId(platform, input.id);
  if (!PIXEL_ID_RE[platform].test(id)) throw new PixelError("invalid_id", ID_HELP[platform]);
  const lib = await getLibrary();
  const existing = findEntry(lib, platform, id);
  if (!existing && lib.pixels.length >= PIXEL_LIBRARY_UI_MAX) throw new PixelError("pixel_limit", `The library takes up to ${PIXEL_LIBRARY_UI_MAX} pixels. Delete unused ones first.`);
  const entry: PixelLibraryEntry = existing
    ? { ...existing, label: cleanLabel(input.label) }
    : { platform, id, label: cleanLabel(input.label), addedAt: new Date().toISOString(), tests: [] };

  let tokenChanged = false;
  if (isServerPlatform(platform) && (input.token !== undefined || input.testCode !== undefined)) {
    const secrets = await getSetting("tracking_secrets", { fresh: true });
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
    await setSetting("tracking_secrets", next, actor);
    if (tokenChanged && tokens[id]) await recordPixelHealth([{ platform, id, state: "unverified", testMode: false }]);
    if (tokenChanged && !tokens[id]) await forgetPixelHealth([pixelKey(platform, id)]);
  }
  await saveLibrary(withEntry(lib, entry), actor);
  if (!existing) await audit("pixels.library_added", { userId: actor.id, target: pixelKey(platform, maskPixelId(id)), ip: actor.ip });
  return { created: !existing };
}

/** Delete a pixel from the library (and its secrets and health) — only once nothing uses it. */
export async function removePixelEntry(ref: PixelRef, actor: SettingsActor): Promise<void> {
  const lib = await getLibrary();
  if (!findEntry(lib, ref.platform, ref.id)) throw new PixelError("not_found", "This pixel is no longer in the library.");
  const usage = usageCount((await pixelUsage({ fresh: true })).get(pixelKey(ref.platform, ref.id)));
  if (inUse(usage)) {
    throw new PixelError(
      "pixel_in_use",
      `Still used on ${usage.pages} page${usage.pages === 1 ? "" : "s"}${usage.exports ? ` and ${usage.exports} export${usage.exports === 1 ? "" : "s"}` : ""}. Remove it from them first.`,
    );
  }
  if (isServerPlatform(ref.platform)) {
    const secrets = await getSetting("tracking_secrets", { fresh: true });
    const tokens = { ...secrets[TOKEN_KEY[ref.platform]] };
    const codes = { ...secrets[CODE_KEY[ref.platform]] };
    if (ref.id in tokens || ref.id in codes) {
      delete tokens[ref.id];
      delete codes[ref.id];
      await setSetting("tracking_secrets", { ...secrets, [TOKEN_KEY[ref.platform]]: tokens, [CODE_KEY[ref.platform]]: codes }, actor);
    }
  }
  await saveLibrary(withoutEntry(lib, ref.platform, ref.id), actor);
  await forgetPixelHealth([pixelKey(ref.platform, ref.id)]);
  await audit("pixels.library_removed", { userId: actor.id, target: pixelKey(ref.platform, maskPixelId(ref.id)), ip: actor.ip });
}

/* ------------------------------------------------------------------ */
/* library rule (publish, pixels-only update, replace)                 */
/* ------------------------------------------------------------------ */

/** Pixels of a tracking value the library doesn't know. */
export function unknownPixels(lib: PixelLibrary, tracking: Partial<Record<string, unknown>> | null | undefined): PixelRef[] {
  return trackingRefs(tracking).filter((r) => !findEntry(lib, r.platform, r.id));
}

/** Add unknown ids to the library with label "" (owners: settings.write). */
export async function ensureInLibrary(refs: readonly PixelRef[], actor: SettingsActor): Promise<void> {
  if (!refs.length) return;
  let lib = await getLibrary();
  const at = new Date().toISOString();
  let added = 0;
  for (const r of refs) {
    if (findEntry(lib, r.platform, r.id)) continue;
    lib = withEntry(lib, { platform: r.platform, id: r.id, label: "", addedAt: at, tests: [] });
    added++;
  }
  if (added) await saveLibrary(lib, actor);
}

/**
 * The library rule (§A.3): ids not in the library are refused (`pixel_not_in_library`) unless the
 * user may change settings — then they join the library. Customer hashes (advanced matching) can
 * only reach pixels an owner registered.
 */
export async function enforceLibraryRule(tracking: Partial<Record<string, unknown>> | null | undefined, userId: string, ip?: string | null): Promise<void> {
  const unknown = unknownPixels(await getLibrary(), tracking);
  if (!unknown.length) return;
  const role = await roleOf(userId);
  if (role && can(role, "settings.write")) {
    await ensureInLibrary(unknown, { id: userId, ip: ip ?? null });
    return;
  }
  const list = unknown.map((r) => `${PIXEL_NAMES[r.platform]} ${maskPixelId(r.id)}`).join(", ");
  throw new PixelError("pixel_not_in_library", `${list} ${unknown.length === 1 ? "is" : "are"} not in the pixel library. Ask an owner to add ${unknown.length === 1 ? "it" : "them"} in Settings → Pixels, or remove ${unknown.length === 1 ? "it" : "them"} from this page.`);
}

/* ------------------------------------------------------------------ */
/* test windows                                                        */
/* ------------------------------------------------------------------ */

/** The tracking of a page's live version (raw), or null when not live. */
export async function liveTracking(pageId: string): Promise<{ versionId: string; tracking: Record<string, unknown> } | null> {
  const [row] = await db
    .select({ versionId: pageVersions.id, doc: pageVersions.doc })
    .from(pages)
    .innerJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
    .where(and(eq(pages.id, pageId), eq(pages.status, "published")))
    .limit(1);
  if (!row) return null;
  const t = (row.doc as { tracking?: unknown } | null)?.tracking;
  return { versionId: row.versionId, tracking: t && typeof t === "object" && !Array.isArray(t) ? (t as Record<string, unknown>) : {} };
}

/** Open (or extend) a test window of a pixel for one page. */
export async function startPixelTest(input: { pageId: string; platform: ServerPlatform; id: string; minutes: TestMinutes }, actor: SettingsActor): Promise<{ until: string }> {
  const secrets = await getSetting("tracking_secrets", { fresh: true });
  if (!savedTestCode(secrets, input.platform, input.id)) throw new PixelError("no_test_code", "Save this pixel's test event code first (Settings → Pixels → Edit token & test code).");
  const live = await liveTracking(input.pageId);
  if (!live || !trackingRefs(live.tracking).some((r) => r.platform === input.platform && r.id === input.id)) {
    throw new PixelError("not_live", "This pixel isn't on the live page yet. Publish the page (or update its live pixels) first.");
  }
  const lib = await getLibrary();
  const entry = findEntry(lib, input.platform, input.id);
  if (!entry) throw new PixelError("pixel_not_in_library", "This pixel is not in the library.");
  const now = Date.now();
  const until = new Date(now + input.minutes * 60_000).toISOString();
  const others = activeWindows(entry, now).filter((w) => w.pageId !== input.pageId);
  if (others.length >= TEST_WINDOWS_MAX) throw new PixelError("page_limit", `This pixel already tests on ${TEST_WINDOWS_MAX} pages. Stop one first.`);
  await saveLibrary(withEntry(lib, { ...entry, tests: [...others, { pageId: input.pageId, until }] }), actor);
  await audit("pixels.test_started", { userId: actor.id, target: input.pageId, meta: { pixel: pixelKey(input.platform, maskPixelId(input.id)), minutes: input.minutes }, ip: actor.ip });
  return { until };
}

export async function stopPixelTest(input: { pageId: string; platform: ServerPlatform; id: string }, actor: SettingsActor): Promise<void> {
  const lib = await getLibrary();
  const entry = findEntry(lib, input.platform, input.id);
  if (!entry) return;
  const tests = activeWindows(entry, Date.now()).filter((w) => w.pageId !== input.pageId);
  if (tests.length === entry.tests.length) return;
  await saveLibrary(withEntry(lib, { ...entry, tests }), actor);
  await audit("pixels.test_stopped", { userId: actor.id, target: input.pageId, meta: { pixel: pixelKey(input.platform, maskPixelId(input.id)) }, ip: actor.ip });
}

export { invalidatePixelUsage };
