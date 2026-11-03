"use client";

import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StoreSearchResult } from "@/app/api/app/[store]/search/run";
import type { SearchHit } from "@/lib/admin-data/search";
import type { ActionResult } from "../lib/action-result";
import { usePrefetchOnIdle } from "../lib/lazy";
import { useStore } from "./store-context";

export { Kbd } from "./kbd";

// the palette (cmdk, search, actions) is code-split: fetched once the screen is idle, so ⌘K stays instant
const loadPalette = () => import("./command-palette-body");
const PREFETCH = [loadPalette];
const Palette = dynamic(() => import("./command-palette-body").then((m) => m.Palette), {
  ssr: false,
  loading: () => <div className="h-[3.25rem] border-b border-border/70" aria-hidden="true" />,
});

const PaletteContext = createContext<{ open: () => void; index: Promise<PaletteIndex | null> | null } | null>(null);

/**
 * The palette's local index (PLA-§22.13): the store's 20 most recently edited pages and, for members who may read
 * them, the members' names, streamed by the `[store]` layout after the first paint (the rework of p2-08 reads it).
 */
export interface PaletteIndex {
  pages: { id: string; name: string; slug: string; status: string }[];
  members: { userId: string; name: string; role: string }[];
}

export function useCommandPalette(): { open: () => void; index: Promise<PaletteIndex | null> | null } {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used inside <CommandPaletteProvider>");
  return ctx;
}

/**
 * ⌘K / Ctrl+K anywhere in the store's dashboard; "/" too when not typing. Search answers for the store on screen only:
 * `GET /api/app/<h>/search` (the store's guard, its rate bucket, masked hits), flattened in group order.
 */
export function CommandPaletteProvider({ index = null, children }: { index?: Promise<PaletteIndex | null> | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const store = useStore();
  const value = useMemo(() => ({ open: () => setOpen(true), index }), [index]);
  const searchUrl = store.api("/search");
  const search = useCallback(
    async (q: string): Promise<ActionResult<SearchHit[]>> => {
      const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return { ok: false, error: res.status === 429 ? "rate_limited" : res.status === 404 ? "not_found" : "server" };
      const body = (await res.json()) as StoreSearchResult;
      return { ok: true, data: Array.isArray(body?.groups) ? body.groups.flatMap((g) => g.hits) : [] };
    },
    [searchUrl],
  );
  usePrefetchOnIdle(PREFETCH);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[18%] translate-y-0 overflow-hidden rounded-2xl p-0 shadow-[0_24px_80px_-24px_rgb(0_0_0/0.45)] duration-200 sm:max-w-xl"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Command palette</DialogTitle>
            <DialogDescription>Search this store&apos;s pages and orders, or jump anywhere in its dashboard.</DialogDescription>
          </DialogHeader>
          {open && <Palette search={search} close={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}
