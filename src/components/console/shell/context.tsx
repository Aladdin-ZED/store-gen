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
 */
import { createContext, useContext, useEffect, useState } from "react";
import type { PlatformPermission } from "@/lib/auth/permissions";
import type { ConsoleNavGroup } from "../nav";

export type ConsoleDensity = "compact" | "comfortable";

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
