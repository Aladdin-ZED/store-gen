"use client";
/**
 * The Design check panel (P6 DESIGN; design.md DES-§15.1, DES-§15.2, DES-§15.3; DG-06; core §I.8 screen 13).
 * A right-rail panel next to the inspector, opened from the top bar's "Design check" button (its badge counts the
 * blocking items, hidden at 0); its open state is P6 component state (./design/check-context.tsx), not a LeftTab.
 * Widths: 360 px at ≥ 1280, 320 px at 1024 (floating over the canvas below 1180), and a 70 % bottom sheet at 390
 * with the header pinned and 44 px Fix buttons.
 *
 * Rows come from the shared check (`useDesignCheck`): Fix applies the item's RepairOps as one undoable edit, Fix all
 * covers the blocking group only, the section chip selects the section (the canvas scrolls to it and outlines it),
 * honesty rows open the section's proof controls (P3's ProofAttestSheet mounts there at the P3 merge, CCR r1-p6-13).
 */
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { getSection } from "@/landing/registry";
import type { PanelItem } from "@/lib/design/panel";
import { needsDifferentiate } from "@/lib/design/panel";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { useEditor, useEditorStore } from "../context";
import { CheckView } from "../design/CheckView";
import { useDesignCheck } from "../design/check-context";
import { Differentiate } from "../design/Differentiate";
import { EASE } from "../ui";

/** Below this width the rail floats over the canvas; below 640 it is a bottom sheet. */
const OVERLAY_BELOW = 1180;
const SHEET_BELOW = 640;

function useWidth(): number {
  const [w, setW] = useState(1440);
  useEffect(() => {
    const update = () => setW(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return w;
}

export function DesignCheckRail() {
  const t = useT();
  const check = useDesignCheck();
  const width = useWidth();
  const open = !!check?.open;
  const sheet = width < SHEET_BELOW;
  const overlay = width < OVERLAY_BELOW;
  const panelW = width >= 1280 ? 360 : 320;

  // Escape closes the rail (the editor's own shortcuts ignore Escape inside panels)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) check?.setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, check]);

  if (!check) return null;
  return (
    <AnimatePresence initial={false}>
      {open ? (
        sheet ? (
          <motion.aside
            key="design-sheet"
            aria-label={t("design.check.title")}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: EASE }}
            className="bld-panel fixed inset-x-0 bottom-0 z-40 h-[70dvh] overflow-hidden rounded-t-2xl border-t border-[var(--bld-hairline)] shadow-[0_-16px_48px_-24px_rgb(0_0_0/0.4)]"
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-foreground/15" aria-hidden="true" />
            <DesignCheckPanel touch />
          </motion.aside>
        ) : (
          <motion.aside
            key="design-rail"
            aria-label={t("design.check.title")}
            initial={overlay ? { opacity: 0, x: 16 } : { width: 0, opacity: 0 }}
            animate={overlay ? { opacity: 1, x: 0 } : { width: panelW, opacity: 1 }}
            exit={overlay ? { opacity: 0, x: 16 } : { width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className={cn("bld-panel z-30 shrink-0 overflow-hidden border-s border-[var(--bld-hairline)]", overlay ? "absolute inset-y-0 end-0 shadow-[-12px_0_40px_-20px_rgb(0_0_0/0.35)]" : "relative h-full")}
            style={overlay ? { width: panelW } : undefined}
          >
            <div className="h-full" style={{ width: panelW }}>
              <DesignCheckPanel />
            </div>
          </motion.aside>
        )
      ) : null}
    </AnimatePresence>
  );
}

/** The panel body: the shared check's rows with the builder's actions. */
export function DesignCheckPanel({ touch }: { touch?: boolean }) {
  const t = useT();
  const locale = useAdminLocale();
  const check = useDesignCheck();
  const store = useEditorStore();
  const sections = useEditor((s) => s.doc.sections);
  const want = check?.wantNovelty;
  useEffect(() => (want ? want() : undefined), [want]);
  if (!check) return null;

  const select = (id: string) => {
    const s = store.getState();
    s.setInteractive(false);
    s.select(id);
    if (touch) check.setOpen(false);
  };
  const goto = (item: PanelItem) => {
    const s = store.getState();
    const g = item.goto;
    if (item.section) return select(item.section);
    if (g?.sectionId) return select(g.sectionId);
    if (g?.tab) {
      s.select(null);
      s.setLeftTab(g.tab);
      return;
    }
    if (g?.href) window.open(g.href, "_blank", "noopener,noreferrer");
  };
  const word = (id: string) => {
    const sec = sections.find((x) => x.id === id);
    if (!sec) return null;
    const def = getSection(sec.type);
    return def ? (locale === "fr" ? def.labelFr : def.label) : sec.type;
  };
  const bands = check.novelty.bands;
  const showDiff = !!bands && needsDifferentiate(bands);
  return (
    <CheckView
      status={check.status}
      skeleton={check.skeleton}
      model={check.model}
      novelty={check.novelty}
      sectionWord={word}
      onFix={(item) => item.fix && check.fix(item.fix)}
      onFixAll={check.fixAll}
      onIgnore={(item) => check.ignore(item.key)}
      onSection={select}
      onGoto={goto}
      ignoredCount={check.ignoredCount}
      onRestoreIgnored={check.restoreIgnored}
      differentiate={showDiff && bands ? <Differentiate bands={bands} touch={touch} /> : null}
      touch={touch}
      headerEnd={
        <button
          type="button"
          onClick={() => check.setOpen(false)}
          aria-label={t("design.check.close")}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      }
    />
  );
}
