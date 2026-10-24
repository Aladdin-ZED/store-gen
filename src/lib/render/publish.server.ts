import "server-only";
/**
 * Publishing of landing pages, per store (docs/STORE-SAAS.md §H.3, §M.1, PUB-*; serving: ./store-pages.server.ts).
 *
 *   const v = await publishPage(scope, pageId, { actor, expectedUpdatedAt });   // draft → validated → rendered → immutable version
 *   const r = await renderAndCommit(scope, pageId, doc, { kind: "publish", label, userId, actor, baseVersionId });
 *   await unpublishPage(scope, pageId, actor);
 *
 * The scoped forms read and write the scope's store only (every predicate carries `store_id`; another store's page
 * id is `not_found`), render with the store render context of now (./store-context.server.ts: base, origin,
 * identity, Turnstile, resolver, add-ons, purchaseInBrowser), refuse a store that may not publish (`forbidden`:
 * the publish state cap, §A.5.2), await `runPrePublishChecks` before the version row (§M.1: a refusal is
 * `design_blocked` / `honesty_blocked` / `budget_blocked` with its GateItems) and run the publish listeners after
 * the commit. The version-row transaction sets `pages.first_published_at` once (COALESCE; never reset by
 * unpublish, republish, restore or a re-render; rev 5, CRIT2-5) and audits in the page's store.
 *
 * Pixels (docs/OFFERS.md §A.3): the library rule is the pixel library's (T4, per store); the scoped publish runs
 * it through `opts.libraryRule` before rendering (an unknown id → `pixel_not_in_library`), so the rule stays where
 * the library lives. The single-tenant forms (`publishPage(pageId, userId)`, `renderAndCommit(pageId, …)`,
 * `publishTrackingOnly`) keep compiling for today's callers until T4 moves them; their inserts carry no store and
 * are refused by the schema's legacy shim (`store_id is required`).
 *
 * Published HTML is rendered once at publish time and stored in page_versions (html, thank-you html, both CSPs,
 * etag, checksum); visitors get those bytes with zero React on the server per request.
 */
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { audit } from "@/lib/audit";
import { PixelError, enforceLibraryRule } from "@/lib/pixels/library.server";
import { idsOnly, maskPixelId, sameIds, trackingDiff, type PixelRef } from "@/lib/pixels/library";
import { invalidatePixelUsage } from "@/lib/pixels/usage.server";
import { isGatePath } from "@/lib/auth/gate";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pages, pageVersions } from "@/lib/db/schema";
import { getAssetsByIds } from "@/lib/media";
import type { PageDoc, Tracking } from "@/lib/page/schema";
import { validateDoc, type DocIssue } from "@/lib/page/validate";
import { getSetting } from "@/lib/settings";
import { STORE_RESERVED_SLUGS } from "@/lib/tenancy/handles";
import { getStoreById } from "@/lib/tenancy/public";
import type { Actor, GateItem, StoreRow, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { buildTheme } from "@/lib/theme";
import { collectAssetIds, liveAssetResolver, liveLinks, type AssetResolver, type StoreInfo } from "@/landing/context";
import type { DocumentUrls } from "@/landing/document";
import { invalidatePublished, invalidateStoreRender } from "./cache.server";
import { renderLandingHtml, renderThankYouHtml, type RenderIssue } from "./core";
import { runPrePublishChecks, runPublishListeners, type AssetMeta, type PrePublishCode, type PrePublishCtx } from "./prepublish";
import { loadStoreRenderContext, PUBLIC_ENDPOINTS, storeAssetResolver, storeRenderOptions } from "./store-context.server";

export { invalidatePublished, invalidateStoreRender } from "./cache.server";
export { PUBLIC_ENDPOINTS } from "./store-context.server";

/* ------------------------------------------------------------------ */
/* Slugs                                                               */
/* ------------------------------------------------------------------ */

/** Slugs that can never be a single-tenant root page (app routes, the thank-you suffix, legal documents). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(["admin", "api", "media", "fonts", "dev", "_next", "merci", "dev-fixtures", "legal"]);
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/**
 * A slug a root landing page can live at: the slug pattern, not reserved, and never the secret admin gate path.
 * @deprecated single-tenant root pages; store pages use isStoreSlug (no gate check: the gate is a root path of the
 * platform host only, and refusing it inside a store would be an oracle for the secret)
 */
export function isServableSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) && !isGatePath(`/${slug}`);
}

