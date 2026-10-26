"use client";
/**
 * Static facts about the builder session (store identity, permissions, AI settings) plus small
 * hooks shared by panels: the built theme of the current doc, asset URLs, a ticking clock.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AssetRowLike, StoreInfo } from "@/landing/context";
import type { CheckContextData } from "@/lib/editor/check-context";
import type { EditorBootstrap, EditorUser, StoreHealth } from "@/lib/editor/types";
import { buildTheme, type BuiltTheme } from "@/lib/theme";
import { useEditor } from "./context";

export interface BuilderEnv {
  store: StoreInfo;
  storeHealth: StoreHealth;
  /** the checklist's store facts from the server preload (LAN Q15) */
  check: CheckContextData;
  user: EditorUser;
  ai: EditorBootstrap["ai"];
}

const EnvContext = createContext<BuilderEnv | null>(null);

export function EnvProvider({ value, children }: { value: BuilderEnv; children: ReactNode }) {
  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
}

export function useEnv(): BuilderEnv {
  const env = useContext(EnvContext);
  if (!env) throw new Error("useEnv must be used inside <EnvProvider>");
  return env;
}

/** Theme tokens of the current doc (memoized: buildTheme costs a few ms). */
export function useBuiltTheme(): BuiltTheme | null {
  const theme = useEditor((s) => s.doc.theme);
  const locale = useEditor((s) => s.doc.locale);
  return useMemo(() => {
    try {
      return buildTheme(theme, locale);
    } catch {
      return null;
    }
  }, [theme, locale]);
}

/** Smallest rendition at least `minWidth` wide (falls back to the largest), as a /media URL. */
export function assetUrl(asset: AssetRowLike | undefined | null, minWidth = 360): string | null {
  if (!asset?.variants?.length) return null;
  const images = asset.variants.filter((v) => v.fmt === "webp" || v.fmt === "png" || v.fmt === "jpeg");
  const pool = images.length ? images : asset.variants;
  const sorted = [...pool].sort((a, b) => a.w - b.w);
  const pick = sorted.find((v) => v.w >= minWidth) ?? sorted[sorted.length - 1];
  return pick ? `/media/${encodeURIComponent(pick.key)}` : null;
}

/** Date.now() that refreshes every `ms` (relative times). */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function relativeTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined });
}

export function fullTime(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
