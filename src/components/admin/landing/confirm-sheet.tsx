"use client";
/**
 * The landing screens' confirmation (P3 LANDING; docs/STORE-SAAS.md §I.8, LAN-§24.1 "every destructive action has an
 * undo toast or a confirm sheet"): the common ConfirmDialog's look with every label in the viewer's language. The sheet
 * stays open and refuses dismissal while `onConfirm` runs; it closes when the promise resolves to anything but `false`.
 */
import { Loader2Icon } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel?: string;
  destructive?: boolean;
  icon?: ReactNode;
  /** a refusal shown under the description (the action's message), kept until the next try */
  error?: string | null;
  children?: ReactNode;
  /** disables the confirm button (a choice is still missing) */
  disabled?: boolean;
  onConfirm: () => Promise<boolean | void> | boolean | void;
}

export function ConfirmSheet(p: ConfirmSheetProps) {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={p.open} onOpenChange={(next) => !pending && p.onOpenChange(next)}>
      <AlertDialogContent className="gap-5 rounded-2xl p-6 duration-200 data-[size=default]:sm:max-w-md">
        <AlertDialogHeader className="gap-2">
          {p.icon && <AlertDialogMedia className={cn("size-11 rounded-xl", p.destructive ? "bg-destructive/10 text-destructive" : "bg-brand/10 text-brand")}>{p.icon}</AlertDialogMedia>}
          <AlertDialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em] text-balance">{p.title}</AlertDialogTitle>
          {p.description && <AlertDialogDescription className="leading-relaxed text-pretty">{p.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {p.children}
        {p.error && (
          <p role="alert" className="-mt-1 rounded-xl bg-destructive/[0.07] px-3 py-2 text-sm text-destructive ring-1 ring-destructive/15 ring-inset">
            {p.error}
          </p>
        )}
        <AlertDialogFooter className="-mx-6 -mb-6 rounded-b-2xl px-6 py-4">
          <AlertDialogCancel disabled={pending}>{p.cancelLabel}</AlertDialogCancel>
          <Button
            variant={p.destructive ? "destructive" : "default"}
            disabled={pending || p.disabled}
            className={cn(p.destructive && "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/85")}
            onClick={async () => {
              setPending(true);
              try {
                const result = await p.onConfirm();
                if (result !== false) p.onOpenChange(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {pending ? (p.pendingLabel ?? p.confirmLabel) : p.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
