import "server-only";
/**
 * Publishing & serving of landing pages.
 *
 *   const v = await publishPage(pageId, user.id, { expectedUpdatedAt }); // draft → validated → rendered → immutable version
 *   const r = await renderAndCommit(pageId, doc, { kind: "publish", label, userId, baseVersionId }); // any validated doc → live
 *   const t = await publishTrackingOnly(pageId, user.id, tracking, baseVersionId); // live version + new pixels only
 *
 * Pixels (docs/OFFERS.md §A.3): every publish path refuses ids that are not in the pixel library
 * (`pixel_not_in_library`) unless the user may change settings (an owner's unknown ids join the
 * library), and audits "page.pixels_changed" (masked ids) whenever the live ids change.
 *   const p = await getPublishedBySlug("argan");       // what GET /argan serves (cached in memory)
 *   const h = await getHomePublished();                // what GET / serves
 *   const l = await getLegalDocument(p, "privacy");    // GET /legal/privacy?p=argan (rendered on demand)
 *
 * Published HTML is rendered once at publish time and stored in page_versions (html, thank-you html,
 * both CSPs, etag, checksum); visitors get those bytes with zero React on the server per request.
 * Legal documents are rendered on request from the published doc + the CURRENT store settings
 * (so completing the store details updates them without a re-publish), then cached briefly.
 *
 * After an unpublish, a slug change, a page deletion, a "home" or Settings → Store change, call
 * invalidatePublished() (re-exported here from ./cache.server).
 *
 * Multi-tenant (docs/STORE-SAAS.md §K.1, §M.1, PUB-*): the scoped overloads `publishPage(scope, pageId, opts)`,
 * `unpublishPage(scope, pageId, actor)` and `renderAndCommit(scope, pageId, doc, opts)` are frozen at C0a; T3
 * implements them (the store render context, runPrePublishChecks before the version row, first_published_at with
 * COALESCE) and moves the callers. Until then they throw "not implemented: T3"; the single-tenant forms keep working.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { PixelError, enforceLibraryRule } from "@/lib/pixels/library.server";
import { idsOnly, maskPixelId, sameIds, trackingDiff, type PixelRef } from "@/lib/pixels/library";
import { invalidatePixelUsage } from "@/lib/pixels/usage.server";
import { isGatePath } from "@/lib/auth/gate";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pages, pageVersions, settings } from "@/lib/db/schema";
import { getAssetsByIds } from "@/lib/media";
import type { PageDoc, Tracking } from "@/lib/page/schema";
import { validateDoc, type DocIssue } from "@/lib/page/validate";
import { getSetting, getSettings } from "@/lib/settings";
import { collectAssetIds, liveAssetResolver, liveLinks, type AssetResolver, type LegalKind, type StoreInfo } from "@/landing/context";
import type { DocumentUrls } from "@/landing/document";
import { cacheGet, cacheSet, invalidatePublished } from "./cache.server";
import { renderLandingHtml, renderLegalHtml, renderThankYouHtml, type RenderedHtml, type RenderIssue } from "./core";
import type { Actor, WriteScope } from "@/lib/tenancy/types";

export { invalidatePublished } from "./cache.server";

/** Slugs that can never be a landing page (app routes, the thank-you suffix, legal documents). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(["admin", "api", "media", "fonts", "dev", "_next", "merci", "dev-fixtures", "legal"]);
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/**
 * A slug a landing page can live at: the slug pattern, not reserved, and never the secret admin gate
 * path (the proxy answers that path itself — and a page there would print the secret in public links).
 */
export function isServableSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) && !isGatePath(`/${slug}`);
}

/** Public API endpoints called by the landing runtime (same origin as the page). */
export const PUBLIC_ENDPOINTS = {
  order: "/api/public/order",
  lead: "/api/public/lead",
  event: "/api/public/event",
  upsell: "/api/public/upsell",
} as const;

