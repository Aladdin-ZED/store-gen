"use client";
/**
 * The tenant ⌘K palette's frame (P2 SHELL; platform.md PLA-§22.13, UX-02, ADM-02; design.md DES-§16.10; docs/
 * STORE-SAAS.md §I.3): the dialog, the keyboard, the chords and the shell's services. The palette itself (the index,
 * the server search, the lists) is ./command-palette-body.tsx, code-split: fetched on the first ⌘ / Ctrl keydown and
 * once the screen is idle, so a warm open is a render, not a download (≤ 50 ms).
 *
 * - Scope: the store in the URL. The server search is `GET /api/app/<h>/search` (the store's guard and rate bucket,
 *   masked hits); the local index (`PaletteIndex`, streamed by the `[store]` layout) belongs to the same store and is
 *   rebuilt when the store changes.
 * - Keys: ⌘K / Ctrl+K toggles anywhere, fields included. The chords (./chords.ts `attachChords`, one listener) never
 *   fire in a field or under an open overlay: `G` + a letter jumps, `C` opens Create, `?` the shortcut sheet, `/`
 *   search, `>` actions. `N`, `1-6`, `E`, `J/K` stay with the screens that own them.
 * - Form: 640 px (≤ 92 vw) at 12 vh, no backdrop blur (the glass budget is the topbar's), open 120 ms ease-out from
 *   0.98, close 100 ms. Below 768 px a full-height sheet with the input pinned at the bottom above the keyboard
 *   (`visualViewport`), results above it nearest the thumb, a 44 px close at the top inline end.
 * - Services: the shell's commands (./commands/shell.ts) reach the sheets, the theme, the density, the health
 *   recompute and the install prompt through ./shell-bridge.ts, registered here while the frame is mounted.
 * - Development only: `#cmdk`, `#cmdk-create`, `#cmdk-actions` and `#shortcuts` in the URL open the matching surface
 *   on load (the screenshot tool cannot press keys).
 */
import { SearchIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { recomputeHealthAction } from "@/app/app/[store]/health-actions";
import { dirOf } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { usePrefetchOnIdle } from "../lib/lazy";
import { attachChords, type ChordCommand } from "./chords";
import { useDensity } from "./density";
import { useHelpSheet } from "./help-sheet";
import { IosInstallSheet, useInstallHint } from "./install-hint";
import { goHrefs, type PaletteMode } from "./palette-logic";
import { provideShellServices, type PalettePage } from "./shell-bridge";
import { useShortcutSheet } from "./shortcut-sheet";
import { useStore } from "./store-context";
import { settingsTabs, storeNav } from "./store-nav";
import type { SwitcherProps } from "./store-switcher";
import { useActionError } from "./use-action-error";

export { Kbd } from "./kbd";

const loadPalette = () => import("./command-palette-body");
const PREFETCH = [loadPalette];
const Palette = dynamic(() => loadPalette().then((m) => m.Palette), { ssr: false, loading: () => <PaletteLoading /> });

/** A cold open (the chunk still on its way): the field's row as it will look, so the dialog never opens blank. */
function PaletteLoading() {
  const t = useT();
  return (
    <div aria-hidden="true" className="flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-4 text-muted-foreground max-md:order-last max-md:mt-auto max-md:h-14 max-md:border-t max-md:border-b-0">
      <SearchIcon className="size-4 shrink-0" />
      <span className="truncate text-[16px]">{t("shell.cmdk.placeholder")}</span>
    </div>
  );
}

/**
 * The palette's local index (PLA-§22.13): the store's 20 most recently edited pages and, for members who may read
 * them, the members' names, streamed by the `[store]` layout after the first paint.
 */
export interface PaletteIndex {
  pages: { id: string; name: string; slug: string; status: string }[];
  members: { userId: string; name: string; role: string }[];
}

export interface PaletteOpen {
  page?: PalettePage;
  mode?: PaletteMode;
}

interface PaletteApi {
  open(opts?: PaletteOpen): void;
  index: Promise<PaletteIndex | null> | null;
}

const PaletteContext = createContext<PaletteApi | null>(null);

export function useCommandPalette(): PaletteApi {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used inside <CommandPaletteProvider>");
  return ctx;
}

const PHONE_QUERY = "(max-width: 767.98px)";
const subscribePhone = (fn: () => void) => {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
};
/** Below 768 px the palette is the phone sheet (DES-§16.10). */
export function usePhoneForm(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}

/** The visible viewport while the phone sheet is open: the sheet ends above the on-screen keyboard. */
function useVisualViewport(active: boolean): { height: number; top: number } | null {
  const [vv, setVv] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const v = active ? window.visualViewport : null;
    if (!v) return;
    const read = () => setVv({ height: Math.round(v.height), top: Math.round(v.offsetTop) });
    const first = requestAnimationFrame(read);
    v.addEventListener("resize", read);
    v.addEventListener("scroll", read);
    return () => {
      cancelAnimationFrame(first);
      v.removeEventListener("resize", read);
      v.removeEventListener("scroll", read);
    };
  }, [active]);
  return active ? vv : null;
}