/** Root paths a store host passes to the app itself (static fonts, the dev fixtures), never a page slug. */
const STORE_HOST_PATHS: ReadonlySet<string> = new Set(["fonts", "dev", "dev-fixtures"]);

/**
 * A slug a store page can live at (§C.4.1): the slug pattern, not one of the store-reserved slugs (route segments,
 * locale prefixes, SEO files; `@` template slugs never match the pattern) and not a root path of a store host.
 */
export function isStoreSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !STORE_RESERVED_SLUGS.has(slug) && !STORE_HOST_PATHS.has(slug);
}

/** @deprecated single-tenant root paths; store pages: storePath(store, `/${slug}`) (./store-context.server.ts) */
export const landingPath = (slug: string) => `/${slug}`;
/** @deprecated single-tenant root paths; store pages: storePath(store, `/${slug}/merci`) */
export const thankYouPath = (slug: string) => `/${slug}/merci`;

/** Absolute public origin from PUBLIC_URL ("https://shop.ma"), or undefined when unset/invalid. @deprecated use platformOrigin() / storeOrigin() */
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

/* ------------------------------------------------------------------ */
/* Errors and options                                                  */
/* ------------------------------------------------------------------ */

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
  | "not_live"
  /** the store may not publish in its state (pending, restricted, suspended, closed…: the §A.5.2 cap) */
  | "forbidden"
  /** a pre-publish gate refused the page (§M.1); `items` lists why */
  | PrePublishCode;

export class PublishError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    message: string,
    readonly issues: DocIssue[] = [],
    /** "conflict": the page's current updatedAt (ms), so an editor can reload or resolve */
    readonly serverUpdatedAt?: number,
    /** the gate refusals (design_blocked, honesty_blocked, budget_blocked): what the publish dialog lists */
    readonly items: GateItem[] = [],
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

/** The scoped publish's options: who publishes (audited in the page's store) and the draft stamp. */
export interface ScopedPublishOptions extends PublishOptions {
  actor: Actor;
  /**
   * The store's pixel library rule (T4, docs/OFFERS.md §A.3), run on the validated document before it renders:
   * throws PixelError("pixel_not_in_library") for ids the actor may not add. Omitted: no pixel check (callers that
   * publish a document whose pixels did not change).
   */
  libraryRule?: (tracking: Tracking) => Promise<void>;
}

/** Re-render attempts when the draft keeps changing during an unchecked publish. */
const PUBLISH_ATTEMPTS = 3;

const draftChanged = (serverUpdatedAt: number) =>
  new PublishError("conflict", "This page was changed somewhere else. Load the latest version, then publish again.", [], serverUpdatedAt);

const notFound = () => new PublishError("not_found", "Page not found.");
const reservedSlug = (slug: string) => new PublishError("invalid", `The address "/${slug}" is reserved — choose another slug.`);

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
  /** soft gate items of the publish (§M.1 notes; empty when no gate is registered) */
  notes?: GateItem[];
}

export interface CommitOptions {
  kind: "publish";
  /** version label ("Pixels only"…); null for a plain publish */
  label: string | null;
  userId: string;
  /** who commits (audit, gates, listeners); scoped calls only. Default: a user actor of `userId`. */
  actor?: Actor;
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
  /** soft gate items (§M.1) */
  notes?: GateItem[];
}

const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** `UPDATE … ` affected rows (mysql2 result shapes). */
const affected = (res: unknown): number => (Array.isArray(res) ? (res[0] as { affectedRows?: number }) : (res as { affectedRows?: number }))?.affectedRows ?? 0;

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

/** The version row travels as three statements (row + doc, landing HTML, thank-you HTML): the largest packet is the heaviest of them. */
const heaviestStatement = (doc: PageDoc, landing: { html: string; csp: string }, thanks: { html: string; csp: string }) =>
  Math.max(sqlBytes(JSON.stringify(doc)) + sqlBytes(landing.csp) + sqlBytes(thanks.csp), sqlBytes(landing.html), sqlBytes(thanks.html)) + PACKET_SLACK;