export const landingPath = (slug: string) => `/${slug}`;
export const thankYouPath = (slug: string) => `/${slug}/merci`;

/** Absolute public origin from PUBLIC_URL ("https://shop.ma"), or undefined when unset/invalid. */
export function publicOrigin(): string | undefined {
  const raw = process.env.PUBLIC_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

export type PublishErrorCode =
  | "not_found"
  | "invalid"
  | "conflict"
  /** the rendered page breaks a page cap (HTML weight, order form data, option photos: render/caps.ts) */
  | "page_too_large"
  /** renderAndCommit with baseVersionId: the live version moved meanwhile */
  | "live_changed"
  /** a pixel the page would fire is not in the pixel library and the user can't add it (§A.3) */
  | "pixel_not_in_library"
  /** publishTrackingOnly on a page that isn't live */
  | "not_live";

export class PublishError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    message: string,
    readonly issues: DocIssue[] = [],
    /** "conflict": the page's current updatedAt (ms), so an editor can reload or resolve */
    readonly serverUpdatedAt?: number,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

export interface PublishOptions {
  /**
   * The draft stamp (pages.updated_at, ms) the caller is publishing. Checked before rendering and
   * again inside the write transaction (row locked): a draft saved anywhere in between →
   * PublishError("conflict"). Without it, the draft current at call time is published, re-rendered
   * when an autosave lands while it renders.
   */
  expectedUpdatedAt?: number;
}

/** Re-render attempts when the draft keeps changing during an unchecked publish. */
const PUBLISH_ATTEMPTS = 3;

const draftChanged = (serverUpdatedAt: number) =>
  new PublishError("conflict", "This page was changed somewhere else. Load the latest version, then publish again.", [], serverUpdatedAt);

export interface PublishResult {
  versionId: string;
  pageId: string;
  slug: string;
  etag: string;
  publishedAt: Date;
  /** repairs made by validateDoc (warnings) */
  issues: DocIssue[];
  /** sections left out because they failed to render */
  renderIssues: RenderIssue[];
}

/** Store identity for documents: every field of Settings → Store (sanitized again by storeContext()). */
export async function storeInfo(): Promise<StoreInfo> {
  const s = await getSetting("store");
  const socials = Object.fromEntries(Object.entries(s.socials ?? {}).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
  return {
    name: s.storeName,
    country: s.country,
    ...(s.legalName ? { legalName: s.legalName } : {}),
    ...(s.phone ? { phone: s.phone } : {}),
    ...(s.whatsapp ? { whatsapp: s.whatsapp } : {}),
    ...(s.email ? { email: s.email } : {}),
    ...(s.address ? { address: s.address } : {}),
    ...(s.city ? { city: s.city } : {}),
    ...(s.ice ? { ice: s.ice } : {}),
    ...(s.rc ? { rc: s.rc } : {}),
    ...(s.logo ? { logo: s.logo } : {}),
    ...(Object.keys(socials).length ? { socials } : {}),
  };
}

/** Live asset resolver for every asset the document (and store logo) references. */
export async function liveResolverFor(doc: PageDoc, store: StoreInfo): Promise<AssetResolver> {
  const rows = await getAssetsByIds(collectAssetIds(doc, [store.logo]));
  return liveAssetResolver(rows);
}

/** Turnstile site key to embed: only when a secret is configured too (the order API verifies tokens). */
async function turnstileSiteKey(): Promise<string | undefined> {
  const t = await getSetting("turnstile");
  return t.siteKey && t.secretKey ? t.siteKey : undefined;
}

const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Validate the page draft, render landing + thank-you pages, store them as an immutable "publish"
 * version and point the page at it. Throws PublishError("not_found" | "invalid" | "conflict" |
 * "page_too_large").
 *
 * The version always holds exactly the draft whose stamp is checked in the transaction: the row is
 * locked (FOR UPDATE) and its updated_at compared with the one read before rendering.
 */
/** The scoped publish's options (T3): who publishes (audited in the page's store) and the draft stamp. */
export interface ScopedPublishOptions extends PublishOptions {
  actor: Actor;
}

const scopedNotImplemented = (fn: string): never => {
  throw new Error(`not implemented: T3 (${fn}, scoped)`);
};

export function publishPage(scope: WriteScope, pageId: string, opts: ScopedPublishOptions): Promise<PublishResult>;
/** @deprecated single-tenant; T3 moves the callers to the scoped overload */
export function publishPage(pageId: string, userId: string, opts?: PublishOptions): Promise<PublishResult>;
export async function publishPage(...args: [WriteScope, string, ScopedPublishOptions] | [string, string, PublishOptions?]): Promise<PublishResult> {
  if (typeof args[0] !== "string") return scopedNotImplemented("publishPage");
  const [pageId, userId, opts = {}] = args as [string, string, PublishOptions?];
  for (let attempt = 1; ; attempt++) {
    const res = await publishOnce(pageId, userId, opts.expectedUpdatedAt);
    if (res !== "retry") return res;
    // an autosave landed while rendering (unchecked publish): render the newer draft
    if (attempt >= PUBLISH_ATTEMPTS) {
      const [row] = await db.select({ updatedAt: pages.updatedAt }).from(pages).where(eq(pages.id, pageId)).limit(1);
      throw draftChanged(row?.updatedAt.getTime() ?? Date.now());
    }
  }
}

/**
 * Takes a page offline in its store (the version rows stay; publish listeners get "unpublished", §M.1). T3; today's
 * unpublish lives in src/lib/admin-data/pages.ts (T4 moves it onto this one).
 */
export async function unpublishPage(scope: WriteScope, pageId: string, actor: Actor): Promise<boolean> {
  void scope;
  void pageId;
  void actor;
  return scopedNotImplemented("unpublishPage");
}

async function publishOnce(pageId: string, userId: string, expectedUpdatedAt: number | undefined): Promise<PublishResult | "retry"> {
  const [page] = await db
    .select({ id: pages.id, slug: pages.slug, draft: pages.draft, updatedAt: pages.updatedAt })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) throw new PublishError("not_found", "Page not found.");
  const readStamp = page.updatedAt.getTime();
  // cheap early answer: no rendering for a draft the caller has not seen
  if (expectedUpdatedAt !== undefined && readStamp !== expectedUpdatedAt) throw draftChanged(readStamp);
  if (!isServableSlug(page.slug)) throw new PublishError("invalid", `The address "/${page.slug}" is reserved — choose another slug.`);

  const { doc, issues } = validateDoc(page.draft);
  if (!doc) throw new PublishError("invalid", "The page has errors that must be fixed before publishing.", issues);
  await libraryRule(doc.tracking, userId);
  const before = await liveIds(page.id);

  const res = await renderAndCommit(page.id, doc, {
    kind: "publish",
    label: null,
    userId,
    draft: { readStamp, slug: page.slug, strict: expectedUpdatedAt !== undefined },
  });
  if (res === "retry") return "retry";
  await audit("page.published", {
    userId,
    target: page.id,
    meta: { versionId: res.versionId, slug: res.slug, warnings: issues.length, failedSections: res.renderIssues.map((i) => i.sectionId), turnstile: res.turnstile },
  });
  await auditPixels(page.id, userId, doc.tracking, before, "publish");
  return { versionId: res.versionId, pageId: page.id, slug: res.slug, etag: res.etag, publishedAt: res.publishedAt, issues, renderIssues: res.renderIssues };
}

export interface CommitOptions {
  kind: "publish";
  /** version label ("Pixels only"…); null for a plain publish */
  label: string | null;
  userId: string;
  /**
   * Compare-and-swap on the live version (pixels-only updates): the page must still point at this
   * version when the row is locked, else PublishError("live_changed"). The draft stamp is never
   * checked nor moved.
   */
  baseVersionId?: string | null;
  /**
   * Compare-and-swap on the draft (publishPage): the stamp and slug read before rendering. A draft
   * saved meanwhile → PublishError("conflict") when `strict`, else "retry". The stamp moves forward.
   */
  draft?: { readStamp: number; slug: string; strict: boolean };
}

export interface CommitResult {
  versionId: string;
  slug: string;
  etag: string;
  publishedAt: Date;
  /** sections left out because they failed to render */
  renderIssues: RenderIssue[];
  /** runtime contract of the published HTML (page_versions.runtime_v) */
  runtimeV: number;
  turnstile: boolean;
}

/* ------------------------------------------------------------------ */
/* Database packet size (MariaDB max_allowed_packet; XAMPP ships 1 MB)  */
/* ------------------------------------------------------------------ */

/** Bytes a string takes in a text-protocol statement (mysql2 escapes \0 \b \t \n \r \x1a " ' \\ with a backslash). */
const sqlBytes = (s: string | null | undefined): number => (s ? Buffer.byteLength(s, "utf8") + (s.match(/[\0\b\t\n\r\x1a"'\\]/g)?.length ?? 0) : 0);
/** statement text and the small columns around the big value */
const PACKET_SLACK = 4096;
let packetCache: { at: number; bytes: number } | null = null;

/** The server's max_allowed_packet (cached 10 min); null when it can't be read. */
async function maxPacket(): Promise<number | null> {
  if (packetCache && Date.now() - packetCache.at < 600_000) return packetCache.bytes;
  try {
    const [rows] = (await db.execute(sql`SELECT @@max_allowed_packet AS m`)) as unknown as [{ m: number | string }[]];
    const bytes = Number(rows[0]?.m);
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    packetCache = { at: Date.now(), bytes };
    return bytes;
  } catch {
    return null;
  }
}

/** A refused statement: the server's packet error, or the reset that follows it (the rollback then fails too). */
function packetError(err: unknown): "packet" | "reset" | null {
  for (let e = err as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown } | undefined, i = 0; e && i < 6; e = e.cause as typeof e, i++) {
    if (e.code === "ER_NET_PACKET_TOO_LARGE" || e.errno === 1153 || (typeof e.message === "string" && e.message.includes("max_allowed_packet"))) return "packet";
    if (e.code === "ECONNRESET" || e.code === "PROTOCOL_CONNECTION_LOST" || e.code === "EPIPE") return "reset";
  }
  return null;
}

const tooHeavy = (bytes: number, limit: number | null) =>
  new PublishError(
    "page_too_large",
    `This page is too heavy for the database: one write needs ${Math.ceil(bytes / 1024)} KB` +
      (limit ? ` and the server accepts ${Math.floor(limit / 1024)} KB (MariaDB max_allowed_packet)` : " (more than MariaDB's max_allowed_packet)") +
      ". Remove sections or photos, or raise max_allowed_packet on the database server.",
    [{ level: "error", path: "page.html", message: "The page is too heavy for the database." }],
  );

/**
 * Render a validated document (landing + thank-you, current renderer and store settings), refuse
 * blocking render issues (`page_too_large`, also when one write would exceed the database's
 * max_allowed_packet), insert the immutable "publish" version (with its
 * runtime_v: the runtime contract the rendered HTML embeds) and move the page's publishedVersionId —
 * the page row locked FOR UPDATE and checked against `draft` (publishPage) or `baseVersionId`
 * (pixels-only updates). Shared by every publish path.
 */
export function renderAndCommit(scope: WriteScope, pageId: string, doc: PageDoc, opts: CommitOptions): Promise<CommitResult | "retry">;
/** @deprecated single-tenant; T3 moves the publish paths and the render queue to the scoped overload */
export function renderAndCommit(pageId: string, doc: PageDoc, opts: CommitOptions): Promise<CommitResult | "retry">;
export async function renderAndCommit(...args: [WriteScope, string, PageDoc, CommitOptions] | [string, PageDoc, CommitOptions]): Promise<CommitResult | "retry"> {
  if (typeof args[0] !== "string") return scopedNotImplemented("renderAndCommit");
  const [pageId, doc, opts] = args as [string, PageDoc, CommitOptions];
  const [page] = await db.select({ id: pages.id, slug: pages.slug, publicKey: pages.publicKey }).from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) throw new PublishError("not_found", "Page not found.");
  const slug = opts.draft?.slug ?? page.slug;
  if (!isServableSlug(slug)) throw new PublishError("invalid", `The address "/${slug}" is reserved — choose another slug.`);

  const [store, siteKey] = await Promise.all([storeInfo(), turnstileSiteKey()]);
  const assets = await liveResolverFor(doc, store);
  const urls: DocumentUrls = { landing: landingPath(slug), thankYou: thankYouPath(slug), endpoints: PUBLIC_ENDPOINTS };
  const renderOpts = {
    mode: "live" as const,
    assets,
    pageKey: page.publicKey,
    store,
    urls,
    links: liveLinks(slug),
    origin: publicOrigin(),
    turnstileSiteKey: siteKey,
  };
  // the version id is known before rendering: #lp-config carries it as `ver` (§G.1)
  const versionId = newId();
  const landing = await renderLandingHtml(doc, { ...renderOpts, ver: versionId });
  if (landing.blocking.length) {
    throw new PublishError(
      "page_too_large",
      landing.blocking.map((b) => b.message).join(" "),
      landing.blocking.map((b) => ({ level: "error" as const, path: `page.${b.measure}`, message: b.message })),
    );
  }
  const thanks = await renderThankYouHtml(doc, renderOpts);
  const runtimeV = landing.runtimeV ?? 1;
  // the version row travels as three statements (row + doc, landing HTML, thank-you HTML), so the
  // largest packet is the heaviest of them, never their sum; refused here with a clear message
  // rather than as a reset connection mid-transaction
  const heaviest = Math.max(sqlBytes(JSON.stringify(doc)) + sqlBytes(landing.csp) + sqlBytes(thanks.csp), sqlBytes(landing.html), sqlBytes(thanks.html)) + PACKET_SLACK;
  const packetLimit = await maxPacket();
  if (packetLimit && heaviest > packetLimit) throw tooHeavy(heaviest, packetLimit);

  let publishedAt = new Date();
  const committed = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ updatedAt: pages.updatedAt, slug: pages.slug, publishedVersionId: pages.publishedVersionId })
      .from(pages)
      .where(eq(pages.id, page.id))
      .limit(1)
      .for("update");
    if (!locked) throw new PublishError("not_found", "Page not found.");
    if (locked.slug !== slug) {
      if (opts.draft?.strict) throw draftChanged(locked.updatedAt.getTime());
      return false;
    }
    if (opts.draft) {
      const stamp = locked.updatedAt.getTime();
      if (stamp !== opts.draft.readStamp) {
        if (opts.draft.strict) throw draftChanged(stamp);
        return false;
      }
      // the stamp always moves forward (editors compare it exactly)
      publishedAt = new Date(Math.max(publishedAt.getTime(), stamp + 1));
    }
    if (opts.baseVersionId !== undefined && locked.publishedVersionId !== opts.baseVersionId) {
      throw new PublishError("live_changed", "The live page changed meanwhile. Reload, then try again.");
    }
    await tx.insert(pageVersions).values({
      id: versionId,
      pageId: page.id,
      kind: opts.kind,
      label: opts.label,
      doc,
      csp: landing.csp,
      thankYouCsp: thanks.csp,
      etag: landing.etag,
      checksum: sha256hex(JSON.stringify(doc)),
      runtimeV,
      createdBy: opts.userId,
      createdAt: publishedAt,
    });
    await tx.update(pageVersions).set({ html: landing.html }).where(eq(pageVersions.id, versionId));
    await tx.update(pageVersions).set({ thankYouHtml: thanks.html }).where(eq(pageVersions.id, versionId));
    await tx
      .update(pages)
      .set({
        publishedVersionId: versionId,
        status: "published",
        locale: doc.locale,
        // a pixels-only update never touches the draft stamp (open editors keep saving)
        ...(opts.draft ? { updatedAt: publishedAt } : {}),
      })
      .where(eq(pages.id, page.id));
    return true;
  }).catch((err: unknown) => {
    const why = packetError(err);
    // a reset only means "too large" when this write could be (limit unknown: MariaDB's 1 MB floor)
    if (why === "packet" || (why === "reset" && heaviest > (packetLimit ?? 1024 * 1024))) throw tooHeavy(heaviest, packetLimit);
    throw err;
  });
  if (!committed) return "retry";
  invalidatePublished();
  return { versionId, slug, etag: landing.etag, publishedAt, renderIssues: landing.issues, runtimeV, turnstile: !!siteKey };
}

