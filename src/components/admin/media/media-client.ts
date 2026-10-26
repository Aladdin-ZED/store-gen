"use client";
/**
 * Browser client for the store's media API (/api/app/<handle>/media, the store on screen): list, upload with real
 * progress (XHR), delete. Shared by the Media library and the MediaPicker.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { requireStoreHandle } from "@/components/admin/shell/store-handle";
import type { AssetFocus } from "@/lib/media/focus";
import { apiHref } from "@/lib/urls";

export interface MediaAsset {
  id: string;
  kind: "image" | "video";
  mime: string;
  width: number;
  height: number;
  bytes: number;
  alpha: boolean;
  dominant: string;
  variants: { key: string; w: number; h: number; fmt: "webp" | "avif" | "png" | "jpeg"; bytes: number }[];
  url: string | null;
  thumbUrl: string | null;
  originalName: string | null;
  sourceAssetId: string | null;
  tags: string[];
  /** subject analysis (focal point, subject box, heads, hands) — null/absent when not analysed yet */
  focus?: AssetFocus | null;
  createdAt: string;
}

/** "image" = photos + cutouts (no videos) */
export type MediaFilter = "all" | "image" | "photo" | "cutout" | "video";

const ALT_PREFIX = "alt:";
export const altOf = (a: Pick<MediaAsset, "tags">) => a.tags.find((t) => t.startsWith(ALT_PREFIX))?.slice(ALT_PREFIX.length) ?? "";

/** Accepted upload types (the server sniffs the bytes anyway). */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
export const VIDEO_ACCEPT = "video/mp4,video/webm";
export const MAX_IMAGE_MB = 15;
export const MAX_VIDEO_MB = 25;

export class MediaApiError extends Error {}

/** "/api/app/<handle>/media<rest>" for the store on screen (MediaApiError outside a store's dashboard). */
function mediaApi(rest = ""): string {
  try {
    return `${apiHref(requireStoreHandle(), "/media")}${rest}`;
  } catch (err) {
    throw new MediaApiError(err instanceof Error ? err.message : "Couldn't reach the media library.");
  }
}

/** DELETE refused (409): live pages or the store logo still show the file — confirm, then force. */
export class MediaInUseError extends MediaApiError {
  constructor(
    message: string,
    readonly livePages: { id: string; name: string; slug: string }[],
    readonly storeLogo: boolean,
  ) {
    super(message);
  }
}

function query(filter: MediaFilter, q: string, page: number, pageSize: number, sourceAssetId?: string): string {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filter === "photo" || filter === "cutout") p.set("filter", filter);
  if (filter === "video") p.set("kind", "video");
  if (filter === "image") p.set("kind", "image");
  if (q.trim()) p.set("q", q.trim().slice(0, 80));
  if (sourceAssetId) p.set("sourceAssetId", sourceAssetId);
  return p.toString();
}

