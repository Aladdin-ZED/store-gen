/**
 * One image of the store's library: its crop data (the framing picker).
 *   GET   → { ok, focal: FocalInfo }   the subject analysis (AssetFocus: focal point, subject box,
 *         heads, hands — analysed and stored here on first view for rows older than the analysis)
 *         + the library's default point                                                   (media.read)
 *   PATCH { focal: { x, y } | null }  → { ok, focal: FocalInfo }   set the library's default point, or
 *         clear it (back to auto framing). Pages keep their own point per AssetRef (fx/fy); the default
 *         pre-fills it when the image is placed.                                           (media.write)
 *
 * `storeGuard(req, params.store, …)` first: the image is looked up in this store only, so another store's id answers
 * 404 like a missing one, and the default point is written to this store's row only (TENANCY-MAP MED-15). Writes
 * take JSON only, are rate limited per member of the store (`s:<sid>:media:focal:<userId>`) and audited in the store.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { focalFromTags, withFocalTag, type FocalInfo } from "@/components/admin/media/focal/tags";
import { auditIn } from "@/lib/admin-data/store-audit";
import { ASSET_ID_RE, ensureFocus, getAsset, setAssetTags, type AssetRecord } from "@/lib/media";
import { json, logError, readJson } from "@/lib/orders/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { storeGuard } from "@/lib/tenancy/seam";
import type { StoreScope } from "@/lib/tenancy/types";

type Params = { params: Promise<{ store: string; id: string }> };

const Point = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  })
  .strict();

const PatchBody = z.object({ focal: Point.nullable() }).strict();

async function info(asset: AssetRecord): Promise<FocalInfo> {
  let focus: FocalInfo["focus"] = null;
  try {
    // stored analysis when current, else analysed now (once per id at a time) and stored on the row
    focus = await ensureFocus(asset);
  } catch (err) {
    // a busy media store or database: the picker works without the analysis
    logError("api/app/media/[id]:focus", err);
  }
  return { id: asset.id, width: asset.width, height: asset.height, alpha: asset.alpha, focus, saved: focalFromTags(asset.tags) };
}

async function imageAsset(scope: StoreScope, id: string): Promise<AssetRecord | Response> {
  if (!ASSET_ID_RE.test(id)) return json({ ok: false, error: "invalid" }, 400);
  const asset = await getAsset(scope, id);
  if (!asset) return json({ ok: false, error: "not_found" }, 404);
  if (asset.kind !== "image") return json({ ok: false, error: "not_image", message: "Focal points apply to images only." }, 422);
  return asset;
}

export async function GET(req: NextRequest, { params }: Params): Promise<Response> {
  const { store, id } = await params;
  const g = await storeGuard(req, store, "media.read");
  if (!g.ok) return g.response;
  try {
    const asset = await imageAsset(g.ctx.scope, id);
    if (asset instanceof Response) return asset;
    return json({ ok: true, focal: await info(asset) }, 200, { "Cache-Control": "private, no-store" });
  } catch (err) {
    logError("api/app/media/[id]:get", err);
    return json({ ok: false, error: "server" }, 500);
  }
}

export async function PATCH(req: NextRequest, { params }: Params): Promise<Response> {
  const { store, id } = await params;
  const g = await storeGuard(req, store, "media.write");
  if (!g.ok) return g.response;
  const { scope, actor, user } = g.ctx;
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") return json({ ok: false, error: "unsupported_media_type" }, 415);

  const body = await readJson(req, 1024);
  if (!body.ok) return json({ ok: false, error: "invalid" }, body.status);
  const parsed = PatchBody.safeParse(body.value);
  if (!parsed.success) return json({ ok: false, error: "invalid", message: "Send { focal: { x, y } } with values from 0 to 1, or { focal: null }." }, 400);

  try {
    const gate = await rateLimit(`s:${scope.storeId}:media:focal:${user.id}`, 240, 600);
    if (!gate.ok) return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(gate.retryAfter) });

    const asset = await imageAsset(scope, id);
    if (asset instanceof Response) return asset;

    const before = focalFromTags(asset.tags);
    const tags = withFocalTag(asset.tags, parsed.data.focal);
    const after = focalFromTags(tags);
    const changed = (before?.x ?? null) !== (after?.x ?? null) || (before?.y ?? null) !== (after?.y ?? null);
    if (changed) {
      if (!(await setAssetTags(scope, asset.id, tags))) return json({ ok: false, error: "not_found" }, 404);
      await auditIn(scope, actor, "media.focal_updated", {
        target: asset.id,
        meta: after ? { fx: after.x, fy: after.y, ...(before ? { from: [before.x, before.y] } : {}) } : { reset: true, ...(before ? { from: [before.x, before.y] } : {}) },
      });
    }
    return json({ ok: true, focal: await info({ ...asset, tags }) });
  } catch (err) {
    logError("api/app/media/[id]:patch", err);
    return json({ ok: false, error: "server" }, 500);
  }
}
