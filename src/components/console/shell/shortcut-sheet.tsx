"use client";
/**
 * The `?` sheet (platform.md PLA-§4.3, §4.7 rule 2): every shortcut of the console, the `G <key>` chords of the pages
 * this staff member may open included, as key caps (no "·" strings, DES-§16.10).
 */
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";
import { consoleChords } from "../nav";
import { useConsoleShell } from "./context";
import styles from "./console.module.css";

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[var(--r-chip)] border border-border bg-background px-1.5 font-mono text-[11px] leading-none text-foreground/80 shadow-[0_1px_0_var(--border)]">{children}</kbd>;
}

function Line({ label, keys }: { label: string; keys: ReactNode }) {
  return (
    <li className="flex min-h-[var(--row)] items-center justify-between gap-4 border-b border-[var(--c-hairline)] py-1.5 last:border-b-0">
      <span className="min-w-0 truncate">{label}</span>
      <span className="flex shrink-0 items-center gap-1">{keys}</span>
    </li>
  );
}

export function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const shell = useConsoleShell();
  const chords = consoleChords(shell.nav);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[oklch(0.2_0.01_230/0.32)]" />
        <DialogPrimitive.Content
          className={cn(
            styles.palette,
            "fixed inset-x-0 bottom-0 z-50 mx-auto grid max-h-[85dvh] w-full gap-4 overflow-y-auto rounded-t-[var(--r-sheet)] bg-popover p-5 text-[13px] text-popover-foreground outline-none ring-1 ring-[var(--c-hairline)] md:top-[12vh] md:bottom-auto md:w-[min(560px,92vw)] md:rounded-[var(--r-sheet)] md:shadow-[0_24px_64px_-24px_oklch(0.2_0.01_230/0.35)]",
          )}
        >
          <div className="grid gap-1">
            <DialogPrimitive.Title className="text-[16px] font-semibold tracking-[-0.006em]">{t("console.keys.title")}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-muted-foreground">{t("console.keys.description")}</DialogPrimitive.Description>
          </div>
          <section className="grid gap-1">
            <h3 className="text-[11px] font-medium text-muted-foreground">{t("console.keys.group.general")}</h3>
            <ul>
              <Line
                label={t("console.keys.palette")}
                keys={
                  <>
                    <Kbd>⌘</Kbd>
                    <Kbd>K</Kbd>
                  </>
                }
              />
              <Line label={t("console.keys.search")} keys={<Kbd>/</Kbd>} />
              <Line label={t("console.keys.help")} keys={<Kbd>?</Kbd>} />
            </ul>
          </section>
          {chords.length > 0 && (
            <section className="grid gap-1">
              <h3 className="text-[11px] font-medium text-muted-foreground">{t("console.keys.group.go")}</h3>
              <ul>
                {chords.map(({ key, item }) => (
                  <Line
                    key={item.id}
                    label={t(item.label)}
                    keys={
                      <>
                        <Kbd>G</Kbd>
                        <span className="px-0.5 text-[11px] text-muted-foreground">{t("console.keys.then")}</span>
                        <Kbd>{key.toUpperCase()}</Kbd>
                      </>
                    }
                  />
                ))}
              </ul>
            </section>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
