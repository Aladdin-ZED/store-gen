"use client";
/**
 * The console shell's client context (platform.md PLA-§4.2, §4.4): what the topbar, the sidebar, the palette, the
 * chords and the overview panels share. The layout computes everything here on the server (the filtered navigation,
 * the permissions held, the platform time zone); nothing in it is a secret.
 *
 *   const shell = useConsoleShell();
 *   shell.openPalette();             // ⌘K
 *   shell.can("signups.decide");     // what the server granted this staff member
 *   const now = useNow(30_000);      // a clock that re-renders every 30 s
 *   useScreenKeys({ title, lines }); // the page's shortcuts in the `?` sheet
 */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { PlatformPermission } from "@/lib/auth/permissions";
import type { ConsoleNavGroup } from "../nav";

export type ConsoleDensity = "compact" | "comfortable";

/** A screen's own shortcuts for the `?` sheet (PLA-§4.7 rule 2: the sheet lists every shortcut of the screen). */
export interface ScreenKeys {
  title: string;
  lines: { label: string; keys: string[] }[];
}

export interface ConsoleShellApi {
  nav: ConsoleNavGroup[];
  timeZone: string;
  density: ConsoleDensity;
  setDensity(d: ConsoleDensity): void;
  toggleDensity(): void;
  toggleTheme(): void;
  openPalette(mode?: "default" | "view_as"): void;
  openShortcuts(): void;
  can(p: PlatformPermission): boolean;
  /** the current screen's shortcuts (a page sets them while mounted, `null` on unmount) */
  screenKeys: ScreenKeys | null;
  setScreenKeys(keys: ScreenKeys | null): void;
}

export const ConsoleShellContext = createContext<ConsoleShellApi | null>(null);

export function useConsoleShell(): ConsoleShellApi {
  const ctx = useContext(ConsoleShellContext);
  if (!ctx) throw new Error("useConsoleShell must be used inside <ConsoleShell>");
  return ctx;
}

/** The current time, refreshed every `everyMs` (the server's first render and the client agree within a tick). */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/**
 * False on the server and the first client render, true once hydrated: a countdown that hides itself when its time
 * runs out renders only after hydration, so a slow first load never hydrates a chip the server drew and the client
 * has already dropped.
 */
const noSubscribe = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** Lists the page's shortcuts in the `?` sheet while it is mounted. */
export function useScreenKeys(keys: ScreenKeys | null): void {
  const ctx = useContext(ConsoleShellContext);
  const set = ctx?.setScreenKeys;
  const sig = keys ? JSON.stringify(keys) : "";
  useEffect(() => {
    if (!set) return;
    set(sig ? (JSON.parse(sig) as ScreenKeys) : null);
    return () => set(null);
  }, [set, sig]);
}
