import "server-only";
/**
 * Builder persistence (server only). Call these after requireUser() — the server actions in
 * ./actions.ts do the auth, input validation and audit; this module owns the SQL and the rules:
 *
 *  - Drafts are written with optimistic concurrency: `UPDATE … WHERE updated_at = <base>`; a page
 *    changed elsewhere (another tab, a teammate, a restore from the History screen) is a conflict.
 *  - Autosave versions: at most one every AUTOSAVE_EVERY_MS per page, the newest AUTOSAVE_KEEP kept
 *    (starred ones are never pruned).
 *  - Versions store the page document as it was; publish versions are created by publishPage().
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lt, ne, notInArray } from "drizzle-orm";
import { createPageFromDoc } from "@/lib/admin-data/pages";
import type { Actor } from "@/lib/admin-data/store-audit";
import { can, type SessionUser } from "@/lib/auth";
import { isGatePath } from "@/lib/auth/gate";
import { db } from "@/lib/db/client";
import { newId } from "@/lib/db/ids";
import { pages, pageVersions, users } from "@/lib/db/schema";
import { ensureFocusMany, getAssetsByIds, type AssetRecord } from "@/lib/media";
import { assetRowOf } from "@/lib/media/asset-row";
import { PageDoc, type PageDoc as PageDocT } from "@/lib/page/schema";
import { sanitizeDeep, validateDoc } from "@/lib/page/validate";
import { invalidatePublished, isServableSlug, storeInfo } from "@/lib/render/publish.server";
import { getSetting } from "@/lib/settings";
import type { StoreScope, WriteScope } from "@/lib/tenancy/types";
import { collectAssetIds } from "@/landing/context";
import type { ActionErrorCode, EditorAsset, EditorBootstrap, EditorPageMeta, PageStatus, VersionKind, VersionSummary } from "./types";
import { jsonBytes, MAX_DOC_BYTES } from "./types";

export const AUTOSAVE_EVERY_MS = 10 * 60_000;
export const AUTOSAVE_KEEP = 20;

export class EditorError extends Error {
  constructor(
    readonly code: ActionErrorCode,
    message: string,
    readonly extra: { serverUpdatedAt?: number; issues?: { path: string; message: string; sectionId?: string }[] } = {},
  ) {
    super(message);
    this.name = "EditorError";
  }
}

export const checksumOf = (doc: unknown) => createHash("sha256").update(JSON.stringify(doc), "utf8").digest("hex");

function affectedRows(res: unknown): number {
  const head = Array.isArray(res) ? res[0] : res;
  const n = (head as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}

/* ------------------------------------------------------------------ */
/* reads                                                               */
/* ------------------------------------------------------------------ */

async function pageRow(id: string) {
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return row ?? null;
}

function metaOf(row: { id: string; name: string; slug: string; status: PageStatus; publishedVersionId: string | null; updatedAt: Date }): EditorPageMeta {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    publishedVersionId: row.publishedVersionId,
    updatedAt: row.updatedAt.getTime(),
  };
}

/** The builder's row of an asset: the renderer row every path shares (focus included) + the palette. */
export function toEditorAsset(a: AssetRecord): EditorAsset {
  return { ...assetRowOf(a), palette: a.palette ?? null };
}

/**
 * Asset rows for a document. Images uploaded before the subject analysis existed are analysed here
 * (and stored) within a small time budget, so the canvas and the next publish fit them alike — both
 * read the same stored row; the rest are analysed on a later open.
 */
export async function assetsFor(scope: StoreScope, doc: PageDocT, extra: Parameters<typeof collectAssetIds>[1] = []): Promise<Record<string, EditorAsset>> {
  // the store's own files only (MED-18): another store's id in a document resolves like a deleted file
  const rows = await ensureFocusMany(await getAssetsByIds(scope, collectAssetIds(doc, extra)), { budgetMs: 2000 });
  return Object.fromEntries(rows.map((r) => [r.id, toEditorAsset(r)]));
}

