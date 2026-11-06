"use client";
/**
 * A confirm dialog of the integrations screens in the viewer's language (the shared ConfirmDialog's Cancel is English
 * only): an icon, a title, one plain sentence, Cancel and the action. The dialog stays open while the action runs and
 * closes only when it answered true.
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
import { useT } from "@/lib/i18n/admin/client";
import { cn } from "@/lib/utils";

export function IntConfirm({
  open,
  onOpenChange,
  icon,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<boolean>;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);
  async function confirm() {
    setPending(true);
    try {
      if (await onConfirm()) onOpenChange(false);
    } finally {
      setPending(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent className="gap-5 rounded-2xl p-6 duration-200 data-[size=default]:sm:max-w-md">
        <AlertDialogHeader className="gap-2">
          <AlertDialogMedia className={cn("size-11 rounded-xl", destructive ? "bg-destructive/10 text-destructive" : "bg-foreground/[0.06] text-foreground/80")}>{icon}</AlertDialogMedia>
          <AlertDialogTitle className="text-[1.05rem] font-semibold tracking-[-0.01em]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed text-pretty">{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="-mx-6 -mb-6 rounded-b-2xl px-6 py-4">
          <AlertDialogCancel disabled={pending} className="h-11 sm:h-8">
            {t("int.sheets.cancel")}
          </AlertDialogCancel>
          <Button
            disabled={pending}
            className={cn("h-11 sm:h-8", destructive && "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive dark:hover:bg-destructive/85")}
            onClick={confirm}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