const blockingError = (blocking: { message: string; measure: string }[]) =>
  new PublishError(
    "page_too_large",
    blocking.map((b) => b.message).join(" "),
    blocking.map((b) => ({ level: "error" as const, path: `page.${b.measure}`, message: b.message })),
  );

/** The publish library rule as a PublishError (`pixel_not_in_library`). */
async function asPublishError(rule: () => Promise<void>): Promise<void> {
  try {
    await rule();
  } catch (err) {
    if (err instanceof PixelError && err.code === "pixel_not_in_library") {
      throw new PublishError("pixel_not_in_library", err.message, [{ level: "error", path: "tracking", message: err.message }]);
    }
    throw err;
  }
}

const masked = (refs: readonly PixelRef[]) => refs.map((r) => `${r.platform}:${maskPixelId(r.id)}`);

/**
 * The `pages` SET value of a publish for `first_published_at` (rev 5, CRIT2-5): the first publish instant, written
 * once; unpublish, republish, restore and re-renders keep it.
 */
export const firstPublishedAt = (at: Date) => sql`COALESCE(${pages.firstPublishedAt}, ${at})`;

/* ------------------------------------------------------------------ */
/* Scoped publish (per store)                                          */
/* ------------------------------------------------------------------ */

const userActor = (userId: string): Actor => ({ kind: "user", userId: userId || null, impersonatorId: null, ip: null });

/** The audit columns of a row about the scope's store (§F.5). */
const auditScope = (scope: StoreScope, actor: Actor) => ({ storeId: scope.storeId, actorKind: actor.kind, impersonatorId: actor.impersonatorId });

/** The scope's store, refused unless it may publish now: `active` (the publish cap of §A.5.2; the seam checks it too). */
async function publishingStore(scope: StoreScope): Promise<StoreRow> {
  const store = await getStoreById(scope.storeId);
  if (!store) throw notFound();
  if (store.status !== "active") throw new PublishError("forbidden", "This store can't publish pages right now.");
  return store;
}

const GATE_MESSAGES: Record<PrePublishCode, string> = {
  budget_blocked: "This page is too heavy to publish. The publish dialog lists what to lighten.",
  honesty_blocked: "This page makes a claim it can't support. The publish dialog lists what to fix.",
  design_blocked: "This page doesn't meet the design checks yet. The publish dialog lists what to fix.",
};

/** The doc of the version a page currently serves, in the store (the gates' `prev`, the listeners' doc). */
async function publishedDoc(scope: StoreScope, versionId: string | null): Promise<PageDoc | null> {
  if (!versionId) return null;
  const [row] = await db
    .select({ doc: pageVersions.doc })
    .from(pageVersions)
    .where(and(eq(pageVersions.storeId, scope.storeId), eq(pageVersions.id, versionId)))
    .limit(1);
  return row?.doc ? validateDoc(row.doc).doc : null;
}

/** What the gates know about the document's assets (no bytes). */
function assetMeta(rows: readonly { id: string; mime: string; width: number; height: number; bytes: number; alpha: boolean }[]): ReadonlyMap<string, AssetMeta> {
  return new Map(rows.map((r) => [r.id, { id: r.id, mime: r.mime, width: r.width, height: r.height, bytes: r.bytes, hasAlpha: r.alpha }]));
}

/** The live version's pixel ids in the store (null when the page isn't live). */
async function liveIdsInStore(scope: StoreScope, pageId: string): Promise<Tracking | null> {
  const [row] = await db
    .select({ doc: pageVersions.doc, status: pages.status })
    .from(pages)
    .innerJoin(pageVersions, and(eq(pageVersions.id, pages.publishedVersionId), eq(pageVersions.storeId, pages.storeId)))
    .where(and(eq(pages.storeId, scope.storeId), eq(pages.id, pageId)))
    .limit(1);
  if (!row || row.status !== "published") return null;
  return idsOnly((row.doc as { tracking?: Record<string, unknown> } | null)?.tracking ?? null);
}

/** audit("page.pixels_changed") in the store when the live ids changed. */
async function auditPixelsInStore(scope: StoreScope, actor: Actor, pageId: string, next: Tracking, before: Tracking | null, mode: "publish" | "pixels_only"): Promise<void> {
  invalidatePixelUsage();
  const diff = trackingDiff(next, before);
  if (!diff.added.length && !diff.removed.length) return;
  await audit("page.pixels_changed", {
    userId: actor.userId,
    ip: actor.ip,
    target: pageId,
    meta: { added: masked(diff.added), removed: masked(diff.removed), mode },
    scope: auditScope(scope, actor),
  });
}

