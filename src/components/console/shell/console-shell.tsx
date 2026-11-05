"use client";
/**
 * <ConsoleShell> (platform.md PLA-§4.2-§4.4, PD20, PD25, PD43; design.md DES-§16.1-§16.11; UX-03): the frame of every
 * console page. `data-surface="console"` with the teal accent (hue 205) and the deep-ink sidebar, compact density by
 * default (per viewer, a localStorage convenience), the topbar (the one frosted surface), the console ⌘K, the `G <key>`
 * chords, the `?` sheet and `/` page search. The layout hands it everything precomputed on the server: the filtered
 * navigation, the permissions held, the first pulse, the address mode, the footer facts.
 *
 *   <ConsoleShell nav={consoleNavFor(ctx, CURRENT_RELEASE)} grants={…} pulse={await consolePulse(ctx)} …>{children}</ConsoleShell>
 *
 * Below 1024 px the sidebar is a sheet behind the topbar's menu button; below 768 px the palette is a full-height
 * sheet. While the shell is mounted, <body> carries the console tokens too, so portalled layers (palette, menus,
 * sheets, toasts) read the console palette and never the tenant's jade.
 */
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { PlatformPermission } from "@/lib/auth/permissions";
import { useT } from "@/lib/i18n/admin/client";
import type { ConsolePulse } from "@/lib/platform/pulse-rules";
import { cn } from "@/lib/utils";
import { useChords, type Chord } from "../_compat/chords";
import { ConsolePalette } from "../command/console-palette";
import { consoleChords, type ConsoleNavGroup } from "../nav";
import { ConsoleShellContext, type ConsoleDensity, type ConsoleShellApi, type ScreenKeys } from "./context";
import { ConsolePulseProvider } from "./pulse-provider";
import { ShortcutSheet } from "./shortcut-sheet";
import { ConsoleSidebar, type SidebarFooter } from "./sidebar";
import { ConsoleTopbar, type TopbarFacts } from "./topbar";
import styles from "./console.module.css";

const DENSITY_KEY = "sg-console-density";

function readDensity(): ConsoleDensity | null {
  try {
    const v = window.localStorage.getItem(DENSITY_KEY);
    return v === "compact" || v === "comfortable" ? v : null;
  } catch {
    return null;
  }
}

/** blocked storage (a private window): the choice lasts for this page only */
let pageDensity: ConsoleDensity | null = null;
const densityListeners = new Set<() => void>();

function writeDensity(d: ConsoleDensity): void {
  pageDensity = d;
  try {
    window.localStorage.setItem(DENSITY_KEY, d);
  } catch {
    // kept in pageDensity
  }
  for (const l of densityListeners) l();
}

function subscribeDensity(onChange: () => void): () => void {
  densityListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    densityListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
const densitySnapshot = (): ConsoleDensity => readDensity() ?? pageDensity ?? "compact";
const serverDensity = (): ConsoleDensity => "compact";

export interface ConsoleShellProps {
  nav: ConsoleNavGroup[];
  /** the platform permissions this staff member holds (the server's `ctx.can`, evaluated once) */
  grants: PlatformPermission[];
  pulse: ConsolePulse | null;
  timeZone: string;
  lang: string;
  dir: "ltr" | "rtl";
  footer: SidebarFooter;
  topbar: TopbarFacts;
  children: ReactNode;
}

export function ConsoleShell({ nav, grants, pulse, timeZone, lang, dir, footer, topbar, children }: ConsoleShellProps) {
  const t = useT();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  // the viewer's density, after hydration (the server renders the compact default)
  const density = useSyncExternalStore(subscribeDensity, densitySnapshot, serverDensity);
  const [palette, setPalette] = useState<{ open: boolean; mode: "default" | "view_as" }>({ open: false, mode: "default" });
  const [shortcuts, setShortcuts] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [screenKeys, setScreenKeys] = useState<ScreenKeys | null>(null);

  // portalled layers mount under <body>: give it the console tokens while the shell is here
  useEffect(() => {
    const body = document.body;
    body.classList.add(styles.tokens!);
    body.dataset.surface = "console";
    return () => {
      body.classList.remove(styles.tokens!);
      if (body.dataset.surface === "console") delete body.dataset.surface;
    };
  }, []);

  const setDensity = useCallback((d: ConsoleDensity) => writeDensity(d), []);

  const granted = useMemo(() => new Set(grants), [grants]);
  const api = useMemo<ConsoleShellApi>(
    () => ({
      nav,
      timeZone,
      density,
      setDensity,
      toggleDensity: () => setDensity(density === "compact" ? "comfortable" : "compact"),
      toggleTheme: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      openPalette: (mode = "default") => setPalette({ open: true, mode }),
      openShortcuts: () => setShortcuts(true),
      can: (p) => granted.has(p),
      screenKeys,
      setScreenKeys,
    }),
    [nav, timeZone, density, setDensity, setTheme, resolvedTheme, granted, screenKeys],
  );

  // ⌘K / Ctrl+K opens the palette from anywhere, fields included (the chords below never fire inside a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => (p.open ? { ...p, open: false } : { open: true, mode: "default" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chords = useMemo<Chord[]>(
    () => [
      ...consoleChords(nav).map(({ key, item }) => ({ keys: `g ${key}`, run: () => router.push(item.href) })),
      { keys: "?", run: () => setShortcuts(true) },
      {
        keys: "/",
        run: () => {
          // the page's own search field when it has one, else the palette
          const field = document.querySelector<HTMLElement>("[data-page-search]");
          if (field) field.focus();
          else setPalette({ open: true, mode: "default" });
        },
      },
    ],
    [nav, router],
  );
  useChords(chords);

  return (
    <ConsoleShellContext.Provider value={api}>
      <ConsolePulseProvider initial={pulse}>
        <div lang={lang} dir={dir} data-surface="console" data-density={density} className={cn(styles.tokens, styles.root, "flex min-h-dvh w-full")}>
          <a
            href="#console-main"
            className="sr-only z-50 rounded-[var(--r-control)] bg-background px-3 py-2 text-[13px] font-medium ring-2 ring-[var(--ring)] focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
          >
            {t("console.shell.skip")}
          </a>

          <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 lg:block">
            <ConsoleSidebar nav={nav} footer={footer} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <ConsoleTopbar facts={topbar} onOpenNav={() => setNavOpen(true)} />
            <main id="console-main" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-5 pb-16 outline-none md:px-6 lg:px-8 lg:pt-7">
              {children}
            </main>
          </div>

          <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_230/0.4)] lg:hidden" />
              <DialogPrimitive.Content aria-describedby={undefined} className={cn(styles.drawer, "fixed inset-y-0 start-0 z-50 w-[min(300px,86vw)] outline-none lg:hidden")}>
                <DialogPrimitive.Title className="sr-only">{t("console.nav.label")}</DialogPrimitive.Title>
                <ConsoleSidebar nav={nav} footer={footer} onNavigate={() => setNavOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          <ConsolePalette open={palette.open} mode={palette.mode} onOpenChange={(open) => setPalette((p) => ({ ...p, open }))} onMode={(mode) => setPalette({ open: true, mode })} />
          <ShortcutSheet open={shortcuts} onOpenChange={setShortcuts} />
        </div>
      </ConsolePulseProvider>
    </ConsoleShellContext.Provider>
  );
}
