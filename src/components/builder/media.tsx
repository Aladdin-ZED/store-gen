"use client";
/**
 * Media for the builder: a promise-based picker (one shared MediaPicker dialog) and a direct
 * uploader used for generated files (AI cutouts). Picked/uploaded rows are registered in the store
 * so the live preview can resolve them immediately.
 */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useOpenedOnce } from "@/components/admin/lib/lazy";
import { MediaPicker } from "@/components/admin/on-demand";
import { requireStoreHandle } from "@/components/admin/shell/store-handle";
// the picker's material layer; the builder doesn't load the panel stylesheet, and the code-split
// picker must not open unstyled on a slow first fetch
import "@/components/admin/styles/admin.css";
import { assetRowOf } from "@/lib/media/asset-row";
import type { AssetFocus } from "@/lib/media/focus";
import type { EditorAsset } from "@/lib/editor/types";
import { apiHref } from "@/lib/urls";
import { useEditorApi } from "./context";
import { useEnv } from "./env";

/** Shape handed over by the media library (see the MediaPicker contract). */
export interface PickedAsset {
  id: string;
  width: number;
  height: number;
  alpha: boolean;
  dominant: string;
  variants: { key: string; w: number; h: number; fmt: string }[];
  kind?: "image" | "video";
  /** stored MIME type (a WebM video plays its .webm file) */
  mime?: string;
  /** the library's default alt text, when the picker provides one */
  alt?: string;
  /** subject analysis (focal point, subject box, heads, hands) — the canvas crops like the live page */
  focus?: AssetFocus | null;
  /** the library's default framing point (AssetRef fx/fy); null/absent = auto framing */
  focal?: { x: number; y: number } | null;
}

/**
 * A picked asset as registered in the store, with the library's default alt text and default
 * framing point (null = auto), so a field can pre-fill fx/fy without another request.
 */
export type PickResult = EditorAsset & { alt: string; focal: { x: number; y: number } | null };

const unit = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 1000) / 1000 : null);

/** The library's default point, validated (a hand-edited tag must never reach a page as NaN). */
function focalOf(a: PickedAsset): { x: number; y: number } | null {
  const x = unit(a.focal?.x);
  const y = unit(a.focal?.y);
  return x !== null && y !== null ? { x, y } : null;
}

export interface PickOptions {
  accept?: "image" | "video";
  title?: string;
}

/**
 * A picked or uploaded asset as the store's row: the renderer row every path shares (subject
 * analysis and MIME included), so the canvas crops and plays it exactly like the published page.
 */
export function toEditorAsset(a: PickedAsset, kind: "image" | "video" = "image", palette?: unknown): EditorAsset {
  return { ...assetRowOf(a, kind), ...(palette !== undefined ? { palette } : {}) };
}

interface MediaApi {
  pick(opts?: PickOptions): Promise<PickResult | null>;
  upload(file: Blob, opts?: { name?: string; cutout?: boolean; sourceAssetId?: string }): Promise<EditorAsset>;
}

const MediaContext = createContext<MediaApi | null>(null);

interface Pending extends PickOptions {
  resolve: (asset: PickResult | null) => void;
}

export function MediaProvider({ children }: { children: ReactNode }) {
  const api = useEditorApi();
  const { user } = useEnv();
  const [pending, setPending] = useState<Pending | null>(null);
  const current = useRef<Pending | null>(null);
  const pickerMounted = useOpenedOnce(!!pending);

  const settle = useCallback((asset: PickResult | null) => {
    current.current?.resolve(asset);
    current.current = null;
    setPending(null);
  }, []);

  const pick = useCallback(
    (opts: PickOptions = {}) =>
      new Promise<PickResult | null>((resolve) => {
        current.current?.resolve(null);
        const next = { ...opts, resolve };
        current.current = next;
        setPending(next);
      }),
    [],
  );

  const upload = useCallback(
    async (file: Blob, opts: { name?: string; cutout?: boolean; sourceAssetId?: string } = {}) => {
      const form = new FormData();
      form.append("file", file, opts.name ?? "upload.png");
      if (opts.cutout) form.append("cutout", "1");
      if (opts.sourceAssetId) form.append("sourceAssetId", opts.sourceAssetId);
      // the store's media API (the builder's page belongs to the store on screen)
      const res = await fetch(apiHref(requireStoreHandle(), "/media"), { method: "POST", body: form, credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; asset?: PickedAsset & { kind?: "image" | "video"; palette?: unknown }; message?: string } | null;
      if (!res.ok || !json?.ok || !json.asset) throw new Error(json?.message ?? "The upload failed.");
      const row = toEditorAsset(json.asset, json.asset.kind ?? "image", json.asset.palette ?? null);
      api.addAssets([row]);
      return row;
    },
    [api],
  );

  return (
    <MediaContext.Provider value={{ pick, upload }}>
      {children}
      {pickerMounted ? (
        <MediaPicker
          open={!!pending}
          onOpenChange={(open) => {
            if (!open) settle(null);
          }}
          onPick={(asset) => {
            const kind = asset.kind ?? (pending?.accept === "video" ? "video" : "image");
            const row = toEditorAsset(asset, kind);
            api.addAssets([row]);
            settle({ ...row, alt: typeof asset.alt === "string" ? asset.alt.slice(0, 200) : "", focal: kind === "image" ? focalOf(asset) : null });
          }}
          accept={pending?.accept ?? "image"}
          allowUpload={user.canUpload}
          title={pending?.title}
        />
      ) : null}
    </MediaContext.Provider>
  );
}

export function useMedia(): MediaApi {
  const m = useContext(MediaContext);
  if (!m) throw new Error("useMedia must be used inside <MediaProvider>");
  return m;
}