async function publishInStore(scope: WriteScope, pageId: string, opts: ScopedPublishOptions): Promise<PublishResult> {
  for (let attempt = 1; ; attempt++) {
    const res = await publishInStoreOnce(scope, pageId, opts);
    if (res !== "retry") return res;
    // an autosave landed while rendering (unchecked publish): render the newer draft
    if (attempt >= PUBLISH_ATTEMPTS) {
      const [row] = await db
        .select({ updatedAt: pages.updatedAt })
        .from(pages)
        .where(and(eq(pages.storeId, scope.storeId), eq(pages.id, pageId)))
        .limit(1);
      throw draftChanged(row?.updatedAt.getTime() ?? Date.now());
    }
  }
}

async function publishInStoreOnce(scope: WriteScope, pageId: string, opts: ScopedPublishOptions): Promise<PublishResult | "retry"> {
  const [page] = await db
    .select({ id: pages.id, slug: pages.slug, draft: pages.draft, updatedAt: pages.updatedAt })
    .from(pages)
    .where(and(eq(pages.storeId, scope.storeId), eq(pages.id, pageId)))
    .limit(1);
  if (!page) throw notFound();
  const readStamp = page.updatedAt.getTime();
  // cheap early answer: no rendering for a draft the caller has not seen
  if (opts.expectedUpdatedAt !== undefined && readStamp !== opts.expectedUpdatedAt) throw draftChanged(readStamp);
  if (!isStoreSlug(page.slug)) throw reservedSlug(page.slug);

  const { doc, issues } = validateDoc(page.draft);
  if (!doc) throw new PublishError("invalid", "The page has errors that must be fixed before publishing.", issues);
  const rule = opts.libraryRule;
  if (rule) await asPublishError(() => rule(doc.tracking));
  const before = await liveIdsInStore(scope, page.id);

  const res = await commitInStore(scope, page.id, doc, {
    kind: "publish",
    label: null,
    userId: opts.actor.userId ?? "",
    actor: opts.actor,
    draft: { readStamp, slug: page.slug, strict: opts.expectedUpdatedAt !== undefined },
  });
  if (res === "retry") return "retry";
  await audit("page.published", {
    userId: opts.actor.userId,
    ip: opts.actor.ip,
    target: page.id,
    meta: { versionId: res.versionId, slug: res.slug, warnings: issues.length, failedSections: res.renderIssues.map((i) => i.sectionId), turnstile: res.turnstile },
    scope: auditScope(scope, opts.actor),
  });
  await auditPixelsInStore(scope, opts.actor, page.id, doc.tracking, before, "publish");
  return {
    versionId: res.versionId,
    pageId: page.id,
    slug: res.slug,
    etag: res.etag,
    publishedAt: res.publishedAt,
    issues,
    renderIssues: res.renderIssues,
    ...(res.notes?.length ? { notes: res.notes } : {}),
  };
}

/**
 * The scoped renderAndCommit: the store render context of now, the gates (block mode), then the version row and the
 * page pointer under the page's row lock in the store, `first_published_at` set once, the store's render cache
 * dropped, the publish listeners told.
 */
