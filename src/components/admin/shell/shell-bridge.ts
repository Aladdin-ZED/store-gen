/**
 * The shell's services for its ⌘K commands (P2 SHELL; platform.md PLA-§22.13; docs/STORE-SAAS.md §I.3). A command's
 * `run(ctx)` gets the frozen `CommandCtx` (the store, the grants, `navigate`), which cannot open a sheet or flip the
 * theme; the shell commands of ./commands/shell.ts reach those through this one registry instead. The store frame's
 * palette provider registers the services while it is mounted; outside a store's dashboard there are none and the
 * commands do nothing. Isomorphic (no React, no DOM): `test:shell` registers fakes.
 */

/** The palette's pages: the root list, the Create menu (`C`), the languages, the member's other stores (`G W`). */
export type PalettePage = "root" | "create" | "language" | "stores";

export interface ShellServices {
  openPalette(page?: PalettePage): void;
  openShortcuts(): void;
  openHelp(): void;
  toggleTheme(): void;
  toggleDensity(): void;
  /** `recomputeHealthAction`, with its toast */
  recomputeHealth(): Promise<void>;
  /** the browser's install prompt, or the iPhone sheet */
  installApp(): void;
  /** may the command with this id run now? (Install the app: only while the browser offers it) */
  available(commandId: string): boolean;
}

let current: ShellServices | null = null;

/** Registers the services; answers the unregister function (a later registration wins until it leaves). */
export function provideShellServices(services: ShellServices): () => void {
  current = services;
  return () => {
    if (current === services) current = null;
  };
}

/** The services of the store frame on screen, or null. */
export function shellServices(): ShellServices | null {
  return current;
}
