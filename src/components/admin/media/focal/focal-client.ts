"use client";
/**
 * Browser client for /api/app/<handle>/media/[id] (crop data of an image of the store on screen): one shared cache
 * per tab, keyed by store and id, so the library, the builder fields and the generator read each image's analysis
 * once and a tab that moves to another store never answers from the first store's entries.
 *
 *   const { info, loading } = useFocalInfo(assetId);   // subject analysis + the library default
 *   await saveFocal(assetId, { x, y } | null);          // library default (null = back to auto)
 *   const ref = await withLibraryDefault({ id, alt });  // fx/fy pre-filled when the library has one
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { currentStoreHandle, requireStoreHandle } from "@/components/admin/shell/store-handle";
import { apiHref } from "@/lib/urls";
import type { FocalPoint } from "./frames";
import { roundFocal, type FocalInfo } from "./tags";

const ASSET_ID = /^[a-f0-9]{16,64}$/;

export class FocalApiError extends Error {}

const resolved = new Map<string, FocalInfo>();
const inflight = new Map<string, Promise<FocalInfo>>();
const listeners = new Set<() => void>();
let version = 0;

/** cache key: the store on screen + the asset id */
const keyOf = (id: string) => `${currentStoreHandle() ?? ""}:${id}`;

function publish(info: FocalInfo) {
  resolved.set(keyOf(info.id), info);
  version++;
  for (const l of listeners) l();
}

async function request(id: string, init?: RequestInit): Promise<FocalInfo> {
  let url: string;
  try {
    url = apiHref(requireStoreHandle(), `/media/${encodeURIComponent(id)}`);
  } catch (err) {
    throw new FocalApiError(err instanceof Error ? err.message : "Couldn't read the crop data of this image.");
  }
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; focal?: FocalInfo; message?: string } | null;
  if (!res.ok || !body?.ok || !body.focal) {
    throw new FocalApiError(
      res.status === 403
        ? "Your role can't change the library's framing."
        : res.status === 404
          ? "This image is no longer in the library."
          : res.status === 429
            ? "Too many changes at once — wait a minute."
            : (body?.message ?? "Couldn't read the crop data of this image."),
    );
  }
  return body.focal;
}

/** At most a few reads at once: a library grid asks for every visible tile, the server may analyse each. */
const MAX_PARALLEL = 3;
let running = 0;
const queue: (() => void)[] = [];
function gated<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      running++;
      task()
        .then(resolve, reject)
        .finally(() => {
          running--;
          queue.shift()?.();
        });
    };
    if (running < MAX_PARALLEL) run();
    else queue.push(run);
  });
}

/** Cached crop data of an image (one request per id and tab). */
export function loadFocal(id: string): Promise<FocalInfo> {
  if (!ASSET_ID.test(id)) return Promise.reject(new FocalApiError("Unknown image."));
  const key = keyOf(id);
  const hit = resolved.get(key);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(key);
  if (!p) {
    p = gated(() => request(id))
      .then((info) => {
        publish(info);
        return info;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

export const peekFocal = (id: string | null | undefined): FocalInfo | undefined => (id ? resolved.get(keyOf(id)) : undefined);

/** Save (or clear with null) the library's default point of an image. */
export async function saveFocal(id: string, focal: FocalPoint | null): Promise<FocalInfo> {
  const info = await request(id, { method: "PATCH", body: JSON.stringify({ focal: focal ? roundFocal(focal) : null }) });
  publish(info);
  return info;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Crop data of one image, loaded on demand and shared across every mounted picker. */
export function useFocalInfo(id: string | null | undefined, enabled = true) {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const info = id ? (resolved.get(keyOf(id)) ?? null) : null;
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  useEffect(() => {
    if (!enabled || !id || resolved.has(keyOf(id))) return;
    let live = true;
    loadFocal(id).catch((err: unknown) => {
      if (live) setFailed({ id, message: err instanceof Error ? err.message : "Couldn't read the crop data." });
    });
    return () => {
      live = false;
    };
  }, [id, enabled]);
  const error = failed && failed.id === id && !info ? failed.message : null;
  return {
    info,
    loading: !!id && enabled && !info && !error,
    error,
    retry: () => {
      if (!id) return;
      setFailed(null);
      void loadFocal(id).catch((err: unknown) => setFailed({ id, message: err instanceof Error ? err.message : "Couldn't read the crop data." }));
    },
  };
}

/**
 * The same reference with fx/fy pre-filled from the library's default point, when the team set
 * one; otherwise unchanged (auto framing). Never fails: unreadable crop data means auto.
 */
export async function withLibraryDefault<T extends { id: string }>(ref: T): Promise<T & { fx?: number; fy?: number }> {
  try {
    const saved = (await loadFocal(ref.id)).saved;
    return saved ? { ...ref, fx: saved.x, fy: saved.y } : ref;
  } catch {
    return ref;
  }
}