async function commitInStore(scope: WriteScope, pageId: string, doc: PageDoc, opts: CommitOptions): Promise<CommitResult | "retry"> {
  const store = await publishingStore(scope);
  const [page] = await db
    .select({ id: pages.id, slug: pages.slug, publicKey: pages.publicKey, publishedVersionId: pages.publishedVersionId })
    .from(pages)
    .where(and(eq(pages.storeId, scope.storeId), eq(pages.id, pageId)))
    .limit(1);
  if (!page) throw notFound();
  const slug = opts.draft?.slug ?? page.slug;
  if (!isStoreSlug(slug)) throw reservedSlug(slug);
  const actor = opts.actor ?? userActor(opts.userId);

  const rc = await loadStoreRenderContext(scope, store, { pageId: page.id });
  const { resolver, rows } = await storeAssetResolver(scope, rc, doc);
  const renderOpts = storeRenderOptions(rc, { slug, pageKey: page.publicKey, assets: resolver });
  // the version id is known before rendering: #lp-config carries it as `ver` (§G.1)
  const versionId = newId();
  const landing = await renderLandingHtml(doc, { ...renderOpts, ver: versionId });
  if (landing.blocking.length) throw blockingError(landing.blocking);
  const thanks = await renderThankYouHtml(doc, renderOpts);
  const runtimeV = landing.runtimeV ?? 1;

  // §M.1: every registered gate runs before the version row; a refusal names its items
  const gateCtx: PrePublishCtx = {
    scope,
    store,
    pageId: page.id,
    doc,
    prev: await publishedDoc(scope, page.publishedVersionId),
    theme: buildTheme(doc.theme, doc.locale),
    assets: assetMeta(rows),
    actor,
    now: new Date(),
    mode: "block",
    html: landing.html,
  };
  const gate = await runPrePublishChecks(gateCtx);
  if (!gate.ok) throw new PublishError(gate.code, GATE_MESSAGES[gate.code], [], undefined, gate.items);

  // refused here with a clear message rather than as a reset connection mid-transaction
  const heaviest = heaviestStatement(doc, landing, thanks);
  const packetLimit = await maxPacket();
  if (packetLimit && heaviest > packetLimit) throw tooHeavy(heaviest, packetLimit);

  let publishedAt = new Date();
  const inPage = and(eq(pages.storeId, scope.storeId), eq(pages.id, page.id));
  const committed = await db
    .transaction(async (tx) => {
      const [locked] = await tx
        .select({ updatedAt: pages.updatedAt, slug: pages.slug, publishedVersionId: pages.publishedVersionId })
        .from(pages)
        .where(inPage)
        .limit(1)
        .for("update");
      if (!locked) throw notFound();
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
        storeId: scope.storeId,
        pageId: page.id,
        kind: opts.kind,
        label: opts.label,
        doc,
        csp: landing.csp,
        thankYouCsp: thanks.csp,
        etag: landing.etag,
        checksum: sha256hex(JSON.stringify(doc)),
        runtimeV,
        createdBy: actor.userId,
        createdAt: publishedAt,
      });
      const inVersion = and(eq(pageVersions.storeId, scope.storeId), eq(pageVersions.id, versionId));
      await tx.update(pageVersions).set({ html: landing.html }).where(inVersion);
      await tx.update(pageVersions).set({ thankYouHtml: thanks.html }).where(inVersion);
      await tx
        .update(pages)
        .set({
          publishedVersionId: versionId,
          status: "published",
          locale: doc.locale,
          firstPublishedAt: firstPublishedAt(publishedAt),
          // a pixels-only update never touches the draft stamp (open editors keep saving)
          ...(opts.draft ? { updatedAt: publishedAt } : {}),
        })
        .where(inPage);
      return true;
    })
    .catch((err: unknown) => {
      const why = packetError(err);
      // a reset only means "too large" when this write could be (limit unknown: MariaDB's 1 MB floor)
      if (why === "packet" || (why === "reset" && heaviest > (packetLimit ?? 1024 * 1024))) throw tooHeavy(heaviest, packetLimit);
      throw err;
    });
  if (!committed) return "retry";
  invalidateStoreRender(scope.storeId);
  await runPublishListeners({ ...gateCtx, versionId, event: "published" });
  return {
    versionId,
    slug,
    etag: landing.etag,
    publishedAt,
    renderIssues: landing.issues,
    runtimeV,
    turnstile: !!rc.turnstileSiteKey,
    ...(gate.notes.length ? { notes: gate.notes } : {}),
  };
}

/**
 * Takes a page offline in its store: `status` back to draft, the version rows and `first_published_at` kept, the
 * store's render cache dropped, audit `page.unpublished`, publish listeners told ("unpublished", §M.1). False when
 * the page is not live in this store (another store's id included).
 */