const DEV_HASHES: Readonly<Record<string, PaletteOpen | "shortcuts">> = {
  "#cmdk": {},
  "#cmdk-create": { page: "create" },
  "#cmdk-actions": { mode: "actions" },
  "#shortcuts": "shortcuts",
};

export function CommandPaletteProvider({ index = null, switcher, children }: { index?: Promise<PaletteIndex | null> | null; switcher: SwitcherProps; children: ReactNode }) {
  const t = useT();
  const locale = useAdminLocale();
  const router = useRouter();
  const store = useStore();
  const help = useHelpSheet();
  const shortcuts = useShortcutSheet();
  const density = useDensity();
  const actions = useActionError();
  const install = useInstallHint();
  const { resolvedTheme, setTheme } = useTheme();
  const phone = usePhoneForm();
  const [state, setState] = useState<{ open: boolean; page: PalettePage; mode: PaletteMode; seq: number }>({ open: false, page: "root", mode: "all", seq: 0 });
  const vv = useVisualViewport(state.open && phone);
  usePrefetchOnIdle(PREFETCH);

  const open = useCallback((opts: PaletteOpen = {}) => {
    void loadPalette().catch(() => undefined);
    setState((s) => ({ open: true, page: opts.page ?? "root", mode: opts.mode ?? "all", seq: s.seq + 1 }));
  }, []);
  const setOpen = useCallback((o: boolean) => setState((s) => ({ ...s, open: o })), []);
  const close = useCallback(() => setOpen(false), [setOpen]);

  // where the G chords go for this member (a target they cannot open does nothing)
  const go = useMemo(() => {
    const viewer = { handle: store.handle, mode: store.mode, can: store.can };
    const nav = new Map(storeNav(viewer).flatMap((g) => g.items.map((i) => [i.id, i.href] as const)));
    return goHrefs({ handle: store.handle, nav, firstSettingsHref: settingsTabs(viewer)[0]?.href ?? null, can: store.can });
  }, [store]);

  // the latest handlers, read by the one listener below (attached once)
  const handlers = useRef({ open, go, shortcuts, router });
  useEffect(() => {
    handlers.current = { open, go, shortcuts, router };
  });

  useEffect(() => {
    let warmed = false;
    const onKey = (e: KeyboardEvent) => {
      if (!warmed && (e.metaKey || e.ctrlKey || e.key === "Meta" || e.key === "Control")) {
        warmed = true;
        void loadPalette().catch(() => undefined);
      }
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        setState((s) => (s.open ? { ...s, open: false } : { open: true, page: "root", mode: "all", seq: s.seq + 1 }));
      }
    };
    const onChord = (cmd: ChordCommand) => {
      const h = handlers.current;
      if (cmd.kind === "create") h.open({ page: "create" });
      else if (cmd.kind === "shortcuts") h.shortcuts.open();
      else if (cmd.kind === "search") h.open({ mode: "search" });
      else if (cmd.kind === "actions") h.open({ mode: "actions" });
      else if (cmd.target === "switch_store") h.open({ page: "stores" });
      else {
        const href = h.go[cmd.target];
        if (href) h.router.push(href);
      }
    };
    window.addEventListener("keydown", onKey);
    const detach = attachChords(window, onChord);
    return () => {
      window.removeEventListener("keydown", onKey);
      detach();
    };
  }, []);

  // development: open a surface from the URL's fragment (the screenshot tool cannot type)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const want = DEV_HASHES[window.location.hash];
    if (!want) return;
    const timer = setTimeout(() => (want === "shortcuts" ? handlers.current.shortcuts.open() : handlers.current.open(want)), 0);
    return () => clearTimeout(timer);
  }, []);

  // the services the shell's commands run through (./commands/shell.ts)
  const services = useRef({ help, density, actions, install, resolvedTheme, setTheme, t });
  useEffect(() => {
    services.current = { help, density, actions, install, resolvedTheme, setTheme, t };
  });
  useEffect(
    () =>
      provideShellServices({
        openPalette: (page = "root") => open({ page }),
        openShortcuts: () => shortcuts.open(),
        openHelp: () => services.current.help.open(),
        toggleTheme: () => services.current.setTheme(services.current.resolvedTheme === "dark" ? "light" : "dark"),
        toggleDensity: () => {
          const d = services.current.density;
          d.setDensity(d.density === "compact" ? "comfortable" : "compact");
        },
        recomputeHealth: async () => {
          const s = services.current;
          const res = await s.actions.run(() => recomputeHealthAction());
          if (res.ok) toast.success(s.t("shell.cmd.health_queued"));
        },
        installApp: () => services.current.install.install(),
        available: (id) => (id === "shell.install_app" ? services.current.install.offer !== null : true),
      }),
    [open, shortcuts],
  );

  const value = useMemo(() => ({ open, index }), [open, index]);
  const sheetStyle: CSSProperties | undefined = phone && vv ? { height: vv.height, top: vv.top } : undefined;

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <IosInstallSheet open={install.iosOpen} onOpenChange={install.setIosOpen} />
      <DialogPrimitive.Root open={state.open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            data-slot="cmdk-backdrop"
            className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_265/0.32)] duration-[120ms] ease-out data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-100"
          />
          <DialogPrimitive.Content
            data-slot="cmdk"
            // portaled to <body>, outside the shell's dir wrapper: the reading direction is set here
            dir={dirOf(locale)}
            lang={locale}
            aria-describedby="cmdk-description"
            style={sheetStyle}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden bg-popover text-popover-foreground outline-none",
              "duration-[120ms] ease-out data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-98 data-closed:duration-100",
              // the desktop dialog: 640 px at 12 vh, results ≤ 420 px
              "md:inset-x-0 md:top-[12vh] md:mx-auto md:max-h-[min(36rem,80vh)] md:w-[min(640px,92vw)] md:origin-top md:rounded-[var(--r-sheet)] md:shadow-[0_24px_80px_-24px_rgb(0_0_0/0.45)] md:ring-1 md:ring-foreground/10",
              // the phone sheet: full height, the input at the bottom
              "max-md:inset-x-0 max-md:top-0 max-md:h-[100dvh] max-md:w-full max-md:origin-bottom",
            )}
          >
            <DialogPrimitive.Title className="sr-only">{t("shell.cmdk.title")}</DialogPrimitive.Title>
            <DialogPrimitive.Description id="cmdk-description" className="sr-only">
              {t("shell.cmdk.description")}
            </DialogPrimitive.Description>
            {state.open && <Palette key={state.seq} initialPage={state.page} initialMode={state.mode} index={index} switcher={switcher} phone={phone} close={close} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </PaletteContext.Provider>
  );
}
