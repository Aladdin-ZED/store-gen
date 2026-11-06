/**
 * The welcome photos step in the browser (P2 SHELL; platform.md PLA-§22.2 `photos` row, PD68, PD74, D69): each dropped
 * photo is decoded and downscaled with the generator's `preparePhoto` (its palette read from a 96 px copy, no upload
 * needed), P6's model-free `estimateAlpha` runs on a ≤ 1024 px copy, and the photo goes to the store's library through
 * P8's `POST /api/app/<h>/media`. A 413 `quota` answer (the pending store's cap, D69) is told apart from a file that is
 * too large, so the step opens the limit sheet instead of a toast. No model, no worker, no download (core D59).
 */
import { MAX_INPUT_MB, preparePhoto } from "@/components/generate/photos";
import { estimateAlpha, type PhotoFacts } from "@/lib/design/photo-facts";
import { extractPalette, type ExtractedPalette } from "@/lib/theme";
import { apiHref } from "@/lib/urls";

/** The longest side the alpha estimate reads (DES-§4.11: confirmed at 1024 px). */
const ALPHA_SIDE = 1024;
/** The palette sample of a library thumbnail (a resumed flow re-reads it; the theme engine wants a small image). */
const SAMPLE = 96;

export type UploadFailure = "quota" | "too_large" | "not_image" | "failed";

export class PhotoUploadError extends Error {
  constructor(
    readonly reason: UploadFailure,
    /** the quota answer's numbers when the server sends them (CCR r1-p2-9), else null */
    readonly quota: { used: number; limit: number } | null = null,
  ) {
    super(reason);
    this.name = "PhotoUploadError";
  }
}

export interface UploadedPhoto {
  id: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  palette: ExtractedPalette | null;
  /** "estimated" when P6's estimate found a uniform background */
  cutout: "estimated" | false;
}

/** The ≤ 1024 px bitmap the estimate reads; null when the browser cannot decode the file. */
async function alphaOf(file: Blob): Promise<"estimated" | false> {
  let bitmap: ImageBitmap | null = null;
  try {
    const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, ALPHA_SIDE / Math.max(probe.width, probe.height));
    bitmap = scale === 1 ? probe : await createImageBitmap(probe, { resizeWidth: Math.max(1, Math.round(probe.width * scale)), resizeHeight: Math.max(1, Math.round(probe.height * scale)), resizeQuality: "medium" });
    if (bitmap !== probe) probe.close();
    return estimateAlpha(bitmap) ? "estimated" : false;
  } catch {
    return false;
  } finally {
    bitmap?.close();
  }
}

/** One upload with its HTTP status (the shared media client folds 413 into one English sentence). */
function send(handle: string, blob: Blob, name: string, onProgress?: (ratio: number) => void, signal?: AbortSignal): Promise<{ id: string; thumbUrl: string | null }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", blob, name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiHref(handle, "/media"));
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { ok?: boolean; error?: string; asset?: { id: string; thumbUrl: string | null }; used?: unknown; limit?: unknown } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok && body.asset) return resolve({ id: body.asset.id, thumbUrl: body.asset.thumbUrl });
      if (xhr.status === 413 && body?.error === "quota") {
        const numbers = typeof body.used === "number" && typeof body.limit === "number" ? { used: body.used, limit: body.limit } : null;
        return reject(new PhotoUploadError("quota", numbers));
      }
      if (xhr.status === 413) return reject(new PhotoUploadError("too_large"));
      reject(new PhotoUploadError(xhr.status === 422 ? "not_image" : "failed"));
    };
    xhr.onerror = () => reject(new PhotoUploadError("failed"));
    xhr.onabort = () => reject(new PhotoUploadError("failed"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Decode, read the palette and the alpha estimate, downscale and upload one dropped photo. */
export async function uploadPhoto(handle: string, file: File, opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {}): Promise<UploadedPhoto> {
  if (file.size > MAX_INPUT_MB * 1024 * 1024) throw new PhotoUploadError("too_large");
  let prepared: Awaited<ReturnType<typeof preparePhoto>>;
  try {
    prepared = await preparePhoto(file);
  } catch {
    throw new PhotoUploadError("not_image");
  }
  const [cutout, uploaded] = await Promise.all([alphaOf(file), send(handle, prepared.blob, file.name || "photo", opts.onProgress, opts.signal)]);
  return { id: uploaded.id, thumbUrl: uploaded.thumbUrl, width: prepared.width, height: prepared.height, palette: prepared.palette, cutout };
}

/** A resumed flow's palette: the library thumbnail (same origin, so the canvas is readable) through the same k-means. */
export function paletteFromUrl(url: string): Promise<ExtractedPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const s = Math.min(1, SAMPLE / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * s));
        c.height = Math.max(1, Math.round(img.naturalHeight * s));
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(extractPalette(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * The sampler's facts of the photos (DES-§4.4) from what the browser read: the count, the widest, the estimate, the
 * dominant colour. P6's `photoFacts(bitmap, meta)` replaces this at the integration; until then `sharp` is not
 * measured and stays false (never assumed).
 */
export function photoFactsOf(photos: readonly Pick<UploadedPhoto, "width" | "palette" | "cutout">[]): PhotoFacts[] {
  const maxWidth = photos.reduce((m, p) => Math.max(m, p.width), 0);
  return photos.map((p) => ({
    count: photos.length,
    maxWidth,
    hasCutout: p.cutout,
    dominant: p.palette?.colors[0]?.hex ?? null,
    background: { luminance: p.palette?.brightness ?? 0.5, uniform: p.cutout === "estimated" },
    sharp: false,
  }));
}
