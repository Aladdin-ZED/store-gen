import "server-only";
/**
 * Export service of one store (the export routes call these with the seam's scope, docs/STORE-SAAS.md §E.3):
 *
 *   getExportContext(scope, pageId, opts)          versions, recent exports and defaults for the ExportDialog
 *   estimateExport(scope, request)                 approximate ZIP size + warnings (no database writes)
 *   buildExport(scope, request, actor, opts)       records an exports row (new public key) and returns the ZIP stream
 *   revokeExport(scope, exportId, actor)           stops a connected export from taking orders
 *
 * Per store (EXP-01 … EXP-05): a version, a page and an export are found only inside the scope's store (another
 * store's id answers exactly like a missing one), the store facts (name, contacts, logo, WhatsApp) and the Google
 * Sheet are the store's, images are the store's own assets, and a PHP export embeds only the store's own export key
 * (`export_key`), never a platform key. Connected exports post to the platform's order API, whose page key
 * resolves the store (EXP-06).
 *
 * Connected exports are validated by the order API against the version they are bound to; when the
 * stored document needs repairs to render, the repaired document is saved as a new version first, so
 * the API checks orders against exactly what the exported page shows.
 *
 * Add-ons (§H.13, LAN-§5.3; P0b CCR P3-2): every export (and its size estimate) renders with the page's add-ons for
 * its mode, from P3's `loadRenderAddons` (connected → "export-connected", php → "export-php", whatsapp →
 * "export-whatsapp"), each set handed to the bundle only when it is not empty.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, ne, type SQL } from "drizzle-orm";
import { platformBrandName } from "@/lib/admin-data/brand";
import { affected, auditIn } from "@/lib/admin-data/store-audit";
import { db } from "@/lib/db/client";
import { newId, newPublicKey } from "@/lib/db/ids";
import { exportsTable, pages, pageVersions, users } from "@/lib/db/schema";
import { getAssetsByIds, getMediaFile, getMediaMeta } from "@/lib/media";
import { PageDoc } from "@/lib/page/schema";
import { validateDoc } from "@/lib/page/validate";
import { whatsappDigits, whatsappNumber } from "@/lib/render/config";
import { invalidateExportOrigins } from "@/lib/orders/export-origins";
import { errorSummary } from "@/lib/orders/log";
import { storeInfoFor } from "@/lib/admin-data/store-info";
import { getSheetsConfig } from "@/lib/sheets/config";
import { scopedCache } from "@/lib/tenancy/cache";
import { byId, inStore, storeValues, whereStore } from "@/lib/tenancy/sql";
import type { Actor, StoreScope, WriteScope } from "@/lib/tenancy/types";
import { platformOrigin } from "@/lib/urls";
import { loadRenderAddons, type AddonMode } from "@/landing/addons/load.server";
import { collectAssetIds, type StoreInfo } from "@/landing/context";
import { hasAddons } from "@/lib/render/store-context.server";
import { getStoreById } from "@/lib/tenancy/public";
import { buildBundle, bundleSize, type BundleInput, type MediaSource } from "./bundle";
import { exportFileName, isExportMode, normalizeAllowedOrigins, WHATSAPP_HINT, type ExportMode, type ExportRequest, type ExportRequestField } from "./options";
import { storeExportKey, type ExportKey } from "./service-account";
import type { ExportContextResponse, ExportEstimateResponse, ExportRecordJson, ExportVersionJson } from "./types";
import { zipStream } from "./zip";

export class ExportError extends Error {
  constructor(
    readonly code: "not_found" | "invalid" | "forbidden" | "unavailable",
    message: string,
    readonly fields?: Partial<Record<ExportRequestField, string>>,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

/* ------------------------------------------------------------------ */
/* data access                                                         */
/* ------------------------------------------------------------------ */