export async function listVersionSummaries(pageId: string, opts: { before?: number; limit?: number } = {}): Promise<{ items: VersionSummary[]; hasMore: boolean }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 40));
  const where = opts.before !== undefined ? and(eq(pageVersions.pageId, pageId), lt(pageVersions.createdAt, new Date(opts.before))) : eq(pageVersions.pageId, pageId);
  const rows = await db
    .select({
      id: pageVersions.id,
      kind: pageVersions.kind,
      label: pageVersions.label,
      createdAt: pageVersions.createdAt,
      starred: pageVersions.starred,
      author: users.name,
    })
    .from(pageVersions)
    .leftJoin(users, eq(users.id, pageVersions.createdBy))
    .where(where)
    .orderBy(desc(pageVersions.createdAt), desc(pageVersions.id))
    .limit(limit + 1);
  return {
    items: rows.slice(0, limit).map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      createdAt: r.createdAt.getTime(),
      author: r.author ?? null,
      starred: r.starred,
    })),
    hasMore: rows.length > limit,
  };
}

async function versionRow(pageId: string, versionId: string) {
  const [row] = await db
    .select({ id: pageVersions.id, kind: pageVersions.kind, label: pageVersions.label, doc: pageVersions.doc, createdAt: pageVersions.createdAt, checksum: pageVersions.checksum })
    .from(pageVersions)
    .where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)))
    .limit(1);
  return row ?? null;
}

/**
 * Everything the builder needs to open a page. A draft that no longer validates at page level is
 * replaced by the newest version that does (reported in `notices`); null when the page is unknown.
 */
export async function loadBootstrap(scope: StoreScope, pageId: string, user: SessionUser): Promise<EditorBootstrap | null> {
  const row = await pageRow(pageId);
  if (!row) return null;
  const notices: string[] = [];

  let { doc, issues } = validateDoc(row.draft);
  if (!doc) {
    const recent = await db
      .select({ doc: pageVersions.doc, createdAt: pageVersions.createdAt })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, pageId))
      .orderBy(desc(pageVersions.createdAt))
      .limit(25);
    for (const v of recent) {
      const res = validateDoc(v.doc);
      if (res.doc) {
        doc = res.doc;
        issues = res.issues;
        notices.push(`The saved draft could not be opened; the version of ${v.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC was loaded instead.`);
        break;
      }
    }
    if (!doc) throw new EditorError("invalid", "This page's draft is damaged and no valid version was found.");
  }
  const repairs = issues.filter((i) => i.level === "warning").length;
  if (repairs) notices.push(`${repairs} small ${repairs === 1 ? "problem was" : "problems were"} repaired automatically when opening this draft.`);

  const [store, storeSettings, ai, versions, published] = await Promise.all([
    storeInfo(),
    getSetting("store"),
    getSetting("ai"),
    listVersionSummaries(pageId),
    row.publishedVersionId
      ? db.select({ checksum: pageVersions.checksum }).from(pageVersions).where(eq(pageVersions.id, row.publishedVersionId)).limit(1)
      : Promise.resolve([] as { checksum: string }[]),
  ]);
  const assets = await assetsFor(scope, doc, [store.logo]);

  return {
    page: metaOf(row),
    doc,
    draftIsLive: row.status === "published" && !!published[0] && published[0].checksum === checksumOf(doc),
    assets,
    store,
    storeHealth: {
      hasLegalName: !!storeSettings.legalName,
      hasPhone: !!(storeSettings.phone || storeSettings.whatsapp),
      hasEmail: !!storeSettings.email,
      hasAddress: !!storeSettings.address,
    },
    versions: versions.items,
    hasMoreVersions: versions.hasMore,
    user: {
      id: user.id,
      name: user.name,
      canWrite: can(user.role, "pages.write"),
      canPublish: can(user.role, "pages.publish"),
      canExport: can(user.role, "export.create"),
      canUpload: can(user.role, "media.write"),
    },
    ai: { enabled: ai.enabled, bgRemoval: ai.bgRemoval, tier: ai.tier },
    notices,
  };
}

/** A version's document (repaired) and the asset rows to preview it. */
export async function versionPreview(scope: StoreScope, pageId: string, versionId: string): Promise<{ doc: PageDocT; assets: Record<string, EditorAsset> } | null> {
  const v = await versionRow(pageId, versionId);
  if (!v) return null;
  const { doc } = validateDoc(v.doc);
  if (!doc) return null;
  const store = await storeInfo();
  return { doc, assets: await assetsFor(scope, doc, [store.logo]) };
}

/* ------------------------------------------------------------------ */
/* draft                                                               */
/* ------------------------------------------------------------------ */

