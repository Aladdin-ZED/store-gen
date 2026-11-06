import "server-only";
/**
 * The console media proxy's loader (platform.md PLA-§7.13 Media, §M.2; P0b V-1, review F-4): what
 * `GET /api/admin/stores/<id>/media/<key>` streams, so the store profile's thumbnails (strip 3's draft previews, the R2
 * Media tab) keep working while the public media route answers 404 for a suspended store.
 *
 *   const file = await loadConsoleMedia(ctx, storeId, key);   // null → the neutral 404
 *   return new Response(file.stream, { headers: consoleMediaHeaders(file) });
 *
 * The key must belong to the store in the URL (`media_files.store_id`), whatever the store's state; the bytes come
 * from the media store's reader (src/lib/media/store.ts; P8's storage driver replaces it at its merge, same answer).
 * The handler's own headers: the media route's sandbox CSP, nosniff and `private, no-store`; never CORP
 * `cross-origin` (the proxy adds CORP `same-origin`, frame DENY, Referrer-Policy and noindex, V-1).
 */
import { AuthRefusal } from "@/lib/auth/errors";
import { KEY_RE } from "@/lib/media/keys";
import { getMediaMeta, streamMediaRange, type MediaFileMeta } from "@/lib/media/store";
import type { PlatformCtx } from "@/lib/tenancy/types";
import { platformScope } from "./seam";

export interface ConsoleMediaFile {
  meta: Pick<MediaFileMeta, "key" | "mime" | "bytes" | "sha256">;
  stream: ReadableStream<Uint8Array>;
}

/** `console.read`: the store's own media file by key, or null (unknown key, or a key of another store). */
export async function loadConsoleMedia(ctx: PlatformCtx, storeId: string, key: string): Promise<ConsoleMediaFile | null> {
  if (!ctx.can("console.read")) throw new AuthRefusal("forbidden");
  if (!/^[0-9A-Z]{26}$/.test(storeId) || typeof key !== "string" || !KEY_RE.test(key)) return null;
  const scope = platformScope(ctx, storeId);
  // tenancy: public-key the media key is global and random (§G.6); the file is served only when its row names this store
  const meta = await getMediaMeta(key);
  if (!meta || meta.storeId !== scope.storeId || meta.bytes <= 0) return null;
  return { meta: { key: meta.key, mime: meta.mime, bytes: meta.bytes, sha256: meta.sha256 }, stream: streamMediaRange(meta, 0, meta.bytes - 1) };
}

/** The handler's headers for a console media answer (the proxy adds the console framing headers, V-1). */
export function consoleMediaHeaders(file: Pick<ConsoleMediaFile, "meta">): Record<string, string> {
  return {
    "Content-Type": file.meta.mime,
    "Content-Length": String(file.meta.bytes),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    ETag: `"${file.meta.sha256.slice(0, 32)}"`,
  };
}