/** Media files straight from the database store. */
const dbMedia: MediaSource = {
  async size(key) {
    const meta = await getMediaMeta(key);
    return meta ? meta.bytes : null;
  },
  async read(key) {
    const file = await getMediaFile(key);
    return file ? new Uint8Array(file.data.buffer, file.data.byteOffset, file.data.byteLength) : null;
  },
};

interface VersionRow {
  id: string;
  pageId: string;
  doc: unknown;
  createdAt: Date;
  page: { id: string; name: string; slug: string; status: "draft" | "published" | "archived"; publishedVersionId: string | null };
}

/** A version of one of the store's pages (EXP-01: another store's version id answers "no longer exists"). */
async function loadVersion(scope: StoreScope, versionId: string): Promise<VersionRow> {
  const [row] = await db
    .select({
      id: pageVersions.id,
      pageId: pageVersions.pageId,
      doc: pageVersions.doc,
      createdAt: pageVersions.createdAt,
      name: pages.name,
      slug: pages.slug,
      status: pages.status,
      publishedVersionId: pages.publishedVersionId,
    })
    .from(pageVersions)
    .innerJoin(pages, and(eq(pages.id, pageVersions.pageId), inStore(pages, scope)))
    .where(byId(pageVersions, scope, versionId))
    .limit(1);
  if (!row) throw new ExportError("not_found", "This version no longer exists.", { versionId: "Choose another version." });
  return {
    id: row.id,
    pageId: row.pageId,
    doc: row.doc,
    createdAt: row.createdAt,
    page: { id: row.pageId, name: row.name, slug: row.slug, status: row.status, publishedVersionId: row.publishedVersionId },
  };
}

function validDoc(raw: unknown): PageDoc {
  const { doc } = validateDoc(raw);
  if (!doc) throw new ExportError("invalid", "This version has errors that must be fixed in the builder before it can be exported.");
  return doc;
}

/** The platform's public origin, where connected exports post their orders (§C.6), or why connected mode cannot be used. */
function apiOriginState(): { origin: string | null; blocker: string | null } {
  const origin = platformOrigin() || null;
  if (!origin) return { origin: null, blocker: "Set PLATFORM_URL to the platform's public https address to export connected pages." };
  const u = new URL(origin);
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  if (u.protocol !== "https:" && !local) return { origin: null, blocker: "PLATFORM_URL must be an https:// address for connected exports." };
  return { origin, blocker: null };
}

/**
 * The store's identity for its exported documents: `stores.name`, Settings → Store and the brand logo (D76,
 * DES-R16; the dashboard's one reader, src/lib/admin-data/store-info.ts), sanitized again by storeContext().
 */
async function storeInfoOf(scope: StoreScope): Promise<StoreInfo> {
  return (await storeInfoFor(scope)) ?? fail404();
}

const fail404 = (): never => {
  throw new ExportError("not_found", "This store no longer exists.");
};