/** Sanitized, schema-checked draft from client input (throws EditorError). */
export function parseDraft(input: unknown): PageDocT {
  const size = jsonBytes(input);
  if (!Number.isFinite(size)) throw new EditorError("invalid", "The page could not be read.");
  if (size > MAX_DOC_BYTES) throw new EditorError("too_large", "This page is too large to save. Remove some sections or long texts.");
  const parsed = PageDoc.safeParse(sanitizeDeep(input));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((i) => ({ path: i.path.map(String).join("."), message: i.message }));
    throw new EditorError("invalid", "The page has invalid settings and was not saved.", { issues });
  }
  return parsed.data;
}

async function insertVersion(pageId: string, kind: VersionKind, label: string | null, doc: PageDocT, userId: string, at: Date): Promise<VersionSummary & { checksum: string }> {
  const id = newId();
  const checksum = checksumOf(doc);
  await db.insert(pageVersions).values({ id, pageId, kind, label, doc, checksum, createdBy: userId, createdAt: at });
  return { id, kind, label, createdAt: at.getTime(), author: null, starred: false, checksum };
}

/** Keep only the newest AUTOSAVE_KEEP unstarred autosaves of a page. */
async function pruneAutosaves(pageId: string): Promise<void> {
  const keep = await db
    .select({ id: pageVersions.id })
    .from(pageVersions)
    .where(and(eq(pageVersions.pageId, pageId), eq(pageVersions.kind, "autosave")))
    .orderBy(desc(pageVersions.createdAt))
    .limit(AUTOSAVE_KEEP);
  if (keep.length < AUTOSAVE_KEEP) return;
  await db.delete(pageVersions).where(
    and(
      eq(pageVersions.pageId, pageId),
      eq(pageVersions.kind, "autosave"),
      eq(pageVersions.starred, false),
      notInArray(
        pageVersions.id,
        keep.map((k) => k.id),
      ),
    ),
  );
}

/** Autosave snapshot when the last one is older than AUTOSAVE_EVERY_MS and the content changed. */
async function maybeAutosaveVersion(pageId: string, doc: PageDocT, userId: string, now: Date): Promise<VersionSummary | null> {
  const [last] = await db
    .select({ createdAt: pageVersions.createdAt, checksum: pageVersions.checksum })
    .from(pageVersions)
    .where(and(eq(pageVersions.pageId, pageId), eq(pageVersions.kind, "autosave")))
    .orderBy(desc(pageVersions.createdAt))
    .limit(1);
  if (last && now.getTime() - last.createdAt.getTime() < AUTOSAVE_EVERY_MS) return null;
  const checksum = checksumOf(doc);
  if (last?.checksum === checksum) return null;
  const [latestAny] = await db
    .select({ checksum: pageVersions.checksum })
    .from(pageVersions)
    .where(eq(pageVersions.pageId, pageId))
    .orderBy(desc(pageVersions.createdAt))
    .limit(1);
  if (latestAny?.checksum === checksum) return null;
  const v = await insertVersion(pageId, "autosave", null, doc, userId, now);
  await pruneAutosaves(pageId);
  return v;
}

/**
 * Write the draft if the page was not changed elsewhere since `baseUpdatedAt` (or `force`).
 * Returns the new updatedAt and the autosave version created on the way, if any.
 */
export async function saveDraft(
  user: SessionUser,
  input: { pageId: string; doc: unknown; baseUpdatedAt: number; force: boolean },
): Promise<{ updatedAt: number; version: VersionSummary | null; forced: boolean }> {
  const doc = parseDraft(input.doc);
  const now = new Date(Math.max(Date.now(), input.baseUpdatedAt + 1));
  const where = input.force ? eq(pages.id, input.pageId) : and(eq(pages.id, input.pageId), eq(pages.updatedAt, new Date(input.baseUpdatedAt)));
  const res = await db.update(pages).set({ draft: doc, locale: doc.locale, updatedAt: now }).where(where);
  if (affectedRows(res) !== 1) {
    const row = await db.select({ updatedAt: pages.updatedAt }).from(pages).where(eq(pages.id, input.pageId)).limit(1);
    if (!row[0]) throw new EditorError("not_found", "This page no longer exists.");
    throw new EditorError("conflict", "This page was changed somewhere else.", { serverUpdatedAt: row[0].updatedAt.getTime() });
  }
  const version = await maybeAutosaveVersion(input.pageId, doc, user.id, now);
  return { updatedAt: now.getTime(), version: version ? { ...version, author: user.name } : null, forced: input.force };
}

/* ------------------------------------------------------------------ */
/* versions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Snapshot the current draft as a named version. With `reuse`, the newest version is returned
 * instead when it already holds exactly this draft (e.g. exporting twice without edits).
 */