/* ------------------------------------------------------------------ */
/* Pixels: library rule, audit, pixels-only live update (§A.3)          */
/* ------------------------------------------------------------------ */

/** The library rule as a PublishError (`pixel_not_in_library`). */
async function libraryRule(tracking: Tracking, userId: string): Promise<void> {
  try {
    await enforceLibraryRule(tracking, userId);
  } catch (err) {
    if (err instanceof PixelError && err.code === "pixel_not_in_library") {
      throw new PublishError("pixel_not_in_library", err.message, [{ level: "error", path: "tracking", message: err.message }]);
    }
    throw err;
  }
}

/** The live version's pixel ids (null when the page isn't live). */
async function liveIds(pageId: string): Promise<Tracking | null> {
  const [row] = await db
    .select({ doc: pageVersions.doc, status: pages.status })
    .from(pages)
    .innerJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!row || row.status !== "published") return null;
  return idsOnly((row.doc as { tracking?: Record<string, unknown> } | null)?.tracking ?? null);
}

const masked = (refs: readonly PixelRef[]) => refs.map((r) => `${r.platform}:${maskPixelId(r.id)}`);

/** audit("page.pixels_changed") when the live ids changed; refreshes the usage cache. */
async function auditPixels(pageId: string, userId: string, next: Tracking, before: Tracking | null, mode: "publish" | "pixels_only"): Promise<void> {
  invalidatePixelUsage();
  const diff = trackingDiff(next, before);
  if (!diff.added.length && !diff.removed.length) return;
  await audit("page.pixels_changed", { userId, target: pageId, meta: { added: masked(diff.added), removed: masked(diff.removed), mode } });
}

