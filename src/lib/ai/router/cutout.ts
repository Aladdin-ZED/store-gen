/**
 * Cutout later (P7 AI; ai.md AI-03 scope and acceptance (4), rev 4 UX-39; core §G.4 MED-02, §H.3, §M.4; DES-§4.11).
 * Browser. At the reveal no BiRefNet mask exists (nothing downloads before the reveal, D59), so the wizard uses
 * design's `estimateAlpha`; once the local `removeBackground` task has produced the real mask, this helper uploads it
 * as a derived asset of the same photo through P8's upload path (`POST /api/app/<h>/media`, multipart: `file`,
 * `cutout=1`, `sourceAssetId`; `media.write`). That is all ai does: one upload, no other AI call, and never a render
 * request (P8's media pipeline enqueues the `cutout` render reason that swaps framed-stage → cutout-stage in place).
 *
 *   await uploadCutoutMask({ handle, sourceAssetId, mask })            → { ok: true, assetId, deduped } | { ok: false, … }
 *   await cutoutLater({ handle, sourceAssetId, photo })                → removeBackground (local) then the one upload
 */
import { getAi } from "../client";
import { apiHref } from "@/lib/urls";

/** The asset id shape the media route accepts (src/lib/media/assets.ts `ASSET_ID_RE`; that module is server-side). */
const ASSET_ID_RE = /^[a-f0-9]{16,64}$/;

export type CutoutUpload = { ok: true; assetId: string; deduped: boolean } | { ok: false; reason: "invalid_source" | "upload_failed" | "no_mask" | "cancelled"; status?: number };

export interface CutoutDeps {
  fetch?: typeof fetch;
}

/** The file name of a derived cutout ("<base>-cutout.webp"). */
export function cutoutName(mask: Blob, base = "photo"): string {
  const safe = base.replace(/\.[a-z0-9]+$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "photo";
  return `${safe}-cutout.${mask.type === "image/png" ? "png" : "webp"}`;
}

/** Uploads the mask once, as a derived asset of `sourceAssetId`. */
export async function uploadCutoutMask(
  a: { handle: string; sourceAssetId: string; mask: Blob; name?: string; signal?: AbortSignal },
  deps: CutoutDeps = {},
): Promise<CutoutUpload> {
  if (!ASSET_ID_RE.test(a.sourceAssetId)) return { ok: false, reason: "invalid_source" };
  if (!a.mask.size) return { ok: false, reason: "no_mask" };
  const form = new FormData();
  form.append("file", a.mask, cutoutName(a.mask, a.name));
  form.append("cutout", "1");
  form.append("sourceAssetId", a.sourceAssetId);
  const f = deps.fetch ?? ((...x: Parameters<typeof fetch>) => globalThis.fetch(...x));
  try {
    const res = await f(apiHref(a.handle, "/media"), { method: "POST", body: form, credentials: "same-origin", ...(a.signal ? { signal: a.signal } : {}) });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; asset?: { id?: string }; deduped?: boolean } | null;
    if (res.ok && body?.ok && typeof body.asset?.id === "string") return { ok: true, assetId: body.asset.id, deduped: !!body.deduped };
    return { ok: false, reason: "upload_failed", status: res.status };
  } catch {
    return { ok: false, reason: a.signal?.aborted ? "cancelled" : "upload_failed" };
  }
}

/**
 * The speculative cutout of AI-§H.2 once the mask exists: the local matting run (the injected `removeBackground`, the
 * worker's by default), then exactly one upload. A device that cannot produce a mask answers `no_mask` and the
 * estimated alpha stays.
 */
export async function cutoutLater(
  a: { handle: string; sourceAssetId: string; photo: Blob; name?: string; signal?: AbortSignal; removeBackground?: (photo: Blob, o: { signal?: AbortSignal }) => Promise<Blob> },
  deps: CutoutDeps = {},
): Promise<CutoutUpload> {
  if (!ASSET_ID_RE.test(a.sourceAssetId)) return { ok: false, reason: "invalid_source" };
  const remove = a.removeBackground ?? ((photo: Blob, o: { signal?: AbortSignal }) => getAi().removeBackground(photo, o));
  let mask: Blob;
  try {
    mask = await remove(a.photo, a.signal ? { signal: a.signal } : {});
  } catch {
    return { ok: false, reason: a.signal?.aborted ? "cancelled" : "no_mask" };
  }
  if (a.signal?.aborted) return { ok: false, reason: "cancelled" };
  return uploadCutoutMask({ handle: a.handle, sourceAssetId: a.sourceAssetId, mask, ...(a.name ? { name: a.name } : {}), ...(a.signal ? { signal: a.signal } : {}) }, deps);
}