export async function fetchMedia(opts: { filter: MediaFilter; q: string; page: number; pageSize?: number; sourceAssetId?: string; signal?: AbortSignal }) {
  const res = await fetch(mediaApi(`?${query(opts.filter, opts.q, opts.page, opts.pageSize ?? 48, opts.sourceAssetId)}`), {
    signal: opts.signal,
    headers: { Accept: "application/json" },
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; items: MediaAsset[]; total: number; page: number; pageSize: number } | null;
  if (!res.ok || !body?.ok) throw new MediaApiError(res.status === 403 ? "Your role can't open the media library." : "Couldn't load the media library.");
  return body;
}

/** Upload one file; `onProgress` gets 0..1 for the transfer (processing happens after 1). */
export function uploadMedia(
  file: Blob,
  opts: { name?: string; cutout?: boolean; sourceAssetId?: string; onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<{ asset: MediaAsset; deduped: boolean }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, opts.name ?? (file instanceof File ? file.name : "upload"));
    if (opts.cutout) form.append("cutout", "1");
    if (opts.sourceAssetId) form.append("sourceAssetId", opts.sourceAssetId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", mediaApi());
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = xhr.response as { ok?: boolean; asset?: MediaAsset; deduped?: boolean; message?: string; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.ok && body.asset) resolve({ asset: body.asset, deduped: !!body.deduped });
      else if (xhr.status === 429) reject(new MediaApiError(body?.message ?? "Too many uploads at once — wait a few minutes."));
      else reject(new MediaApiError(body?.message ?? (xhr.status === 413 ? "This file is too large." : "Upload failed. Please try again.")));
    };
    xhr.onerror = () => reject(new MediaApiError("Network problem during the upload."));
    xhr.onabort = () => reject(new MediaApiError("Upload cancelled."));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/**
 * Delete a file. Without `force` the server refuses (MediaInUseError) when a live page or the store
 * logo shows it; pass `force` once the admin has confirmed that usage.
 */
export async function deleteMedia(id: string, opts: { force?: boolean } = {}): Promise<void> {
  const p = new URLSearchParams({ id });
  if (opts.force) p.set("force", "1");
  const res = await fetch(mediaApi(`?${p}`), { method: "DELETE" });
  if (res.ok || res.status === 404) return;
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      message?: string;
      pages?: { id: string; name: string; slug: string }[];
      storeLogo?: boolean;
    } | null;
    if (body?.error === "in_use") {
      throw new MediaInUseError(body.message ?? "This file is still shown on live pages.", Array.isArray(body.pages) ? body.pages : [], body.storeLogo === true);
    }
  }
  throw new MediaApiError(res.status === 403 ? "Your role can't delete files." : "Couldn't delete this file.");
}

/** Client-side size guard (clear message before sending megabytes). */
export function precheck(file: File): string | null {
  const isVideo = file.type.startsWith("video/");
  const max = (isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1024 * 1024;
  if (file.size > max) return `${file.name} is larger than ${isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB} MB.`;
  if (!/^(image\/(jpeg|png|webp|avif)|video\/(mp4|webm))$/.test(file.type) && file.type) return `${file.name}: use JPG, PNG, WebP, AVIF, MP4 or WebM.`;
  return null;
}

/** Paginated, filterable list with "load more" (aborts stale requests). */
export function useMediaList(opts: { filter: MediaFilter; q: string; pageSize?: number; initial?: { items: MediaAsset[]; total: number } | null; enabled?: boolean }) {
  const { filter, q, pageSize = 48, enabled = true } = opts;
  const [state, setState] = useState<{ key: string; items: MediaAsset[]; total: number; page: number; error: string | null; loading: boolean }>(() => ({
    key: opts.initial ? `${filter}|${q}` : "",
    items: opts.initial?.items ?? [],
    total: opts.initial?.total ?? 0,
    page: 1,
    error: null,
    loading: !opts.initial,
  }));
  const key = `${filter}|${q}`;
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(
    async (page: number, append: boolean) => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetchMedia({ filter, q, page, pageSize, signal: c.signal });
        setState((s) => ({ key, items: append ? [...s.items, ...res.items.filter((a) => !s.items.some((b) => b.id === a.id))] : res.items, total: res.total, page, error: null, loading: false }));
      } catch (err) {
        if (c.signal.aborted) return;
        setState((s) => ({ ...s, key, loading: false, error: err instanceof Error ? err.message : "Couldn't load media." }));
      }
    },
    [filter, q, pageSize, key],
  );

  useEffect(() => {
    if (!enabled || state.key === key) return;
    const t = setTimeout(() => void load(1, false), 0);
    return () => clearTimeout(t);
  }, [enabled, key, state.key, load]);

  useEffect(() => () => ctrl.current?.abort(), []);

  return {
    /** the previous list stays visible (dimmed by the caller) while a new filter loads */
    items: state.items,
    total: state.total,
    loading: state.loading || state.key !== key,
    error: state.error,
    hasMore: state.items.length < state.total,
    loadMore: () => load(state.page + 1, true),
    reload: () => load(1, false),
    /** optimistic local edits (new upload, alt change, delete) */
    mutate: (fn: (items: MediaAsset[]) => MediaAsset[], totalDelta = 0) => setState((s) => ({ ...s, items: fn(s.items), total: Math.max(0, s.total + totalDelta) })),
  };
}