export interface TrackingOnlyResult {
  versionId: string;
  slug: string;
  publishedAt: Date;
  /** the draft's tracking was patched too (false: it already matched, or it changed meanwhile) */
  draftUpdated: boolean;
  /** the draft was being edited and kept its pixels (compare-and-swap lost 3 times) */
  draftConflict: boolean;
  /** the draft's new stamp when it was patched (editors adopt it) */
  draftUpdatedAt: number | null;
}

/**
 * Pixels-only live update (§A.3): the LIVE version's document with only `tracking` replaced,
 * validated, rendered with the current renderer and committed as a new "publish" version labelled
 * "Pixels only" — the page row locked and checked against `baseVersionId` (PublishError
 * "live_changed"), never against the draft stamp. Then the draft's tracking is patched
 * (compare-and-swap, 3 attempts) unless it already matches. Open tabs keep ordering against the
 * previous version through the 72 h rule.
 */
export async function publishTrackingOnly(
  pageId: string,
  userId: string,
  tracking: Tracking,
  baseVersionId: string,
  /** patchDraft false: the caller already patched the draft (Replace on pages…) */
  opts: { patchDraft?: boolean } = {},
): Promise<TrackingOnlyResult> {
  const [row] = await db
    .select({ status: pages.status, publishedVersionId: pages.publishedVersionId, doc: pageVersions.doc })
    .from(pages)
    .leftJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!row) throw new PublishError("not_found", "Page not found.");
  if (row.status !== "published" || !row.publishedVersionId || !row.doc) throw new PublishError("not_live", "This page isn't live. Publish it first.");
  if (row.publishedVersionId !== baseVersionId) throw new PublishError("live_changed", "The live page changed meanwhile. Reload, then try again.");
  const { doc: liveDoc } = validateDoc(row.doc);
  if (!liveDoc) throw new PublishError("invalid", "The live version can't be read. Publish the page from the builder instead.");
  // live pages fire ids only; "No pixel" is kept only when there are none
  const ids = idsOnly(tracking);
  const nextTracking: Tracking = sameIds(ids, {}) && tracking.none ? { none: true } : ids;
  const { doc, issues } = validateDoc({ ...liveDoc, tracking: nextTracking });
  if (!doc) throw new PublishError("invalid", "These pixels can't be published.", issues);
  await libraryRule(doc.tracking, userId);
  const before = idsOnly(liveDoc.tracking);

  const res = await renderAndCommit(pageId, doc, { kind: "publish", label: "Pixels only", userId, baseVersionId });
  if (res === "retry") throw new PublishError("live_changed", "The live page changed meanwhile. Reload, then try again.");
  await audit("page.published", { userId, target: pageId, meta: { versionId: res.versionId, slug: res.slug, pixelsOnly: true } });
  await auditPixels(pageId, userId, doc.tracking, before, "pixels_only");

  // the draft follows (compare-and-swap on its stamp; an editor saving meanwhile keeps its own)
  let draftUpdated = false;
  let draftConflict = false;
  let draftUpdatedAt: number | null = null;
  for (let attempt = 0; opts.patchDraft !== false && attempt < 3; attempt++) {
    const [d] = await db.select({ draft: pages.draft, updatedAt: pages.updatedAt }).from(pages).where(eq(pages.id, pageId)).limit(1);
    if (!d || !d.draft || typeof d.draft !== "object") break;
    const current = (d.draft as { tracking?: Record<string, unknown> }).tracking ?? {};
    if (sameIds(current, doc.tracking) && !!current.none === !!doc.tracking.none) break;
    const stamp = new Date(Math.max(Date.now(), d.updatedAt.getTime() + 1));
    const nextDraft = { ...(d.draft as PageDoc), tracking: { ...doc.tracking } };
    const upd = await db
      .update(pages)
      .set({ draft: nextDraft, updatedAt: stamp })
      .where(and(eq(pages.id, pageId), eq(pages.updatedAt, d.updatedAt)));
    const n = (Array.isArray(upd) ? (upd[0] as { affectedRows?: number }) : (upd as { affectedRows?: number }))?.affectedRows ?? 0;
    if (n === 1) {
      draftUpdated = true;
      draftUpdatedAt = stamp.getTime();
      break;
    }
    if (attempt === 2) draftConflict = true;
  }
  invalidatePixelUsage();
  return { versionId: res.versionId, slug: res.slug, publishedAt: res.publishedAt, draftUpdated, draftConflict, draftUpdatedAt };
}

