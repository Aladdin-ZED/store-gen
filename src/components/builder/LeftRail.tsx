"use client";
/**
 * Left side: a slim icon rail (Add, Sections, Theme, Product, Offers, Form, SEO & tracking) and the
 * active panel. On narrow screens the panel floats over the canvas instead of pushing it.
 */
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { BadgePercent, ClipboardList, Layers, Package, Palette, Plus, Search, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { tabsFor, type LeftTab } from "@/lib/editor/store";
import { cn } from "@/lib/utils";
import { useEditor, useEditorApi } from "./context";
// Sections is where the builder opens; the other panels are code-split (prefetched once idle)
import { FormPanel, OffersPanel, ProductPanel, SeoPanel, ThemePanel } from "./on-demand";
import { SectionsPanel } from "./panels/SectionsPanel";
import { EASE, SPRING } from "./ui";

const TABS: { id: LeftTab; label: string; icon: LucideIcon }[] = [
  { id: "sections", label: "Sections", icon: Layers },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "product", label: "Product", icon: Package },
  { id: "offers", label: "Offers", icon: BadgePercent },
  { id: "form", label: "Order form", icon: ClipboardList },
  { id: "seo", label: "SEO & tracking", icon: Search },
];

const PANELS: Record<LeftTab, React.ComponentType> = {
  sections: SectionsPanel,
  theme: ThemePanel,
  product: ProductPanel,
  offers: OffersPanel,
  form: FormPanel,
  seo: SeoPanel,
};

export const LEFT_PANEL_WIDTH = 324;

export function LeftRail({ overlay }: { overlay: boolean }) {
  const api = useEditorApi();
  const kind = useEditor((s) => s.page.kind);
  const tabs = useMemo(() => TABS.filter((t) => tabsFor(kind).includes(t.id)), [kind]);
  const chosen = useEditor((s) => s.leftTab);
  // a tab the page's kind has no panel for (a fix link, a stale choice) opens Sections
  const tab = tabs.some((t) => t.id === chosen) ? chosen : "sections";
  const open = useEditor((s) => s.leftOpen);
  const Panel = PANELS[tab];

  return (
    <div className="relative z-20 flex h-full shrink-0">
      <nav aria-label="Builder panels" className="bld-panel flex w-14 shrink-0 flex-col items-center gap-1 border-e border-[var(--bld-hairline)] py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => api.setLibraryOpen(true)}
              aria-label="Add a section"
              className="bld-press mb-2 grid size-9 place-items-center rounded-xl bg-foreground text-background shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_6px_14px_-8px_rgb(20_22_34/0.55)] outline-none hover:bg-foreground/88 focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Plus className="size-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Add a section
          </TooltipContent>
        </Tooltip>
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = open && tab === id;
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => (active ? api.setLeftOpen(false) : api.setLeftTab(id))}
                  className={cn(
                    "relative grid size-9 place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                    active ? "text-foreground" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  {active ? <motion.span layoutId="bld-rail-active" transition={SPRING} className="absolute inset-0 rounded-xl bg-foreground/[0.07] ring-1 ring-inset ring-foreground/[0.06]" /> : null}
                  <Icon className="relative size-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.aside
            key="panel"
            aria-label={TABS.find((t) => t.id === tab)?.label}
            initial={overlay ? { opacity: 0, x: -16 } : { width: 0, opacity: 0 }}
            animate={overlay ? { opacity: 1, x: 0 } : { width: LEFT_PANEL_WIDTH, opacity: 1 }}
            exit={overlay ? { opacity: 0, x: -16 } : { width: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className={cn(
              "bld-panel overflow-hidden border-e border-[var(--bld-hairline)]",
              overlay ? "absolute inset-y-0 start-14 w-[324px] shadow-[12px_0_40px_-20px_rgb(0_0_0/0.35)]" : "h-full",
            )}
          >
            <div className="h-full w-[324px]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="h-full"
                >
                  <Panel />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
