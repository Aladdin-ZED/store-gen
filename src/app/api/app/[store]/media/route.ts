/**
 * The store's media library (docs/STORE-SAAS.md §G.4, §I.1; TENANCY-MAP MED-11 … MED-14).
 *   GET    ?page&pageSize&kind=image|video&filter=cutout|photo&q&sourceAssetId  → the store's assets (media.read)
 *   POST   multipart/form-data: file (required), cutout ("1"), sourceAssetId          → processed asset (media.write)
 *   DELETE ?id=<assetId>[&force=1]                                                    → { ok: true } (media.write)
 *          409 { error: "in_use", pages, storeLogo } when a live page of THIS store or one of its logos shows the
 *          file (only this store's page names): the caller confirms with the member, then repeats with force=1.
 * Pages referencing a deleted asset keep rendering (missing assets resolve to null).
 *
 * Every handler starts with `storeGuard(req, params.store, …)`: session, active membership of this store, the store
 * role matrix and state, the platform host class and (writes) the same-origin check. Another store's asset id
 * answers exactly like a missing one. This route is outside the proxy matcher (§C.3, MED-16), so the proxy never
 * buffers a copy of the (≤ 25 MB) upload body. Uploads then pass, in order: the `uploads_enabled` kill switch, the
 * platform database floor (DB backend only; a generic message, never the platform's fill level, MED-13), an
 * in-flight slot per store and member, the member's request bucket `s:<sid>:media:upload:<userId>`, the store's
 * daily byte budget `s:<sid>:media:bytes`, and finally the store's media quota inside the pipeline (413 `quota`).
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isStoreLogo, livePagesUsing } from "@/lib/admin-data/assets";
import { auditIn } from "@/lib/admin-data/store-audit";
import { getDbUsage, invalidateDbUsage } from "@/lib/db/usage";
import {
  ASSET_ID_RE,
  assetToJson,
  deleteAsset,
  listAssets,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MediaError,
  processUpload,
  QuotaError,
  quotaKind,
} from "@/lib/media";
import { spendUploadBytes } from "@/lib/media/daily-bytes";
import { declaredLength, multipartBoundary, parseMultipart, readCappedBody, readExactBody } from "@/lib/media/upload-body";
import { takeUploadSlot } from "@/lib/media/upload-slots";
import { json, logError } from "@/lib/orders/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { activeKillSwitches } from "@/lib/tenancy/entitlements";
import { storeGuard } from "@/lib/tenancy/seam";
import type { WriteCtx } from "@/lib/tenancy/types";

type Params = { params: Promise<{ store: string }> };

const MAX_FILE = Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES);
/** multipart envelope overhead allowance */
const MAX_BODY = MAX_FILE + 256 * 1024;

const tooLarge = () => json({ ok: false, error: "too_large", message: new MediaError("too_large").message }, 413);
const busy = (status: 429 | 503, retryAfter: number) =>
  json({ ok: false, error: "busy", message: new MediaError("busy").message }, status, { "Retry-After": String(retryAfter) });

const QUOTA_MESSAGES = {
  store: "Your store's media storage is full. Delete photos or videos you no longer use, then upload again.",
  pending: "Uploads are limited while your store is waiting for review. Delete files you no longer use, or try again after the review.",
} as const;

const ListQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(48),
  kind: z.enum(["image", "video"]).optional(),
  filter: z.enum(["cutout", "photo"]).optional(),
  q: z.string().trim().max(80).optional(),
  sourceAssetId: z.string().regex(ASSET_ID_RE).optional(),
});

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "media.read");
  if (!g.ok) return g.response;
  const q = ListQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ ok: false, error: "invalid" }, 400);
  try {
    const res = await listAssets(g.ctx.scope, q.data);
    return json({ ok: true, items: res.items.map(assetToJson), total: res.total, page: res.page, pageSize: res.pageSize });
  } catch (err) {
    logError("api/app/media:list", err);
    return json({ ok: false, error: "server" }, 500);
  }
}