/* ------------------------------------------------------------------ */
/* Serving                                                             */
/* ------------------------------------------------------------------ */

export interface PublishedPage {
  pageId: string;
  versionId: string;
  slug: string;
  html: string;
  csp: string;
  etag: string;
  thankYouHtml: string;
  thankYouCsp: string;
  noindex: boolean;
  /** the published document (theme, locale, offers… of legal documents) */
  doc: PageDoc;
  /** when this version was published */
  publishedAt: Date;
}

const HOME_KEY = "/"; // never a slug

async function loadBy(where: SQL): Promise<PublishedPage | null> {
  const [row] = await db
    .select({
      pageId: pages.id,
      slug: pages.slug,
      versionId: pageVersions.id,
      html: pageVersions.html,
      csp: pageVersions.csp,
      etag: pageVersions.etag,
      thankYouHtml: pageVersions.thankYouHtml,
      thankYouCsp: pageVersions.thankYouCsp,
      doc: pageVersions.doc,
      createdAt: pageVersions.createdAt,
    })
    .from(pages)
    .innerJoin(pageVersions, eq(pageVersions.id, pages.publishedVersionId))
    .where(and(where, eq(pages.status, "published")))
    .limit(1);
  if (!row || !row.html || !row.csp || !row.etag || !row.thankYouHtml || !row.thankYouCsp) return null;
  return {
    pageId: row.pageId,
    versionId: row.versionId,
    slug: row.slug,
    html: row.html,
    csp: row.csp,
    etag: row.etag,
    thankYouHtml: row.thankYouHtml,
    thankYouCsp: row.thankYouCsp,
    noindex: row.doc?.seo?.noindex === true,
    doc: row.doc,
    publishedAt: row.createdAt,
  };
}

