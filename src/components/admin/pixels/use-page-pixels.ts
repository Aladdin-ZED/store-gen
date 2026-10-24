"use client";
/**
 * Client loaders for the pixel UIs: the library view (wizard) and one page's pixel state — library,
 * live version's pixels, publish right (builder section, publish block). Shared in-tab cache so the
 * builder section and the publish dialog don't fetch twice; `reload()` after any pixel write.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { pagePixelsAction, pixelLibraryAction, type PagePixelsState } from "@/lib/pixels/actions";
import type { PixelLibraryView } from "@/lib/pixels/library";

type Listener = () => void;
const pageCache = new Map<string, { at: number; data: PagePixelsState }>();
const listeners = new Map<string, Set<Listener>>();
const TTL = 20_000;

function notify(pageId: string) {
  for (const l of listeners.get(pageId) ?? []) l();
}

/** Forget the cached state of a page (after a write) and let every mounted reader refetch. */
export function invalidatePagePixels(pageId: string) {
  pageCache.delete(pageId);
  notify(pageId);
}

export function usePagePixels(pageId: string | null): { state: PagePixelsState | null; failed: boolean; reload: () => Promise<void>; set: (s: PagePixelsState) => void } {
  const [state, setState] = useState<PagePixelsState | null>(() => (pageId ? (pageCache.get(pageId)?.data ?? null) : null));
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!pageId) return;
    try {
      const res = await pagePixelsAction(pageId);
      if (res.ok) {
        pageCache.set(pageId, { at: Date.now(), data: res.data });
        setState(res.data);
        setFailed(false);
      } else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, [pageId]);

  // another reader wrote or reloaded: take the shared copy (or fetch when it was dropped)
  useEffect(() => {
    if (!pageId) return;
    const l = () => {
      const hit = pageCache.get(pageId);
      if (hit) setState(hit.data);
      else void load();
    };
    let set = listeners.get(pageId);
    if (!set) listeners.set(pageId, (set = new Set()));
    set.add(l);
    return () => void set!.delete(l);
  }, [pageId, load]);

  useEffect(() => {
    if (!pageId) return;
    const hit = pageCache.get(pageId);
    if (hit && Date.now() - hit.at < TTL) return;
    let alive = true;
    pagePixelsAction(pageId)
      .then((res) => {
        if (!alive) return;
        if (res.ok) {
          pageCache.set(pageId, { at: Date.now(), data: res.data });
          setState(res.data);
          setFailed(false);
        } else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [pageId]);

  const reload = useCallback(async () => {
    if (!pageId) return;
    pageCache.delete(pageId);
    await load();
    notify(pageId);
  }, [pageId, load]);

  const set = useCallback(
    (s: PagePixelsState) => {
      if (!pageId) return;
      pageCache.set(pageId, { at: Date.now(), data: s });
      setState(s);
      notify(pageId);
    },
    [pageId],
  );

  return { state, failed, reload, set };
}

export function usePixelLibrary(): { view: PixelLibraryView | null; failed: boolean; setView: (v: PixelLibraryView) => void } {
  const [view, setView] = useState<PixelLibraryView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    pixelLibraryAction()
      .then((res) => {
        if (!alive) return;
        if (res.ok) setView(res.data);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);
  return { view, failed, setView };
}

const TICK_MS = 30_000;
const subscribeTick = (cb: () => void) => {
  const t = setInterval(cb, TICK_MS);
  return () => clearInterval(t);
};
const tickSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const serverTick = () => 0;

/**
 * The current time in 30 s steps (test countdowns). 0 on the server and while hydrating, so server
 * and client render the same text; time-dependent bits show once mounted.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribeTick, tickSnapshot, serverTick);
}

const noop = () => () => undefined;
/** false on the server and while hydrating (local clock times differ between them). */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
