"use client";
/**
 * The console ⌘K dialog (platform.md PLA-§4.4, design.md DES-§16.10): the frame and the code split. The body (cmdk,
 * the search, the actions) is its own chunk, fetched once the screen is idle so the palette opens without a network
 * wait (≤ 50 ms warm, measured in step 13), like src/components/admin/shell/command-palette.tsx.
 *
 *   <ConsolePalette open={open} mode={mode} onOpenChange={setOpen} onMode={setMode} />
 *
 * 640 px wide, 12 vh from the top, a backdrop without blur (the topbar keeps the one glass surface); below 768 px a
 * full-height sheet with the input pinned at the bottom, in thumb reach.
 */
import dynamic from "next/dynamic";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { usePrefetchOnIdle } from "@/components/admin/lib/lazy";
import styles from "../shell/console.module.css";

const loadBody = () => import("./console-palette-body");
const PREFETCH = [loadBody];
const Body = dynamic(() => loadBody().then((m) => m.ConsolePaletteBody), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="h-12 border-b border-[var(--c-hairline)]" />,
});

export function ConsolePalette({ open, mode, onOpenChange, onMode }: { open: boolean; mode: "default" | "view_as"; onOpenChange(open: boolean): void; onMode(m: "default" | "view_as"): void }) {
  const t = useT();
  usePrefetchOnIdle(PREFETCH);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_230/0.32)]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            styles.palette,
            "fixed z-50 flex flex-col overflow-hidden bg-popover text-popover-foreground outline-none",
            "inset-0 md:inset-x-0 md:top-[12vh] md:bottom-auto md:mx-auto md:max-h-[76vh] md:w-[min(640px,92vw)] md:rounded-[var(--r-sheet)] md:shadow-[0_8px_24px_-8px_oklch(0.2_0.01_230/0.18),0_24px_64px_-24px_oklch(0.2_0.01_230/0.35)] md:ring-1 md:ring-[var(--c-hairline)]",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{t("console.cmdk.title")}</DialogPrimitive.Title>
          <div className="flex shrink-0 justify-end p-1 md:hidden">
            <DialogPrimitive.Close className="inline-flex h-11 min-w-11 px-3 items-center justify-center rounded-[var(--r-control)] text-[13px] text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {t("console.cmdk.key.close")}
            </DialogPrimitive.Close>
          </div>
          {open && <Body mode={mode} onMode={onMode} close={() => onOpenChange(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