/** The published version served at /<slug> (null when unknown, unpublished or reserved). */
export async function getPublishedBySlug(slug: string): Promise<PublishedPage | null> {
  if (!isServableSlug(slug)) return null;
  const hit = cacheGet<PublishedPage | null>("published", slug);
  if (hit) return hit.value;
  return cacheSet("published", slug, await loadBy(eq(pages.slug, slug)));
}

/** The page served at "/": settings "home".pageId, else the most recently published page. */
export async function getHomePublished(): Promise<PublishedPage | null> {
  const hit = cacheGet<PublishedPage | null>("published", HOME_KEY);
  if (hit) return hit.value;
  const { home } = await getSettings(["home"]);
  let value: PublishedPage | null = null;
  if (home.pageId) value = await loadBy(eq(pages.id, home.pageId));
  if (!value) {
    const [latest] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.status, "published"))
      .orderBy(desc(pages.updatedAt))
      .limit(1);
    if (latest) value = await loadBy(eq(pages.id, latest.id));
  }
  return cacheSet("published", HOME_KEY, value);
}

/* ------------------------------------------------------------------ */
/* Legal documents                                                     */
/* ------------------------------------------------------------------ */

/** The page a legal document is dressed like: /legal/<kind>?p=<slug>, else the home page. */
export async function getLegalSource(slug: string | null): Promise<PublishedPage | null> {
  if (slug && isServableSlug(slug)) {
    const page = await getPublishedBySlug(slug);
    if (page) return page;
  }
  return getHomePublished();
}

