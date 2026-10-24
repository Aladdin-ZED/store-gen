"use client";
/**
 * The page builder: top bar, left rail + panels, live canvas, inspector. Owns the per-page store,
 * persistence (autosave/serial server calls), media picker and keyboard shortcuts.
 *
 *   <Builder boot={await loadBootstrap(scope, pageId, user)} />
 */
import "./builder.css";
import { MotionConfig } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useOpenedOnce, usePrefetchOnIdle } from "@/components/admin/lib/lazy";
import type { EditorBootstrap } from "@/lib/editor/types";
import { Canvas } from "./Canvas";
import { EditorProvider, useEditor } from "./context";
import { ConflictDialog, ShortcutsDialog } from "./dialogs";
import { EnvProvider, type BuilderEnv } from "./env";
import { Inspector } from "./Inspector";
import { LeftRail } from "./LeftRail";
import { MediaProvider } from "./media";
import { AddSectionDialog, BUILDER_PREFETCH } from "./on-demand";
import { PersistenceProvider } from "./persistence";
import { useBuilderShortcuts } from "./shortcuts";
import { TopBar } from "./topbar/TopBar";

/** Below this width the side panels float over the canvas instead of pushing it. */
const OVERLAY_BELOW = 1180;

export function Builder({ boot }: { boot: EditorBootstrap }) {
  const env = useMemo<BuilderEnv>(() => ({ store: boot.store, storeHealth: boot.storeHealth, user: boot.user, ai: boot.ai }), [boot]);
  return (
    <MotionConfig reducedMotion="user">
      <EditorProvider boot={boot}>
        <EnvProvider value={env}>
          <PersistenceProvider>
            <MediaProvider>
              <Shell notices={boot.notices} />
            </MediaProvider>
          </PersistenceProvider>
        </EnvProvider>
      </EditorProvider>
    </MotionConfig>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${OVERLAY_BELOW - 1}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

function Shell({ notices }: { notices: string[] }) {
  const canvasHost = useRef<HTMLDivElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const narrow = useNarrow();
  useBuilderShortcuts(canvasHost, () => setShortcutsOpen(true));
  // the section library mounts on first open; dialogs, drawer and remix are fetched once idle
  const libraryMounted = useOpenedOnce(useEditor((s) => s.libraryOpen));
  usePrefetchOnIdle(BUILDER_PREFETCH);

  // once per opened page (effects run twice in development)
  const shown = useRef<string[] | null>(null);
  useEffect(() => {
    if (shown.current === notices) return;
    shown.current = notices;
    for (const n of notices) toast.info(n, { duration: 8000 });
  }, [notices]);

  return (
    <div className="bld-root flex h-dvh min-h-[560px] flex-col overflow-hidden bg-background text-foreground">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <LeftRail overlay={narrow} />
        <Canvas hostRef={canvasHost} onShowShortcuts={() => setShortcutsOpen(true)} />
        <Inspector overlay={narrow} />
      </div>
      {libraryMounted ? <AddSectionDialog /> : null}
      <ConflictDialog />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