export async function POST(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "media.write");
  if (!g.ok) return g.response;

  const boundary = multipartBoundary(req.headers.get("content-type"));
  if (!boundary) return json({ ok: false, error: "unsupported_media_type" }, 415);
  // null: sent without Content-Length (chunked), read under the MAX_BODY cap instead
  const length = declaredLength(req.headers);
  if (length !== null && length > MAX_BODY) return tooLarge();

  try {
    const tripped = await activeKillSwitches();
    if (tripped.includes("uploads_enabled") || tripped.includes("platform_read_only")) {
      return json({ ok: false, error: "uploads_paused", message: "Uploads are paused for a few minutes. Try again shortly." }, 503, { "Retry-After": "120" });
    }
    // the platform floor of the database backend: what is left is kept for orders (never the fill level itself)
    if ((await getDbUsage())?.level === "full") {
      return json({ ok: false, error: "storage_full", message: "Uploads are paused for now: storage is being freed up. Try again later." }, 507);
    }
  } catch (err) {
    logError("api/app/media:upload:checks", err);
    return json({ ok: false, error: "server", message: "Upload failed. Please try again." }, 500);
  }

  const slot = takeUploadSlot(g.ctx.scope.storeId, g.ctx.user.id);
  // the member's or the store's own share is full → 429; the whole process is busy → 503
  if (!slot.ok) return slot.scope === "server" ? busy(503, 10) : busy(429, 10);
  try {
    const gate = await rateLimit(`s:${g.ctx.scope.storeId}:media:upload:${g.ctx.user.id}`, 120, 600);
    if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(gate.retryAfter) });
    return await receive(req, boundary, length, g.ctx);
  } finally {
    slot.release();
  }
}

/** Read, parse and process one upload (inside an upload slot). */
async function receive(req: NextRequest, boundary: string, length: number | null, ctx: WriteCtx): Promise<Response> {
  const body = length === null ? await readCappedBody(req.body, MAX_BODY) : await readExactBody(req.body, length);
  if (!body.ok) {
    if (body.status === 413) return tooLarge();
    return json({ ok: false, error: "invalid", message: "The upload was interrupted. Please try again." }, body.status);
  }
  const form = parseMultipart(body.value, boundary);
  if (!form) return json({ ok: false, error: "invalid" }, 400);
  const file = form.file;
  if (!file || file.data.length === 0) return json({ ok: false, error: "invalid", message: "No file received." }, 400);
  if (file.data.length > MAX_FILE) return tooLarge();
  const cutoutField = form.fields.get("cutout");
  const cutout = cutoutField === "1" || cutoutField === "true";
  const source = form.fields.get("sourceAssetId");
  const sourceAssetId = source !== undefined && ASSET_ID_RE.test(source) ? source : null;

  try {
    const budget = await spendUploadBytes(ctx.scope, file.data.length);
    if (!budget.ok) {
      return json({ ok: false, error: "rate_limited", message: "Your store has uploaded a lot today. Try again tomorrow." }, 429, { "Retry-After": String(budget.retryAfter) });
    }
    // file.data is a view into this request's own body buffer: processing may scrub it in place
    const { asset, deduped } = await processUpload(ctx.scope, ctx.store, file.data, file.name, {
      cutout,
      sourceAssetId,
      createdBy: ctx.user.id,
    });
    if (!deduped) {
      invalidateDbUsage();
      await auditIn(ctx.scope, ctx.actor, "media.uploaded", { target: asset.id, meta: { kind: asset.kind, bytes: asset.storedBytes, cutout } });
    }
    return json({ ok: true, deduped, asset: assetToJson(asset) }, deduped ? 200 : 201);
  } catch (err) {
    if (err instanceof MediaError && err.code === "busy") return busy(503, 10);
    if (err instanceof MediaError) return json({ ok: false, error: err.code, message: err.message }, 422);
    if (err instanceof QuotaError) return json({ ok: false, error: "quota", message: QUOTA_MESSAGES[quotaKind(err)] }, 413);
    logError("api/app/media:upload", err);
    return json({ ok: false, error: "server", message: "Upload failed. Please try again." }, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Params): Promise<Response> {
  const g = await storeGuard(req, (await params).store, "media.write");
  if (!g.ok) return g.response;
  const { scope, store, actor } = g.ctx;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ASSET_ID_RE.test(id)) return json({ ok: false, error: "invalid" }, 400);
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    // what visitors see right now: the store's live versions (immutable HTML) and its logos on every page
    const [live, storeLogo] = await Promise.all([livePagesUsing(scope, id, 50), isStoreLogo(scope, id)]);
    if (!force && (live.length || storeLogo)) {
      const where = live.length ? `${live.length === 1 ? "a live page" : `${live.length} live pages`}` : "your store logo";
      return json(
        {
          ok: false,
          error: "in_use",
          message: `This file is shown on ${where}. Confirm to delete it anyway.`,
          pages: live.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
          storeLogo,
        },
        409,
      );
    }
    if (!(await deleteAsset(scope, store, id))) return json({ ok: false, error: "not_found" }, 404);
    invalidateDbUsage();
    await auditIn(scope, actor, "media.deleted", {
      target: id,
      ...(live.length || storeLogo ? { meta: { forced: true, livePages: live.map((p) => p.slug), storeLogo } } : {}),
    });
    return json({ ok: true });
  } catch (err) {
    logError("api/app/media:delete", err);
    return json({ ok: false, error: "server" }, 500);
  }
}
