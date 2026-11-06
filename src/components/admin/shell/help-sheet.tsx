"use client";
/**
 * The Help sheet (P2 SHELL; platform.md PLA-§20.1, PD22): the topbar's **Help** (and ⌘K "Help") opens it.
 *
 * - two tips for the screen on screen (catalog keys `shell.help.tip.<section>.<n>`, no external docs yet);
 * - **Message Store Gen on WhatsApp** with `shell.help.wa_prefill` ("store @{handle}, screen {path}, version {build}"),
 *   and the support hours as the platform typed them; with no support number set, "Support contact isn't set up yet";
 * - **Copy diagnostic info**: the store, the screen's path (no query string), the build, the device label and the last
 *   five client error codes (`./client-errors.ts`). Never customer data, never a token.
 *
 *   const help = useHelpSheet();   help.open();
 */
import { ClipboardCopyIcon, KeyboardIcon, LifeBuoyIcon, MessageCircleIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { dirOf, messageOf } from "@/lib/i18n/admin";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { writeClipboard } from "../common/copy-button";
import { waHref } from "../common/primitive-logic";
import { SheetCloseX } from "../common/sheet-close";
import { FOCUS_RING, TOUCH } from "../common/ui-classes";
import { helpSection, helpTipKeys } from "./chrome-logic";
import { diagnosticPath, diagnosticText, recentClientErrors } from "./client-errors";
import { useStore } from "./store-context";
import { useShortcutSheet } from "./shortcut-sheet";
import { activeNav, storeNav } from "./store-nav";
import { usePulse } from "./use-pulse";

export interface HelpContact {
  /** `platform.brand.supportWhatsapp` (E.164) or null */
  whatsapp: string | null;
  /** `platform.brand.supportHours`, shown as typed */
  hours: string | null;
  /** the device label (`describeUserAgent`, server side) */
  device: string;
}

interface HelpApi {
  open(): void;
}

const HelpContext = createContext<HelpApi>({ open: () => {} });

function HelpBody({ contact, onShortcuts }: { contact: HelpContact; onShortcuts?: () => void }) {
  const t = useT();
  const locale = useAdminLocale();
  const store = useStore();
  const pathname = usePathname();
  const pulse = usePulse();
  const nav = useMemo(() => storeNav({ handle: store.handle, mode: store.mode, can: store.can }, locale), [store, locale]);
  const item = activeNav(pathname, nav, store.handle);
  // every settings tab shares the settings tips
  const section = helpSection(item?.group === "settings" ? "settings" : item?.id);
  const tips = helpTipKeys(section).filter((k) => messageOf(k) !== undefined);
  const build = pulse.body?.build ?? null;
  const path = diagnosticPath(pathname.replace(store.href(), "") || "/");
  const prefill = t("shell.help.wa_prefill", { handle: store.handle, path, build: build ?? "-" });

  const copy = async () => {
    const text = diagnosticText({ handle: store.handle, path: pathname, build, ua: contact.device, errors: recentClientErrors(), locale });
    if (await writeClipboard(text)) toast.success(t("shell.help.copied"));
    else toast.error(t("shell.err.copy_failed"));
  };

  return (
    <div className="grid gap-6 p-6">
      <section aria-labelledby="help-tips" className="grid gap-2.5">
        <h3 id="help-tips" className="text-[11px] font-medium text-muted-foreground">
          {t("shell.help.tips")}
        </h3>
        <ul className="grid gap-2">
          {tips.map((k) => (
            <li key={k} className="rounded-[var(--r-control)] bg-muted/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-pretty">
              {t(k)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="help-contact" className="grid gap-2.5">
        <h3 id="help-contact" className="text-[11px] font-medium text-muted-foreground">
          {t("shell.help.contact")}
        </h3>
        {contact.whatsapp ? (
          <>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{t("shell.help.lead")}</p>
            <a
              href={waHref(prefill, contact.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "brand" }), "justify-self-start gap-2", FOCUS_RING, TOUCH)}
            >
              <MessageCircleIcon aria-hidden="true" />
              {t("shell.help.whatsapp")}
            </a>
            {contact.hours && <p className="text-xs text-muted-foreground">{t("shell.help.hours", { hours: contact.hours })}</p>}
          </>
        ) : (
          <p className="rounded-[var(--r-control)] bg-muted/60 px-3.5 py-2.5 text-[13px] text-muted-foreground">{t("shell.help.no_contact")}</p>
        )}
      </section>

      <section aria-labelledby="help-diag" className="grid gap-2.5">
        <h3 id="help-diag" className="text-[11px] font-medium text-muted-foreground">
          {t("shell.help.diagnostic")}
        </h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("shell.help.diag_note")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy()} className={cn(buttonVariants({ variant: "outline" }), "gap-2", FOCUS_RING, TOUCH)}>
            <ClipboardCopyIcon aria-hidden="true" />
            {t("shell.help.copy_diag")}
          </button>
          {onShortcuts && (
            <button type="button" onClick={onShortcuts} className={cn(buttonVariants({ variant: "ghost" }), "gap-2 max-md:hidden", FOCUS_RING)}>
              <KeyboardIcon aria-hidden="true" />
              {t("shell.help.shortcuts")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/** The `[store]` frame mounts one; `useHelpSheet().open()` from the topbar, the account menu or ⌘K. */
export function HelpSheetProvider({ contact, children }: { contact: HelpContact; children: ReactNode }) {
  const t = useT();
  const locale = useAdminLocale();
  const shortcuts = useShortcutSheet();
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const toShortcuts = useCallback(() => {
    setOpen(false);
    shortcuts.open();
  }, [shortcuts]);
  const api = useMemo(() => ({ open: show }), [show]);
  return (
    <HelpContext.Provider value={api}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={dirOf(locale) === "rtl" ? "left" : "right"} dir={dirOf(locale)} lang={locale} showCloseButton={false} className="w-full gap-0 sm:max-w-[440px]">
          <SheetCloseX />
          <SheetHeader className="gap-3 border-b border-border p-6 pe-14">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-[var(--r-control)] bg-muted text-muted-foreground">
              <LifeBuoyIcon className="size-5" />
            </span>
            <SheetTitle className="text-base font-semibold tracking-[-0.006em]">{t("shell.help.title")}</SheetTitle>
            <SheetDescription>{t("shell.help.sheet_lead")}</SheetDescription>
          </SheetHeader>
          {open && (
            <div className="adm-scroll min-h-0 flex-1 overflow-y-auto">
              <HelpBody contact={contact} onShortcuts={toShortcuts} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </HelpContext.Provider>
  );
}

export function useHelpSheet(): HelpApi {
  return useContext(HelpContext);
}
