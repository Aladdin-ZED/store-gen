"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SearchHit } from "@/lib/admin-data/search";
import type { ActionResult } from "../lib/action-result";
import { usePrefetchOnIdle } from "../lib/lazy";

export { Kbd } from "./kbd";

// the palette (cmdk, search, actions) is code-split: fetched once the screen is idle, so ⌘K stays instant
const loadPalette = () => import("./command-palette-body");
const PREFETCH = [loadPalette];
const Palette = dynamic(() => import("./command-palette-body").then((m) => m.Palette), {
  ssr: false,
  loading: () => <div className="h-[3.25rem] border-b border-border/70" aria-hidden="true" />,
});

const PaletteContext = createContext<{ open: () => void } | null>(null);

export function useCommandPalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used inside <CommandPaletteProvider>");
  return ctx;
}

/** ⌘K / Ctrl+K anywhere in the store's dashboard; "/" too when not typing. Search answers for the store on screen only. */
export function CommandPaletteProvider({ search, children }: { search: (q: string) => Promise<ActionResult<SearchHit[]>>; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setOpen(true) }), []);
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