/** When Settings → Store last changed (the legal texts are built from it). */
async function storeUpdatedAt(): Promise<Date | null> {
  const [row] = await db.select({ updatedAt: settings.updatedAt }).from(settings).where(eq(settings.key, "store")).limit(1);
  return row?.updatedAt ?? null;
}

/**
 * A legal document of a published page (theme, locale, market, form fields and pixels of that page;
 * identity from the current store settings), "updated" at the later of the publish and the last
 * store change. Null when the stored document no longer validates.
 */
export async function getLegalDocument(page: PublishedPage, kind: LegalKind): Promise<RenderedHtml | null> {
  const key = `${page.versionId}:${page.slug}:${kind}`;
  const hit = cacheGet<RenderedHtml | null>("legal", key);
  if (hit) return hit.value;
  const { doc } = validateDoc(page.doc);
  if (!doc) return cacheSet("legal", key, null);
  const [store, changed] = await Promise.all([storeInfo(), storeUpdatedAt()]);
  const rows = store.logo ? await getAssetsByIds([store.logo.id]) : [];
  const updatedAt = new Date(Math.max(page.publishedAt.getTime(), changed?.getTime() ?? 0)).toISOString();
  const rendered = await renderLegalHtml(doc, kind, {
    mode: "live",
    assets: liveAssetResolver(rows),
    store,
    links: liveLinks(page.slug),
    updatedAt,
  });
  return cacheSet("legal", key, rendered);
}
