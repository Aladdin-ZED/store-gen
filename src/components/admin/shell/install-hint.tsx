"use client";
/**
 * "Install the app" (P2 SHELL; platform.md PLA-§23.1, UX-07): from the viewer's 3rd visit, the account menu offers to
 * install the dashboard (the `/app` manifest, no service worker in R1). Chromium shows its own prompt when it offered
 * one (`beforeinstallprompt`); iPhone and iPad get a sheet ("Tap Share, then Add to Home Screen"); other browsers and
 * an installed app see nothing. Never on the first visit, never a modal: the item sits in the menu until used.
 *
 * The visit counter is a per-viewer convenience in localStorage (one count per browser session, every access wrapped).
 */
import { ShareIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/admin/client";
import { SheetCloseX } from "../common/sheet-close";
import { countVisit, installOffer } from "./chrome-logic";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallHint {
  offer: "native" | "ios" | null;
  install(): void;
  iosOpen: boolean;
  setIosOpen(open: boolean): void;
}

export function useInstallHint(): InstallHint {
  const [visits, setVisits] = useState(0);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [env, setEnv] = useState({ standalone: true, ios: false });
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // read once after mount (the server render offers nothing)
    const timer = setTimeout(() => {
      const nav = navigator as Navigator & { standalone?: boolean };
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
      const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
      setEnv({ standalone, ios });
      setVisits(countVisit(() => localStorage, () => sessionStorage));
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const offer = installOffer({ visits, standalone: env.standalone, native: prompt !== null, ios: env.ios });
  const install = useCallback(() => {
    if (prompt) {
      void prompt.prompt().catch(() => undefined);
      void prompt.userChoice.then(() => setPrompt(null)).catch(() => undefined);
    } else if (offer === "ios") {
      setIosOpen(true);
    }
  }, [prompt, offer]);
  return { offer, install, iosOpen, setIosOpen };
}

/** The iPhone / iPad instructions (a bottom sheet, dismissible). */
export function IosInstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-[var(--r-sheet)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SheetCloseX />
        <SheetHeader className="gap-3 p-6 pe-14">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-[var(--r-control)] bg-muted text-muted-foreground">
            <ShareIcon className="size-5" />
          </span>
          <SheetTitle className="text-base font-semibold">{t("shell.install.cta")}</SheetTitle>
          <SheetDescription className="text-[15px] leading-relaxed">{t("shell.install.ios")}</SheetDescription>
        </SheetHeader>
        <p className="px-6 text-sm text-muted-foreground">{t("shell.install.lead")}</p>
      </SheetContent>
    </Sheet>
  );
}
