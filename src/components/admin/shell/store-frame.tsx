"use client";
/**
 * The chrome of a store's dashboard (P2 SHELL; docs/STORE-SAAS.md §I.1, §I.4; platform.md PLA-§10.2, §22.3-§22.9,
 * §22.15, §20.1, §23.1): the impersonation ribbon on top (full width, `--ribbon-h`), the inset sidebar with the store
 * switcher, the frosted topbar with ⌘K, the job chip, Help and the bell, the lifecycle banner, then the screen (or the
 * state page that replaces it: closed, scheduled deletion, rejected). Around them: the store's pulse, the density,
 * the limit sheet, the Help sheet and, when a document asks for it, the blocking legal sheet.
 *
 * The full-screen builder, `(editor)`, gets the bare page, and so does the onboarding flow (`welcome`): one `[store]`
 * layout guards them all, so the frame picks by the active child segment, which names route groups too. The welcome
 * flow keeps the pulse, the sheets and the ribbon; the builder keeps its own chrome.
 *
 * The chrome follows the viewer's language (the layout's `LocaleRoot`); the screen inside it renders in the language
 * its route supports (`screenLocalesFor`, ./store-nav.ts), else English left to right (§I.5, D36).
 */
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { StorePulse } from "@/lib/pulse/types";
import { cn } from "@/lib/utils";
import { ScreenLocale } from "../common/screen-locale";
import { ViewerFlagsProvider } from "../common/viewer-flags";
import { AppSidebar, type ShellUser } from "./app-sidebar";
import { CommandPaletteProvider, type PaletteIndex } from "./command-palette";
import { DensityProvider } from "./density";
import { HelpSheetProvider, type HelpContact } from "./help-sheet";
import { ImpersonationRibbon, RIBBON_HEIGHT_PX, type RibbonProps } from "./impersonation-ribbon";
import { LegalSheet, type LegalSheetDoc } from "./legal-sheet";
import { LimitSheetProvider } from "./limit-sheet";
import { StatePage, type StatePageProps } from "./state-page";
import { StoreBanner, type BannerFacts, type BannerFirstPaint } from "./store-banner";
import { useStore } from "./store-context";
import { screenLocalesFor, storeRelativePath } from "./store-nav";
import type { SwitcherProps } from "./store-switcher";
import { NarrowJobs, Topbar } from "./topbar";
import { PulseProvider } from "./use-pulse";

export const EDITOR_SEGMENT = "(editor)";
export const WELCOME_SEGMENT = "welcome";
const ENGLISH = ["en"] as const;

export interface StoreFrameProps {
  user: ShellUser;
  switcher: SwitcherProps;
  /** the first paint's pulse (the same read as the route), so nothing waits for the first poll */
  pulse: { body: StorePulse; etag: string } | null;
  /** "view as store": the ribbon's facts; null for everyone else */
  ribbon: RibbonProps | null;
  banner: { firstPaint: BannerFirstPaint; facts: Promise<BannerFacts | null> };
  /** a state that replaces the screens (closed for non-admins, scheduled deletion, rejected) */
  statePage: StatePageProps | null;
  /** documents to accept again (never during "view as store") */
  legal: Promise<LegalSheetDoc[] | null> | null;
  help: HelpContact;
  paletteIndex: Promise<PaletteIndex | null>;
  sidebarOpen: boolean;
  children: ReactNode;
}

function Sheets({ p, children }: { p: StoreFrameProps; children: ReactNode }) {
  const store = useStore();
  return (
    <ViewerFlagsProvider value={{ impersonating: p.ribbon !== null }}>
      <PulseProvider initial={p.pulse}>
        <DensityProvider role={store.role} viewerId={store.viewerId}>
          <div data-surface="tenant" className="contents" style={{ "--ribbon-h": p.ribbon ? `${RIBBON_HEIGHT_PX}px` : "0px" } as CSSProperties}>
            <LimitSheetProvider>
              <HelpSheetProvider contact={p.help}>
                {p.ribbon && <ImpersonationRibbon {...p.ribbon} />}
                {children}
                {!p.ribbon && <LegalSheet docs={p.legal} />}
              </HelpSheetProvider>
            </LimitSheetProvider>
          </div>
        </DensityProvider>
      </PulseProvider>
    </ViewerFlagsProvider>
  );
}

export function StoreFrame(p: StoreFrameProps) {
  const segments = useSelectedLayoutSegments();
  const pathname = usePathname();
  const store = useStore();
  // the builder is English in R1 (design.md); it has no chrome of its own here
  if (segments[0] === EDITOR_SEGMENT) return <ScreenLocale supported={ENGLISH}>{p.children}</ScreenLocale>;
  const supported = screenLocalesFor(storeRelativePath(pathname, store.href()) ?? "");
  const screen = <ScreenLocale supported={supported}>{p.statePage ? <StatePage {...p.statePage} /> : p.children}</ScreenLocale>;
  if (segments[0] === WELCOME_SEGMENT) return <Sheets p={p}>{screen}</Sheets>;
  return (
    <Sheets p={p}>
      <CommandPaletteProvider index={p.paletteIndex}>
        <SidebarProvider defaultOpen={p.sidebarOpen} className={cn("bg-sidebar", p.ribbon && "min-h-[calc(100svh-var(--ribbon-h))]")}>
          <AppSidebar user={p.user} switcher={p.switcher} className={p.ribbon ? "top-(--ribbon-h) h-[calc(100svh-var(--ribbon-h))]" : undefined} />
          <SidebarInset
            className={cn(
              "min-w-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-[0_0_0_1px_var(--sidebar-border),0_1px_2px_rgb(0_0_0/0.03),0_24px_48px_-32px_rgb(0_0_0/0.18)]",
              // the inset's gap belongs on the side away from the sidebar: ui/sidebar.tsx writes it for a left sidebar
              "rtl:md:peer-data-[variant=inset]:mr-0! rtl:md:peer-data-[variant=inset]:ml-2! rtl:md:peer-data-[variant=inset]:peer-data-[state=collapsed]:mr-2!",
            )}
          >
            <Topbar switcher={p.switcher} />
            <NarrowJobs />
            <StoreBanner firstPaint={p.banner.firstPaint} facts={p.banner.facts} supportWhatsapp={p.help.whatsapp} />
            <div className="flex min-w-0 flex-1 flex-col">{screen}</div>
          </SidebarInset>
        </SidebarProvider>
      </CommandPaletteProvider>
    </Sheets>
  );
}