export async function createVersion(
  user: SessionUser,
  pageId: string,
  kind: "save" | "generation" | "import",
  label: string | null,
  opts: { reuse?: boolean } = {},
): Promise<{ version: VersionSummary; created: boolean }> {
  const row = await pageRow(pageId);
  if (!row) throw new EditorError("not_found", "This page no longer exists.");
  const { doc } = validateDoc(row.draft);
  if (!doc) throw new EditorError("invalid", "The current draft has errors and cannot be saved as a version.");
  if (opts.reuse) {
    const [latest] = await db
      .select({ id: pageVersions.id, checksum: pageVersions.checksum })
      .from(pageVersions)
      .where(eq(pageVersions.pageId, pageId))
      .orderBy(desc(pageVersions.createdAt))
      .limit(1);
    if (latest?.checksum === checksumOf(doc)) {
      const [existing] = await versionsByIds([latest.id]);
      if (existing) return { version: existing, created: false };
    }
  }
  const v = await insertVersion(pageId, kind, label || null, doc, user.id, new Date());
  return { version: { ...v, author: user.name }, created: true };
}

/**
 * Make a version the draft again. The current draft is kept as an autosave labelled "Before
 * restore" (when it differs from the newest version) so a restore can always be undone.
 * The page keeps its CURRENT pixels (`tracking`) unless `pixels: true` ("Also restore its pixels",
 * docs/OFFERS.md §A.4): an old version must never silently swap the ads' pixels.
 */
export async function restoreVersion(
  scope: StoreScope,
  user: SessionUser,
  input: { pageId: string; versionId: string; baseUpdatedAt: number; pixels?: boolean },
): Promise<{ doc: PageDocT; updatedAt: number; versions: VersionSummary[]; assets: Record<string, EditorAsset> }> {
  const [row, v] = await Promise.all([pageRow(input.pageId), versionRow(input.pageId, input.versionId)]);
  if (!row || !v) throw new EditorError("not_found", "This version no longer exists.");
  if (row.updatedAt.getTime() !== input.baseUpdatedAt) {
    throw new EditorError("conflict", "This page was changed somewhere else.", { serverUpdatedAt: row.updatedAt.getTime() });
  }
  const { doc: restored } = validateDoc(v.doc);
  if (!restored) throw new EditorError("invalid", "This version cannot be restored: its content is damaged.");

  const now = new Date(Math.max(Date.now(), input.baseUpdatedAt + 1));
  const created: VersionSummary[] = [];
  const current = validateDoc(row.draft).doc;
  const doc: PageDocT = input.pixels || !current ? restored : { ...restored, tracking: current.tracking };
  if (current) {
    const [latest] = await db.select({ checksum: pageVersions.checksum }).from(pageVersions).where(eq(pageVersions.pageId, input.pageId)).orderBy(desc(pageVersions.createdAt)).limit(1);
    if (latest?.checksum !== checksumOf(current)) {
      created.push({ ...(await insertVersion(input.pageId, "autosave", "Before restore", current, user.id, new Date(now.getTime() - 1))), author: user.name });
    }
  }
  const when = v.createdAt.toISOString().slice(0, 16).replace("T", " ");
  const label = `Restored ${v.label ? `“${v.label}”` : `version of ${when} UTC`}`.slice(0, 160);
  const res = await db
    .update(pages)
    .set({ draft: doc, locale: doc.locale, updatedAt: now })
    .where(and(eq(pages.id, input.pageId), eq(pages.updatedAt, row.updatedAt)));
  if (affectedRows(res) !== 1) throw new EditorError("conflict", "This page was changed somewhere else.");
  created.unshift({ ...(await insertVersion(input.pageId, "restore", label, doc, user.id, now)), author: user.name });
  await pruneAutosaves(input.pageId);
  const store = await storeInfo();
  return { doc, updatedAt: now.getTime(), versions: created, assets: await assetsFor(scope, doc, [store.logo]) };
}

export async function setVersionStar(pageId: string, versionId: string, starred: boolean): Promise<void> {
  const res = await db.update(pageVersions).set({ starred }).where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)));
  if (affectedRows(res) === 0 && !(await versionRow(pageId, versionId))) throw new EditorError("not_found", "This version no longer exists.");
}

export async function renameVersion(pageId: string, versionId: string, label: string): Promise<void> {
  const res = await db.update(pageVersions).set({ label: label || null }).where(and(eq(pageVersions.id, versionId), eq(pageVersions.pageId, pageId)));
  if (affectedRows(res) === 0 && !(await versionRow(pageId, versionId))) throw new EditorError("not_found", "This version no longer exists.");
}