/** The asset rows of `ids` that belong to the store (§E.3 rule 5: a document naming another store's image exports without it). */
function storeAssets(scope: StoreScope, ids: readonly string[]) {
  return getAssetsByIds(scope, ids);
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The add-on mode of each export mode (LAN-§5.3; "export-static" belongs to no export mode in R1). */
const ADDON_MODE: Record<ExportMode, AddonMode> = { connected: "export-connected", php: "export-php", whatsapp: "export-whatsapp" };

/** The page's add-ons for an export mode, each set kept only when it changes the document (today's bytes otherwise). */
async function exportAddons(scope: StoreScope, pageId: string, doc: PageDoc, mode: ExportMode): Promise<BundleInput["addons"]> {
  const store = (await getStoreById(scope.storeId)) ?? fail404();
  const set = await loadRenderAddons(scope, store, { pageId, doc, mode: ADDON_MODE[mode] });
  return { ...(hasAddons(set.landing) ? { landing: set.landing } : {}), ...(hasAddons(set.thanks) ? { thanks: set.thanks } : {}) };
}

function recordJson(r: {
  id: string;
  versionId: string;
  mode: ExportMode;
  allowedOrigins: unknown;
  fileName: string | null;
  bytes: number | null;
  createdAt: Date;
  revokedAt: Date | null;
  createdByName: string | null;
}): ExportRecordJson {
  return {
    id: r.id,
    versionId: r.versionId,
    mode: r.mode,
    allowedOrigins: Array.isArray(r.allowedOrigins) ? r.allowedOrigins.filter((o): o is string => typeof o === "string") : [],
    fileName: r.fileName,
    bytes: r.bytes,
    createdAt: r.createdAt.toISOString(),
    revokedAt: iso(r.revokedAt),
    createdByName: r.createdByName,
  };
}

async function exportRecords(scope: StoreScope, where: SQL, limit: number): Promise<ExportRecordJson[]> {
  const rows = await db
    .select({
      id: exportsTable.id,
      versionId: exportsTable.versionId,
      mode: exportsTable.mode,
      allowedOrigins: exportsTable.allowedOrigins,
      fileName: exportsTable.fileName,
      bytes: exportsTable.bytes,
      createdAt: exportsTable.createdAt,
      revokedAt: exportsTable.revokedAt,
      createdByName: users.name,
    })
    .from(exportsTable)
    .leftJoin(users, eq(users.id, exportsTable.createdBy))
    .where(whereStore(exportsTable, scope, where))
    .orderBy(desc(exportsTable.createdAt))
    .limit(limit);
  return rows.map(recordJson);
}

/* ------------------------------------------------------------------ */
/* context                                                             */
/* ------------------------------------------------------------------ */

/**
 * `opts.versionId` (e.g. "download again" from the exports history) is listed even when it is older
 * than the 40 most recent versions, as long as it belongs to the page. `opts.canEmbedKey`: the member may
 * put the store's export key into a PHP export (integrations.manage).
 */
export async function getExportContext(scope: StoreScope, pageId: string, opts: { canEmbedKey: boolean; versionId?: string }): Promise<ExportContextResponse> {
  const [page] = await db
    .select({ id: pages.id, name: pages.name, slug: pages.slug, status: pages.status, publishedVersionId: pages.publishedVersionId, draft: pages.draft })
    .from(pages)
    .where(byId(pages, scope, pageId))
    .limit(1);
  if (!page) throw new ExportError("not_found", "Page not found.");

  const versionRows = await db
    .select({ id: pageVersions.id, kind: pageVersions.kind, label: pageVersions.label, createdAt: pageVersions.createdAt })
    .from(pageVersions)
    .where(whereStore(pageVersions, scope, eq(pageVersions.pageId, pageId), ne(pageVersions.kind, "autosave")))
    .orderBy(desc(pageVersions.createdAt))
    .limit(40);
  if (opts.versionId && !versionRows.some((v) => v.id === opts.versionId)) {
    const [extra] = await db
      .select({ id: pageVersions.id, kind: pageVersions.kind, label: pageVersions.label, createdAt: pageVersions.createdAt })
      .from(pageVersions)
      .where(and(byId(pageVersions, scope, opts.versionId), eq(pageVersions.pageId, pageId)))
      .limit(1);
    if (extra) versionRows.push(extra);
  }
  const versions: ExportVersionJson[] = versionRows.map((v) => ({
    id: v.id,
    kind: v.kind,
    label: v.label,
    createdAt: v.createdAt.toISOString(),
    published: v.id === page.publishedVersionId,
  }));

  const exports = await exportRecords(scope, eq(exportsTable.pageId, pageId), 20);

  // suggestions: the last connected export's first full origin; WhatsApp of the live page or the store
  const lastOrigin = exports.flatMap((e) => e.allowedOrigins).find((o) => /^https:\/\/[^*]+$/.test(o)) ?? null;
  const [store, sheet] = await Promise.all([storeInfoOf(scope), getSheetsConfig(scope)]);
  let liveDoc: PageDoc | null = null;
  if (page.publishedVersionId) {
    const [pv] = await db.select({ doc: pageVersions.doc }).from(pageVersions).where(byId(pageVersions, scope, page.publishedVersionId)).limit(1);
    liveDoc = pv ? validateDoc(pv.doc).doc : null;
  }
  liveDoc ??= validateDoc(page.draft).doc;
  const api = apiOriginState();
  const exportKey = opts.canEmbedKey ? await storeExportKey(scope) : null;
  return {
    ok: true,
    page: { id: page.id, name: page.name, slug: page.slug, status: page.status, publishedVersionId: page.publishedVersionId },
    versions,
    exports,
    defaults: {
      siteUrl: lastOrigin ? `${lastOrigin}/` : null,
      whatsapp: liveDoc ? whatsappNumber(liveDoc, store.whatsapp) : null,
      apiOrigin: api.origin,
      connectedBlocker: api.blocker,
      sheetConnected: !!sheet,
      canEmbedServiceAccount: !!exportKey?.key,
      embedKeyBlocker: exportKey?.problem ?? null,
      exportServiceAccountEmail: exportKey?.key?.email ?? null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* bundle                                                              */
/* ------------------------------------------------------------------ */

interface Prepared {
  version: VersionRow;
  doc: PageDoc;
  store: StoreInfo;
  input: Omit<BundleInput, "exportId" | "pageKey" | "php">;
}

async function prepare(scope: StoreScope, req: ExportRequest): Promise<Prepared> {
  const version = await loadVersion(scope, req.versionId);
  const doc = validDoc(version.doc);
  const [store, brand] = await Promise.all([storeInfoOf(scope), platformBrandName()]);

  let apiOrigin: string | undefined;
  if (req.mode === "connected") {
    const api = apiOriginState();
    if (!api.origin) {
      const message = api.blocker ?? "Connected exports are unavailable.";
      throw new ExportError("unavailable", message, { mode: message });
    }
    apiOrigin = api.origin;
  }
  let wa: string | undefined;
  if (req.mode === "whatsapp") {
    const typed = req.options.whatsappNumber;
    wa = (typed ? whatsappDigits(typed, doc.form.phoneCountry) : whatsappNumber(doc, store.whatsapp)) ?? undefined;
    if (!wa) {
      const message = typed ? WHATSAPP_HINT : "Add the WhatsApp number orders are sent to.";
      throw new ExportError("invalid", message, { whatsappNumber: message });
    }
  }
  const ids = collectAssetIds(doc, [store.logo]);
  const [assets, addons] = await Promise.all([storeAssets(scope, ids), exportAddons(scope, version.pageId, doc, req.mode)]);
  const found = new Set(assets.map((a) => a.id));
  const lost = ids.filter((id) => !found.has(id)).length;
  return {
    version,
    doc,
    store,
    input: {
      mode: req.mode,
      brand,
      doc,
      pageName: version.page.name,
      store,
      assets,
      media: dbMedia,
      siteUrl: req.options.siteUrl,
      hostConfigs: req.options.hostConfigs,
      apiOrigin,
      allowedOrigins: req.mode === "connected" ? req.allowedOrigins : [],
      whatsappNumber: wa,
      now: new Date(),
      updatedAt: version.createdAt,
      warnings: lost
        ? [`${lost} image${lost > 1 ? "s" : ""} used by this version ${lost > 1 ? "were" : "was"} deleted from the media library and ${lost > 1 ? "are" : "is"} left out — replace ${lost > 1 ? "them" : "it"} in the builder.`]
        : [],
      addons,
    },
  };
}

/** Estimates per store (60 s): the key never crosses stores, and a store's invalidation drops its entries. */
const estimateCache = () => scopedCache<ExportEstimateResponse>({ name: "export-estimate", maxEntries: 200, ttlMs: 60_000 });

/**
 * Approximate ZIP size and the warnings of an export (renders the pages, writes nothing). The
 * WhatsApp number is validated on every call but is not part of the cache key: it changes the size
 * by a few bytes, and the dialog asks again on every typed digit — one full render per number would
 * be wasted work.
 */
export async function estimateExport(scope: StoreScope, req: ExportRequest): Promise<ExportEstimateResponse> {
  const p = await prepare(scope, req);
  const key = JSON.stringify([req.versionId, req.mode, req.options.hostConfigs, req.options.siteUrl?.base ?? ""]);
  const cache = estimateCache();
  const hit = cache.get(scope.storeId, key);
  if (hit) return hit;
  const bundle = await buildBundle({
    ...p.input,
    // placeholder ids: same lengths as real ones, nothing is recorded
    exportId: "0".repeat(26),
    pageKey: `pk_${"0".repeat(20)}`,
    allowedOrigins: p.input.allowedOrigins.length ? p.input.allowedOrigins : ["https://example.com"],
    php: req.mode === "php" ? { secret: "0".repeat(64) } : undefined,
  });
  const size = bundleSize(bundle);
  return cache.set(scope.storeId, key, { ok: true, ...size, warnings: bundle.warnings });
}

/** Fields the order API validates against — if they differ, the export gets its own version. */
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
const orderView = (d: PageDoc) => stable([d.locale, d.market, d.currency, d.product, d.offers, d.form]);

async function orderVersionFor(scope: WriteScope, p: Prepared, actor: Actor): Promise<string> {
  const stored = PageDoc.safeParse(p.version.doc);
  if (stored.success && orderView(stored.data) === orderView(p.doc)) return p.version.id;
  const id = newId();
  await db.insert(pageVersions).values(
    storeValues(scope, {
      id,
      pageId: p.version.pageId,
      kind: "save" as const,
      label: "Export snapshot",
      doc: p.doc,
      checksum: createHash("sha256").update(JSON.stringify(p.doc), "utf8").digest("hex"),
      createdBy: actor.userId,
      createdAt: new Date(),
    }),
  );
  return id;
}

export interface BuiltExport {
  exportId: string;
  fileName: string;
  estimate: number;
  stream: ReadableStream<Uint8Array>;
  warnings: string[];
}

/**
 * Records the store's export (new public key) and returns its ZIP as a stream. The row's size is filled in
 * when the stream completes; an interrupted download deletes the row (its archive is unusable). A PHP export
 * carries the store's own sheet and, when asked and allowed (`opts.canEmbedKey`, integrations.manage), the
 * store's own export key; never a platform key (EXP-03). The key has Editor rights on the store's orders sheet, so
 * embedding it is a secret write under integrations.manage: the caller passes the method of the member's fresh
 * step-up (`opts.stepUp`, §B.7, SEC-17; the route's `stepUpGuard`), named on the `export.created` row.
 */
export async function buildExport(scope: WriteScope, req: ExportRequest, actor: Actor, opts: { canEmbedKey: boolean; stepUp?: "totp" | "password" }): Promise<BuiltExport> {
  if (!isExportMode(req.mode)) throw new ExportError("invalid", "Unknown export mode.");
  if (req.mode === "connected" && !normalizeAllowedOrigins(req.allowedOrigins).origins.length) {
    throw new ExportError("invalid", "Add the domain where the page will be hosted.", { allowedOrigins: "Add the domain where the page will be hosted." });
  }
  let embedded: ExportKey | undefined;
  if (req.options.embedServiceAccount) {
    if (!opts.canEmbedKey) throw new ExportError("forbidden", "Only owners and admins can include the Google key in an export.");
    if (!opts.stepUp) throw new ExportError("forbidden", "Confirm it's you before including the Google key in an export.");
    const sa = await storeExportKey(scope);
    if (!sa.key) throw new ExportError("unavailable", sa.problem, { embedServiceAccount: sa.problem });
    embedded = sa.key;
  }
  const p = await prepare(scope, req);
  const versionId = req.mode === "connected" ? await orderVersionFor(scope, p, actor) : p.version.id;
  const sheet = req.mode === "php" ? await getSheetsConfig(scope) : null;

  const exportId = newId();
  const pageKey = newPublicKey();
  const now = p.input.now;
  const fileName = exportFileName(p.version.page.slug, req.mode, now);
  const bundle = await buildBundle({
    ...p.input,
    exportId,
    pageKey,
    php:
      req.mode === "php"
        ? {
            secret: randomBytes(32).toString("hex"),
            spreadsheetId: sheet?.spreadsheetId,
            sheetTab: sheet?.sheetTitle,
            serviceAccountB64: embedded?.b64,
            serviceAccountEmail: embedded?.email,
          }
        : undefined,
  });

  await db.insert(exportsTable).values(
    storeValues(scope, {
      id: exportId,
      pageId: p.version.pageId,
      versionId,
      mode: req.mode,
      publicKey: pageKey,
      allowedOrigins: p.input.allowedOrigins,
      fileName,
      bytes: null,
      createdBy: actor.userId,
      createdAt: now,
    }),
  );
  // the order API answers this export's origins from now on (CORS preflights read a cached list)
  invalidateExportOrigins();
  await auditIn(scope, actor, "export.created", {
    target: exportId,
    meta: {
      pageId: p.version.pageId,
      versionId,
      mode: req.mode,
      origins: p.input.allowedOrigins,
      files: bundle.files.length,
      // which key went out, so a leaked ZIP can be matched to the key to delete in Google Cloud (never the key itself)
      serviceAccount: embedded ? { email: embedded.email, keyId: embedded.keyId } : null,
      ...(embedded && opts.stepUp ? { stepUp: opts.stepUp } : {}),
    },
  });

  const stream = zipStream(bundle.files, {
    mtime: now,
    onDone: (bytes) => {
      db.update(exportsTable)
        .set({ bytes })
        .where(byId(exportsTable, scope, exportId))
        .catch((err: unknown) => console.error("[export] size update failed:", errorSummary(err)));
    },
    onAbort: () => {
      db.delete(exportsTable)
        .where(and(byId(exportsTable, scope, exportId), isNull(exportsTable.bytes)))
        .then(() => invalidateExportOrigins())
        .catch((err: unknown) => console.error("[export] cleanup failed:", errorSummary(err)));
    },
  });
  return { exportId, fileName, estimate: bundleSize(bundle).bytes, stream, warnings: bundle.warnings };
}

/* ------------------------------------------------------------------ */
/* revoke                                                              */
/* ------------------------------------------------------------------ */

/** Revoke one of the store's exports (EXP-04: another store's id is "not found"). */
export async function revokeExport(scope: WriteScope, exportId: string, actor: Actor): Promise<ExportRecordJson> {
  const [row] = await db
    .select({ id: exportsTable.id, revokedAt: exportsTable.revokedAt, pageId: exportsTable.pageId, mode: exportsTable.mode })
    .from(exportsTable)
    .where(byId(exportsTable, scope, exportId))
    .limit(1);
  if (!row) throw new ExportError("not_found", "Export not found.");
  if (!row.revokedAt) {
    const res = await db
      .update(exportsTable)
      .set({ revokedAt: new Date() })
      .where(and(byId(exportsTable, scope, exportId), isNull(exportsTable.revokedAt)));
    if (affected(res) === 1) {
      invalidateExportOrigins();
      await auditIn(scope, actor, "export.revoked", { target: exportId, meta: { pageId: row.pageId, mode: row.mode } });
    }
  }
  const [record] = await exportRecords(scope, eq(exportsTable.id, exportId), 1);
  if (!record) throw new ExportError("not_found", "Export not found.");
  return record;
}