export async function unpublishPage(scope: WriteScope, pageId: string, actor: Actor): Promise<boolean> {
  const live = and(eq(pages.storeId, scope.storeId), eq(pages.id, pageId), eq(pages.status, "published"));
  const [row] = await db.select({ versionId: pages.publishedVersionId }).from(pages).where(live).limit(1);
  if (!row) return false;
  const res = await db.update(pages).set({ status: "draft" }).where(live);
  if (affected(res) !== 1) return false;
  invalidateStoreRender(scope.storeId);
  await audit("page.unpublished", { userId: actor.userId, ip: actor.ip, target: pageId, scope: auditScope(scope, actor) });
  const [store, doc] = await Promise.all([getStoreById(scope.storeId), publishedDoc(scope, row.versionId)]);
  if (store && doc && row.versionId) {
    await runPublishListeners({
      scope,
      store,
      pageId,
      doc,
      prev: doc,
      theme: buildTheme(doc.theme, doc.locale),
      assets: new Map(),
      actor,
      now: new Date(),
      mode: "warn",
      versionId: row.versionId,
      event: "unpublished",
    });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Entry points (the scoped forms, and today's single-tenant ones)     */
/* ------------------------------------------------------------------ */

/**
 * Validate the page draft, render landing + thank-you pages, store them as an immutable "publish"
 * version and point the page at it. Throws PublishError("not_found" | "invalid" | "conflict" |
 * "page_too_large" | "forbidden" | "pixel_not_in_library" | a gate code).
 *
 * The version always holds exactly the draft whose stamp is checked in the transaction: the row is
 * locked (FOR UPDATE) and its updated_at compared with the one read before rendering.
 */
export function publishPage(scope: WriteScope, pageId: string, opts: ScopedPublishOptions): Promise<PublishResult>;
/** @deprecated single-tenant; T4 moves the callers to the scoped overload */
export function publishPage(pageId: string, userId: string, opts?: PublishOptions): Promise<PublishResult>;
export async function publishPage(...args: [WriteScope, string, ScopedPublishOptions] | [string, string, PublishOptions?]): Promise<PublishResult> {
  if (typeof args[0] !== "string") {
    const [scope, pageId, opts] = args as [WriteScope, string, ScopedPublishOptions];
    return publishInStore(scope, pageId, opts);
  }
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
 * Render a validated document (landing + thank-you, current renderer and store context), refuse
 * blocking render issues (`page_too_large`, also when one write would exceed the database's
 * max_allowed_packet) and the gates, insert the immutable "publish" version (with its runtime_v: the
 * runtime contract the rendered HTML embeds) and move the page's publishedVersionId — the page row
 * locked FOR UPDATE and checked against `draft` (publishPage) or `baseVersionId` (pixels-only
 * updates). Shared by every publish path.
 */
export function renderAndCommit(scope: WriteScope, pageId: string, doc: PageDoc, opts: CommitOptions): Promise<CommitResult | "retry">;
/** @deprecated single-tenant; T4 moves the publish paths (and P8 the render queue) to the scoped overload */
export function renderAndCommit(pageId: string, doc: PageDoc, opts: CommitOptions): Promise<CommitResult | "retry">;
export async function renderAndCommit(...args: [WriteScope, string, PageDoc, CommitOptions] | [string, PageDoc, CommitOptions]): Promise<CommitResult | "retry"> {
  if (typeof args[0] !== "string") {
    const [scope, pageId, doc, opts] = args as [WriteScope, string, PageDoc, CommitOptions];
    return commitInStore(scope, pageId, doc, opts);
  }
  const [pageId, doc, opts] = args as [string, PageDoc, CommitOptions];
  return commitLegacy(pageId, doc, opts);
}

/* ------------------------------------------------------------------ */
/* Single-tenant path (@deprecated: kept for today's callers, T4)      */
/* ------------------------------------------------------------------ */

/** Store identity for documents from the legacy global `store` setting. @deprecated store documents: loadStoreRenderContext */
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

/** Live asset resolver for every asset the document (and store logo) references. @deprecated unscoped (PUB-07): storeAssetResolver */
export async function liveResolverFor(doc: PageDoc, store: StoreInfo): Promise<AssetResolver> {
  const rows = await getAssetsByIds(collectAssetIds(doc, [store.logo]));
  return liveAssetResolver(rows);
}

/** Turnstile site key to embed: only when a secret is configured too (the order API verifies tokens). */
async function turnstileSiteKey(): Promise<string | undefined> {
  const t = await getSetting("turnstile");
  return t.siteKey && t.secretKey ? t.siteKey : undefined;
}

async function publishOnce(pageId: string, userId: string, expectedUpdatedAt: number | undefined): Promise<PublishResult | "retry"> {
  const [page] = await db
    .select({ id: pages.id, slug: pages.slug, draft: pages.draft, updatedAt: pages.updatedAt })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  if (!page) throw notFound();
  const readStamp = page.updatedAt.getTime();
  // cheap early answer: no rendering for a draft the caller has not seen
  if (expectedUpdatedAt !== undefined && readStamp !== expectedUpdatedAt) throw draftChanged(readStamp);
  if (!isServableSlug(page.slug)) throw reservedSlug(page.slug);

  const { doc, issues } = validateDoc(page.draft);
  if (!doc) throw new PublishError("invalid", "The page has errors that must be fixed before publishing.", issues);
  await asPublishError(() => enforceLibraryRule(doc.tracking, userId));
  const before = await liveIds(page.id);

  const res = await commitLegacy(page.id, doc, {
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

async function commitLegacy(pageId: string, doc: PageDoc, opts: CommitOptions): Promise<CommitResult | "retry"> {
  const [page] = await db.select({ id: pages.id, slug: pages.slug, publicKey: pages.publicKey }).from(pages).where(eq(pages.id, pageId)).limit(1);
  if (!page) throw notFound();
  const slug = opts.draft?.slug ?? page.slug;
  if (!isServableSlug(slug)) throw reservedSlug(slug);

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
  if (landing.blocking.length) throw blockingError(landing.blocking);
  const thanks = await renderThankYouHtml(doc, renderOpts);
  const runtimeV = landing.runtimeV ?? 1;
  const heaviest = heaviestStatement(doc, landing, thanks);
  const packetLimit = await maxPacket();
  if (packetLimit && heaviest > packetLimit) throw tooHeavy(heaviest, packetLimit);

  let publishedAt = new Date();
  const committed = await db
    .transaction(async (tx) => {
      const [locked] = await tx
        .select({ updatedAt: pages.updatedAt, slug: pages.slug, publishedVersionId: pages.publishedVersionId })
        .from(pages)
        .where(eq(pages.id, page.id))
        .limit(1)
        .for("update");
      if (!locked) throw notFound();
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
          firstPublishedAt: firstPublishedAt(publishedAt),
          ...(opts.draft ? { updatedAt: publishedAt } : {}),
        })
        .where(eq(pages.id, page.id));
      return true;
    })
    .catch((err: unknown) => {
      const why = packetError(err);
      if (why === "packet" || (why === "reset" && heaviest > (packetLimit ?? 1024 * 1024))) throw tooHeavy(heaviest, packetLimit);
      throw err;
    });
  if (!committed) return "retry";
  invalidatePublished();
  return { versionId, slug, etag: landing.etag, publishedAt, renderIssues: landing.issues, runtimeV, turnstile: !!siteKey };
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
 * previous version through the 72 h rule. @deprecated single-tenant; T4 rebuilds it on renderAndCommit(scope, …).
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
  if (!row) throw notFound();
  if (row.status !== "published" || !row.publishedVersionId || !row.doc) throw new PublishError("not_live", "This page isn't live. Publish it first.");
  if (row.publishedVersionId !== baseVersionId) throw new PublishError("live_changed", "The live page changed meanwhile. Reload, then try again.");
  const { doc: liveDoc } = validateDoc(row.doc);
  if (!liveDoc) throw new PublishError("invalid", "The live version can't be read. Publish the page from the builder instead.");
  // live pages fire ids only; "No pixel" is kept only when there are none
  const ids = idsOnly(tracking);
  const nextTracking: Tracking = sameIds(ids, {}) && tracking.none ? { none: true } : ids;
  const { doc, issues } = validateDoc({ ...liveDoc, tracking: nextTracking });
  if (!doc) throw new PublishError("invalid", "These pixels can't be published.", issues);
  await asPublishError(() => enforceLibraryRule(doc.tracking, userId));
  const before = idsOnly(liveDoc.tracking);

  const res = await commitLegacy(pageId, doc, { kind: "publish", label: "Pixels only", userId, baseVersionId });
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
    if (affected(upd) === 1) {
      draftUpdated = true;
      draftUpdatedAt = stamp.getTime();
      break;
    }
    if (attempt === 2) draftConflict = true;
  }
  invalidatePixelUsage();
  return { versionId: res.versionId, slug: res.slug, publishedAt: res.publishedAt, draftUpdated, draftConflict, draftUpdatedAt };
}