/** New draft page of the scope's store from the current draft or one of its versions. */
export async function duplicateAsPage(scope: WriteScope, actor: Actor, input: { pageId: string; versionId?: string; name?: string }): Promise<{ id: string; slug: string }> {
  const row = await pageRow(input.pageId);
  if (!row) throw new EditorError("not_found", "This page no longer exists.");
  let source: unknown = row.draft;
  let versionLabel = `Duplicated from “${row.name}”`;
  if (input.versionId) {
    const v = await versionRow(input.pageId, input.versionId);
    if (!v) throw new EditorError("not_found", "This version no longer exists.");
    source = v.doc;
    versionLabel = `Copied from “${row.name}” · version of ${v.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
  }
  const { doc } = validateDoc(source);
  if (!doc) throw new EditorError("invalid", "This content is damaged and cannot be duplicated.");
  return createPageFromDoc(scope, { name: input.name ?? `${row.name} (copy)`, doc, versionLabel, copiedFrom: row.name }, actor);
}

/* ------------------------------------------------------------------ */
/* page meta                                                           */
/* ------------------------------------------------------------------ */

/** Why a slug cannot be used (null when it can). Reserved app routes and the admin gate are refused. */
export async function slugProblem(slug: string, pageId: string): Promise<{ code: "slug_reserved" | "slug_taken"; message: string } | null> {
  if (!isServableSlug(slug) || isGatePath(`/${slug}`)) return { code: "slug_reserved", message: `“/${slug}” is reserved. Choose another address.` };
  const [taken] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.slug, slug), ne(pages.id, pageId)))
    .limit(1);
  return taken ? { code: "slug_taken", message: `Another page already uses “/${slug}”.` } : null;
}

/**
 * Rename and/or move a page. Moving a published page changes its live address, so the slug is only
 * written here; the caller re-publishes (the thank-you link inside the published HTML follows the slug).
 * `updated_at` is left alone: it is the draft's concurrency token, and neither changes the draft.
 */
export async function updateMeta(pageId: string, patch: { name?: string; slug?: string }): Promise<{ page: EditorPageMeta; slugChanged: boolean; previousSlug: string }> {
  const row = await pageRow(pageId);
  if (!row) throw new EditorError("not_found", "This page no longer exists.");
  const slugChanged = patch.slug !== undefined && patch.slug !== row.slug;
  if (slugChanged) {
    const problem = await slugProblem(patch.slug!, pageId);
    if (problem) throw new EditorError(problem.code, problem.message);
  }
  const set: Partial<typeof pages.$inferInsert> = {};
  if (patch.name !== undefined && patch.name !== row.name) set.name = patch.name;
  if (slugChanged) set.slug = patch.slug!;
  if (!Object.keys(set).length) return { page: metaOf(row), slugChanged: false, previousSlug: row.slug };
  try {
    await db.update(pages).set(set).where(eq(pages.id, pageId));
  } catch (err) {
    // unique index race: someone took the slug between the check and the write
    if (slugChanged && /duplicate|ER_DUP_ENTRY/i.test(err instanceof Error ? err.message : "")) {
      throw new EditorError("slug_taken", `Another page already uses “/${patch.slug}”.`);
    }
    throw err;
  }
  const next = await pageRow(pageId);
  if (slugChanged) invalidatePublished();
  return { page: metaOf(next!), slugChanged, previousSlug: row.slug };
}

/** Restore a previous slug (used when re-publishing after a move fails). */
export async function revertSlug(pageId: string, slug: string): Promise<void> {
  await db.update(pages).set({ slug }).where(eq(pages.id, pageId));
  invalidatePublished();
}

export async function currentMeta(pageId: string): Promise<EditorPageMeta | null> {
  const row = await pageRow(pageId);
  return row ? metaOf(row) : null;
}

/** Version summaries by id (after publish, to show the new publish version with its author). */
export async function versionsByIds(ids: string[]): Promise<VersionSummary[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: pageVersions.id, kind: pageVersions.kind, label: pageVersions.label, createdAt: pageVersions.createdAt, starred: pageVersions.starred, author: users.name })
    .from(pageVersions)
    .leftJoin(users, eq(users.id, pageVersions.createdBy))
    .where(inArray(pageVersions.id, ids));
  return rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, createdAt: r.createdAt.getTime(), author: r.author ?? null, starred: r.starred }));
}
