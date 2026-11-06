"use client";
/**
 * The keyboard shortcut sheet (P2 SHELL; platform.md PLA-§22.13; docs/STORE-SAAS.md §I.3): `?` anywhere outside a
 * field, ⌘K "Keyboard shortcuts", or the Help sheet's link opens it. It lists what works for this member only: the `G`
 * targets they can open (`goHrefs`), the queue keys for the call roles. Sections come from `shortcutSections`
 * (./chords.ts), so the sheet and the listener never disagree. A side sheet at the inline end, like Help.
 *
 *   const shortcuts = useShortcutSheet();   shortcuts.open();
 */
import { KeyboardIcon } from "lucide-react";
import { createContext, Fragment, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dirOf } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { SheetCloseX } from "../common/sheet-close";
import { shortcutSections, type GoTarget } from "./chords";
import { KbdGroup } from "./kbd";
import { goHrefs } from "./palette-logic";
import { useStore } from "./store-context";
import { settingsTabs, storeNav } from "./store-nav";

interface ShortcutApi {
  open(): void;
}

const ShortcutContext = createContext<ShortcutApi>({ open: () => {} });

const noop = () => () => {};
/** "⌘" on Apple platforms, "Ctrl" elsewhere (server snapshot: "Ctrl"). */
export function useModKey(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

function ShortcutBody() {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const mod = useModKey();
  const sections = useMemo(() => {
    const viewer = { handle: store.handle, mode: store.mode, can: store.can };
    const nav = new Map(storeNav(viewer, locale).flatMap((g) => g.items.map((i) => [i.id, i.href] as const)));
    const hrefs = goHrefs({ handle: store.handle, nav, firstSettingsHref: settingsTabs(viewer, locale)[0]?.href ?? null, can: store.can });
    const show = (target: GoTarget) => target === "switch_store" || hrefs[target] !== undefined;
    return shortcutSections({ mod, show, queue: store.can("agents.self"), label: (k) => t(k) });
  }, [store, locale, mod, t]);

  return (
    <div className="grid gap-7 p-6">
      {sections.map((s) => (
        <section key={s.id} aria-labelledby={`sc-${s.id}`} className="grid gap-1">
          <h3 id={`sc-${s.id}`} className="pb-1.5 text-[11px] font-medium text-muted-foreground">
            {s.label}
          </h3>
          <dl className="grid">
            {s.rows.map((r) => (
              <div key={r.id} className="flex min-h-9 items-center justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0">
                <dt className="min-w-0 text-[13px] text-foreground">{r.label}</dt>
                <dd className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  {r.keys.map((step, i) => (
                    <Fragment key={step.join("+")}>
                      {i > 0 && <span>{t("shell.shortcuts.then")}</span>}
                      <KbdGroup keys={step} />
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/** The store frame mounts one, above Help and the palette (both open it). */
export function ShortcutSheetProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const locale = useAdminLocale();
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const api = useMemo(() => ({ open: show }), [show]);
  return (
    <ShortcutContext.Provider value={api}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={dirOf(locale) === "rtl" ? "left" : "right"} dir={dirOf(locale)} lang={locale} showCloseButton={false} className="w-full gap-0 sm:max-w-[440px]">
          <SheetCloseX />
          <SheetHeader className="gap-3 border-b border-border p-6 pe-14">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-[var(--r-control)] bg-muted text-muted-foreground">
              <KeyboardIcon className="size-5" />
            </span>
            <SheetTitle className="text-base font-semibold tracking-[-0.006em]">{t("shell.shortcuts.title")}</SheetTitle>
            <SheetDescription>{t("shell.shortcuts.lead")}</SheetDescription>
          </SheetHeader>
          {open && (
            <div className="adm-scroll min-h-0 flex-1 overflow-y-auto">
              <ShortcutBody />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ShortcutContext.Provider>
  );
}

export function useShortcutSheet(): ShortcutApi {
  return useContext(ShortcutContext);
}
