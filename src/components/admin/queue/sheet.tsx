"use client";
/**
 * The console's one sheet (P4 CALL CENTER; OPE-§13.1 pickers, §13.2c, core §I.8 rule 6): a bottom sheet on phones, a
 * centred panel from 640 px. A Radix dialog (`role="dialog"`, `data-state="open"`), so the console's keys stand down
 * while it is open (`overlayOpen`) and Esc closes it. Never frosted (the shell owns the screen's one glass, core §I.6).
 * It carries `.q-root` with the console's `lang` / `dir`, because a portal leaves the console's subtree.
 */
import { XIcon } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { useAdminLocale, useT } from "@/lib/i18n/admin/client";
import { dirOf } from "@/lib/i18n/admin";
import { cn } from "@/lib/utils";

export function QSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  onKeyDown,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const t = useT();
  const locale = useAdminLocale();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="q-fade fixed inset-0 z-50 bg-black/35 dark:bg-black/55" />
        <D.Content
          lang={locale}
          dir={dirOf(locale)}
          onKeyDown={onKeyDown}
          className={cn(
            "q-root q-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[22px] border border-border bg-popover text-popover-foreground shadow-[0_-12px_40px_-16px_rgb(0_0_0/0.25)] outline-none",
            "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(30rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px]",
            className,
          )}
        >
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-foreground/15 sm:hidden" />
          <div className="flex items-start gap-3 px-5 pt-3 pb-2 sm:pt-5">
            <div className="min-w-0 flex-1">
              <D.Title className="q-md font-semibold">{title}</D.Title>
              {description ? <D.Description className="q-sm mt-1 text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="-me-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <XIcon className="size-4" aria-hidden="true" />
              <span className="sr-only">{t("ops.close")}</span>
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
